import React, { useState, useEffect } from 'react';
import { salesDb } from '../../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Department, BrandId } from '../../types';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

interface Props {
  brandId: BrandId;
}

export function DepartmentManager({ brandId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

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
      order: departments.length,
      createdAt: new Date().toISOString(),
    });
    toast.success('부서가 추가되었습니다.');
    setNewName('');
    setShowAdd(false);
  };

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return;
    await updateDoc(doc(salesDb, 'departments', id), { name: editName.trim() });
    toast.success('수정되었습니다.');
    setEditingId(null);
  };

  const handleDelete = async (dept: Department) => {
    const ok = await confirm({
      title: '부서 삭제',
      message: `"${dept.name}" 부서를 삭제하면 연결된 업무 항목이 미배분 상태가 됩니다. 삭제할까요?`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'departments', dept.id));
    toast.success('삭제되었습니다.');
  };

  return (
    <div className="space-y-2">
      {departments.length === 0 && !showAdd && (
        <p className="text-sm text-stone-400 dark:text-stone-500 py-4 text-center">
          등록된 부서가 없습니다.
        </p>
      )}

      {departments.map((dept, idx) => (
        <div key={dept.id} className="flex items-center gap-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-4 py-2.5">
          {editingId === dept.id ? (
            <>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white font-bold"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleEdit(dept.id); if (e.key === 'Escape') setEditingId(null); }}
              />
              <button onClick={() => handleEdit(dept.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded">
                <Check size={16} />
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-black text-stone-400 w-5 text-center">{idx + 1}</span>
              <span className="flex-1 text-sm font-bold text-stone-800 dark:text-white">{dept.name}</span>
              <button onClick={() => { setEditingId(dept.id); setEditName(dept.name); }} className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                <Edit2 size={15} />
              </button>
              <button onClick={() => handleDelete(dept)} className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ))}

      {showAdd && (
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <Plus size={15} className="text-blue-500 flex-shrink-0" />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="부서명 입력 (예: 마케팅팀)"
            className="flex-1 px-2 py-1 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white font-bold"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
          />
          <button onClick={handleAdd} disabled={!newName.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors">
            추가
          </button>
          <button onClick={() => setShowAdd(false)} className="p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/10 w-full justify-center transition-colors"
      >
        <Plus size={15} /> 부서 추가
      </button>
    </div>
  );
}
