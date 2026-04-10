import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { salesDb } from '../../firebase';
import { BrandId } from '../../types';
import { useToast } from '../Toast';
import { X, Plus, Trash2, Eye, EyeOff, Edit2 } from 'lucide-react';

// 캘린더에 표시되는 공정 목록 (스케줄 필드에 매핑)
export const CALENDAR_PHASES: { id: string; label: string }[] = [
  { id: 'constructionStart', label: '공사 시작일' },
  { id: 'constructionEnd', label: '공사 종료일' },
  { id: 'oven', label: '화덕 설치' },
  { id: 'burner', label: '화구 설치' },
  { id: 'equipment', label: '장비 입고' },
  { id: 'guide', label: '점주 안내' },
  { id: 'preTraining', label: '사전 교육' },
  { id: 'training', label: '본사 교육' },
  { id: 'initialStock', label: '초도 입고' },
  { id: 'open', label: '오픈일' },
];

export const DEFAULT_PHASE_VISIBILITY: Record<string, boolean> = {
  constructionStart: true,
  constructionEnd: true,
  oven: true,
  burner: true,
  equipment: true,
  guide: false,
  preTraining: true,
  training: true,
  initialStock: true,
  open: true,
};

// 기본 진행 체크 항목 (progressCheck 필드 매핑)
export const BUILTIN_PROGRESS = [
  { id: 'ovenOrder', defaultLabel: '화덕' },
  { id: 'ownerGuide', defaultLabel: '점주' },
  { id: 'equipmentOrder', defaultLabel: '대소' },
  { id: 'internetOrder', defaultLabel: '넷' },
  { id: 'initialEntry', defaultLabel: '초도' },
];

export interface ProcessSettings {
  phaseVisibility: Record<string, boolean>;        // 캘린더 공정 표기 여부
  progressLabels: Record<string, string>;          // 기본 항목 이름 오버라이드
  customItems: { id: string; label: string }[];    // 커스텀 진행 항목
}

export const DEFAULT_PROCESS_SETTINGS: ProcessSettings = {
  phaseVisibility: DEFAULT_PHASE_VISIBILITY,
  progressLabels: {},
  customItems: [],
};

interface Props {
  brandId: BrandId;
  onClose: () => void;
  onSaved: (settings: ProcessSettings) => void;
}

export function ProcessMasterModal({ brandId, onClose, onSaved }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [phaseVisibility, setPhaseVisibility] = useState<Record<string, boolean>>(DEFAULT_PHASE_VISIBILITY);
  const [progressLabels, setProgressLabels] = useState<Record<string, string>>({});
  const [customItems, setCustomItems] = useState<{ id: string; label: string }[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(salesDb, 'process_settings', brandId));
        if (snap.exists()) {
          const d = snap.data() as ProcessSettings;
          setPhaseVisibility({ ...DEFAULT_PHASE_VISIBILITY, ...(d.phaseVisibility ?? {}) });
          setProgressLabels(d.progressLabels ?? {});
          setCustomItems(d.customItems ?? []);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [brandId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings: ProcessSettings = { phaseVisibility, progressLabels, customItems };
      await setDoc(doc(salesDb, 'process_settings', brandId), settings);
      toast.success('공정 마스터 저장됨');
      onSaved(settings);
      onClose();
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.message}`);
    } finally { setSaving(false); }
  };

  const startEdit = (id: string, current: string) => { setEditingId(id); setEditingVal(current); };
  const commitEdit = (id: string, isCustom: boolean) => {
    if (editingVal.trim()) {
      if (isCustom) {
        setCustomItems(prev => prev.map(i => i.id === id ? { ...i, label: editingVal.trim() } : i));
      } else {
        setProgressLabels(prev => ({ ...prev, [id]: editingVal.trim() }));
      }
    }
    setEditingId(null);
  };

  const addCustom = () => {
    if (!newLabel.trim()) return;
    setCustomItems(prev => [...prev, { id: `custom_${Date.now()}`, label: newLabel.trim() }]);
    setNewLabel('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg my-8 border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">공정 마스터 설정</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">불러오는 중...</div>
        ) : (
          <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">

            {/* ── 캘린더 표기 공정 ── */}
            <section>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Eye size={14} className="text-blue-500" /> 캘린더 표기 공정
              </h3>
              <p className="text-xs text-slate-400 mb-3">켜진 공정만 캘린더에 표시됩니다.</p>
              <div className="grid grid-cols-2 gap-2">
                {CALENDAR_PHASES.map(p => {
                  const on = phaseVisibility[p.id] !== false;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPhaseVisibility(prev => ({ ...prev, [p.id]: !on }))}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        on
                          ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'
                          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                      }`}
                    >
                      <span>{p.label}</span>
                      {on ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── 진행 체크 항목 ── */}
            <section>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">진행 체크 항목 관리</h3>
              <p className="text-xs text-slate-400 mb-3">기본 항목은 이름만 변경 가능. 커스텀 항목은 추가/삭제 가능.</p>

              <div className="space-y-1.5 mb-3">
                {BUILTIN_PROGRESS.map(item => {
                  const label = progressLabels[item.id] ?? item.defaultLabel;
                  const isEdit = editingId === item.id;
                  return (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <span className="text-[10px] text-slate-400 w-9 shrink-0">기본</span>
                      {isEdit ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm border rounded px-2 py-0.5 bg-white dark:bg-slate-700 dark:text-white"
                          value={editingVal}
                          onChange={e => setEditingVal(e.target.value)}
                          onBlur={() => commitEdit(item.id, false)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(item.id, false); }}
                        />
                      ) : (
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                          {label}
                          {progressLabels[item.id] && (
                            <span className="text-[10px] text-slate-400 ml-1">(원: {item.defaultLabel})</span>
                          )}
                        </span>
                      )}
                      <button onClick={() => startEdit(item.id, label)} className="p-1 text-slate-400 hover:text-blue-500">
                        <Edit2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 mb-3">
                {customItems.map(item => {
                  const isEdit = editingId === item.id;
                  return (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                      <span className="text-[10px] text-emerald-600 w-9 shrink-0">추가</span>
                      {isEdit ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm border rounded px-2 py-0.5 bg-white dark:bg-slate-700 dark:text-white"
                          value={editingVal}
                          onChange={e => setEditingVal(e.target.value)}
                          onBlur={() => commitEdit(item.id, true)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(item.id, true); }}
                        />
                      ) : (
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{item.label}</span>
                      )}
                      <button onClick={() => startEdit(item.id, item.label)} className="p-1 text-slate-400 hover:text-blue-500">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => setCustomItems(prev => prev.filter(i => i.id !== item.id))} className="p-1 text-slate-400 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="새 항목 이름 (예: 간판, 전기)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
                />
                <button onClick={addCustom} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1 text-sm font-semibold">
                  <Plus size={14} /> 추가
                </button>
              </div>
            </section>

          </div>
        )}

        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium">취소</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
