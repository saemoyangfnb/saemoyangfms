import React, { useState, useEffect, useRef } from 'react';
import { FranchiseSchedule, TeamSetting, WorkItem } from '../../types';
import { isDateInRange, addDays, computeWorkItemDates } from '../../utils';
import { Calendar as CalendarIcon, List, CheckSquare, Pencil } from 'lucide-react';

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
  workItems?: WorkItem[]; // taskItems에서 workItems로 이름 변경 및 통합
  onScheduleUpdate: (id: string, updates: Partial<FranchiseSchedule>, logDetails?: string) => Promise<void>;
  onTaskOffsetUpdate?: (scheduleId: string, taskItemId: string, diffDays: number, newStartDate: string) => Promise<void>;
  onEditStore?: (id: string, workItemId?: string) => void;
  onOpenForm?: (id: string) => void;
  phaseVisibility?: Record<string, boolean>;
  selectedDeptFilter?: string;
}

export function ScheduleCalendar({ schedules, currentMonth, teams, workItems = [], onScheduleUpdate, onTaskOffsetUpdate, onEditStore, onOpenForm, phaseVisibility = {}, selectedDeptFilter = 'all' }: Props) {
  const todayStr = new Date().toISOString().split('T')[0];

  //  모바일(화면 너비 768px 미만)일 경우 기본값을 '리스트 뷰'로 설정
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'calendar'
  );

  // 팝오버 state
  const [popover, setPopover] = useState<{ ev: any; x: number; y: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null);
    };
    const closeKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopover(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', closeKey); };
  }, [popover]);
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

      const addEv = (id: string, name: string, start: string, end: string, depts: string | string[] | undefined, isCustom: boolean = false, isLocked: boolean = false, isIncomplete: boolean = false) => {
        if (!start) return;
        
        if (selectedDeptFilter !== 'all' && depts) {
          const deptList = Array.isArray(depts) ? depts : [depts as string];
          if (!deptList.includes(selectedDeptFilter)) return;
        }

        const effectiveEnd = end || start;
        if (!isDateInRange(dateStr, start, effectiveEnd)) return;
        
        // 중복 방지: 이미 동일한 매장의 동일한 이름 이벤트가 해당 날짜에 등록되었는지 확인
        if (events.some(e => e.scheduleId === s.id && e.phaseName === name)) return;

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
          isCustom,
          isLocked,
          isIncomplete
        });
      };

      // task 카테고리 항목만 캘린더에 표시 (schedule_date는 anchor 계산용, 중복 방지)
      const computedDates = computeWorkItemDates(workItems, s);
      workItems.forEach(wt => {
        if (wt.category !== 'task' || wt.isArchived) return;
        // 부서 필터 선택 시 calendarVisible 무시 / 미선택 시 calendarVisible === false 제외
        if (selectedDeptFilter === 'all' && wt.calendarVisible === false) return;
        const d = computedDates[wt.id];
        if (d && isDateInRange(dateStr, d.start, d.end)) {
          const taskStatus = (s.checklistData as any)?.[wt.id]?.status ?? 0;
          // 기간 초과(오늘 > 종료일) + 미완료일 때만 overdue
          const isOverdue = taskStatus < 3 && todayStr > d.end;
          addEv(wt.id, wt.text, d.start, d.end, wt.departmentIds || (wt.departmentId ? [wt.departmentId] : []), false, !!wt.anchorLocked, isOverdue);
        }
      });

      // 수동으로 추가한 커스텀 단계는 유지
      if (s.customPhases) {
        s.customPhases.forEach(cp => {
          addEv(cp.id, cp.name, cp.startDate, cp.endDate || cp.startDate, 'custom');
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
      const workItem = workItems.find(wi => wi.id === phaseId);
      // anchorLocked 항목은 드래그 이동 불가
      if (workItem?.anchorLocked) return;
      if (workItem && onTaskOffsetUpdate) {
        await onTaskOffsetUpdate(scheduleId, phaseId, diffDays, droppedDate);
        return;
      }
    }

    const logDetails = `[${schedule.storeName}] ${phaseName} 일정 변경 (${draggedDate} → ${droppedDate} / ${diffDays > 0 ? `+${diffDays}일 연기` : `${Math.abs(diffDays)}일 앞당김`})`;
    if (Object.keys(updates).length > 0) {
      await onScheduleUpdate(scheduleId, updates, logDetails);
    }
  };

  const openPopover = (e: React.MouseEvent, ev: any) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverHeight = 120;
    const y = rect.bottom + 6 + popoverHeight > window.innerHeight
      ? rect.top - popoverHeight - 6
      : rect.bottom + 6;
    setPopover({ ev, x: rect.left, y });
  };

  const weeks = [];
  for(let i=0; i<cells.length; i+=7) {
    weeks.push(cells.slice(i, i+7));
  }

  const agendaDays = cells.filter(cell => cell.isCurrentMonth && getEventsForDate(cell.fullDate).length > 0);

  return (
    <div className="relative flex flex-col h-full">
      {/* 뷰 모드 토글 */}
      <div className="flex justify-end mb-2 gap-2">
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
                        <div key={idx} onClick={(e) => openPopover(e, ev)} className="relative p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-all group overflow-hidden">
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
                  <div key={wIdx} className="grid grid-cols-7 min-h-[140px] border-b-2 border-slate-200 dark:border-slate-700">
                    {week.map((cell, cIdx) => {
                      const cellEvents = getEventsForDate(cell.fullDate);
                      const evMap = cellEvents.reduce((acc, ev) => { acc[`${ev.scheduleId}_${ev.phaseId}`] = ev; return acc; }, {} as Record<string, any>);
                      const isToday = cell.fullDate === todayStr;

                      return (
                        <div
                          key={cIdx}
                          className={`relative py-1 flex flex-col border-r-2 border-slate-200 dark:border-slate-700 last:border-r-0 ${!cell.isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-800/20 opacity-50' : ''} ${isToday ? 'ring-2 ring-rose-500 ring-inset bg-rose-50/30 dark:bg-rose-900/20 z-10' : ''}`}
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
                                return <div key={`spacer-${trackKey}-${tIdx}`} className="h-[38px]" />;
                              }

                              const isWeekStart = cIdx === 0;
                              const showText = ev.isActuallyStart || isWeekStart;

                              const roundedCls = (ev.isActuallyStart ? 'rounded-l-md' : '') + ' ' + (ev.isActuallyEnd ? 'rounded-r-md' : '');

                              return (
                                <div
                                  key={tIdx}
                                  onClick={(e) => openPopover(e, ev)}
                                  className={`relative h-[38px] flex items-center ${ev.isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:brightness-90'} ${ev.bgClass} ${roundedCls} z-10 transition-colors ${selectedDeptFilter !== 'all' && ev.isIncomplete ? 'border-2 border-white/70 animate-pulse ring-2 ring-rose-400 ring-offset-1' : 'border-y border-black/10'}`}
                                  title={ev.isLocked ? `[고정] ${ev.storeName} · ${ev.phaseName}` : `[${ev.team}] ${ev.storeName} · ${ev.phaseName}${selectedDeptFilter !== 'all' && ev.isIncomplete ? ' ⚠ 미완료' : ''}`}
                                  draggable={!ev.isLocked}
                                  onDragStart={ev.isLocked ? undefined : (e) => handleDragStart(e, ev.scheduleId, ev.phaseId, ev.phaseName, cell.fullDate, ev.isCustom)}
                                >
                                  {showText && (
                                    <div className={`absolute inset-y-0 flex items-center px-1.5 pointer-events-none z-20 ${cIdx === 6 ? 'right-0' : 'left-0'}`}>
                                      <span className={`text-slate-900 dark:text-white font-black text-[11px] sm:text-[13px] leading-tight drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] whitespace-nowrap`}>
                                        {ev.storeName} <span className="opacity-80">{ev.phaseName}</span>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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

      {/* 클릭 팝오버 */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-[999] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: popover.x, top: popover.y }}
        >
          <p className="px-3 py-1.5 text-[11px] font-black text-slate-400 dark:text-slate-500 truncate border-b border-slate-100 dark:border-slate-700 mb-1">
            {popover.ev.storeName}
          </p>
          <button
            onClick={() => { setPopover(null); if (onEditStore) onEditStore(popover.ev.scheduleId, popover.ev.phaseId); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <CheckSquare size={14} className="text-indigo-500" /> 체크리스트 열기
          </button>
          <button
            onClick={() => { setPopover(null); if (onOpenForm) onOpenForm(popover.ev.scheduleId); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Pencil size={14} className="text-amber-500" /> 매장 정보 편집
          </button>
        </div>
      )}
    </div>
  );
}
