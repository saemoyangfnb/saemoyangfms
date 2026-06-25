import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, deleteDoc,
  doc, setDoc, query, where,
} from 'firebase/firestore';
import { Store, User, StoreForm, StoreFormField, StoreFormEntry } from '../types';
import { fetchAllStores, mapFcdaumStore } from '../fcdaum';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, X, Search, ChevronDown, ChevronRight, Edit2, Trash2,
  Check, GitBranch, LayoutList, ClipboardList, Copy,
  Printer, Archive, RotateCcw, History, Clock, CalendarDays,
} from 'lucide-react';

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const nowTs = () => new Date().toISOString();

function scrub<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  ) as T;
}

// ── 폼 에디터 모달 ────────────────────────────────────────
function FormEditorModal({ form, activeForms, onSave, onClose, currentUser }: {
  form: StoreForm | null;
  activeForms: StoreForm[];
  onSave: (f: StoreForm) => Promise<void>;
  onClose: () => void;
  currentUser: User;
}) {
  const [title, setTitle] = useState(form?.title ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [fields, setFields] = useState<StoreFormField[]>(form?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [loadSrc, setLoadSrc] = useState('');
  const toast = useToast();

  const addField = () => setFields(p => [...p, { id: genId('fld'), label: '', type: 'text' }]);
  const removeField = (id: string) => setFields(p => p.filter(f => f.id !== id));
  const updateField = (id: string, patch: Partial<StoreFormField>) =>
    setFields(p => p.map(f => f.id === id ? { ...f, ...patch } : f));

  const loadFromForm = (srcId: string) => {
    const src = activeForms.find(f => f.id === srcId);
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
      const now = nowTs();
      await onSave(scrub({
        id: form?.id ?? genId('form'),
        title: title.trim(),
        description: description.trim() || undefined,
        fields,
        createdAt: form?.createdAt ?? now,
        createdBy: form?.createdBy ?? currentUser.name,
        updatedAt: now,
        updatedBy: currentUser.name,
        isArchived: form?.isArchived ?? false,
      }));
      onClose();
    } catch (err) {
      console.error('Form save error:', err);
      toast.error('저장 실패: 권한을 확인하거나 다시 시도하세요.');
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
          {form?.updatedBy && (
            <span className="text-[10px] text-stone-400">최종: {form.updatedBy} · {form.updatedAt?.slice(0, 10)}</span>
          )}
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

          {activeForms.filter(f => f.id !== form?.id).length > 0 && (
            <div className="bg-stone-50 dark:bg-stone-800 rounded-sm p-2 border border-stone-200 dark:border-stone-700">
              <div className="flex items-center gap-2 mb-1.5">
                <Copy size={12} className="text-stone-400 shrink-0" />
                <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">기존 폼에서 항목 불러오기</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={loadSrc} onChange={e => setLoadSrc(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 rounded-sm focus:outline-none"
                >
                  <option value="">폼 선택...</option>
                  {activeForms.filter(f => f.id !== form?.id).map(f => (
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
  const toast = useToast();

  const setValue = (fieldId: string, value: string | boolean) =>
    setData(prev => ({ ...prev, [fieldId]: value }));

  const handleSave = async () => {
    setSaving(true);
    const now = nowTs();
    try {
      const newEntry: StoreFormEntry = {
        id: entry?.id ?? `${form.id}_${store.id}`,
        formId: form.id,
        storeId: store.id,
        storeName: store.name,
        storeRegion: store.region ?? '',
        data,
        isDone,
        updatedAt: now,
        updatedBy: currentUser.name,
      };
      if (isDone) newEntry.completedAt = entry?.completedAt ?? now;
      await onSave(scrub(newEntry));
      onClose();
    } catch (err) {
      console.error('Entry save error:', err);
      toast.error('저장 실패: 다시 시도하세요.');
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

// ── 매장 이력 모달 ─────────────────────────────────────────
function StoreHistoryModal({ store, allForms, onClose }: {
  store: Store;
  allForms: StoreForm[];
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<StoreFormEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(salesDb, 'store_form_entries'), where('storeId', '==', store.id)))
      .then(snap => {
        setEntries(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreFormEntry))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [store.id]);

  const formMap = useMemo(() => {
    const m = new Map<string, StoreForm>();
    allForms.forEach(f => m.set(f.id, f));
    return m;
  }, [allForms]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 w-full max-w-lg rounded-sm border-[3px] border-double border-stone-800 dark:border-stone-400 flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <History size={15} className="text-stone-500 dark:text-stone-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{store.name} — 폼 이력</p>
            <p className="text-[10px] text-stone-400">{store.region}</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-stone-400 text-sm">로딩 중...</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-stone-400">
              <History size={24} className="mb-2 opacity-30" />
              <p className="text-sm">이력이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {entries.map(entry => {
                const form = formMap.get(entry.formId);
                return (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.isDone ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex-1 min-w-0 truncate">
                        {form?.title ?? `폼 ID: ${entry.formId}`}
                      </span>
                      {entry.isDone ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                          <Check size={10} /> 완료
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">입력중</span>
                      )}
                    </div>
                    {form && Object.keys(entry.data).length > 0 && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 ml-4 mb-2">
                        {form.fields.map(field => {
                          const val = entry.data[field.id];
                          if (val === undefined || val === '' || val === false) return null;
                          return (
                            <div key={field.id} className="flex items-baseline gap-1.5">
                              <span className="text-[10px] text-stone-400 shrink-0">{field.label}</span>
                              <span className="text-[11px] text-stone-700 dark:text-stone-300 font-medium truncate">
                                {field.type === 'checkbox' ? '✓' : String(val)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 ml-4">
                      <Clock size={10} className="text-stone-400 shrink-0" />
                      <span className="text-[10px] text-stone-400">
                        {entry.updatedAt.slice(0, 16).replace('T', ' ')}
                        {entry.updatedBy ? ` · ${entry.updatedBy}` : ''}
                      </span>
                      {entry.completedAt && (
                        <span className="text-[10px] text-emerald-500">
                          완료일 {entry.completedAt.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 인쇄 뷰 ───────────────────────────────────────────────
function PrintView({ form, regionGroups, entryMap, onClose }: {
  form: StoreForm;
  regionGroups: [string, Store[]][];
  entryMap: Map<string, StoreFormEntry>;
  onClose: () => void;
}) {
  const total = regionGroups.reduce((s, [, list]) => s + list.length, 0);
  const done = regionGroups.reduce((s, [, list]) => s + list.filter(st => entryMap.get(st.id)?.isDone).length, 0);
  const today = new Date().toLocaleDateString('ko-KR');

  return (
    <div id="form-print-area" className="fixed inset-0 z-[100] bg-white flex flex-col print:relative print:inset-auto print:h-auto">
      <div className="print:hidden flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-stone-50 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900">
          <X size={14} /> 닫기
        </button>
        <span className="text-xs text-stone-400 flex-1">{form.title} — 인쇄 미리보기</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-stone-900 text-white rounded-sm hover:bg-stone-700"
        >
          <Printer size={13} /> 인쇄
        </button>
      </div>

      <div className="flex-1 overflow-auto print:overflow-visible print:h-auto p-6 text-stone-900" style={{ fontFamily: 'serif' }}>
        <div className="mb-4 pb-3 border-b-2 border-stone-800">
          <h1 className="text-lg font-black">{form.title}</h1>
          {form.description && <p className="text-sm text-stone-600 mt-0.5">{form.description}</p>}
          <div className="flex gap-6 mt-1 text-[11px] text-stone-500">
            <span>인쇄일: {today}</span>
            <span>완료: {done}/{total} ({total > 0 ? Math.round(done / total * 100) : 0}%)</span>
            <span>항목: {form.fields.map(f => f.label).join(' · ')}</span>
          </div>
        </div>

        {regionGroups.map(([region, storeList]) => {
          const regionDone = storeList.filter(s => entryMap.get(s.id)?.isDone).length;
          return (
            <div key={region} className="mb-6">
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-sm font-black">{region}</h2>
                <span className="text-xs text-stone-500">{regionDone}/{storeList.length} 완료</span>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100">
                    <th className="border border-stone-300 px-2 py-1 text-left font-bold w-36">매장명</th>
                    {form.fields.map(f => (
                      <th key={f.id} className="border border-stone-300 px-2 py-1 text-left font-bold">{f.label}</th>
                    ))}
                    <th className="border border-stone-300 px-2 py-1 text-center font-bold w-12">완료</th>
                    <th className="border border-stone-300 px-2 py-1 text-center font-bold w-20">완료일</th>
                    <th className="border border-stone-300 px-2 py-1 text-center font-bold w-16">담당자</th>
                  </tr>
                </thead>
                <tbody>
                  {storeList.map(store => {
                    const entry = entryMap.get(store.id);
                    return (
                      <tr key={store.id} className={entry?.isDone ? 'bg-emerald-50' : ''}>
                        <td className="border border-stone-200 px-2 py-1 font-medium">{store.name}</td>
                        {form.fields.map(f => (
                          <td key={f.id} className="border border-stone-200 px-2 py-1">
                            {entry ? (f.type === 'checkbox' ? (entry.data[f.id] ? '✓' : '') : String(entry.data[f.id] ?? '')) : ''}
                          </td>
                        ))}
                        <td className="border border-stone-200 px-2 py-1 text-center">{entry?.isDone ? '✓' : ''}</td>
                        <td className="border border-stone-200 px-2 py-1 text-center text-[10px]">{entry?.completedAt?.slice(0, 10) ?? ''}</td>
                        <td className="border border-stone-200 px-2 py-1 text-center text-[10px]">{entry?.updatedBy ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
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
    <div className="flex items-start">
      <div className="w-8 shrink-0 flex flex-col items-center">
        <div className="w-px flex-1 bg-stone-300 dark:bg-stone-600 mt-3" />
      </div>

      <div className="flex-1 min-w-0 mb-2">
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
            {done === stores.length && stores.length > 0 && <Check size={10} className="text-emerald-500" />}
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {expanded && (
          <div className="ml-4 space-y-0.5">
            {stores.map((store, idx) => {
              const entry = entryMap.get(store.id);
              const isLast = idx === stores.length - 1;
              return (
                <div key={store.id} className="flex items-center">
                  <div className="w-8 shrink-0 relative self-stretch">
                    <div className={`absolute left-0 top-0 w-px bg-stone-200 dark:bg-stone-700 ${isLast ? 'h-1/2' : 'bottom-0'}`} />
                    <div className="absolute left-0 top-1/2 w-4 h-px bg-stone-200 dark:bg-stone-700 -translate-y-px" />
                  </div>
                  <button
                    onClick={() => onClickStore(store)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left max-w-[160px]"
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

// ── 캘린더 탭 ─────────────────────────────────────────────
type CalendarDayEntry = { store: Store; entry: StoreFormEntry; fieldLabel: string };

function CalendarTab({ form, entries, stores, onClickStore }: {
  form: StoreForm;
  entries: StoreFormEntry[];
  stores: Store[];
  onClickStore: (s: Store, entry: StoreFormEntry | null) => void;
}) {
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [tooltip, setTooltip] = useState<{ items: CalendarDayEntry[]; x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = (items: CalendarDayEntry[], e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 210);
    const y = rect.bottom + 4;
    setTooltip({ items, x, y });
  };
  const scheduleHide = () => { hideTimer.current = setTimeout(() => setTooltip(null), 150); };
  const cancelHide = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };

  const dateFields = useMemo(
    () => form.fields.filter(f => f.type === 'date'),
    [form.fields]
  );

  const storeMap = useMemo(() => {
    const m = new Map<string, Store>();
    stores.forEach(s => m.set(s.id, s));
    return m;
  }, [stores]);

  const entryMap = useMemo(() => {
    const m = new Map<string, StoreFormEntry>();
    entries.forEach(e => m.set(e.storeId, e));
    return m;
  }, [entries]);

  // date → entries for that date
  const dateMap = useMemo(() => {
    const m = new Map<string, CalendarDayEntry[]>();
    if (dateFields.length === 0) return m;
    // storeId+fieldId 조합으로 최신 entry 하나만 사용 (중복 방지)
    const latest = new Map<string, StoreFormEntry>();
    entries.forEach(entry => {
      const key = entry.storeId;
      const prev = latest.get(key);
      if (!prev || entry.updatedAt > prev.updatedAt) latest.set(key, entry);
    });
    latest.forEach(entry => {
      const store = storeMap.get(entry.storeId);
      if (!store) return;
      dateFields.forEach(field => {
        const val = entry.data[field.id];
        if (typeof val !== 'string' || !val) return;
        if (!m.has(val)) m.set(val, []);
        m.get(val)!.push({ store, entry, fieldLabel: field.label });
      });
    });
    return m;
  }, [entries, dateFields, storeMap]);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const toKey = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  if (dateFields.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
        <CalendarDays size={32} className="mb-2 opacity-30" />
        <p className="text-sm font-bold">날짜 형식 항목이 없습니다.</p>
        <p className="text-xs mt-1">폼에 <span className="font-bold text-stone-600 dark:text-stone-300">날짜</span> 형식 항목을 추가하면 캘린더에서 확인할 수 있습니다.</p>
      </div>
    );
  }

  // hover 툴팁 패널
  const TooltipPanel = tooltip ? (
    <div
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 9999, minWidth: 180, maxWidth: 240 }}
      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="px-3 py-1.5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider">전체 {tooltip.items.length}건</span>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {tooltip.items.map((item, i) => (
          <button
            key={`${item.store.id}-${i}`}
            onClick={() => { onClickStore(item.store, item.entry); setTooltip(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800 border-b border-stone-50 dark:border-stone-800 last:border-0 transition-colors"
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${item.entry.isDone ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span className="text-[11px] text-stone-700 dark:text-stone-300 flex-1 min-w-0 truncate">{item.store.name}</span>
            <span className={`text-[9px] font-bold shrink-0 ${item.entry.isDone ? 'text-emerald-500' : 'text-amber-500'}`}>
              {item.entry.isDone ? '완료' : '진행'}
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const totalOnMonth = [...dateMap.entries()]
    .filter(([key]) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .reduce((s, [, list]) => s + list.length, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {TooltipPanel}
      {/* 캘린더 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
        <button
          onClick={() => setCalMonth(new Date(year, month - 1, 1))}
          className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-sm"
        >
          <ChevronRight size={15} className="rotate-180" />
        </button>
        <span className="text-sm font-black text-stone-800 dark:text-stone-200 flex-1 text-center">
          {year}년 {month + 1}월
        </span>
        <button
          onClick={() => setCalMonth(new Date(year, month + 1, 1))}
          className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-sm"
        >
          <ChevronRight size={15} />
        </button>
        <span className="text-[11px] text-stone-400 ml-2">{totalOnMonth}건</span>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-stone-100 dark:border-stone-800 shrink-0 bg-stone-50 dark:bg-stone-800/50">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className={`py-1 text-center text-[11px] font-bold ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: 'minmax(88px, 1fr)' }}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="border-r border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/20" />;
            }
            const key = toKey(day);
            const dayEntries = dateMap.get(key) ?? [];
            const isToday = key === todayKey;
            const dow = (firstDow + day - 1) % 7;

            return (
              <div
                key={day}
                className={`border-r border-b border-stone-100 dark:border-stone-800 p-1 flex flex-col min-h-[80px] ${
                  isToday ? 'bg-amber-50 dark:bg-amber-900/10' : ''
                }`}
              >
                {/* 날짜 숫자 */}
                <div className={`text-[11px] font-bold self-end mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-amber-500 text-white'
                    : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-stone-500 dark:text-stone-400'
                }`}>
                  {day}
                </div>

                {/* 매장 목록 */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {dayEntries.slice(0, 3).map((item, i) => (
                    <button
                      key={`${item.store.id}-${item.fieldLabel}-${i}`}
                      onClick={() => onClickStore(item.store, item.entry)}
                      className={`text-left text-[10px] px-1 py-0.5 rounded-sm truncate leading-snug ${
                        item.entry.isDone
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}
                      title={`${item.fieldLabel}: ${item.store.name}`}
                    >
                      {dateFields.length > 1 && <span className="opacity-60">{item.fieldLabel} </span>}
                      {item.store.name}
                    </button>
                  ))}
                  {dayEntries.length > 3 && (
                    <button
                      onMouseEnter={e => showTooltip(dayEntries, e)}
                      onMouseLeave={scheduleHide}
                      className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold px-1 text-left hover:underline leading-snug"
                    >
                      +{dayEntries.length - 3}개 더
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
interface Props {
  currentUser: User;
}

export function StoreMindmapView({ currentUser }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [allForms, setAllForms] = useState<StoreForm[]>([]);
  const [selectedForm, setSelectedForm] = useState<StoreForm | null>(null);
  const [entries, setEntries] = useState<StoreFormEntry[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [formListTab, setFormListTab] = useState<'active' | 'archived'>('active');
  const [activeTab, setActiveTab] = useState<'mindmap' | 'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [highlightRegion, setHighlightRegion] = useState<string | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const [editingEntry, setEditingEntry] = useState<{ store: Store; entry: StoreFormEntry | null } | null>(null);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<StoreForm | null>(null);
  const [historyStore, setHistoryStore] = useState<Store | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // ── 데이터 로드 ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      getDocs(collection(salesDb, 'store_forms')),
      fetchAllStores(),
    ]).then(([formSnap, fcdaumStores]) => {
      const fs = formSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as StoreForm))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setAllForms(fs);
      setStores(
        fcdaumStores
          .map(s => ({ ...mapFcdaumStore(s), importedAt: '' } as Store))
          .filter(s => s.status !== '폐점')
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      );
      const first = fs.find(f => !f.isArchived);
      if (first) setSelectedForm(first);
      setLoadingForms(false);
    }).catch(() => setLoadingForms(false));
  }, []);

  useEffect(() => {
    if (!selectedForm) { setEntries([]); return; }
    setLoadingEntries(true);
    getDocs(query(collection(salesDb, 'store_form_entries'), where('formId', '==', selectedForm.id)))
      .then(snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreFormEntry))))
      .catch(() => {})
      .finally(() => setLoadingEntries(false));
  }, [selectedForm?.id]);

  // ── 파생 데이터 ──────────────────────────────────────────
  const activeForms = useMemo(() => allForms.filter(f => !f.isArchived), [allForms]);
  const archivedForms = useMemo(() => allForms.filter(f => f.isArchived), [allForms]);

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
          (s.region ?? '').toLowerCase().includes(q) ||
          (s.ceoName ?? '').toLowerCase().includes(q) ||
          (s.operatorName ?? '').toLowerCase().includes(q) ||
          (s.storeCode ?? '').toLowerCase().includes(q)
        ),
      ] as [string, Store[]])
      .filter(([, list]) => list.length > 0);
  }, [regionGroups, search]);

  const totalStats = useMemo(() => ({
    total: stores.length,
    done: entries.filter(e => e.isDone).length,
  }), [stores, entries]);

  // ── 폼 CRUD ────────────────────────────────────────────
  const handleSaveForm = useCallback(async (f: StoreForm) => {
    await setDoc(doc(salesDb, 'store_forms', f.id), scrub(f));
    setAllForms(prev => {
      const exists = prev.find(x => x.id === f.id);
      return exists ? prev.map(x => x.id === f.id ? f : x) : [f, ...prev];
    });
    if (!selectedForm) setSelectedForm(f);
    toast.success('폼이 저장됐습니다.');
  }, [selectedForm, toast]);

  const handleDeleteForm = useCallback(async (f: StoreForm) => {
    const ok = await confirm({
      title: '폼 삭제',
      message: `"${f.title}" 폼과 모든 응답 데이터가 삭제됩니다.`,
      confirmLabel: '삭제', variant: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'store_forms', f.id));
    setAllForms(prev => prev.filter(x => x.id !== f.id));
    if (selectedForm?.id === f.id) setSelectedForm(allForms.find(x => x.id !== f.id && !x.isArchived) ?? null);
    toast.success('폼이 삭제됐습니다.');
  }, [confirm, allForms, selectedForm, toast]);

  const handleArchiveForm = useCallback(async (f: StoreForm, archive: boolean) => {
    const updated = { ...f, isArchived: archive };
    await setDoc(doc(salesDb, 'store_forms', f.id), scrub(updated));
    setAllForms(prev => prev.map(x => x.id === f.id ? updated : x));
    if (archive && selectedForm?.id === f.id) {
      setSelectedForm(allForms.find(x => x.id !== f.id && !x.isArchived) ?? null);
    }
    toast.success(archive ? '보관함으로 이동됐습니다.' : '복원됐습니다.');
  }, [allForms, selectedForm, toast]);

  // ── 항목 저장 ──────────────────────────────────────────
  const handleSaveEntry = useCallback(async (entry: StoreFormEntry) => {
    await setDoc(doc(salesDb, 'store_form_entries', entry.id), scrub(entry));
    setEntries(prev => {
      const exists = prev.find(e => e.id === entry.id);
      return exists ? prev.map(e => e.id === entry.id ? entry : e) : [...prev, entry];
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
      regionRefs.current.get(region)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // ── 렌더 ──────────────────────────────────────────────
  if (loadingForms) {
    return <div className="flex items-center justify-center h-full text-stone-400 text-sm">로딩 중...</div>;
  }

  return (
    <div className="flex h-full bg-[#FDFBF7] dark:bg-stone-950">
      {/* ── 왼쪽: 폼 목록 ───────────────────────── */}
      <aside className="w-56 shrink-0 border-r-[3px] border-double border-stone-300 dark:border-stone-700 flex flex-col bg-white dark:bg-stone-900">
        <div className="flex items-center border-b border-stone-200 dark:border-stone-800 shrink-0">
          <button
            onClick={() => setFormListTab('active')}
            className={`flex-1 py-2 text-[11px] font-bold transition-colors ${
              formListTab === 'active'
                ? 'text-stone-900 dark:text-stone-100 border-b-2 border-stone-800 dark:border-stone-300'
                : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            활성 {activeForms.length > 0 && `(${activeForms.length})`}
          </button>
          <button
            onClick={() => setFormListTab('archived')}
            className={`flex-1 py-2 text-[11px] font-bold transition-colors ${
              formListTab === 'archived'
                ? 'text-stone-900 dark:text-stone-100 border-b-2 border-stone-800 dark:border-stone-300'
                : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            보관함 {archivedForms.length > 0 && `(${archivedForms.length})`}
          </button>
          {formListTab === 'active' && (
            <button
              onClick={() => { setEditingForm(null); setFormEditorOpen(true); }}
              className="px-2 py-2 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 shrink-0"
              title="새 폼 만들기"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {formListTab === 'active' && activeForms.length === 0 && (
            <div className="px-3 py-6 text-center">
              <ClipboardList size={24} className="text-stone-300 dark:text-stone-600 mx-auto mb-2" />
              <p className="text-[11px] text-stone-400">폼이 없습니다.</p>
              <button
                onClick={() => { setEditingForm(null); setFormEditorOpen(true); }}
                className="mt-2 text-[11px] font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
              >
                + 첫 폼 만들기
              </button>
            </div>
          )}

          {(formListTab === 'active' ? activeForms : archivedForms).map(f => {
            const isSelected = selectedForm?.id === f.id;
            return (
              <div
                key={f.id}
                className={`relative group border-b border-stone-100 dark:border-stone-800 ${
                  isSelected ? 'bg-stone-100 dark:bg-stone-800' : ''
                }`}
              >
                <button
                  onClick={() => { setSelectedForm(f); setSearch(''); }}
                  className="w-full text-left px-3 py-2.5 pr-14"
                >
                  <p className={`text-xs font-bold truncate ${
                    isSelected ? 'text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400'
                  }`}>
                    {f.title}
                  </p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {f.fields.length}개 항목 · {f.createdAt.slice(0, 10)}
                  </p>
                  {f.updatedBy && (
                    <p className="text-[10px] text-stone-300 dark:text-stone-600 mt-0.5">
                      {f.updatedBy} 수정
                    </p>
                  )}
                  {isSelected && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {totalStats.done}/{totalStats.total} 완료
                    </p>
                  )}
                </button>

                <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5">
                  {formListTab === 'active' ? (
                    <>
                      <button
                        onClick={() => { setEditingForm(f); setFormEditorOpen(true); }}
                        className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                        title="수정"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={() => handleArchiveForm(f, true)}
                        className="p-1 text-stone-400 hover:text-amber-600"
                        title="보관함으로"
                      >
                        <Archive size={11} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteForm(f)}
                          className="p-1 text-stone-400 hover:text-red-500"
                          title="삭제 (관리자)"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleArchiveForm(f, false)}
                      className="p-1 text-stone-400 hover:text-emerald-600"
                      title="복원"
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
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
            <div className="flex items-center gap-2 px-4 py-2.5 border-b-[3px] border-double border-stone-300 dark:border-stone-700 shrink-0 bg-white dark:bg-stone-900">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{selectedForm.title}</h2>
                {selectedForm.description && (
                  <p className="text-[10px] text-stone-400">{selectedForm.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${totalStats.total > 0 ? Math.round(totalStats.done / totalStats.total * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                    {totalStats.done}/{totalStats.total}
                  </span>
                </div>
                <button
                  onClick={() => setPrintOpen(true)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                  title="인쇄"
                >
                  <Printer size={15} />
                </button>
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
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className={`px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      activeTab === 'calendar'
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <CalendarDays size={11} /> 캘린더
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
                    <div className="flex items-start min-w-max">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-sm font-black text-sm">
                          {selectedForm.title}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1">
                          {totalStats.done}/{totalStats.total} 완료 ({totalStats.total > 0 ? Math.round(totalStats.done / totalStats.total * 100) : 0}%)
                        </div>
                        <div className="w-px flex-1 bg-stone-300 dark:bg-stone-600 mt-2" style={{ minHeight: 32 }} />
                      </div>
                      <div className="w-8 self-stretch flex flex-col justify-center shrink-0 relative" style={{ marginTop: 48 }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-px bg-stone-300 dark:bg-stone-600" />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <div className="relative">
                          <div className="absolute left-0 top-6 bottom-6 w-px bg-stone-300 dark:bg-stone-600" />
                          <div className="space-y-1">
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
                    <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shrink-0">
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          value={search} onChange={e => setSearch(e.target.value)}
                          placeholder="매장명, 지역, 대표자명으로 검색..."
                          className="w-full pl-8 pr-8 py-1.5 text-xs border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-sm focus:outline-none focus:border-stone-400"
                        />
                        {search && (
                          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      {search && (
                        <p className="text-[10px] text-stone-400 mt-1">
                          {filteredGroups.reduce((s, [, l]) => s + l.length, 0)}개 매장
                        </p>
                      )}
                    </div>

                    <div ref={listRef} className="flex-1 overflow-y-auto">
                      {filteredGroups.length === 0 && (
                        <div className="flex items-center justify-center h-32 text-stone-400 text-sm">검색 결과가 없습니다.</div>
                      )}
                      {filteredGroups.map(([region, regionStores]) => {
                        const isOpen = expandedRegions.has(region) || search.trim().length > 0 || highlightRegion === region;
                        const regionDone = regionStores.filter(s => entryMap.get(s.id)?.isDone).length;

                        return (
                          <div
                            key={region}
                            ref={el => { if (el) regionRefs.current.set(region, el); }}
                          >
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
                              {isOpen
                                ? <ChevronDown size={13} className="text-stone-400 shrink-0" />
                                : <ChevronRight size={13} className="text-stone-400 shrink-0" />}
                              <span className="text-xs font-black text-stone-700 dark:text-stone-300">{region}</span>
                              <span className="text-[10px] text-stone-400">{regionDone}/{regionStores.length} 완료</span>
                              <div className="flex-1" />
                              <div className="w-16 h-1 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400 transition-all"
                                  style={{ width: `${regionStores.length > 0 ? Math.round(regionDone / regionStores.length * 100) : 0}%` }}
                                />
                              </div>
                            </button>

                            {isOpen && regionStores.map(store => {
                              const entry = entryMap.get(store.id);
                              return (
                                <div
                                  key={store.id}
                                  className="flex items-center gap-2 px-6 py-1.5 border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30 group"
                                >
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                                    entry?.isDone ? 'bg-emerald-500' : entry ? 'bg-amber-400' : 'bg-stone-200 dark:bg-stone-700'
                                  }`} />
                                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex-1 min-w-0 truncate">
                                    {store.name}
                                  </span>
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
                                  <button
                                    onClick={() => setHistoryStore(store)}
                                    className="shrink-0 p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="폼 이력 보기"
                                  >
                                    <History size={13} />
                                  </button>
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

                {/* ── 캘린더 탭 ────────────────── */}
                {activeTab === 'calendar' && (
                  <CalendarTab
                    form={selectedForm}
                    entries={entries}
                    stores={stores}
                    onClickStore={(store, entry) => setEditingEntry({ store, entry })}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── 모달들 ──────────────────────────────── */}
      {formEditorOpen && (
        <FormEditorModal
          form={editingForm}
          activeForms={activeForms}
          onSave={handleSaveForm}
          onClose={() => { setFormEditorOpen(false); setEditingForm(null); }}
          currentUser={currentUser}
        />
      )}

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

      {historyStore && (
        <StoreHistoryModal
          store={historyStore}
          allForms={allForms}
          onClose={() => setHistoryStore(null)}
        />
      )}

      {printOpen && selectedForm && (
        <PrintView
          form={selectedForm}
          regionGroups={regionGroups}
          entryMap={entryMap}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}
