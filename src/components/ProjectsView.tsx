import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { ReportView } from './ReportView';
import { salesDb, db } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, where,
} from 'firebase/firestore';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  User, Employee, Department, Project, ProjectItem, ProjectStatus,
  KanbanColumn, ProjectItemPriority,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, ChevronLeft, Trash2, Edit2, X, Users, Calendar,
  GripVertical, FolderKanban, Check, ExternalLink, Link, Search,
  Kanban, GitBranch,
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

const LINK_TYPE_CFG: Record<NonNullable<ProjectItem['linkedType']>, { label: string; cls: string }> = {
  report:  { label: '보고서',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  meeting: { label: '회의록',  cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  daily:   { label: '일일보고', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  weekly:  { label: '주간보고', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  task:    { label: '업무',    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
};

// ── DocPickerModal ────────────────────────────────────────
interface PickerDoc { id: string; title: string; sub: string; linkedType: NonNullable<ProjectItem['linkedType']>; date: string; }

function DocPickerModal({
  column, projectId, existingLinkedIds, onLink, onClose,
}: {
  column: KanbanColumn;
  projectId: string;
  existingLinkedIds: string[];
  onLink: (data: Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<NonNullable<ProjectItem['linkedType']>>('report');
  const [docs, setDocs] = useState<PickerDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setDocs([]);
    (async () => {
      try {
        if (activeTab === 'report') {
          const snap = await getDocs(query(collection(salesDb, 'reports'), orderBy('createdAt', 'desc')));
          setDocs(snap.docs.map(d => {
            const r = d.data();
            return { id: d.id, title: r.title || '(제목없음)', sub: `${r.authorName ?? ''} · ${r.createdAt?.slice(0, 10) ?? ''}`, linkedType: 'report', date: r.createdAt ?? '' };
          }));
        } else if (activeTab === 'meeting') {
          const snap = await getDocs(query(collection(db, 'meetings'), orderBy('date', 'desc')));
          setDocs(snap.docs.map(d => {
            const m = d.data();
            return { id: d.id, title: m.title || '(제목없음)', sub: `${m.author ?? ''} · ${m.date ?? ''}`, linkedType: 'meeting', date: m.date ?? '' };
          }));
        } else if (activeTab === 'daily') {
          const snap = await getDocs(query(collection(salesDb, 'daily_reports'), orderBy('date', 'desc')));
          setDocs(snap.docs.slice(0, 100).map(d => {
            const r = d.data();
            const typeLabel = r.type === 'morning' ? '출근' : '퇴근';
            return { id: d.id, title: `[${typeLabel}] ${r.employeeName}`, sub: r.date ?? '', linkedType: 'daily', date: r.date ?? '' };
          }));
        } else if (activeTab === 'weekly') {
          const snap = await getDocs(query(collection(salesDb, 'weekly_reports'), orderBy('weekStart', 'desc')));
          setDocs(snap.docs.slice(0, 100).map(d => {
            const r = d.data();
            return { id: d.id, title: r.employeeName ?? '(이름없음)', sub: `${r.weekStart ?? ''} 주간`, linkedType: 'weekly', date: r.weekStart ?? '' };
          }));
        } else {
          const snap = await getDocs(query(collection(salesDb, 'tasks'), orderBy('createdAt', 'desc')));
          setDocs(snap.docs.slice(0, 100).map(d => {
            const t = d.data();
            const statusLabel = t.status === 'done' ? '완료' : t.status === 'in_progress' ? '진행중' : t.status === 'rejected' ? '반려' : '대기';
            return { id: d.id, title: t.title ?? '(제목없음)', sub: `${t.assigneeName ?? ''} · ${statusLabel}`, linkedType: 'task', date: t.createdAt?.slice(0, 10) ?? '' };
          }));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [activeTab]);

  const filtered = docs.filter(d => {
    if (existingLinkedIds.includes(d.id)) return false;
    if (!search.trim()) return true;
    return d.title.includes(search) || d.sub.includes(search);
  });

  const tabs: { key: NonNullable<ProjectItem['linkedType']>; label: string }[] = [
    { key: 'report',  label: '보고서' },
    { key: 'meeting', label: '회의록' },
    { key: 'task',    label: '업무' },
    { key: 'daily',   label: '일일보고' },
    { key: 'weekly',  label: '주간보고' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-lg border border-stone-200 dark:border-stone-700 flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
          <h2 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
            <Link size={14} /> 기존 문서 연결
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-sm">
            <X size={16} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-stone-200 dark:border-stone-700 shrink-0">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSearch(''); }}
              className={`flex-1 py-2 text-[11px] font-bold transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white'
                  : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-2.5 py-1.5">
            <Search size={12} className="text-stone-400 shrink-0" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="제목 검색..."
              className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-stone-400">
              {search ? '검색 결과 없음' : '문서가 없습니다'}
            </div>
          ) : (
            filtered.map(d => {
              const cfg = LINK_TYPE_CFG[d.linkedType];
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800/50 group">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">{d.title}</p>
                    <p className="text-[10px] text-stone-400">{d.sub}</p>
                  </div>
                  <button
                    onClick={() => {
                      onLink(scrub({
                        projectId,
                        title: d.title,
                        column,
                        order: Date.now(),
                        priority: 'normal' as const,
                        kind: 'link' as const,
                        linkedType: d.linkedType,
                        linkedId: d.id,
                        linkedTitle: d.title,
                        linkedDate: d.date,
                      }) as Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>);
                    }}
                    className="shrink-0 px-2.5 py-1 text-[11px] font-bold bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-sm hover:bg-stone-600 dark:hover:bg-stone-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    연결
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── 도식화 트리 ───────────────────────────────────────────
function DiagramNode({
  item, allItems, onSelect, depth,
}: {
  item: ProjectItem;
  allItems: ProjectItem[];
  onSelect: (item: ProjectItem) => void;
  depth: number;
}) {
  const children = allItems.filter(i => i.parentId === item.id);
  const borderCls =
    item.column === 'done'  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
    item.column === 'doing' ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                              'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800';
  const statusCls =
    item.column === 'done'  ? 'text-emerald-600 dark:text-emerald-400' :
    item.column === 'doing' ? 'text-amber-600 dark:text-amber-400' :
                              'text-stone-400';

  return (
    <div className="flex flex-col items-center select-none">
      <button
        onClick={() => onSelect(item)}
        className={`border-2 rounded-sm p-2.5 w-36 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all ${borderCls}`}
      >
        <p className="text-[11px] font-bold text-stone-800 dark:text-stone-200 leading-tight mb-1">{item.title}</p>
        {item.assigneeDept && (
          <p className="text-[10px] text-stone-400 leading-none mb-0.5">{item.assigneeDept}</p>
        )}
        {item.assigneeName && (
          <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-none">{item.assigneeName}</p>
        )}
        <p className={`text-[10px] font-bold mt-1.5 ${statusCls}`}>
          {COL_CFG[item.column].label}
        </p>
      </button>

      {children.length > 0 && (
        <>
          <div className="w-px h-5 bg-stone-300 dark:bg-stone-600" />
          <div className="relative flex items-start gap-6">
            {children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-stone-300 dark:bg-stone-600"
                style={{ left: '50%', transform: 'translateX(-50%)', width: `calc(100% - ${144 / children.length}px)` }}
              />
            )}
            {children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-5 bg-stone-300 dark:bg-stone-600" />
                <DiagramNode item={child} allItems={allItems} onSelect={onSelect} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TreeDiagram({
  items, onSelect,
}: {
  items: ProjectItem[];
  onSelect: (item: ProjectItem) => void;
}) {
  const roots = items.filter(i => !i.parentId);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <GitBranch size={32} className="mb-3 text-stone-300 dark:text-stone-600" />
        <p className="text-sm">항목을 추가하면 도식화가 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto py-6 px-4">
      <div className="flex gap-10 items-start justify-center min-w-max mx-auto">
        {roots.length > 0 ? (
          roots.map(root => (
            <DiagramNode key={root.id} item={root} allItems={items} onSelect={onSelect} depth={0} />
          ))
        ) : (
          <div className="text-center py-10 text-stone-400">
            <p className="text-sm">항목 편집에서 '부모 항목'을 지정하면 트리가 구성됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KanbanCard ────────────────────────────────────────────
function KanbanCard({
  item, onEdit, onDelete,
}: {
  item: ProjectItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const isLink = item.kind === 'link';
  const cfg = PRIORITY_CFG[item.priority];
  const overdue = isOverdue(item.dueDate, item.column);
  const linkCfg = isLink && item.linkedType ? LINK_TYPE_CFG[item.linkedType] : null;

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0 : 1 } : undefined}
      className={`bg-white dark:bg-stone-800 border rounded-sm p-3 mb-2 shadow-sm group touch-none ${isLink ? 'border-l-2 border-l-indigo-400 border-stone-200 dark:border-stone-700' : 'border-stone-200 dark:border-stone-700'}`}
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
            {isLink && linkCfg ? (
              <>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold flex items-center gap-0.5 ${linkCfg.cls}`}>
                  <ExternalLink size={8} />{linkCfg.label}
                </span>
                {item.linkedDate && (
                  <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                    <Calendar size={9} />{fmtDate(item.linkedDate)}
                  </span>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          {!isLink && item.requesterName && (
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 leading-snug">
              요청: {item.requesterName}{item.requesterNote ? ` — ${item.requesterNote}` : ''}
            </p>
          )}
        </div>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          {!isLink && (
            <button onClick={onEdit} className="p-0.5 text-stone-400 hover:text-blue-600 rounded-sm transition-colors">
              <Edit2 size={11} />
            </button>
          )}
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
  column, items, onAddItem, onEditItem, onDeleteItem, onLinkDoc,
}: {
  column: KanbanColumn;
  items: ProjectItem[];
  onAddItem: (col: KanbanColumn) => void;
  onEditItem: (item: ProjectItem) => void;
  onDeleteItem: (item: ProjectItem) => void;
  onLinkDoc: (col: KanbanColumn) => void;
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
        <button
          onClick={() => onLinkDoc(column)}
          className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-sm transition-colors"
        >
          <Link size={11} /> 문서 연결
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
  item, projectId, defaultColumn, employees, departments, existingItems, onSave, onClose,
}: {
  item?: ProjectItem;
  projectId: string;
  defaultColumn: KanbanColumn;
  employees: Employee[];
  departments: Department[];
  existingItems: ProjectItem[];
  onSave: (data: Omit<ProjectItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [priority, setPriority] = useState<ProjectItemPriority>(item?.priority ?? 'normal');
  const [column, setColumn] = useState<KanbanColumn>(item?.column ?? defaultColumn);
  const [assigneeId, setAssigneeId] = useState(item?.assigneeId ?? '');
  const [assigneeDept, setAssigneeDept] = useState(item?.assigneeDept ?? '');
  const [requesterId, setRequesterId] = useState(item?.requesterId ?? '');
  const [requesterNote, setRequesterNote] = useState(item?.requesterNote ?? '');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '');
  const [parentId, setParentId] = useState(item?.parentId ?? '');

  const getDeptName = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return '';
    return departments.find(d => d.id === emp.departmentId)?.name ?? '';
  };

  const handleAssigneeChange = (id: string) => {
    setAssigneeId(id);
    if (id) setAssigneeDept(getDeptName(id));
    else setAssigneeDept('');
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? '';

  const selectableParents = existingItems.filter(i => i.id !== item?.id);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave(scrub({
      projectId,
      title: title.trim(),
      priority,
      column,
      order: item?.order ?? Date.now(),
      kind: 'task' as const,
      parentId: parentId || undefined,
      assigneeId: assigneeId || undefined,
      assigneeName: assigneeId ? getEmpName(assigneeId) : undefined,
      assigneeDept: assigneeDept.trim() || undefined,
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
              <select value={assigneeId} onChange={e => handleAssigneeChange(e.target.value)} className={selectCls}>
                <option value="">선택 안함</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">부서</label>
              <input value={assigneeDept} onChange={e => setAssigneeDept(e.target.value)}
                placeholder="자동 또는 직접입력"
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1">요청자</label>
              <select value={requesterId} onChange={e => setRequesterId(e.target.value)} className={selectCls}>
                <option value="">선택 안함</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-1 flex items-center gap-1">
                <GitBranch size={10} /> 부모 항목
              </label>
              <select value={parentId} onChange={e => setParentId(e.target.value)} className={selectCls}>
                <option value="">(없음 — 최상위)</option>
                {selectableParents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
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
  project, items, employees, departments, currentUser, onBack,
  onUpdateProject, onDeleteProject, onItemsChange,
}: {
  project: Project;
  items: ProjectItem[];
  employees: Employee[];
  departments: Department[];
  currentUser: User;
  onBack: () => void;
  onUpdateProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onItemsChange: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'docs' | 'diagram'>('kanban');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
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

  const openLinkDoc = (col: KanbanColumn) => {
    setDefaultCol(col);
    setShowDocPicker(true);
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

      {/* 뷰 토글 */}
      <div className="flex items-center gap-1 mb-4 border-b border-stone-200 dark:border-stone-700">
        {([
          { key: 'kanban',  icon: <Kanban size={12} />,    label: '칸반' },
          { key: 'docs',    icon: <ExternalLink size={12} />, label: '문서' },
          { key: 'diagram', icon: <GitBranch size={12} />, label: '도식화' },
        ] as { key: 'kanban' | 'docs' | 'diagram'; icon: React.ReactNode; label: string }[]).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${view === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* 도식화 뷰 */}
      {view === 'diagram' && (
        <TreeDiagram items={items} onSelect={openEditItem} />
      )}

      {/* 문서 뷰 — 프로젝트 전용 ReportView */}
      {view === 'docs' && (
        <Suspense fallback={<div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" /></div>}>
          <ReportView
            currentUser={currentUser}
            projectId={project.id}
            projectTitle={project.title}
          />
        </Suspense>
      )}

      {/* 칸반 */}
      {view === 'kanban' && <DndContext
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
              onLinkDoc={openLinkDoc}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem && <KanbanCardGhost item={activeItem} />}
        </DragOverlay>
      </DndContext>}

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
          departments={departments}
          existingItems={items}
          onSave={editingItem ? handleEditItem : handleAddItem}
          onClose={() => { setShowItemForm(false); setEditingItem(undefined); }}
        />
      )}

      {/* 문서 연결 모달 */}
      {showDocPicker && (
        <DocPickerModal
          column={defaultCol}
          projectId={project.id}
          existingLinkedIds={items.filter(i => i.kind === 'link' && i.linkedId).map(i => i.linkedId!)}
          onLink={async (data) => {
            const id = genId();
            const now = ts();
            try {
              await setDoc(doc(salesDb, 'project_items', id), scrub({ ...data, id, createdAt: now, updatedAt: now }));
              toast.success('문서 연결됨');
              onItemsChange();
            } catch {
              toast.error('연결 실패');
            }
            setShowDocPicker(false);
          }}
          onClose={() => setShowDocPicker(false)}
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
  const [departments, setDepartments] = useState<Department[]>([]);
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
    const [empSnap, deptSnap] = await Promise.all([
      getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
      getDocs(collection(salesDb, 'departments')),
    ]);
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
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
        departments={departments}
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
