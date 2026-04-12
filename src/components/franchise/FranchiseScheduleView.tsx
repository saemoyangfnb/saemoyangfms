import React, { useState, useEffect, useMemo } from 'react';
import { salesDb as db } from '../../firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { FranchiseSchedule, TeamSetting, BrandId } from '../../types';
import { Plus, Search, Settings, CheckCircle2, Eye, EyeOff, X, Layers, CheckCheck } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

// Subcomponents
import { ScheduleTimeline } from './ScheduleTimeline';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';
import { TeamSettingsModal } from './TeamSettingsModal';
import {
  ProcessMasterModal,
  ProcessSettings,
  DEFAULT_PROCESS_SETTINGS,
  BUILTIN_PROGRESS,
} from './ProcessMasterModal';

interface Props {
  brandId: BrandId;
}

export function FranchiseScheduleView({ brandId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();

  // Data states
  const [schedules, setSchedules] = useState<FranchiseSchedule[]>([]);
  const [teams, setTeams] = useState<TeamSetting[]>([]);
  const [loading, setLoading] = useState(true);

  // View states
  const [showArchived, setShowArchived] = useState(false);
  const [monthsView, setMonthsView] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingData, setEditingData] = useState<Partial<FranchiseSchedule> | null>(null);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showProcessMaster, setShowProcessMaster] = useState(false);
  const [processSettings, setProcessSettings] = useState<ProcessSettings>(DEFAULT_PROCESS_SETTINGS);
  
  const [hoveredTeam, setHoveredTeam] = useState<{ name: string, members: any[], x: number, y: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, [brandId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schSnap, teamSnap, psSnap] = await Promise.all([
        getDocs(collection(db, 'franchise_schedules')),
        getDocs(collection(db, 'team_settings')),
        getDoc(doc(db, 'process_settings', brandId)),
      ]);
      if (psSnap.exists()) {
        const ps = psSnap.data() as ProcessSettings;
        setProcessSettings({ ...DEFAULT_PROCESS_SETTINGS, ...ps });
      }

      const schData: FranchiseSchedule[] = [];
      schSnap.forEach(d => {
        const item = d.data() as FranchiseSchedule;
        if (item.brandId === brandId) schData.push({ ...item, id: d.id });
      });
      setSchedules(schData);

      const teamData: TeamSetting[] = [];
      teamSnap.forEach(d => {
        const item = d.data() as TeamSetting;
        if (item.brandId === brandId) teamData.push({ ...item, id: d.id });
      });
      setTeams(teamData);

    } catch (err) {
      toast.error('일정 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (data: Partial<FranchiseSchedule>) => {
    try {
      if (data.id) {
        const { id, ...updates } = data;
        await updateDoc(doc(db, 'franchise_schedules', id), {
          ...updates,
          updatedAt: new Date().toISOString()
        });
        toast.success('일정이 수정되었습니다.');
      } else {
        await addDoc(collection(db, 'franchise_schedules'), {
          ...data,
          brandId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        toast.success('새 일정이 등록되었습니다.');
      }
      setShowForm(false);
      setEditingData(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('일정을 저장하지 못했습니다.');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const ok = await confirm({ title: '일정 삭제', message: '정말 삭제하시겠습니까?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'franchise_schedules', id));
      toast.success('일정 삭제됨');
      fetchData();
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handleToggleProgress = async (id: string, key: keyof FranchiseSchedule['progressCheck'], currentVal: boolean) => {
    try {
      const schedule = schedules.find(s => s.id === id);
      if (!schedule) return;
      const newProgress = {
        ...(schedule.progressCheck || { ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
        [key]: !currentVal
      };
      await updateDoc(doc(db, 'franchise_schedules', id), { progressCheck: newProgress });
      fetchData();
    } catch(e) { console.error(e); }
  };

  const handleArchive = async (id: string) => {
    const ok = await confirm({ title: '오픈 완료 및 보관', message: '오픈 완료 상태로 보관하시겠습니까?', confirmLabel: '보관하기', variant: 'danger' });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'franchise_schedules', id), { archived: true });
      fetchData();
      toast.success('매장이 보관되었습니다.');
    } catch(e) { console.error(e); }
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (!showArchived && s.archived) return false;
      if (showArchived && !s.archived) return false;
      if (search && !s.storeName.includes(search)) return false;
      if (filterTeam && s.team !== filterTeam) return false;
      return true;
    }).sort((a, b) => (a.openDate || '').localeCompare(b.openDate || ''));
  }, [schedules, search, filterTeam, showArchived]);

  const timelineDates = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return {
      start: new Date(y, m - 1, 1).toISOString().split('T')[0],
      end:   new Date(y, m + 2, 0).toISOString().split('T')[0],
    };
  }, [currentMonth]);

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div>
           <h1 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
             오픈 일정 관리
             <span className="bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-widest">자동 계산</span>
           </h1>
           <p className="text-sm font-medium text-stone-500 mt-1.5">공사 기간 입력 시 프로세스가 자동 계산됩니다.</p>
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowProcessMaster(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-700 border border-stone-300 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm hover:bg-stone-100 transition-colors shadow-sm">
               <Layers size={15} /> 공정 마스터
            </button>
            <button onClick={() => setShowTeamSettings(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-700 border border-stone-300 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm hover:bg-stone-100 transition-colors shadow-sm">
               <Settings size={15} /> 팀/권역 설정
            </button>
            <button onClick={() => { setEditingData({}); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white text-sm font-bold rounded-sm hover:bg-stone-800 transition-colors shadow-sm">
               <Plus size={15} /> 신규 일정 등록
            </button>
         </div>
       </div>

       <div className="bg-[#FDFBF7] dark:bg-stone-900 p-4 rounded-sm border border-stone-300 dark:border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700">
               <button onClick={() => setMonthsView(1)} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${monthsView === 1 ? 'bg-stone-50 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>1개월</button>
               <button onClick={() => setMonthsView(2)} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${monthsView === 2 ? 'bg-stone-50 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>2개월</button>
            </div>
            
            <div className="flex items-center gap-1 font-bold ml-4">
               <button className="text-stone-400 hover:text-stone-800" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>&lt;</button>
               <span className="text-sm px-2 text-stone-900">{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</span>
               <button className="text-stone-400 hover:text-stone-800" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>&gt;</button>
               <button className="ml-2 text-[10px] bg-stone-800 text-white px-2 py-0.5 rounded-sm font-bold tracking-widest" onClick={() => setCurrentMonth(new Date())}>오늘</button>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <select className="px-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">전체 팀</option>
              {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" placeholder="매장명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" />
            </div>
         </div>
       </div>

       {loading ? (
          <div className="py-20 text-center text-stone-400 font-bold">불러오는 중...</div>
       ) : (
          <div className="flex flex-col gap-10">
              <div className={`grid grid-cols-1 ${monthsView === 2 ? 'xl:grid-cols-2' : ''} gap-6 items-start`}>
                <ScheduleCalendar
                   schedules={filteredSchedules}
                   currentMonth={currentMonth}
                   teams={teams}
                   phaseVisibility={processSettings.phaseVisibility}
                   onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                   onScheduleUpdate={async (id, data) => { await updateDoc(doc(db, 'franchise_schedules', id), data); fetchData(); }}
                />
                {monthsView === 2 && (
                  <ScheduleCalendar
                     schedules={filteredSchedules}
                     currentMonth={new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)}
                     teams={teams}
                     phaseVisibility={processSettings.phaseVisibility}
                     onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                     onScheduleUpdate={async (id, data) => { await updateDoc(doc(db, 'franchise_schedules', id), data); fetchData(); }}
                  />
                )}
              </div>
            
              <div>
                 <div className="flex items-center justify-between mb-4 border-b-2 border-stone-800 dark:border-stone-400 pb-2">
                   <h3 className="font-black text-lg text-stone-900 dark:text-stone-200 tracking-tight">
                     {showArchived ? '보관된 오픈 완료 매장' : '진행중인 매장 목록'} ({filteredSchedules.length}건)
                   </h3>
                   <button onClick={() => setShowArchived(!showArchived)} className="text-xs px-3 py-1.5 rounded-sm border border-stone-400 font-bold hover:bg-stone-200 transition-colors">
                     {showArchived ? '진행중인 매장 보기' : '오픈완료 보관함'}
                   </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredSchedules.length === 0 ? (
                      <div className="col-span-full py-10 text-center font-bold text-stone-400 bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800">해당하는 매장이 없습니다.</div>
                    ) : (
                      filteredSchedules.map(sch => (
                        <div key={sch.id} className={`bg-[#FDFBF7] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-sm p-6 shadow-none hover:border-stone-800 transition-all flex flex-col ${sch.archived ? 'opacity-60' : ''}`}>
                          {/* Header: Actions & Visibility */}
                          <div className="flex justify-between items-start mb-4 border-b border-stone-300 dark:border-stone-700 pb-3">
                            <button onClick={() => { setEditingData(sch); setShowForm(true); }} className="text-left group flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 bg-${sch.colorCode || 'slate'}-500 shadow-sm`} />
                                <span className="font-black text-xl tracking-tight text-stone-900 dark:text-white group-hover:text-stone-600 transition-colors truncate">{sch.storeName}</span>
                                <span className="text-[10px] font-bold text-stone-500 border border-stone-300 dark:border-stone-700 px-1.5 py-0.5 rounded-sm shrink-0">{sch.storeNumber || '호수 미정'}</span>
                              </div>
                              <div className="text-xs text-stone-500 font-bold ml-5 tracking-widest">{sch.team || '팀 미정'}</div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                               <button 
                                 onClick={() => { updateDoc(doc(db, 'franchise_schedules', sch.id), { showInCalendar: sch.showInCalendar === false }); fetchData(); }}
                                 className={`p-1.5 rounded-sm transition-colors border ${sch.showInCalendar !== false ? 'text-blue-800 border-blue-200 bg-blue-50 hover:bg-blue-100' : 'text-stone-400 border-stone-200 hover:bg-stone-100'}`}
                                 title={sch.showInCalendar !== false ? '달력 노출 중' : '달력 숨김'}
                               >
                                  {sch.showInCalendar !== false ? <Eye size={15} /> : <EyeOff size={15} />}
                               </button>
                               {!sch.archived && (
                                 <button
                                   onClick={() => handleArchive(sch.id)}
                                   className="p-1.5 text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-sm transition-colors"
                                   title="오픈 완료 보관"
                                 >
                                   <CheckCheck size={15} />
                                 </button>
                               )}
                               <button onClick={() => handleDeleteSchedule(sch.id)} className="p-1.5 text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-sm transition-colors" title="삭제">
                                 <X size={15} />
                               </button>
                            </div>
                          </div>
                          
                          {/* Progress Badges */}
                          <div className="mb-4">
                            <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mb-1.5 tracking-widest">진행 상황</p>
                            <div className="flex gap-1.5 flex-wrap">
                               {BUILTIN_PROGRESS.map(p => {
                                 const label = processSettings.progressLabels[p.id] ?? p.defaultLabel;
                                 const checked = sch.progressCheck?.[p.id as keyof FranchiseSchedule['progressCheck']] || false;
                                 return (
                                   <button
                                     key={p.id}
                                     onClick={() => handleToggleProgress(sch.id, p.id as any, checked)}
                                     className={`flex items-center gap-1 px-2 py-1 rounded-sm transition-colors border ${checked ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-400 dark:bg-stone-300 dark:text-stone-900' : 'border-stone-300 bg-white text-stone-400 hover:border-stone-400'}`}
                                     title={label}
                                   >
                                     <CheckCircle2 size={12} className={checked ? '' : 'opacity-30'} />
                                     <span className="text-[10px] font-bold">{label}</span>
                                   </button>
                                 );
                               })}
                               {processSettings.customItems.map(ci => {
                                 const checked = (sch as any).customProgressCheck?.[ci.id] || false;
                                 return (
                                   <button
                                     key={ci.id}
                                     onClick={async () => {
                                       await updateDoc(doc(db, 'franchise_schedules', sch.id), {
                                         [`customProgressCheck.${ci.id}`]: !checked,
                                       });
                                       fetchData();
                                     }}
                                     className={`flex items-center gap-1 px-2 py-1 rounded-sm transition-colors border ${checked ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-400 dark:bg-stone-300 dark:text-stone-900' : 'border-stone-300 bg-white text-stone-400 hover:border-stone-400'}`}
                                     title={ci.label}
                                   >
                                     <CheckCircle2 size={12} className={checked ? '' : 'opacity-30'} />
                                     <span className="text-[10px] font-bold">{ci.label}</span>
                                   </button>
                                 );
                               })}
                            </div>
                          </div>

                          {/* Info Grid */}
                          <div className="mt-auto bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 p-4 space-y-3 text-xs">
                             <div className="flex justify-between items-center">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 tracking-widest">가스 구분</span>
                               <span className="font-bold text-stone-800 dark:text-stone-300">{sch.gasType || '-'}</span>
                             </div>
                             <div className="flex justify-between items-start">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mt-0.5 tracking-widest">공사/입고</span>
                               <div className="text-right font-bold text-stone-700 dark:text-stone-400">
                                 <div>S: {sch.constructionStart || '-'} / E: {sch.constructionEnd || '-'}</div>
                                 <div className="mt-0.5">🔥: {sch.ovenIn || '-'} / 📦: {sch.initialStockIn || '-'}</div>
                               </div>
                             </div>
                             <div className="flex justify-between items-start">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mt-0.5 tracking-widest">사전/본 교육</span>
                               <div className="text-right">
                                 <div className="font-bold text-stone-800 dark:text-stone-300">{sch.preTrainingStart || '-'} ({sch.preTrainingDays || 0}일)</div>
                                 <div className="text-[10px] text-stone-400 mb-0.5">📍 {sch.preTrainingLocation || '-'}</div>
                                 <div className="font-bold text-stone-700 dark:text-stone-400">본: {sch.trainingStart || '-'} ~ {sch.trainingEnd || '-'}</div>
                               </div>
                             </div>
                             <div className="flex justify-between items-center border-t border-stone-300 dark:border-stone-700 pt-3 mt-3">
                               <span className="text-[11px] text-stone-500 dark:text-stone-400 font-bold tracking-widest">오픈일</span>
                               <span className="text-base font-black text-rose-700 tracking-tighter">{sch.openDate || '-'}</span>
                             </div>
                          </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>

              {!showArchived && (
                <div className="pb-10">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3">공정 타임라인 (Gantt)</h3>
                   <ScheduleTimeline schedules={filteredSchedules} viewStartDate={timelineDates.start} viewEndDate={timelineDates.end} />
                </div>
              )}
           </div>
        )}

        {showForm && (
          <ScheduleFormModal initial={editingData || {}} teams={teams} schedules={schedules} processSettings={processSettings} onSave={handleSaveSchedule} onClose={() => { setShowForm(false); setEditingData(null); }} />
        )}

        {showTeamSettings && (
          <TeamSettingsModal brandId={brandId} onClose={() => setShowTeamSettings(false)} />
        )}

        {showProcessMaster && (
          <ProcessMasterModal
            brandId={brandId}
            onClose={() => setShowProcessMaster(false)}
            onSaved={(settings) => setProcessSettings(settings)}
          />
        )}
    </div>
  );
}
