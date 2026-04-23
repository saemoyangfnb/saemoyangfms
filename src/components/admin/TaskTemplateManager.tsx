import React, { useState, useEffect } from 'react';
import { salesDb } from '../../firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy
} from 'firebase/firestore';
import { Department, TaskTemplate, TaskInputType, BrandId } from '../../types';
import { Plus, Edit2, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

const INPUT_TYPE_LABELS: Record<TaskInputType, string> = {
  check: '체크',
  text: '텍스트',
  number: '숫자',
  date: '날짜',
};

const DDAY_PRESETS = [
  { label: 'D-30', value: -30 },
  { label: 'D-21', value: -21 },
  { label: 'D-14', value: -14 },
  { label: 'D-10', value: -10 },
  { label: 'D-7', value: -7 },
  { label: 'D-5', value: -5 },
  { label: 'D-3', value: -3 },
  { label: 'D-2', value: -2 },
  { label: 'D-1', value: -1 },
  { label: 'D-day', value: 0 },
  { label: 'D+1', value: 1 },
  { label: 'D+3', value: 3 },
  { label: 'D+7', value: 7 },
];

interface TemplateFormState {
  title: string;
  description: string;
  dDayOffset: number;
  inputType: TaskInputType;
}

const EMPTY_FORM: TemplateFormState = {
  title: '',
  description: '',
  dDayOffset: -7,
  inputType: 'check',
};

interface Props {
  brandId: BrandId;
  departments: Department[];
}

export function TaskTemplateManager({ brandId, departments }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(salesDb, 'task_templates'), orderBy('order'));
    const unsub = onSnapshot(q, snap => {
      setTemplates(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as TaskTemplate))
          .filter(t => t.brandId === brandId)
      );
    });
    return () => unsub();
  }, [brandId]);

  useEffect(() => {
    if (departments.length > 0 && !selectedDeptId) {
      setSelectedDeptId(departments[0].id);
      setExpandedDepts(new Set(departments.map(d => d.id)));
    }
  }, [departments]);

  const deptTemplates = (deptId: string) =>
    templates.filter(t => t.departmentId === deptId).sort((a, b) => a.order - b.order);

  const handleAdd = async (f: TemplateFormState) => {
    if (!f.title.trim() || !selectedDeptId) return;
    const existing = deptTemplates(selectedDeptId);
    await addDoc(collection(salesDb, 'task_templates'), {
      brandId,
      departmentId: selectedDeptId,
      title: f.title.trim(),
      description: f.description.trim(),
      dDayOffset: f.dDayOffset,
      inputType: f.inputType,
      order: existing.length,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    toast.success('템플릿이 추가되었습니다.');
    setAddForm(EMPTY_FORM);
    setShowAdd(false);
  };

  const handleEdit = async (id: string, f: TemplateFormState) => {
    if (!f.title.trim()) return;
    await updateDoc(doc(salesDb, 'task_templates', id), {
      title: f.title.trim(),
      description: f.description.trim(),
      dDayOffset: f.dDayOffset,
      inputType: f.inputType,
    });
    toast.success('수정되었습니다.');
    setEditingId(null);
  };

  const handleDelete = async (tmpl: TaskTemplate) => {
    const ok = await confirm({
      title: '템플릿 삭제',
      message: `"${tmpl.title}" 템플릿을 삭제할까요? 이미 생성된 태스크에는 영향 없습니다.`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'task_templates', tmpl.id));
    toast.success('삭제되었습니다.');
  };

  const handleToggleActive = async (tmpl: TaskTemplate) => {
    await updateDoc(doc(salesDb, 'task_templates', tmpl.id), { isActive: !tmpl.isActive });
  };

  const toggleDept = (id: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatDDay = (offset: number) => {
    if (offset === 0) return 'D-day (오픈당일)';
    if (offset < 0) return `오픈일 ${Math.abs(offset)}일 전 (D${offset})`;
    return `오픈일 ${offset}일 후 (D+${offset})`;
  };

  // TemplateForm: 내부 상태 직접 관리 → 한국어 IME 문제 방지
  const TemplateForm = ({
    initialForm,
    onSave,
    onCancel,
  }: {
    initialForm: TemplateFormState;
    onSave: (f: TemplateFormState) => void;
    onCancel: () => void;
  }) => {
    const [local, setLocal] = useState<TemplateFormState>(initialForm);
    const set = (patch: Partial<TemplateFormState>) => setLocal(prev => ({ ...prev, ...patch }));

    return (
    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded p-3 space-y-2.5">
      <input
        defaultValue={local.title}
        onChange={e => set({ title: e.target.value })}
        placeholder="태스크명 (예: 플레이스 생성, 냉동탑차 배차)"
        className="w-full px-2 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSave(local); if (e.key === 'Escape') onCancel(); }}
      />
      <input
        defaultValue={local.description}
        onChange={e => set({ description: e.target.value })}
        placeholder="설명 (선택, 예: 네이버 플레이스 신규 등록 후 공유)"
        className="w-full px-2 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
      />
      <div className="flex gap-3 flex-wrap items-center">
        {/* D-day 설정 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-500">D-day:</span>
          <div className="flex gap-1 flex-wrap">
            {DDAY_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => set({ dDayOffset: p.value })}
                className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                  local.dDayOffset === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={local.dDayOffset}
            onChange={e => set({ dDayOffset: Number(e.target.value) })}
            className="w-16 px-2 py-1 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white text-center"
          />
        </div>

        {/* 입력 타입 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-500">입력:</span>
          {(Object.keys(INPUT_TYPE_LABELS) as TaskInputType[]).map(t => (
            <button
              key={t}
              onClick={() => set({ inputType: t })}
              className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                local.inputType === t
                  ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
                  : 'bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300'
              }`}
            >
              {INPUT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs font-bold text-stone-600 dark:text-stone-400 border border-stone-300 dark:border-stone-600 rounded hover:bg-stone-100 dark:hover:bg-stone-700">
          취소
        </button>
        <button onClick={() => onSave(local)} disabled={!local.title.trim()} className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          저장
        </button>
      </div>
    </div>
    );
  };

  if (departments.length === 0) {
    return (
      <p className="text-sm text-stone-400 py-4 text-center">
        먼저 부서를 등록해주세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* 부서 선택 (새 템플릿 추가 시 대상 부서) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-stone-500">추가할 부서:</span>
        {departments.map(d => (
          <button
            key={d.id}
            onClick={() => setSelectedDeptId(d.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded transition-colors ${
              selectedDeptId === d.id
                ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
                : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${d.color}`} />
            {d.name}
          </button>
        ))}
      </div>

      {/* 부서별 템플릿 목록 */}
      {departments.map(dept => {
        const tmpls = deptTemplates(dept.id);
        const isOpen = expandedDepts.has(dept.id);
        return (
          <div key={dept.id} className="border border-stone-200 dark:border-stone-700 rounded overflow-hidden">
            {/* 부서 헤더 */}
            <button
              onClick={() => toggleDept(dept.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/50"
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${dept.color}`} />
                <span className="text-sm font-black text-stone-800 dark:text-white">{dept.name}</span>
                <span className="text-xs text-stone-400 font-medium">{tmpls.length}개</span>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
            </button>

            {isOpen && (
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {tmpls.length === 0 && !showAdd && (
                  <p className="text-xs text-stone-400 py-3 text-center">템플릿 없음</p>
                )}

                {tmpls.map(tmpl => (
                  <div key={tmpl.id} className={`px-4 py-3 bg-white dark:bg-stone-900 ${!tmpl.isActive ? 'opacity-50' : ''}`}>
                    {editingId === tmpl.id ? (
                      <TemplateForm
                        initialForm={editForm}
                        onSave={(f) => { setEditForm(f); handleEdit(tmpl.id, f); }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-stone-800 dark:text-white">{tmpl.title}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded font-medium">
                              {INPUT_TYPE_LABELS[tmpl.inputType]}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                              tmpl.dDayOffset < 0
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                : tmpl.dDayOffset === 0
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            }`}>
                              {formatDDay(tmpl.dDayOffset)}
                            </span>
                          </div>
                          {tmpl.description && (
                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{tmpl.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleToggleActive(tmpl)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                              tmpl.isActive
                                ? 'border-green-300 text-green-700 dark:text-green-400'
                                : 'border-stone-300 text-stone-500'
                            }`}
                          >
                            {tmpl.isActive ? '활성' : '비활성'}
                          </button>
                          <button
                            onClick={() => { setEditingId(tmpl.id); setEditForm({ title: tmpl.title, description: tmpl.description || '', dDayOffset: tmpl.dDayOffset, inputType: tmpl.inputType }); }}
                            className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(tmpl)}
                            className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 이 부서에 추가 */}
                {showAdd && selectedDeptId === dept.id ? (
                  <div className="px-4 py-3 bg-white dark:bg-stone-900">
                    <TemplateForm
                      initialForm={addForm}
                      onSave={(f) => { setAddForm(f); handleAdd(f); }}
                      onCancel={() => setShowAdd(false)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedDeptId(dept.id); setShowAdd(true); setAddForm(EMPTY_FORM); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                  >
                    <Plus size={13} /> {dept.name} 태스크 추가
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
