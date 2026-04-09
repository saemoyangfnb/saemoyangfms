import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { FranchiseSchedule, TeamSetting, BrandId } from '../../types';
import { Plus, Search, FileDown, Settings, CheckCircle2, Circle, Eye, EyeOff, X } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import Papa from 'papaparse';

// Subcomponents
import { ScheduleTimeline } from './ScheduleTimeline';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';
import { TeamSettingsModal } from './TeamSettingsModal';

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
  
  const [hoveredTeam, setHoveredTeam] = useState<{ name: string, members: any[], x: number, y: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, [brandId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schSnap, teamSnap] = await Promise.all([
        getDocs(collection(db, 'franchise_schedules')),
        getDocs(collection(db, 'team_settings'))
      ]);

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
           <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             오픈 일정 관리
             <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 text-xs px-2 py-0.5 rounded-full font-bold">Auto</span>
           </h1>
           <p className="text-sm text-slate-500 mt-1">공사 기간 입력 시 프로세스가 자동 계산됩니다.</p>
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowTeamSettings(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors">
               <Settings size={15} /> 팀/권역 설정
            </button>
            <button onClick={() => { setEditingData({}); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-bold">
               <Plus size={15} /> 신규 일정 등록
            </button>
         </div>
       </div>

       <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
         <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
               <button onClick={() => setMonthsView(1)} className={`px-2 py-1 text-xs font-bold rounded ${monthsView === 1 ? 'bg-white shadow-sm' : ''}`}>1개월</button>
               <button onClick={() => setMonthsView(2)} className={`px-2 py-1 text-xs font-bold rounded ${monthsView === 2 ? 'bg-white shadow-sm' : ''}`}>2개월</button>
            </div>
            
            <div className="flex items-center gap-1 font-bold ml-4">
               <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>&lt;</button>
               <span className="text-sm px-1">{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</span>
               <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>&gt;</button>
               <button className="ml-1 text-[10px] text-red-500 font-bold" onClick={() => setCurrentMonth(new Date())}>오늘</button>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <select className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border rounded-lg" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">전체 팀</option>
              {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="매장명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border" />
            </div>
         </div>
       </div>

       {loading ? (
          <div className="py-20 text-center text-slate-400 font-bold">불러오는 중...</div>
       ) : (
          <div className="flex flex-col gap-10">
              <div className={`grid grid-cols-1 ${monthsView === 2 ? 'xl:grid-cols-2' : ''} gap-6 items-start`}>
                <ScheduleCalendar 
                   schedules={filteredSchedules}
                   currentMonth={currentMonth}
                   teams={teams}
                   onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                   onScheduleUpdate={async (id, data) => { await updateDoc(doc(db, 'franchise_schedules', id), data); fetchData(); }}
                />
                {monthsView === 2 && (
                  <ScheduleCalendar 
                     schedules={filteredSchedules}
                     currentMonth={new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)}
                     teams={teams}
                     onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                     onScheduleUpdate={async (id, data) => { await updateDoc(doc(db, 'franchise_schedules', id), data); fetchData(); }}
                  />
                )}
              </div>
            
              <div>
                 <div className="flex items-center justify-between mb-3">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200">
                     {showArchived ? '보관된 오픈 완료 매장' : '진행중인 매장 목록'} ({filteredSchedules.length}건)
                   </h3>
                   <button onClick={() => setShowArchived(!showArchived)} className="text-xs px-3 py-1.5 rounded-lg border font-bold">
                     {showArchived ? '진행중인 매장 보기' : '오픈완료 보관함'}
                   </button>
                 </div>
                 
                 <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                       <thead className="bg-slate-50 dark:bg-slate-800/50 border-b text-slate-500 text-xs">
                         <tr>
                           <th className="p-3 w-10">노출</th>
                           <th className="p-3">상호명 및 호수</th>
                           <th className="p-3 text-center">진행 관리</th>
                           <th className="p-3">가스</th>
                           <th className="p-3">공사/입고일</th>
                           <th className="p-3">사전교육 정보</th>
                           <th className="p-3">본사 교육</th>
                           <th className="p-3">오픈일</th>
                           <th className="p-3 w-20 text-center">삭제</th>
                         </tr>
                       </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {filteredSchedules.map(sch => (
                          <tr key={sch.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${sch.archived ? 'opacity-50' : ''}`}>
                            <td className="p-3">
                               <button 
                                 onClick={() => { updateDoc(doc(db, 'franchise_schedules', sch.id), { showInCalendar: sch.showInCalendar === false }); fetchData(); }}
                                 className={`p-1 rounded transition-colors ${sch.showInCalendar !== false ? 'text-blue-500 bg-blue-50' : 'text-slate-300 bg-slate-100'}`}
                                 title={sch.showInCalendar !== false ? '달력 노출 중' : '기능 숨김'}
                               >
                                  {sch.showInCalendar !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                               </button>
                            </td>
                            <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                               <button onClick={() => { setEditingData(sch); setShowForm(true); }} className="hover:underline flex items-center gap-3">
                                 <div className={`w-3 h-3 rounded-full flex-shrink-0 bg-${sch.colorCode || 'slate'}-500 shadow-sm`} />
                                 <div className="flex flex-col items-start leading-tight">
                                   <span className="text-sm">{sch.storeName}</span>
                                   <span className="text-[10px] text-slate-400">{sch.storeNumber} / {sch.team || '팀 미정'}</span>
                                 </div>
                               </button>
                            </td>
                             <td className="p-3">
                                <div className="flex justify-center gap-1.5">
                                   {[
                                     { key: 'ovenOrder', label: '화덕' },
                                     { key: 'ownerGuide', label: '점주' },
                                     { key: 'equipmentOrder', label: '대소' },
                                     { key: 'internetOrder', label: '넷' },
                                     { key: 'initialEntry', label: '초도' }
                                   ].map(p => (
                                     <button
                                       key={p.key}
                                       onClick={() => handleToggleProgress(sch.id, p.key as any, sch.progressCheck?.[p.key as keyof FranchiseSchedule['progressCheck']] || false)}
                                       className={`flex flex-col items-center gap-0.5 p-1 rounded-md transition-colors ${sch.progressCheck?.[p.key as keyof typeof sch.progressCheck] ? 'text-blue-600 bg-blue-50' : 'text-slate-300'}`}
                                       title={p.label}
                                     >
                                        <CheckCircle2 size={12} className={sch.progressCheck?.[p.key as keyof typeof sch.progressCheck] ? '' : 'opacity-20'} />
                                        <span className="text-[8px] font-bold">{p.label}</span>
                                     </button>
                                   ))}
                                </div>
                             </td>
                             <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">{sch.gasType || '미등록'}</td>
                             <td className="p-3 text-[10px] text-slate-500">
                                <div>S: {sch.constructionStart || '-'} / E: {sch.constructionEnd || '-'}</div>
                                <div>🔥: {sch.ovenIn || '-'} / 📦: {sch.initialStockIn || '-'}</div>
                             </td>
                             <td className="p-3 text-[10px]">
                                <div className="font-bold">{sch.preTrainingStart || '-'} ({sch.preTrainingDays || 0}일)</div>
                                <div className="text-slate-400">📍 {sch.preTrainingLocation || '-'}</div>
                             </td>
                             <td className="p-3 text-[10px]">{sch.trainingStart || '-'}</td>
                             <td className="p-3 text-sm font-bold text-rose-500 font-mono">{sch.openDate}</td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleDeleteSchedule(sch.id)} className="text-red-300 hover:text-red-500"><X size={16} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
          <ScheduleFormModal initial={editingData || {}} teams={teams} schedules={schedules} onSave={handleSaveSchedule} onClose={() => { setShowForm(false); setEditingData(null); }} />
        )}

        {showTeamSettings && (
          <TeamSettingsModal brandId={brandId} onClose={() => setShowTeamSettings(false)} />
        )}
    </div>
  );
}
