// 가맹 점검(QSC) 관리 알림 — 4단계 분류 공통 로직.
// 가맹관리 화면(StoreMgmtView/StoreOverviewMap)과 홈 위젯이 반드시 동일 기준을
// 쓰도록 이 파일 하나에서만 정의한다. 기준을 바꿀 땐 여기만 수정하면 전 화면 연동된다.
import type { FcdaumStore, FcdaumQscReport } from '../../fcdaum';

export const getDaysSince = (ms: number) => Math.floor((Date.now() - ms) / 86400000);

// 관리 알림 4단계 — 리포트(QSC 점검) 생성일 기준
//  0 미확인  : 리포트 없음 (최근 오픈 매장이거나 방문 시급)
//  1 기한 초과: 리포트 생성 후 60일 초과
//  2 기한 임박: 리포트 생성 후 45일 이상 (45~59일)
//  3 양호     : 리포트 생성 45일 이내
export function priorityLevel(days: number | null): 0 | 1 | 2 | 3 {
  if (days === null) return 0;
  if (days >= 60) return 1;
  if (days >= 45) return 2;
  return 3;
}

// level 4 '조회 실패' — 리포트가 없어서가 아니라 API 단건 조회가 실패한 경우.
// '미확인'(리포트 진짜 없음)과 반드시 구분해야 거짓 미확인이 재발하지 않는다.
export const LEVEL_LABEL: Record<number, string> = {
  0: '미확인', 1: '기한 초과', 2: '기한 임박', 3: '양호', 4: '조회 실패',
};
export const LEVEL_HEX: Record<number, string> = {
  0: '#94a3b8', 1: '#ef4444', 2: '#f59e0b', 3: '#10b981', 4: '#8b5cf6',
};

export interface StoreItem { store: FcdaumStore; days: number | null; level: number; }

// 운영중(storeStatus 'O') 매장 + 최근 QSC 방문일 기준으로 매장별 레벨/경과일 산출.
// 정렬은 호출측에서 필요에 맞게 (가맹관리는 경과일 내림차순).
// failedStoreIds: 단건 조회가 실패한 storeId 집합 — 넘기면 리포트 없는 매장을
// '미확인'(0) 대신 '조회 실패'(4)로 분류해 일시적 실패를 거짓 미확인과 구분한다.
export function buildStoreItems(
  stores: FcdaumStore[], qscReports: FcdaumQscReport[], failedStoreIds?: Set<string>,
): StoreItem[] {
  return stores
    .filter(s => s.storeStatus === 'O')
    .map(s => {
      // storeId는 브랜드별 중복 가능 + 일부 QSC 리포트엔 storeId가 비어 있음.
      // 전역 고유값 storeNo로 매칭해야 미확인 오분류가 안 생긴다.
      const reps = qscReports.filter(r => r.storeNo === s.storeNo && r.status === 'd');
      const latest = reps.sort((a, b) => b.visitDate - a.visitDate)[0];
      if (latest) {
        const days = getDaysSince(latest.visitDate);
        return { store: s, days, level: priorityLevel(days) };
      }
      // 리포트 없음 — 단건 조회 실패 매장이면 '조회 실패'(4), 아니면 진짜 '미확인'(0)
      return { store: s, days: null, level: failedStoreIds?.has(s.storeId) ? 4 : 0 };
    });
}

export interface StoreCounts { all: number; unknown: number; overdue: number; soon: number; ok: number; failed: number; }

export function countByLevel(items: StoreItem[]): StoreCounts {
  return {
    all:     items.length,
    unknown: items.filter(i => i.level === 0).length, // 미확인
    overdue: items.filter(i => i.level === 1).length, // 기한 초과
    soon:    items.filter(i => i.level === 2).length, // 기한 임박
    ok:      items.filter(i => i.level === 3).length, // 양호
    failed:  items.filter(i => i.level === 4).length, // 조회 실패
  };
}
