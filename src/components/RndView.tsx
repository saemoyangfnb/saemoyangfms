// R&D 관리대장 — 소스·반찬 제조실 연구개발 통합 관리 (관리대장 / 일일 기록 / 주간 보고 / 월별 계획 + 인쇄)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy,
} from 'firebase/firestore';
import {
  RndItem, RndDailyLog, RndWeeklyReport, RndMonthlyPlan,
  RndCategory, RndPriority, RndStatus, User,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { shareKakao } from '../utils/kakao';
import {
  Plus, X, Edit2, Trash2, ChevronUp, ChevronDown,
  Printer, MessageCircle, FlaskConical, ClipboardList,
  CalendarDays, CalendarRange, NotebookPen,
} from 'lucide-react';

// ── 기준정보 (엑셀 '기준정보' 시트 대체) ─────────────────────
const RND_STAGES = [
  { stage: 1, label: '기획', pct: 10 },
  { stage: 2, label: '레시피 개발', pct: 30 },
  { stage: 3, label: '시제품/테스트', pct: 50 },
  { stage: 4, label: '내부 품평', pct: 70 },
  { stage: 5, label: '원가/스펙 확정', pct: 85 },
  { stage: 6, label: '매뉴얼화/출시', pct: 100 },
];
const CATEGORIES: RndCategory[] = ['소스', '반찬', '양념/베이스', '기타'];
const PRIORITIES: RndPriority[] = ['상', '중', '하'];
const STATUSES: RndStatus[] = ['진행중', '보류', '완료', '중단'];

const stagePct = (stage: number) => RND_STAGES.find(s => s.stage === stage)?.pct ?? 0;
const stageLabel = (stage: number) => {
  const s = RND_STAGES.find(x => x.stage === stage);
  return s ? `${s.stage}. ${s.label}` : '-';
};

const STATUS_BADGE: Record<RndStatus, string> = {
  '진행중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '보류':   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '완료':   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  '중단':   'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
};
const PRIORITY_BADGE: Record<RndPriority, string> = {
  '상': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '하': 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
};

// ── 유틸 ──────────────────────────────────────────────────
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYMD = () => toYMD(new Date());
const ts = () => new Date().toISOString();
const genId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
// Firestore는 undefined 값을 거부 — 저장 전 제거
const scrub = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const fmtDateShort = (ymd: string) => {
  const d = new Date(ymd + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const dday = (target?: string): number | null => {
  if (!target) return null;
  return Math.round(
    (new Date(target + 'T00:00:00').getTime() - new Date(todayYMD() + 'T00:00:00').getTime()) / 86400000
  );
};
const fmtDday = (n: number) => (n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`);

// 이번 주 월~일
const currentWeekRange = (): [string, string] => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 월=0
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [toYMD(mon), toYMD(sun)];
};

const inputCls = 'w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400';
const labelCls = 'block text-[11px] font-bold text-stone-500 mb-1';

// ── 공용 모달 셸 ───────────────────────────────────────────
function ModalShell({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-sm'} border border-stone-200 dark:border-stone-700 flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3.5 overflow-y-auto flex-1">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700 shrink-0">{footer}</div>
      </div>
    </div>
  );
}

function FooterButtons({ onClose, onSave, disabled, saveLabel }: {
  onClose: () => void; onSave: () => void; disabled: boolean; saveLabel: string;
}) {
  return (
    <>
      <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
      <button onClick={onSave} disabled={disabled}
        className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
        {saveLabel}
      </button>
    </>
  );
}

// ── 품목 등록/수정 모달 ────────────────────────────────────
type RndItemDraft = Omit<RndItem, 'id' | 'order' | 'createdAt' | 'updatedAt'>;
function ItemFormModal({ item, onSave, onClose }: {
  item?: RndItem; onSave: (data: RndItemDraft) => void; onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<RndCategory>(item?.category ?? '소스');
  const [assignee, setAssignee] = useState(item?.assignee ?? '');
  const [priority, setPriority] = useState<RndPriority>(item?.priority ?? '중');
  const [startDate, setStartDate] = useState(item?.startDate ?? todayYMD());
  const [targetDate, setTargetDate] = useState(item?.targetDate ?? '');
  const [stage, setStage] = useState(item?.stage ?? 1);
  const [status, setStatus] = useState<RndStatus>(item?.status ?? '진행중');
  const [thisWeekNote, setThisWeekNote] = useState(item?.thisWeekNote ?? '');
  const [nextAction, setNextAction] = useState(item?.nextAction ?? '');
  const [note, setNote] = useState(item?.note ?? '');

  const save = () => name.trim() && onSave({
    name: name.trim(), category, assignee: assignee.trim() || undefined, priority,
    startDate: startDate || undefined, targetDate: targetDate || undefined,
    stage, status,
    thisWeekNote: thisWeekNote.trim() || undefined,
    nextAction: nextAction.trim() || undefined,
    note: note.trim() || undefined,
  });

  return (
    <ModalShell title={item ? '품목 수정' : 'R&D 품목 등록'} onClose={onClose} wide
      footer={<FooterButtons onClose={onClose} onSave={save} disabled={!name.trim()} saveLabel={item ? '저장' : '등록'} />}>
      <div>
        <label className={labelCls}>품목명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 고등어 데리야끼 소스" autoFocus className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>카테고리</label>
          <select value={category} onChange={e => setCategory(e.target.value as RndCategory)} className={inputCls}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>담당자</label>
          <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="이름" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>우선순위</label>
          <select value={priority} onChange={e => setPriority(e.target.value as RndPriority)} className={inputCls}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>시작일</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>목표 완료일 <span className="text-stone-400 font-normal">— D-Day 자동</span></label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>현재 단계 <span className="text-stone-400 font-normal">— 진행률 자동</span></label>
          <select value={stage} onChange={e => setStage(Number(e.target.value))} className={inputCls}>
            {RND_STAGES.map(s => <option key={s.stage} value={s.stage}>{s.stage}. {s.label} ({s.pct}%)</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>상태</label>
          <select value={status} onChange={e => setStatus(e.target.value as RndStatus)} className={inputCls}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>금주 진행 내용</label>
        <textarea value={thisWeekNote} onChange={e => setThisWeekNote(e.target.value)} rows={2} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>다음 액션</label>
        <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>비고</label>
        <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
      </div>
    </ModalShell>
  );
}

// ── 일일 기록 모달 ─────────────────────────────────────────
type RndDailyDraft = Omit<RndDailyLog, 'id' | 'author' | 'createdAt' | 'updatedAt'>;
function DailyLogModal({ log, items, onSave, onClose }: {
  log?: RndDailyLog; items: RndItem[]; onSave: (data: RndDailyDraft) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(log?.date ?? todayYMD());
  const [itemId, setItemId] = useState(log?.itemId ?? (items[0]?.id ?? ''));
  const [workContent, setWorkContent] = useState(log?.workContent ?? '');
  const [resultIssue, setResultIssue] = useState(log?.resultIssue ?? '');
  const [nextPlan, setNextPlan] = useState(log?.nextPlan ?? '');

  const valid = !!itemId && !!workContent.trim();
  const save = () => valid && onSave({
    date, itemId, workContent: workContent.trim(),
    resultIssue: resultIssue.trim() || undefined,
    nextPlan: nextPlan.trim() || undefined,
  });

  return (
    <ModalShell title={log ? '일일 기록 수정' : '일일 기록 추가'} onClose={onClose} wide
      footer={<FooterButtons onClose={onClose} onSave={save} disabled={!valid} saveLabel="저장" />}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>날짜</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>품목 *</label>
          <select value={itemId} onChange={e => setItemId(e.target.value)} className={inputCls}>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>금일 작업 내용 *</label>
        <textarea value={workContent} onChange={e => setWorkContent(e.target.value)} rows={3} autoFocus className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>결과 / 이슈</label>
        <textarea value={resultIssue} onChange={e => setResultIssue(e.target.value)} rows={2} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>익일 계획</label>
        <input value={nextPlan} onChange={e => setNextPlan(e.target.value)} className={inputCls} />
      </div>
    </ModalShell>
  );
}

// ── 주간 보고 모달 ─────────────────────────────────────────
type RndWeeklyDraft = Omit<RndWeeklyReport, 'id' | 'createdAt' | 'updatedAt'>;
function WeeklyModal({ report, items, onSave, onClose }: {
  report?: RndWeeklyReport; items: RndItem[]; onSave: (data: RndWeeklyDraft) => void; onClose: () => void;
}) {
  const [defStart, defEnd] = currentWeekRange();
  const [periodStart, setPeriodStart] = useState(report?.periodStart ?? defStart);
  const [periodEnd, setPeriodEnd] = useState(report?.periodEnd ?? defEnd);
  const [itemId, setItemId] = useState(report?.itemId ?? (items[0]?.id ?? ''));
  const [progressNote, setProgressNote] = useState(report?.progressNote ?? '');
  const [issueRisk, setIssueRisk] = useState(report?.issueRisk ?? '');
  const [nextWeekPlan, setNextWeekPlan] = useState(report?.nextWeekPlan ?? '');
  const [supportRequest, setSupportRequest] = useState(report?.supportRequest ?? '');

  const valid = !!itemId && !!progressNote.trim() && !!periodStart && !!periodEnd;
  const save = () => valid && onSave({
    periodStart, periodEnd, itemId, progressNote: progressNote.trim(),
    issueRisk: issueRisk.trim() || undefined,
    nextWeekPlan: nextWeekPlan.trim() || undefined,
    supportRequest: supportRequest.trim() || undefined,
  });

  return (
    <ModalShell title={report ? '주간 보고 수정' : '주간 보고 작성'} onClose={onClose} wide
      footer={<FooterButtons onClose={onClose} onSave={save} disabled={!valid} saveLabel="저장" />}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>기간 시작</label>
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>기간 종료</label>
          <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>품목 *</label>
        <select value={itemId} onChange={e => setItemId(e.target.value)} className={inputCls}>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>금주 진행 사항 *</label>
        <textarea value={progressNote} onChange={e => setProgressNote(e.target.value)} rows={3} autoFocus className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>이슈 / 리스크</label>
        <textarea value={issueRisk} onChange={e => setIssueRisk(e.target.value)} rows={2} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>차주 계획</label>
        <textarea value={nextWeekPlan} onChange={e => setNextWeekPlan(e.target.value)} rows={2} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>지원 요청 사항</label>
        <input value={supportRequest} onChange={e => setSupportRequest(e.target.value)} className={inputCls} />
      </div>
    </ModalShell>
  );
}

// ── 월별 계획 모달 ─────────────────────────────────────────
type RndMonthlyDraft = Omit<RndMonthlyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;
function MonthlyModal({ plan, month, items, onSave, onClose }: {
  plan?: RndMonthlyPlan; month: string; items: RndItem[]; onSave: (data: RndMonthlyDraft) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(plan?.title ?? '');
  const [assignee, setAssignee] = useState(plan?.assignee ?? '');
  const [monthGoal, setMonthGoal] = useState(plan?.monthGoal ?? '');
  const [weekPlans, setWeekPlans] = useState<string[]>(() => {
    const w = plan?.weekPlans ?? [];
    return [0, 1, 2, 3, 4].map(i => w[i] ?? '');
  });
  const [targetDate, setTargetDate] = useState(plan?.targetDate ?? '');
  const [note, setNote] = useState(plan?.note ?? '');

  const save = () => title.trim() && onSave({
    month: plan?.month ?? month,
    title: title.trim(),
    assignee: assignee.trim() || undefined,
    monthGoal: monthGoal.trim() || undefined,
    weekPlans: weekPlans.map(w => w.trim()),
    targetDate: targetDate || undefined,
    note: note.trim() || undefined,
  });

  return (
    <ModalShell title={plan ? '월별 계획 수정' : `${month} 월별 계획 추가`} onClose={onClose} wide
      footer={<FooterButtons onClose={onClose} onSave={save} disabled={!title.trim()} saveLabel="저장" />}>
      <div>
        <label className={labelCls}>품목 / 과제 * <span className="text-stone-400 font-normal">— 관리대장 품목 외 자유 입력 가능</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} list="rnd-item-names" autoFocus className={inputCls} />
        <datalist id="rnd-item-names">
          {items.map(i => <option key={i.id} value={i.name} />)}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>담당자</label>
          <input value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>목표 완료일</label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>월 목표</label>
        <textarea value={monthGoal} onChange={e => setMonthGoal(e.target.value)} rows={2} className={inputCls} />
      </div>
      {weekPlans.map((w, i) => (
        <div key={i}>
          <label className={labelCls}>W{i + 1} 계획</label>
          <input value={w} onChange={e => setWeekPlans(p => p.map((v, idx) => idx === i ? e.target.value : v))} className={inputCls} />
        </div>
      ))}
      <div>
        <label className={labelCls}>비고</label>
        <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
      </div>
    </ModalShell>
  );
}

// ── 메인 RndView ───────────────────────────────────────────
type RndTab = 'board' | 'daily' | 'weekly' | 'monthly';

export function RndView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [items, setItems] = useState<RndItem[]>([]);
  const [dailyLogs, setDailyLogs] = useState<RndDailyLog[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<RndWeeklyReport[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<RndMonthlyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RndTab>('board');

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RndItem | null>(null);
  const [showDailyForm, setShowDailyForm] = useState(false);
  const [editingDaily, setEditingDaily] = useState<RndDailyLog | null>(null);
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [editingWeekly, setEditingWeekly] = useState<RndWeeklyReport | null>(null);
  const [showMonthlyForm, setShowMonthlyForm] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState<RndMonthlyPlan | null>(null);

  const [dailyFilterItemId, setDailyFilterItemId] = useState('');
  const [month, setMonth] = useState(todayYMD().slice(0, 7));

  // ── 로드 ───────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemSnap, dailySnap, weeklySnap, monthlySnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'rnd_items'), orderBy('order'))),
        getDocs(query(collection(salesDb, 'rnd_daily'), orderBy('date', 'desc'))),
        getDocs(query(collection(salesDb, 'rnd_weekly'), orderBy('periodStart', 'desc'))),
        getDocs(query(collection(salesDb, 'rnd_monthly'), orderBy('order'))),
      ]);
      setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() } as RndItem)));
      setDailyLogs(dailySnap.docs.map(d => ({ id: d.id, ...d.data() } as RndDailyLog)));
      setWeeklyReports(weeklySnap.docs.map(d => ({ id: d.id, ...d.data() } as RndWeeklyReport)));
      setMonthlyPlans(monthlySnap.docs.map(d => ({ id: d.id, ...d.data() } as RndMonthlyPlan)));
    } catch (e) { console.error('RndView loadAll error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const itemName = useCallback(
    (id: string) => items.find(i => i.id === id)?.name ?? '(삭제된 품목)',
    [items]);

  // ── 품목 CRUD ──────────────────────────────────────────
  const handleSaveItem = async (data: RndItemDraft) => {
    try {
      if (editingItem) {
        await updateDoc(doc(salesDb, 'rnd_items', editingItem.id),
          scrub({ ...data, updatedAt: ts() } as Record<string, unknown>));
        toast.success('수정됨');
      } else {
        const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
        const id = genId('ri');
        await setDoc(doc(salesDb, 'rnd_items', id),
          scrub({ ...data, id, order: maxOrder + 1, createdAt: ts(), updatedAt: ts() } as Record<string, unknown>));
        toast.success('품목 등록됨');
      }
      setShowItemForm(false); setEditingItem(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteItem = async (item: RndItem) => {
    const ok = await confirm({ title: '품목 삭제', message: `"${item.name}" 품목을 삭제합니다. 일일/주간 기록은 남지만 품목명이 표시되지 않습니다. 계속할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'rnd_items', item.id));
      toast.success('삭제됨');
      await loadAll();
    } catch { toast.error('삭제 실패'); }
  };

  const handleMoveItem = async (idx: number, dir: 'up' | 'down') => {
    const newItems = [...items];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    setItems(newItems);
    try {
      await Promise.all(newItems.map((it, i) => updateDoc(doc(salesDb, 'rnd_items', it.id), { order: i, updatedAt: ts() })));
    } catch { toast.error('순서 변경 실패'); await loadAll(); }
  };

  // 표에서 단계/상태 바로 변경
  const handleInlineUpdate = async (item: RndItem, patch: Partial<Pick<RndItem, 'stage' | 'status'>>) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    try {
      await updateDoc(doc(salesDb, 'rnd_items', item.id), { ...patch, updatedAt: ts() });
    } catch { toast.error('저장 실패'); await loadAll(); }
  };

  // ── 일일/주간/월별 CRUD ────────────────────────────────
  const handleSaveDaily = async (data: RndDailyDraft) => {
    try {
      if (editingDaily) {
        await updateDoc(doc(salesDb, 'rnd_daily', editingDaily.id),
          scrub({ ...data, updatedAt: ts() } as Record<string, unknown>));
      } else {
        const id = genId('rd');
        await setDoc(doc(salesDb, 'rnd_daily', id),
          scrub({ ...data, id, author: currentUser.name, createdAt: ts(), updatedAt: ts() } as Record<string, unknown>));
      }
      toast.success('저장됨');
      setShowDailyForm(false); setEditingDaily(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteDaily = async (log: RndDailyLog) => {
    const ok = await confirm({ title: '기록 삭제', message: `${log.date} 일일 기록을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try { await deleteDoc(doc(salesDb, 'rnd_daily', log.id)); toast.success('삭제됨'); await loadAll(); }
    catch { toast.error('삭제 실패'); }
  };

  const handleSaveWeekly = async (data: RndWeeklyDraft) => {
    try {
      if (editingWeekly) {
        await updateDoc(doc(salesDb, 'rnd_weekly', editingWeekly.id),
          scrub({ ...data, updatedAt: ts() } as Record<string, unknown>));
      } else {
        const id = genId('rw');
        await setDoc(doc(salesDb, 'rnd_weekly', id),
          scrub({ ...data, id, createdAt: ts(), updatedAt: ts() } as Record<string, unknown>));
      }
      toast.success('저장됨');
      setShowWeeklyForm(false); setEditingWeekly(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteWeekly = async (r: RndWeeklyReport) => {
    const ok = await confirm({ title: '주간 보고 삭제', message: `"${itemName(r.itemId)}" 주간 보고를 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try { await deleteDoc(doc(salesDb, 'rnd_weekly', r.id)); toast.success('삭제됨'); await loadAll(); }
    catch { toast.error('삭제 실패'); }
  };

  const handleSaveMonthly = async (data: RndMonthlyDraft) => {
    try {
      if (editingMonthly) {
        await updateDoc(doc(salesDb, 'rnd_monthly', editingMonthly.id),
          scrub({ ...data, updatedAt: ts() } as Record<string, unknown>));
      } else {
        const maxOrder = monthlyPlans.reduce((m, p) => Math.max(m, p.order), -1);
        const id = genId('rm');
        await setDoc(doc(salesDb, 'rnd_monthly', id),
          scrub({ ...data, id, order: maxOrder + 1, createdAt: ts(), updatedAt: ts() } as Record<string, unknown>));
      }
      toast.success('저장됨');
      setShowMonthlyForm(false); setEditingMonthly(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteMonthly = async (p: RndMonthlyPlan) => {
    const ok = await confirm({ title: '계획 삭제', message: `"${p.title}" 월별 계획을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try { await deleteDoc(doc(salesDb, 'rnd_monthly', p.id)); toast.success('삭제됨'); await loadAll(); }
    catch { toast.error('삭제 실패'); }
  };

  // ── 집계 ───────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = items.length;
    const count = (s: RndStatus) => items.filter(i => i.status === s).length;
    const avgPct = total > 0 ? Math.round(items.reduce((s, i) => s + stagePct(i.stage), 0) / total) : 0;
    return { total, ongoing: count('진행중'), hold: count('보류'), done: count('완료'), avgPct };
  }, [items]);

  const filteredDaily = useMemo(
    () => dailyFilterItemId ? dailyLogs.filter(l => l.itemId === dailyFilterItemId) : dailyLogs,
    [dailyLogs, dailyFilterItemId]);

  const dailyByDate = useMemo(() => {
    const map = new Map<string, RndDailyLog[]>();
    filteredDaily.forEach(l => {
      if (!map.has(l.date)) map.set(l.date, []);
      map.get(l.date)!.push(l);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredDaily]);

  const weeklyGroups = useMemo(() => {
    const map = new Map<string, RndWeeklyReport[]>();
    weeklyReports.forEach(r => {
      const key = `${r.periodStart}|${r.periodEnd}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [weeklyReports]);

  const monthPlans = useMemo(
    () => monthlyPlans.filter(p => p.month === month),
    [monthlyPlans, month]);

  // ── 카톡 공유 ──────────────────────────────────────────
  const shareBoard = () => {
    const active = items.filter(i => i.status !== '중단');
    const lines = active.map(i => {
      const d = i.status !== '완료' ? dday(i.targetDate) : null;
      return `${i.name} — ${stageLabel(i.stage)} ${stagePct(i.stage)}%${d != null ? ` (${fmtDday(d)})` : ''}${i.status !== '진행중' ? ` [${i.status}]` : ''}`;
    });
    const today = new Date();
    shareKakao({
      title: `R&D 진행 현황 — ${today.getMonth() + 1}/${today.getDate()}`,
      body: [`진행중 ${summary.ongoing} · 완료 ${summary.done} · 평균 ${summary.avgPct}%`, ...lines].join('\n'),
      onSuccess: msg => toast.success(msg), onError: msg => toast.error(msg),
    });
  };

  const shareWeekly = (key: string, reports: RndWeeklyReport[]) => {
    const [ps, pe] = key.split('|');
    const blocks = reports.map(r => {
      const lines = [`■ ${itemName(r.itemId)}`, `- 진행: ${r.progressNote}`];
      if (r.issueRisk) lines.push(`- 이슈: ${r.issueRisk}`);
      if (r.nextWeekPlan) lines.push(`- 차주: ${r.nextWeekPlan}`);
      if (r.supportRequest) lines.push(`- 요청: ${r.supportRequest}`);
      return lines.join('\n');
    });
    shareKakao({
      title: `R&D 주간보고 (${fmtDateShort(ps)}~${fmtDateShort(pe)})`,
      body: blocks.join('\n\n'),
      onSuccess: msg => toast.success(msg), onError: msg => toast.error(msg),
    });
  };

  // ── 렌더 ───────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  const TABS: { id: RndTab; label: string; icon: React.ReactNode }[] = [
    { id: 'board',   label: '관리대장',  icon: <ClipboardList size={13} /> },
    { id: 'daily',   label: '일일 기록', icon: <NotebookPen size={13} /> },
    { id: 'weekly',  label: '주간 보고', icon: <CalendarDays size={13} /> },
    { id: 'monthly', label: '월별 계획', icon: <CalendarRange size={13} /> },
  ];

  const cellCls = 'px-2 py-2 border-b border-stone-100 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300';

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2">
            <FlaskConical size={18} /> R&D 관리대장
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">소스·반찬 제조실 연구개발 — 관리대장 · 일일 · 주간 · 월별</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'board' && (
            <button onClick={shareBoard} disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 text-xs font-bold rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-40">
              <MessageCircle size={12} /> 카톡 복사
            </button>
          )}
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 text-xs font-bold rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
            <Printer size={12} /> 인쇄
          </button>
          {tab === 'board' && (
            <button onClick={() => { setEditingItem(null); setShowItemForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={12} /> 품목 등록
            </button>
          )}
          {tab === 'daily' && (
            <button onClick={() => { setEditingDaily(null); setShowDailyForm(true); }} disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors disabled:opacity-40">
              <Plus size={12} /> 기록 추가
            </button>
          )}
          {tab === 'weekly' && (
            <button onClick={() => { setEditingWeekly(null); setShowWeeklyForm(true); }} disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors disabled:opacity-40">
              <Plus size={12} /> 주간 보고 작성
            </button>
          )}
          {tab === 'monthly' && (
            <button onClick={() => { setEditingMonthly(null); setShowMonthlyForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={12} /> 계획 추가
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-700 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white'
                : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── 탭 1: 관리대장 ── */}
      {tab === 'board' && (
        <div>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            {[
              { label: '전체 품목', value: `${summary.total}건` },
              { label: '진행중', value: `${summary.ongoing}건` },
              { label: '보류', value: `${summary.hold}건` },
              { label: '완료', value: `${summary.done}건` },
              { label: '평균 진행률', value: `${summary.avgPct}%` },
            ].map(c => (
              <div key={c.label} className="px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
                <p className="text-[10px] font-bold text-stone-400">{c.label}</p>
                <p className="text-lg font-black text-stone-900 dark:text-white">{c.value}</p>
              </div>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-300 dark:border-stone-700 rounded-sm">
              <FlaskConical size={28} className="mx-auto text-stone-300 mb-2" />
              <p className="text-sm text-stone-400">등록된 R&D 품목이 없습니다. '품목 등록'으로 시작하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
              <table className="w-full min-w-[1080px]">
                <thead>
                  <tr className="bg-stone-50 dark:bg-stone-800/50">
                    {['No', '품목명', '카테고리', '담당자', '우선순위', '시작일', '목표일', '현재 단계', 'D-Day', '진행률', '상태', '금주 진행 / 다음 액션', ''].map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left text-[10px] font-bold text-stone-400 border-b border-stone-200 dark:border-stone-700 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const d = item.status !== '완료' ? dday(item.targetDate) : null;
                    const pct = stagePct(item.stage);
                    return (
                      <tr key={item.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                        <td className={`${cellCls} text-stone-400`}>{idx + 1}</td>
                        <td className={`${cellCls} font-bold text-stone-900 dark:text-white whitespace-nowrap`}>{item.name}</td>
                        <td className={`${cellCls} whitespace-nowrap`}>{item.category}</td>
                        <td className={`${cellCls} whitespace-nowrap`}>{item.assignee ?? '-'}</td>
                        <td className={cellCls}>
                          <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${PRIORITY_BADGE[item.priority]}`}>{item.priority}</span>
                        </td>
                        <td className={`${cellCls} whitespace-nowrap`}>{item.startDate ? fmtDateShort(item.startDate) : '-'}</td>
                        <td className={`${cellCls} whitespace-nowrap`}>{item.targetDate ? fmtDateShort(item.targetDate) : '-'}</td>
                        <td className={cellCls}>
                          <select value={item.stage} onChange={e => handleInlineUpdate(item, { stage: Number(e.target.value) })}
                            className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-1 py-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none">
                            {RND_STAGES.map(s => <option key={s.stage} value={s.stage}>{s.stage}. {s.label}</option>)}
                          </select>
                        </td>
                        <td className={`${cellCls} whitespace-nowrap font-bold ${d != null && d < 0 ? 'text-red-500' : d != null && d <= 7 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                          {d != null ? fmtDday(d) : '-'}
                        </td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full bg-stone-700 dark:bg-stone-300 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-stone-500">{pct}%</span>
                          </div>
                        </td>
                        <td className={cellCls}>
                          <select value={item.status} onChange={e => handleInlineUpdate(item, { status: e.target.value as RndStatus })}
                            className={`text-[10px] font-bold rounded-sm px-1.5 py-1 border-0 focus:outline-none ${STATUS_BADGE[item.status]}`}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className={`${cellCls} max-w-[220px]`}>
                          {item.thisWeekNote && <p className="truncate">{item.thisWeekNote}</p>}
                          {item.nextAction && <p className="truncate text-stone-400">→ {item.nextAction}</p>}
                          {!item.thisWeekNote && !item.nextAction && '-'}
                        </td>
                        <td className={`${cellCls} whitespace-nowrap`}>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleMoveItem(idx, 'up')} className="p-1 text-stone-300 hover:text-stone-600"><ChevronUp size={12} /></button>
                            <button onClick={() => handleMoveItem(idx, 'down')} className="p-1 text-stone-300 hover:text-stone-600"><ChevronDown size={12} /></button>
                            <button onClick={() => { setEditingItem(item); setShowItemForm(true); }} className="p-1 text-stone-400 hover:text-stone-700"><Edit2 size={12} /></button>
                            <button onClick={() => handleDeleteItem(item)} className="p-1 text-stone-400 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 탭 2: 일일 기록 ── */}
      {tab === 'daily' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <select value={dailyFilterItemId} onChange={e => setDailyFilterItemId(e.target.value)}
              className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none">
              <option value="">전체 품목</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <span className="text-[11px] text-stone-400">{filteredDaily.length}건</span>
          </div>
          {dailyByDate.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-300 dark:border-stone-700 rounded-sm">
              <NotebookPen size={28} className="mx-auto text-stone-300 mb-2" />
              <p className="text-sm text-stone-400">일일 기록이 없습니다. 매일 작업 내용을 품목별로 한 줄씩 남기세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dailyByDate.map(([date, logs]) => (
                <div key={date}>
                  <p className="text-xs font-black text-stone-900 dark:text-white mb-1.5 pb-1 border-b-[3px] border-double border-stone-800 dark:border-stone-400 inline-block pr-6">
                    {date} <span className="text-stone-400 font-bold">({logs.length}건)</span>
                  </p>
                  <div className="space-y-1.5">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
                        <div className="shrink-0 w-32">
                          <p className="text-xs font-bold text-stone-900 dark:text-white truncate">{itemName(log.itemId)}</p>
                          <p className="text-[10px] text-stone-400">{log.author}</p>
                        </div>
                        <div className="flex-1 min-w-0 text-xs text-stone-700 dark:text-stone-300 space-y-0.5">
                          <p className="whitespace-pre-wrap">{log.workContent}</p>
                          {log.resultIssue && <p className="text-amber-700 dark:text-amber-400 whitespace-pre-wrap">이슈: {log.resultIssue}</p>}
                          {log.nextPlan && <p className="text-stone-400">익일: {log.nextPlan}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => { setEditingDaily(log); setShowDailyForm(true); }} className="p-1 text-stone-400 hover:text-stone-700"><Edit2 size={12} /></button>
                          <button onClick={() => handleDeleteDaily(log)} className="p-1 text-stone-400 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 탭 3: 주간 보고 ── */}
      {tab === 'weekly' && (
        weeklyGroups.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-stone-300 dark:border-stone-700 rounded-sm">
            <CalendarDays size={28} className="mx-auto text-stone-300 mb-2" />
            <p className="text-sm text-stone-400">주간 보고가 없습니다. 주 1회 품목별 진행 사항을 정리하세요.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {weeklyGroups.map(([key, reports]) => {
              const [ps, pe] = key.split('|');
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-black text-stone-900 dark:text-white pb-1 border-b-[3px] border-double border-stone-800 dark:border-stone-400 pr-6">
                      {ps} ~ {pe} <span className="text-stone-400 font-bold">({reports.length}건)</span>
                    </p>
                    <button onClick={() => shareWeekly(key, reports)}
                      className="flex items-center gap-1 px-2 py-1 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 text-[10px] font-bold rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800">
                      <MessageCircle size={10} /> 카톡 복사
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {reports.map(r => (
                      <div key={r.id} className="px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-stone-900 dark:text-white">{itemName(r.itemId)}</p>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => { setEditingWeekly(r); setShowWeeklyForm(true); }} className="p-1 text-stone-400 hover:text-stone-700"><Edit2 size={12} /></button>
                            <button onClick={() => handleDeleteWeekly(r)} className="p-1 text-stone-400 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <div className="text-xs text-stone-700 dark:text-stone-300 space-y-0.5">
                          <p className="whitespace-pre-wrap">{r.progressNote}</p>
                          {r.issueRisk && <p className="text-amber-700 dark:text-amber-400 whitespace-pre-wrap">이슈: {r.issueRisk}</p>}
                          {r.nextWeekPlan && <p className="whitespace-pre-wrap">차주: {r.nextWeekPlan}</p>}
                          {r.supportRequest && <p className="text-blue-700 dark:text-blue-400">요청: {r.supportRequest}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── 탭 4: 월별 계획 ── */}
      {tab === 'monthly' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none" />
            <span className="text-[11px] text-stone-400">{monthPlans.length}건</span>
          </div>
          {monthPlans.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-300 dark:border-stone-700 rounded-sm">
              <CalendarRange size={28} className="mx-auto text-stone-300 mb-2" />
              <p className="text-sm text-stone-400">{month} 계획이 없습니다. 월초에 품목별 목표와 주차별 계획을 세우세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="bg-stone-50 dark:bg-stone-800/50">
                    {['No', '품목 / 과제', '담당자', '월 목표', 'W1', 'W2', 'W3', 'W4', 'W5', '목표일', ''].map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left text-[10px] font-bold text-stone-400 border-b border-stone-200 dark:border-stone-700 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthPlans.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30 align-top">
                      <td className={`${cellCls} text-stone-400`}>{idx + 1}</td>
                      <td className={`${cellCls} font-bold text-stone-900 dark:text-white whitespace-nowrap`}>{p.title}</td>
                      <td className={`${cellCls} whitespace-nowrap`}>{p.assignee ?? '-'}</td>
                      <td className={`${cellCls} max-w-[200px] whitespace-pre-wrap`}>{p.monthGoal ?? '-'}</td>
                      {[0, 1, 2, 3, 4].map(i => (
                        <td key={i} className={`${cellCls} max-w-[120px] whitespace-pre-wrap`}>{p.weekPlans?.[i] || '-'}</td>
                      ))}
                      <td className={`${cellCls} whitespace-nowrap`}>{p.targetDate ? fmtDateShort(p.targetDate) : '-'}</td>
                      <td className={`${cellCls} whitespace-nowrap`}>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => { setEditingMonthly(p); setShowMonthlyForm(true); }} className="p-1 text-stone-400 hover:text-stone-700"><Edit2 size={12} /></button>
                          <button onClick={() => handleDeleteMonthly(p)} className="p-1 text-stone-400 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 인쇄 전용 영역 (화면에서는 숨김) ── */}
      <div id="rnd-print-area" className="hidden print:block bg-white text-black p-2">
        <h1 className="text-lg font-black border-b-[3px] border-double border-black pb-1 mb-1">
          새모양 F&B | R&D {TABS.find(t => t.id === tab)?.label}
          {tab === 'monthly' && ` — ${month}`}
        </h1>
        <p className="text-[10px] text-stone-600 mb-3">출력일: {todayYMD()}{tab === 'board' ? ` · 전체 ${summary.total} · 진행중 ${summary.ongoing} · 완료 ${summary.done} · 평균 진행률 ${summary.avgPct}%` : ''}</p>

        {tab === 'board' && (
          <table className="w-full table-fixed border-collapse text-[10px]">
            <colgroup>
              <col className="w-6" /><col className="w-28" /><col className="w-14" /><col className="w-12" />
              <col className="w-10" /><col className="w-14" /><col className="w-14" /><col className="w-20" />
              <col className="w-12" /><col className="w-10" /><col className="w-10" /><col /><col />
            </colgroup>
            <thead>
              <tr>
                {['No', '품목명', '카테고리', '담당자', '우선', '시작일', '목표일', '현재 단계', 'D-Day', '진행률', '상태', '금주 진행', '다음 액션'].map((h, i) => (
                  <th key={i} className="border border-stone-400 px-1 py-1 text-left font-bold bg-stone-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const d = item.status !== '완료' ? dday(item.targetDate) : null;
                return (
                  <tr key={item.id}>
                    <td className="border border-stone-400 px-1 py-1">{idx + 1}</td>
                    <td className="border border-stone-400 px-1 py-1 font-bold break-words">{item.name}</td>
                    <td className="border border-stone-400 px-1 py-1">{item.category}</td>
                    <td className="border border-stone-400 px-1 py-1">{item.assignee ?? ''}</td>
                    <td className="border border-stone-400 px-1 py-1">{item.priority}</td>
                    <td className="border border-stone-400 px-1 py-1">{item.startDate ?? ''}</td>
                    <td className="border border-stone-400 px-1 py-1">{item.targetDate ?? ''}</td>
                    <td className="border border-stone-400 px-1 py-1">{stageLabel(item.stage)}</td>
                    <td className="border border-stone-400 px-1 py-1">{d != null ? fmtDday(d) : ''}</td>
                    <td className="border border-stone-400 px-1 py-1">{stagePct(item.stage)}%</td>
                    <td className="border border-stone-400 px-1 py-1">{item.status}</td>
                    <td className="border border-stone-400 px-1 py-1 break-words align-top">{item.thisWeekNote ?? ''}</td>
                    <td className="border border-stone-400 px-1 py-1 break-words align-top">{item.nextAction ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'daily' && dailyByDate.map(([date, logs]) => (
          <div key={date} className="mb-3">
            <p className="text-xs font-black border-b border-black mb-1">{date}</p>
            <table className="w-full table-fixed border-collapse text-[10px]">
              <colgroup><col className="w-24" /><col className="w-14" /><col /><col /><col className="w-32" /></colgroup>
              <thead>
                <tr>{['품목명', '작성자', '금일 작업 내용', '결과 / 이슈', '익일 계획'].map((h, i) => (
                  <th key={i} className="border border-stone-400 px-1 py-1 text-left font-bold bg-stone-100">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="border border-stone-400 px-1 py-1 font-bold break-words align-top">{itemName(l.itemId)}</td>
                    <td className="border border-stone-400 px-1 py-1 align-top">{l.author}</td>
                    <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{l.workContent}</td>
                    <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{l.resultIssue ?? ''}</td>
                    <td className="border border-stone-400 px-1 py-1 break-words align-top">{l.nextPlan ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'weekly' && weeklyGroups.map(([key, reports]) => {
          const [ps, pe] = key.split('|');
          return (
            <div key={key} className="mb-3">
              <p className="text-xs font-black border-b border-black mb-1">{ps} ~ {pe}</p>
              <table className="w-full table-fixed border-collapse text-[10px]">
                <colgroup><col className="w-24" /><col /><col /><col /><col className="w-28" /></colgroup>
                <thead>
                  <tr>{['품목명', '금주 진행 사항', '이슈 / 리스크', '차주 계획', '지원 요청'].map((h, i) => (
                    <th key={i} className="border border-stone-400 px-1 py-1 text-left font-bold bg-stone-100">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id}>
                      <td className="border border-stone-400 px-1 py-1 font-bold break-words align-top">{itemName(r.itemId)}</td>
                      <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{r.progressNote}</td>
                      <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{r.issueRisk ?? ''}</td>
                      <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{r.nextWeekPlan ?? ''}</td>
                      <td className="border border-stone-400 px-1 py-1 break-words align-top">{r.supportRequest ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {tab === 'monthly' && (
          <table className="w-full table-fixed border-collapse text-[10px]">
            <colgroup>
              <col className="w-6" /><col className="w-24" /><col className="w-12" /><col />
              <col /><col /><col /><col /><col /><col className="w-16" />
            </colgroup>
            <thead>
              <tr>{['No', '품목 / 과제', '담당자', '월 목표', 'W1', 'W2', 'W3', 'W4', 'W5', '목표일'].map((h, i) => (
                <th key={i} className="border border-stone-400 px-1 py-1 text-left font-bold bg-stone-100">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {monthPlans.map((p, idx) => (
                <tr key={p.id}>
                  <td className="border border-stone-400 px-1 py-1 align-top">{idx + 1}</td>
                  <td className="border border-stone-400 px-1 py-1 font-bold break-words align-top">{p.title}</td>
                  <td className="border border-stone-400 px-1 py-1 align-top">{p.assignee ?? ''}</td>
                  <td className="border border-stone-400 px-1 py-1 break-words whitespace-pre-wrap align-top">{p.monthGoal ?? ''}</td>
                  {[0, 1, 2, 3, 4].map(i => (
                    <td key={i} className="border border-stone-400 px-1 py-1 break-words align-top">{p.weekPlans?.[i] ?? ''}</td>
                  ))}
                  <td className="border border-stone-400 px-1 py-1 align-top">{p.targetDate ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 모달 ── */}
      {showItemForm && (
        <ItemFormModal item={editingItem ?? undefined} onSave={handleSaveItem}
          onClose={() => { setShowItemForm(false); setEditingItem(null); }} />
      )}
      {showDailyForm && (
        <DailyLogModal log={editingDaily ?? undefined} items={items} onSave={handleSaveDaily}
          onClose={() => { setShowDailyForm(false); setEditingDaily(null); }} />
      )}
      {showWeeklyForm && (
        <WeeklyModal report={editingWeekly ?? undefined} items={items} onSave={handleSaveWeekly}
          onClose={() => { setShowWeeklyForm(false); setEditingWeekly(null); }} />
      )}
      {showMonthlyForm && (
        <MonthlyModal plan={editingMonthly ?? undefined} month={month} items={items} onSave={handleSaveMonthly}
          onClose={() => { setShowMonthlyForm(false); setEditingMonthly(null); }} />
      )}
    </div>
  );
}
