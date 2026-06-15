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

// ── API 호출 ──────────────────────────────────────

export async function fetchAllStores(): Promise<FcdaumStore[]> {
  const data = await apiFetch('store-and-user');
  return data.stores ?? [];
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

export async function fetchQscReports(storeIds?: string[], pageSize = 50): Promise<FcdaumQscReport[]> {
  const params: Record<string, string> = { pageSize: String(pageSize) };
  if (storeIds?.length) params['storeIds'] = storeIds.join(',');
  const data = await apiFetch('qsc/report', params);
  return data.qscReports ?? [];
}

// FC다움 → 내부 Store 포맷 변환
export function mapFcdaumStore(s: FcdaumStore) {
  const owner = s.storeUsers.find(u => u.authority === 'owner');
  const region = s.address.split(' ')[0] ?? '';
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
