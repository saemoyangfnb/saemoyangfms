import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { salesDb } from '../../firebase';
import {
  collection, getDocs, addDoc, setDoc, doc, query, where, deleteDoc,
} from 'firebase/firestore';
import { User, StoreForm, StoreFormEntry } from '../../types';
import {
  fetchAllStores, fetchQscReports, fetchHelpdeskSummary, fetchOperationInfos,
  FcdaumStore, FcdaumQscReport, FcdaumHelpdeskSummary, FcdaumOperationInfo,
} from '../../fcdaum';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import {
  Building2, Search, AlertTriangle, Plus, X, ClipboardList,
  History, Check, Trash2, RefreshCw, Loader2, ShieldAlert,
  MessageSquare, User as UserIcon, ChevronRight, Info,
  StickyNote, Layers,
} from 'lucide-react';
import { FcdaumScheduleCreateModal } from '../admin/FcdaumScheduleCreateModal';
import StoreOverviewMap from './StoreOverviewMap';

// ── 로컬 타입 ──────────────────────────────────────────────────
interface StoreLog {
  id: string;
  storeId: string;
  content: string;
  type: 'memo' | 'visit' | 'call' | 'warning' | 'other';
  createdAt: string;
  createdBy: string;
}

// ── QSC 우선순위 ───────────────────────────────────────────────
function getDaysSince(ms: number) { return Math.floor((Date.now() - ms) / 86400000); }

function priorityLevel(days: number | null): 0 | 1 | 2 | 3 | 4 {
  if (days === null) return 0;
  if (days >= 60) return 1;
  if (days >= 45) return 2;
  if (days >= 30) return 3;
  return 4;
}

