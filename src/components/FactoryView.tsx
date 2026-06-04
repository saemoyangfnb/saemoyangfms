// 제조실 — 소스류 재고·생산·안전재고 통합 관리
import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  getDoc, query, orderBy, where,
} from 'firebase/firestore';
import { FactoryItem, FactoryDailyRecord, User } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, X, Edit2, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Store,
  Package, BarChart2, Calendar, Settings,
} from 'lucide-react';

// ── 유틸 ──────────────────────────────────────────────────
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYMD = () => toYMD(new Date());
const ts = () => new Date().toISOString();
const genId = () => `fi_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
const fmt = (n: number, unit: string) => `${n % 1 === 0 ? n : n.toFixed(1)}${unit}`;

function fmtDate(ymd: string) {
  const d = new Date(ymd + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 계산 타입 ──────────────────────────────────────────────
interface ItemStats {
  item: FactoryItem;
  currentStock: number;
  lastRecordDate: string | null;
  avgDailyUsage: number;          // 최근 7일 평균 소비량
  daysRemaining: number;          // 현재재고 ÷ 일평균
  safetyStockNeeded: number;      // 일평균 × safetyDays
  weeklyUsage: number;            // 최근 7일 총 소비량
  monthlyEstimate: number;        // 30일 예상 소비량
  status: 'danger' | 'warning' | 'ok' | 'no_data';
  records: FactoryDailyRecord[];  // 최근 30일
}

function computeStats(item: FactoryItem, records: FactoryDailyRecord[]): ItemStats {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0] ?? null;
  const currentStock = latest?.closingStock ?? 0;
  const lastRecordDate = latest?.date ?? null;

  // 소비량 계산: 이전 마감 + 금일제조 - 금일마감
  const consumptions: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i + 1];
    const curr = sorted[i];
    const daysBetween = Math.max(1,
      Math.round((new Date(curr.date).getTime() - new Date(prev.date).getTime()) / 86400000)
    );
    const consumed = prev.closingStock + curr.produced - curr.closingStock;
    if (consumed >= 0) consumptions.push(consumed / daysBetween);
  }

  const sevenDayRecords = sorted.slice(0, 7);
  const avgDailyUsage = consumptions.length > 0
    ? consumptions.slice(0, 7).reduce((s, v) => s + v, 0) / Math.min(consumptions.length, 7)
    : (item.estimatedMonthlyUsage ?? 0) / 30;

  // 최근 7일 총소비
  let weeklyUsage = 0;
  for (let i = 0; i < sevenDayRecords.length - 1; i++) {
    const c = sevenDayRecords[i].closingStock + sevenDayRecords[i + 1].produced - sevenDayRecords[i + 1]?.closingStock;
    if (c > 0) weeklyUsage += c;
  }
  if (sorted.length === 1 && avgDailyUsage > 0) weeklyUsage = avgDailyUsage * 7;

  const monthlyEstimate = avgDailyUsage * 30;
  const safetyStockNeeded = avgDailyUsage * item.safetyDays;
  const daysRemaining = avgDailyUsage > 0 ? currentStock / avgDailyUsage : 999;

  let status: ItemStats['status'] = 'no_data';
  if (lastRecordDate) {
    if (daysRemaining < item.safetyDays / 2) status = 'danger';
    else if (daysRemaining < item.safetyDays) status = 'warning';
    else status = 'ok';
  }

  return {
    item, currentStock, lastRecordDate, avgDailyUsage,
    daysRemaining, safetyStockNeeded, weeklyUsage,
    monthlyEstimate, status, records: sorted,
  };
}

const STATUS_CFG = {
  danger:  { dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',     label: '위험',   icon: <AlertTriangle size={12} /> },
  warning: { dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: '주의',  icon: <Clock size={12} /> },
  ok:      { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: '여유', icon: <CheckCircle2 size={12} /> },
  no_data: { dot: 'bg-stone-300',   badge: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400', label: '미입력', icon: <Package size={12} /> },
};

// ── 품목 등록/수정 모달 ────────────────────────────────────
function ItemFormModal({
  item, onSave, onClose,
}: {
  item?: FactoryItem;
  onSave: (data: Omit<FactoryItem, 'id' | 'order' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'kg');
  const [safetyDays, setSafetyDays] = useState(item?.safetyDays ?? 10);
  const [estimatedMonthlyUsage, setEstimatedMonthlyUsage] = useState(item?.estimatedMonthlyUsage?.toString() ?? '');

  const inputCls = 'w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-sm border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">{item ? '품목 수정' : '품목 추가'}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">품목명 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 불고기소스" autoFocus className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">단위 *</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className={inputCls}>
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="개">개</option>
                <option value="봉">봉</option>
                <option value="통">통</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">안전재고 일수</label>
              <input type="number" min="1" max="30" value={safetyDays} onChange={e => setSafetyDays(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">
              월 예상 소비량 ({unit}) <span className="text-stone-400 font-normal">— 실적 없을 때 기준값</span>
            </label>
            <input type="number" min="0" value={estimatedMonthlyUsage}
              onChange={e => setEstimatedMonthlyUsage(e.target.value)}
              placeholder="예: 300" className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button
            onClick={() => name.trim() && onSave({ name: name.trim(), unit, safetyDays, estimatedMonthlyUsage: estimatedMonthlyUsage ? Number(estimatedMonthlyUsage) : undefined })}
            disabled={!name.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {item ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 저녁 실사 입력 모달 ────────────────────────────────────
function DailyInputModal({
  statsList, storeCount, onSave, onClose,
}: {
  statsList: ItemStats[];
  storeCount: number;
  onSave: (entries: { itemId: string; closingStock: number; produced: number; note: string }[], date: string, storeCount: number) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayYMD());
  const [sc, setSc] = useState(storeCount);
  const [entries, setEntries] = useState<{ itemId: string; closingStock: string; produced: string; note: string }[]>(
    statsList.map(s => ({ itemId: s.item.id, closingStock: s.currentStock.toString(), produced: '0', note: '' }))
  );

  const update = (i: number, field: 'closingStock' | 'produced' | 'note', val: string) =>
    setEntries(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const handleSave = () => {
    const parsed = entries.map(e => ({
      itemId: e.itemId,
      closingStock: Math.max(0, Number(e.closingStock) || 0),
      produced: Math.max(0, Number(e.produced) || 0),
      note: e.note.trim(),
    }));
    onSave(parsed, date, sc);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-xl border border-stone-200 dark:border-stone-700 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">저녁 실사 입력</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>

        {/* 날짜 + 매장수 */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-stone-500">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <Store size={12} className="text-stone-400" />
            <label className="text-[11px] font-bold text-stone-500">매장수</label>
            <input type="number" min="1" value={sc} onChange={e => setSc(Number(e.target.value))}
              className="w-16 text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none" />
          </div>
        </div>

        {/* 컬럼 헤더 */}
        <div className="grid grid-cols-[1fr_90px_90px_80px] gap-2 px-5 py-1.5 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <span className="text-[10px] font-bold text-stone-400">품목</span>
          <span className="text-[10px] font-bold text-stone-400 text-right">금일 제조량</span>
          <span className="text-[10px] font-bold text-stone-400 text-right">마감 실사재고</span>
          <span className="text-[10px] font-bold text-stone-400">메모</span>
        </div>

        {/* 입력 행 */}
        <div className="overflow-y-auto flex-1">
          {statsList.map((s, i) => {
            const prev = s.lastRecordDate ? `(${fmtDate(s.lastRecordDate)} ${s.currentStock}${s.item.unit})` : '(초기입력)';
            const entry = entries[i];
            const consumed = (s.currentStock + (Number(entry?.produced) || 0)) - (Number(entry?.closingStock) || 0);

            return (
              <div key={s.item.id} className="grid grid-cols-[1fr_90px_90px_80px] gap-2 px-5 py-2.5 border-b border-stone-100 dark:border-stone-800/50 items-center">
                <div>
                  <p className="text-xs font-bold text-stone-800 dark:text-stone-200">{s.item.name}</p>
                  <p className="text-[9px] text-stone-400">{prev}</p>
                </div>
                <input
                  type="number" min="0" step="0.1"
                  value={entry?.produced ?? '0'}
                  onChange={e => update(i, 'produced', e.target.value)}
                  className="text-xs text-right border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                  placeholder="0"
                />
                <div>
                  <input
                    type="number" min="0" step="0.1"
                    value={entry?.closingStock ?? ''}
                    onChange={e => update(i, 'closingStock', e.target.value)}
                    className="text-xs text-right border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                    placeholder={s.currentStock.toString()}
                  />
                  {consumed > 0 && (
                    <p className="text-[9px] text-red-400 text-right mt-0.5">-{consumed.toFixed(1)}{s.item.unit} 소비</p>
                  )}
                </div>
                <input
                  value={entry?.note ?? ''}
                  onChange={e => update(i, 'note', e.target.value)}
                  placeholder="메모"
                  className="text-[11px] border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none w-full"
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button onClick={handleSave}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 FactoryView ───────────────────────────────────────
export function FactoryView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [items, setItems] = useState<FactoryItem[]>([]);
  const [records, setRecords] = useState<FactoryDailyRecord[]>([]);
  const [storeCount, setStoreCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'dashboard' | 'history' | 'plan' | 'settings'>('dashboard');

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FactoryItem | null>(null);
  const [showDailyInput, setShowDailyInput] = useState(false);
  const [editingStoreCount, setEditingStoreCount] = useState(false);
  const [tempStoreCount, setTempStoreCount] = useState('');
  const [planStoreCount, setPlanStoreCount] = useState(1);
  const [historyItemId, setHistoryItemId] = useState('');

  // ── 로드 ───────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemSnap, recordSnap, settingsDoc] = await Promise.all([
        getDocs(query(collection(salesDb, 'factory_items'), orderBy('order'))),
        getDocs(query(collection(salesDb, 'factory_daily'), orderBy('date', 'desc'))),
        getDoc(doc(salesDb, 'factory_settings', 'config')),
      ]);
      const loadedItems = itemSnap.docs.map(d => ({ id: d.id, ...d.data() } as FactoryItem));
      setItems(loadedItems);
      setRecords(recordSnap.docs.map(d => ({ id: d.id, ...d.data() } as FactoryDailyRecord)));
      const sc = (settingsDoc.data()?.storeCount as number) ?? 1;
      setStoreCount(sc);
      setPlanStoreCount(sc);
      if (loadedItems.length > 0 && !historyItemId) setHistoryItemId(loadedItems[0].id);
    } catch (e) { console.error('FactoryView loadAll error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 매장수 저장 ────────────────────────────────────────
  const saveStoreCount = async (n: number) => {
    if (n < 1) return;
    try {
      await setDoc(doc(salesDb, 'factory_settings', 'config'), { storeCount: n, updatedAt: ts() }, { merge: true });
      setStoreCount(n);
      setPlanStoreCount(n);
      toast.success(`매장수 ${n}개로 업데이트됨`);
    } catch { toast.error('저장 실패'); }
  };

  // ── 품목 CRUD ──────────────────────────────────────────
  const handleSaveItem = async (data: Omit<FactoryItem, 'id' | 'order' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingItem) {
        await updateDoc(doc(salesDb, 'factory_items', editingItem.id), { ...data, updatedAt: ts() });
        toast.success('수정됨');
      } else {
        const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
        const id = genId();
        await setDoc(doc(salesDb, 'factory_items', id), { ...data, id, order: maxOrder + 1, createdAt: ts(), updatedAt: ts() });
        toast.success('품목 추가됨');
      }
      setShowItemForm(false);
      setEditingItem(null);
      await loadAll();
    } catch { toast.error('저장 실패'); }
  };

  const handleDeleteItem = async (item: FactoryItem) => {
    const ok = await confirm({ title: '품목 삭제', message: `"${item.name}" 품목과 관련 기록이 모두 삭제됩니다. 계속할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'factory_items', item.id));
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
      await Promise.all(newItems.map((it, i) => updateDoc(doc(salesDb, 'factory_items', it.id), { order: i, updatedAt: ts() })));
    } catch { toast.error('순서 변경 실패'); await loadAll(); }
  };

  // ── 실사 저장 ──────────────────────────────────────────
  const handleSaveDailyInput = async (
    entries: { itemId: string; closingStock: number; produced: number; note: string }[],
    date: string,
    sc: number,
  ) => {
    try {
      await Promise.all(entries.map(e => {
        const id = `${e.itemId}_${date}`;
        return setDoc(doc(salesDb, 'factory_daily', id), {
          id, itemId: e.itemId, date,
          closingStock: e.closingStock,
          produced: e.produced,
          storeCount: sc,
          note: e.note || undefined,
          createdAt: ts(), updatedAt: ts(),
        }, { merge: true });
      }));
      if (sc !== storeCount) await saveStoreCount(sc);
      toast.success(`${date} 실사 저장됨`);
      setShowDailyInput(false);
      await loadAll();
    } catch { toast.error('저장 실패'); }
  };

  // ── 통계 계산 ──────────────────────────────────────────
  const statsList: ItemStats[] = items.map(item => {
    const itemRecords = records.filter(r => r.itemId === item.id);
    return computeStats(item, itemRecords);
  });

  const dangerCount = statsList.filter(s => s.status === 'danger').length;
  const warningCount = statsList.filter(s => s.status === 'warning').length;

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white">제조실</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">소스류 재고 · 생산 · 안전재고 관리</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 매장수 */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900">
            <Store size={12} className="text-stone-400" />
            {editingStoreCount ? (
              <input
                autoFocus type="number" min="1" value={tempStoreCount}
                onChange={e => setTempStoreCount(e.target.value)}
                onBlur={() => { saveStoreCount(Number(tempStoreCount) || storeCount); setEditingStoreCount(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { saveStoreCount(Number(tempStoreCount) || storeCount); setEditingStoreCount(false); } if (e.key === 'Escape') setEditingStoreCount(false); }}
                className="w-12 text-xs font-bold text-stone-800 dark:text-stone-200 bg-transparent focus:outline-none"
              />
            ) : (
              <button onClick={() => { setTempStoreCount(storeCount.toString()); setEditingStoreCount(true); }}
                className="text-xs font-bold text-stone-800 dark:text-stone-200 hover:text-stone-600">
                매장 {storeCount}개
              </button>
            )}
          </div>
          <button onClick={() => setShowDailyInput(true)}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors disabled:opacity-40">
            저녁 실사 입력
          </button>
        </div>
      </div>

      {/* 경보 배너 */}
      {(dangerCount > 0 || warningCount > 0) && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-sm mb-4 text-xs font-bold ${dangerCount > 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'}`}>
          <AlertTriangle size={13} />
          {dangerCount > 0 && <span>위험 {dangerCount}품목</span>}
          {dangerCount > 0 && warningCount > 0 && <span className="text-stone-300">·</span>}
          {warningCount > 0 && <span>주의 {warningCount}품목</span>}
          <span className="font-normal ml-1">— 안전재고 이하입니다</span>
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b border-stone-200 dark:border-stone-700 mb-5">
        {([
          { key: 'dashboard', label: '현황판', icon: <Package size={12} /> },
          { key: 'history',   label: '추이',   icon: <BarChart2 size={12} /> },
          { key: 'plan',      label: '월별계획', icon: <Calendar size={12} /> },
          { key: 'settings',  label: '품목관리', icon: <Settings size={12} /> },
        ] as { key: typeof tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${tab === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── 현황판 탭 ── */}
      {tab === 'dashboard' && (
        <div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Package size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">등록된 품목이 없습니다</p>
              <button onClick={() => setTab('settings')} className="mt-2 text-xs text-stone-500 underline hover:text-stone-700">품목 관리로 이동</button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 컬럼 헤더 */}
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.2fr] gap-3 px-4 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wide">
                <span>품목</span>
                <span className="text-right">현재재고</span>
                <span className="text-right">여유일수</span>
                <span className="text-right">일평균소비</span>
                <span className="text-right">안전재고량</span>
                <span className="text-right">이번달 예상</span>
              </div>

              {statsList.map(s => {
                const cfg = STATUS_CFG[s.status];
                const noData = s.status === 'no_data';

                return (
                  <div key={s.item.id}
                    className={`bg-white dark:bg-stone-900 border rounded-sm overflow-hidden ${s.status === 'danger' ? 'border-red-300 dark:border-red-800' : s.status === 'warning' ? 'border-amber-300 dark:border-amber-800' : 'border-stone-200 dark:border-stone-700'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1.2fr] gap-3 px-4 py-3 items-center">
                      {/* 품목명 + 상태 */}
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <div>
                          <p className="text-sm font-black text-stone-900 dark:text-white">{s.item.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5 ${cfg.badge}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                            {s.lastRecordDate && (
                              <span className="text-[9px] text-stone-400">최근 입력: {fmtDate(s.lastRecordDate)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 현재재고 */}
                      <div className="flex md:flex-col md:items-end gap-1 md:gap-0">
                        <span className="text-[9px] text-stone-400 md:hidden">현재재고</span>
                        <span className={`text-sm font-black tabular-nums ${noData ? 'text-stone-300 dark:text-stone-600' : s.currentStock <= s.safetyStockNeeded ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-white'}`}>
                          {noData ? '-' : fmt(s.currentStock, s.item.unit)}
                        </span>
                      </div>

                      {/* 여유일수 */}
                      <div className="flex md:flex-col md:items-end gap-1 md:gap-0">
                        <span className="text-[9px] text-stone-400 md:hidden">여유일수</span>
                        {noData ? (
                          <span className="text-xs text-stone-300 dark:text-stone-600">-</span>
                        ) : (
                          <span className={`text-sm font-black tabular-nums ${s.daysRemaining < s.item.safetyDays / 2 ? 'text-red-600' : s.daysRemaining < s.item.safetyDays ? 'text-amber-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {s.daysRemaining > 99 ? '99+' : s.daysRemaining.toFixed(1)}일
                          </span>
                        )}
                      </div>

                      {/* 일평균소비 */}
                      <div className="flex md:flex-col md:items-end gap-1 md:gap-0">
                        <span className="text-[9px] text-stone-400 md:hidden">일평균소비</span>
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-300 tabular-nums">
                          {s.avgDailyUsage > 0 ? fmt(s.avgDailyUsage, `${s.item.unit}/일`) : '-'}
                        </span>
                      </div>

                      {/* 안전재고량 */}
                      <div className="flex md:flex-col md:items-end gap-1 md:gap-0">
                        <span className="text-[9px] text-stone-400 md:hidden">안전재고({s.item.safetyDays}일)</span>
                        <span className="text-xs font-bold text-stone-500 dark:text-stone-400 tabular-nums">
                          {s.safetyStockNeeded > 0 ? fmt(s.safetyStockNeeded, s.item.unit) : '-'}
                        </span>
                      </div>

                      {/* 이번달 예상 */}
                      <div className="flex md:flex-col md:items-end gap-1 md:gap-0">
                        <span className="text-[9px] text-stone-400 md:hidden">이번달 예상</span>
                        <span className="text-xs font-bold text-stone-600 dark:text-stone-400 tabular-nums">
                          {s.monthlyEstimate > 0 ? fmt(s.monthlyEstimate, s.item.unit) : '-'}
                        </span>
                      </div>
                    </div>

                    {/* 재고 바 */}
                    {!noData && s.safetyStockNeeded > 0 && (
                      <div className="px-4 pb-3">
                        <div className="relative h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                          {/* 안전선 */}
                          <div className="absolute inset-y-0 w-0.5 bg-stone-400 dark:bg-stone-500 z-10"
                            style={{ left: `${Math.min(100, (s.safetyStockNeeded / Math.max(s.currentStock, s.safetyStockNeeded * 1.5)) * 100)}%` }} />
                          {/* 현재 재고 바 */}
                          <div
                            className={`h-full rounded-full transition-all ${s.status === 'danger' ? 'bg-red-400' : s.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(100, (s.currentStock / Math.max(s.currentStock, s.safetyStockNeeded * 1.5)) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
                          <span>0</span>
                          <span>안전선 {fmt(s.safetyStockNeeded, s.item.unit)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 추이 탭 ── */}
      {tab === 'history' && (
        <div>
          {/* 품목 선택 */}
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs font-bold text-stone-600 dark:text-stone-400 shrink-0">품목 선택</label>
            <select value={historyItemId} onChange={e => setHistoryItemId(e.target.value)}
              className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-3 py-2 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none">
              {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          </div>

          {(() => {
            const s = statsList.find(s => s.item.id === historyItemId);
            if (!s) return <div className="text-center py-16 text-stone-400 text-sm">품목을 선택하세요</div>;
            if (s.records.length === 0) return <div className="text-center py-16 text-stone-400 text-sm">기록이 없습니다</div>;

            const sorted = [...s.records].sort((a, b) => a.date.localeCompare(b.date));
            return (
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
                <div className="grid grid-cols-[80px_90px_90px_90px_90px_1fr] text-[10px] font-bold text-stone-400 px-4 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                  <span>날짜</span>
                  <span className="text-right">기초재고</span>
                  <span className="text-right">제조량</span>
                  <span className="text-right">소비량</span>
                  <span className="text-right">마감재고</span>
                  <span className="pl-2">메모</span>
                </div>
                {sorted.map((r, i) => {
                  const prev = sorted[i - 1];
                  const openingStock = prev?.closingStock ?? r.closingStock;
                  const consumed = i === 0 ? 0 : openingStock + r.produced - r.closingStock;
                  return (
                    <div key={r.id} className="grid grid-cols-[80px_90px_90px_90px_90px_1fr] px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/50 last:border-0 items-center text-xs">
                      <span className="font-bold text-stone-700 dark:text-stone-300">{r.date.slice(5)}</span>
                      <span className="text-right tabular-nums text-stone-600 dark:text-stone-400">{i === 0 ? '-' : fmt(openingStock, '')}</span>
                      <span className={`text-right tabular-nums font-bold ${r.produced > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400'}`}>
                        {r.produced > 0 ? `+${fmt(r.produced, '')}` : '-'}
                      </span>
                      <span className={`text-right tabular-nums ${consumed > 0 ? 'text-red-500 dark:text-red-400' : 'text-stone-400'}`}>
                        {consumed > 0 ? `-${fmt(consumed, '')}` : '-'}
                      </span>
                      <span className={`text-right tabular-nums font-black ${r.closingStock < s.safetyStockNeeded ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-white'}`}>
                        {fmt(r.closingStock, s.item.unit)}
                      </span>
                      <span className="pl-2 text-stone-400 text-[10px] truncate">{r.note ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 월별 계획 탭 ── */}
      {tab === 'plan' && (
        <div>
          {/* 계획 매장수 */}
          <div className="flex items-center gap-3 mb-5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm px-4 py-3">
            <Store size={14} className="text-stone-400 shrink-0" />
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300">계획 매장수</span>
            <input type="number" min="1" value={planStoreCount} onChange={e => setPlanStoreCount(Number(e.target.value))}
              className="w-20 text-sm font-black border border-stone-300 dark:border-stone-600 rounded-sm px-2 py-1 text-center bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400" />
            <span className="text-xs text-stone-500">개</span>
            {planStoreCount !== storeCount && (
              <span className="text-[11px] text-amber-600 font-bold">
                현재 {storeCount}개 → 계획 {planStoreCount}개 ({planStoreCount > storeCount ? '+' : ''}{planStoreCount - storeCount}개)
              </span>
            )}
          </div>

          {/* 계획 테이블 */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] text-[10px] font-bold text-stone-400 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
              <span>품목</span>
              <span className="text-right">현재재고</span>
              <span className="text-right">일소비 (계획)</span>
              <span className="text-right">월 필요량</span>
              <span className="text-right">순 제조필요</span>
            </div>
            {statsList.map(s => {
              const ratio = storeCount > 0 ? planStoreCount / storeCount : 1;
              const planDailyUsage = s.avgDailyUsage * ratio;
              const monthlyNeeded = planDailyUsage * 30;
              const netProduction = Math.max(0, monthlyNeeded - s.currentStock);
              const isInsufficient = s.currentStock < s.safetyStockNeeded * ratio;

              return (
                <div key={s.item.id} className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-4 py-3 border-b border-stone-100 dark:border-stone-800/50 last:border-0 items-center ${isInsufficient ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                  <div>
                    <p className="text-sm font-bold text-stone-800 dark:text-stone-200">{s.item.name}</p>
                    {isInsufficient && <p className="text-[9px] text-red-500 font-bold">안전재고 부족</p>}
                  </div>
                  <span className="text-right text-xs tabular-nums text-stone-600 dark:text-stone-400">
                    {s.currentStock > 0 ? fmt(s.currentStock, s.item.unit) : '-'}
                  </span>
                  <span className="text-right text-xs tabular-nums text-stone-600 dark:text-stone-400">
                    {planDailyUsage > 0 ? fmt(planDailyUsage, `${s.item.unit}/일`) : '-'}
                  </span>
                  <span className="text-right text-xs font-bold tabular-nums text-stone-800 dark:text-stone-200">
                    {monthlyNeeded > 0 ? fmt(monthlyNeeded, s.item.unit) : '-'}
                  </span>
                  <span className={`text-right text-xs font-black tabular-nums ${netProduction > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400'}`}>
                    {netProduction > 0 ? fmt(netProduction, s.item.unit) : '충분'}
                  </span>
                </div>
              );
            })}
            {statsList.length === 0 && (
              <div className="text-center py-10 text-xs text-stone-400">품목을 먼저 등록하세요</div>
            )}
          </div>
          <p className="text-[10px] text-stone-400 mt-2">
            * 일소비량은 실적 기반 평균값입니다. 실적 없는 품목은 예상 소비량 기준으로 계산됩니다.
          </p>
        </div>
      )}

      {/* ── 품목 관리 탭 ── */}
      {tab === 'settings' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-stone-500 dark:text-stone-400">품목을 추가·수정·삭제하고 순서를 조정하세요.</p>
            <button onClick={() => { setEditingItem(null); setShowItemForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={13} /> 품목 추가
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package size={36} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">등록된 품목이 없습니다</p>
              <button onClick={() => setShowItemForm(true)} className="mt-2 text-xs text-stone-500 underline hover:text-stone-700">첫 품목 추가하기</button>
            </div>
          ) : (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/50 last:border-0">
                  {/* 순서 */}
                  <div className="flex flex-col gap-0 shrink-0">
                    <button onClick={() => handleMoveItem(idx, 'up')} disabled={idx === 0}
                      className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-stone-600 disabled:opacity-20"><ChevronUp size={12} /></button>
                    <button onClick={() => handleMoveItem(idx, 'down')} disabled={idx === items.length - 1}
                      className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-stone-600 disabled:opacity-20"><ChevronDown size={12} /></button>
                  </div>
                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-stone-900 dark:text-white">{item.name}</p>
                    <p className="text-[10px] text-stone-400">
                      단위: {item.unit} · 안전재고: {item.safetyDays}일치
                      {item.estimatedMonthlyUsage ? ` · 월예상: ${item.estimatedMonthlyUsage}${item.unit}` : ''}
                    </p>
                  </div>
                  {/* 액션 */}
                  <button onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                    className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDeleteItem(item)}
                    className="p-1.5 text-stone-300 dark:text-stone-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 모달 */}
      {showItemForm && (
        <ItemFormModal
          item={editingItem ?? undefined}
          onSave={handleSaveItem}
          onClose={() => { setShowItemForm(false); setEditingItem(null); }}
        />
      )}
      {showDailyInput && (
        <DailyInputModal
          statsList={statsList}
          storeCount={storeCount}
          onSave={handleSaveDailyInput}
          onClose={() => setShowDailyInput(false)}
        />
      )}
    </div>
  );
}
