import React, { useState } from 'react';
import { MenuCategory } from '../types';
import { X, Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableCategoryItemProps {
  category: MenuCategory;
  onUpdate: (id: string, name: string) => void;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
}

const SortableCategoryItem: React.FC<SortableCategoryItemProps> = ({ category, onUpdate, onToggleVisibility, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  const handleSave = () => {
    if (name.trim() && name !== category.name) {
      onUpdate(category.id, name.trim());
    } else {
      setName(category.name);
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg mb-2 ${isDragging ? 'shadow-md opacity-80' : ''} ${!category.isVisible ? 'opacity-50' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
        <GripVertical size={18} />
      </div>
      
      <div className="flex-1">
        {isEditing ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            autoFocus
          />
        ) : (
          <div 
            className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer px-2 py-1"
            onClick={() => setIsEditing(true)}
          >
            {category.name}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={() => onToggleVisibility(category.id)}
          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
          title={category.isVisible ? "숨기기" : "보이기"}
        >
          {category.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button 
          onClick={() => onDelete(category.id)}
          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors"
          title="삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

interface Props {
  categories: MenuCategory[];
  onSave: (categories: MenuCategory[]) => void;
  onClose: () => void;
}

export const CategoryManagementModal: React.FC<Props> = ({ categories, onSave, onClose }) => {
  const [items, setItems] = useState<MenuCategory[]>(categories);
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((prevItems) => {
        const oldIndex = prevItems.findIndex((item) => item.id === active.id);
        const newIndex = prevItems.findIndex((item) => item.id === over.id);
        
        const newItems = arrayMove(prevItems, oldIndex, newIndex);
        // Update order property
        return newItems.map((item: MenuCategory, index: number) => ({
          id: item.id,
          name: item.name,
          order: index,
          isVisible: item.isVisible
        }));
      });
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    const newCategory: MenuCategory = {
      id: `cat-${Date.now()}`,
      name: newName.trim(),
      order: items.length,
      isVisible: true
    };
    
    setItems([...items, newCategory]);
    setNewName('');
  };

  const handleUpdate = (id: string, name: string) => {
    setItems(items.map(item => item.id === id ? { ...item, name } : item));
  };

  const handleToggleVisibility = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, isVisible: !item.isVisible } : item));
  };

  const handleDelete = (id: string) => {
    if (window.confirm('이 카테고리를 삭제하시겠습니까? 카테고리에 속한 메뉴들은 "미분류"로 변경됩니다.')) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleSaveAll = () => {
    // Re-assign order just to be safe
    const finalItems = items.map((item, index) => ({ ...item, order: index }));
    onSave(finalItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">카테고리 관리</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/30">
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 카테고리 이름"
              className="flex-1 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <button 
              type="submit"
              disabled={!newName.trim()}
              className="px-3 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-md hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm transition-colors"
            >
              <Plus size={16} /> 추가
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">등록된 카테고리가 없습니다.</div>
          ) : (
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map(category => (
                  <SortableCategoryItem 
                    key={category.id} 
                    category={category} 
                    onUpdate={handleUpdate}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors">
            취소
          </button>
          <button onClick={handleSaveAll} className="px-4 py-2 text-sm text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  );
};
