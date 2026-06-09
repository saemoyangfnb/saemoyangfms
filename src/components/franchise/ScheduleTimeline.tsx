import React, { useMemo } from 'react';
import { FranchiseSchedule, WorkItem, Employee } from '../../types';
import { diffDays, addDays } from '../../utils';

interface Props {
  schedules: FranchiseSchedule[];
  viewStartDate: string;
  viewEndDate: string;
  workItems?: WorkItem[];
  employees?: Employee[];
}

const LABEL_WIDTH = 200; // px
const DAY_WIDTH = 32;    // px per day

// schedule_date masterItems에서 동적으로 파생 — 하드코딩 제거

function addBusinessDays(base: Date, days: number): Date {
  const d = new Date(base);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

function computeWorkItemDates(workItems: WorkItem[], schedule: FranchiseSchedule): Record<string, { start: string; end: string }> {
  const pureDates: Record<string, { start: string; end: string }> = {};
  let changed = true;
  let pass = 0;
  while (changed && pass < 50) {
    changed = false;
    pass++;
    workItems.forEach(wt => {
      if (pureDates[wt.id] || wt.dDayOffset === undefined) return;
      const anchor = wt.anchorField || 'constructionStart';
      let anchorDate = '';
      if (anchor === 'constructionStart') anchorDate = schedule.constructionStart || '';
      else if (anchor === 'constructionEnd') anchorDate = schedule.constructionEnd || '';
      else anchorDate = pureDates[anchor]?.start || '';
      if (!anchorDate) return;

      const base = new Date(anchorDate);
      const startD = wt.skipWeekends
        ? addBusinessDays(base, wt.dDayOffset)
        : (() => { const d = new Date(base); d.setDate(d.getDate() + wt.dDayOffset!); return d; })();
      const startStr = startD.toISOString().split('T')[0];
      let endStr = startStr;
      if (wt.dDayEndOffset !== undefined && wt.dDayOffset !== undefined) {
        const durDays = wt.dDayEndOffset - wt.dDayOffset;
        if (durDays > 0) {
          const endD = wt.skipWeekends
            ? addBusinessDays(new Date(startStr), durDays)
            : (() => { const d = new Date(startStr); d.setDate(d.getDate() + durDays); return d; })();
          endStr = endD.toISOString().split('T')[0];
        }
      }
      pureDates[wt.id] = { start: startStr, end: endStr };
      changed = true;
    });
  }

  // fixedDate override
  const displayDates: Record<string, { start: string; end: string }> = { ...pureDates };
  workItems.forEach(wt => {
    const fixedDate = schedule.checklistData?.[wt.id]?.fixedDate;
    if (!fixedDate) return;
    const orig = pureDates[wt.id];
    let endStr = fixedDate;
    if (orig) {
      const durMs = new Date(orig.end).getTime() - new Date(orig.start).getTime();
      const durDays = Math.round(durMs / (1000 * 60 * 60 * 24));
      if (durDays > 0) {
        const endD = new Date(fixedDate);
        endD.setDate(endD.getDate() + durDays);
        endStr = endD.toISOString().split('T')[0];
      }
    }
    displayDates[wt.id] = { start: fixedDate, end: endStr };
  });

  return displayDates;
}

// 태스크별 행 높이(px) — 각 매장 행 안에서 태스크 바를 세로로 쌓음
const TASK_ROW_H = 26;
const TASK_TOP_OFFSET = 4;

export function ScheduleTimeline({ schedules, viewStartDate, viewEndDate, workItems = [], employees = [] }: Props) {
  const visibleSchedules = useMemo(() => schedules.filter(s => s.showInCalendar !== false), [schedules]);
  const totalDays = useMemo(() => Math.max(diffDays(viewStartDate, viewEndDate) + 1, 1), [viewStartDate, viewEndDate]);
  const timelineWidth = totalDays * DAY_WIDTH;

  const calendarWorkItems = useMemo(() =>
    workItems.filter(w => !w.isArchived && w.calendarVisible !== false && (w.category === 'task' || w.category === 'checklist')),
    [workItems]
  );

  // schedule_date 항목: isSystem 제외, scheduleField 있는 것만 (하드코딩 대체)
  const scheduleDateItems = useMemo(() =>
    workItems
      .filter(w => w.category === 'schedule_date' && !w.isArchived && !w.isSystem && w.scheduleField && w.calendarVisible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [workItems]
  );

  const daysArray = useMemo(() =>
    Array.from({ length: totalDays }).map((_, i) => addDays(viewStartDate, i)),
    [viewStartDate, totalDays]
  );

  const today = new Date().toISOString().split('T')[0];
  const todayIdx = daysArray.indexOf(today);

  const dateToX = (dateStr: string): number => {
    const clamped = dateStr < viewStartDate ? viewStartDate : dateStr > viewEndDate ? viewEndDate : dateStr;
    return diffDays(viewStartDate, clamped) * DAY_WIDTH;
  };

  if (totalDays <= 0) return <div className="p-4 text-center text-slate-400">날짜 범위를 확인해 주세요.</div>;

  return (
    <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
      {/* 헤더 */}
      <div className="flex sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 select-none">
        <div
          className="shrink-0 sticky left-0 z-30 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex items-center px-3 py-2 font-semibold text-xs text-slate-500"
          style={{ width: LABEL_WIDTH }}
        >
          매장명
        </div>
        <div className="flex" style={{ width: timelineWidth, flexShrink: 0 }}>
          {daysArray.map((day) => {
            const d = new Date(day + 'T00:00:00');
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isFirst = d.getDate() === 1;
            return (
              <div
                key={day}
                className={`flex-shrink-0 relative border-r border-slate-200 dark:border-slate-700 flex flex-col items-center justify-end pb-1 pt-3 text-[10px]
                  ${isWeekend ? 'bg-rose-50 dark:bg-rose-900/10 text-rose-400' : 'text-slate-400'}`}
                style={{ width: DAY_WIDTH }}
              >
                {isFirst && (
                  <span className="absolute top-1 left-0.5 font-bold text-[9px] text-slate-700 dark:text-slate-300 whitespace-nowrap leading-none">
                    {d.getMonth() + 1}월
                  </span>
                )}
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </div>

      {visibleSchedules.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">표시할 일정이 없습니다.</div>
      ) : (
        visibleSchedules.map((schedule) => {
          const storeColor = schedule.colorCode || 'slate';

          // 이 매장의 workItem 날짜 계산
          const taskDates = calendarWorkItems.length > 0
            ? computeWorkItemDates(calendarWorkItems, schedule)
            : {};

          // 보기 범위 안에 있는 태스크만 추출
          const visibleTasks = calendarWorkItems.filter(wt => {
            const d = taskDates[wt.id];
            if (!d) return false;
            return d.start <= viewEndDate && d.end >= viewStartDate;
          });

          const phaseRowH = 48;
          const taskAreaH = visibleTasks.length > 0 ? (visibleTasks.length * TASK_ROW_H + TASK_TOP_OFFSET * 2) : 0;
          const rowH = phaseRowH + taskAreaH;

          return (
            <div
              key={schedule.id}
              className="flex border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              {/* 라벨 */}
              <div
                className="shrink-0 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-col justify-start gap-1"
                style={{ width: LABEL_WIDTH, minHeight: rowH }}
              >
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full bg-${storeColor}-500 shadow-sm`} />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{schedule.storeName}</span>
                </div>
                {(schedule.team || schedule.supervisor || schedule.supervisorId) && (
                  <span className="text-[10px] text-slate-400">
                    {schedule.team}{(() => {
                      if (schedule.supervisorId) {
                        const emp = employees.find(e => e.id === schedule.supervisorId);
                        if (emp) return ` / ${emp.name}`;
                      }
                      return schedule.supervisor ? ` / ${schedule.supervisor}` : '';
                    })()}
                  </span>
                )}
              </div>

              {/* 타임라인 영역 */}
              <div
                className="relative"
                style={{ width: timelineWidth, minHeight: rowH, flexShrink: 0 }}
              >
                {/* 날짜 배경 그리드 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {daysArray.map((day) => {
                    const d = new Date(day + 'T00:00:00');
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={day}
                        className={`h-full border-r border-slate-100 dark:border-slate-800 flex-shrink-0
                          ${isWeekend ? 'bg-rose-50/40 dark:bg-rose-900/5' : ''}`}
                        style={{ width: DAY_WIDTH }}
                      />
                    );
                  })}
                </div>

                {/* 오늘 선 */}
                {todayIdx >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 z-10 pointer-events-none"
                    style={{
                      left: todayIdx * DAY_WIDTH + Math.floor(DAY_WIDTH / 2),
                      width: 2,
                      background: 'rgba(239,68,68,0.6)',
                    }}
                  />
                )}

                {/* 공사 기간 바 (시스템 항목 — 항상 표시) */}
                {(() => {
                  const start = schedule.constructionStart;
                  const end = schedule.constructionEnd;
                  if (!start || !end) return null;
                  if (start > viewEndDate || end < viewStartDate) return null;
                  const x = dateToX(start);
                  const x2 = dateToX(end) + DAY_WIDTH;
                  const w = x2 - x;
                  if (w <= 2) return null;
                  return (
                    <div
                      key="construction"
                      className={`absolute h-8 rounded border text-[10px] font-bold flex items-center px-2 overflow-hidden shadow-sm text-white bg-${storeColor}-500/80 border-${storeColor}-600`}
                      style={{ left: x, width: w - 2, top: 8 }}
                      title={`공사/준비: ${start} ~ ${end}`}
                    >
                      {w > 44 && <span className="truncate">공사/준비</span>}
                    </div>
                  );
                })()}

                {/* schedule_date masterItems 기반 동적 페이즈 바 */}
                {scheduleDateItems.map((item) => {
                  const schedAny = schedule as unknown as Record<string, string>;
                  const start = schedAny[item.scheduleField!];
                  const endField = item.scheduleField!.replace('Start', 'End').replace('In', 'End');
                  const end = schedAny[endField] || start;
                  if (!start) return null;
                  if (start > viewEndDate || end < viewStartDate) return null;

                  const x  = dateToX(start);
                  const x2 = dateToX(end) + DAY_WIDTH;
                  const w  = x2 - x;
                  if (w <= 2) return null;

                  return (
                    <div
                      key={item.id}
                      className={`absolute h-8 rounded border text-[10px] font-bold flex items-center px-2 overflow-hidden shadow-sm text-white bg-${storeColor}-400/70 border-${storeColor}-500`}
                      style={{ left: x, width: w - 2, top: 8 }}
                      title={`${item.text}: ${start}${end !== start ? ' ~ ' + end : ''}`}
                    >
                      {w > 44 && <span className="truncate">{item.text}</span>}
                    </div>
                  );
                })}

                {/* 커스텀 페이즈 */}
                {(schedule.customPhases || []).map((cp) => {
                  const start = cp.startDate;
                  const end = cp.endDate || cp.startDate;
                  if (!start || !end) return null;
                  if (start > viewEndDate || end < viewStartDate) return null;

                  const x  = dateToX(start);
                  const x2 = dateToX(end) + DAY_WIDTH;
                  const w  = x2 - x;
                  if (w <= 2) return null;

                  const isShort = cp.type === '단기';
                  const bg = isShort ? 'z-20 border-2' : 'z-10 bg-slate-100 dark:bg-slate-800 opacity-60';

                  return (
                    <div
                      key={cp.id}
                      className={`absolute h-8 rounded border text-[10px] font-bold flex items-center px-2 shadow-sm ${bg}`}
                      style={{ left: x, width: w - 2, top: 8 }}
                      title={`${cp.name}: ${start} ${isShort ? '' : '~ ' + end}`}
                    >
                      {w > 44 && <span className="truncate">📌 {cp.name}</span>}
                    </div>
                  );
                })}

                {/* 오픈일 마커 — masterItems에서 openDate scheduleField 탐색 */}
                {(() => {
                  const openItem = workItems.find(w => w.category === 'schedule_date' && w.scheduleField === 'openDate' && !w.isArchived);
                  const openDate = openItem ? (schedule as unknown as Record<string, string>)[openItem.scheduleField!] : schedule.openDate;
                  if (!openDate || openDate < viewStartDate || openDate > viewEndDate) return null;
                  return (
                    <div
                      className="absolute top-1 z-10 w-6 h-6 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-[11px] shadow-md cursor-help"
                      style={{ left: dateToX(openDate) + Math.floor(DAY_WIDTH / 2) - 12 }}
                      title={`그랜드 오픈: ${openDate}`}
                    >
                      🎉
                    </div>
                  );
                })()}

                {/* WorkItem 태스크 바 */}
                {visibleTasks.map((wt, idx) => {
                  const d = taskDates[wt.id]!;
                  const x  = dateToX(d.start);
                  const x2 = dateToX(d.end) + DAY_WIDTH;
                  const w  = Math.max(x2 - x, DAY_WIDTH);
                  const top = phaseRowH + TASK_TOP_OFFSET + idx * TASK_ROW_H;

                  // 완료 상태 확인
                  const taskStatus = (schedule.checklistData as any)?.[wt.id]?.status ?? 0;
                  const isDone = taskStatus === 3;

                  return (
                    <div
                      key={wt.id}
                      className={`absolute rounded text-[10px] font-bold flex items-center px-2 overflow-hidden shadow-sm border transition-opacity
                        ${isDone
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-300'
                          : 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300'
                        }`}
                      style={{ left: x, width: w - 2, top, height: TASK_ROW_H - 4 }}
                      title={`${wt.text}: ${d.start}${d.end !== d.start ? ' ~ ' + d.end : ''}`}
                    >
                      {isDone && <span className="mr-1 shrink-0">✓</span>}
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{wt.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
