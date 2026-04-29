import React, { useRef } from 'react';
import { FranchiseSchedule, WorkItem } from '../../types';
import { isDateInRange } from '../../utils';
import { X, Printer } from 'lucide-react';

const BG_PRINT: Record<string, string> = {
  blue: '#3b82f6', rose: '#f43f5e', emerald: '#10b981', amber: '#f59e0b',
  purple: '#a855f7', cyan: '#06b6d4', pink: '#ec4899', indigo: '#6366f1',
  violet: '#8b5cf6', fuchsia: '#d946ef', orange: '#f97316', teal: '#14b8a6',
  sky: '#0ea5e9', lime: '#84cc16', yellow: '#eab308', red: '#ef4444',
  stone: '#78716c', zinc: '#71717a', slate: '#64748b', neutral: '#737373',
};

function snapToWeekday(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  if (dow === 6) r.setDate(r.getDate() - 1);
  else if (dow === 0) r.setDate(r.getDate() - 2);
  return r;
}

function computeWorkItemDates(workItems: WorkItem[], schedule: FranchiseSchedule): Record<string, { start: string; end: string }> {
  const pureDates: Record<string, { start: string; end: string }> = {};
  let changed = true, pass = 0;
  while (changed && pass < 50) {
    changed = false; pass++;
    workItems.forEach(wt => {
      if (pureDates[wt.id] || wt.dDayOffset === undefined) return;
      const anchor = wt.anchorField || 'constructionStart';
      let anchorDate = '';
      if (anchor === 'constructionStart') anchorDate = schedule.constructionStart || '';
      else if (anchor === 'constructionEnd') anchorDate = schedule.constructionEnd || '';
      else anchorDate = pureDates[anchor]?.start || '';
      if (!anchorDate) return;
      const base = new Date(anchorDate);
      const sd = new Date(base); sd.setDate(sd.getDate() + wt.dDayOffset!);
      const startD = wt.skipWeekends ? snapToWeekday(sd) : sd;
      const startStr = startD.toISOString().split('T')[0];
      let endStr = startStr;
      if (wt.dDayEndOffset !== undefined && wt.dDayOffset !== undefined) {
        const dur = wt.dDayEndOffset - wt.dDayOffset;
        if (dur > 0) {
          const ed = new Date(startStr); ed.setDate(ed.getDate() + dur);
          endStr = (wt.skipWeekends ? snapToWeekday(ed) : ed).toISOString().split('T')[0];
        }
      }
      pureDates[wt.id] = { start: startStr, end: endStr };
      changed = true;
    });
  }
  const displayDates = { ...pureDates };
  workItems.forEach(wt => {
    if (wt.anchorLocked) return;
    const fixedDate = schedule.checklistData?.[wt.id]?.fixedDate;
    if (!fixedDate) return;
    const orig = pureDates[wt.id];
    let endStr = fixedDate;
    if (orig) {
      const durDays = Math.round((new Date(orig.end).getTime() - new Date(orig.start).getTime()) / 86400000);
      if (durDays > 0) { const ed = new Date(fixedDate); ed.setDate(ed.getDate() + durDays); endStr = ed.toISOString().split('T')[0]; }
    }
    displayDates[wt.id] = { start: fixedDate, end: endStr };
  });
  return displayDates;
}

interface PrintCalendarProps {
  schedules: FranchiseSchedule[];
  months: Date[];   // 출력할 월 목록 (1개 또는 2개)
  workItems: WorkItem[];
  paperSize: 'A4' | 'A3';
  onClose: () => void;
}

