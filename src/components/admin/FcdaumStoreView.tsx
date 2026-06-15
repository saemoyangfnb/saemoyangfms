import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, ChevronRight, AlertTriangle, CheckCircle2, Link, Plus } from 'lucide-react';
import { salesDb } from '../../firebase';
import { doc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';
import {
  fetchAllStores, fetchOperationInfos, fetchHelpdeskSummary, fetchQscReports,
  FcdaumStore, FcdaumOperationInfo, FcdaumHelpdeskSummary, FcdaumQscReport,
} from '../../fcdaum';
import { Store, FranchiseSchedule } from '../../types';
import { useToast } from '../Toast';
import { FcdaumScheduleCreateModal } from './FcdaumScheduleCreateModal';

type DetailTab = 'info' | 'operation' | 'timeline' | 'helpdesk' | 'qsc';

const STATUS_LABEL: Record<string, string> = { O: '운영중', C: '폐점', P: '준비중' };
const TYPE_LABEL: Record<string, string> = { F: '가맹', D: '직영' };

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value || value === 'EMPTY') return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs text-stone-400 shrink-0 w-24">{label}</span>
      <span className="text-xs text-stone-800 dark:text-stone-200 font-medium">{value}</span>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-stone-400 gap-2">
      <AlertTriangle size={28} />
      <p className="text-sm font-bold">타임라인</p>
      <p className="text-xs">FC다움 서버 오류(500) — FC다움에 문의 필요</p>
    </div>
  );
}

