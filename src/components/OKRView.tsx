import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { OKRQuarter, OKRObjective, OKRKeyResult, User } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, X, Edit2, Trash2, Check, ChevronDown, ChevronRight, Target } from 'lucide-react';

// ── 유틸 ──────────────────────────────────────────────────
const genId = () => `okr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
const ts = () => new Date().toISOString();

const getCurrentQuarter = () => {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return { year: now.getFullYear(), quarter: q, id: `${now.getFullYear()}-Q${q}` };
};

const krProgress = (kr: OKRKeyResult) =>
  kr.targetValue === 0 ? 0 : Math.min(Math.round((kr.currentValue / kr.targetValue) * 100), 100);

const objProgress = (obj: OKRObjective) => {
  if (!obj.keyResults.length) return 0;
  return Math.round(obj.keyResults.reduce((s, kr) => s + krProgress(kr), 0) / obj.keyResults.length);
};

const quarterProgress = (q: OKRQuarter) => {
  if (!q.objectives.length) return 0;
  return Math.round(q.objectives.reduce((s, o) => s + objProgress(o), 0) / q.objectives.length);
};

const progressColor = (pct: number) =>
  pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';

const progressTextColor = (pct: number) =>
  pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400';

// ── KR 수정 인라인 ─────────────────────────────────────────
function KRRow({
  kr, onUpdate, onDelete, isAdmin,
}: {
  kr: OKRKeyResult;
  onUpdate: (updated: OKRKeyResult) => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(kr.currentValue));
  const pct = krProgress(kr);

  const commit = () => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      onUpdate({ ...kr, currentValue: num });
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-sm group">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-700 dark:text-stone-300 truncate">{kr.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-[11px] font-bold tabular-nums shrink-0 ${progressTextColor(pct)}`}>{pct}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number" value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              className="w-16 px-1.5 py-1 text-xs border border-stone-400 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none text-right"
              autoFocus
            />
            <span className="text-[11px] text-stone-400">/ {kr.targetValue} {kr.unit}</span>
            <button onClick={commit} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-sm">
              <Check size={13} />
            </button>
            <button onClick={() => setEditing(false)} className="p-0.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-sm">
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] tabular-nums text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-sm transition-colors"
            >
              {kr.currentValue} / {kr.targetValue} {kr.unit}
            </button>
            {isAdmin && (
              <button
                onClick={onDelete}
                className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-red-500 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={11} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Objective 카드 ─────────────────────────────────────────
function ObjectiveCard({
  obj, isAdmin, onUpdate, onDelete,
}: {
  obj: OKRObjective;
  isAdmin: boolean;
  onUpdate: (updated: OKRObjective) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingKR, setAddingKR] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(obj.title);
  const [krTitle, setKRTitle] = useState('');
  const [krTarget, setKRTarget] = useState('');
  const [krUnit, setKRUnit] = useState('%');
  const pct = objProgress(obj);

  const handleAddKR = () => {
    if (!krTitle.trim() || !krTarget) return;
    const newKR: OKRKeyResult = {
      id: genId(), title: krTitle.trim(),
      currentValue: 0, targetValue: parseFloat(krTarget), unit: krUnit,
    };
    onUpdate({ ...obj, keyResults: [...obj.keyResults, newKR] });
    setKRTitle(''); setKRTarget(''); setKRUnit('%'); setAddingKR(false);
  };

  const handleUpdateKR = (updated: OKRKeyResult) =>
    onUpdate({ ...obj, keyResults: obj.keyResults.map(k => k.id === updated.id ? updated : k) });

  const handleDeleteKR = (id: string) =>
    onUpdate({ ...obj, keyResults: obj.keyResults.filter(k => k.id !== id) });

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => setExpanded(v => !v)} className="text-stone-400 hover:text-stone-600 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle && isAdmin ? (
            <div className="flex items-center gap-1">
              <input
                value={titleVal} onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onUpdate({ ...obj, title: titleVal }); setEditingTitle(false); }
                  if (e.key === 'Escape') { setTitleVal(obj.title); setEditingTitle(false); }
                }}
                className="flex-1 text-sm font-black px-2 py-0.5 border border-stone-400 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
                autoFocus
              />
              <button onClick={() => { onUpdate({ ...obj, title: titleVal }); setEditingTitle(false); }} className="p-0.5 text-emerald-600"><Check size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p
                className="text-sm font-black text-stone-900 dark:text-white cursor-pointer"
                onDoubleClick={() => isAdmin && setEditingTitle(true)}
              >
                {obj.title}
              </p>
              {obj.ownerName && <span className="text-[10px] text-stone-400">{obj.ownerName}</span>}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${progressTextColor(pct)}`}>{pct}%</span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setEditingTitle(true)} className="p-1 text-stone-400 hover:text-blue-600 rounded-sm"><Edit2 size={12} /></button>
            <button onClick={onDelete} className="p-1 text-stone-400 hover:text-red-600 rounded-sm"><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-stone-100 dark:border-stone-800">
          {obj.keyResults.map(kr => (
            <KRRow key={kr.id} kr={kr} isAdmin={isAdmin}
              onUpdate={handleUpdateKR}
              onDelete={() => handleDeleteKR(kr.id)}
            />
          ))}
          {obj.keyResults.length === 0 && !addingKR && (
            <p className="text-xs text-stone-400 px-3 py-2">핵심 결과(KR)가 없습니다.</p>
          )}

          {addingKR && (
            <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-t border-stone-100 dark:border-stone-800">
              <input
                value={krTitle} onChange={e => setKRTitle(e.target.value)}
                placeholder="핵심 결과 (KR)"
                className="flex-1 min-w-32 px-2 py-1.5 text-xs border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
                autoFocus
              />
              <input
                type="number" value={krTarget} onChange={e => setKRTarget(e.target.value)}
                placeholder="목표값"
                className="w-20 px-2 py-1.5 text-xs border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none text-right"
              />
              <select value={krUnit} onChange={e => setKRUnit(e.target.value)}
                className="w-16 px-1 py-1.5 text-xs border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
              >
                {['%', '개', '만원', '점', '건', '명', '회'].map(u => <option key={u}>{u}</option>)}
              </select>
              <button onClick={handleAddKR} className="px-2 py-1.5 text-xs font-bold bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-sm hover:bg-stone-600 transition-colors">추가</button>
              <button onClick={() => setAddingKR(false)} className="px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600 rounded-sm">취소</button>
            </div>
          )}

          {isAdmin && !addingKR && (
            <button
              onClick={() => setAddingKR(true)}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <Plus size={11} /> KR 추가
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 OKRView ──────────────────────────────────────────
export function OKRView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [quarters, setQuarters] = useState<OKRQuarter[]>([]);
  const [selectedId, setSelectedId] = useState<string>(getCurrentQuarter().id);
  const [loading, setLoading] = useState(true);
  const [addingObj, setAddingObj] = useState(false);
  const [newObjTitle, setNewObjTitle] = useState('');
  const [newObjOwner, setNewObjOwner] = useState('');
  const [showNewQuarter, setShowNewQuarter] = useState(false);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [newQ, setNewQ] = useState('1');

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'okr_quarters'), orderBy('year', 'desc')));
    const list = snap.docs.map(d => ({ ...d.data() } as OKRQuarter));
    setQuarters(list.sort((a, b) => b.year - a.year || b.quarter - a.quarter));
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const selected = quarters.find(q => q.id === selectedId);

  const saveQuarter = useCallback(async (q: OKRQuarter) => {
    await updateDoc(doc(salesDb, 'okr_quarters', q.id), { ...q, updatedAt: ts() });
    setQuarters(prev => prev.map(p => p.id === q.id ? { ...q, updatedAt: ts() } : p));
  }, []);

  const handleCreateQuarter = async () => {
    const id = `${newYear}-Q${newQ}`;
    if (quarters.find(q => q.id === id)) { toast.error('이미 존재하는 분기입니다'); return; }
    const now = ts();
    const q: OKRQuarter = { id, year: parseInt(newYear), quarter: parseInt(newQ), isActive: true, objectives: [], createdAt: now, updatedAt: now };
    await setDoc(doc(salesDb, 'okr_quarters', id), q);
    toast.success(`${id} 분기 생성됨`);
    await load();
    setSelectedId(id);
    setShowNewQuarter(false);
  };

  const handleAddObjective = async () => {
    if (!newObjTitle.trim() || !selected) return;
    const newObj: OKRObjective = { id: genId(), title: newObjTitle.trim(), ownerName: newObjOwner.trim() || undefined, keyResults: [] };
    const updated = { ...selected, objectives: [...selected.objectives, newObj] };
    await saveQuarter(updated);
    setNewObjTitle(''); setNewObjOwner(''); setAddingObj(false);
    toast.success('목표 추가됨');
  };

  const handleUpdateObjective = async (updatedObj: OKRObjective) => {
    if (!selected) return;
    const updated = { ...selected, objectives: selected.objectives.map(o => o.id === updatedObj.id ? updatedObj : o) };
    await saveQuarter(updated);
  };

  const handleDeleteObjective = async (id: string) => {
    if (!selected) return;
    const ok = await confirm({ title: '목표 삭제', message: '이 목표와 모든 KR을 삭제할까요?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    const updated = { ...selected, objectives: selected.objectives.filter(o => o.id !== id) };
    await saveQuarter(updated);
  };

  const handleDeleteQuarter = async () => {
    if (!selected) return;
    const ok = await confirm({ title: '분기 삭제', message: `${selected.id} 분기와 모든 데이터를 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'okr_quarters', selected.id));
    toast.success('삭제됨');
    await load();
    setSelectedId(getCurrentQuarter().id);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  const pct = selected ? quarterProgress(selected) : 0;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white">OKR & KPI</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">분기별 목표와 핵심 결과</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewQuarter(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
          >
            <Plus size={13} /> 새 분기
          </button>
        )}
      </div>

      {/* 분기 탭 */}
      {quarters.length > 0 && (
        <div className="flex gap-1 flex-wrap border-b border-stone-200 dark:border-stone-700 mb-4">
          {quarters.map(q => (
            <button
              key={q.id}
              onClick={() => setSelectedId(q.id)}
              className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${
                selectedId === q.id
                  ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white'
                  : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
              }`}
            >
              {q.id}
            </button>
          ))}
        </div>
      )}

      {/* 분기 없음 */}
      {quarters.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Target size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
          <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">등록된 분기가 없습니다</p>
          {isAdmin && (
            <button onClick={() => setShowNewQuarter(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">
              첫 번째 분기 시작하기
            </button>
          )}
        </div>
      )}

      {/* 선택된 분기 */}
      {selected && (
        <>
          {/* 전체 진행률 */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-black text-stone-900 dark:text-white">{selected.id} 전체 진행률</span>
                <span className="text-xs text-stone-400 ml-2">{selected.objectives.length}개 목표</span>
              </div>
              <span className={`text-lg font-black tabular-nums ${progressTextColor(pct)}`}>{pct}%</span>
            </div>
            <div className="h-2.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* 목표 목록 */}
          <div className="space-y-3 mb-4">
            {selected.objectives.map(obj => (
              <ObjectiveCard
                key={obj.id} obj={obj} isAdmin={isAdmin}
                onUpdate={handleUpdateObjective}
                onDelete={() => handleDeleteObjective(obj.id)}
              />
            ))}
          </div>

          {/* 목표 추가 */}
          {isAdmin && !addingObj && (
            <button
              onClick={() => setAddingObj(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 dark:border-stone-600 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500 rounded-sm transition-colors"
            >
              <Plus size={13} /> 목표(Objective) 추가
            </button>
          )}

          {isAdmin && addingObj && (
            <div className="border-2 border-stone-300 dark:border-stone-600 rounded-sm p-4 space-y-2">
              <input
                value={newObjTitle} onChange={e => setNewObjTitle(e.target.value)}
                placeholder="목표 (Objective)"
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500"
                autoFocus
              />
              <input
                value={newObjOwner} onChange={e => setNewObjOwner(e.target.value)}
                placeholder="담당자 (선택)"
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAddingObj(false)} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 rounded-sm">취소</button>
                <button
                  onClick={handleAddObjective} disabled={!newObjTitle.trim()}
                  className="px-3 py-1.5 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors"
                >
                  추가
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="mt-6 flex justify-end">
              <button onClick={handleDeleteQuarter} className="text-xs text-stone-400 hover:text-red-500 transition-colors">
                {selected.id} 분기 삭제
              </button>
            </div>
          )}
        </>
      )}

      {/* 새 분기 모달 */}
      {showNewQuarter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-80 border border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
              <h2 className="text-sm font-black text-stone-900 dark:text-white">새 분기 시작</h2>
              <button onClick={() => setShowNewQuarter(false)} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">연도</label>
                <input type="number" value={newYear} onChange={e => setNewYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">분기</label>
                <select value={newQ} onChange={e => setNewQ(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                  {[1,2,3,4].map(q => <option key={q} value={q}>Q{q} ({(q-1)*3+1}월~{q*3}월)</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => setShowNewQuarter(false)} className="px-4 py-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
              <button onClick={handleCreateQuarter} className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">생성</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
