import React, { useState } from 'react';
import { FranchiseSchedule, TeamSetting } from '../../types';
import { isDateInRange, addDays } from '../../utils';
import { X } from 'lucide-react';

interface Props {
  schedules: FranchiseSchedule[];
  currentMonth: Date;
  teams: TeamSetting[];
  onScheduleUpdate: (id: string, updates: Partial<FranchiseSchedule>) => Promise<void>;
}

const PRESET_COLORS = [
  { id: 'blue', bgClass: 'bg-blue-500' },
  { id: 'rose', bgClass: 'bg-rose-500' },
  { id: 'emerald', bgClass: 'bg-emerald-500' },
  { id: 'amber', bgClass: 'bg-amber-500' },
  { id: 'purple', bgClass: 'bg-purple-500' },
  { id: 'cyan', bgClass: 'bg-cyan-500' },
  { id: 'pink', bgClass: 'bg-pink-500' },
  { id: 'slate', bgClass: 'bg-slate-500' },
];

export function ScheduleCalendar({ schedules, currentMonth, teams, onScheduleUpdate }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [popupStartDate, setPopupStartDate] = useState('');
  const [popupEndDate, setPopupEndDate] = useState('');
  const [popupNotes, setPopupNotes] = useState('');

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

  const getTeamColor = (teamName: string) => {
    const t = teams.find(t => t.name === teamName);
    const colorId = t?.color || 'slate';
    return PRESET_COLORS.find(c => c.id === colorId)?.bgClass || 'bg-slate-500';
  };

  const getEventsForDate = (dateStr: string) => {
    if (!dateStr) return [];
    
    const events: any[] = [];
    schedules.forEach(s => {
      if (s.showInCalendar === false) return;
      const teamBg = getTeamColor(s.team);
      const t = `[${s.team}]`;

      const addEv = (phaseId: string, text: string, pStart: string, pEnd: string, isCustom = false) => {
        if (!pStart || !pEnd) return;
        if (isDateInRange(dateStr, pStart, pEnd)) {
          events.push({
            scheduleId: s.id, phaseId, text, color: teamBg,
            startDate: pStart, endDate: pEnd,
            isStart: dateStr === pStart, isEnd: dateStr === pEnd,
            isCustom
          });
        }
      };

      if (dateStr === s.constructionStart) events.push({ scheduleId: s.id, phaseId: 'constructionStart', text: `${t} 🚧 착공-${s.storeName}`, color: teamBg, startDate: s.constructionStart, endDate: s.constructionStart, isStart: true, isEnd: true });
      if (dateStr === s.constructionEnd) events.push({ scheduleId: s.id, phaseId: 'constructionEnd', text: `${t} ✅ 마감-${s.storeName}`, color: teamBg, startDate: s.constructionEnd, endDate: s.constructionEnd, isStart: true, isEnd: true });
      
      addEv('oven', `${t} 🔥 화덕 ${s.storeName}`, s.ovenIn, s.ovenEnd);
      addEv('initialStock', `${t} 📦 초도 ${s.storeName}`, s.initialStockIn, s.initialStockEnd);
      addEv('preTraining', `${t} 📝 사전 ${s.storeName}`, s.preTrainingStart, s.preTrainingEnd);
      addEv('training', `${t} 👨‍🏫 본교육 ${s.storeName}`, s.trainingStart, s.trainingEnd);

      if (dateStr === s.openDate) events.push({ scheduleId: s.id, phaseId: 'open', text: `${t} 🎉 오픈-${s.storeName}`, color: teamBg, startDate: s.openDate, endDate: s.openDate, isStart: true, isEnd: true });

      // 커스텀 공정 추가
      if (s.customPhases) {
        s.customPhases.forEach(cp => {
          if (!cp.startDate) return;
          if (cp.type === '단기') {
            if (dateStr === cp.startDate) {
              events.push({ scheduleId: s.id, phaseId: cp.id, text: `${t} 📌 ${cp.name}-${s.storeName}`, color: teamBg, startDate: cp.startDate, endDate: cp.startDate, isStart: true, isEnd: true, isCustom: true });
            }
          } else {
            addEv(cp.id, `${t} 📌 ${cp.name} ${s.storeName}`, cp.startDate, cp.endDate || cp.startDate, true);
          }
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
      else if (phaseId === 'initialStock') { updates.initialStockIn = addDays(schedule.initialStockIn, diffDays); updates.initialStockEnd = addDays(schedule.initialStockEnd, diffDays); }
      else if (phaseId === 'preTraining') { updates.preTrainingStart = addDays(schedule.preTrainingStart, diffDays); updates.preTrainingEnd = addDays(schedule.preTrainingEnd, diffDays); }
      else if (phaseId === 'training') { updates.trainingStart = addDays(schedule.trainingStart, diffDays); updates.trainingEnd = addDays(schedule.trainingEnd, diffDays); }
      else if (phaseId === 'open') updates.openDate = addDays(schedule.openDate, diffDays);
    }

    if (Object.keys(updates).length > 0) {
      await onScheduleUpdate(scheduleId, updates);
    }
  };

  const openEditPopup = (e: React.MouseEvent, ev: any) => {
     e.stopPropagation();
     setSelectedEvent(ev);
     setPopupStartDate(ev.startDate || '');
     setPopupEndDate(ev.endDate || '');
     
     const schedule = schedules.find(s => s.id === ev.scheduleId);
     if (ev.isCustom && schedule?.customPhases) {
        const p = schedule.customPhases.find(p => p.id === ev.phaseId);
        setPopupNotes(p?.notes || '');
     } else {
        setPopupNotes('');
     }
  };

  const handleSavePopup = async () => {
     if (!selectedEvent) return;
     const schedule = schedules.find(s => s.id === selectedEvent.scheduleId);
     if (!schedule) return;

     let updates: Partial<FranchiseSchedule> = {};

     if (selectedEvent.isCustom) {
       const newArr = [...(schedule.customPhases || [])];
       const idx = newArr.findIndex(p => p.id === selectedEvent.phaseId);
       if (idx > -1) {
          newArr[idx].startDate = popupStartDate;
          newArr[idx].endDate = popupEndDate;
          newArr[idx].notes = popupNotes;
          updates.customPhases = newArr;
       }
     } else {
       const pid = selectedEvent.phaseId;
       if (pid === 'constructionStart') updates.constructionStart = popupStartDate;
       else if (pid === 'constructionEnd') updates.constructionEnd = popupStartDate;
       else if (pid === 'oven') { updates.ovenIn = popupStartDate; updates.ovenEnd = popupEndDate; }
       else if (pid === 'initialStock') { updates.initialStockIn = popupStartDate; updates.initialStockEnd = popupEndDate; }
       else if (pid === 'preTraining') { updates.preTrainingStart = popupStartDate; updates.preTrainingEnd = popupEndDate; }
       else if (pid === 'training') { updates.trainingStart = popupStartDate; updates.trainingEnd = popupEndDate; }
       else if (pid === 'open') updates.openDate = popupStartDate;
     }

     if (Object.keys(updates).length > 0) {
       await onScheduleUpdate(schedule.id, updates);
     }
     setSelectedEvent(null);
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
              <div key={wIdx} className="grid grid-cols-7 min-h-[120px] border-b border-slate-100 dark:border-slate-800">
                {week.map((cell, cIdx) => {
                  const cellEvents = getEventsForDate(cell.fullDate);
                  const evMap = cellEvents.reduce((acc, ev) => { acc[`${ev.scheduleId}_${ev.phaseId}`] = ev; return acc; }, {} as Record<string, any>);
                  
                  return (
                    <div 
                      key={cIdx} 
                      className={`py-1.5 border-r border-slate-100 dark:border-slate-800 flex flex-col ${!cell.isCurrentMonth ? 'bg-slate-50 dark:bg-slate-800/20 opacity-50' : ''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, cell.fullDate)}
                    >
                      <div className={`text-right px-2 text-sm font-bold mb-1.5 ${cell.isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>{cell.day}</div>
                      <div className="flex-1 space-y-1 pb-1">
                        {uniqueTracks.map((trackKey, tIdx) => {
                           const ev = evMap[trackKey];
                           if (!ev) {
                              return <div key={`spacer-${tIdx}`} className="h-[22px]" />;
                           }
                           
                           const roundedCls = ev.isStart && ev.isEnd ? 'rounded' : ev.isStart ? 'rounded-l rounded-r-none' : ev.isEnd ? 'rounded-r rounded-l-none' : 'rounded-none';
                           const ml = ev.isStart ? 'ml-1' : 'ml-0';
                           const mr = ev.isEnd ? 'mr-1' : 'mr-0';
                           const pl = ev.isStart ? 'pl-2' : 'pl-1';

                           return (
                             <div 
                               key={tIdx} 
                               onClick={(e) => openEditPopup(e, ev)}
                               className={`text-[11px] h-[22px] py-1 font-bold truncate text-white cursor-pointer hover:opacity-90 shadow-sm ${ev.color} ${roundedCls} ${ml} ${mr} ${pl} transition-all leading-tight border border-black/10`} 
                               title={ev.text}
                               draggable
                               onDragStart={(e) => handleDragStart(e, ev.scheduleId, ev.phaseId, cell.fullDate, ev.isCustom)}
                             >
                                {ev.text}
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

      {/* 클릭 수정 팝업 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-3">
               <h3 className="font-bold text-slate-900 dark:text-white text-sm">일정 블록 수정</h3>
               <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
             </div>
             
             <p className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1.5 rounded font-bold mb-4">
               {selectedEvent.text}
             </p>

             <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                     <label className="block text-xs font-semibold text-slate-500 mb-1">시작일</label>
                     <input type="date" value={popupStartDate} onChange={e => setPopupStartDate(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none" />
                  </div>
                  {popupStartDate !== popupEndDate && (
                    <div className="flex-1">
                       <label className="block text-xs font-semibold text-slate-500 mb-1">종료일</label>
                       <input type="date" value={popupEndDate} onChange={e => setPopupEndDate(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none" />
                    </div>
                  )}
                </div>
                
                {selectedEvent.isCustom && (
                  <div>
                     <label className="block text-xs font-semibold text-slate-500 mb-1">특이사항 (메모)</label>
                     <input type="text" placeholder="메모 추가..." value={popupNotes} onChange={e => setPopupNotes(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none" />
                  </div>
                )}
             </div>

             <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setSelectedEvent(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded">취소</button>
                <button onClick={handleSavePopup} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">변경 저장</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
