import React, { useState } from 'react';
import { FranchiseSchedule, TeamSetting, Department, DepartmentTask, DepartmentTaskStatus } from '../../types';
import { isDateInRange, addDays } from '../../utils';
import { Calendar as CalendarIcon, List, CheckCircle2, Clock, AlertCircle, Ban, ListTodo } from 'lucide-react';

const TASK_STATUS_ICON: Record<DepartmentTaskStatus, React.ReactNode> = {
  pending:     <Clock size={9} className="text-stone-400" />,
  in_progress: <AlertCircle size={9} className="text-blue-400" />,
  done:        <CheckCircle2 size={9} className="text-green-500" />,
  blocked:     <Ban size={9} className="text-red-400" />,
};

// 💡 [Tailwind 완벽 해결] Tailwind 스캐너가 인식할 수 있도록 완성된 클래스명을 직접 매핑
const BG_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500',
  purple: 'bg-purple-500', cyan: 'bg-cyan-500', pink: 'bg-pink-500', indigo: 'bg-indigo-500',
  violet: 'bg-violet-500', fuchsia: 'bg-fuchsia-500', orange: 'bg-orange-500', teal: 'bg-teal-500',
  sky: 'bg-sky-500', lime: 'bg-lime-500', yellow: 'bg-yellow-500', red: 'bg-red-500',
  stone: 'bg-stone-500', zinc: 'bg-zinc-500', slate: 'bg-slate-500', neutral: 'bg-neutral-500'
};

interface Props {
  schedules: FranchiseSchedule[];
  currentMonth: Date;
  teams: TeamSetting[];
  onScheduleUpdate: (id: string, updates: Partial<FranchiseSchedule>, logDetails?: string) => Promise<void>;
  onEditStore?: (id: string) => void;
  phaseVisibility?: Record<string, boolean>; // 공정 마스터 캘린더 표기 설정
  tasks?: DepartmentTask[];
  departments?: Department[];
}