const PRI = {
  0: { label: '미확인', dot: 'bg-stone-400',   text: 'text-stone-500 dark:text-stone-400',                              badge: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  1: { label: '긴급',   dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',                                  badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  2: { label: '주의',   dot: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-400',                            badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  3: { label: '관리필요', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400',                               badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  4: { label: '양호',   dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400',                          badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
} as const;

const LOG_LABEL: Record<StoreLog['type'], string> = {
  memo: '메모', visit: '방문', call: '통화', warning: '주의', other: '기타',
};
const LOG_CLR: Record<StoreLog['type'], string> = {
  memo:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  visit:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  call:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  warning: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  other:   'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
};

const nowIso = () => new Date().toISOString();
function scrub<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T;
}

// ── 폼 항목 입력 모달 ──────────────────────────────────────────
function FormEntryModal({ storeId, storeName, form, entry, onSave, onClose, currentUser }: {
  storeId: string; storeName: string; form: StoreForm; entry: StoreFormEntry | null;
  onSave: (e: StoreFormEntry) => Promise<void>; onClose: () => void; currentUser: User;
}) {
  const [data, setData] = useState<Record<string, string | boolean>>(entry?.data ?? {});
  const [isDone, setIsDone] = useState(entry?.isDone ?? false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const setValue = (id: string, v: string | boolean) => setData(p => ({ ...p, [id]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const e: StoreFormEntry = scrub({
        id: entry?.id ?? `${form.id}_${storeId}`,
        formId: form.id, storeId, storeName, storeRegion: '',
        data, isDone, updatedAt: nowIso(), updatedBy: currentUser.name,
        completedAt: isDone ? (entry?.completedAt ?? nowIso()) : undefined,
      });
      await onSave(e);
      onClose();
    } catch { toast.error('저장 실패'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh] shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{storeName}</p>
            <p className="text-[11px] text-slate-400">{form.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {form.fields.map(field => (
            <div key={field.id}>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">{field.label}</label>
              {field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!data[field.id]} onChange={e => setValue(field.id, e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{field.label}</span>
                </label>
              ) : field.type === 'date' ? (
                <input type="date" value={String(data[field.id] ?? '')} onChange={e => setValue(field.id, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500" />
              ) : field.type === 'select' ? (
                <select value={String(data[field.id] ?? '')} onChange={e => setValue(field.id, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none">
                  <option value="">선택하세요</option>
                  {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" value={String(data[field.id] ?? '')} onChange={e => setValue(field.id, e.target.value)} placeholder="입력..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500" />
              )}
            </div>
          ))}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsDone(v => !v)}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                {isDone && <Check size={12} className="text-white" />}
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 select-none">완료 처리</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export function StoreMgmtView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const confirm = useConfirm();

  // FC다움 데이터
  const [stores, setStores] = useState<FcdaumStore[]>([]);
  const [qscReports, setQscReports] = useState<FcdaumQscReport[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  // 메타 (SV)
  const [svMap, setSvMap] = useState<Record<string, string>>({});

  // UI 상태
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStoreNo, setSelectedStoreNo] = useState<number | null>(null);
  const activeStoreRef = useRef<string | null>(null); // 비동기 콜백 race condition 방지
  const [tab, setTab] = useState<'info' | 'operation' | 'forms' | 'qsc' | 'helpdesk' | 'logs'>('info');
  const [filterTab, setFilterTab] = useState<'all' | 'needsVisit' | 'ok' | 'unknown'>('all');
  const [search, setSearch] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // 폼 관리 탭
  const [forms, setForms] = useState<StoreForm[]>([]);
  const [formEntries, setFormEntries] = useState<StoreFormEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<{ form: StoreForm; entry: StoreFormEntry | null } | null>(null);

  // 이력/메모 탭
  const [logs, setLogs] = useState<StoreLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logType, setLogType] = useState<StoreLog['type']>('memo');
  const [savingLog, setSavingLog] = useState(false);

  // 운영정보 탭
  const [opInfo, setOpInfo] = useState<FcdaumOperationInfo | null>(null);
  const [opLoading, setOpLoading] = useState(false);
  const [opLoaded, setOpLoaded] = useState<string | null>(null);

  // 매장요청 탭
  const [helpdesk, setHelpdesk] = useState<FcdaumHelpdeskSummary | null>(null);
  const [helpdeskLoading, setHelpdeskLoading] = useState(false);
  const [helpdeskLoaded, setHelpdeskLoaded] = useState<string | null>(null);

  // SV 편집
  const [editingSv, setEditingSv] = useState(false);
  const [svInput, setSvInput] = useState('');
  const [savingSv, setSavingSv] = useState(false);

  // 가맹 일정 연동 여부 (선택된 매장 기준)
  const [isLinked, setIsLinked] = useState<boolean>(false);

  // 매장별 QSC 상세 (per-store fetch — bulk 매칭 오류 방지)
  const [selectedQscReports, setSelectedQscReports] = useState<FcdaumQscReport[]>([]);
  const [qscDetailLoading, setQscDetailLoading] = useState(false);

  // ── 초기 로드 ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setStoresLoading(true);
    setStoresError(null);
    try {
      const storeList = await fetchAllStores();
      setStores(storeList);
      const ids = storeList.map(s => s.storeId);

      // 핵심 데이터 — 기존 컬렉션이므로 실패 시 전체 에러 처리
      const [qscList, formSnap] = await Promise.all([
        fetchQscReports(ids, 500),
        getDocs(collection(salesDb, 'store_forms')),
      ]);
      setQscReports(qscList);
      setForms(
        formSnap.docs.map(d => ({ id: d.id, ...d.data() } as StoreForm))
          .filter(f => !f.isArchived)
          .sort((a, b) => a.title.localeCompare(b.title))
      );

      // store_meta — 신규 컬렉션, 권한 규칙 미설정 시 무시
      try {
        const metaSnap = await getDocs(collection(salesDb, 'store_meta'));
        const sv: Record<string, string> = {};
        metaSnap.forEach(d => { sv[d.id] = (d.data() as { sv?: string }).sv ?? ''; });
        setSvMap(sv);
      } catch { /* Firestore 규칙 미설정 시 SV 빈 값으로 시작 */ }

    } catch (e: unknown) {
      setStoresError(e instanceof Error ? e.message : 'FC다움 데이터를 불러오지 못했습니다.');
    } finally {
      setStoresLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 매장 선택 시 탭별 데이터 로드 ──────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    loadFormEntries(selectedId);
    loadLogs(selectedId);
  }, [selectedId]);

  const loadFormEntries = async (storeId: string) => {
    try {
      const snap = await getDocs(query(collection(salesDb, 'store_form_entries'), where('storeId', '==', storeId)));
      if (activeStoreRef.current !== storeId) return; // 스토어 전환 후 도착한 응답 무시
      setFormEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreFormEntry)));
    } catch {}
  };

  const loadLogs = async (storeId: string) => {
    setLogsLoading(true);
    try {
      const snap = await getDocs(query(collection(salesDb, 'store_logs'), where('storeId', '==', storeId)));
      if (activeStoreRef.current !== storeId) return; // 스토어 전환 후 도착한 응답 무시
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreLog)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {} finally {
      if (activeStoreRef.current === storeId) setLogsLoading(false);
    }
  };

  // 선택된 매장의 가맹 일정 연동 여부 — per-store 쿼리 (FcdaumStoreView 패턴)
  // storeId (수동 매핑) 또는 fcdaumStoreId (FcdaumScheduleCreateModal) 두 경로 모두 확인
  const checkLinked = async (storeId: string) => {
    try {
      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(salesDb, 'franchise_schedules'), where('storeId', '==', storeId))),
        getDocs(query(collection(salesDb, 'franchise_schedules'), where('fcdaumStoreId', '==', storeId))),
      ]);
      if (activeStoreRef.current !== storeId) return;
      setIsLinked(!snap1.empty || !snap2.empty);
    } catch {
      if (activeStoreRef.current === storeId) setIsLinked(false);
    }
  };

  // 선택된 매장의 QSC 보고서 — per-store fetch (bulk 500건 한도 및 storeId 매칭 오류 방지)
  const loadQscForStore = async (storeId: string) => {
    setQscDetailLoading(true);
    try {
      const reports = await fetchQscReports([storeId]);
      if (activeStoreRef.current !== storeId) return;
      setSelectedQscReports(reports.sort((a, b) => b.visitDate - a.visitDate));
    } catch {
      if (activeStoreRef.current === storeId) setSelectedQscReports([]);
    } finally {
      if (activeStoreRef.current === storeId) setQscDetailLoading(false);
    }
  };

  const loadHelpdesk = async (storeId: string) => {
    if (helpdeskLoaded === storeId) return;
    setHelpdeskLoading(true);
    setHelpdesk(null);
    try {
      const data = await fetchHelpdeskSummary([storeId]);
      setHelpdesk(data);
      setHelpdeskLoaded(storeId);
    } catch {} finally { setHelpdeskLoading(false); }
  };

  // ── QSC 우선순위 목록 ─────────────────────────────────────
  const storeList = useMemo(() => {
    return stores
      .filter(s => s.storeStatus === 'O')
      .map(s => {
        const reps = qscReports.filter(r => r.storeId === s.storeId);
        const latest = reps.sort((a, b) => b.visitDate - a.visitDate)[0];
        const days = latest ? getDaysSince(latest.visitDate) : null;
        return { store: s, days, level: priorityLevel(days) };
      })
      .sort((a, b) => {
        const ad = a.days ?? Infinity, bd = b.days ?? Infinity;
        return bd - ad;
      });
  }, [stores, qscReports]);

  // 분류 탭별 카운트
  const counts = useMemo(() => ({
    all:        storeList.length,
    needsVisit: storeList.filter(s => s.level >= 1 && s.level <= 3).length,
    ok:         storeList.filter(s => s.level === 4).length,
    unknown:    storeList.filter(s => s.level === 0).length,
    urgent:     storeList.filter(s => s.level === 1).length,
  }), [storeList]);

  const filteredByCategory = useMemo(() => {
    switch (filterTab) {
      case 'needsVisit': return storeList.filter(s => s.level >= 1 && s.level <= 3);
      case 'ok':         return storeList.filter(s => s.level === 4);
      case 'unknown':    return storeList.filter(s => s.level === 0);
      default:           return storeList;
    }
  }, [storeList, filterTab]);

  const filtered = useMemo(() => {
    if (!search.trim()) return filteredByCategory;
    const q = search.toLowerCase();
    return filteredByCategory.filter(({ store: s }) =>
      (s.storeNm ?? '').toLowerCase().includes(q) || (s.address ?? '').toLowerCase().includes(q) || (s.storeCeo ?? '').toLowerCase().includes(q)
    );
  }, [filteredByCategory, search]);

  // storeId는 브랜드별 중복 가능 → 전역 고유값인 storeNo로 찾아야 정확함
  // selectedStoreNo가 null이면 무조건 null 반환 (null === s.storeNo 매칭 방지)
  const selectedStore = useMemo(
    () => selectedStoreNo !== null ? (stores.find(s => s.storeNo === selectedStoreNo) ?? null) : null,
    [stores, selectedStoreNo],
  );

  // ── 핸들러 ────────────────────────────────────────────────
  const handleSelectStore = (id: string, storeNo: number) => {
    activeStoreRef.current = id; // 즉시 갱신 — 이후 도착하는 이전 매장 응답을 차단
    setSelectedId(id);
    setSelectedStoreNo(storeNo);
    setTab('info');
    setEditingSv(false);
    setSvInput(svMap[id] ?? '');
    setHelpdesk(null);
    setHelpdeskLoaded(null);
    setOpInfo(null);
    setOpLoaded(null);
    setFormEntries([]);   // 이전 매장 데이터 즉시 클리어
    setLogs([]);
    setIsLinked(false);          // 연동 여부 초기화
    setSelectedQscReports([]);  // 이전 매장 QSC 즉시 클리어
    checkLinked(id);             // 매장별 연동 여부 비동기 확인
    loadQscForStore(id);         // 매장별 QSC 개별 fetch
  };

  const loadOpInfo = async (storeId: string) => {
    if (opLoaded === storeId) return;
    setOpLoading(true);
    try {
      const list = await fetchOperationInfos([storeId]);
      if (activeStoreRef.current !== storeId) return;
      setOpInfo(list[0] ?? null);
      setOpLoaded(storeId);
    } catch {
      if (activeStoreRef.current === storeId) setOpInfo(null);
    } finally {
      if (activeStoreRef.current === storeId) setOpLoading(false);
    }
  };

  const handleTabChange = (t: typeof tab) => {
    setTab(t);
    if (t === 'helpdesk' && selectedId) loadHelpdesk(selectedId);
    if (t === 'operation' && selectedId) loadOpInfo(selectedId);
  };

  const handleSaveSv = async () => {
    if (!selectedId) return;
    setSavingSv(true);
    try {
      await setDoc(doc(salesDb, 'store_meta', selectedId), { sv: svInput.trim() }, { merge: true });
      setSvMap(prev => ({ ...prev, [selectedId]: svInput.trim() }));
      setEditingSv(false);
      toast.success('SV 정보가 저장되었습니다.');
    } catch { toast.error('저장 실패'); } finally { setSavingSv(false); }
  };

  const handleSaveEntry = async (entry: StoreFormEntry) => {
    await setDoc(doc(salesDb, 'store_form_entries', entry.id), scrub(entry));
    setFormEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
      return [...prev, entry];
    });
  };

  const handleAddLog = async () => {
    if (!logContent.trim() || !selectedId) return;
    setSavingLog(true);
    try {
      const payload = { storeId: selectedId, content: logContent.trim(), type: logType, createdAt: nowIso(), createdBy: currentUser.name };
      const ref = await addDoc(collection(salesDb, 'store_logs'), payload);
      setLogs(prev => [{ id: ref.id, ...payload }, ...prev]);
      setLogContent('');
      toast.success('메모가 저장되었습니다.');
    } catch { toast.error('저장 실패'); } finally { setSavingLog(false); }
  };

  const handleDeleteLog = async (id: string) => {
    const ok = await confirm({ title: '메모 삭제', message: '이 메모를 삭제하시겠습니까?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'store_logs', id));
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch { toast.error('삭제 실패'); }
  };

  // ── 렌더 ─────────────────────────────────────────────────

  // 분류 탭 정의
  const FILTER_TABS = [
    { id: 'all'        as const, label: '전체',        count: counts.all,        dot: 'bg-slate-400' },
    { id: 'needsVisit' as const, label: '방문일정 임박', count: counts.needsVisit, dot: 'bg-red-500' },
    { id: 'ok'         as const, label: '양호',        count: counts.ok,         dot: 'bg-emerald-500' },
    { id: 'unknown'    as const, label: '미확인',      count: counts.unknown,    dot: 'bg-stone-400' },
  ];

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden">

      {/* ── 좌측 매장 목록 ── */}
      <div className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* 헤더 */}
        <div className="px-3 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Building2 size={14} className="text-indigo-500" /> 매장 관리
            </h2>
            <button onClick={loadData} title="새로고침" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded">
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="매장 검색..." className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500" />
          </div>
          {/* 분류 탭 */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 -mx-3 px-1 gap-0 overflow-x-auto">
            {FILTER_TABS.map(t => (
              <button key={t.id} onClick={() => setFilterTab(t.id)}
                className={`flex items-center gap-1 px-2 py-2 text-[10px] font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                  filterTab === t.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[9px] font-black rounded-full px-1 ${
                    filterTab === t.id ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {storesLoading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-slate-400">
              <Loader2 size={16} className="animate-spin" /><span className="text-xs">불러오는 중...</span>
            </div>
          ) : storesError ? (
            <div className="p-4 text-center">
              <AlertTriangle size={20} className="text-red-500 mx-auto mb-1" />
              <p className="text-xs text-red-600 dark:text-red-400 mb-2">{storesError}</p>
              <button onClick={loadData} className="text-xs text-indigo-500 hover:underline">재시도</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">매장이 없습니다.</div>
          ) : (
            filtered.map(({ store, days, level }) => {
              const isSelected = selectedStoreNo === store.storeNo;
              const sv = svMap[store.storeId];
              return (
                <button key={store.storeNo} onClick={() => handleSelectStore(store.storeId, store.storeNo)}
                  className={`w-full px-3 py-2.5 text-left border-b border-slate-100 dark:border-slate-800 transition-colors border-l-2 ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-indigo-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-transparent'
                  }`}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${PRI[level].dot}`} />
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate flex-1">{store.storeNm}</span>
                    {days !== null && days >= 30 && (
                      <span className={`text-[10px] font-bold shrink-0 ${PRI[level].text}`}>{days}일</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 ml-3.5 truncate mt-0.5">{(store.address ?? '').split(' ').slice(0, 2).join(' ')}</p>
                  {sv && <p className="text-[10px] text-indigo-500 dark:text-indigo-400 ml-3.5 mt-0.5">SV: {sv}</p>}
                </button>
              );
            })
          )}
        </div>

        {/* 하단 통계 */}
        {!storesLoading && !storesError && (
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">
            {filtered.length}/{counts.all}개 표시 · <span className="text-red-500 dark:text-red-400">긴급 {counts.urgent}개</span>
          </div>
        )}
      </div>

      {/* ── 우측 패널 ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedStore ? (
          <StoreOverviewMap
            storeList={storeList}
            counts={counts}
            onSelect={handleSelectStore}
          />
        ) : (
          <>
            {/* 매장 헤더 */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">{selectedStore.storeNm}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedStore.address}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* SV 설정 */}
                  {editingSv ? (
                    <div className="flex items-center gap-1.5">
                      <input value={svInput} onChange={e => setSvInput(e.target.value)} placeholder="SV 이름" autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveSv()}
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 w-24 focus:outline-none focus:border-indigo-500" />
                      <button onClick={handleSaveSv} disabled={savingSv} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">저장</button>
                      <button onClick={() => setEditingSv(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded"><X size={13} /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingSv(true); setSvInput(svMap[selectedId!] ?? ''); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                      <UserIcon size={12} />
                      {svMap[selectedId!] ? `SV: ${svMap[selectedId!]}` : 'SV 설정'}
                    </button>
                  )}
                  {/* 가맹 일정 연동 */}
                  {isLinked ? (
                    <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                      <Check size={12} /> 일정 연동
                    </span>
                  ) : (
                    <button onClick={() => setShowScheduleModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                      <Plus size={12} /> 일정 연동
                    </button>
                  )}
                </div>
              </div>

              {/* 탭 메뉴 */}
              <div className="flex items-center gap-0 mt-3 -mb-4 border-b border-slate-200 dark:border-slate-700">
                {([
                  { id: 'info',      label: '기본정보',  icon: <Info size={11} /> },
                  { id: 'operation', label: '운영정보',  icon: <Layers size={11} /> },
                  { id: 'forms',     label: '폼 관리',   icon: <ClipboardList size={11} /> },
                  { id: 'qsc',       label: '점검현황',  icon: <ShieldAlert size={11} /> },
                  { id: 'helpdesk',  label: '매장요청',  icon: <MessageSquare size={11} /> },
                  { id: 'logs',      label: '이력/메모', icon: <StickyNote size={11} /> },
                ] as { id: typeof tab; label: string; icon: React.ReactNode }[]).map(t => (
                  <button key={t.id} onClick={() => handleTabChange(t.id)}
                    className={`flex items-center gap-1 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
                      tab === t.id ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-y-auto">

              {/* 기본정보 */}
              {tab === 'info' && (
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: '매장코드',  value: selectedStore.storeId },
                      { label: '대표자',   value: selectedStore.storeCeo },
                      { label: '전화',     value: selectedStore.phone || selectedStore.mobile || '-' },
                      { label: '상태',     value: selectedStore.storeStatus === 'O' ? '운영중' : selectedStore.storeStatus },
                      { label: '매장유형', value: selectedStore.storeType === 'F' ? '가맹' : (selectedStore.storeType || '-') },
                      { label: '계약상태', value: selectedStore.storeSubStatus || '-' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3">
                        <p className="text-[10px] font-bold text-slate-400 mb-1">{label}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">주소</p>
                    <p className="text-sm text-slate-900 dark:text-white">{selectedStore.address}</p>
                  </div>
                  {/* 마지막 QSC 요약 — per-store fetch 결과 사용 */}
                  {qscDetailLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
                      <Loader2 size={13} className="animate-spin" /> QSC 불러오는 중…
                    </div>
                  ) : selectedQscReports.length > 0 ? (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3">
                      <p className="text-[10px] font-bold text-slate-400 mb-2">마지막 QSC 점검</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{selectedQscReports[0].qscTitle}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(selectedQscReports[0].visitDate).toLocaleDateString('ko-KR')} ({getDaysSince(selectedQscReports[0].visitDate)}일 전)
                          </p>
                        </div>
                        {(() => {
                          const lv = priorityLevel(getDaysSince(selectedQscReports[0].visitDate));
                          return <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full shrink-0 ${PRI[lv].badge}`}>{PRI[lv].label}</span>;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                      QSC 점검 기록이 없습니다. 우선 방문이 필요합니다.
                    </div>
                  )}
                </div>
              )}

              {/* 운영정보 */}
              {tab === 'operation' && (
                <div className="p-6">
                  {opLoading ? (
                    <div className="flex items-center justify-center h-32 text-slate-400 gap-2">
                      <Loader2 size={16} className="animate-spin" /><span className="text-sm">불러오는 중…</span>
                    </div>
                  ) : !opInfo ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <Layers size={32} className="opacity-30" />
                      <p className="text-sm">운영정보 없음</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">매장 환경</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: '입점층수',   value: opInfo.pointType },
                            { label: '매장 크기',  value: opInfo.size },
                            { label: '좌석수',     value: opInfo.seat },
                            { label: '운영형태',   value: opInfo.type },
                            { label: '상권',       value: opInfo.bizDist },
                            { label: '세대수',     value: opInfo.household },
                          ].map(f => f.value ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.value}</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">비용</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: '권리금',     value: opInfo.premium },
                            { label: '보증금',     value: opInfo.deposit },
                            { label: '월임차료',   value: opInfo.monthlyRent },
                            { label: '인건비',     value: opInfo.laborCost },
                            { label: '배달대행비', value: opInfo.deliveryFee },
                            { label: '배달지역',   value: opInfo.deliveryArea },
                          ].map(f => f.value ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.value}</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">인원</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: '홀',       value: opInfo.hallStaff },
                            { label: '주방',     value: opInfo.kitchenStaff },
                            { label: '풀타임',   value: opInfo.fullTimeStaff },
                            { label: '파트타임', value: opInfo.partTimeStaff },
                          ].map(f => f.value ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.value}</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                      {opInfo.profile && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-400 mb-1">프로파일</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{opInfo.profile}</p>
                        </div>
                      )}
                      {opInfo.note && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 font-bold">특이사항</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{opInfo.note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 폼 관리 */}
              {tab === 'forms' && (
                <div className="p-6">
                  {forms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <ClipboardList size={32} className="opacity-30" />
                      <p className="text-sm">등록된 폼이 없습니다.</p>
                      <button onClick={() => {}} className="text-xs text-indigo-500 hover:underline">
                        매장 폼 관리에서 폼을 만들어주세요.
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {forms.map(form => {
                        const entry = formEntries.find(e => e.formId === form.id);
                        return (
                          <div key={form.id} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${entry?.isDone ? 'bg-emerald-500' : entry ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{form.title}</p>
                              {form.description && <p className="text-[11px] text-slate-500 truncate">{form.description}</p>}
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {entry ? (entry.isDone ? `완료 · ${entry.updatedAt.slice(0, 10)}` : `입력중 · ${entry.updatedAt.slice(0, 10)}`) : '미입력'}
                                {entry?.updatedBy ? ` · ${entry.updatedBy}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {entry?.isDone && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <Check size={10} /> 완료
                                </span>
                              )}
                              <button onClick={() => setEditingEntry({ form, entry: entry ?? null })}
                                className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                                {entry ? '수정' : '입력'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 점검현황 */}
              {tab === 'qsc' && (
                <div className="p-6">
                  {qscDetailLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <Loader2 size={28} className="animate-spin opacity-50" />
                      <p className="text-sm">QSC 데이터 로딩 중…</p>
                    </div>
                  ) : selectedQscReports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <ShieldAlert size={32} className="opacity-30" />
                      <p className="text-sm">QSC 점검 기록이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedQscReports.map(r => {
                        const days = getDaysSince(r.visitDate);
                        const lv = priorityLevel(days);
                        return (
                          <div key={r.reportNo} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{r.qscTitle}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  방문일: {new Date(r.visitDate).toLocaleDateString('ko-KR')} ({days}일 전)
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRI[lv].badge}`}>{PRI[lv].label}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  r.status === 'd' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>{r.status === 'd' ? '완료' : '작성중'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 매장요청 */}
              {tab === 'helpdesk' && (
                <div className="p-6">
                  {helpdeskLoading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                      <Loader2 size={16} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                    </div>
                  ) : helpdesk ? (
                    <div className="space-y-3">
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3">
                        <MessageSquare size={20} className="text-indigo-500 shrink-0" />
                        <div>
                          <p className="text-[11px] text-slate-400">전체 요청</p>
                          <p className="text-2xl font-black text-slate-900 dark:text-white">{helpdesk.totalCount}</p>
                        </div>
                      </div>
                      {Object.entries(helpdesk.statusCounts).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{status}</span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{count}건</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                      <MessageSquare size={32} className="opacity-30" />
                      <p className="text-sm">매장 요청 데이터가 없습니다.</p>
                    </div>
                  )}
                </div>
              )}

              {/* 이력/메모 */}
              {tab === 'logs' && (
                <div className="p-6 space-y-4">
                  {/* 입력 */}
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-3">
                    <select value={logType} onChange={e => setLogType(e.target.value as StoreLog['type'])}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none">
                      {(Object.entries(LOG_LABEL) as [StoreLog['type'], string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <textarea value={logContent} onChange={e => setLogContent(e.target.value)}
                      placeholder="이력 또는 메모를 입력하세요..." rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
                    <div className="flex justify-end">
                      <button onClick={handleAddLog} disabled={!logContent.trim() || savingLog}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                        <Plus size={13} /> {savingLog ? '저장 중...' : '메모 추가'}
                      </button>
                    </div>
                  </div>

                  {/* 목록 */}
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                      <Loader2 size={16} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                      <History size={28} className="opacity-30" />
                      <p className="text-sm">이력이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map(log => (
                        <div key={log.id} className="flex gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${LOG_CLR[log.type]}`}>{LOG_LABEL[log.type]}</span>
                              <span className="text-[10px] text-slate-400">{log.createdAt.slice(0, 16).replace('T', ' ')}</span>
                              <span className="text-[10px] text-slate-400">· {log.createdBy}</span>
                            </div>
                            <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{log.content}</p>
                          </div>
                          <button onClick={() => handleDeleteLog(log.id)} className="p-1 text-slate-300 hover:text-red-500 shrink-0 self-start rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </>
        )}
      </div>

      {/* 폼 항목 편집 모달 */}
      {editingEntry && selectedStore && (
        <FormEntryModal
          storeId={selectedStore.storeId}
          storeName={selectedStore.storeNm}
          form={editingEntry.form}
          entry={editingEntry.entry}
          onSave={handleSaveEntry}
          onClose={() => setEditingEntry(null)}
          currentUser={currentUser}
        />
      )}

      {/* 가맹 일정 생성 모달 */}
      {showScheduleModal && selectedStore && (
        <FcdaumScheduleCreateModal
          store={selectedStore}
          onClose={() => setShowScheduleModal(false)}
          onCreated={() => {
            setShowScheduleModal(false);
            setIsLinked(true);
            toast.success('가맹 일정이 생성되었습니다.');
          }}
        />
      )}
    </div>
  );
}
