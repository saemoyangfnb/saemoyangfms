import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { salesDb } from '../../firebase';
import {
  collection, getDocs, addDoc, setDoc, doc, query, where, deleteDoc,
} from 'firebase/firestore';
import { User, StoreForm, StoreFormEntry } from '../../types';
import {
  fetchHelpdeskSummary, fetchOperationInfos,
  FcdaumStore, FcdaumQscReport, FcdaumHelpdeskSummary, FcdaumOperationInfo,
} from '../../fcdaum';
import { getDailyStoreData } from '../../fcdaumSnapshot';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import {
  Building2, Search, AlertTriangle, Plus, X, ClipboardList,
  History, Check, Trash2, RefreshCw, Loader2, ShieldAlert,
  MessageSquare, User as UserIcon, ChevronRight, ChevronLeft, Info,
  StickyNote, Layers, EyeOff, Eye,
} from 'lucide-react';
import { FcdaumScheduleCreateModal } from '../admin/FcdaumScheduleCreateModal';
import { loadHiddenStoreIds, toggleHiddenStoreId } from '../../storeHidden';
import { buildStoreItems, countByLevel, getDaysSince, priorityLevel } from './storePriority';

// ── 로컬 타입 ──────────────────────────────────────────────────
interface StoreLog {
  id: string;
  storeId: string;
  content: string;
  type: 'memo' | 'visit' | 'call' | 'warning' | 'other';
  createdAt: string;
  createdBy: string;
}