function MonthGrid({ year, month, schedules, workItems }: { year: number; month: number; schedules: FranchiseSchedule[]; workItems: WorkItem[] }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: { day: number; fullDate: string; isCurrentMonth: boolean }[] = [];
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const d = prevMonthDays - firstDay + i + 1;
    const pm = month === 0 ? 12 : month;
    const py = month === 0 ? year - 1 : year;
    cells.push({ day: d, fullDate: `${py}-${String(pm).padStart(2,'0')}-${String(d).padStart(2,'0')}`, isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, fullDate: `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`, isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    const nm = month === 11 ? 1 : month + 2;
    const ny = month === 11 ? year + 1 : year;
    cells.push({ day: i, fullDate: `${ny}-${String(nm).padStart(2,'0')}-${String(i).padStart(2,'0')}`, isCurrentMonth: false });
  }

  const visibleSchedules = schedules.filter(s => s.showInCalendar !== false);

  const getEvents = (dateStr: string) => {
    const events: { name: string; color: string; isStart: boolean; isEnd: boolean; duration: number }[] = [];
    visibleSchedules.forEach(s => {
      const color = BG_PRINT[s.colorCode || 'slate'] || '#64748b';
      const computed = computeWorkItemDates(workItems, s);
      workItems.forEach(wt => {
        if (wt.category !== 'task' || wt.isArchived || wt.calendarVisible === false) return;
        const d = computed[wt.id];
        if (!d || !isDateInRange(dateStr, d.start, d.end)) return;
        if (events.some(e => e.name === `${s.storeName} ${wt.text}`)) return;
        events.push({
          name: `${s.storeName} ${wt.text}`,
          color,
          isStart: d.start === dateStr,
          isEnd: d.end === dateStr,
          duration: Math.round((new Date(d.end).getTime() - new Date(d.start).getTime()) / 86400000) + 1,
        });
      });
      // schedule_date phase bars
      const schAny = s as any;
      // construction
      if (s.constructionStart && isDateInRange(dateStr, s.constructionStart, s.constructionEnd || s.constructionStart)) {
        if (!events.some(e => e.name === `${s.storeName} 공사`)) {
          events.push({ name: `${s.storeName} 공사`, color, isStart: s.constructionStart === dateStr, isEnd: (s.constructionEnd || s.constructionStart) === dateStr, duration: 1 });
        }
      }
      workItems.filter(w => w.category === 'schedule_date' && !w.isArchived && !w.isSystem && w.scheduleField).forEach(item => {
        const start = schAny[item.scheduleField!];
        const endField = item.scheduleField!.replace('Start','End').replace('In','End');
        const end = schAny[endField] || start;
        if (!start || !isDateInRange(dateStr, start, end)) return;
        if (events.some(e => e.name === `${s.storeName} ${item.text}`)) return;
        events.push({ name: `${s.storeName} ${item.text}`, color, isStart: start === dateStr, isEnd: end === dateStr, duration: 1 });
      });
    });
    return events;
  };

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div style={{ breakInside: 'avoid' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid #ccc', borderLeft: '1px solid #ccc' }}>
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <div key={d} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 900, textAlign: 'center', borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', background: i === 0 ? '#fff5f5' : i === 6 ? '#f0f4ff' : '#fafafa', color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#374151' }}>
            {d}
          </div>
        ))}
        {weeks.map((week, wi) => week.map((cell, di) => {
          const isToday = cell.fullDate === todayStr;
          const isWeekend = di === 0 || di === 6;
          const events = getEvents(cell.fullDate);
          return (
            <div key={cell.fullDate} style={{ borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', minHeight: 72, padding: '4px 4px 2px', background: isToday ? '#fef9c3' : !cell.isCurrentMonth ? '#f9f9f9' : isWeekend ? (di === 0 ? '#fff8f8' : '#f8f9ff') : '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: isToday ? 900 : 700, color: isToday ? '#d97706' : !cell.isCurrentMonth ? '#ccc' : di === 0 ? '#dc2626' : di === 6 ? '#2563eb' : '#111', marginBottom: 2 }}>
                {cell.day}
              </div>
              {events.map((ev, ei) => (
                <div key={ei} style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: ev.color, borderRadius: 2, padding: '1px 3px', marginBottom: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {ev.name}
                </div>
              ))}
            </div>
          );
        }))}
      </div>
    </div>
  );
}

export function PrintCalendar({ schedules, months, workItems, paperSize, onClose }: PrintCalendarProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>캘린더 인쇄</title><style>
      @page { size: ${paperSize} landscape; margin: 10mm; }
      body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; margin: 0; }
      * { box-sizing: border-box; }
      .month-section { page-break-inside: avoid; margin-bottom: 24px; }
      .month-title { font-size: 16px; font-weight: 900; margin-bottom: 8px; color: #111; padding-bottom: 4px; border-bottom: 2px solid #111; }
    </style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <Printer size={18} className="text-slate-600" />
            <span className="font-black text-slate-800 dark:text-slate-200">캘린더 인쇄 미리보기</span>
            <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-500">{paperSize} 가로</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <Printer size={14} />
              인쇄
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 미리보기 */}
        <div className="overflow-auto flex-1 p-4 bg-slate-50 dark:bg-slate-800">
          <div ref={printRef} style={{ background: '#fff', padding: '12px', fontFamily: 'sans-serif' }}>
            {months.map((monthDate) => {
              const y = monthDate.getFullYear();
              const m = monthDate.getMonth();
              return (
                <div key={`${y}-${m}`} className="month-section" style={{ marginBottom: 28 }}>
                  <div className="month-title" style={{ fontSize: 15, fontWeight: 900, marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #111', color: '#111' }}>
                    {y}년 {m + 1}월
                  </div>
                  <MonthGrid year={y} month={m} schedules={schedules} workItems={workItems} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
