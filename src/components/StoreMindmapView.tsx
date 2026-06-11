import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, query, where,
} from 'firebase/firestore';
import { Store, User, StoreForm, StoreFormField, StoreFormEntry } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, X, Search, ChevronDown, ChevronRight, Edit2, Trash2,
  Check, GitBranch, LayoutList, ClipboardList, Clock, Copy,
  MoreHorizontal,
} from 'lucide-react';

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const nowTs = () => new Date().toISOString();
function scrub<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  ) as T;
}

// ── 폼 에디터 모달 ────────────────────────────────────────
function FormEditorModal({ form, allForms, onSave, onClose, currentUser }: {
  form: StoreForm | null;
  allForms: StoreForm[];
  onSave: (f: StoreForm) => Promise<void>;
  onClose: () => void;
  currentUser: User;
}) {
  const [title, setTitle] = useState(form?.title ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [fields, setFields] = useState<StoreFormField[]>(form?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [loadSrc, setLoadSrc] = useState('');
  const { toast } = useToast();

  const addField = () => setFields(p => [...p, { id: genId('fld'), label: '', type: 'text' }]);

  const removeField = (id: string) => setFields(p => p.filter(f => f.id !== id));

  const updateField = (id: string, patch: Partial<StoreFormField>) =>
    setFields(p => p.map(f => f.id === id ? { ...f, ...patch } : f));

  const loadFromForm = (srcId: string) => {
    const src = allForms.find(f => f.id === srcId);
    if (!src) return;
    setFields(src.fields.map(f => ({ ...f, id: genId('fld') })));
    setLoadSrc('');
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('폼 제목을 입력하세요.'); return; }
    if (fields.length === 0) { toast.error('항목을 하나 이상 추가하세요.'); return; }
    if (fields.some(f => !f.label.trim())) { toast.error('항목명을 모두 입력하세요.'); return; }
    setSaving(true);
    try {
      await onSave(scrub({
        id: form?.id ?? genId('form'),
        title: title.trim(),
        description: description.trim() || undefined,
        fields,
        createdAt: form?.createdAt ?? nowTs(),
        createdBy: form?.createdBy ?? currentUser.name,
        isArchived: form?.isArchived ?? false,
      }));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 w-full max-w-lg rounded-sm border-[3px] border-double border-stone-800 dark:border-stone-400 flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <span className="font-black text-stone-900 dark:text-stone-100 text-sm flex-1">
            {form ? '폼 수정' : '새 폼 만들기'}
          </span>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">폼 제목 *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="예: 신메뉴 시행 체크 2026-06"
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-sm focus:outline-none focus:border-stone-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">설명 (선택)</label>
            <input
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="이 폼의 목적..."
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-sm focus:outline-none focus:border-stone-600"
            />
          </div>

          {/* 기존 폼에서 불러오기 */}
          {allForms.filter(f => f.id !== form?.id).length > 0 && (
            <div className="bg-stone-50 dark:bg-stone-800 rounded-sm p-2 border border-stone-200 dark:border-stone-700">
              <div className="flex items-center gap-2">
                <Copy size={12} className="text-stone-400 shrink-0" />
                <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">기존 폼에서 항목 불러오기</span>
              </div>
              <div className="flex gap-2 mt-1.5">
                <select
                  value={loadSrc} onChange={e => setLoadSrc(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 rounded-sm focus:outline-none"
                >
                  <option value="">폼 선택...</option>
                  {allForms.filter(f => f.id !== form?.id).map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <button
                  onClick={() => loadFromForm(loadSrc)} disabled={!loadSrc}
                  className="px-3 py-1 text-xs font-bold bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-sm hover:bg-stone-300 dark:hover:bg-stone-600 disabled:opacity-40"
                >
                  불러오기
                </button>
              </div>
            </div>
          )}

          {/* 항목 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-stone-500 dark:text-stone-400">입력 항목 *</label>
              <button onClick={addField} className="text-[11px] font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1">
                <Plus size={12} /> 항목 추가
              </button>
            </div>
            <div className="space-y-1.5">
              {fields.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-1.5 rounded-sm">
                  <span className="text-[10px] text-stone-400 w-4 shrink-0">{idx + 1}</span>
                  <input
                    value={f.label} onChange={e => updateField(f.id, { label: e.target.value })}
                    placeholder="항목명 (예: 시행일)"
                    className="flex-1 min-w-0 px-2 py-1 border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-xs rounded-sm focus:outline-none"
                  />
                  <select
                    value={f.type} onChange={e => updateField(f.id, { type: e.target.value as StoreFormField['type'] })}
                    className="text-xs px-1.5 py-1 border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 rounded-sm focus:outline-none shrink-0"
                  >
                    <option value="text">텍스트</option>
                    <option value="date">날짜</option>
                    <option value="checkbox">체크</option>
                    <option value="select">선택</option>
                  </select>
                  {f.type === 'select' && (
                    <input
                      value={f.options?.join(',') ?? ''}
                      onChange={e => updateField(f.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="옵션1,옵션2"
                      className="w-24 px-1.5 py-1 border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-xs rounded-sm focus:outline-none"
                    />
                  )}
                  <button onClick={() => removeField(f.id)} className="text-stone-300 hover:text-red-500 shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-[11px] text-stone-400 text-center py-3">항목이 없습니다. 추가해주세요.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700 shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">취소</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 매장 입력 모달 ─────────────────────────────────────────
function EntryModal({ store, form, entry, onSave, onClose, currentUser }: {
  store: Store;
  form: StoreForm;
  entry: StoreFormEntry | null;
  onSave: (e: StoreFormEntry) => Promise<void>;
  onClose: () => void;
  currentUser: User;
}) {
  const [data, setData] = useState<Record<string, string | boolean>>(entry?.data ?? {});
  const [isDone, setIsDone] = useState(entry?.isDone ?? false);
  const [saving, setSaving] = useState(false);

  const setValue = (fieldId: string, value: string | boolean) =>
    setData(prev => ({ ...prev, [fieldId]: value }));

  const handleSave = async () => {
    setSaving(true);
    const now = nowTs();
    try {
      await onSave(scrub({
        id: entry?.id ?? genId('ent'),
        formId: form.id,
        storeId: store.id,
        storeName: store.name,
        storeRegion: store.region,
        data,
        isDone,
        completedAt: isDone ? (entry?.completedAt ?? now) : undefined,
        updatedAt: now,
        updatedBy: currentUser.name,
      }));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 w-full max-w-sm rounded-sm border-[3px] border-double border-stone-800 dark:border-stone-400 flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{store.name}</p>
            <p className="text-[10px] text-stone-400">{store.region} · {form.title}</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {form.fields.map(field => (
            <div key={field.id}>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">{field.label}</label>
              {field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={!!data[field.id]}
                    onChange={e => setValue(field.id, e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-stone-700 dark:text-stone-300">{field.label}</span>
                </label>
              ) : field.type === 'date' ? (
                <input
                  type="date" value={String(data[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-sm focus:outline-none focus:border-stone-600"
                />
              ) : field.type === 'select' ? (
                <select
                  value={String(data[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-sm focus:outline-none"
                >
                  <option value="">선택하세요</option>
                  {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type="text" value={String(data[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  placeholder="입력..."
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-sm focus:outline-none focus:border-stone-600"
                />
              )}
            </div>
          ))}

          <div className="pt-2 border-t border-stone-200 dark:border-stone-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setIsDone(v => !v)}
                className={`w-5 h-5 rounded-sm border-2 flex items-center justify-center cursor-pointer transition-colors ${
                  isDone ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-600'
                }`}
              >
                {isDone && <Check size={12} className="text-white" />}
              </div>
              <span className="text-sm font-bold text-stone-700 dark:text-stone-300">완료 처리</span>
            </label>
            {entry?.updatedAt && (
              <p className="mt-1 text-[10px] text-stone-400">
                최종 수정: {entry.updatedBy ?? '-'} · {entry.updatedAt.slice(0, 10)}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700 shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">취소</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 마인드맵 트리 노드 ─────────────────────────────────────
function MindMapRegionNode({
  region, stores, entryMap,
  onClickStore, onClickRegion, isHighlighted,
}: {
  region: string;
  stores: Store[];
  entryMap: Map<string, StoreFormEntry>;
  onClickStore: (s: Store) => void;
  onClickRegion: (r: string) => void;
  isHighlighted: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const done = stores.filter(s => entryMap.get(s.id)?.isDone).length;

  return (
    <div className="flex items-start gap-0">
      {/* 세로선 */}
      <div className="w-8 shrink-0 flex flex-col items-center">
        <div className="w-px flex-1 bg-stone-300 dark:bg-stone-600 mt-3" />
      </div>

      <div className="flex-1 min-w-0 mb-2">
        {/* 권역 노드 */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-4 h-px bg-stone-300 dark:bg-stone-600 shrink-0" />
          <button
            onClick={() => onClickRegion(region)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-bold transition-colors ${
              isHighlighted
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-400'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
          >
            <span>{region}</span>
            <span className="text-[10px] font-normal opacity-70">{done}/{stores.length}</span>
            {done === stores.length && stores.length > 0 && (
              <Check size={10} className="text-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {/* 매장 노드들 */}
        {expanded && (
          <div className="ml-4 space-y-0.5">
            {stores.map((store, idx) => {
              const entry = entryMap.get(store.id);
              const isLast = idx === stores.length - 1;
              return (
                <div key={store.id} className="flex items-center gap-0">
                  {/* 연결선 */}
                  <div className="w-8 shrink-0 relative self-stretch">
                    <div className={`absolute left-0 top-0 bottom-0 w-px bg-stone-200 dark:bg-stone-700 ${isLast ? 'h-1/2 bottom-auto' : ''}`} />
                    <div className="absolute left-0 top-1/2 w-4 h-px bg-stone-200 dark:bg-stone-700 -translate-y-px" />
                  </div>
                  <button
                    onClick={() => onClickStore(store)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left max-w-[160px] group"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      entry?.isDone ? 'bg-emerald-500' : entry ? 'bg-amber-400' : 'bg-stone-300 dark:bg-stone-600'
                    }`} />
                    <span className="text-stone-700 dark:text-stone-300 truncate">{store.name}</span>
                    {entry?.isDone && entry.completedAt && (
                      <span className="text-[9px] text-stone-400 shrink-0">{entry.completedAt.slice(5, 10)}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
interface Props {
  currentUser: User;
}

export function StoreMindmapView({ currentUser }: Props) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [forms, setForms] = useState<StoreForm[]>([]);
  const [selectedForm, setSelectedForm] = useState<StoreForm | null>(null);
  const [entries, setEntries] = useState<StoreFormEntry[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [activeTab, setActiveTab] = useState<'mindmap' | 'list'>('list');
  const [search, setSearch] = useState('');
  const [highlightRegion, setHighlightRegion] = useState<string | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const [editingEntry, setEditingEntry] = useState<{ store: Store; entry: StoreFormEntry | null } | null>(null);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<StoreForm | null>(null);
  const [formMenuOpen, setFormMenuOpen] = useState<string | null>(null);

  // ── 데이터 로드 ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      getDocs(collection(salesDb, 'store_forms')),
      getDocs(collection(salesDb, 'stores')),
    ]).then(([formSnap, storeSnap]) => {
      const fs = formSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as StoreForm))
        .filter(f => !f.isArchived)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setForms(fs);
      setStores(
        storeSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Store))
          .filter(s => s.status !== '폐점')
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      );
      if (fs.length > 0) setSelectedForm(fs[0]);
      setLoadingForms(false);
    }).catch(() => setLoadingForms(false));
  }, []);

  useEffect(() => {
    if (!selectedForm) { setEntries([]); return; }
    setLoadingEntries(true);
    getDocs(query(collection(salesDb, 'store_form_entries'), where('formId', '==', selectedForm.id)))
      .then(snap => {
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreFormEntry)));
      })
      .catch(() => {})
      .finally(() => setLoadingEntries(false));
  }, [selectedForm?.id]);

  // ── 파생 데이터 ──────────────────────────────────────────
  const entryMap = useMemo(() => {
    const m = new Map<string, StoreFormEntry>();
    entries.forEach(e => m.set(e.storeId, e));
    return m;
  }, [entries]);

  const regionGroups = useMemo(() => {
    const map = new Map<string, Store[]>();
    stores.forEach(s => {
      const r = s.region || '미분류';
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(s);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'));
  }, [stores]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return regionGroups;
    return regionGroups
      .map(([region, storeList]) => [
        region,
        storeList.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q) ||
          s.ceoName?.toLowerCase().includes(q) ||
          s.operatorName?.toLowerCase().includes(q) ||
          s.storeCode?.toLowerCase().includes(q)
        ),
      ] as [string, Store[]])
      .filter(([, list]) => list.length > 0);
  }, [regionGroups, search]);

  const totalStats = useMemo(() => {
    const total = stores.length;
    const done = entries.filter(e => e.isDone).length;
    return { total, done };
  }, [stores, entries]);

  // ── 폼 CRUD ────────────────────────────────────────────
  const handleSaveForm = useCallback(async (f: StoreForm) => {
    await setDoc(doc(salesDb, 'store_forms', f.id), scrub(f));
    setForms(prev => {
      const exists = prev.find(x => x.id === f.id);
      if (exists) return prev.map(x => x.id === f.id ? f : x);
      return [f, ...prev];
    });
    if (!selectedForm) setSelectedForm(f);
    toast.success('폼이 저장됐습니다.');
  }, [selectedForm, toast]);

  const handleDeleteForm = useCallback(async (f: StoreForm) => {
    const ok = await confirm({
      title: '폼 삭제',
      message: `"${f.title}" 폼과 해당 매장 응답 데이터가 모두 삭제됩니다.`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'store_forms', f.id));
    setForms(prev => prev.filter(x => x.id !== f.id));
    if (selectedForm?.id === f.id) setSelectedForm(forms.find(x => x.id !== f.id) ?? null);
    toast.success('폼이 삭제됐습니다.');
  }, [confirm, forms, selectedForm, toast]);

  // ── 항목 저장/업데이트 ─────────────────────────────────
  const handleSaveEntry = useCallback(async (entry: StoreFormEntry) => {
    await setDoc(doc(salesDb, 'store_form_entries', entry.id), scrub(entry));
    setEntries(prev => {
      const exists = prev.find(e => e.id === entry.id);
      if (exists) return prev.map(e => e.id === entry.id ? entry : e);
      return [...prev, entry];
    });
    toast.success(`${entry.storeName} 저장됐습니다.`);
  }, [toast]);

  // ── 권역 클릭 → 목록 탭 이동 & 스크롤 ────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const regionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleRegionClick = (region: string) => {
    setActiveTab('list');
    setHighlightRegion(region);
    setExpandedRegions(prev => new Set([...prev, region]));
    setTimeout(() => {
      const el = regionRefs.current.get(region);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // ── 렌더 ──────────────────────────────────────────────
  if (loadingForms) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#FDFBF7] dark:bg-stone-950">
      {/* ── 왼쪽: 폼 목록 ───────────────────────── */}
      <aside className="w-56 shrink-0 border-r-[3px] border-double border-stone-300 dark:border-stone-700 flex flex-col bg-white dark:bg-stone-900">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-200 dark:border-stone-800">
          <span className="text-[11px] font-black text-stone-600 dark:text-stone-400 tracking-wider">매장 폼</span>
          {isAdmin && (
            <button
              onClick={() => { setEditingForm(null); setFormEditorOpen(true); }}
              className="p-1 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              title="새 폼 만들기"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {forms.length === 0 && (
            <div className="px-3 py-6 text-center">
              <ClipboardList size={24} className="text-stone-300 dark:text-stone-600 mx-auto mb-2" />
              <p className="text-[11px] text-stone-400">폼이 없습니다.</p>
              {isAdmin && (
                <button
                  onClick={() => { setEditingForm(null); setFormEditorOpen(true); }}
                  className="mt-2 text-[11px] font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  + 첫 폼 만들기
                </button>
              )}
            </div>
          )}
          {forms.map(f => {
            const fEntries = entries.filter(e => e.formId === f.id);
            const isDone = selectedForm?.id === f.id;
            return (
              <div
                key={f.id}
                className={`relative group border-b border-stone-100 dark:border-stone-800 ${
                  isDone ? 'bg-stone-100 dark:bg-stone-800' : ''
                }`}
              >
                <button
                  onClick={() => { setSelectedForm(f); setSearch(''); }}
                  className="w-full text-left px-3 py-2.5"
                >
                  <p className={`text-xs font-bold truncate ${
                    isDone ? 'text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400'
                  }`}>
                    {f.title}
                  </p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {f.fields.length}개 항목 · {f.createdAt.slice(0, 10)}
                  </p>
                  {selectedForm?.id === f.id && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {totalStats.done}/{totalStats.total} 완료
                    </p>
                  )}
                </button>

                {isAdmin && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5">
                    <button
                      onClick={() => { setEditingForm(f); setFormEditorOpen(true); }}
                      className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                    >
                      <Edit2 size={11} />
                    </button>
                    <button
                      onClick={() => handleDeleteForm(f)}
                      className="p-1 text-stone-400 hover:text-red-500"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── 오른쪽: 탭 + 콘텐츠 ─────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!selectedForm ? (
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">왼쪽에서 폼을 선택하거나 새로 만드세요.</p>
            </div>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b-[3px] border-double border-stone-300 dark:border-stone-700 shrink-0 bg-white dark:bg-stone-900">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{selectedForm.title}</h2>
                {selectedForm.description && (
                  <p className="text-[10px] text-stone-400">{selectedForm.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* 진행률 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-20 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${totalStats.total > 0 ? Math.round(totalStats.done / totalStats.total * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                    {totalStats.done}/{totalStats.total}
                  </span>
                </div>
                {/* 탭 전환 */}
                <div className="flex border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
                  <button
                    onClick={() => setActiveTab('mindmap')}
                    className={`px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      activeTab === 'mindmap'
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <GitBranch size={11} /> 맵
                  </button>
                  <button
                    onClick={() => setActiveTab('list')}
                    className={`px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      activeTab === 'list'
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <LayoutList size={11} /> 목록
                  </button>
                </div>
              </div>
            </div>

            {loadingEntries ? (
              <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">로딩 중...</div>
            ) : (
              <>
                {/* ── 마인드맵 탭 ──────────────── */}
                {activeTab === 'mindmap' && (
                  <div className="flex-1 overflow-auto p-6">
                    <div className="flex items-start gap-0 min-w-max">
                      {/* 루트 노드 */}
                      <div className="flex flex-col items-center shrink-0 mr-0">
                        <div className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-sm font-black text-sm">
                          {selectedForm.title}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1">
                          {totalStats.done}/{totalStats.total} 완료 ({totalStats.total > 0 ? Math.round(totalStats.done / totalStats.total * 100) : 0}%)
                        </div>
                        {/* 루트에서 나오는 수평선 */}
                        <div className="w-px flex-1 bg-stone-300 dark:bg-stone-600 mt-2" style={{ minHeight: 32 }} />
                      </div>

                      {/* 수평 연결선 */}
                      <div className="w-8 self-stretch flex flex-col justify-center shrink-0 relative" style={{ marginTop: 48 }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-px bg-stone-300 dark:bg-stone-600" />
                        </div>
                      </div>

                      {/* 권역 노드들 */}
                      <div className="flex flex-col" style={{ marginTop: 0 }}>
                        <div className="relative" style={{ paddingLeft: 0 }}>
                          {/* 세로 연결선 */}
                          <div className="absolute left-0 top-6 bottom-6 w-px bg-stone-300 dark:bg-stone-600" />
                          <div className="space-y-1 pl-0">
                            {regionGroups.map(([region, regionStores]) => (
                              <MindMapRegionNode
                                key={region}
                                region={region}
                                stores={regionStores}
                                entryMap={entryMap}
                                onClickStore={s => setEditingEntry({ store: s, entry: entryMap.get(s.id) ?? null })}
                                onClickRegion={handleRegionClick}
                                isHighlighted={highlightRegion === region}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 목록 탭 ──────────────────── */}
                {activeTab === 'list' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 검색 */}
                    <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shrink-0">
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          value={search} onChange={e => setSearch(e.target.value)}
                          placeholder="매장명, 지역, 대표자명으로 검색..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-sm focus:outline-none focus:border-stone-400"
                        />
                        {search && (
                          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      {search && (
                        <p className="text-[10px] text-stone-400 mt-1">
                          {filteredGroups.reduce((s, [, l]) => s + l.length, 0)}개 매장 검색됨
                        </p>
                      )}
                    </div>

                    {/* 지역별 그룹 */}
                    <div ref={listRef} className="flex-1 overflow-y-auto">
                      {filteredGroups.length === 0 && (
                        <div className="flex items-center justify-center h-32 text-stone-400 text-sm">
                          검색 결과가 없습니다.
                        </div>
                      )}
                      {filteredGroups.map(([region, regionStores]) => {
                        const isOpen = expandedRegions.has(region) ||
                          search.trim().length > 0 ||
                          highlightRegion === region;
                        const regionDone = regionStores.filter(s => entryMap.get(s.id)?.isDone).length;

                        return (
                          <div
                            key={region}
                            ref={el => { if (el) regionRefs.current.set(region, el); }}
                          >
                            {/* 지역 헤더 */}
                            <button
                              onClick={() => {
                                setExpandedRegions(prev => {
                                  const next = new Set(prev);
                                  if (next.has(region)) next.delete(region); else next.add(region);
                                  return next;
                                });
                                setHighlightRegion(null);
                              }}
                              className={`w-full flex items-center gap-2 px-4 py-2 border-b border-stone-100 dark:border-stone-800 text-left transition-colors ${
                                highlightRegion === region
                                  ? 'bg-amber-50 dark:bg-amber-900/20'
                                  : 'bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800'
                              }`}
                            >
                              {isOpen ? <ChevronDown size={13} className="text-stone-400 shrink-0" /> : <ChevronRight size={13} className="text-stone-400 shrink-0" />}
                              <span className="text-xs font-black text-stone-700 dark:text-stone-300">{region}</span>
                              <span className="text-[10px] text-stone-400">
                                {regionDone}/{regionStores.length} 완료
                              </span>
                              <div className="flex-1" />
                              {/* 지역 진행률 바 */}
                              <div className="w-16 h-1 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400 transition-all"
                                  style={{ width: `${regionStores.length > 0 ? Math.round(regionDone / regionStores.length * 100) : 0}%` }}
                                />
                              </div>
                            </button>

                            {/* 매장 행 */}
                            {isOpen && regionStores.map(store => {
                              const entry = entryMap.get(store.id);
                              return (
                                <div
                                  key={store.id}
                                  className="flex items-center gap-2 px-6 py-2 border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30 group"
                                >
                                  {/* 완료 상태 도트 */}
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                                    entry?.isDone ? 'bg-emerald-500' :
                                    entry ? 'bg-amber-400' :
                                    'bg-stone-200 dark:bg-stone-700'
                                  }`} />

                                  {/* 매장명 */}
                                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex-1 min-w-0 truncate">
                                    {store.name}
                                  </span>

                                  {/* 입력된 값 미리보기 */}
                                  {entry && !entry.isDone && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">입력중</span>
                                  )}
                                  {entry?.isDone && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                                      <Check size={10} /> {entry.completedAt?.slice(0, 10) ?? ''}
                                    </span>
                                  )}
                                  {entry?.updatedBy && (
                                    <span className="text-[10px] text-stone-400 shrink-0 hidden group-hover:inline">{entry.updatedBy}</span>
                                  )}

                                  {/* 입력/수정 버튼 */}
                                  <button
                                    onClick={() => setEditingEntry({ store, entry: entry ?? null })}
                                    className="text-[10px] font-bold shrink-0 px-2 py-0.5 border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-900 dark:hover:bg-stone-100 hover:text-white dark:hover:text-stone-900 hover:border-stone-900 transition-colors rounded-sm"
                                  >
                                    {entry ? '수정' : '입력'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── 폼 에디터 모달 ──────────────────── */}
      {formEditorOpen && (
        <FormEditorModal
          form={editingForm}
          allForms={forms}
          onSave={handleSaveForm}
          onClose={() => { setFormEditorOpen(false); setEditingForm(null); }}
          currentUser={currentUser}
        />
      )}

      {/* ── 매장 입력 모달 ──────────────────── */}
      {editingEntry && selectedForm && (
        <EntryModal
          store={editingEntry.store}
          form={selectedForm}
          entry={editingEntry.entry}
          onSave={handleSaveEntry}
          onClose={() => setEditingEntry(null)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
