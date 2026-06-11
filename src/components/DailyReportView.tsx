import React, { useState, useEffect, useRef, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc,
  query, where, orderBy
} from 'firebase/firestore';
import { DailyReport, DailyReportItem, DailyItemStatus, Employee, User, Department, Task, WeeklyReport, WeeklyReportItem, FranchiseSchedule } from '../types';
import { useToast } from './Toast';
import { FeedView } from './FeedView';
import { shareDailyReport, shareWeeklyReport } from '../utils/kakao';
import { Plus, X, CheckCircle, XCircle, Clock, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Send, Briefcase, AtSign, ArrowRight, BarChart3, Store, CalendarDays, Rss, FileText, GripVertical } from 'lucide-react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { AtMentionInput, saveMentions } from './ui/AtMentionInput';

/* ── 상수 ─────────────────────────────────────────────── */
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toYMD(new Date());

/* 오픈 일정 주요 날짜 정의 */
interface ScheduleEvent {
  storeName: string;
  storeNumber: string;
  label: string;
  date: string;       // YYYY-MM-DD
  daysLeft: number;   // 양수=미래, 음수=지남
}

const FRANCHISE_DATE_FIELDS: { key: keyof FranchiseSchedule; label: string }[] = [
  { key: 'openDate',          label: '🏪 오픈' },
  { key: 'trainingStart',     label: '📚 매장교육 시작' },
  { key: 'preTrainingStart',  label: '📝 사전교육 시작' },
  { key: 'constructionStart', label: '🔨 공사 시작' },
  { key: 'constructionEnd',   label: '✅ 공사 완료' },
  { key: 'equipmentIn',       label: '📦 화구류 입고' },
  { key: 'ovenIn',            label: '🔥 화덕 입고' },
  { key: 'initialStockIn',    label: '🛒 초도물품 입고' },
];

const getWeekBounds = (d: Date = new Date()) => {
  const day = d.getDay(); // 0=일
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  return { weekStart: toYMD(mon), weekEnd: toYMD(fri) };
};

const WEEK_STATUS_LABELS = { planned: '예정', in_progress: '진행 중', done: '완료' } as const;
const WEEK_STATUS_CLS = {
  planned: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};
const fmtDate = (ymd: string) => {
  const d = new Date(ymd + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};
const genId = () => `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const STATUS_CONFIG: Record<DailyItemStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  pending:    { label: '진행 중', icon: <Clock size={13} />,        cls: 'text-amber-600 dark:text-amber-400' },
  done:       { label: '완료',    icon: <CheckCircle size={13} />,  cls: 'text-emerald-600 dark:text-emerald-400' },
  incomplete: { label: '진행중',  icon: <Clock size={13} />,        cls: 'text-amber-600 dark:text-amber-400' },
};

/* ── 미니 진행률 피커 ───────────────────────────────────── */
type MorningItem = { text: string; progress: number; memo?: string };
interface MeetingActionSource { id: string; text: string; meetingTitle: string; meetingDate: string; assignee?: string; }

function MiniProgressPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  const display = hov ?? value;
  const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  const segCls = (s: number) => {
    if (display >= s) {
      if (display === 100) return 'bg-blue-500';
      if (display >= 70)  return 'bg-emerald-500';
      if (display >= 40)  return 'bg-amber-400';
      return 'bg-stone-400';
    }
    return 'bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600';
  };

  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHov(null)}>
      <span className="text-[10px] text-stone-400 shrink-0">진행률</span>
      <div className="flex gap-0.5">
        {steps.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value === s ? 0 : s)}
            onMouseEnter={() => setHov(s)}
            className={`w-3.5 h-2 rounded-sm transition-colors ${segCls(s)}`}
            title={`${s}%`}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold tabular-nums text-stone-500 dark:text-stone-400 w-7">{display}%</span>
    </div>
  );
}

/* ── 개인 오전 보고 폼 ─────────────────────────────────── */
function MorningForm({
  onSubmit,
  myId,
  editItems,
  pendingTaskTitles = [],
}: {
  onSubmit: (items: MorningItem[]) => void;
  myId: string;
  editItems?: DailyReportItem[];   // 수정 모드: 기존 항목 초기값
  pendingTaskTitles?: string[];    // 업무 인박스에서 추가된 제목들
}) {
  const [items, setItems] = useState<MorningItem[]>(
    editItems
      ? editItems.map(it => ({ text: it.text, progress: it.progress ?? 0 }))
      : [{ text: '', progress: 0 }, { text: '', progress: 0 }]
  );
  const [carryItems, setCarryItems] = useState<DailyReportItem[]>([]);
  const [selectedCarry, setSelectedCarry] = useState<Set<number>>(new Set());
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const processedCount = useRef(0);

  // 업무 인박스에서 추가된 항목 동기화
  useEffect(() => {
    const newCount = pendingTaskTitles.length;
    if (newCount > processedCount.current) {
      const newTitles = pendingTaskTitles.slice(processedCount.current);
      setItems(p => {
        let base = [...p];
        while (base.length > 0 && base[base.length - 1].text === '') base.pop();
        return [...base, ...newTitles.map(t => ({ text: t, progress: 0 })), { text: '', progress: 0 }];
      });
      processedCount.current = newCount;
    }
  }, [pendingTaskTitles.length]);

  // 어제 미완료 항목 로드 — 수정 모드에서는 스킵
  useEffect(() => {
    if (editItems) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ymd = toYMD(yesterday);
    getDocs(query(collection(salesDb, 'daily_reports'), where('date', '==', ymd), where('employeeId', '==', myId)))
      .then(snap => {
        const reports = snap.docs.map(d => d.data() as DailyReport);
        const evening = reports.find(r => r.type === 'evening');
        if (evening) {
          const incomplete = evening.items.filter(it => it.status === 'incomplete');
          setCarryItems(incomplete);
          setSelectedCarry(new Set(incomplete.map((_, i) => i)));
        }
      }).catch(() => {});
  }, [myId]);

  const toggleCarry = (i: number) =>
    setSelectedCarry(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const updateText = (i: number, v: string) =>
    setItems(p => p.map((x, idx) => idx === i ? { ...x, text: v } : x));
  const updateProgress = (i: number, v: number) =>
    setItems(p => p.map((x, idx) => idx === i ? { ...x, progress: v } : x));
  const updateMemo = (i: number, v: string) =>
    setItems(p => p.map((x, idx) => idx === i ? { ...x, memo: v } : x));

  const handleKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i === items.length - 1) {
        setItems(p => [...p, { text: '', progress: 0 }]);
        setTimeout(() => inputRefs.current[i + 1]?.focus(), 30);
      } else {
        inputRefs.current[i + 1]?.focus();
      }
    }
    if (e.key === 'Backspace' && items[i].text === '' && items.length > 1) {
      e.preventDefault();
      setItems(p => p.filter((_, idx) => idx !== i));
      setTimeout(() => inputRefs.current[Math.max(0, i - 1)]?.focus(), 30);
    }
  };

  const handleSubmit = () => {
    const carried: MorningItem[] = carryItems
      .filter((_, i) => selectedCarry.has(i))
      .map(it => ({ text: `[이월] ${it.text}`, progress: it.progress ?? 0 }));
    const manual = items.filter(it => it.text.trim()).map(it => ({ ...it, text: it.text.trim() }));
    const all = [...carried, ...manual];
    if (all.length === 0) return;
    onSubmit(all);
  };

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-6">
      <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-4">출근 보고</p>

      {/* 어제 미완료 이월 섹션 */}
      {carryItems.length > 0 && (
        <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <XCircle size={11} /> 어제 진행중 항목 — 이월할 항목을 선택하세요
            </p>
            <button onClick={() => setSelectedCarry(selectedCarry.size === carryItems.length ? new Set() : new Set(carryItems.map((_, i) => i)))}
              className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline">
              {selectedCarry.size === carryItems.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="space-y-1.5">
            {carryItems.map((it, i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={selectedCarry.has(i)} onChange={() => toggleCarry(i)}
                  className="accent-amber-600 w-3.5 h-3.5 shrink-0" />
                <span className={`text-xs font-semibold flex-1 ${selectedCarry.has(i) ? 'text-stone-800 dark:text-stone-200' : 'text-stone-400 line-through'}`}>
                  {it.text}
                </span>
                {(it.progress ?? 0) > 0 && (
                  <span className="text-[10px] font-bold text-stone-400 shrink-0">{it.progress}%</span>
                )}
                {it.note && <span className="text-[10px] text-stone-400 truncate max-w-32">{it.note}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 업무 항목 입력 */}
      <div className="space-y-3 mb-4">
        {items.map((item, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-stone-400 w-5 shrink-0 text-right">
                {selectedCarry.size + i + 1}.
              </span>
              <AtMentionInput
                ref={el => { inputRefs.current[i] = el; }}
                value={item.text}
                onChange={v => updateText(i, v)}
                onKeyDown={e => handleKeyDown(e, i)}
                placeholder="업무 내용 입력 (@매장명으로 매장 멘션)"
                wrapperClassName="flex-1 min-w-0"
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500 dark:focus:border-stone-400"
              />
              {items.length > 1 && (
                <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-stone-300 hover:text-stone-500 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
            {/* 진행률 */}
            <div className="pl-7">
              <MiniProgressPicker value={item.progress} onChange={v => updateProgress(i, v)} />
            </div>
            {/* 메모 */}
            <div className="pl-7 mt-1">
              <input
                value={item.memo ?? ''}
                onChange={e => updateMemo(i, e.target.value)}
                placeholder="메모 — 어떻게 진행할지 (선택)"
                className="w-full px-2.5 py-1.5 text-xs border border-dashed border-stone-200 dark:border-stone-700 rounded-lg bg-transparent text-stone-600 dark:text-stone-400 outline-none focus:border-stone-400 dark:focus:border-stone-500 placeholder:text-stone-300 dark:placeholder:text-stone-600"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setItems(p => [...p, { text: '', progress: 0 }])} className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 font-semibold">
          <Plus size={13} /> 항목 추가 <span className="text-stone-300">(Enter)</span>
        </button>
        <button onClick={handleSubmit} className="flex items-center gap-2 px-5 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
          <Send size={13} /> 보고하기
        </button>
      </div>
    </div>
  );
}

/* ── 개인 퇴근 보고 폼 ─────────────────────────────────── */
function EveningForm({
  morning, editItems, onSubmit,
}: {
  morning: DailyReport;
  editItems?: DailyReportItem[]; // 수정 모드: 기존 저녁 항목
  onSubmit: (items: DailyReportItem[]) => void;
}) {
  const [items, setItems] = useState<DailyReportItem[]>(
    (editItems ?? morning.items).map((it, i) => ({
      text: morning.items[i]?.text ?? it.text,
      status: it.status ?? ('done' as DailyItemStatus),
      note: it.note ?? '',
      progress: it.progress ?? morning.items[i]?.progress ?? 0,
    }))
  );

  const toggleStatus = (i: number) => {
    setItems(p => p.map((it, idx) => {
      if (idx !== i) return it;
      const next = it.status === 'done' ? 'incomplete' : 'done';
      return { ...it, status: next, progress: next === 'done' ? 100 : it.progress };
    }));
  };

  const updateProgress = (i: number, v: number) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, progress: v } : it));

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-6">
      <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-4">퇴근 보고</p>
      <div className="space-y-4 mb-5">
        {items.map((it, i) => {
          const morningProg = morning.items[i]?.progress ?? 0;
          const eveningProg = it.progress ?? 0;
          const delta = eveningProg - morningProg;

          return (
            <div key={i}>
              {/* 업무명 + 상태 토글 */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-stone-400 w-5 shrink-0 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold ${it.status === 'done' ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'}`}>
                    {it.text}
                  </span>
                  {morning.items[i]?.memo && (
                    <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 truncate">📝 {morning.items[i].memo}</p>
                  )}
                </div>
                <button
                  onClick={() => toggleStatus(i)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors ${STATUS_CONFIG[it.status].cls}`}
                  style={{ background: 'transparent' }}
                >
                  {STATUS_CONFIG[it.status].icon}
                  <span className="hidden sm:inline">{STATUS_CONFIG[it.status].label}</span>
                </button>
              </div>

              {/* 진행률 행 */}
              <div className="ml-8 mt-1.5 flex items-center gap-2 flex-wrap">
                {morningProg > 0 && (
                  <span className="text-[10px] text-stone-400 shrink-0">출근 {morningProg}% →</span>
                )}
                <MiniProgressPicker value={eveningProg} onChange={v => updateProgress(i, v)} />
                {delta !== 0 && (
                  <span className={`text-[10px] font-black shrink-0 ${delta > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {delta > 0 ? `+${delta}%` : `${delta}%`}
                  </span>
                )}
              </div>

              {/* 이월 메모 */}
              {it.status === 'incomplete' && (
                <div className="ml-8 mt-1.5">
                  <input
                    value={it.note ?? ''}
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, note: e.target.value } : x))}
                    placeholder="이월 메모 / 특이사항 (선택)"
                    className="w-full px-3 py-1.5 text-xs border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-stone-800 dark:text-stone-200 outline-none focus:border-amber-400 placeholder:text-amber-400"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSubmit(items)} className="flex items-center gap-2 px-5 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
          <Send size={13} /> 퇴근 보고
        </button>
      </div>
    </div>
  );
}

