/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { useConfirm } from './ConfirmModal';
import { OnboardingChecklistGroup, OnboardingChecklistItem } from '../data/onboardingContent';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const genGroupId = () => `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const genItemId = () => `itm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const ROLE_OPTIONS: { value: '' | 'supervisor' | 'cook'; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'supervisor', label: '슈퍼바이저' },
  { value: 'cook', label: '조리바이저' },
];

/* ── 항목 한 줄 (드래그 가능) ─────────────────────────── */
function SortableItemRow({ item, onUpdate, onDelete }: {
  item: OnboardingChecklistItem;
  onUpdate: (id: string, patch: Partial<OnboardingChecklistItem>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `itm:${item.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : 0 };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-2 py-1.5 ${isDragging ? 'opacity-70' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-stone-300 dark:text-stone-600 hover:text-stone-500 shrink-0 mt-1.5">
        <GripVertical size={14} />
      </div>
      <input
        value={item.text}
        onChange={e => onUpdate(item.id, { text: e.target.value })}
        placeholder="체크리스트 항목 내용"
        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
      />
      <select
        value={item.role ?? ''}
        onChange={e => onUpdate(item.id, { role: (e.target.value || undefined) as OnboardingChecklistItem['role'] })}
        className="shrink-0 px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 outline-none focus:border-stone-500"
      >
        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button onClick={() => onDelete(item.id)} className="shrink-0 p-1.5 text-stone-300 hover:text-red-500 mt-0.5">
        <X size={14} />
      </button>
    </div>
  );
}

/* ── 그룹(요일) 카드 (드래그 가능) ───────────────────────── */
function SortableGroupCard({ group, onUpdateDay, onDeleteGroup, onAddItem, onUpdateItem, onDeleteItem }: {
  group: OnboardingChecklistGroup;
  onUpdateDay: (id: string, day: string) => void;
  onDeleteGroup: (id: string) => void;
  onAddItem: (groupId: string) => void;
  onUpdateItem: (id: string, patch: Partial<OnboardingChecklistItem>) => void;
  onDeleteItem: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `grp:${group.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : 0 };

  return (
    <div ref={setNodeRef} style={style} className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 mb-3 ${isDragging ? 'shadow-lg opacity-90' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div {...attributes} {...listeners} className="cursor-grab text-stone-300 dark:text-stone-600 hover:text-stone-500 shrink-0">
          <GripVertical size={16} />
        </div>
        <input
          value={group.day}
          onChange={e => onUpdateDay(group.id, e.target.value)}
          placeholder="구간 제목 (예: Day 1 — 계정과 권한)"
          className="flex-1 min-w-0 px-2 py-1.5 text-sm font-black border border-stone-200 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
        />
        <button onClick={() => onDeleteGroup(group.id)} className="shrink-0 p-1.5 text-stone-300 hover:text-red-500">
          <Trash2 size={15} />
        </button>
      </div>

      <SortableContext items={group.items.map(i => `itm:${i.id}`)} strategy={verticalListSortingStrategy}>
        <div className="pl-1">
          {group.items.map(item => (
            <SortableItemRow key={item.id} item={item} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
          ))}
        </div>
      </SortableContext>

      <button onClick={() => onAddItem(group.id)} className="mt-1.5 flex items-center gap-1 text-xs font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
        <Plus size={12} /> 항목 추가
      </button>
    </div>
  );
}

/* ── 메인 에디터 (풀스크린) ───────────────────────────── */
interface Props {
  initial: OnboardingChecklistGroup[];
  onSave: (groups: OnboardingChecklistGroup[]) => void;
  onClose: () => void;
  saving: boolean;
}

export function OnboardingChecklistEditor({ initial, onSave, onClose, saving }: Props) {
  const { confirm } = useConfirm();
  const [groups, setGroups] = useState<OnboardingChecklistGroup[]>(initial.map(g => ({ ...g, items: [...g.items] })));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findItemLocation = (itemId: string) => {
    for (const g of groups) {
      const idx = g.items.findIndex(i => i.id === itemId);
      if (idx !== -1) return { groupId: g.id, idx };
    }
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('grp:') && overId.startsWith('grp:')) {
      const activeGid = activeId.slice(4);
      const overGid = overId.slice(4);
      setGroups(prev => {
        const oldIndex = prev.findIndex(g => g.id === activeGid);
        const newIndex = prev.findIndex(g => g.id === overGid);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        return next;
      });
      return;
    }

    if (activeId.startsWith('itm:') && overId.startsWith('itm:')) {
      const activeItemId = activeId.slice(4);
      const overItemId = overId.slice(4);
      const from = findItemLocation(activeItemId);
      const to = findItemLocation(overItemId);
      if (!from || !to) return;
      setGroups(prev => {
        const next = prev.map(g => ({ ...g, items: [...g.items] }));
        const fromGroup = next.find(g => g.id === from.groupId)!;
        const fromIdx = fromGroup.items.findIndex(i => i.id === activeItemId);
        const [moved] = fromGroup.items.splice(fromIdx, 1);
        const toGroup = next.find(g => g.id === to.groupId)!;
        const toIdx = toGroup.items.findIndex(i => i.id === overItemId);
        toGroup.items.splice(toIdx === -1 ? toGroup.items.length : toIdx, 0, moved);
        return next;
      });
    }
  };

  const updateDay = (id: string, day: string) =>
    setGroups(prev => prev.map(g => g.id === id ? { ...g, day } : g));

  const deleteGroup = async (id: string) => {
    const ok = await confirm({ title: '구간 삭제', message: '이 구간과 안의 항목이 모두 삭제됩니다. 계속할까요?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const addGroup = () => {
    setGroups(prev => [...prev, { id: genGroupId(), day: '새 구간', items: [] }]);
  };

  const addItem = (groupId: string) => {
    setGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, items: [...g.items, { id: genItemId(), group: '', text: '' }] }
      : g));
  };

  const updateItem = (id: string, patch: Partial<OnboardingChecklistItem>) => {
    setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === id ? { ...i, ...patch } : i) })));
  };

  const deleteItem = (id: string) => {
    setGroups(prev => prev.map(g => ({ ...g, items: g.items.filter(i => i.id !== id) })));
  };

  const handleSave = () => {
    const cleaned = groups
      .map(g => ({ ...g, items: g.items.filter(i => i.text.trim()) }))
      .filter(g => g.day.trim());
    onSave(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FDFBF7] dark:bg-stone-950 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
          <X size={18} />
        </button>
        <p className="text-sm font-black text-stone-900 dark:text-stone-100 flex-1">첫 주 체크리스트 편집</p>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-black disabled:opacity-40 hover:opacity-80">
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full">
        <p className="text-[11px] text-stone-400 mb-4">드래그로 구간·항목 순서를 바꿀 수 있습니다. 항목을 다른 구간으로 끌어다 놓으면 소속이 옮겨집니다.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={groups.map(g => `grp:${g.id}`)} strategy={verticalListSortingStrategy}>
            {groups.map(group => (
              <SortableGroupCard
                key={group.id}
                group={group}
                onUpdateDay={updateDay}
                onDeleteGroup={deleteGroup}
                onAddItem={addItem}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button onClick={addGroup} className="flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 mt-1">
          <Plus size={13} /> 구간 추가
        </button>
      </div>
    </div>
  );
}
