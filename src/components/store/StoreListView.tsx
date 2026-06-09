import React, { useState, useEffect, useMemo } from 'react';
import { salesDb } from '../../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Store, FranchiseSchedule, User } from '../../types';
import { Search, X, MapPin, Phone, User as UserIcon, Calendar, ChevronRight, Building2, Clock, Link, Link2Off, Plus, Check } from 'lucide-react';
import { useToast } from '../Toast';

interface Props {
  currentUser: User;
}

const STATUS_CLS: Record<string, string> = {
  '운영중': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  '준비중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '폐점':   'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  '휴점':   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};
function statusCls(status: string) {
  return STATUS_CLS[status] ?? 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
}

export function StoreListView({ currentUser }: Props) {
  const toast = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [schedules, setSchedules] = useState<FranchiseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Store | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [mappingMode, setMappingMode] = useState(false);
  const [mappingSearch, setMappingSearch] = useState('');
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(salesDb, 'stores')),
      getDocs(collection(salesDb, 'franchise_schedules')),
    ]).then(([storeSnap, schSnap]) => {
      setStores(storeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Store))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      setSchedules(schSnap.docs.map(d => ({ id: d.id, ...d.data() } as FranchiseSchedule)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const statuses = useMemo(() => [...new Set(stores.map(s => s.status).filter(Boolean))].sort(), [stores]);

  const filtered = useMemo(() => stores.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.region?.toLowerCase().includes(q)
        || s.ceoName?.toLowerCase().includes(q) || s.storeCode?.toLowerCase().includes(q);
    }
    return true;
  }), [stores, search, filterStatus]);

  // 이 매장에 연결된 일정
  const storeSchedules = useMemo(() => {
    if (!selected) return [];
    return schedules
      .filter(s => s.storeId === selected.id || (!s.storeId && s.storeName === selected.name))
      .sort((a, b) => (b.openDate || '').localeCompare(a.openDate || ''));
  }, [selected, schedules]);

  // 매핑 후보: 아직 storeId 없는 일정 (이름 유사도 기준 정렬)
  const candidateSchedules = useMemo(() => {
    if (!selected || !mappingMode) return [];
    const unmapped = schedules.filter(s => !s.storeId && !storeSchedules.find(linked => linked.id === s.id));
    const q = (mappingSearch || selected.name).toLowerCase();
    return unmapped
      .filter(s => !mappingSearch || s.storeName?.toLowerCase().includes(mappingSearch.toLowerCase()))
      .sort((a, b) => {
        const aMatch = a.storeName?.toLowerCase().includes(q) ? 0 : 1;
        const bMatch = b.storeName?.toLowerCase().includes(q) ? 0 : 1;
        return aMatch - bMatch || (b.openDate || '').localeCompare(a.openDate || '');
      });
  }, [selected, schedules, storeSchedules, mappingMode, mappingSearch]);

  const handleLink = async (scheduleId: string) => {
    if (!selected) return;
    setLinking(scheduleId);
    try {
      await updateDoc(doc(salesDb, 'franchise_schedules', scheduleId), { storeId: selected.id });
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, storeId: selected.id } : s));
      toast.success('연결 완료');
    } catch {
      toast.error('연결 실패');
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (scheduleId: string) => {
    setLinking(scheduleId);
    try {
      await updateDoc(doc(salesDb, 'franchise_schedules', scheduleId), { storeId: '' });
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, storeId: '' } : s));
      toast.success('연결 해제');
    } catch {
      toast.error('연결 해제 실패');
    } finally {
      setLinking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] -mx-4 sm:-mx-6 lg:-mx-8">

      {/* ── 좌: 매장 목록 ── */}
      <div className={`flex flex-col shrink-0 border-r border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 transition-all duration-300 ${selected ? 'w-80' : 'w-full'}`}>
        <div className="px-4 py-4 border-b border-stone-200 dark:border-stone-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100 tracking-tight">매장 관리</h2>
            <span className="text-xs font-bold text-stone-400">{filtered.length}개</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm">
            <Search size={13} className="text-stone-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="매장명·지역·대표자 검색"
              className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
            />
            {search && <button onClick={() => setSearch('')}><X size={12} className="text-stone-400" /></button>}
          </div>
          {statuses.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setFilterStatus('')}
                className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition-colors ${!filterStatus ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 text-stone-500 hover:border-stone-600'}`}>
                전체
              </button>
              {statuses.map(s => (
                <button key={s} onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-sm border transition-colors ${filterStatus === s ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 text-stone-500 hover:border-stone-600'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-300 dark:text-stone-700">
              <Building2 size={28} className="mb-2" />
              <p className="text-xs font-bold">해당하는 매장이 없습니다</p>
            </div>
          ) : (
            filtered.map(store => {
              const linked = schedules.filter(s => s.storeId === store.id).length;
              return (
                <button key={store.id} onClick={() => { setSelected(prev => prev?.id === store.id ? null : store); setMappingMode(false); setMappingSearch(''); }}
                  className={`w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors ${selected?.id === store.id ? 'bg-stone-100 dark:bg-stone-800 border-l-2 border-stone-800 dark:border-stone-400' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-stone-800 dark:text-stone-200 truncate">{store.name}</p>
                      <p className="text-[10px] font-bold text-stone-400 mt-0.5">{store.region} · {store.franchiseType || '가맹'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {linked > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          이력 {linked}
                        </span>
                      )}
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm ${statusCls(store.status)}`}>{store.status || '미확인'}</span>
                      <ChevronRight size={12} className="text-stone-300" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── 우: 매장 상세 ── */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#FDFBF7] dark:bg-stone-950">

          {/* 상세 헤더 */}
          <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-start justify-between gap-4 shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-black text-stone-900 dark:text-white tracking-tight">{selected.name}</h2>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-sm ${statusCls(selected.status)}`}>{selected.status || '미확인'}</span>
              </div>
              <p className="text-xs font-bold text-stone-400">{selected.storeCode} · {selected.region} · {selected.franchiseType}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* 기본 정보 */}
            <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase">기본 정보</p>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {[
                  { label: '주소',    value: selected.address,       icon: <MapPin size={12} /> },
                  { label: '대표자',  value: selected.ceoName,       icon: <UserIcon size={12} /> },
                  { label: '운영자',  value: selected.operatorName,  icon: <UserIcon size={12} /> },
                  { label: '전화',    value: selected.phone || selected.mobile, icon: <Phone size={12} /> },
                  { label: '개점일',  value: selected.openDate,      icon: <Calendar size={12} /> },
                  { label: '계약상태', value: selected.contractStatus },
                  { label: '좌석수',  value: selected.seatCount ? `${selected.seatCount}석` : undefined },
                  { label: '이메일',  value: selected.email },
                ].filter(r => r.value).map(row => (
                  <div key={row.label} className="flex items-center gap-3 px-4 py-2.5">
                    {row.icon ? <span className="text-stone-400 shrink-0">{row.icon}</span> : <span className="w-3" />}
                    <span className="text-[11px] font-bold text-stone-400 w-16 shrink-0">{row.label}</span>
                    <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex-1">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 오픈 이력 */}
            <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase flex items-center gap-1.5">
                  <Clock size={10} /> 오픈 이력
                  <span className="font-bold text-stone-300">({storeSchedules.length}건)</span>
                </p>
                {currentUser.role === 'admin' && (
                  <button
                    onClick={() => { setMappingMode(p => !p); setMappingSearch(''); }}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-sm border transition-colors ${mappingMode ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-500 hover:border-stone-700 hover:text-stone-800'}`}
                  >
                    <Link size={10} /> 연결 관리
                  </button>
                )}
              </div>

              {/* 연결된 이력 목록 */}
              {storeSchedules.length === 0 && !mappingMode ? (
                <div className="py-8 text-center space-y-1">
                  <p className="text-xs font-bold text-stone-300 dark:text-stone-600">연결된 오픈 이력이 없습니다</p>
                  {currentUser.role === 'admin' && (
                    <p className="text-[10px] text-stone-300 dark:text-stone-700">"연결 관리"를 눌러 오픈 일정을 매핑하세요</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {storeSchedules.map((sch, idx) => (
                    <div key={sch.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex flex-col items-center shrink-0 mt-1">
                        <div className={`w-2 h-2 rounded-full ${idx === 0 && !sch.archived ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-600'}`} />
                        {idx < storeSchedules.length - 1 && <div className="w-px h-8 bg-stone-200 dark:bg-stone-700 mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-black text-stone-800 dark:text-stone-200">{sch.storeName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${sch.archived ? 'bg-stone-100 text-stone-400 dark:bg-stone-800' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {sch.archived ? '완료' : '진행중'}
                          </span>
                          {!sch.storeId && <span className="text-[9px] text-stone-300 dark:text-stone-600">(이름매칭)</span>}
                        </div>
                        <div className="text-[11px] font-bold text-stone-500 flex gap-2">
                          {sch.openDate && <span>오픈 {sch.openDate}</span>}
                          {sch.team && <span>· {sch.team}</span>}
                        </div>
                      </div>
                      {mappingMode && sch.storeId && currentUser.role === 'admin' && (
                        <button
                          onClick={() => handleUnlink(sch.id)}
                          disabled={linking === sch.id}
                          className="shrink-0 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-sm border border-rose-200 transition-colors"
                          title="연결 해제"
                        >
                          {linking === sch.id ? <div className="w-3 h-3 border border-stone-300 border-t-stone-600 rounded-full animate-spin" /> : <Link2Off size={13} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 연결 후보 목록 */}
              {mappingMode && (
                <div className="border-t-2 border-stone-200 dark:border-stone-700">
                  <div className="px-4 py-3 bg-stone-50 dark:bg-stone-800/50 space-y-2">
                    <p className="text-[10px] font-black text-stone-500 tracking-widest">미매핑 일정에서 선택</p>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm">
                      <Search size={11} className="text-stone-400 shrink-0" />
                      <input
                        value={mappingSearch}
                        onChange={e => setMappingSearch(e.target.value)}
                        placeholder={`기본: "${selected.name}" 유사 검색`}
                        className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
                      />
                      {mappingSearch && <button onClick={() => setMappingSearch('')}><X size={10} className="text-stone-400" /></button>}
                    </div>
                  </div>

                  {candidateSchedules.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs font-bold text-stone-300 dark:text-stone-600">
                      {mappingSearch ? '일치하는 미매핑 일정이 없습니다' : '모든 일정이 이미 매핑되었습니다'}
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100 dark:divide-stone-800 max-h-60 overflow-y-auto">
                      {candidateSchedules.map(sch => (
                        <div key={sch.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">{sch.storeName}</p>
                            <p className="text-[10px] font-bold text-stone-400">
                              {sch.openDate || '오픈일 미정'}{sch.team ? ` · ${sch.team}` : ''}
                              {sch.archived ? ' · 완료' : ' · 진행중'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleLink(sch.id)}
                            disabled={linking === sch.id}
                            className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors"
                          >
                            {linking === sch.id
                              ? <div className="w-3 h-3 border border-stone-400 border-t-white rounded-full animate-spin" />
                              : <><Plus size={10} /> 연결</>
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