/* ── 보고서 카드 (완료된 보고) ─────────────────────────── */
function ReportCard({ report, morningReport, showName = false, onEdit, onConfirm, isAdmin, onCreateReport, onShare }: {
  report: DailyReport;
  morningReport?: DailyReport; // 퇴근 카드에서 출근 데이터 참조용
  showName?: boolean;
  onEdit?: () => void;
  onConfirm?: () => void;
  isAdmin?: boolean;
  onCreateReport?: () => void;
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const doneCount = report.items.filter(it => it.status === 'done').length;
  const total = report.items.length;
  const pct = total ? Math.round(doneCount / total * 100) : 0;
  // 퇴근 보고: 평균 진행률
  const hasProgress = report.type === 'evening' && report.items.some(it => (it.progress ?? 0) > 0);
  const avgProgress = hasProgress
    ? Math.round(report.items.reduce((s, it) => s + (it.progress ?? 0), 0) / report.items.length)
    : pct;

  return (
    <div className={`bg-white dark:bg-stone-900 border rounded-xl overflow-hidden ${report.type === 'evening' ? 'border-stone-200 dark:border-stone-700' : 'border-stone-100 dark:border-stone-800'}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-left" onClick={() => setOpen(p => !p)}>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${report.type === 'morning' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'}`}>
          {report.type === 'morning' ? '출근' : '퇴근'}
        </span>
        {showName && <span className="text-xs font-bold text-stone-700 dark:text-stone-300 shrink-0">{report.employeeName}</span>}
        <span className="flex-1 text-xs text-stone-500 dark:text-stone-400 truncate">
          {report.items.slice(0, 2).map(it => it.text).join(' · ')}
          {report.items.length > 2 && ` 외 ${report.items.length - 2}건`}
        </span>
        {report.type === 'evening' && (
          <span className={`text-[11px] font-bold shrink-0 ${avgProgress === 100 ? 'text-emerald-600' : avgProgress >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
            {avgProgress}%
          </span>
        )}
        {onShare && (
          <button onClick={e => { e.stopPropagation(); onShare(); }}
            className="text-[13px] shrink-0 hover:scale-110 transition-transform" title="카톡으로 공유">
            💬
          </button>
        )}
        <ChevronDown size={13} className={`text-stone-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        {report.confirmedAt ? (
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 px-2 shrink-0">✓ 확인됨</span>
        ) : (
          <>
            {onEdit && (
              <button onClick={e => { e.stopPropagation(); onEdit(); }}
                className="text-[11px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0">
                수정
              </button>
            )}
            {isAdmin && onConfirm && (
              <button onClick={e => { e.stopPropagation(); onConfirm(); }}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 shrink-0">
                확인
              </button>
            )}
          </>
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-stone-100 dark:border-stone-800 space-y-2">
          {report.items.map((it, i) => {
            const morningProg = morningReport?.items[i]?.progress ?? 0;
            const eveningProg = it.progress ?? 0;
            const delta = report.type === 'evening' ? eveningProg - morningProg : 0;
            return (
              <div key={i}>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-stone-400 w-4 text-right font-bold shrink-0">{i + 1}.</span>
                  <span className={`${STATUS_CONFIG[it.status].cls} shrink-0`}>{STATUS_CONFIG[it.status].icon}</span>
                  <span className={`text-xs flex-1 min-w-0 ${it.status === 'done' ? 'line-through text-stone-400' : 'text-stone-700 dark:text-stone-300'} font-semibold`}>{it.text}</span>
                  {/* 진행률 표시 */}
                  {report.type === 'evening' && eveningProg > 0 && (
                    <span className="flex items-center gap-1 shrink-0">
                      {morningProg > 0 && (
                        <span className="text-[9px] text-stone-400">{morningProg}%→</span>
                      )}
                      <span className="text-[10px] font-bold tabular-nums text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                        {eveningProg}%
                      </span>
                      {delta > 0 && (
                        <span className="text-[9px] font-black text-emerald-500">+{delta}%</span>
                      )}
                    </span>
                  )}
                  {report.type === 'morning' && (it.progress ?? 0) > 0 && (
                    <span className="text-[10px] font-bold tabular-nums shrink-0 text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                      {it.progress}%
                    </span>
                  )}
                  <span className={`text-[10px] font-bold shrink-0 ${STATUS_CONFIG[it.status].cls}`}>{STATUS_CONFIG[it.status].label}</span>
                </div>
                {it.note && <p className="ml-10 text-[11px] text-stone-400 mt-0.5">{it.note}</p>}
              </div>
            );
          })}
          {onCreateReport && (
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
              <button onClick={onCreateReport}
                className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                <FileText size={11} /> 보고서로 작성하기 (선택)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────────────── */
interface Props { currentUser: User; onNavigateToReports?: () => void }

/* ── 날짜 상세 팝업 (주간 현황 탭용) ──────────────────────── */
function DayDetailPopup({ date, emp, morning, evening, onClose }: {
  date: string;
  emp: Employee;
  morning: DailyReport | null;
  evening: DailyReport | null;
  onClose: () => void;
}) {
  const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(date + 'T00:00:00');
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_KR[d.getDay()]})`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md border border-stone-200 dark:border-stone-700 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100 dark:border-stone-800">
          <div className="w-9 h-9 rounded-full bg-stone-800 dark:bg-stone-200 flex items-center justify-center text-sm font-black text-white dark:text-stone-900 shrink-0">
            {emp.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-stone-900 dark:text-white">{emp.name}</p>
            <p className="text-[10px] text-stone-400">{label}{emp.position ? ` · ${emp.position}` : ''}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {morning && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">☀ 출근</span>}
            {evening && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">🌙 퇴근</span>}
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm ml-1"><X size={16} /></button>
        </div>

        {/* 내용 */}
        {(morning || evening) ? (
          <div className="overflow-y-auto max-h-[65vh] divide-y divide-stone-100 dark:divide-stone-800">
            {/* 출근 보고 항목 */}
            {morning && (
              <div className="px-5 py-3">
                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 mb-2.5">☀ 출근 보고</p>
                <div className="space-y-2">
                  {morning.items.map((it, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-stone-300 w-4 text-right font-bold mt-0.5 shrink-0">{i + 1}</span>
                      <span className={`mt-0.5 shrink-0 ${STATUS_CONFIG[it.status].cls}`}>{STATUS_CONFIG[it.status].icon}</span>
                      <p className={`text-xs leading-snug flex-1 ${it.status === 'done' ? 'line-through text-stone-400' : it.status === 'incomplete' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-stone-700 dark:text-stone-300'}`}>
                        {it.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 퇴근 보고 항목 */}
            {evening && (
              <div className="px-5 py-3">
                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mb-2.5">🌙 퇴근 보고 (완료 현황)</p>
                <div className="space-y-2">
                  {evening.items.map((it, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-stone-300 w-4 text-right font-bold mt-0.5 shrink-0">{i + 1}</span>
                      <span className={`mt-0.5 shrink-0 ${STATUS_CONFIG[it.status].cls}`}>{STATUS_CONFIG[it.status].icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-snug ${it.status === 'done' ? 'line-through text-stone-400' : it.status === 'incomplete' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-stone-700 dark:text-stone-300'}`}>
                          {it.text}
                        </p>
                        {it.status === 'incomplete' && it.note && (
                          <p className="text-[10px] text-stone-400 mt-0.5">미완료 사유: {it.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-14 text-center">
            <p className="text-sm text-stone-400">이 날 제출된 보고가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 드래그 가능한 업무 카드 ──────────────────────────── */
function DraggableTaskCard({ task, onAdd, onReject, isToday, rejectLabel }: {
  task: Task;
  onAdd: (t: Task) => void;
  onReject: (t: Task) => void;
  isToday: boolean;
  rejectLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: 'task-' + task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`px-4 py-3 transition-opacity ${isDragging ? 'opacity-30' : ''}`}>
      <div className="flex items-center gap-3">
        {/* 그립 핸들 */}
        <div {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 shrink-0 touch-none select-none">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.sourceAgendaTitle && (
              <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                <Briefcase size={9} /> 회의 안건
              </span>
            )}
            {task.requesterName && task.requesterName !== task.assigneeName && (
              <span className="text-[10px] text-stone-400">from {task.requesterName}</span>
            )}
            {(task.collaboratorNames ?? []).length > 0 && (
              <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                <AtSign size={9} /> {task.collaboratorNames!.join(', ')}
              </span>
            )}
            {task.dueDate && <span className="text-[10px] text-red-400">~{task.dueDate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onAdd(task)} disabled={!isToday}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:opacity-80 disabled:opacity-30">
            <ArrowRight size={10} /> 추가
          </button>
          <button onClick={() => onReject(task)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40">
            <X size={10} /> {rejectLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 회의 실행항목 드래그 카드 ──────────────────────────── */
function DraggableMeetingItem({ item, onAdd }: { item: MeetingActionSource; onAdd: (item: MeetingActionSource) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: 'meeting-' + item.id });
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className={`flex items-start gap-2 px-3 py-2.5 border-b border-stone-100 dark:border-stone-800 last:border-0 transition-opacity ${isDragging ? 'opacity-30' : ''}`}>
      <button {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-stone-300 hover:text-blue-400 shrink-0 touch-none">
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 leading-snug">{item.text}</p>
        <p className="text-[10px] text-stone-400 mt-0.5 truncate">{item.meetingTitle} · {item.meetingDate}</p>
        {item.assignee && <span className="text-[10px] text-blue-500">{item.assignee}</span>}
      </div>
      <button onClick={() => onAdd(item)}
        className="shrink-0 flex items-center gap-0.5 px-2 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
        <Plus size={11} /> 추가
      </button>
    </div>
  );
}

/* ── MorningForm 드롭 존 래퍼 ────────────────────────── */
function DroppableMorningZone({ children, active }: { children: React.ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'morning-form' });
  return (
    <div ref={setNodeRef}
      className={`rounded-2xl transition-all duration-150 ${active && isOver ? 'ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-stone-950 scale-[1.005]' : ''}`}>
      {children}
    </div>
  );
}

export function DailyReportView({ currentUser, onNavigateToReports }: Props) {
  const toast = useToast();
  const isAdmin = currentUser.role === 'admin';
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [draggingMeetingItem, setDraggingMeetingItem] = useState<MeetingActionSource | null>(null);
  const [meetingActions, setMeetingActions] = useState<MeetingActionSource[]>([]);
  const [showMeetingPanel, setShowMeetingPanel] = useState(false);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [date, setDate] = useState(today());
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [myStores, setMyStores] = useState<FranchiseSchedule[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [myWeekly, setMyWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyForm, setWeeklyForm] = useState<WeeklyReportItem[]>([
    { title: '', status: 'planned' }, { title: '', status: 'planned' },
    { title: '', status: 'planned' }, { title: '', status: 'planned' },
  ]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'weekly' | 'feed' | 'team' | 'week'>('my');
  const [weekViewStart, setWeekViewStart] = useState(() => {
    const d = new Date(); const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    return toYMD(mon);
  });
  const [weekReports, setWeekReports] = useState<DailyReport[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [dayPopup, setDayPopup] = useState<{
    date: string; emp: Employee;
    morning: DailyReport | null; evening: DailyReport | null;
  } | null>(null);
  const [isEditingMorning, setIsEditingMorning] = useState(false);
  const [isEditingEvening, setIsEditingEvening] = useState(false);
  const [pendingTaskTitles, setPendingTaskTitles] = useState<string[]>([]);
  const [weeklyCarryItems, setWeeklyCarryItems] = useState<WeeklyReportItem[]>([]);
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [kakaoTarget, setKakaoTarget] = useState<{ type: 'morning' | 'evening' | 'weekly'; items: string[]; weekStart?: string; weekEnd?: string } | null>(null);

  /* 오늘 내 보고서 — employee 미연결 시 uid로도 탐색 */
  const myId = myEmployee?.id ?? currentUser.uid;
  const myMorning = reports.find(r => r.employeeId === myId && r.date === date && r.type === 'morning');
  const myEvening = reports.find(r => r.employeeId === myId && r.date === date && r.type === 'evening');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // orderBy 없이 where만 사용 → 복합 인덱스 불필요
      const [empSnap, deptSnap, reportSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
        getDocs(query(collection(salesDb, 'departments'), orderBy('order'))),
        getDocs(query(collection(salesDb, 'daily_reports'), where('date', '==', date))),
      ]);
      const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      setEmployees(emps);
      setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
      // 클라이언트에서 정렬
      setReports(reportSnap.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport))
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)));
      const me = emps.find(e => e.linkedUid === currentUser.uid) ?? null;
      setMyEmployee(me);

      // 주간보고 — orderBy 없이 where만
      const { weekStart } = getWeekBounds();
      const weekSnap = await getDocs(
        query(collection(salesDb, 'weekly_reports'), where('weekStart', '==', weekStart))
      );
      const wReports = weekSnap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReport));
      setWeeklyReports(wReports);
      const myW = me ? wReports.find(r => r.employeeId === me.id) ?? null : null;
      setMyWeekly(myW);
      if (myW) setWeeklyForm(myW.items.length >= 4 ? myW.items : [...myW.items, ...Array(4 - myW.items.length).fill({ title: '', status: 'planned' })]);

      // 지난주 미완료 이월 — 이번 주 보고 없을 때만
      if (!myW && me) {
        const prevWeekBounds = getWeekBounds(new Date(Date.now() - 7 * 86400000));
        const prevSnap = await getDocs(
          query(collection(salesDb, 'weekly_reports'), where('weekStart', '==', prevWeekBounds.weekStart), where('employeeId', '==', me.id))
        );
        if (prevSnap.docs[0]) {
          const prev = prevSnap.docs[0].data() as WeeklyReport;
          setWeeklyCarryItems(prev.items.filter(it => it.status === 'planned' || it.status === 'in_progress'));
        }
      } else {
        setWeeklyCarryItems([]);
      }

      // 내 업무 태스크
      const myId = me?.id ?? currentUser.uid;
      const taskSnap = await getDocs(
        query(collection(salesDb, 'tasks'), where('assigneeId', '==', myId))
      );
      setMyTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task))
        .filter(t => t.status === 'pending' || t.status === 'in_progress')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      // 오픈 일정 — supervisor 이름으로 매칭
      if (me?.name) {
        const schSnap = await getDocs(collection(salesDb, 'franchise_schedules'));
        const mySchedules = schSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FranchiseSchedule))
          .filter(s => !s.archived && s.supervisor === me.name);
        setMyStores(mySchedules);

        const todayYMD = toYMD(new Date());
        const rangeStart = toYMD(new Date(Date.now() - 3 * 86400000));  // 3일 전
        const rangeEnd   = toYMD(new Date(Date.now() + 30 * 86400000)); // 30일 후
        const events: ScheduleEvent[] = [];
        mySchedules.forEach(sch => {
          FRANCHISE_DATE_FIELDS.forEach(({ key, label }) => {
            const val = sch[key] as string | undefined;
            if (!val || typeof val !== 'string') return;
            if (val < rangeStart || val > rangeEnd) return;
            const diff = Math.round((new Date(val + 'T00:00:00').getTime() - new Date(todayYMD + 'T00:00:00').getTime()) / 86400000);
            events.push({ storeName: sch.storeName, storeNumber: sch.storeNumber, label, date: val, daysLeft: diff });
          });
        });
        events.sort((a, b) => a.date.localeCompare(b.date));
        setScheduleEvents(events);
      }
    } catch (e) {
      console.error('DailyReportView fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [date, currentUser.uid]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (tab !== 'week') return;
    setLoadingWeek(true);
    const endDate = new Date(weekViewStart + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = toYMD(endDate);
    getDocs(query(
      collection(salesDb, 'daily_reports'),
      where('date', '>=', weekViewStart),
      where('date', '<=', weekEnd),
    )).then(snap => {
      setWeekReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport)));
    }).catch(console.error).finally(() => setLoadingWeek(false));
  }, [tab, weekViewStart]);

  /* 출근 보고 제출 / 수정 */
  const submitMorning = async (submitted: MorningItem[]) => {
    try {
      const newItems: DailyReportItem[] = submitted.map(it => ({
        text: it.text, status: 'pending' as DailyItemStatus, progress: it.progress, memo: it.memo || undefined,
      }));
      if (isEditingMorning && myMorning) {
        await updateDoc(doc(salesDb, 'daily_reports', myMorning.id), {
          items: newItems, updatedAt: new Date().toISOString(),
        });
        saveMentions(submitted.map(it => it.text), 'daily', myMorning.id, `${date} 출근보고`, date);
        setIsEditingMorning(false);
        toast.success('출근 보고가 수정되었습니다');
      } else {
        const id = genId();
        await setDoc(doc(salesDb, 'daily_reports', id), {
          id, employeeId: myEmployee?.id ?? currentUser.uid, employeeName: currentUser.name ?? '',
          departmentId: myEmployee?.departmentId ?? '',
          date, type: 'morning', items: newItems,
          submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        saveMentions(submitted.map(it => it.text), 'daily', id, `${date} 출근보고`, date);
        toast.success('출근 보고 완료');
        setKakaoTarget({
          type: 'morning',
          items: submitted.map(it => it.progress > 0 ? `${it.text} [${it.progress}%]` : it.text),
        });
      }
      setPendingTaskTitles([]);
      fetchData();
    } catch (e) {
      console.error('submitMorning error:', e);
      toast.error('보고 저장 실패 — 네트워크 또는 권한 문제를 확인하세요');
    }
  };

  /* 퇴근 보고 제출 / 수정 */
  const submitEvening = async (items: DailyReportItem[]) => {
    if (!myMorning) return;
    try {
      if (isEditingEvening && myEvening) {
        await updateDoc(doc(salesDb, 'daily_reports', myEvening.id), {
          items, updatedAt: new Date().toISOString(),
        });
        await updateDoc(doc(salesDb, 'daily_reports', myMorning.id), {
          items, updatedAt: new Date().toISOString(),
        });
        setIsEditingEvening(false);
        toast.success('퇴근 보고가 수정되었습니다');
      } else {
        const id = genId();
        await setDoc(doc(salesDb, 'daily_reports', id), {
          id, employeeId: myMorning.employeeId, employeeName: myMorning.employeeName,
          departmentId: myMorning.departmentId,
          date, type: 'evening', items,
          submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        await updateDoc(doc(salesDb, 'daily_reports', myMorning.id), {
          items, updatedAt: new Date().toISOString(),
        });
        toast.success('퇴근 보고 완료');
        setKakaoTarget({
          type: 'evening',
          items: items.map((it, idx) => {
            const mp = myMorning?.items[idx]?.progress ?? 0;
            const ep = it.progress ?? 0;
            const delta = ep - mp;
            const progressStr = ep > 0 ? ` [${ep}%${delta > 0 ? ` +${delta}%` : ''}]` : '';
            if (it.status === 'done') return `${it.text} — 완료 ✓${progressStr}`;
            return `${it.text} — 진행중${it.note ? ` [${it.note}]` : ''}${progressStr}`;
          }),
        });
      }
      fetchData();
    } catch (e) {
      console.error('submitEvening error:', e);
      toast.error('보고 저장 실패 — 네트워크 또는 권한 문제를 확인하세요');
    }
  };

  /* 관리자 보고 확인 — 이후 수정 불가 */
  const confirmReport = async (report: DailyReport) => {
    await updateDoc(doc(salesDb, 'daily_reports', report.id), {
      confirmedAt: new Date().toISOString(),
      confirmedBy: currentUser.uid,
      confirmedByName: currentUser.name,
      updatedAt: new Date().toISOString(),
    });
    toast.success(`${report.employeeName}님의 ${report.type === 'morning' ? '출근' : '퇴근'} 보고를 확인했습니다`);
    fetchData();
  };

  /* 업무 인박스 → 오전 보고 폼에 항목 추가 (Firestore 저장 안 함) */
  const addTaskToMorning = (task: Task) => {
    if (!isToday) { toast.error('오늘 날짜에서만 추가할 수 있습니다'); return; }
    if (myMorning?.confirmedAt) { toast.error('관리자가 확인한 보고서는 수정할 수 없습니다'); return; }
    if (myMorning && !isEditingMorning) setIsEditingMorning(true);
    setPendingTaskTitles(prev => [...prev, task.title]);
    setMyTasks(prev => prev.filter(t => t.id !== task.id)); // 인박스에서 즉시 제거
  };

  /* 회의 실행항목 로드 */
  const loadMeetingActions = useCallback(async () => {
    if (loadingMeetings) return;
    setLoadingMeetings(true);
    try {
      const snap = await getDocs(query(collection(salesDb, 'meetings'), orderBy('date', 'desc')));
      const items: MeetingActionSource[] = [];
      snap.docs.slice(0, 10).forEach(d => {
        const m = d.data() as { title?: string; date?: string; actionItems?: Array<{ id: string; text: string; assignee?: string; done?: boolean }> };
        (m.actionItems ?? []).filter(a => !a.done).forEach(a => {
          items.push({ id: `${d.id}_${a.id}`, text: a.text, meetingTitle: m.title ?? '회의', meetingDate: m.date ?? '', assignee: a.assignee });
        });
      });
      setMeetingActions(items);
    } finally {
      setLoadingMeetings(false);
    }
  }, [loadingMeetings]);

  /* 회의 실행항목 → 오전 보고 폼에 추가 */
  const addMeetingItemToMorning = (item: MeetingActionSource) => {
    if (!isToday) { toast.error('오늘 날짜에서만 추가할 수 있습니다'); return; }
    if (myMorning?.confirmedAt) { toast.error('관리자가 확인한 보고서는 수정할 수 없습니다'); return; }
    if (myMorning && !isEditingMorning) setIsEditingMorning(true);
    setPendingTaskTitles(prev => [...prev, item.text]);
    setMeetingActions(prev => prev.filter(a => a.id !== item.id));
  };

  /* 업무 반려 */
  const rejectTask = async (task: Task, note: string) => {
    try {
      await updateDoc(doc(salesDb, 'tasks', task.id), {
        status: 'rejected',
        rejectionNote: note.trim() || '',
        updatedAt: new Date().toISOString(),
      });
      setMyTasks(prev => prev.filter(t => t.id !== task.id));
      toast.success(`"${task.title.slice(0, 15)}${task.title.length > 15 ? '…' : ''}" 반려됨`);
    } catch (e: any) {
      toast.error(`반려 실패: ${e?.message ?? '오류'}`);
    } finally {
      setRejectingTaskId(null);
      setRejectNote('');
    }
  };

  /* 주간보고 제출/수정 */
  const submitWeekly = async () => {
    const filled = weeklyForm.filter(it => it.title.trim());
    if (filled.length === 0) { toast.error('업무 항목을 최소 1건 입력해주세요'); return; }
    const { weekStart, weekEnd } = getWeekBounds();
    const now = new Date().toISOString();
    const id = myWeekly?.id ?? `wr_${Date.now()}`;
    const report: WeeklyReport = {
      id, employeeId: myEmployee?.id ?? currentUser.uid,
      employeeName: currentUser.name,
      departmentId: myEmployee?.departmentId ?? '',
      weekStart, weekEnd, items: filled,
      submittedAt: myWeekly?.submittedAt ?? now, updatedAt: now,
    };
    await setDoc(doc(salesDb, 'weekly_reports', id), report);
    toast.success(myWeekly ? '주간보고가 수정되었습니다' : '주간보고가 제출되었습니다');
    if (!myWeekly) setKakaoTarget({ type: 'weekly', items: filled.map(it => it.title), weekStart, weekEnd });
    fetchData();
  };

  const prevDate = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setDate(toYMD(d));
  };
  const nextDate = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setDate(toYMD(d));
  };
  const isToday = date === today();

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? '';

  /* 팀 현황: 직원별 오늘 보고 상태 */
  const teamStatus = employees.filter(e => e.isActive).map(emp => {
    const morning = reports.find(r => r.employeeId === emp.id && r.type === 'morning');
    const evening = reports.find(r => r.employeeId === emp.id && r.type === 'evening');
    return { emp, morning, evening };
  });

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">일일 업무보고</h1>
          <p className="text-sm text-stone-400 mt-0.5">{fmtDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDate} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"><ChevronLeft size={15} /></button>
          <button onClick={() => setDate(today())} disabled={isToday}
            className="px-3 py-1.5 text-xs font-bold border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40">
            오늘
          </button>
          <button onClick={nextDate} disabled={isToday} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 disabled:opacity-40"><ChevronRight size={15} /></button>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-5 border-b border-stone-200 dark:border-stone-700">
        {([
          { key: 'my',     label: '내 보고' },
          { key: 'team',   label: '팀 보고' },
          { key: 'weekly', label: '주간 보고' },
          { key: 'week',   label: '주간 현황' },
          ...(isAdmin ? [{ key: 'feed', label: '팀 피드' }] : []),
        ] as { key: 'my' | 'weekly' | 'feed' | 'team' | 'week'; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${tab === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">불러오는 중...</div>
      ) : tab === 'feed' ? (
        /* ── 팀 피드 탭 ── */
        <FeedView
          reports={reports}
          myId={myId}
          myName={currentUser.name}
          onRefresh={fetchData}
        />
      ) : tab === 'weekly' ? (
        /* ── 주간보고 탭 ── */
        <div className="max-w-xl">
          {/* 지난주 미완료 이월 배너 */}
          {weeklyCarryItems.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <XCircle size={12} /> 지난주 미완료 {weeklyCarryItems.length}건
                </p>
                <button onClick={() => {
                  setWeeklyForm(prev => {
                    const carry = weeklyCarryItems.map(it => ({ ...it, status: 'in_progress' as WeeklyReportItem['status'] }));
                    const existing = prev.filter(it => it.title.trim());
                    const blank = Array(Math.max(0, 4 - carry.length - existing.length)).fill({ title: '', status: 'planned' });
                    return [...carry, ...existing, ...blank].slice(0, Math.max(carry.length + existing.length + 1, 4));
                  });
                  setWeeklyCarryItems([]);
                }} className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
                  이번 주로 가져오기
                </button>
              </div>
              <div className="space-y-1">
                {weeklyCarryItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${WEEK_STATUS_CLS[it.status]}`}>{WEEK_STATUS_LABELS[it.status]}</span>
                    <span className="truncate">{it.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">주간 업무보고</p>
                <p className="text-xs text-stone-500 mt-0.5">{getWeekBounds().weekStart} ~ {getWeekBounds().weekEnd}</p>
              </div>
              {myWeekly && <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">제출 완료</span>}
            </div>
            <div className="px-6 py-4 space-y-4">
              {weeklyForm.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-[11px] font-black text-stone-500 shrink-0 mt-1">{i + 1}</span>
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={item.title}
                      onChange={e => setWeeklyForm(p => p.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                      placeholder={`굵직한 업무 ${i + 1}`}
                      className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                    />
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        value={item.detail ?? ''}
                        onChange={e => setWeeklyForm(p => p.map((x, idx) => idx === i ? { ...x, detail: e.target.value } : x))}
                        placeholder="상세 내용 (선택)"
                        className="flex-1 px-3 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                      />
                      <select
                        value={item.status}
                        onChange={e => setWeeklyForm(p => p.map((x, idx) => idx === i ? { ...x, status: e.target.value as WeeklyReportItem['status'] } : x))}
                        className="px-2 py-2 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500 sm:shrink-0"
                      >
                        {Object.entries(WEEK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex justify-end">
              <button onClick={submitWeekly} className="flex items-center gap-2 px-5 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
                <Send size={13} /> {myWeekly ? '수정 저장' : '주간보고 제출'}
              </button>
            </div>
          </div>

          {/* 담당 매장 현황 (SV용) */}
          {myStores.length > 0 && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-4 mb-4">
              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-3">담당 매장 현황</p>
              <div className="space-y-2">
                {myStores.map(s => (
                  <div key={s.id} className="flex items-start gap-3 text-xs">
                    <Store size={13} className="text-orange-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-900 dark:text-stone-100">{s.storeName} {s.storeNumber && `(${s.storeNumber}호)`}</p>
                      <p className="text-stone-400 mt-0.5 flex flex-wrap gap-2">
                        {s.openDate && <span>오픈 {s.openDate}</span>}
                        {s.trainingStart && <span>교육 {s.trainingStart}</span>}
                        {s.constructionEnd && <span>공사완료 {s.constructionEnd}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 팀 주간보고 목록 (관리자) */}
          {isAdmin && weeklyReports.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-stone-500 dark:text-stone-400 mb-2">이번 주 팀 제출 현황 ({weeklyReports.length}명)</p>
              {weeklyReports.map(wr => (
                <div key={wr.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{wr.employeeName}</span>
                    <span className="text-[11px] text-stone-400">{wr.updatedAt.slice(0, 10)}</span>
                  </div>
                  <div className="space-y-1">
                    {wr.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-stone-400 font-bold w-4">{i + 1}.</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${WEEK_STATUS_CLS[it.status]}`}>{WEEK_STATUS_LABELS[it.status]}</span>
                        <span className="text-stone-700 dark:text-stone-300 truncate">{it.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'my' ? (
        /* ── 내 보고 탭 ── */
        <div className="max-w-5xl space-y-4">
          {/* 오픈 일정 섹션 */}
          {scheduleEvents.length > 0 && (
            <div className="bg-white dark:bg-stone-900 border border-orange-200 dark:border-orange-800/50 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-100 dark:border-orange-900/30">
                <Store size={13} className="text-orange-500" />
                <span className="text-xs font-black text-stone-800 dark:text-stone-200">담당 오픈 일정</span>
                <span className="ml-auto text-[11px] font-bold text-stone-400">{myStores.length}개 매장</span>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {scheduleEvents.map((evt, i) => {
                  const isToday = evt.daysLeft === 0;
                  const isPast  = evt.daysLeft < 0;
                  const isUrgent = evt.daysLeft >= 0 && evt.daysLeft <= 3;
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <CalendarDays size={13} className={isToday ? 'text-red-500' : isUrgent ? 'text-amber-500' : 'text-stone-400'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                          {evt.storeName} {evt.storeNumber && `(${evt.storeNumber}호)`} {evt.label}
                        </p>
                        <p className={`text-[10px] font-semibold ${isToday ? 'text-red-500' : isPast ? 'text-stone-400' : isUrgent ? 'text-amber-600' : 'text-stone-400'}`}>
                          {evt.date}
                          {isToday ? ' · 오늘' : isPast ? ` · ${Math.abs(evt.daysLeft)}일 전` : ` · D-${evt.daysLeft}`}
                        </p>
                      </div>
                      <button
                        onClick={() => addTaskToMorning({ id: `sch_${i}`, title: `${evt.storeName} ${evt.label} (${evt.date})`, status: 'pending', sourceType: 'manual', assigneeId: myId, assigneeName: currentUser.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Task)}
                        disabled={!isToday}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold bg-orange-500 text-white rounded-lg hover:opacity-80 disabled:opacity-30 shrink-0"
                      >
                        <ArrowRight size={10} /> 폼에 추가
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DnD 컨텍스트: 업무 인박스 → 출근 보고 폼 드래그 ── */}
          <DndContext
            sensors={dndSensors}
            onDragStart={({ active }) => {
              const sid = active.id as string;
              if (sid.startsWith('task-')) {
                setDraggingTask(myTasks.find(t => t.id === sid.replace('task-', '')) ?? null);
              } else if (sid.startsWith('meeting-')) {
                setDraggingMeetingItem(meetingActions.find(a => a.id === sid.replace('meeting-', '')) ?? null);
              }
            }}
            onDragEnd={({ active, over }) => {
              const sid = active.id as string;
              if (sid.startsWith('task-') && over?.id === 'morning-form') {
                const task = myTasks.find(t => t.id === sid.replace('task-', ''));
                if (task) addTaskToMorning(task);
              } else if (sid.startsWith('meeting-') && over?.id === 'morning-form') {
                const item = meetingActions.find(a => a.id === sid.replace('meeting-', ''));
                if (item) addMeetingItemToMorning(item);
              }
              setDraggingTask(null);
              setDraggingMeetingItem(null);
            }}
            onDragCancel={() => { setDraggingTask(null); setDraggingMeetingItem(null); }}
          >
            <div className="flex flex-col lg:flex-row gap-4 items-start">

              {/* ── 왼쪽: 메인 폼 영역 ── */}
              <div className="flex-1 min-w-0 space-y-4 w-full">

                {/* 업무 인박스 */}
                {myTasks.length > 0 && (
                  <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                      <Briefcase size={13} className="text-stone-600 dark:text-stone-400" />
                      <span className="text-xs font-black text-stone-800 dark:text-stone-200">받은 업무 요청</span>
                      <span className="ml-auto text-[10px] text-stone-400 font-medium">드래그하거나 추가</span>
                      <span className="text-[11px] font-bold text-stone-400">{myTasks.length}건</span>
                    </div>
                    <div className="divide-y divide-stone-100 dark:divide-stone-800">
                      {myTasks.map(task => (
                        <DraggableTaskCard
                          key={task.id}
                          task={task}
                          onAdd={addTaskToMorning}
                          onReject={t => rejectTask(t, '')}
                          isToday={isToday}
                          rejectLabel={task.requesterName && task.requesterName !== task.assigneeName ? '반려' : '취소'}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!myEmployee && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">직원 명부에 계정이 연결되어 있지 않습니다. 관리자에게 문의하세요.</p>
                    <p className="text-[11px] text-amber-500 mt-0.5">연결 없이도 보고는 가능하지만 팀 현황에 표시되지 않습니다.</p>
                  </div>
                )}

                {/* 오전 보고 */}
                {(!myMorning || isEditingMorning) ? (
                  isToday ? (
                    <DroppableMorningZone active={draggingTask !== null || draggingMeetingItem !== null}>
                      <MorningForm
                        key={isEditingMorning ? 'edit' : 'new'}
                        onSubmit={submitMorning}
                        myId={myId}
                        editItems={isEditingMorning ? myMorning?.items : undefined}
                        pendingTaskTitles={pendingTaskTitles}
                      />
                    </DroppableMorningZone>
                  ) : (
                    <div className="text-center py-10 text-stone-400 text-sm">이 날의 보고가 없습니다</div>
                  )
                ) : (
                  <>
                    <ReportCard report={myMorning} onEdit={isToday && !myMorning.confirmedAt ? () => setIsEditingMorning(true) : undefined} isAdmin={isAdmin} onConfirm={isAdmin ? () => confirmReport(myMorning) : undefined} onCreateReport={onNavigateToReports}
                      onShare={() => shareDailyReport({
                        name: currentUser.name, date, type: 'morning',
                        items: myMorning.items.map(i => (i.progress ?? 0) > 0 ? `${i.text} [${i.progress}%]` : i.text),
                        onSuccess: toast.success, onError: toast.error,
                      })} />
                    {/* 퇴근 보고 */}
                    {(!myEvening || isEditingEvening) ? (
                      isToday ? (
                        <EveningForm
                          key={isEditingEvening ? 'edit' : 'new'}
                          morning={myMorning}
                          editItems={isEditingEvening ? myEvening?.items : undefined}
                          onSubmit={submitEvening}
                        />
                      ) : (
                        <div className="bg-stone-50 dark:bg-stone-800/50 border border-dashed border-stone-300 dark:border-stone-600 rounded-xl px-4 py-4 text-center text-xs text-stone-400">퇴근 보고 없음</div>
                      )
                    ) : (
                      <ReportCard
                        report={myEvening}
                        morningReport={myMorning}
                        onEdit={isToday && !myEvening.confirmedAt ? () => setIsEditingEvening(true) : undefined}
                        isAdmin={isAdmin}
                        onConfirm={isAdmin ? () => confirmReport(myEvening) : undefined}
                        onCreateReport={onNavigateToReports}
                        onShare={() => shareDailyReport({
                          name: currentUser.name, date, type: 'evening',
                          items: myEvening.items.map((it, idx) => {
                            const mp = myMorning?.items[idx]?.progress ?? 0;
                            const ep = it.progress ?? 0;
                            const delta = ep - mp;
                            const progressStr = ep > 0 ? ` [${ep}%${delta > 0 ? ` +${delta}%` : ''}]` : '';
                            if (it.status === 'done') return `${it.text} — 완료 ✓${progressStr}`;
                            return `${it.text} — 진행중${it.note ? ` [${it.note}]` : ''}${progressStr}`;
                          }),
                          onSuccess: toast.success, onError: toast.error,
                        })}
                      />
                    )}
                  </>
                )}
              </div>

              {/* ── 오른쪽: 회의 실행항목 패널 (오늘만) ── */}
              {isToday && (
                <div className="w-full lg:w-[576px] shrink-0 lg:sticky lg:top-4">
                  <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => {
                        const next = !showMeetingPanel;
                        setShowMeetingPanel(next);
                        if (next && meetingActions.length === 0) loadMeetingActions();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                    >
                      <FileText size={13} className="text-stone-500 dark:text-stone-400" />
                      <span className="text-xs font-black text-stone-800 dark:text-stone-200">회의 실행항목</span>
                      {meetingActions.length > 0 && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">{meetingActions.length}</span>
                      )}
                      <ChevronDown size={13} className={`text-stone-400 transition-transform ml-auto ${showMeetingPanel ? 'rotate-180' : ''}`} />
                    </button>
                    {showMeetingPanel && (
                      <div className="border-t border-stone-100 dark:border-stone-800">
                        <p className="px-4 py-2 text-[10px] text-stone-400">드래그하거나 + 버튼으로 보고서에 추가</p>
                        {loadingMeetings ? (
                          <div className="px-4 py-6 text-center text-xs text-stone-400">불러오는 중...</div>
                        ) : meetingActions.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-stone-400">미완료 실행항목이 없습니다</div>
                        ) : (
                          <div className="divide-y divide-stone-100 dark:divide-stone-800">
                            {meetingActions.map(item => (
                              <DraggableMeetingItem key={item.id} item={item} onAdd={addMeetingItemToMorning} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 드래그 오버레이 — 드래그 중인 카드 미리보기 */}
            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
              {(draggingTask || draggingMeetingItem) && (
                <div className="bg-white dark:bg-stone-900 border-2 border-blue-400 rounded-xl shadow-2xl px-4 py-3 max-w-xs rotate-1 opacity-95">
                  <div className="flex items-center gap-2">
                    <GripVertical size={13} className="text-blue-400 shrink-0" />
                    <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                      {draggingTask ? draggingTask.title : draggingMeetingItem?.text}
                    </p>
                  </div>
                  {draggingTask?.dueDate && (
                    <p className="text-[10px] text-red-400 mt-1 pl-5">~{draggingTask.dueDate}</p>
                  )}
                  <p className="text-[10px] text-blue-500 font-bold mt-1 pl-5">→ 보고서에 추가</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      ) : tab === 'week' ? (
        /* ── 주간 현황 탭 ── */
        <div>
          {/* 주간 네비게이션 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { const d = new Date(weekViewStart + 'T00:00:00'); d.setDate(d.getDate() - 7); setWeekViewStart(toYMD(d)); }}
              className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">◀</button>
            <div className="text-center">
              <p className="text-sm font-black text-stone-900 dark:text-white">
                {(() => {
                  const s = new Date(weekViewStart + 'T00:00:00');
                  const e = new Date(weekViewStart + 'T00:00:00'); e.setDate(e.getDate() + 6);
                  return `${s.getMonth() + 1}월 ${s.getDate()}일 (월) ~ ${e.getMonth() + 1}월 ${e.getDate()}일 (일)`;
                })()}
              </p>
              <button
                onClick={() => { const d = new Date(); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); setWeekViewStart(toYMD(mon)); }}
                className="text-[10px] text-blue-500 hover:underline mt-0.5">이번 주</button>
            </div>
            <button
              onClick={() => { const d = new Date(weekViewStart + 'T00:00:00'); d.setDate(d.getDate() + 7); setWeekViewStart(toYMD(d)); }}
              className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">▶</button>
          </div>

          {loadingWeek ? (
            <div className="text-center py-20 text-stone-400 text-sm">불러오는 중...</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
              {(() => {
                const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(weekViewStart + 'T00:00:00');
                  d.setDate(d.getDate() + i);
                  return toYMD(d);
                });
                const todayStr = today();
                return (
                  <table className="w-full border-collapse" style={{ minWidth: '860px' }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-stone-50 dark:bg-stone-800 px-3 py-2.5 text-left text-[10px] font-black text-stone-500 uppercase tracking-wider border-b border-r border-stone-200 dark:border-stone-700 w-24">
                          직원
                        </th>
                        {weekDays.map((day, i) => {
                          const d = new Date(day + 'T00:00:00');
                          const isToday = day === todayStr;
                          const isWeekend = i >= 5;
                          return (
                            <th key={day} className={`px-2 py-2 text-center border-b border-r last:border-r-0 border-stone-200 dark:border-stone-700 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : isWeekend ? 'bg-stone-50/80 dark:bg-stone-800/40' : 'bg-stone-50 dark:bg-stone-800/20'}`}>
                              <p className={`text-[11px] font-black ${isToday ? 'text-blue-600 dark:text-blue-400' : isWeekend ? 'text-stone-400' : 'text-stone-600 dark:text-stone-400'}`}>
                                {DAY_KR[d.getDay()]}
                              </p>
                              <p className={`text-[10px] ${isToday ? 'text-blue-500 font-bold' : 'text-stone-400'}`}>
                                {d.getMonth() + 1}/{d.getDate()}
                              </p>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {employees.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-12 text-sm text-stone-400">직원이 없습니다</td></tr>
                      ) : employees.map((emp, ri) => (
                        <tr key={emp.id} className={ri % 2 === 0 ? 'bg-white dark:bg-stone-900' : 'bg-stone-50/40 dark:bg-stone-800/20'}>
                          {/* 직원명 고정 */}
                          <td className={`sticky left-0 z-10 px-3 py-2.5 border-r border-stone-200 dark:border-stone-700 ${ri % 2 === 0 ? 'bg-white dark:bg-stone-900' : 'bg-stone-50 dark:bg-stone-800/40'}`}>
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[9px] font-black text-stone-600 dark:text-stone-300 shrink-0">
                                {emp.name[0]}
                              </div>
                              <span className="text-[11px] font-bold text-stone-700 dark:text-stone-300 truncate max-w-[60px]">{emp.name}</span>
                            </div>
                          </td>
                          {/* 요일별 셀 */}
                          {weekDays.map((day, ci) => {
                            const morning = weekReports.find(r => r.employeeId === emp.id && r.date === day && r.type === 'morning') ?? null;
                            const evening = weekReports.find(r => r.employeeId === emp.id && r.date === day && r.type === 'evening') ?? null;
                            const displayReport = evening ?? morning;
                            const isToday = day === todayStr;
                            const isWeekend = ci >= 5;
                            const hasReport = !!(morning || evening);
                            return (
                              <td
                                key={day}
                                onClick={() => hasReport && setDayPopup({ date: day, emp, morning, evening })}
                                className={`px-2 py-2 align-top border-r last:border-r-0 border-stone-100 dark:border-stone-800 min-w-[110px] ${hasReport ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors' : ''} ${isToday && !isWeekend ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''} ${isWeekend ? 'bg-stone-50/50 dark:bg-stone-800/10' : ''}`}
                              >
                                {displayReport ? (
                                  <div className="space-y-0.5 min-h-[56px]">
                                    <div className="flex gap-1 mb-1">
                                      {morning && <span className="text-[8px] font-bold text-amber-500">☀</span>}
                                      {evening && <span className="text-[8px] font-bold text-indigo-500">🌙</span>}
                                    </div>
                                    {displayReport.items.slice(0, 4).map((it, idx) => {
                                      const dot = it.status === 'done' ? '✓' : it.status === 'incomplete' ? '✗' : '●';
                                      const dotCls = it.status === 'done' ? 'text-emerald-500' : it.status === 'incomplete' ? 'text-red-500' : 'text-amber-500';
                                      return (
                                        <div key={idx} className="flex items-start gap-1">
                                          <span className={`text-[9px] font-bold shrink-0 mt-px ${dotCls}`}>{dot}</span>
                                          <span className={`text-[10px] leading-tight break-words ${it.status === 'done' ? 'line-through text-stone-400' : it.status === 'incomplete' ? 'text-red-500 dark:text-red-400' : 'text-stone-700 dark:text-stone-300'}`}>
                                            {it.text}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    {displayReport.items.length > 4 && (
                                      <p className="text-[9px] text-stone-400 pl-3">+{displayReport.items.length - 4}개 더</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="min-h-[56px] flex items-center justify-center">
                                    <span className="text-[11px] text-stone-200 dark:text-stone-700 select-none">—</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}

          {/* 범례 */}
          <div className="flex gap-4 mt-3 flex-wrap">
            {[['text-emerald-500', '✓', '완료'], ['text-amber-500', '●', '진행중'], ['text-red-500', '✗', '미완료']].map(([cls, dot, label]) => (
              <div key={label} className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400">
                <span className={`font-bold ${cls}`}>{dot}</span> {label}
              </div>
            ))}
            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400"><span className="font-bold text-amber-500">☀</span> 출근보고</div>
            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400"><span className="font-bold text-indigo-500">🌙</span> 퇴근보고</div>
          </div>

          {/* 날짜 상세 팝업 */}
          {dayPopup && (
            <DayDetailPopup
              date={dayPopup.date}
              emp={dayPopup.emp}
              morning={dayPopup.morning}
              evening={dayPopup.evening}
              onClose={() => setDayPopup(null)}
            />
          )}
        </div>

      ) : (
        /* ── 팀 보고 탭 (전직원) ── */
        <div className="space-y-3">
          {/* 요약 스트립 */}
          <div className="flex gap-3 text-xs flex-wrap">
            <span className="font-bold text-stone-500">
              출근 <span className="text-blue-600 dark:text-blue-400">{teamStatus.filter(s => s.morning).length}</span>/{teamStatus.length}
            </span>
            <span className="text-stone-300">·</span>
            <span className="font-bold text-stone-500">
              퇴근 <span className="text-emerald-600 dark:text-emerald-400">{teamStatus.filter(s => s.evening).length}</span>/{teamStatus.length}
            </span>
            <span className="text-stone-300">·</span>
            <span className="font-bold text-stone-500">{fmtDate(date)}</span>
          </div>

          {/* 직원 카드 — 출근+퇴근 묶음 */}
          {teamStatus.length === 0 ? (
            <p className="text-center py-10 text-stone-400 text-sm">직원 명부에 등록된 직원이 없습니다</p>
          ) : (
            teamStatus.map(({ emp, morning, evening }) => {
              const submitted = morning || evening;
              const doneCount = evening ? evening.items.filter(it => it.status === 'done').length : 0;
              const total = evening ? evening.items.length : 0;
              const pct = total ? Math.round(doneCount / total * 100) : null;
              return (
                <div key={emp.id} className={`bg-white dark:bg-stone-900 border rounded-2xl overflow-hidden ${submitted ? 'border-stone-200 dark:border-stone-700' : 'border-dashed border-stone-200 dark:border-stone-700 opacity-60'}`}>
                  {/* 헤더 — 이름 + 상태 */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${submitted ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'}`}>
                      {emp.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-stone-900 dark:text-stone-100">{emp.name}</p>
                      <p className="text-[10px] text-stone-400">{emp.position}{emp.departmentId ? ` · ${getDeptName(emp.departmentId)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${morning ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-stone-100 text-stone-300 dark:bg-stone-800 dark:text-stone-600'}`}>
                        {morning ? '출근 ✓' : '출근 미제출'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        !evening ? 'bg-stone-100 text-stone-300 dark:bg-stone-800 dark:text-stone-600'
                        : pct === 100 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {evening ? `퇴근 ${doneCount}/${total}` : '퇴근 미제출'}
                      </span>
                    </div>
                  </div>

                  {/* 업무 목록 — 출근 제출 기준, 퇴근 상태 반영 */}
                  {morning && (
                    <div className="px-4 py-3 space-y-1.5">
                      {(evening ?? morning).items.map((it, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[10px] text-stone-300 w-4 text-right font-bold mt-0.5">{i + 1}</span>
                          <span className={`mt-0.5 ${STATUS_CONFIG[it.status].cls} shrink-0`}>{STATUS_CONFIG[it.status].icon}</span>
                          <span className={`text-xs flex-1 leading-snug ${it.status === 'done' ? 'line-through text-stone-400' : it.status === 'incomplete' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-stone-700 dark:text-stone-300'}`}>
                            {it.text}
                          </span>
                          {it.status === 'incomplete' && it.note && (
                            <span className="text-[10px] text-stone-400 truncate max-w-[120px] shrink-0">{it.note}</span>
                          )}
                        </div>
                      ))}
                      {/* 관리자만: 확인 버튼 */}
                      {isAdmin && (morning.confirmedAt ? (
                        <p className="text-[10px] text-emerald-500 text-right pt-1">✓ {morning.confirmedByName ?? '관리자'} 확인</p>
                      ) : (
                        <div className="flex justify-end gap-2 pt-1">
                          {!morning.confirmedAt && <button onClick={() => confirmReport(morning)} className="text-[10px] font-bold text-blue-500 hover:underline">출근 확인</button>}
                          {evening && !evening.confirmedAt && <button onClick={() => confirmReport(evening)} className="text-[10px] font-bold text-emerald-500 hover:underline">퇴근 확인</button>}
                        </div>
                      ))}
                    </div>
                  )}

                  {!submitted && (
                    <p className="text-center text-[11px] text-stone-300 dark:text-stone-700 py-3">오늘 보고 없음</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 보고 후 카톡 공유 제안 */}
      {kakaoTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-stone-200 dark:border-stone-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0 text-xl">💬</div>
              <div>
                <p className="text-sm font-black text-stone-900 dark:text-white">
                  {kakaoTarget.type === 'morning' ? '출근' : kakaoTarget.type === 'evening' ? '퇴근' : '주간'} 보고 완료
                </p>
                <p className="text-[11px] text-stone-400">카톡으로 공유하시겠어요?</p>
              </div>
            </div>
            <div className="bg-stone-50 dark:bg-stone-800 rounded-xl px-4 py-3 mb-5 space-y-1 max-h-32 overflow-y-auto">
              {kakaoTarget.items.slice(0, 5).map((t, i) => (
                <p key={i} className="text-xs text-stone-600 dark:text-stone-300">{i + 1}. {t}</p>
              ))}
              {kakaoTarget.items.length > 5 && <p className="text-[10px] text-stone-400">외 {kakaoTarget.items.length - 5}건</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                if (kakaoTarget.type === 'weekly') {
                  shareWeeklyReport({ name: currentUser.name, weekStart: kakaoTarget.weekStart!, weekEnd: kakaoTarget.weekEnd!, items: kakaoTarget.items.map(t => ({ title: t, status: 'in_progress' })), onSuccess: toast.success, onError: toast.error });
                } else {
                  shareDailyReport({ name: currentUser.name, date, type: kakaoTarget.type as 'morning' | 'evening', items: kakaoTarget.items, onSuccess: toast.success, onError: toast.error });
                }
                setKakaoTarget(null);
              }}
                className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-stone-900 text-sm font-black rounded-xl flex items-center justify-center gap-2">
                <span>💬</span> 카톡 공유
              </button>
              <button onClick={() => setKakaoTarget(null)}
                className="flex-1 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-sm font-bold rounded-xl hover:opacity-80">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
