import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, where,
} from 'firebase/firestore';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  User, Employee, Project, ProjectItem, ProjectStatus,
  KanbanColumn, ProjectItemPriority,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, ChevronLeft, Trash2, Edit2, X, Users, Calendar,
  GripVertical, FolderKanban, Check, MoreHorizontal,
} from 'lucide-react';

// ── 유틸 ──────────────────────────────────────────────────
const genId = () => `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const ts = () => new Date().toISOString();

const scrub = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '/'}${d.getMonth() + 1}/${d.getDate()}`;
};

const isOverdue = (dueDate: string | undefined, column: KanbanColumn) =>
  !!dueDate && column !== 'done' && new Date(dueDate) < new Date();

// ── 설정 ──────────────────────────────────────────────────
const PRIORITY_CFG: Record<ProjectItemPriority, { label: string; cls: string }> = {
  urgent: { label: '긴급', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  high:   { label: '높음', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  normal: { label: '보통', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  low:    { label: '낮음', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
};

const COL_CFG: Record<KanbanColumn, { label: string; headCls: string; bgCls: string; dotCls: string }> = {
  todo:  { label: '할 일',   headCls: 'text-stone-600 dark:text-stone-300',     bgCls: 'bg-stone-100/80 dark:bg-stone-800/50',    dotCls: 'bg-stone-400' },
  doing: { label: '진행 중', headCls: 'text-amber-600 dark:text-amber-400',     bgCls: 'bg-amber-50/80 dark:bg-amber-900/10',     dotCls: 'bg-amber-400' },
  done:  { label: '완료',    headCls: 'text-emerald-600 dark:text-emerald-400', bgCls: 'bg-emerald-50/80 dark:bg-emerald-900/10', dotCls: 'bg-emerald-500' },
};

const STATUS_CFG: Record<ProjectStatus, { label: string; cls: string }> = {
  active:    { label: '진행중',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  on_hold:   { label: '보류',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: '완료',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  archived:  { label: '아카이브',  cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
};

const COLS: KanbanColumn[] = ['todo', 'doing', 'done'];

// ── KanbanCard ────────────────────────────────────────────
function KanbanCard({
  item, onEdit, onDelete,
}: {
  item: ProjectItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const cfg = PRIORITY_CFG[item.priority];
  const overdue = isOverdue(item.dueDate, item.column);

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0 : 1 } : undefined}
      className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-3 mb-2 shadow-sm group touch-none"
    >
      <div className="flex items-start gap-1.5">
        <button
          {...listeners} {...attributes}
          className="mt-0.5 text-stone-300 dark:text-stone-600 cursor-grab active:cursor-grabbing shrink-0 hover:text-stone-500"
        >
          <GripVertical size={13} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-stone-800 dark:text-stone-100 leading-snug mb-1.5 pr-1">{item.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${cfg.cls}`}>{cfg.label}</span>
            {item.assigneeName && (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-0.5">
                <Users size={9} />{item.assigneeName}
              </span>
            )}
            {item.dueDate && (
              <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-500 font-bold' : 'text-stone-400'}`}>
                <Calendar size={9} />{fmtDate(item.dueDate)}{overdue ? ' !' : ''}
              </span>
            )}
          </div>
          {item.requesterName && (
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 leading-snug">
              요청: {item.requesterName}{item.requesterNote ? ` — ${item.requesterNote}` : ''}
            </p>
          )}
        </div>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button onClick={onEdit} className="p-0.5 text-stone-400 hover:text-blue-600 rounded-sm transition-colors">
            <Edit2 size={11} />
          </button>
          <button onClick={onDelete} className="p-0.5 text-stone-400 hover:text-red-600 rounded-sm transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KanbanCardGhost (DragOverlay용) ───────────────────────
function KanbanCardGhost({ item }: { item: ProjectItem }) {
  const cfg = PRIORITY_CFG[item.priority];
  return (
    <div className="bg-white dark:bg-stone-800 border-2 border-blue-400 rounded-sm p-3 shadow-xl w-64 opacity-90">
      <p className="text-xs font-medium text-stone-800 dark:text-stone-100 mb-1.5">{item.title}</p>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${cfg.cls}`}>{cfg.label}</span>
    </div>
  );
}

// ── DroppableColumn ───────────────────────────────────────
function DroppableColumn({
  column, items, onAddItem, onEditItem, onDeleteItem,
}: {
  column: KanbanColumn;
  items: ProjectItem[];
  onAddItem: (col: KanbanColumn) => void;
  onEditItem: (item: ProjectItem) => void;
  onDeleteItem: (item: ProjectItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const cfg = COL_CFG[column];

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`w-2 h-2 rounded-full ${cfg.dotCls} shrink-0`} />
        <h3 className={`text-xs font-bold ${cfg.headCls} flex-1`}>{cfg.label}</h3>
        <span className="text-[10px] text-stone-400 tabular-nums">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`${cfg.bgCls} rounded-sm p-2 flex-1 min-h-[120px] transition-all border-2 ${isOver ? 'border-blue-400 dark:border-blue-500' : 'border-transparent'}`}
      >
        {items.map(item => (
          <KanbanCard
            key={item.id}
            item={item}
            onEdit={() => onEditItem(item)}
            onDelete={() => onDeleteItem(item)}
          />
        ))}
        <button
          onClick={() => onAddItem(column)}
          className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-700/40 rounded-sm transition-colors"
        >
          <Plus size={11} /> 추가
        </button>
      </div>
    </div>
  );
}

// ── ProjectFormModal ──────────────────────────────────────
function ProjectFormModal({
  project, employees, currentUser, onSave, onClose,
}: {
  project?: Project;
  employees: Employee[];
  currentUser: User;
  onSave: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [endDate, setEndDate] = useState(project?.endDate ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? []);

  const toggleMember = (emp: Employee) => {
    setMemberIds(prev =>
      prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const memberNames = employees.filter(e => memberIds.includes(e.id)).map(e => e.name);
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      ownerId: currentUser.uid,
      ownerName: currentUser.name,
      memberIds,
      memberNames,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      milestones: project?.milestones ?? [],
    } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-lg border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">
            {project ? '프로젝트 수정' : '새 프로젝트'}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-sm">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">제목 *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="프로젝트 제목"
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">설명</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="프로젝트 목적 / 배경"
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">상태</label>
              <select
                value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
              >
                <option value="active">진행중</option>
                <option value="on_hold">보류</option>
                <option value="completed">완료</option>
                <option value="archived">아카이브</option>
              </select>
            </div>
            <div />
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">마감일</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
            </div>
          </div>
          {employees.length > 0 && (
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2">멤버</label>
              <div className="border border-stone-200 dark:border-stone-700 rounded-sm max-h-36 overflow-y-auto">
                {employees.map(emp => (
                  <button
                    key={emp.id} type="button"
                    onClick={() => toggleMember(emp)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                      memberIds.includes(emp.id)
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <span className={`w-4 h-4 border rounded-sm flex items-center justify-center shrink-0 ${memberIds.includes(emp.id) ? 'bg-stone-800 dark:bg-stone-300 border-stone-800 dark:border-stone-300' : 'border-stone-300 dark:border-stone-600'}`}>
                      {memberIds.includes(emp.id) && <Check size={10} className="text-white dark:text-stone-900" />}
                    </span>
                    {emp.name}
                    <span className="text-stone-400 text-[10px] ml-auto">{emp.position}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit} disabled={!title.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-40 transition-colors"
          >
            {project ? '저장' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ItemFormModal ─────────────────────────────────────────
function ItemFormModal({
  item, projectId, defaultColumn, employees, onSave, onClose,
}: {
  item?: ProjectItem;
  projectId: string;
  defaultColumn: KanbanColumn;
  employees: Employee[];
  onSave: (data: Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [priority, setPriority] = useState<ProjectItemPriority>(item?.priority ?? 'normal');
  const [column, setColumn] = useState<KanbanColumn>(item?.column ?? defaultColumn);
  const [assigneeId, setAssigneeId] = useState(item?.assigneeId ?? '');
  const [requesterId, setRequesterId] = useState(item?.requesterId ?? '');
  const [requesterNote, setRequesterNote] = useState(item?.requesterNote ?? '');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '');

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? '';

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave(scrub({
      projectId,
      title: title.trim(),
      priority,
      column,
      order: item?.order ?? Date.now(),
      kind: 'task' as const,
      assigneeId: assigneeId || undefined,
      assigneeName: assigneeId ? getEmpName(assigneeId) : undefined,
      requesterId: requesterId || undefined,
      requesterName: requesterId ? getEmpName(requesterId) : undefined,
      requesterNote: requesterNote.trim() || undefined,
      dueDate: dueDate || undefined,
    }) as Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>);
  };

  const selectCls = 'w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-md border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">
            {item ? '항목 수정' : '새 항목'}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-sm">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">제목 *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="무엇을 해야 하나요?"
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">우선순위</label>
              <select value={priority} onChange={e => setPriority(e.target.value as ProjectItemPriority)} className={selectCls}>
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="normal">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">컬럼</label>
              <select value={column} onChange={e => setColumn(e.target.value as KanbanColumn)} className={selectCls}>
                <option value="todo">할 일</option>
                <option value="doing">진행 중</option>
                <option value="done">완료</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">담당자</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={selectCls}>
                <option value="">선택 안함</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">요청자</label>
              <select value={requesterId} onChange={e => setRequesterId(e.target.value)} className={selectCls}>
                <option value="">선택 안함</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          {requesterId && (
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">요청 맥락</label>
              <input
                value={requesterNote} onChange={e => setRequesterNote(e.target.value)}
                placeholder="왜 필요한지 간략히..."
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">마감일</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit} disabled={!title.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-40 transition-colors"
          >
            {item ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProjectDetail (칸반) ──────────────────────────────────
function ProjectDetail({
  project, items, employees, currentUser, onBack,
  onUpdateProject, onDeleteProject, onItemsChange,
}: {
  project: Project;
  items: ProjectItem[];
  employees: Employee[];
  currentUser: User;
  onBack: () => void;
  onUpdateProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onItemsChange: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | undefined>();
  const [defaultCol, setDefaultCol] = useState<KanbanColumn>('todo');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;
  const doneCount = items.filter(i => i.column === 'done').length;
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const targetCol = over.id as KanbanColumn;
    if (!COLS.includes(targetCol)) return;
    const dragged = items.find(i => i.id === active.id);
    if (!dragged || dragged.column === targetCol) return;

    try {
      await updateDoc(doc(salesDb, 'project_items', dragged.id), {
        column: targetCol, updatedAt: ts(),
      });
      onItemsChange();
    } catch {
      toast.error('이동 실패');
    }
  }, [items, onItemsChange, toast]);

  const handleAddItem = async (data: Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = genId();
    const now = ts();
    try {
      await setDoc(doc(salesDb, 'project_items', id), scrub({ ...data, id, createdAt: now, updatedAt: now }));
      toast.success('항목 추가됨');
      onItemsChange();
    } catch {
      toast.error('저장 실패');
    }
    setShowItemForm(false);
    setEditingItem(undefined);
  };

  const handleEditItem = async (data: Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingItem) return;
    try {
      await updateDoc(doc(salesDb, 'project_items', editingItem.id), scrub({ ...data, updatedAt: ts() }));
      toast.success('수정됨');
      onItemsChange();
    } catch {
      toast.error('수정 실패');
    }
    setShowItemForm(false);
    setEditingItem(undefined);
  };

  const handleDeleteItem = async (item: ProjectItem) => {
    const ok = await confirm({ title: '항목 삭제', message: `"${item.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'project_items', item.id));
      toast.success('삭제됨');
      onItemsChange();
    } catch {
      toast.error('삭제 실패');
    }
  };

  const openAddItem = (col: KanbanColumn) => {
    setDefaultCol(col);
    setEditingItem(undefined);
    setShowItemForm(true);
  };

  const openEditItem = (item: ProjectItem) => {
    setEditingItem(item);
    setShowItemForm(true);
  };

  const statusCfg = STATUS_CFG[project.status];

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={onBack} className="mt-0.5 p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-stone-900 dark:text-white truncate">{project.title}</h1>
            <span className={`text-[11px] px-2 py-0.5 rounded-sm font-bold ${statusCfg.cls}`}>{statusCfg.label}</span>
          </div>
          {project.description && (
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5 truncate">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {items.length > 0 && (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-32 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">{doneCount}/{items.length} ({progress}%)</span>
              </div>
            )}
            {project.endDate && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <Calendar size={11} /> 마감 {fmtDate(project.endDate)}
              </span>
            )}
            {project.memberNames.length > 0 && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <Users size={11} /> {project.memberNames.slice(0, 3).join(', ')}{project.memberNames.length > 3 ? ` +${project.memberNames.length - 3}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowProjectForm(true)}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
          >
            <Edit2 size={15} />
          </button>
          {currentUser.role === 'admin' && (
            <button
              onClick={() => onDeleteProject(project.id)}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 칸반 */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLS.map(col => (
            <DroppableColumn
              key={col}
              column={col}
              items={items.filter(i => i.column === col).sort((a, b) => a.order - b.order)}
              onAddItem={openAddItem}
              onEditItem={openEditItem}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem && <KanbanCardGhost item={activeItem} />}
        </DragOverlay>
      </DndContext>

      {/* 프로젝트 수정 모달 */}
      {showProjectForm && (
        <ProjectFormModal
          project={project}
          employees={employees}
          currentUser={currentUser}
          onSave={data => {
            onUpdateProject({ ...project, ...data, updatedAt: ts() });
            setShowProjectForm(false);
          }}
          onClose={() => setShowProjectForm(false)}
        />
      )}

      {/* 항목 추가/수정 모달 */}
      {showItemForm && (
        <ItemFormModal
          item={editingItem}
          projectId={project.id}
          defaultColumn={defaultCol}
          employees={employees}
          onSave={editingItem ? handleEditItem : handleAddItem}
          onClose={() => { setShowItemForm(false); setEditingItem(undefined); }}
        />
      )}
    </div>
  );
}

// ── ProjectCard (목록용) ──────────────────────────────────
function ProjectCard({
  project, itemCount, doneCount, onClick,
}: {
  project: Project;
  itemCount: number;
  doneCount: number;
  onClick: () => void;
}) {
  const statusCfg = STATUS_CFG[project.status];
  const progress = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;
  const isEndingSoon = project.endDate && project.status === 'active' &&
    new Date(project.endDate) > new Date() &&
    new Date(project.endDate) < new Date(Date.now() + 7 * 86400000);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-4 hover:shadow-md hover:border-stone-400 dark:hover:border-stone-500 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-black text-stone-900 dark:text-white group-hover:text-stone-700 dark:group-hover:text-stone-200 leading-snug flex-1 min-w-0 truncate">
          {project.title}
        </h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
      </div>
      {project.description && (
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 line-clamp-2 leading-snug">{project.description}</p>
      )}
      {itemCount > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-stone-400 mb-1">
            <span>진행률</span>
            <span className="tabular-nums">{doneCount}/{itemCount} ({progress}%)</span>
          </div>
          <div className="h-1 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${project.status === 'completed' ? 'bg-blue-500' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-stone-400 flex-wrap">
        {project.memberNames.length > 0 && (
          <span className="flex items-center gap-0.5">
            <Users size={9} /> {project.memberNames.slice(0, 2).join(', ')}{project.memberNames.length > 2 ? ` +${project.memberNames.length - 2}` : ''}
          </span>
        )}
        {project.endDate && (
          <span className={`flex items-center gap-0.5 ${isEndingSoon ? 'text-amber-500 font-bold' : ''}`}>
            <Calendar size={9} /> {fmtDate(project.endDate)}{isEndingSoon ? ' ⚡' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ── ProjectsView (메인) ───────────────────────────────────
export function ProjectsView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'all' | 'visual'>('active');
  const [showProjectForm, setShowProjectForm] = useState(false);

  // 아이템 집계용 캐시 (projectId → { total, done })
  const [itemStats, setItemStats] = useState<Record<string, { total: number; done: number }>>({});

  const loadProjects = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'projects'), orderBy('updatedAt', 'desc')));
    setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
  }, []);

  const loadItemStats = useCallback(async () => {
    const snap = await getDocs(collection(salesDb, 'project_items'));
    const stats: Record<string, { total: number; done: number }> = {};
    snap.docs.forEach(d => {
      const item = d.data() as ProjectItem;
      if (!stats[item.projectId]) stats[item.projectId] = { total: 0, done: 0 };
      stats[item.projectId].total += 1;
      if (item.column === 'done') stats[item.projectId].done += 1;
    });
    setItemStats(stats);
  }, []);

  const loadEmployees = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'employees'), orderBy('name')));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
  }, []);

  const loadProjectItems = useCallback(async (projectId: string) => {
    const snap = await getDocs(query(collection(salesDb, 'project_items'), where('projectId', '==', projectId), orderBy('order')));
    setProjectItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectItem)));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadProjects(), loadItemStats(), loadEmployees()]);
      setLoading(false);
    })();
  }, [loadProjects, loadItemStats, loadEmployees]);

  const handleCreateProject = async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = genId();
    const now = ts();
    try {
      await setDoc(doc(salesDb, 'projects', id), scrub({ ...data, id, createdAt: now, updatedAt: now }));
      toast.success('프로젝트 생성됨');
      await loadProjects();
      await loadItemStats();
      setShowProjectForm(false);
    } catch {
      toast.error('생성 실패');
    }
  };

  const handleUpdateProject = async (updated: Project) => {
    try {
      await updateDoc(doc(salesDb, 'projects', updated.id), scrub({ ...updated, updatedAt: ts() }));
      setSelectedProject(updated);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success('수정됨');
    } catch {
      toast.error('수정 실패');
    }
  };

  const handleDeleteProject = async (id: string) => {
    const ok = await confirm({ title: '프로젝트 삭제', message: '프로젝트와 모든 항목이 삭제됩니다. 계속할까요?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      // 프로젝트 아이템 전체 삭제
      const itemSnap = await getDocs(query(collection(salesDb, 'project_items'), where('projectId', '==', id)));
      await Promise.all(itemSnap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(salesDb, 'projects', id));
      toast.success('삭제됨');
      setSelectedProject(null);
      await loadProjects();
      await loadItemStats();
    } catch {
      toast.error('삭제 실패');
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    await loadProjectItems(project.id);
  };

  const filteredProjects = projects.filter(p => {
    if (tab === 'active') return p.status === 'active';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
      </div>
    );
  }

  // ── 프로젝트 상세 (칸반) ──
  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        items={projectItems}
        employees={employees}
        currentUser={currentUser}
        onBack={() => setSelectedProject(null)}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onItemsChange={() => {
          loadProjectItems(selectedProject.id);
          loadItemStats();
        }}
      />
    );
  }

  // ── 프로젝트 목록 ──
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white">프로젝트</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">전사 프로젝트 관리</p>
        </div>
        <button
          onClick={() => setShowProjectForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
        >
          <Plus size={13} /> 새 프로젝트
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-0 border-b border-stone-200 dark:border-stone-700 mb-4">
        {([['active', '진행중'], ['all', '전체'], ['visual', '시각화']] as [string, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white'
                : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            {label}
            {key === 'active' && (
              <span className="ml-1.5 text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full tabular-nums">
                {projects.filter(p => p.status === 'active').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 시각화 탭 */}
      {tab === 'visual' && (
        <div className="space-y-3">
          {projects.filter(p => p.status !== 'archived').map(p => {
            const stats = itemStats[p.id] ?? { total: 0, done: 0 };
            const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
            const statusCfg = STATUS_CFG[p.status];
            return (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p)}
                className="w-full text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                  <span className="text-sm font-black text-stone-900 dark:text-white flex-1 truncate">{p.title}</span>
                  <span className="text-[11px] text-stone-400 tabular-nums shrink-0">{pct}%</span>
                </div>
                <div className="h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${p.status === 'completed' ? 'bg-blue-500' : p.status === 'on_hold' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-400">
                  {stats.total > 0 && <span>{stats.done}/{stats.total} 완료</span>}
                  {p.endDate && <span className="flex items-center gap-0.5"><Calendar size={9} /> {fmtDate(p.endDate)}</span>}
                  {p.memberNames.length > 0 && <span className="flex items-center gap-0.5"><Users size={9} /> {p.memberNames.slice(0, 2).join(', ')}</span>}
                </div>
              </button>
            );
          })}
          {projects.filter(p => p.status !== 'archived').length === 0 && (
            <div className="text-center py-16 text-stone-400">프로젝트가 없습니다.</div>
          )}
        </div>
      )}

      {/* 진행중 / 전체 탭 */}
      {tab !== 'visual' && (
        <>
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FolderKanban size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">
                {tab === 'active' ? '진행 중인 프로젝트가 없습니다' : '프로젝트가 없습니다'}
              </p>
              <button
                onClick={() => setShowProjectForm(true)}
                className="mt-3 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 underline"
              >
                새 프로젝트 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProjects.map(p => {
                const stats = itemStats[p.id] ?? { total: 0, done: 0 };
                return (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    itemCount={stats.total}
                    doneCount={stats.done}
                    onClick={() => handleSelectProject(p)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 새 프로젝트 모달 */}
      {showProjectForm && (
        <ProjectFormModal
          employees={employees}
          currentUser={currentUser}
          onSave={handleCreateProject}
          onClose={() => setShowProjectForm(false)}
        />
      )}
    </div>
  );
}