// ── QSC 우선순위 (4단계 분류는 ./storePriority 공통 모듈에서 정의) ──────────────
const PRI = {
  0: { label: '미확인',   dot: 'bg-stone-400',   text: 'text-stone-500 dark:text-stone-400',     badge: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  1: { label: '기한 초과', dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  2: { label: '기한 임박', dot: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-400',     badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  3: { label: '양호',     dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  4: { label: '조회 실패', dot: 'bg-violet-500',  text: 'text-violet-700 dark:text-violet-400',   badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
} as const;

// FC다움 영어 상태 코드 → 한국어 (알 수 없는 값은 원본 유지)
const STORE_STATUS_KO: Record<string, string> = {
  o: '운영중', open: '운영중', operating: '운영중',
  c: '폐점', close: '폐점', closed: '폐점',
  p: '준비중', ready: '준비중', pending: '준비중',
  s: '정지', stop: '정지', suspended: '정지',
  h: '휴점', hold: '휴점',
  general_new: '일반신규', transfer_new: '양수신규',
};
const HELPDESK_STATUS_KO: Record<string, string> = {
  unconfirmed: '미확인', unread: '미확인', new: '신규',
  requested: '접수', request: '접수', open: '접수', received: '접수',
  waiting: '대기', wait: '대기', pending: '보류',
  in_progress: '진행중', inprogress: '진행중', progress: '진행중', processing: '처리중', ongoing: '진행중',
  completed: '완료', complete: '완료', done: '완료', resolved: '완료', closed: '완료',
  rejected: '반려', reject: '반려', canceled: '취소', cancelled: '취소', cancel: '취소',
};
const koStatus = (v: string | undefined | null, map: Record<string, string>) => {
  if (!v) return '-';
  const key = String(v).toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'empty' || key === 'none') return '-';
  return map[key] ?? map[String(v).toLowerCase()] ?? v;
};

// 운영정보 빈 값 정규화 — FC다움이 'EMPTY'/'NONE' 문자열로 빈 값을 보냄 → 카드 숨김
const opVal = (v?: string | null) => {
  const t = (v ?? '').trim();
  return (!t || t.toUpperCase() === 'EMPTY' || t.toUpperCase() === 'NONE') ? '' : t;
};

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
  const [failedStoreIds, setFailedStoreIds] = useState<Set<string>>(new Set());
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  // 메타 (SV)
  const [svMap, setSvMap] = useState<Record<string, string>>({});

  // UI 상태
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStoreNo, setSelectedStoreNo] = useState<number | null>(null);
  const activeStoreRef = useRef<string | null>(null); // 비동기 콜백 race condition 방지
  const [tab, setTab] = useState<'info' | 'operation' | 'forms' | 'qsc' | 'helpdesk' | 'logs'>('info');
  const [filterTab, setFilterTab] = useState<'all' | 'overdue' | 'soon' | 'ok' | 'unknown' | 'failed'>('all');
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

  // 숨김 처리 (양도양수 중복 매장 등)
  const [hiddenStoreIds, setHiddenStoreIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [savingHidden, setSavingHidden] = useState(false);

  // 가맹 일정 연동 여부 (선택된 매장 기준)
  const [isLinked, setIsLinked] = useState<boolean>(false);

  // 매장별 QSC 상세 (per-store fetch — bulk 매칭 오류 방지)
  const [selectedQscReports, setSelectedQscReports] = useState<FcdaumQscReport[]>([]);
  const [qscDetailLoading, setQscDetailLoading] = useState(false);

  // ── 초기 로드 ────────────────────────────────────────────────
  const loadData = useCallback(async (force = false) => {
    setStoresLoading(true);
    setStoresError(null);
    try {
      // FC다움 호출은 전사 하루 1회(getDailyStoreData) — 매장 목록·QSC 모두 공유 스냅샷에서.
      // force=true(새로고침 버튼)는 메모리 캐시만 건너뛰고 스냅샷을 다시 읽을 뿐,
      // 오늘자 스냅샷이 있으면 FC다움은 호출하지 않는다.
      const [daily, formSnap] = await Promise.all([
        getDailyStoreData(force),
        getDocs(collection(salesDb, 'store_forms')),
      ]);
      setStores(daily.stores);
      setQscReports(daily.qscReports);
      setFailedStoreIds(new Set(daily.failedStoreIds));
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

      // 숨김 목록 (비차단 — 실패해도 빈 Set으로 계속)
      loadHiddenStoreIds().then(setHiddenStoreIds).catch(() => {});

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
    loadFormEntries(selectedId, selectedStoreNo);
    loadLogs(selectedId);
  }, [selectedId, selectedStoreNo]);

  // 폼 내용은 매장폼관리(마인드맵)에서 '관리번호'(=FC다움 storeNo) 키로 저장되는데,
  // 가맹관리는 FC다움 storeId(매장코드)로 조회해 와서 매칭 0건이었다(버그). 두 키
  // (storeId=매장코드 / String(storeNo)=관리번호) 모두로 조회해 폼 내용을 연결한다.
  const loadFormEntries = async (storeId: string, storeNo?: number | null) => {
    try {
      const keys = [storeId, storeNo != null ? String(storeNo) : '']
        .filter((v, i, arr) => v && arr.indexOf(v) === i);
      const snap = await getDocs(query(collection(salesDb, 'store_form_entries'), where('storeId', 'in', keys)));
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

  // 선택된 매장의 QSC 보고서 — 일일 스냅샷(qscReports)에서 storeNo로 필터(FC다움 무호출).
  // 스윕이 운영매장 전수 QSC를 이미 받아오므로 상세도 추가 호출 없이 서빙된다.
  const loadQscForStore = (storeId: string, storeNo: number) => {
    setQscDetailLoading(false); // 동기 서빙 — 로딩 스피너 불필요
    // storeNo(전역 고유, 정확) 우선 + storeId(어제까지의 직접 조회 경로) 둘 다 매칭해 스냅샷에서 서빙.
    // 오늘 캐싱 전환이 storeNo 단독으로 바뀌며 일부 매장 상세가 비던 회귀를 복원.
    // ⚠️ storeId 중복으로 인한 오매칭(남의 리포트 표시)은 식별자 통합 과제에서 별도 해결.
    setSelectedQscReports(
      qscReports
        .filter(r => r.storeNo === storeNo || (!!storeId && r.storeId === storeId))
        .sort((a, b) => b.visitDate - a.visitDate),
    );
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
  const visibleStores = useMemo(
    () => showHidden ? stores : stores.filter(s => !hiddenStoreIds.has(s.storeId)),
    [stores, hiddenStoreIds, showHidden],
  );
  const storeList = useMemo(
    () => buildStoreItems(visibleStores, qscReports, failedStoreIds).sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity)),
    [visibleStores, qscReports, failedStoreIds],
  );

  // 분류 탭별 카운트 (4단계 — 홈 위젯과 동일한 countByLevel 사용)
  const counts = useMemo(() => countByLevel(storeList), [storeList]);

  const filteredByCategory = useMemo(() => {
    switch (filterTab) {
      case 'overdue': return storeList.filter(s => s.level === 1);
      case 'soon':    return storeList.filter(s => s.level === 2);
      case 'ok':      return storeList.filter(s => s.level === 3);
      case 'unknown': return storeList.filter(s => s.level === 0);
      case 'failed':  return storeList.filter(s => s.level === 4);
      default:        return storeList;
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
    loadQscForStore(id, storeNo); // 매장 QSC — 일일 스냅샷에서 필터(무호출)
  };

  // 매장 상세 → 현황 화면으로 복귀
  const handleBackToMap = () => {
    activeStoreRef.current = null;
    setSelectedId(null);
    setSelectedStoreNo(null);
  };

  // 양도양수 등 중복 매장 숨김/해제 (관리자 전용)
  const handleToggleHidden = async (storeId: string) => {
    const isHidden = hiddenStoreIds.has(storeId);
    const ok = await confirm({
      title: isHidden ? '숨김 해제' : '매장 숨김 처리',
      message: isHidden
        ? '이 매장을 다시 목록에 표시하시겠습니까?'
        : '이 매장을 가맹관리·폼관리·홈 위젯에서 숨기시겠습니까?\n양도양수로 중복된 구 매장 등에 사용하세요.',
      confirmLabel: isHidden ? '해제' : '숨김',
      variant: 'danger',
    });
    if (!ok) return;
    setSavingHidden(true);
    try {
      await toggleHiddenStoreId(storeId, !isHidden);
      const updated = await loadHiddenStoreIds();
      setHiddenStoreIds(updated);
      toast.success(isHidden ? '숨김이 해제됐습니다.' : '매장이 숨겨졌습니다.');
      if (!isHidden) handleBackToMap();
    } catch { toast.error('처리 중 오류가 발생했습니다.'); }
    finally { setSavingHidden(false); }
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
    { id: 'all'     as const, label: '전체',     count: counts.all,     dot: 'bg-slate-400' },
    { id: 'overdue' as const, label: '기한 초과', count: counts.overdue, dot: 'bg-red-500' },
    { id: 'soon'    as const, label: '기한 임박', count: counts.soon,    dot: 'bg-amber-500' },
    { id: 'ok'      as const, label: '양호',     count: counts.ok,      dot: 'bg-emerald-500' },
    { id: 'unknown' as const, label: '미확인',   count: counts.unknown, dot: 'bg-stone-400' },
    // 조회 실패 매장이 있을 때만 칩 노출 (일시적 API 실패 — 미확인과 구분)
    ...(counts.failed > 0
      ? [{ id: 'failed' as const, label: '조회 실패', count: counts.failed, dot: 'bg-violet-500' }]
      : []),
  ];

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-[480px] bg-white dark:bg-slate-900 overflow-hidden">

      {/* ── 좌측 매장 목록 ── */}
      <div className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* 헤더 */}
        <div className="px-3 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Building2 size={14} className="text-indigo-500" /> 매장 관리
            </h2>
            <button onClick={() => loadData(true)} title="새로고침 (오늘자 스냅샷 다시 읽기)" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded">
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
              const isHidden = hiddenStoreIds.has(store.storeId);
              return (
                <button key={store.storeNo} onClick={() => handleSelectStore(store.storeId, store.storeNo)}
                  className={`w-full px-3 py-2.5 text-left border-b border-slate-100 dark:border-slate-800 transition-colors border-l-2 ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-indigo-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-transparent'
                  } ${isHidden ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${PRI[level].dot}`} />
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate flex-1">{store.storeNm}</span>
                    {isHidden && <span className="text-[9px] text-amber-500 font-bold shrink-0">숨김</span>}
                    {!isHidden && days !== null && days >= 45 && (
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

        {/* 하단 통계 + 숨김 토글 */}
        {!storesLoading && !storesError && (
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 flex items-center justify-between gap-1">
            <span>{filtered.length}/{counts.all}개 · <span className="text-red-500 dark:text-red-400">초과 {counts.overdue}</span></span>
            {hiddenStoreIds.size > 0 && (
              <button onClick={() => setShowHidden(p => !p)}
                className={`flex items-center gap-1 transition-colors ${showHidden ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                {showHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                숨김 {hiddenStoreIds.size}개
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 우측 패널 ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedStore ? (
          <div className="flex-1 flex flex-col items-center justify-start p-8 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
            {/* 현황 카드 */}
            <div className="w-full max-w-lg">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">가맹점 현황</p>
              <div className="grid grid-cols-5 gap-3 mb-10">
                {([
                  { label: '전체',     value: counts.all,     border: 'border-l-slate-300 dark:border-l-slate-600', num: 'text-slate-800 dark:text-white' },
                  { label: '미확인',   value: counts.unknown, border: 'border-l-stone-300 dark:border-l-stone-500',  num: 'text-stone-500 dark:text-stone-400' },
                  { label: '기한 초과', value: counts.overdue, border: 'border-l-red-400',                           num: 'text-red-600 dark:text-red-400' },
                  { label: '기한 임박', value: counts.soon,    border: 'border-l-amber-400',                         num: 'text-amber-600 dark:text-amber-400' },
                  { label: '양호',     value: counts.ok,      border: 'border-l-emerald-400',                       num: 'text-emerald-600 dark:text-emerald-400' },
                ] as const).map(c => (
                  <div key={c.label} className={`border-l-4 ${c.border} bg-white dark:bg-slate-800 rounded-r-lg px-3 py-3 shadow-sm`}>
                    <p className={`text-2xl font-black leading-none ${c.num}`}>{c.value}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center">왼쪽 목록에서 매장을 선택하세요</p>
            </div>
          </div>
        ) : (
          <>
            {/* 매장 헤더 */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <button onClick={handleBackToMap}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-1.5 transition-colors">
                    <ChevronLeft size={13} /> 목록으로
                  </button>
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
                  {/* 숨김 처리 — 관리자 전용, 양도양수 중복 매장 등 */}
                  {currentUser.role === 'admin' && selectedId && (
                    <button onClick={() => handleToggleHidden(selectedId)} disabled={savingHidden}
                      title={hiddenStoreIds.has(selectedId) ? '이 매장 숨김 해제' : '이 매장 숨김 처리 (양도양수 중복 등)'}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                        hiddenStoreIds.has(selectedId)
                          ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}>
                      {hiddenStoreIds.has(selectedId) ? <Eye size={12} /> : <EyeOff size={12} />}
                      {hiddenStoreIds.has(selectedId) ? '숨김 해제' : '숨김'}
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
                      { label: '상태',     value: koStatus(selectedStore.storeStatus, STORE_STATUS_KO) },
                      { label: '매장유형', value: selectedStore.storeType === 'F' ? '가맹' : (selectedStore.storeType || '-') },
                      { label: '계약상태', value: koStatus(selectedStore.storeSubStatus, STORE_STATUS_KO) },
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
                          ].map(f => { const v = opVal(f.value); return v ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{v}</p>
                            </div>
                          ) : null; })}
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
                          ].map(f => { const v = opVal(f.value); return v ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{v}</p>
                            </div>
                          ) : null; })}
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
                          ].map(f => { const v = opVal(f.value); return v ? (
                            <div key={f.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-slate-400 mb-0.5">{f.label}</p>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{v}</p>
                            </div>
                          ) : null; })}
                        </div>
                      </div>
                      {opVal(opInfo.profile) && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-400 mb-1">프로파일</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{opVal(opInfo.profile)}</p>
                        </div>
                      )}
                      {opVal(opInfo.note) && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 font-bold">특이사항</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{opVal(opInfo.note)}</p>
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
                          <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{koStatus(status, HELPDESK_STATUS_KO)}</span>
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
