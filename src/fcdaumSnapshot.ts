// FC다움 일일 스냅샷 — "전사 하루 1회 호출" 보장 계층
//
// 배경: FC다움 측에서 API 호출량 과다로 "하루 1회만 호출" 요청.
// 기존엔 홈 위젯·가맹관리가 화면을 열 때마다 운영매장 1개당 1콜씩 QSC를 전수 조회
// (사용자·마운트마다 수십~수백 콜)했다. 이를 Firestore 공유 스냅샷으로 묶어
// 하루 최대 1회만 FC다움을 호출하고, 나머지는 전부 스냅샷을 읽게 한다.
//
// 핵심: 원자적 일일 claim. 스냅샷이 오늘자가 아니면 트랜잭션으로 단 한 명만
// 'building'을 선점해 스윕하고, 나머지는 ready를 기다리거나 직전 스냅샷을 읽는다.
// 이렇게 해야 아침 동시 접속·탭 이탈 시 중복 스윕(=고치려던 과잉 호출)이 안 생긴다.
//
// 경계(의도된 설계):
//   - 자동 전수 스윕(목록/위젯용 QSC) → 하루 1회 스냅샷.   ← 이 모듈
//   - 매장 상세 QSC → 스냅샷에서 필터로 서빙(무호출).
//   - 헬프데스크·운영정보 → 사람이 탭 클릭할 때만 라이브 조회(사람 수만큼이라 소량) 유지.

import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { salesDb } from './firebase';
import {
  fetchAllStores, fetchQscReportsAll,
  type FcdaumStore, type FcdaumQscReport,
} from './fcdaum';

const SNAP_REF = doc(salesDb, 'fcdaum_cache', 'daily');
// 'building'이 이 시간 넘게 묵으면 스윕하던 클라이언트가 이탈했다고 보고 재선점 허용
const BUILD_TIMEOUT = 5 * 60 * 1000;
// ready 대기 폴링 (다른 클라이언트가 스윕 중일 때).
// 총 대기시간을 콜드 전수 스윕 소요(매장 ~84개 / 동시성 8 → 수십 초)보다 넉넉히 잡아,
// 최초 실행 동시접속 시 패자가 성급히 타임아웃→중복 스윕하는 일을 줄인다.
const POLL_INTERVAL = 1500;
const POLL_MAX = 20; // 최대 ~30초

// 스윕 로직 버전 — 이 값이 바뀌면 오늘자 스냅샷이라도 무효로 보고 재스윕한다.
// (예: 전역 조회 병합 추가처럼 데이터 수집 방식이 바뀔 때 즉시 반영)
const SNAP_VERSION = 5; // QSC를 storeIds 없이 브랜드 1회(fetchQscReportsAll)로 전환 — 강제 재스윕

export interface DailyStoreData {
  dateKey: string;
  stores: FcdaumStore[];
  qscReports: FcdaumQscReport[];
  failedStoreIds: string[];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Firestore doc 1MB 한도 대비 — 스냅샷 크기를 설계로 보장한다(초과 시 write 실패→재스윕
// 무한루프 회귀 위험).
//   ① stores: storeUsers(가변·대용량) 완전 제거. 스냅샷 소비처(홈 위젯·가맹관리 목록/상세)는
//      storeUsers를 전혀 쓰지 않는다. (전체 storeUsers가 필요한 임포트/상세패널은
//      fetchAllStores를 직접 호출하므로 무관)
function slimStore(s: FcdaumStore): FcdaumStore {
  return { ...s, storeUsers: [] };
}

//   ② QSC: 매장(storeNo)별 최신 N건만 보관. 목록(buildStoreItems)은 최신 1건만,
//      상세는 최근 이력만 있으면 충분 — 점검 리포트는 천천히 쌓이므로 20건이면 넉넉하다.
const QSC_KEEP_PER_STORE = 20;
function capQscPerStore(reports: FcdaumQscReport[]): FcdaumQscReport[] {
  const byStore = new Map<number, FcdaumQscReport[]>();
  for (const r of reports) {
    const arr = byStore.get(r.storeNo) ?? [];
    arr.push(r);
    byStore.set(r.storeNo, arr);
  }
  const out: FcdaumQscReport[] = [];
  for (const arr of byStore.values()) {
    arr.sort((a, b) => b.visitDate - a.visitDate);
    out.push(...arr.slice(0, QSC_KEEP_PER_STORE));
  }
  return out;
}

interface SnapshotDoc {
  dateKey?: string;
  status?: 'building' | 'ready';
  version?: number;
  claimedAt?: number;
  updatedAt?: number;
  stores?: FcdaumStore[];
  qscReports?: FcdaumQscReport[];
  failedStoreIds?: string[];
}

// 오늘자 + 완성 + 현재 스윕버전이어야 "그대로 써도 되는" 스냅샷
function isUsable(d: SnapshotDoc, key: string): boolean {
  return d.dateKey === key && d.status === 'ready' && d.version === SNAP_VERSION;
}

function extract(d: SnapshotDoc): DailyStoreData {
  return {
    dateKey: d.dateKey ?? '',
    stores: d.stores ?? [],
    qscReports: d.qscReports ?? [],
    failedStoreIds: d.failedStoreIds ?? [],
  };
}

// 같은 탭 내 반복 읽기 시 Firestore 재조회를 줄이는 메모리 캐시 (날짜 바뀌면 무효)
let memo: { data: DailyStoreData; at: number } | null = null;
let inflight: Promise<DailyStoreData> | null = null;

// 트랜잭션으로 오늘자 스윕 권리를 선점한다. 이미 ready거나, 누가 building 중(타임아웃 이내)이면 패배.
async function tryClaim(key: string): Promise<boolean> {
  try {
    return await runTransaction(salesDb, async tx => {
      const s = await tx.get(SNAP_REF);
      const d = (s.data() as SnapshotDoc) ?? {};
      if (isUsable(d, key)) return false;
      const fresh = d.status === 'building' && !!d.claimedAt && Date.now() - d.claimedAt < BUILD_TIMEOUT;
      if (fresh) return false;
      tx.set(SNAP_REF, { dateKey: key, status: 'building', claimedAt: Date.now() }, { merge: true });
      return true;
    });
  } catch {
    return false; // 트랜잭션 경합 패배 등 — 승자가 따로 있다고 보고 대기 경로로
  }
}

// 다른 클라이언트가 스윕을 끝내(ready) 줄 때까지 잠깐 폴링
async function pollForReady(key: string): Promise<DailyStoreData | null> {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL);
    const s = await getDoc(SNAP_REF);
    const d = (s.data() as SnapshotDoc) ?? {};
    if (isUsable(d, key)) return extract(d);
  }
  return null;
}