export function FcdaumStoreView() {
  const toast = useToast();
  const [stores, setStores] = useState<FcdaumStore[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [selected, setSelected] = useState<FcdaumStore | null>(null);
  const [tab, setTab] = useState<DetailTab>('info');

  // FC다움 탭별 데이터
  const [opInfo, setOpInfo] = useState<FcdaumOperationInfo | null>(null);
  const [opLoading, setOpLoading] = useState(false);
  const [helpdesk, setHelpdesk] = useState<FcdaumHelpdeskSummary | null>(null);
  const [qscReports, setQscReports] = useState<FcdaumQscReport[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // Firestore 연동 데이터
  const [firestoreStore, setFirestoreStore] = useState<Store | null | undefined>(undefined); // undefined=로딩중
  const [linkedSchedule, setLinkedSchedule] = useState<FranchiseSchedule | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [fcdaumStores, schedSnap] = await Promise.all([
        fetchAllStores(),
        getDocs(collection(salesDb, 'franchise_schedules')),
      ]);
      setStores(fcdaumStores);
      const ids = new Set<string>();
      schedSnap.docs.forEach(d => {
        const data = d.data();
        const sid = data.storeId as string | undefined;
        const fid = data.fcdaumStoreId as string | undefined;
        if (sid) ids.add(sid);
        if (fid) ids.add(fid);
      });
      setLinkedIds(ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'FC다움 연결 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSelect = async (store: FcdaumStore) => {
    setSelected(store);
    setTab('info');
    setOpInfo(null);
    setHelpdesk(null);
    setQscReports([]);
    setFirestoreStore(undefined);
    setLinkedSchedule(null);

    // Firestore stores 조회
    const storeSnap = await getDoc(doc(salesDb, 'stores', store.storeId));
    const fsStore = storeSnap.exists() ? { id: storeSnap.id, ...storeSnap.data() } as Store : null;
    setFirestoreStore(fsStore);

    // 연결된 가맹 일정 조회 — storeId(수동 매핑) 또는 fcdaumStoreId(FcdaumScheduleCreateModal) 두 경로 확인
    const [schedSnap, fcdaumSnap] = await Promise.all([
      getDocs(query(collection(salesDb, 'franchise_schedules'), where('storeId', '==', store.storeId))),
      getDocs(query(collection(salesDb, 'franchise_schedules'), where('fcdaumStoreId', '==', store.storeId))),
    ]);
    const matchDoc = schedSnap.docs[0] ?? fcdaumSnap.docs[0];
    if (matchDoc) {
      setLinkedSchedule({ id: matchDoc.id, ...matchDoc.data() } as FranchiseSchedule);
    } else if (fsStore?.scheduleId) {
      // stores.scheduleId 로도 시도
      const schedDoc = await getDoc(doc(salesDb, 'franchise_schedules', fsStore.scheduleId));
      if (schedDoc.exists()) {
        setLinkedSchedule({ id: schedDoc.id, ...schedDoc.data() } as FranchiseSchedule);
      }
    }
  };

  const handleTabChange = async (t: DetailTab) => {
    setTab(t);
    if (t === 'operation' && selected && !opInfo) {
      setOpLoading(true);
      try {
        const list = await fetchOperationInfos([selected.storeId]);
        setOpInfo(list[0] ?? null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '운영정보 로드 오류');
      } finally {
        setOpLoading(false);
      }
    }
    if (t === 'helpdesk' && selected && !helpdesk) {
      setSubLoading(true);
      try {
        setHelpdesk(await fetchHelpdeskSummary([selected.storeId]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '매장 요청 로드 오류');
      } finally {
        setSubLoading(false);
      }
    }
    if (t === 'qsc' && selected && qscReports.length === 0) {
      setSubLoading(true);
      try {
        setQscReports(await fetchQscReports([selected.storeId]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'QSC 리포트 로드 오류');
      } finally {
        setSubLoading(false);
      }
    }
  };

  const filtered = stores.filter(s => {
    const matchSearch = s.storeNm.includes(search) || s.storeId.includes(search) || s.address.includes(search);
    const matchLinked = !onlyUnlinked || !linkedIds.has(s.storeId);
    return matchSearch && matchLinked;
  });
  const unlinkedCount = stores.filter(s => s.storeStatus === 'O' && !linkedIds.has(s.storeId)).length;

  const TABS: { key: DetailTab; label: string; available: boolean }[] = [
    { key: 'info',      label: '기본정보',    available: true },
    { key: 'operation', label: '운영정보',    available: true },
    { key: 'timeline',  label: '타임라인',    available: false },
    { key: 'helpdesk',  label: '매장요청',    available: true },
    { key: 'qsc',       label: 'QSC 리포트',  available: true },
  ];

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-0">
      {/* 좌측 매장 목록 */}
      <div className="w-72 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="매장명·코드·주소"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200"
            />
          </div>
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-sm border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {unlinkedCount > 0 && (
          <button
            onClick={() => setOnlyUnlinked(v => !v)}
            className={`w-full text-xs font-bold px-3 py-1.5 rounded-sm border transition-colors
              ${onlyUnlinked
                ? 'bg-amber-500 text-white border-amber-500'
                : 'border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
          >
            {onlyUnlinked ? '▼ 미연결만 보는 중' : `⚠ 미연결 운영 매장 ${unlinkedCount}개`}
          </button>
        )}

        <div className="flex-1 overflow-y-auto border border-stone-200 dark:border-stone-700 rounded-sm divide-y divide-stone-100 dark:divide-stone-800">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-xs text-stone-400">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-stone-400">검색 결과 없음</div>
          ) : filtered.map(s => (
            <button key={s.storeId} onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2
                ${selected?.storeId === s.storeId ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">{s.storeNm}</p>
                <p className="text-[10px] text-stone-400 truncate">{s.storeId} · {STATUS_LABEL[s.storeStatus] ?? s.storeStatus}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {linkedIds.has(s.storeId)
                  ? <Link size={11} className="text-blue-400" />
                  : s.storeStatus === 'O' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                {selected?.storeId === s.storeId && <ChevronRight size={12} className="text-blue-500" />}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 text-right">총 {filtered.length}개</p>
      </div>

      {/* 우측 상세 */}
      {selected ? (
        <div className="flex-1 min-w-0 flex flex-col border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-stone-800 dark:text-stone-100">{selected.storeNm}</p>
              <p className="text-xs text-stone-400 mt-0.5">{selected.address}</p>
            </div>
            {/* Firestore 동기화 상태 + 가맹 일정 생성 */}
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {firestoreStore === undefined ? (
                <span className="text-[10px] text-stone-400">확인 중...</span>
              ) : firestoreStore ? (
                <span className="flex items-center gap-1 text-[10px] text-green-600 font-bold">
                  <CheckCircle2 size={11} /> 인트라넷 동기화됨
                </span>
              ) : (
                <span className="text-[10px] text-amber-600 font-bold">인트라넷 미동기화</span>
              )}
              {linkedSchedule ? (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                  <Link size={11} /> 가맹 일정 연결됨
                </span>
              ) : selected.storeStatus === 'O' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-md transition-colors"
                >
                  <Plus size={10} /> 가맹 일정 생성
                </button>
              )}
            </div>
          </div>

          {/* 탭 */}
          <div className="flex border-b border-stone-200 dark:border-stone-700 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key}
                onClick={() => t.available && handleTabChange(t.key)}
                className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors
                  ${tab === t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-stone-500'}
                  ${!t.available ? 'opacity-40 cursor-not-allowed' : 'hover:text-stone-800 dark:hover:text-stone-200'}`}>
                {t.label}
                {!t.available && <span className="ml-1 text-[9px] text-stone-400">준비중</span>}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {tab === 'info' && (
              <>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="매장 코드"  value={selected.storeId} />
                  <Field label="운영 상태"  value={STATUS_LABEL[selected.storeStatus] ?? selected.storeStatus} />
                  <Field label="매장 유형"  value={TYPE_LABEL[selected.storeType] ?? selected.storeType} />
                  <Field label="계약 상태"  value={selected.storeSubStatus} />
                  <Field label="대표자"     value={selected.storeCeo} />
                  <Field label="사업자번호" value={selected.storeBizNo} />
                  <Field label="전화번호"   value={selected.phone} />
                  <Field label="휴대전화"   value={selected.mobile} />
                  <div className="col-span-2"><Field label="주소" value={selected.address} /></div>
                  {(selected.storeUsers ?? []).length > 0 && (
                    <div className="col-span-2 mt-1">
                      <p className="text-xs font-bold text-stone-500 mb-1.5">매장 사용자</p>
                      <div className="space-y-1">
                        {(selected.storeUsers ?? []).map(u => (
                          <div key={u.userId} className="flex items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
                            <span className="font-bold">{u.userNm}</span>
                            <span className="text-stone-400">{u.authority}</span>
                            <span>{u.userId}</span>
                            <span>{u.mobile}</span>
                            <span className={u.useYn === 'y' ? 'text-green-600' : 'text-stone-300'}>
                              {u.useYn === 'y' ? '활성' : '비활성'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 연결된 가맹 일정 */}
                {linkedSchedule && (
                  <div className="border border-blue-200 dark:border-blue-800 rounded-sm p-3 bg-blue-50/50 dark:bg-blue-900/10">
                    <p className="text-xs font-black text-blue-700 dark:text-blue-400 mb-2">연결된 가맹 일정</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      <Field label="매장호수"    value={linkedSchedule.storeNumber} />
                      <Field label="담당팀"      value={linkedSchedule.team} />
                      <Field label="슈퍼바이저"  value={linkedSchedule.supervisor} />
                      <Field label="공사착공"    value={linkedSchedule.constructionStart} />
                      <Field label="공사완료"    value={linkedSchedule.constructionEnd} />
                      <Field label="소프트오픈"  value={linkedSchedule.softOpenDate} />
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'operation' && (
              opLoading ? (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">불러오는 중...</div>
              ) : opInfo ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="입점층수"   value={opInfo.pointType} />
                  <Field label="매장 크기"  value={opInfo.size} />
                  <Field label="좌석수"     value={opInfo.seat} />
                  <Field label="운영형태"   value={opInfo.type} />
                  <Field label="상권"       value={opInfo.bizDist} />
                  <Field label="세대수"     value={opInfo.household} />
                  <Field label="권리금"     value={opInfo.premium} />
                  <Field label="보증금"     value={opInfo.deposit} />
                  <Field label="월임차료"   value={opInfo.monthlyRent} />
                  <Field label="인건비"     value={opInfo.laborCost} />
                  <Field label="배달지역"   value={opInfo.deliveryArea} />
                  <Field label="배달대행비" value={opInfo.deliveryFee} />
                  <Field label="홀 인원"    value={opInfo.hallStaff} />
                  <Field label="주방 인원"  value={opInfo.kitchenStaff} />
                  <Field label="풀타임"     value={opInfo.fullTimeStaff} />
                  <Field label="파트타임"   value={opInfo.partTimeStaff} />
                  {opInfo.profile && <div className="col-span-2"><Field label="프로파일" value={opInfo.profile} /></div>}
                  {opInfo.note    && <div className="col-span-2"><Field label="특이사항" value={opInfo.note} /></div>}
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">운영정보 없음</div>
              )
            )}

            {tab === 'timeline' && <ComingSoon />}

            {tab === 'helpdesk' && (
              subLoading ? (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">불러오는 중...</div>
              ) : helpdesk ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '미확인', key: 'REQUESTED', color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' },
                      { label: '진행중', key: 'PROGRESS',  color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' },
                      { label: '완료됨', key: 'COMPLETED', color: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' },
                    ].map(({ label, key, color }) => (
                      <div key={key} className={`rounded-sm border p-3 text-center ${color}`}>
                        <p className="text-2xl font-black">{helpdesk.statusCounts[key] ?? 0}</p>
                        <p className="text-xs font-bold mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 text-right">전체 {helpdesk.totalCount}건</p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">데이터 없음</div>
              )
            )}

            {tab === 'qsc' && (
              subLoading ? (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">불러오는 중...</div>
              ) : qscReports.length > 0 ? (
                <div className="space-y-2">
                  {qscReports.map(r => (
                    <div key={r.reportNo} className="border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-stone-800 dark:text-stone-200">{r.qscTitle}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                          ${r.status === 'd' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status === 'd' ? '완료' : '작성중'}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        점검일: {new Date(r.visitDate).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-xs text-stone-400">QSC 리포트 없음</div>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-stone-400 text-sm border border-dashed border-stone-200 dark:border-stone-700 rounded-sm">
          좌측에서 매장을 선택하세요
        </div>
      )}

      {showCreateModal && selected && (
        <FcdaumScheduleCreateModal
          store={selected}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            load(); // linkedIds 새로고침
            handleSelect(selected); // 우측 패널 상태 새로고침
          }}
        />
      )}
    </div>
  );
}
