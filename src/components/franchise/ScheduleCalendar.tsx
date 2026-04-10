import React, { useState } from 'react';
import { FranchiseSchedule, TeamSetting } from '../../types';
import { isDateInRange, addDays } from '../../utils';

interface Props {
  schedules: FranchiseSchedule[];
  currentMonth: Date;
  teams: TeamSetting[];
  onScheduleUpdate: (id: string, updates: Partial<FranchiseSchedule>) => Promise<void>;
  onEditStore?: (id: string) => void;
  phaseVisibility?: Record<string, boolean>; // 공정 마스터 캘린더 표기 설정
}

export function ScheduleCalendar({ schedules, currentMonth, teams, onScheduleUpdate, onEditStore, phaseVisibility = {} }: Props) {
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
      // 매장별 고유 색상 또는 팀 색상 (Tailwind 클래스 생성)
      const colorCode = s.colorCode || 'slate';
      const teamBg = `bg-${colorCode}-500`;

      const addEv = (id: string, name: string, start: string, end: string) => {
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
          color: teamBg,
          isActuallyStart: !isDateInRange(yesterday, start, end),
          isActuallyEnd: !isDateInRange(tomorrow, start, end),
          duration,
          fullDate: dateStr
        });
      };

      if (isPhaseVisible('constructionStart') && s.constructionStart === dateStr) addEv('constructionStart', '시작', s.constructionStart, s.constructionStart);
      if (isPhaseVisible('constructionEnd') && s.constructionEnd === dateStr) addEv('constructionEnd', '종료', s.constructionEnd, s.constructionEnd);

      if (isPhaseVisible('oven')) addEv('oven', '화덕', s.ovenIn, s.ovenEnd);
      if (isPhaseVisible('burner') && s.burnerIn === dateStr) addEv('burner', '화구', s.burnerIn, s.burnerIn);
      if (isPhaseVisible('equipment') && s.equipmentIn === dateStr) addEv('equipment', '장비', s.equipmentIn, s.equipmentIn);
      if (isPhaseVisible('guide') && s.ownerGuideStart === dateStr) addEv('guide', '안내', s.ownerGuideStart, s.ownerGuideStart);

      if (isPhaseVisible('preTraining')) addEv('preTraining', '사전', s.preTrainingStart, s.preTrainingEnd);
      if (isPhaseVisible('training')) addEv('training', '교육', s.trainingStart, s.trainingEnd);
      if (isPhaseVisible('initialStock')) addEv('initialStock', '초도', s.initialStockIn, s.initialStockEnd);

      if (isPhaseVisible('open') && s.openDate === dateStr) {
        addEv('open', '오픈', s.openDate, s.openDate);
      }

      if (s.customPhases) {
        s.customPhases.forEach(cp => {
          addEv(cp.id, cp.name, cp.startDate, cp.endDate || cp.startDate);
        });
      }
    });

    return events;
  };

  const handleDragStart = (e: React.DragEvent, scheduleId: string, phaseId: string, draggedDate: string, isCustom: boolean) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ scheduleId, phaseId, draggedDate, isCustom }));
  };

  const handleDrop = async (e: React.DragEvent, droppedDate: string) => {
    e.preventDefault();
    if (!droppedDate) return;
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;
    
    let parsed: any;
    try { parsed = JSON.parse(dragData); } catch(err) { return; }

    const { scheduleId, phaseId, draggedDate, isCustom } = parsed;
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

    if (Object.keys(updates).length > 0) {
      await onScheduleUpdate(scheduleId, updates);
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

  return (
    <div className="relative">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`p-3 text-center text-sm font-bold ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'}`}>
               {d}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col">
          {weeks.map((week, wIdx) => {
            const weekEvents = week.map(cell => getEventsForDate(cell.fullDate)).flat();
            const uniqueTracks: string[] = Array.from(new Set(weekEvents.map(e => `${e.scheduleId}_${e.phaseId}`))).sort() as string[];

            return (
              <div key={wIdx} className="grid grid-cols-7 min-h-[140px] border-b border-slate-100 dark:border-slate-800">
                {week.map((cell, cIdx) => {
                  const cellEvents = getEventsForDate(cell.fullDate);
                  const evMap = cellEvents.reduce((acc, ev) => { acc[`${ev.scheduleId}_${ev.phaseId}`] = ev; return acc; }, {} as Record<string, any>);
                  
                  return (
                    <div 
                      key={cIdx} 
                      className={`relative py-1 border-r border-slate-200 dark:border-slate-800 flex flex-col ${!cell.isCurrentMonth ? 'bg-slate-50 dark:bg-slate-800/20 opacity-50' : ''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, cell.fullDate)}
                    >
                      <div className={`text-right px-2 text-xs font-bold mb-1 ${cell.isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>{cell.day}</div>
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
                               className={`relative text-[12px] h-[28px] flex items-center shadow-none cursor-pointer hover:brightness-95 ${ev.color} ${roundedCls} ${borderCls} ${leftBorder} ${rightBorder} transition-all leading-tight`} 
                               title={`[${ev.team}][${ev.storeName}][${ev.phaseName}]`}
                               draggable
                               onDragStart={(e) => handleDragStart(e, ev.scheduleId, ev.phaseId, cell.fullDate, false)}
                             >
                                {showStartText && (
                                  <div className="absolute left-0 top-0 bottom-0 flex items-center pl-2 whitespace-nowrap z-10 pointer-events-none overflow-visible">
                                    <span className="text-white font-bold drop-shadow-md text-[11px] tracking-tight">
                                      [{ev.team}][{ev.storeName}][{ev.phaseName}]
                                    </span>
                                  </div>
                                )}
                                {showEndText && !showStartText && (
                                  <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 whitespace-nowrap z-10 pointer-events-none overflow-visible">
                                    <span className="text-white font-bold drop-shadow-md text-[11px] tracking-tight">
                                      [{ev.phaseName}]
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
    </div>
  );
}