// 실제 FC다움 전수 스윕 1회 + 스냅샷 기록
async function runSweep(key: string): Promise<DailyStoreData> {
  const allStores = await fetchAllStores();
  // FC다움 권고(2026-07): 품질관리 리포트는 storeIds 없이 1회(필요 시 페이징) 조회로
  // 브랜드 전체를 받는다. 과거 매장별 단건 전수 조회(약 84콜/스윕)는 "동일 호출 반복 →
  // 공격 의심"을 유발해 폐기. 부수 효과로, storeId 없는 신규오픈 매장의 리포트도 storeNo로
  // 함께 잡힌다(buildStoreItems가 storeNo 기준이므로 매칭됨).
  const reports = await fetchQscReportsAll();

  const stores = allStores.map(slimStore);
  const data: DailyStoreData = {
    // 단일 조회라 매장별 개별 실패 개념이 없다 → failedStoreIds는 빈 배열.
    dateKey: key, stores, qscReports: capQscPerStore(reports), failedStoreIds: [],
  };
  const payload = { ...data, status: 'ready' as const, version: SNAP_VERSION, updatedAt: Date.now() };
  // 프리뷰/프로덕션에서 실제 doc 크기 확인용 — 1MB(약 1,048,576B)에 여유 있는지 점검.
  try {
    const bytes = JSON.stringify(payload).length;
    console.info(`[fcdaumSnapshot] 스냅샷 크기 ≈ ${(bytes / 1024).toFixed(0)}KB (stores ${stores.length}, qsc ${data.qscReports.length})`);
  } catch { /* 측정 실패는 무시 */ }
  try {
    await setDoc(SNAP_REF, payload);
  } catch (e) {
    // 기록 실패(예: doc 1MB 초과) — 이번 호출은 라이브 데이터로 동작하되 캐시는 미기록.
    // 위 크기 캡(storeUsers 제거 + QSC 매장별 20건)으로 정상 범위에선 발생하지 않아야 한다.
    console.warn('[fcdaumSnapshot] 스냅샷 기록 실패 — 라이브 데이터로 폴백:', e);
  }
  return data;
}

/**
 * 오늘자 매장+QSC 데이터를 반환한다. FC다움 호출은 전사 하루 최대 1회.
 * @param force 메모리 캐시를 건너뛰고 Firestore 스냅샷을 다시 읽는다(새로고침 버튼용).
 *              스냅샷이 이미 오늘자면 FC다움은 호출하지 않는다.
 */
export async function getDailyStoreData(force = false): Promise<DailyStoreData> {
  const key = todayKey();
  if (!force && memo && memo.data.dateKey === key) return memo.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const snap = await getDoc(SNAP_REF);
      const cur = (snap.data() as SnapshotDoc) ?? {};

      // 1) 오늘자 완성본(현재 스윕버전) — FC다움 무호출
      if (isUsable(cur, key)) {
        const data = extract(cur);
        memo = { data, at: Date.now() };
        return data;
      }

      // 2) 갱신 필요 — 원자적 claim 시도
      const won = await tryClaim(key);
      if (!won) {
        // 누군가 스윕 중 — ready 대기
        const polled = await pollForReady(key);
        if (polled) { memo = { data: polled, at: Date.now() }; return polled; }
        // 대기 실패해도, 직전(어제) 스냅샷이라도 있으면 그걸 반환해 중복 스윕을 피한다
        if (cur.stores && cur.stores.length) {
          const stale = extract(cur);
          memo = { data: stale, at: Date.now() };
          return stale;
        }
        // 정말 아무 데이터도 없는 최초 상황만 직접 스윕으로 폴백
      }

      // 3) 승자(또는 데이터 전무 시 폴백) — 실제 스윕
      const data = await runSweep(key);
      memo = { data, at: Date.now() };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// 특정 매장의 QSC 리포트를 스냅샷에서 필터링(무호출). storeNo는 전역 고유값.
export function qscReportsForStore(data: DailyStoreData, storeNo: number): FcdaumQscReport[] {
  return data.qscReports
    .filter(r => r.storeNo === storeNo)
    .sort((a, b) => b.visitDate - a.visitDate);
}
