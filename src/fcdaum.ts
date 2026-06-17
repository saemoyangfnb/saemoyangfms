// FC다움 Open API 연동 모듈
// API 키는 Vercel 환경 변수에서 관리 (FCDAUM_API_KEY, FCDAUM_SECRET_KEY)
// 브라우저는 /api/fcdaum 프록시를 통해 호출 — CORS 우회

async function apiFetch(path: string, params?: Record<string, string>) {
  const url = new URL('/api/fcdaum', window.location.origin);
  url.searchParams.set('path', path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (res.status === 401) throw new Error('FC다움 인증키 또는 비밀키가 올바르지 않습니다.');
  if (!res.ok) throw new Error(`FC다움 API 오류: ${res.status}`);
  return res.json();
}

// ── 타입 ──────────────────────────────────────────

export interface FcdaumStoreUser {
  userId: string;
  authority: string;   // 'owner' 등
  userNm: string;
  mobile: string;
  useYn: 'y' | 'n';
}

export interface FcdaumStore {
  storeNo: number;
  storeId: string;
  storeType: string;
  storeNm: string;
  storeBizNo: string;
  storeCeo: string;
  address: string;
  storeStatus: string;     // 'O' = 운영중
  storeSubStatus: string;
  phone: string;
  mobile: string;
  subSupervisorIds: string[];
  storeUsers: FcdaumStoreUser[];
}

export interface FcdaumOperationInfo {
  storeNo: number;
  storeId: string;
  storeNm: string;
  pointType: string;     // 입점층수
  size: string;          // 매장 크기
  seat: string;          // 좌석수
  premium: string;       // 권리금
  deposit: string;       // 보증금
  monthlyRent: string;   // 월임차료
  deliveryArea: string;  // 배달지역
  deliveryFee: string;   // 배달대행비
  type: string;          // 운영형태
  bizDist: string;       // 상권
  household: string;     // 세대수
  hallStaff: string;     // 운영인원: 홀
  kitchenStaff: string;  // 운영인원: 주방
  fullTimeStaff: string; // 풀타임
  partTimeStaff: string; // 파트타임
  laborCost: string;     // 인건비
  profile: string;       // 매장 프로파일
  note: string;          // 기타 특이사항
}

export interface FcdaumTimeline {
  storeNo: number;
  storeId: string;
  recordDate: string;         // yyyyMMdd
  storeStatus: string;
  contractStatus: string;
  recordType: string;
  recordSubType: string;
  title: string;
  content: string;            // JSON
  registrationType: string;
  actionCompleteDate: string; // yyyyMMdd (시정명령 전용)
  createdAt: number;          // Unix timestamp
  updatedAt: number;
}

export interface FcdaumHelpdeskSummary {
  statusCounts: Record<string, number>; // 미확인/진행중/완료됨
  totalCount: number;
}

export interface FcdaumQscReport {
  reportNo: number;
  qscNo: string;
  qscTitle: string;
  storeNo: number;
  storeId: string;
  storeNm: string;
  status: string;       // 'r'=작성중, 'd'=완료 등
  visitDate: number;    // Unix timestamp
  regDate: number;      // Unix timestamp
}

// ── 세션 캐시 (TTL 10분, 동시 호출 중복 방지) ─────────────────
let storesCache: { data: FcdaumStore[]; at: number } | null = null;
let storesFetch: Promise<FcdaumStore[]> | null = null;
const CACHE_TTL = 10 * 60 * 1000;

// ── API 호출 ──────────────────────────────────────

export async function fetchAllStores(): Promise<FcdaumStore[]> {
  const now = Date.now();
  if (storesCache && now - storesCache.at < CACHE_TTL) return storesCache.data;
  if (storesFetch) return storesFetch;
  storesFetch = apiFetch('store-and-user')
    .then(data => {
      const stores: FcdaumStore[] = data.stores ?? [];
      storesCache = { data: stores, at: Date.now() };
      return stores;
    })
    .finally(() => { storesFetch = null; });
  return storesFetch;
}

export function invalidateStoresCache() {
  storesCache = null;
}

export async function fetchOperationInfos(storeIds?: string[]): Promise<FcdaumOperationInfo[]> {
  const params: Record<string, string> = {};
  if (storeIds?.length) params['storeIds'] = storeIds.join(',');
  const data = await apiFetch('store-operation-info', params);
  return data.operationInfos ?? [];
}

// 타임라인 — FC다움 서버 오류(500) 발생 중, URL은 확인됨
export async function fetchTimelines(storeIds?: string[]): Promise<FcdaumTimeline[]> {
  const params: Record<string, string> = { pageSize: '100' };
  if (storeIds?.length) params['storeIds'] = storeIds.join(',');
  const data = await apiFetch('store-timeline', params);
  return data.timelines ?? [];
}

export async function fetchHelpdeskSummary(storeIds?: string[]): Promise<FcdaumHelpdeskSummary> {
  const params: Record<string, string> = {};
  if (storeIds?.length) params['storeIds'] = storeIds.join(',');
  const data = await apiFetch('helpdesk/count-by-status', params);
  return { statusCounts: data.statusCounts ?? {}, totalCount: data.totalCount ?? 0 };
}

const toMs = (ts: number) => ts < 10_000_000_000 ? ts * 1000 : ts;

// ⚠️ qsc/report 엔드포인트는 storeIds를 여러 개 주면 응답을 "최신 ~10건"으로 잘라
// 반환하고 pageSize·page 등 페이징 파라미터를 전부 무시한다(직접 호출로 검증).
// → 청크를 줄여도 오래된 리포트를 가진 매장이 통째로 누락된다. 매장별 최신 리포트를
// 보장하려면 storeId 1개씩 조회해야 한다(아래 fetchQscReportsPerStore).
// 이 상수는 단건 외 직접 호출 시의 하위호환 청크 분할용으로만 남겨둔다.
const QSC_STOREIDS_CHUNK = 10;

export async function fetchQscReports(storeIds?: string[], pageSize = 50): Promise<FcdaumQscReport[]> {
  if (storeIds && storeIds.length > QSC_STOREIDS_CHUNK) {
    const chunks: string[][] = [];
    for (let i = 0; i < storeIds.length; i += QSC_STOREIDS_CHUNK) {
      chunks.push(storeIds.slice(i, i + QSC_STOREIDS_CHUNK));
    }
    const results = await Promise.all(chunks.map(c => fetchQscReports(c, pageSize)));
    // reportNo 기준 중복 제거 (storeId가 브랜드 간 중복될 때 청크 간 겹침 방지)
    const seen = new Set<number>();
    return results.flat().filter(r => (seen.has(r.reportNo) ? false : (seen.add(r.reportNo), true)));
  }
  const params: Record<string, string> = { pageSize: String(pageSize) };
  if (storeIds?.length) params['storeIds'] = storeIds.join(',');
  const data = await apiFetch('qsc/report', params);
  return (data.qscReports ?? []).map((r: FcdaumQscReport) => ({
    ...r,
    visitDate: toMs(r.visitDate),
    regDate:   toMs(r.regDate),
  }));
}

export interface QscPerStoreResult {
  reports: FcdaumQscReport[];
  failedStoreIds: string[]; // 재시도 후에도 조회 실패한 storeId — 호출측에서 '미확인'과 구분
}

// 매장별 단건 조회로 QSC 리포트를 모은다. 다건 조회의 응답 cap(~10건) 누락을 피하는
// 유일한 신뢰 경로. 동시성을 제한(기본 8)해 프록시 부하·레이트리밋을 줄이고, 각 매장은
// 1회 재시도한다. 실패한 storeId는 따로 모아 반환 — 실패를 '리포트 없음(미확인)'으로
// 오분류하지 않게 하는 것이 이 함수의 핵심.
export async function fetchQscReportsPerStore(
  storeIds: string[], concurrency = 8,
): Promise<QscPerStoreResult> {
  const ids = storeIds.filter((id): id is string => !!id);
  const reports: FcdaumQscReport[] = [];
  const failedStoreIds: string[] = [];
  const fetchOne = async (id: string) => {
    try { return await fetchQscReports([id]); }
    catch { return await fetchQscReports([id]); } // 1회 재시도
  };
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fetchOne));
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') reports.push(...r.value);
      else failedStoreIds.push(batch[idx]);
    });
  }
  return { reports, failedStoreIds };
}

// FC다움 → 내부 Store 포맷 변환
export function mapFcdaumStore(s: FcdaumStore) {
  const owner = (s.storeUsers ?? []).find(u => u.authority === 'owner');
  const region = (s.address ?? '').split(' ')[0] ?? '';
  return {
    id: s.storeId,
    storeCode: s.storeId,
    name: s.storeNm,
    region,
    address: s.address,
    status: s.storeStatus === 'O' ? '운영중' : s.storeStatus,
    franchiseType: s.storeType === 'F' ? '가맹' : s.storeType,
    contractStatus: s.storeSubStatus,
    ceoName: s.storeCeo,
    operatorName: owner?.userNm ?? s.storeCeo,
    phone: s.phone,
    mobile: s.mobile,
    email: owner?.userId ?? '',
    openDate: '',
    seatCount: undefined as number | undefined,
    registeredAt: '',
  };
}