export function ScheduleCalendar({ schedules, currentMonth, teams, onScheduleUpdate, onEditStore, phaseVisibility = {}, tasks = [], departments = [] }: Props) {
  // 💡 모바일(화면 너비 768px 미만)일 경우 기본값을 '리스트 뷰'로 설정
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'calendar'
  );
  const [showTasks, setShowTasks] = useState(true);
  const isPhaseVisible = (id: string) => phaseVisibility[id] !== false; // 기본: 표시
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  
  const cells = [];
  
  for (let i = 0; i < firstDay; i++) {
    const prevD = new Date(year, month, 0); 
    const pYear = prevD.getFullYear();
    const pMonth = prevD.getMonth() + 1; 
    const prDate = `${pYear}-${String(pMonth).padStart(2, '0')}-${String(prevMonthDays - firstDay + i + 1).padStart(2, '0')}`;
    cells.push({ day: prevMonthDays - firstDay + i + 1, isCurrentMonth: false, fullDate: prDate });
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
    const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    cells.push({ day: i, isCurrentMonth: true, fullDate });
  }
  
  const remaining = 42 - cells.length; 
  for (let i = 1; i <= remaining; i++) {
    const nextD = new Date(year, month + 1, 1);
    const nYear = nextD.getFullYear();
    const nMonth = nextD.getMonth() + 1;
    const neDate = `${nYear}-${String(nMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    cells.push({ day: i, isCurrentMonth: false, fullDate: neDate });
  }

  const getDayDiff = (d1: string, d2: string) => {
    if (!d1 || !d2) return 0;
    return Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const getEventsForDate = (dateStr: string) => {
    if (!dateStr) return [];
    
    const events: any[] = [];
    
    // 숨김 처리된 매장은 제외
    const visibleSchedules = schedules.filter(s => s.showInCalendar !== false);

    visibleSchedules.forEach(s => {
      const teamLabel = s.team || '미지정';
      const storeLabel = s.storeName;
      const colorCode = s.colorCode || 'slate';
      const bgClass = BG_CLASSES[colorCode] || 'bg-slate-500';

      const addEv = (id: string, name: string, start: string, end: string, isCustom: boolean = false) => {
        if (!start) return;
        const effectiveEnd = end || start; // end 미입력 시 start와 동일한 1일짜리 이벤트
        if (!isDateInRange(dateStr, start, effectiveEnd)) return;
        // eslint-disable-next-line no-param-reassign
        end = effectiveEnd;

        const yesterday = addDays(dateStr, -1);
        const tomorrow = addDays(dateStr, 1);
        const duration = getDayDiff(start, end);

        events.push({
          scheduleId: s.id,
          phaseId: id,
          phaseName: name,
          storeName: storeLabel,
          team: teamLabel,
          bgClass: bgClass,
          isActuallyStart: !isDateInRange(yesterday, start, end),
          isActuallyEnd: !isDateInRange(tomorrow, start, end),
          duration,
          fullDate: dateStr,
          isCustom
        });
      };

      if (isPhaseVisible('constructionStart') && s.constructionStart === dateStr) addEv('constructionStart', '시작', s.constructionStart, s.constructionStart);
      if (isPhaseVisible('constructionEnd') && s.constructionEnd === dateStr) addEv('constructionEnd', '종료', s.constructionEnd, s.constructionEnd);

      if (isPhaseVisible('oven')) addEv('oven', '화덕', s.ovenIn, s.ovenEnd);
      if (isPhaseVisible('burner') && s.burnerIn === dateStr) addEv('burner', '화구', s.burnerIn, s.burnerIn);
      if (isPhaseVisible('equipment') && s.equipmentIn === dateStr) addEv('equipment', '화구입고', s.equipmentIn, s.equipmentIn);
      if (isPhaseVisible('guide') && s.ownerGuideStart === dateStr) addEv('guide', '안내', s.ownerGuideStart, s.ownerGuideStart);

      if (isPhaseVisible('preTraining')) addEv('preTraining', '사전', s.preTrainingStart, s.preTrainingEnd);
      if (isPhaseVisible('training')) addEv('training', '교육', s.trainingStart, s.trainingEnd);
      if (isPhaseVisible('initialStock')) addEv('initialStock', '초도', s.initialStockIn, s.initialStockEnd);

      if (isPhaseVisible('open') && s.openDate === dateStr) {
        addEv('open', '오픈', s.openDate, s.openDate);
      }

      if (s.customPhases) {
        s.customPhases.forEach(cp => {
          addEv(cp.id, cp.name, cp.startDate, cp.endDate || cp.startDate, true);
        });
      }
    });

    return events;
  };

  const handleDragStart = (e: React.DragEvent, scheduleId: string, phaseId: string, phaseName: string, draggedDate: string, isCustom: boolean) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ scheduleId, phaseId, phaseName, draggedDate, isCustom }));
  };

  const handleDrop = async (e: React.DragEvent, droppedDate: string) => {
    e.preventDefault();
    if (!droppedDate) return;
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;
    
    let parsed: any;
    try { parsed = JSON.parse(dragData); } catch(err) { return; }

    const { scheduleId, phaseId, phaseName, draggedDate, isCustom } = parsed;
    if (draggedDate === droppedDate) return;

    const diffTime = new Date(droppedDate).getTime() - new Date(draggedDate).getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    let updates: Partial<FranchiseSchedule> = {};

    if (isCustom) {
       const newArr = [...(schedule.customPhases || [])];
       const idx = newArr.findIndex(p => p.id === phaseId);
       if (idx > -1) {
          newArr[idx] = { 
            ...newArr[idx], 
            startDate: addDays(newArr[idx].startDate, diffDays),
            endDate: newArr[idx].endDate ? addDays(newArr[idx].endDate, diffDays) : ''
          };
          updates.customPhases = newArr;
       }
    } else {
      if (phaseId === 'constructionStart') updates.constructionStart = addDays(schedule.constructionStart, diffDays);
      else if (phaseId === 'constructionEnd') updates.constructionEnd = addDays(schedule.constructionEnd, diffDays);
      else if (phaseId === 'oven') { updates.ovenIn = addDays(schedule.ovenIn, diffDays); updates.ovenEnd = addDays(schedule.ovenEnd, diffDays); }
      else if (phaseId === 'burner') updates.burnerIn = addDays(schedule.burnerIn, diffDays);
      else if (phaseId === 'equipment') updates.equipmentIn = addDays(schedule.equipmentIn, diffDays);
      else if (phaseId === 'guide') updates.ownerGuideStart = addDays(schedule.ownerGuideStart, diffDays);
      else if (phaseId === 'preTraining') { updates.preTrainingStart = addDays(schedule.preTrainingStart, diffDays); updates.preTrainingEnd = addDays(schedule.preTrainingEnd, diffDays); }
      else if (phaseId === 'training') { updates.trainingStart = addDays(schedule.trainingStart, diffDays); updates.trainingEnd = addDays(schedule.trainingEnd, diffDays); }
      else if (phaseId === 'initialStock') { updates.initialStockIn = addDays(schedule.initialStockIn, diffDays); updates.initialStockEnd = addDays(schedule.initialStockEnd, diffDays); }
      else if (phaseId === 'open') updates.openDate = addDays(schedule.openDate, diffDays);
    }

    const logDetails = `[${schedule.storeName}] ${phaseName} 일정 변경 (${draggedDate} → ${droppedDate} / ${diffDays > 0 ? `+${diffDays}일 연기` : `${Math.abs(diffDays)}일 앞당김`})`;
    if (Object.keys(updates).length > 0) {
      await onScheduleUpdate(scheduleId, updates, logDetails);
    }
  };

  const openEditPopup = (e: React.MouseEvent, ev: any) => {
     e.stopPropagation();
     if (onEditStore) onEditStore(ev.scheduleId);
  };

  const weeks = [];
  for(let i=0; i<cells.length; i+=7) {
    weeks.push(cells.slice(i, i+7));
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const getTasksForDate = (dateStr: string): DepartmentTask[] => {
    if (!tasks.length) return [];
    return tasks.filter(t => t.dueDate === dateStr);
  };

  const agendaDays = cells.filter(cell => cell.isCurrentMonth && (getEventsForDate(cell.fullDate).length > 0 || (showTasks && getTasksForDate(cell.fullDate).length > 0)));

  return (
    <div className="relative flex flex-col h-full">
      {/* 뷰 모드 토글 */}
      <div className="flex items-center justify-between mb-2">
        {tasks.length > 0 ? (
          <button
            onClick={() => setShowTasks(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border ${showTasks ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}
          >
            <ListTodo size={12} />
            태스크 {showTasks ? '표시중' : '숨김'}
          </button>
        ) : <div />}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
          <button onClick={() => setViewMode('calendar')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} title="달력 보기">
            <CalendarIcon size={14} />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} title="리스트 보기">
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {viewMode === 'list' ? (
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {agendaDays.length === 0 ? (
              <div className="text-center text-slate-400 py-10 font-medium">이번 달 일정이 없습니다.</div>
            ) : (
              agendaDays.map(cell => {
                const events = getEventsForDate(cell.fullDate);
                const dateObj = new Date(cell.fullDate);
                const dayName = ['일','월','화','수','목','금','토'][dateObj.getDay()];
                const isToday = cell.fullDate === todayStr;
                
                return (
                  <div key={cell.fullDate} className="flex gap-3 mb-4 last:mb-0">
                    <div className="w-10 shrink-0 flex flex-col items-center pt-1">
                      <span className={`text-[10px] font-bold ${isToday ? 'text-blue-500' : 'text-slate-400'}`}>{dayName}</span>
                      <span className={`text-lg font-black ${isToday ? 'text-blue-500' : 'text-slate-700 dark:text-slate-300'}`}>{cell.day}</span>
                    </div>
                    <div className="flex-1 space-y-2 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-2">
                      {events.map((ev, idx) => (
                        <div key={idx} onClick={(e) => openEditPopup(e, ev)} className="relative p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-all group overflow-hidden">
                          {/* 좌측 강조 포인트 선 */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${ev.bgClass}`} />
                          <div className="pl-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${ev.bgClass}`}>{ev.phaseName}</span>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{ev.team}</span>
                              </div>
                              {ev.isActuallyStart && ev.duration > 1 && <span className="text-[10px] font-semibold text-slate-400">{ev.duration}일간</span>}
                            </div>
                            <div className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                              {ev.storeName}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* 태스크 목록 (리스트뷰) */}
                      {showTasks && getTasksForDate(cell.fullDate).map(task => {
                        const dept = departments.find(d => d.id === task.departmentId);
                        const sch = schedules.find(s => s.id === task.scheduleId);
                        const isOverdue = task.status !== 'done' && task.dueDate < todayStr;
                        return (
                          <div key={task.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${isOverdue ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-300' : task.status === 'done' ? 'bg-slate-50 border-slate-200 dark:bg-slate-800/30 dark:border-slate-700 text-slate-400 line-through' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${dept?.color || 'bg-slate-400'}`} />
                            <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">{sch?.storeName}</span>
                            <span className="truncate">{task.title}</span>
                            <span className="ml-auto shrink-0">{TASK_STATUS_ICON[task.status]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="relative flex flex-col">
            {/* 💡 캘린더 배경에 월 숫자 희미하게 표시 (워터마크) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none">
              <span className="text-[200px] sm:text-[300px] md:text-[350px] font-black text-slate-200 dark:text-slate-800 opacity-60">
                {month + 1}월
              </span>
            </div>
            
            {/* 💡 개선 1. 상단 요일 고정(Sticky) */}
            <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 shadow-sm">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className={`p-3 text-center text-sm font-bold ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'}`}>
                  {d}
                </div>
              ))}
            </div>
            
            <div className="relative z-10 flex flex-col">
              {weeks.map((week, wIdx) => {
                const weekEvents = week.map(cell => getEventsForDate(cell.fullDate)).flat();
                const uniqueTracks: string[] = Array.from(new Set(weekEvents.map(e => `${e.scheduleId}_${e.phaseId}`))).sort() as string[];

                return (
                  <div key={wIdx} className="grid grid-cols-7 min-h-[140px] border-b border-slate-100 dark:border-slate-800">
                    {week.map((cell, cIdx) => {
                      const cellEvents = getEventsForDate(cell.fullDate);
                      const evMap = cellEvents.reduce((acc, ev) => { acc[`${ev.scheduleId}_${ev.phaseId}`] = ev; return acc; }, {} as Record<string, any>);
                      const isToday = cell.fullDate === todayStr;
                      
                      return (
                        <div 
                          key={cIdx} 
                          className={`relative py-1 flex flex-col ${!cell.isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-800/20 opacity-50' : ''} ${isToday ? 'ring-2 ring-rose-500 ring-inset bg-rose-50/30 dark:bg-rose-900/20 z-10' : 'border-r border-slate-200 dark:border-slate-800'}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDrop(e, cell.fullDate)}
                        >
                          <div className="text-right px-1 pt-1 mb-1 flex justify-end">
                            <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold ${isToday ? 'text-rose-600 dark:text-rose-400' : cell.isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                              {cell.day}
                            </span>
                          </div>
                          <div className="flex-1 space-y-0.5 pb-1">
                            {uniqueTracks.map((trackKey, tIdx) => {
                              const ev = evMap[trackKey];
                              if (!ev) {
                                  return <div key={`spacer-${trackKey}-${tIdx}`} className="h-[28px]" />;
                              }

                              const isLongBlock = ev.duration >= 3;
                              const showStartText = ev.isActuallyStart || cIdx === 0;
                              const showEndText = isLongBlock && ev.isActuallyEnd;

                              const roundedCls = (ev.isActuallyStart ? 'rounded-l-lg' : '') + ' ' + (ev.isActuallyEnd ? 'rounded-r-lg' : '');
                              const borderCls = "border-y border-black/5";
                              const leftBorder = ev.isActuallyStart ? "border-l border-black/10" : "";
                              const rightBorder = ev.isActuallyEnd ? "border-r border-black/10" : "";

                              return (
                                <div
                                  key={tIdx}
                                  onClick={(e) => openEditPopup(e, ev)}
                                  className={`relative text-[12px] h-[28px] flex items-center shadow-none cursor-pointer hover:brightness-95 ${ev.bgClass} ${roundedCls} ${borderCls} ${leftBorder} ${rightBorder} transition-all leading-tight`}
                                  title={`[${ev.team}][${ev.storeName}][${ev.phaseName}]`}
                                  draggable
                              onDragStart={(e) => handleDragStart(e, ev.scheduleId, ev.phaseId, ev.phaseName, cell.fullDate, ev.isCustom)}
                                >
                                    {showStartText && (
                                      <div className={`absolute top-0 bottom-0 flex items-center whitespace-nowrap z-20 pointer-events-none overflow-visible ${cIdx === 6 ? 'right-0 pr-1 sm:pr-2' : 'left-0 pl-1 sm:pl-2'}`}>
                                        <span className="text-slate-900 dark:text-white font-bold dark:drop-shadow-md text-[10px] sm:text-[11px] tracking-tight">
                                          [{ev.team}][{ev.storeName}][{ev.phaseName}]
                                        </span>
                                      </div>
                                    )}
                                    {showEndText && !showStartText && (
                                      <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1 sm:pr-2 whitespace-nowrap z-20 pointer-events-none overflow-visible">
                                        <span className="text-slate-900 dark:text-white font-bold dark:drop-shadow-md text-[10px] sm:text-[11px] tracking-tight">
                                          [{ev.phaseName}]
                                        </span>
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                            {/* 태스크 표시 (캘린더뷰) */}
                            {showTasks && (() => {
                              const dayTasks = getTasksForDate(cell.fullDate);
                              if (!dayTasks.length) return null;
                              const LIMIT = 3;
                              const visible = dayTasks.slice(0, LIMIT);
                              const overflow = dayTasks.length - LIMIT;
                              return (
                                <div className="mt-0.5 space-y-0.5 px-0.5">
                                  {visible.map(task => {
                                    const dept = departments.find(d => d.id === task.departmentId);
                                    const sch = schedules.find(s => s.id === task.scheduleId);
                                    const isOverdue = task.status !== 'done' && task.dueDate < todayStr;
                                    return (
                                      <div
                                        key={task.id}
                                        title={`[${sch?.storeName || ''}] ${task.title} (${dept?.name || ''})`}
                                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] leading-none font-medium truncate ${isOverdue ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : task.status === 'done' ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 line-through' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                                      >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dept?.color || 'bg-slate-400'}`} />
                                        <span className="truncate">{sch?.storeName && <span className="font-bold mr-0.5">{sch.storeName.slice(0,3)}</span>}{task.title}</span>
                                        <span className="ml-auto shrink-0">{TASK_STATUS_ICON[task.status]}</span>
                                      </div>
                                    );
                                  })}
                                  {overflow > 0 && (
                                    <div className="text-[9px] text-slate-400 font-bold pl-1">+{overflow}개 더</div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
