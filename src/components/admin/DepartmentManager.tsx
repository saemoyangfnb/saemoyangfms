import React, { useState, useEffect } from 'react';
import { salesDb } from '../../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Department, BrandId } from '../../types';
import { Plus, Edit2, Trash2, GripVertical, Check, X } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

const COLORS = [
  { label: '파랑', value: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
  { label: '초록', value: 'bg-green-500', text: 'text-green-700', light: 'bg-green-100' },
  { label: '보라', value: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-100' },
  { label: '주황', value: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-100' },
  { label: '빨강', value: 'bg-red-500', text: 'text-red-700', light: 'bg-red-100' },
  { label: '청록', value: 'bg-teal-500', text: 'text-teal-700', light: 'bg-teal-100' },
  { label: '분홍', value: 'bg-pink-500', text: 'text-pink-700', light: 'bg-pink-100' },
  { label: '회색', value: 'bg-stone-500', text: 'text-stone-700', light: 'bg-stone-100' },
];

interface Props {
  brandId: BrandId;
}

export function DepartmentManager({ brandId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0].value);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0].value);

  useEffect(() => {
    const q = query(collection(salesDb, 'departments'), orderBy('order'));
    const unsub = onSnapshot(q, snap => {
      setDepartments(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Department))
          .filter(d => d.brandId === brandId)
      );
    });
    return () => unsub();
  }, [brandId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addDoc(collection(salesDb, 'departments'), {
      brandId,
      name: newName.trim(),
      color: newColor,
      order: departments.length,
      createdAt: new Date().toISOString(),
    });
    toast.success('부서가 추가되었습니다.');
    setNewName('');
    setNewColor(COLORS[0].value);
    setShowAdd(false);
  };

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return;
    await updateDoc(doc(salesDb, 'departments', id), { name: editName.trim(), color: editColor });
    toast.success('수정되었습니다.');
    setEditingId(null);
  };

  const handleDelete = async (dept: Department) => {
    const ok = await confirm({
      title: '부서 삭제',
      message: `"${dept.name}" 부서를 삭제하면 연결된 태스크 템플릿도 사용 불가가 됩니다. 삭제할까요?`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'departments', dept.id));
    toast.success('삭제되었습니다.');
  };

  const startEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditColor(dept.color);
  };

  return (
    <div className="space-y-3">
      {/* 부서 목록 */}
      {departments.length === 0 && !showAdd && (
        <p className="text-sm text-stone-400 dark:text-stone-500 py-4 text-center">
          등록된 부서가 없습니다. 부서를 추가해주세요.
        </p>
      )}

      {departments.map((dept, idx) => (
        <div key={dept.id} className="flex items-center gap-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded p-3">
          <GripVertical size={16} className="text-stone-300 dark:text-stone-600 flex-shrink-0" />

          {editingId === dept.id ? (
            <>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleEdit(dept.id); if (e.key === 'Escape') setEditingId(null); }}
              />
              <div className="flex gap-1 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setEditColor(c.value)}
                    className={`w-5 h-5 rounded-full ${c.value} ${editColor === c.value ? 'ring-2 ring-offset-1 ring-stone-500' : ''}`}
                    title={c.label}
                  />
                ))}
              </div>
              <button onClick={() => handleEdit(dept.id)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                <Check size={16} />
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dept.color}`} />
              <span className="flex-1 text-sm font-bold text-stone-800 dark:text-white">{dept.name}</span>
              <span className="text-xs text-stone-400">#{idx + 1}</span>
              <button onClick={() => startEdit(dept)} className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                <Edit2 size={15} />
              </button>
              <button onClick={() => handleDelete(dept)} className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ))}

      {/* 새 부서 추가 폼 */}
      {showAdd && (
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded p-3">
          <Plus size={16} className="text-blue-500 flex-shrink-0" />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="부서명 입력 (예: 마케팅팀)"
            className="flex-1 px-2 py-1 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
          />
          <div className="flex gap-1 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setNewColor(c.value)}
                className={`w-5 h-5 rounded-full ${c.value} ${newColor === c.value ? 'ring-2 ring-offset-1 ring-stone-500' : ''}`}
                title={c.label}
              />
            ))}
          </div>
          <button onClick={handleAdd} disabled={!newName.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded disabled:opacity-50">
            추가
          </button>
          <button onClick={() => setShowAdd(false)} className="p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/10 w-full justify-center"
      >
        <Plus size={15} /> 부서 추가
      </button>
    </div>
  );
}
