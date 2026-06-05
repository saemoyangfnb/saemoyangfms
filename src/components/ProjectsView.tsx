import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { ReportView } from './ReportView';
import { salesDb } from '../firebase';
import {
  collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, deleteField,
} from 'firebase/firestore';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  User, Employee, Department, Project, Report, ProjectStatus,
  KanbanColumnDef, KanbanColumnColor, DEFAULT_KANBAN_COLUMNS, ProjectItem,
  ProjectFolder,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Trash2, Edit2, X, Users, Calendar,
  GripVertical, FolderKanban, Check, Link, Search, Kanban, GitBranch, FileText,
  Archive, CheckCircle2, RotateCcw, BookOpen, BarChart2, Folder, FolderOpen, Printer,
} from 'lucide-react';

// ── 유틸 ──────────────────────────────────────────────────
const genId = () => `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const mmId = () => `mm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
const ts = () => new Date().toISOString();
const scrub = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
interface MindMapNode { id: string; text: string; parentId: string | null; order: number; reportId?: string; }

const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ── 설정 ──────────────────────────────────────────────────
const COLOR_CFG: Record<string, { headCls: string; bgCls: string; dotCls: string; cardBorderCls: string }> = {
  stone:   { headCls: 'text-stone-600 dark:text-stone-300',     bgCls: 'bg-stone-100/80 dark:bg-stone-800/50',    dotCls: 'bg-stone-400',   cardBorderCls: 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800' },
  amber:   { headCls: 'text-amber-600 dark:text-amber-400',     bgCls: 'bg-amber-50/80 dark:bg-amber-900/10',     dotCls: 'bg-amber-400',   cardBorderCls: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' },
  emerald: { headCls: 'text-emerald-600 dark:text-emerald-400', bgCls: 'bg-emerald-50/80 dark:bg-emerald-900/10', dotCls: 'bg-emerald-500', cardBorderCls: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' },
  blue:    { headCls: 'text-blue-600 dark:text-blue-400',       bgCls: 'bg-blue-50/80 dark:bg-blue-900/10',       dotCls: 'bg-blue-500',    cardBorderCls: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' },
  purple:  { headCls: 'text-purple-600 dark:text-purple-400',   bgCls: 'bg-purple-50/80 dark:bg-purple-900/10',   dotCls: 'bg-purple-500',  cardBorderCls: 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' },
  rose:    { headCls: 'text-rose-600 dark:text-rose-400',       bgCls: 'bg-rose-50/80 dark:bg-rose-900/10',       dotCls: 'bg-rose-500',    cardBorderCls: 'border-rose-400 bg-rose-50 dark:bg-rose-900/20' },
};
const COLOR_ORDER = ['stone', 'amber', 'emerald', 'blue', 'purple', 'rose'];

const STATUS_CFG: Record<ProjectStatus, { label: string; cls: string }> = {
  active:    { label: '진행중',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  on_hold:   { label: '보류',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: '완료',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  archived:  { label: '아카이브', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
};

const AP_CFG: Record<string, { label: string; cls: string }> = {
  draft:    { label: '임시저장', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
  pending:  { label: '결재대기', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: '승인',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: '반려',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

interface SimpleMeeting {
  id: string; title: string; date: string; author?: string;
  agendas?: { title: string }[];
}

// ── 보고서 칸반 카드 ──────────────────────────────────────
function ReportKanbanCard({
  report, columns, onOpen, onUnlink, onStatusChange,
}: {
  report: Report;
  columns: KanbanColumnDef[];
  onOpen: () => void;
  onUnlink: () => void;
  onStatusChange: (colId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: report.id });
  const ap = AP_CFG[report.approvalStatus] ?? AP_CFG.draft;
  const preview = report.sections?.[0]?.body ?? '';
  const currentColId = report.kanbanColumn ?? columns[0]?.id ?? 'todo';

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0 : 1 } : undefined}
      className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-3 mb-2 shadow-sm touch-none"
    >
      <div className="flex items-start gap-1.5">
        {/* 드래그 핸들 */}
        <button {...listeners} {...attributes}
          className="mt-0.5 text-stone-300 dark:text-stone-600 cursor-grab active:cursor-grabbing shrink-0 hover:text-stone-500">
          <GripVertical size={13} />
        </button>
        {/* 내용 */}
        <div className="flex-1 min-w-0">
          {/* 상태 드롭다운 + 결재상태 */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <select
              value={currentColId}
              onChange={e => { e.stopPropagation(); onStatusChange(e.target.value); }}
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 border-0 cursor-pointer outline-none"
            >
              {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${ap.cls}`}>{ap.label}</span>
            <span className="text-[10px] text-stone-400">{report.authorName}</span>
          </div>
          {/* 제목 */}
          <p
            className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-snug hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
            onClick={onOpen}
          >
            {report.title || '(제목 없음)'}
          </p>
          {preview && (
            <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 leading-snug">{preview}</p>
          )}
        </div>
        {/* 제거 버튼 */}
        <button
          onClick={onUnlink}
          title="프로젝트에서 제거"
          className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-red-500 rounded-sm shrink-0 mt-0.5 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// DragOverlay용 Ghost
function ReportCardGhost({ report }: { report: Report }) {
  const ap = AP_CFG[report.approvalStatus] ?? AP_CFG.draft;
  return (
    <div className="bg-white dark:bg-stone-800 border-2 border-blue-400 rounded-sm p-3 shadow-xl w-56 opacity-90">
      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${ap.cls} block mb-1`}>{ap.label}</span>
      <p className="text-xs font-bold text-stone-800 dark:text-stone-200">{report.title || '(제목 없음)'}</p>
    </div>
  );
}

// ── 드롭 가능한 칸반 컬럼 ─────────────────────────────────
function DroppableColumn({
  colDef, docs, columns, isFirst, isLast,
  onNewReport, onOpenDoc, onUnlinkDoc, onStatusChange,
  onRename, onColorChange, onMoveLeft, onMoveRight, onDelete,
}: {
  colDef: KanbanColumnDef;
  docs: Report[];
  columns: KanbanColumnDef[];
  isFirst: boolean;
  isLast: boolean;
  onNewReport: () => void;
  onOpenDoc: (r: Report) => void;
  onUnlinkDoc: (r: Report) => void;
  onStatusChange: (reportId: string, colId: string) => void;
  onRename: (label: string) => void;
  onColorChange: (color: KanbanColumnColor) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colDef.id });
  const cfg = COLOR_CFG[colDef.color] ?? COLOR_CFG.stone;
  const colDocs = docs.filter(d => (d.kanbanColumn ?? columns[0]?.id) === colDef.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(colDef.label);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // 외부에서 label 바뀌면 동기화
  React.useEffect(() => { if (!editing) setDraft(colDef.label); }, [colDef.label, editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== colDef.label) onRename(trimmed);
    else setDraft(colDef.label);
  };

  return (
    <div className="flex-1 min-w-[190px] max-w-[270px] flex flex-col min-h-0">
      {/* 컬럼 헤더 */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {/* 색상 도트 */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowColorPicker(v => !v)}
            className={`w-2.5 h-2.5 rounded-full ${cfg.dotCls} hover:scale-125 transition-transform`}
            title="색상 변경"
          />
          {showColorPicker && (
            <div
              className="absolute top-5 left-0 z-20 flex gap-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md p-2 shadow-lg"
              onMouseLeave={() => setShowColorPicker(false)}
            >
              {COLOR_ORDER.map(c => (
                <button
                  key={c}
                  onClick={() => { onColorChange(c as KanbanColumnColor); setShowColorPicker(false); }}
                  className={`w-4 h-4 rounded-full ${COLOR_CFG[c].dotCls} hover:scale-125 transition-transform ${colDef.color === c ? 'ring-2 ring-offset-1 ring-stone-400 dark:ring-stone-500' : ''}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* 컬럼 이름 (인라인 편집) */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setEditing(false); setDraft(colDef.label); }
            }}
            className="text-xs font-bold flex-1 min-w-0 bg-transparent border-b border-stone-400 dark:border-stone-500 outline-none py-0.5"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`text-xs font-bold ${cfg.headCls} flex-1 text-left truncate hover:opacity-70 transition-opacity`}
            title="클릭하여 이름 변경"
          >
            {colDef.label}
          </button>
        )}

        <span className="text-[10px] text-stone-400 tabular-nums shrink-0">{colDocs.length}</span>

        {/* 이동 / 삭제 */}
        <div className="flex items-center gap-0 shrink-0">
          <button
            onClick={onMoveLeft}
            disabled={isFirst}
            className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-20 rounded-sm transition-colors"
            title="왼쪽으로"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            onClick={onMoveRight}
            disabled={isLast}
            className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-20 rounded-sm transition-colors"
            title="오른쪽으로"
          >
            <ChevronRight size={12} />
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-red-500 rounded-sm transition-colors"
            title="컬럼 삭제"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* 카드 드롭 영역 */}
      <div
        ref={setNodeRef}
        className={`${cfg.bgCls} rounded-sm p-2 flex-1 min-h-[120px] transition-all border-2 ${isOver ? 'border-blue-400 dark:border-blue-500' : 'border-transparent'}`}
      >
        {colDocs.map(d => (
          <ReportKanbanCard
            key={d.id}
            report={d}
            columns={columns}
            onOpen={() => onOpenDoc(d)}
            onUnlink={() => onUnlinkDoc(d)}
            onStatusChange={colId => onStatusChange(d.id, colId)}
          />
        ))}
        <button
          onClick={onNewReport}
          className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-700/40 rounded-sm transition-colors"
        >
          <Plus size={11} /> 새 보고서
        </button>
      </div>
    </div>
  );
}

// ── 도식화 노드 (보고서 기반) ─────────────────────────────
function ReportDiagramNode({
  report, allDocs, columns, onNodeClick, onUnlink, depth,
}: {
  report: Report;
  allDocs: Report[];
  columns: KanbanColumnDef[];
  onNodeClick: (r: Report) => void;
  onUnlink: (r: Report) => void;
  depth: number;
}) {
  const children = allDocs.filter(d => d.parentReportId === report.id);
  const colId = report.kanbanColumn ?? columns[0]?.id ?? 'todo';
  const colDef = columns.find(c => c.id === colId);
  const colorCfg = COLOR_CFG[colDef?.color ?? 'stone'] ?? COLOR_CFG.stone;
  const borderCls = colorCfg.cardBorderCls;
  const headCls = colorCfg.headCls;
  const bgCls = colorCfg.bgCls;
  const colLabel = colDef?.label ?? colId;

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <button
          onClick={() => onNodeClick(report)}
          className={`border-2 rounded-sm p-2.5 w-44 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all ${borderCls}`}
        >
          <div className="flex items-center gap-1 mb-1.5">
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded-sm ${bgCls} ${headCls}`}>{colLabel}</span>
          </div>
          <p className="text-[11px] font-bold text-stone-800 dark:text-stone-200 leading-tight mb-1 pr-2">{report.title || '(제목 없음)'}</p>
          <p className="text-[10px] text-stone-400 leading-none">{report.authorName}</p>
          {report.sections?.[0]?.body && (
            <p className="text-[9px] text-stone-400 mt-1 line-clamp-2 leading-snug">{report.sections[0].body}</p>
          )}
        </button>
        {/* X — 프로젝트에서 제거 */}
        <button
          onClick={e => { e.stopPropagation(); onUnlink(report); }}
          title="프로젝트에서 제거"
          className="absolute -top-2 -right-2 w-5 h-5 bg-stone-200 dark:bg-stone-700 rounded-full flex items-center justify-center text-stone-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <X size={9} />
        </button>
      </div>

      {children.length > 0 && (
        <>
          <div className="w-px h-6 bg-stone-300 dark:bg-stone-600" />
          <div className="relative flex items-start gap-8">
            {children.length > 1 && (
              <div className="absolute top-0 h-px bg-stone-300 dark:bg-stone-600"
                style={{ left: '50%', transform: 'translateX(-50%)', width: `calc(100% - 88px)` }}
              />
            )}
            {children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-6 bg-stone-300 dark:bg-stone-600" />
                <ReportDiagramNode report={child} allDocs={allDocs} columns={columns} onNodeClick={onNodeClick} onUnlink={onUnlink} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReportTreeDiagram({
  docs, columns, onNodeClick, onUnlink,
}: {
  docs: Report[];
  columns: KanbanColumnDef[];
  onNodeClick: (r: Report) => void;
  onUnlink: (r: Report) => void;
}) {
  const roots = docs.filter(d => !d.parentReportId);
  return (
    <div className="overflow-auto py-8 px-4">
      {roots.length === 0 ? (
        <div className="text-center py-10 text-xs text-stone-400">보고서가 없습니다.</div>
      ) : (
        <div className="flex gap-12 items-start justify-center min-w-max mx-auto">
          {roots.map(root => (
            <ReportDiagramNode key={root.id} report={root} allDocs={docs} columns={columns} onNodeClick={onNodeClick} onUnlink={onUnlink} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 도식화 노드 팝업 ──────────────────────────────────────
function NodeActionPopup({
  report, columns, onView, onAddSibling, onAddChild, onClose,
}: {
  report: Report;
  columns: KanbanColumnDef[];
  onView: () => void;
  onAddSibling: () => void;
  onAddChild: () => void;
  onClose: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const ap = AP_CFG[report.approvalStatus] ?? AP_CFG.draft;
  const colId = report.kanbanColumn ?? columns[0]?.id ?? 'todo';
  const colDef = columns.find(c => c.id === colId);
  const colorCfg = COLOR_CFG[colDef?.color ?? 'stone'] ?? COLOR_CFG.stone;
  const preview = report.sections?.[0]?.body?.slice(0, 80) ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl border border-stone-200 dark:border-stone-700 w-64 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 보고서 요약 헤더 */}
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${ap.cls}`}>{ap.label}</span>
            <span className={`text-[10px] font-bold ${colorCfg.headCls}`}>● {colDef?.label ?? colId}</span>
          </div>
          <p className="text-xs font-black text-stone-900 dark:text-white leading-snug">{report.title || '(제목 없음)'}</p>
          {report.authorName && (
            <p className="text-[10px] text-stone-400 mt-0.5">{report.authorName} · {fmtDate(report.updatedAt)}</p>
          )}
          {preview && (
            <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5 line-clamp-2 leading-snug">{preview}</p>
          )}
        </div>

        {!showAdd ? (
          <div className="p-2 space-y-0.5">
            <button
              onClick={onView}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
            >
              <FileText size={13} className="text-stone-400 shrink-0" /> 보고서 확인
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
            >
              <Plus size={13} className="text-stone-400 shrink-0" /> 보고서 추가
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            <p className="text-[10px] text-stone-400 px-3 py-1.5">어디에 추가할까요?</p>
            <button
              onClick={onAddSibling}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
            >
              <span className="text-base font-bold text-blue-500 shrink-0 w-5 text-center">↔</span>
              <div>
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200">추가 보고서</p>
                <p className="text-[10px] text-stone-400">같은 단계 (형제)</p>
              </div>
            </button>
            <button
              onClick={onAddChild}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-left"
            >
              <span className="text-base font-bold text-emerald-500 shrink-0 w-5 text-center">↓</span>
              <div>
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200">다음 보고서</p>
                <p className="text-[10px] text-stone-400">하위 단계</p>
              </div>
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="w-full px-3 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-sm transition-colors text-left"
            >
              ← 뒤로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 문서 연결 피커 ────────────────────────────────────────
function DocLinkPickerModal({
  existingIds, onLink, onClose,
}: {
  existingIds: string[];
  onLink: (reportId: string) => void;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<{ id: string; title: string; author: string; date: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(salesDb, 'reports'), orderBy('updatedAt', 'desc')));
        setDocs(snap.docs
          .filter(d => { const r = d.data(); return !existingIds.includes(d.id) && !r.projectId; })
          .map(d => { const r = d.data(); return { id: d.id, title: r.title || '(제목없음)', author: r.authorName || '', date: r.updatedAt?.slice(0, 10) || '' }; })
        );
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = docs.filter(d =>
    !search.trim() || d.title.includes(search) || d.author.includes(search)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-lg border border-stone-200 dark:border-stone-700 flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
          <h2 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
            <Link size={14} /> 기존 보고서 연결
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-2.5 py-1.5">
            <Search size={12} className="text-stone-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="제목·작성자 검색..."
              className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
              autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-stone-400">
              {search ? '검색 결과 없음' : '연결할 보고서가 없습니다'}
            </div>
          ) : filtered.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/50">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">{d.title}</p>
                <p className="text-[10px] text-stone-400">{d.author} · {d.date}</p>
              </div>
              <button
                onClick={() => {
                  setDocs(prev => prev.filter(x => x.id !== d.id));
                  onLink(d.id);
                }}
                className="shrink-0 px-3 py-1.5 text-[11px] font-bold bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-sm hover:bg-stone-600 transition-colors"
              >
                연결
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 진행률 수동 설정 ──────────────────────────────────────
function ProgressPicker({
  value, onChange, compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const [hovering, setHovering] = useState<number | null>(null);
  const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const display = hovering ?? value;

  const colorCls = (step: number) => {
    if (display >= step) {
      if (display === 100) return 'bg-blue-500';
      if (display >= 70) return 'bg-emerald-500';
      if (display >= 40) return 'bg-amber-400';
      return 'bg-stone-400';
    }
    return 'bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600';
  };

  const segW = compact ? 'w-4 h-2.5' : 'w-6 h-3.5';

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" onMouseLeave={() => setHovering(null)}>
        {steps.map(s => (
          <button
            key={s}
            onClick={() => onChange(value === s ? 0 : s)}
            onMouseEnter={() => setHovering(s)}
            className={`${segW} rounded-sm transition-colors cursor-pointer ${colorCls(s)}`}
            title={`${s}%`}
          />
        ))}
      </div>
      <span className={`font-bold tabular-nums ${compact ? 'text-[10px] text-stone-500 dark:text-stone-400 w-6' : 'text-xs text-stone-600 dark:text-stone-300 w-8'}`}>
        {display}%
      </span>
    </div>
  );
}

// ── 폴더 생성/수정 폼 ─────────────────────────────────────
function FolderFormModal({
  folder, onSave, onClose,
}: {
  folder?: ProjectFolder;
  onSave: (data: Omit<ProjectFolder, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [description, setDescription] = useState(folder?.description ?? '');
  const [color, setColor] = useState<KanbanColumnColor>(folder?.color ?? 'stone');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-sm border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
            <Folder size={14} /> {folder ? '폴더 수정' : '새 폴더'}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">폴더명 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 2026년 마케팅" autoFocus
              onKeyDown={e => e.key === 'Enter' && name.trim() && onSave({ name: name.trim(), description: description.trim() || undefined, color })}
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">설명</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="간략한 설명 (선택)"
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-2">색상</label>
            <div className="flex gap-2">
              {COLOR_ORDER.map(c => (
                <button key={c} onClick={() => setColor(c as KanbanColumnColor)}
                  className={`w-6 h-6 rounded-full ${COLOR_CFG[c].dotCls} transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-stone-500' : ''}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button onClick={() => name.trim() && onSave({ name: name.trim(), description: description.trim() || undefined, color })}
            disabled={!name.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {folder ? '저장' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 폴더 카드 ─────────────────────────────────────────────
function FolderCard({
  folder, projectCount, isFirst, isLast, onOpen, onEdit, onDelete, onMoveUp, onMoveDown,
}: {
  folder: ProjectFolder;
  projectCount: number;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cfg = COLOR_CFG[folder.color] ?? COLOR_CFG.stone;

  return (
    <div className={`bg-white dark:bg-stone-900 border-2 ${cfg.cardBorderCls} rounded-sm hover:shadow-md transition-all group`}>
      <div onClick={onOpen} className="p-4 cursor-pointer">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-sm ${cfg.bgCls} flex items-center justify-center shrink-0`}>
            <Folder size={18} className={cfg.headCls} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-stone-900 dark:text-white leading-snug truncate group-hover:text-stone-700 dark:group-hover:text-stone-200">
              {folder.name}
            </h3>
            {folder.description && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">{folder.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-400">
          <FolderKanban size={11} />
          <span>{projectCount}개 프로젝트</span>
        </div>
      </div>
      <div className="px-4 pb-3 pt-1 border-t border-stone-100 dark:border-stone-800/50 flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}
          className="p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 rounded-sm transition-colors">
          <ChevronUp size={12} />
        </button>
        <button onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}
          className="p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 rounded-sm transition-colors">
          <ChevronDown size={12} />
        </button>
        <div className="flex-1" />
        <button onClick={e => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
          <Edit2 size={12} />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-stone-300 dark:text-stone-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── 프로젝트 생성/수정 폼 ─────────────────────────────────
function ProjectFormModal({
  project, employees, currentUser, folders, defaultFolderId,
  initialTitle, initialDescription, onSave, onClose,
}: {
  project?: Project;
  employees: Employee[];
  currentUser: User;
  folders: ProjectFolder[];
  defaultFolderId?: string;
  initialTitle?: string;
  initialDescription?: string;
  onSave: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project?.title ?? initialTitle ?? '');
  const [description, setDescription] = useState(project?.description ?? initialDescription ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [endDate, setEndDate] = useState(project?.endDate ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? []);
  const [folderId, setFolderId] = useState<string>(project?.folderId ?? defaultFolderId ?? '');

  const toggleMember = (emp: Employee) =>
    setMemberIds(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const memberNames = employees.filter(e => memberIds.includes(e.id)).map(e => e.name);
    onSave(scrub({
      title: title.trim(), description: description.trim() || undefined,
      status, ownerId: currentUser.uid, ownerName: currentUser.name,
      memberIds, memberNames, startDate: startDate || undefined, endDate: endDate || undefined,
      milestones: project?.milestones ?? [],
      folderId: folderId || undefined,
      folderOrder: project?.folderOrder,
    }) as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-lg border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">{project ? '프로젝트 수정' : '새 프로젝트'}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">제목 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="프로젝트 제목" autoFocus
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">설명</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none resize-none" />
          </div>
          {/* 폴더 선택 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">폴더</label>
            <select value={folderId} onChange={e => setFolderId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
              <option value="">미분류</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">상태</label>
              <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                <option value="active">진행중</option>
                <option value="on_hold">보류</option>
                <option value="completed">완료</option>
                <option value="archived">아카이브</option>
              </select>
            </div>
            <div />
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">마감일</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
            </div>
          </div>
          {employees.length > 0 && (
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-2">멤버</label>
              <div className="border border-stone-200 dark:border-stone-700 rounded-sm max-h-36 overflow-y-auto">
                {employees.map(emp => (
                  <button key={emp.id} type="button" onClick={() => toggleMember(emp)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${memberIds.includes(emp.id) ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white font-bold' : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                    <span className={`w-4 h-4 border rounded-sm flex items-center justify-center shrink-0 ${memberIds.includes(emp.id) ? 'bg-stone-800 dark:bg-stone-300 border-stone-800' : 'border-stone-300 dark:border-stone-600'}`}>
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
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button onClick={handleSubmit} disabled={!title.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {project ? '저장' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 간트 업무 추가/수정 모달 ──────────────────────────────
function GanttTaskModal({
  task, projectId, onSaved, onClose,
}: {
  task?: ProjectItem;
  projectId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [title,        setTitle]        = useState(task?.title ?? '');
  const [date,         setDate]         = useState(task?.dueDate ?? todayStr);
  const [assigneeName, setAssigneeName] = useState(task?.assigneeName ?? '');
  const [assigneeDept, setAssigneeDept] = useState(task?.assigneeDept ?? '');
  const [memo,         setMemo]         = useState(task?.memo ?? '');
  const [done,         setDone]         = useState(task?.done ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error('업무명을 입력하세요'); return; }
    setSaving(true);
    try {
      const id  = task?.id ?? `gtask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      const data: Record<string, unknown> = {
        id, projectId, kind: 'task',
        title: title.trim(),
        column: 'todo', order: task?.order ?? Date.now(), priority: 'normal',
        dueDate: date,
        done,
        createdAt: task?.createdAt ?? now,
        updatedAt: now,
      };
      if (assigneeName.trim()) data.assigneeName = assigneeName.trim();
      if (assigneeDept.trim()) data.assigneeDept = assigneeDept.trim();
      if (memo.trim())         data.memo         = memo.trim();
      await setDoc(doc(salesDb, 'project_items', id), data);
      toast.success(task ? '수정됨' : '업무 추가됨');
      onSaved();
      onClose();
    } catch { toast.error('저장 실패'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await deleteDoc(doc(salesDb, 'project_items', task.id));
      toast.success('삭제됨');
      onSaved();
      onClose();
    } catch { toast.error('삭제 실패'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 outline-none focus:border-stone-400 dark:focus:border-stone-500 text-stone-900 dark:text-stone-100';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl w-full max-w-sm border border-stone-200 dark:border-stone-700 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
          <h3 className="text-sm font-black text-stone-900 dark:text-white">{task ? '업무 수정' : '업무 추가'}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"><X size={16} /></button>
        </div>
        {/* 폼 */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">업무명 *</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="업무 내용" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">담당자</label>
              <input value={assigneeName} onChange={e => setAssigneeName(e.target.value)}
                placeholder="이름" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">담당부서</label>
              <input value={assigneeDept} onChange={e => setAssigneeDept(e.target.value)}
                placeholder="부서명" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="간략한 내용" rows={2}
              className={`${inputCls} resize-none`} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded" />
            <span className="text-sm text-stone-600 dark:text-stone-300">완료됨</span>
          </label>
        </div>
        {/* 하단 버튼 */}
        <div className="px-5 pb-4 flex items-center gap-2">
          {task && (
            <button onClick={handleDelete} disabled={saving}
              className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
              <Trash2 size={15} />
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors">
            취소
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-40">
            {saving ? '저장중…' : task ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 간트차트 오늘 선 ──────────────────────────────────────
function TodayLine({ pct }: { pct: number }) {
  if (pct < 0 || pct > 100) return null;
  return (
    <div
      className="absolute inset-y-0 w-px bg-red-400/50 dark:bg-red-500/40 pointer-events-none z-10"
      style={{ left: `${pct}%` }}
    />
  );
}

// ── 프로젝트 간트차트 ──────────────────────────────────────
function ProjectGanttView({
  project, docs, columns, tasks, onEditProject, onOpenDoc, onAddTask, onEditTask,
}: {
  project: Project;
  docs: Report[];
  columns: KanbanColumnDef[];
  tasks: ProjectItem[];
  onEditProject: () => void;
  onOpenDoc: (r: Report) => void;
  onAddTask: () => void;
  onEditTask: (t: ProjectItem) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // 날짜 범위 계산 (업무 날짜 포함)
  const allDates: Date[] = [
    ...(project.milestones ?? []).map(m => new Date(m.dueDate)),
    ...docs.map(d => new Date(d.docDate || d.createdAt)),
    ...tasks.map(t => new Date(t.dueDate || t.createdAt.slice(0, 10))),
  ].filter(d => !isNaN(d.getTime()));

  let rStart: Date, rEnd: Date;
  if (project.startDate && project.endDate) {
    rStart = new Date(project.startDate);
    rEnd   = new Date(project.endDate);
  } else if (allDates.length > 0) {
    const ms = allDates.map(d => d.getTime());
    rStart = new Date(Math.min(...ms) - 7 * 86400000);
    rEnd   = new Date(Math.max(...ms) + 14 * 86400000);
  } else {
    rStart = new Date(today.getTime() - 14 * 86400000);
    rEnd   = new Date(today.getTime() + 46 * 86400000);
  }
  // 오늘이 항상 범위 안에 포함
  if (today < rStart) rStart = new Date(today.getTime() - 7 * 86400000);
  if (today > rEnd)   rEnd   = new Date(today.getTime() + 14 * 86400000);

  const totalMs = rEnd.getTime() - rStart.getTime();
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, (d.getTime() - rStart.getTime()) / totalMs * 100));
  const todayPct = pct(today);

  // 월 레이블
  const months: { label: string; p: number }[] = [];
  const mc = new Date(rStart.getFullYear(), rStart.getMonth(), 1);
  while (mc <= rEnd) {
    const p = pct(mc);
    if (p <= 100) months.push({ label: `${mc.getMonth() + 1}월`, p });
    mc.setMonth(mc.getMonth() + 1);
  }

  // 각 섹션 날짜 오름차순 정렬
  const milestones = [...(project.milestones ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sortedDocs = [...docs].sort((a, b) => (a.docDate || a.createdAt).localeCompare(b.docDate || b.createdAt));
  const sortedTasks = [...tasks].sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt));

  const LABEL = 'w-28 shrink-0 text-[11px] pr-2 truncate';
  const ROW   = 'flex items-center h-9 border-b border-stone-100 dark:border-stone-800/60';

  return (
    <div className="text-xs">
      {/* 날짜 미설정 안내 */}
      {(!project.startDate || !project.endDate) && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm">
          <span className="text-[11px] text-amber-700 dark:text-amber-400 flex-1">
            프로젝트 시작일·종료일을 설정하면 전체 기간 바가 표시됩니다.
          </span>
          <button onClick={onEditProject} className="text-[11px] font-bold text-amber-600 hover:underline shrink-0">
            설정
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[440px]">

          {/* 월 레이블 헤더 */}
          <div className="flex mb-0.5">
            <div className="w-28 shrink-0" />
            <div className="flex-1 relative h-6 border-b border-stone-200 dark:border-stone-700">
              <span
                className="absolute text-[9px] font-bold text-red-400 dark:text-red-500 -translate-x-1/2"
                style={{ left: `${todayPct}%` }}
              >
                오늘
              </span>
              {months.map((m, i) => (
                <span
                  key={i}
                  className="absolute bottom-0.5 text-[10px] font-bold text-stone-400"
                  style={{ left: `${m.p}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* 프로젝트 전체 기간 */}
          {project.startDate && project.endDate && (() => {
            const sp = pct(new Date(project.startDate));
            const ep = pct(new Date(project.endDate));
            return (
              <div className={ROW}>
                <span className={`${LABEL} font-bold text-stone-700 dark:text-stone-200`}>전체 기간</span>
                <div className="flex-1 relative h-full">
                  <TodayLine pct={todayPct} />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-4 bg-blue-500/70 dark:bg-blue-400/60 rounded-sm"
                    style={{ left: `${sp}%`, width: `${Math.max(ep - sp, 0.5)}%` }}
                  />
                  <span className="absolute text-[9px] text-blue-500 dark:text-blue-400 top-1" style={{ left: `${sp}%` }}>
                    {fmtDate(project.startDate)}
                  </span>
                  <span className="absolute text-[9px] text-blue-500 dark:text-blue-400 top-1 -translate-x-full" style={{ left: `${ep}%` }}>
                    {fmtDate(project.endDate)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 마일스톤 */}
          {milestones.length > 0 && (
            <>
              <div className="flex items-center h-5 mt-1.5">
                <span className="w-28 shrink-0 text-[9px] font-black text-stone-400 uppercase tracking-wider">마일스톤</span>
                <div className="flex-1 border-t border-dashed border-stone-200 dark:border-stone-700" />
              </div>
              {milestones.map(m => {
                const mp = pct(new Date(m.dueDate));
                return (
                  <div key={m.id} className={ROW}>
                    <span className={`${LABEL} ${m.done ? 'line-through text-stone-400' : 'text-stone-600 dark:text-stone-300'}`}>
                      {m.title}
                    </span>
                    <div className="flex-1 relative h-full">
                      <TodayLine pct={todayPct} />
                      {/* 다이아몬드 마커 */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${m.done ? 'bg-emerald-500' : 'bg-amber-400'}`}
                        style={{ left: `${mp}%` }}
                      />
                      <span
                        className={`absolute text-[9px] -translate-x-1/2 ${m.done ? 'text-emerald-500' : 'text-amber-500'}`}
                        style={{ left: `${mp}%`, top: '22px' }}
                      >
                        {fmtDate(m.dueDate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 보고서 */}
          {sortedDocs.length > 0 && (
            <>
              <div className="flex items-center h-5 mt-1.5">
                <span className="w-28 shrink-0 text-[9px] font-black text-stone-400 uppercase tracking-wider">보고서</span>
                <div className="flex-1 border-t border-dashed border-stone-200 dark:border-stone-700" />
              </div>
              {sortedDocs.map(d => {
                const dateStr = d.docDate || d.createdAt;
                const dp = pct(new Date(dateStr));
                const colDef = columns.find(c => c.id === (d.kanbanColumn ?? columns[0]?.id));
                const dotCls = COLOR_CFG[colDef?.color ?? 'stone']?.dotCls ?? 'bg-stone-400';
                return (
                  <div key={d.id} className={ROW}>
                    <button
                      onClick={() => onOpenDoc(d)}
                      className={`${LABEL} text-left text-stone-600 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors`}
                    >
                      {d.title || '(제목 없음)'}
                    </button>
                    <div className="flex-1 relative h-full">
                      <TodayLine pct={todayPct} />
                      <button
                        onClick={() => onOpenDoc(d)}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${dotCls} hover:scale-150 hover:ring-2 hover:ring-offset-1 hover:ring-stone-400 transition-all border-2 border-white dark:border-stone-900`}
                        style={{ left: `${dp}%` }}
                        title={`${d.title || '(제목 없음)'} · ${fmtDate(dateStr)}`}
                      />
                      <span className="absolute text-[8px] text-stone-400 -translate-x-1/2" style={{ left: `${dp}%`, top: '24px' }}>
                        {fmtDate(dateStr)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 업무 섹션 */}
          <div className="flex items-center h-5 mt-1.5">
            <span className="w-28 shrink-0 text-[9px] font-black text-stone-400 uppercase tracking-wider">업무</span>
            <div className="flex-1 border-t border-dashed border-stone-200 dark:border-stone-700" />
            <button
              onClick={onAddTask}
              className="ml-2 shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            >
              <Plus size={10} /> 추가
            </button>
          </div>
          {sortedTasks.map(t => {
            const dateStr = t.dueDate || t.createdAt.slice(0, 10);
            const tp = pct(new Date(dateStr));
            return (
              <div key={t.id} className={ROW}>
                <button
                  onClick={() => onEditTask(t)}
                  className={`${LABEL} text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${t.done ? 'line-through text-stone-400' : 'text-stone-600 dark:text-stone-300'}`}
                >
                  <span className="block truncate">{t.title}</span>
                  {(t.assigneeName || t.assigneeDept) && (
                    <span className="text-[9px] text-stone-400 block leading-none mt-0.5">
                      {[t.assigneeName, t.assigneeDept].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
                <div className="flex-1 relative h-full">
                  <TodayLine pct={todayPct} />
                  {/* 사각형 마커 */}
                  <button
                    onClick={() => onEditTask(t)}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 ${t.done ? 'bg-emerald-500' : 'bg-stone-400 dark:bg-stone-500'} hover:scale-150 transition-all`}
                    style={{ left: `${tp}%` }}
                    title={[t.title, t.assigneeName, t.memo].filter(Boolean).join(' · ')}
                  />
                  <span className="absolute text-[8px] text-stone-400 -translate-x-1/2" style={{ left: `${tp}%`, top: '24px' }}>
                    {fmtDate(dateStr)}
                  </span>
                </div>
              </div>
            );
          })}
          {sortedTasks.length === 0 && (
            <div className={`${ROW} border-b-0`}>
              <div className="w-28 shrink-0" />
              <button onClick={onAddTask} className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors py-1">
                <Plus size={11} /> 업무 추가
              </button>
            </div>
          )}

          {/* 빈 상태 */}
          {milestones.length === 0 && sortedDocs.length === 0 && sortedTasks.length === 0 && (
            <div className="py-12 text-center text-stone-400">
              마일스톤, 보고서, 업무를 추가하면 여기에 표시됩니다.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── 마인드맵 ──────────────────────────────────────────────
function MindMapTreeNode({
  node, nodes, depth, editingId, selectedId, linkPickerId,
  docs, onSelect, onStartEdit, onUpdateText, onStopEdit,
  onAddSibling, onAddChild, onDelete,
  onLinkReport, onUnlinkReport, onOpenDoc, onToggleLinkPicker,
}: {
  node: MindMapNode;
  nodes: MindMapNode[];
  depth: number;
  editingId: string | null;
  selectedId: string | null;
  linkPickerId: string | null;
  docs: Report[];
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onStopEdit: () => void;
  onAddSibling: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onLinkReport: (nodeId: string, reportId: string) => void;
  onUnlinkReport: (nodeId: string) => void;
  onOpenDoc: (r: Report) => void;
  onToggleLinkPicker: (id: string | null) => void;
}) {
  const children = nodes.filter(n => n.parentId === node.id).sort((a, b) => a.order - b.order);
  const isEditing = editingId === node.id;
  const isSelected = selectedId === node.id;
  const isRoot = node.parentId === null;
  const linkedReport = node.reportId ? docs.find(d => d.id === node.reportId) : undefined;
  const isLinkPickerOpen = linkPickerId === node.id;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      try { inputRef.current.select(); } catch {}
    }
  }, [isEditing]);

  const depthCls = [
    'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-sm px-4 py-2',
    'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-bold text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700',
    'bg-stone-50 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 text-xs px-2.5 py-1 border border-stone-100 dark:border-stone-700/60',
    'bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 text-[11px] px-2 py-1 border border-stone-100 dark:border-stone-800',
  ][Math.min(depth, 3)];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isRoot) onAddChild(node.id); else onAddSibling(node.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onAddChild(node.id);
    } else if (e.key === 'Escape') {
      onStopEdit();
    } else if (e.key === 'Backspace' && !isRoot && (node.text ?? '') === '') {
      e.preventDefault();
      onDelete(node.id);
    }
  };

  return (
    <div className="flex items-center">
      {/* 노드 박스 + 링크 피커 */}
      <div className="relative shrink-0">
        <div
          className={`${depthCls} rounded-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isSelected && !isEditing ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-stone-900' : ''} transition-all`}
          onClick={e => { e.stopPropagation(); onSelect(node.id); }}
          onDoubleClick={e => { e.stopPropagation(); onStartEdit(node.id); }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              value={node.text ?? ''}
              onChange={e => onUpdateText(node.id, e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent outline-none"
              size={Math.max((node.text?.length ?? 0) + 2, 5)}
            />
          ) : (
            <span>{node.text || <em className="opacity-30 text-[10px] not-italic">입력...</em>}</span>
          )}
          {linkedReport && !isEditing && (
            <span className="text-[9px] opacity-60 flex items-center gap-0.5 max-w-[70px] truncate shrink-0 ml-1">
              <FileText size={8} />{linkedReport.title?.slice(0, 8) || '(무제)'}
            </span>
          )}
          {(isSelected || isLinkPickerOpen) && !isEditing && (
            <button
              onClick={e => { e.stopPropagation(); onToggleLinkPicker(isLinkPickerOpen ? null : node.id); }}
              className={`opacity-60 hover:opacity-100 transition-opacity ${linkedReport ? 'text-blue-400' : ''}`}
              title="보고서 연결"
            ><Link size={9} /></button>
          )}
        </div>
        {/* 보고서 연결 드롭다운 */}
        {isLinkPickerOpen && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm shadow-xl min-w-[160px] max-h-48 overflow-y-auto">
            {linkedReport ? (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-700 truncate">{linkedReport.title || '(제목 없음)'}</div>
                <button onClick={e => { e.stopPropagation(); onOpenDoc(linkedReport); onToggleLinkPicker(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50 dark:hover:bg-stone-700/50 flex items-center gap-1.5 text-stone-700 dark:text-stone-300"><FileText size={11} />보고서 열기</button>
                <button onClick={e => { e.stopPropagation(); onUnlinkReport(node.id); onToggleLinkPicker(null); }} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5"><X size={11} />연결 해제</button>
              </>
            ) : docs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">연결할 보고서가 없습니다</div>
            ) : (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-700">보고서 선택</div>
                {docs.map(d => (
                  <button key={d.id} onClick={e => { e.stopPropagation(); onLinkReport(node.id, d.id); onToggleLinkPicker(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50 dark:hover:bg-stone-700/50 truncate flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                    <FileText size={11} className="shrink-0 text-stone-400 dark:text-stone-500" />{d.title || '(제목 없음)'}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 하위 가지 */}
      {children.length > 0 && (
        <div className="flex items-center shrink-0">
          <div className="w-5 h-[2px] bg-stone-400 dark:bg-stone-500 shrink-0" />
          <div className="relative">
            {children.map((child, i) => {
              const isFirst = i === 0;
              const isLast = i === children.length - 1;
              const isOnly = children.length === 1;
              return (
              <div key={child.id} className="flex items-center py-1.5 pl-4 relative">
                {/* 세로선: 첫 행은 중앙~하단, 마지막 행은 상단~중앙, 중간은 전체 */}
                {!isOnly && (
                  <div className={`absolute left-0 w-[2px] bg-stone-400 dark:bg-stone-500 ${
                    isFirst ? 'top-1/2 bottom-0' : isLast ? 'top-0 bottom-1/2' : 'inset-y-0'
                  }`} />
                )}
                {/* 가로선 */}
                <div className="absolute left-0 top-1/2 w-4 h-[2px] bg-stone-400 dark:bg-stone-500 -translate-y-px" />
                <MindMapTreeNode
                  node={child} nodes={nodes} depth={depth + 1}
                  editingId={editingId} selectedId={selectedId} linkPickerId={linkPickerId}
                  docs={docs}
                  onSelect={onSelect} onStartEdit={onStartEdit}
                  onUpdateText={onUpdateText} onStopEdit={onStopEdit}
                  onAddSibling={onAddSibling} onAddChild={onAddChild} onDelete={onDelete}
                  onLinkReport={onLinkReport} onUnlinkReport={onUnlinkReport}
                  onOpenDoc={onOpenDoc} onToggleLinkPicker={onToggleLinkPicker}
                />
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectMindMap({ projectId, projectTitle, docs, onOpenDoc }: {
  projectId: string;
  projectTitle: string;
  docs: Report[];
  onOpenDoc: (r: Report) => void;
}) {
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkPickerId, setLinkPickerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const skipBlurRef = useRef(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { confirm } = useConfirm();

  const handlePrint = () => {
    if (!printRef.current) return;
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(el => `<link rel="stylesheet" href="${(el as HTMLLinkElement).href}">`)
      .join('');
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) return;
    const printDate = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    win.document.write(`<!DOCTYPE html>
<html class="${document.documentElement.className}">
<head>
  <meta charset="UTF-8">
  <title>${projectTitle} — 마인드맵</title>
  ${styleLinks}
  <style>
    body { padding: 32px; background: white; }
    .no-print { display: none !important; }
    @media print {
      @page { margin: 15mm; size: A4 landscape; }
      body { padding: 0; }
      * { overflow: visible !important; }
    }
  </style>
</head>
<body class="${document.body.className}">
  <div style="margin-bottom:20px;">
    <div style="font-size:18px;font-weight:900;margin-bottom:4px;">${projectTitle} — 마인드맵</div>
    <div style="font-size:11px;color:#888;">인쇄일: ${printDate}</div>
    <hr style="margin-top:12px;border:none;border-top:2px solid #222;">
  </div>
  ${printRef.current.innerHTML}
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 600);
  };

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(salesDb, 'project_mindmaps', projectId));
        if (snap.exists()) {
          setNodes((snap.data().nodes as MindMapNode[]) ?? []);
        } else {
          setNodes([{ id: 'root', text: '프로젝트', parentId: null, order: 0 }]);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [projectId]);

  const saveNodes = (newNodes: MindMapNode[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const cleaned = newNodes.map(n => {
          const o: Record<string, unknown> = { id: n.id, text: n.text ?? '', parentId: n.parentId, order: n.order };
          if (n.reportId) o.reportId = n.reportId;
          return o;
        });
        await setDoc(doc(salesDb, 'project_mindmaps', projectId), { projectId, nodes: cleaned, updatedAt: ts() });
      } catch {}
    }, 800);
  };

  const handleAddSibling = (id: string) => {
    skipBlurRef.current = true;
    setTimeout(() => { skipBlurRef.current = false; }, 0);
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    if (node.parentId === null) {
      const maxOrder = nodes.filter(n => n.parentId === id).reduce((m, n) => Math.max(m, n.order), -1);
      const newNode: MindMapNode = { id: mmId(), text: '', parentId: id, order: maxOrder + 1 };
      const next = [...nodes, newNode];
      setNodes(next); saveNodes(next);
      setEditingId(newNode.id); setSelectedId(newNode.id);
      return;
    }
    const newOrder = node.order + 1;
    const shifted = nodes.map(n =>
      n.parentId === node.parentId && n.id !== id && n.order >= newOrder ? { ...n, order: n.order + 1 } : n
    );
    const newNode: MindMapNode = { id: mmId(), text: '', parentId: node.parentId, order: newOrder };
    const next = [...shifted, newNode];
    setNodes(next); saveNodes(next);
    setEditingId(newNode.id); setSelectedId(newNode.id);
  };

  const handleAddChild = (id: string) => {
    skipBlurRef.current = true;
    setTimeout(() => { skipBlurRef.current = false; }, 0);
    const maxOrder = nodes.filter(n => n.parentId === id).reduce((m, n) => Math.max(m, n.order), -1);
    const newNode: MindMapNode = { id: mmId(), text: '', parentId: id, order: maxOrder + 1 };
    const next = [...nodes, newNode];
    setNodes(next); saveNodes(next);
    setEditingId(newNode.id); setSelectedId(newNode.id);
  };

  const handleDelete = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node || node.parentId === null) return;
    const hasChildren = nodes.some(n => n.parentId === id);
    if (hasChildren) {
      const ok = await confirm({ title: '노드 삭제', message: '이 노드와 모든 하위 노드를 삭제할까요?', confirmLabel: '삭제', variant: 'danger' });
      if (!ok) return;
    }
    const toDelete = new Set<string>();
    const addDesc = (nid: string) => { toDelete.add(nid); nodes.filter(n => n.parentId === nid).forEach(c => addDesc(c.id)); };
    addDesc(id);
    const next = nodes.filter(n => !toDelete.has(n.id));
    setNodes(next); saveNodes(next);
    setSelectedId(node.parentId); setEditingId(null);
  };

  const handleUpdateText = (id: string, text: string) => {
    const next = nodes.map(n => n.id === id ? { ...n, text } : n);
    setNodes(next); saveNodes(next);
  };

  const handleLinkReport = (nodeId: string, reportId: string) => {
    const next = nodes.map(n => n.id === nodeId ? { ...n, reportId } : n);
    setNodes(next); saveNodes(next);
  };

  const handleUnlinkReport = (nodeId: string) => {
    const next = nodes.map(n => {
      if (n.id !== nodeId) return n;
      const { reportId: _r, ...rest } = n;
      return rest as MindMapNode;
    });
    setNodes(next); saveNodes(next);
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (editingId) return;
    if (!selectedId) return;
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault(); setEditingId(selectedId);
    } else if (e.key === 'Tab') {
      e.preventDefault(); handleAddChild(selectedId);
    } else if (e.key === 'Delete') {
      const node = nodes.find(n => n.id === selectedId);
      if (node && node.parentId !== null) { e.preventDefault(); handleDelete(selectedId); }
    }
  };

  const rootNode = nodes.find(n => n.parentId === null);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-5 h-5 border-2 border-stone-300 dark:border-stone-600 border-t-stone-800 dark:border-t-stone-200 rounded-full animate-spin" />
    </div>
  );

  return (
    <div
      tabIndex={0}
      className="outline-none"
      onKeyDown={handleContainerKeyDown}
      onBlur={e => {
        if (skipBlurRef.current) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setEditingId(null); setLinkPickerId(null);
        }
      }}
      onClick={e => {
        if (e.target === e.currentTarget) {
          setSelectedId(null); setEditingId(null); setLinkPickerId(null);
        }
      }}
    >
      <div className="no-print flex items-center justify-between mb-4">
        <div className="text-[10px] text-stone-400 dark:text-stone-600 flex items-center gap-3 flex-wrap">
          <span>더블클릭: 편집</span>
          <span>Enter: 형제 추가</span>
          <span>Tab: 하위 추가</span>
          <span>Del: 노드 삭제</span>
          <span className="text-blue-400 dark:text-blue-500">🔗: 보고서 연결</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
          ><Printer size={10} />인쇄</button>
          <button
            onClick={() => { const r = nodes.find(n => n.parentId === null); if (r) handleAddChild(r.id); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold border border-dashed border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:border-stone-400 dark:hover:border-stone-500 rounded-sm transition-colors"
          ><Plus size={10} />주제 추가</button>
        </div>
      </div>
      <div className="overflow-x-auto pb-4">
        {rootNode && (
          <div ref={printRef} className="pl-2 py-4 inline-block min-w-full">
            <MindMapTreeNode
              node={rootNode} nodes={nodes} depth={0}
              editingId={editingId} selectedId={selectedId} linkPickerId={linkPickerId}
              docs={docs}
              onSelect={setSelectedId}
              onStartEdit={id => { setSelectedId(id); setEditingId(id); }}
              onUpdateText={handleUpdateText}
              onStopEdit={() => setEditingId(null)}
              onAddSibling={handleAddSibling}
              onAddChild={handleAddChild}
              onDelete={handleDelete}
              onLinkReport={handleLinkReport}
              onUnlinkReport={handleUnlinkReport}
              onOpenDoc={onOpenDoc}
              onToggleLinkPicker={setLinkPickerId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 프로젝트 상세 ─────────────────────────────────────────
function ProjectDetail({
  project, docs, employees, folders, currentUser, onBack,
  onUpdateProject, onDeleteProject, onDocsChange, onProgressChange,
}: {
  project: Project;
  docs: Report[];
  employees: Employee[];
  folders: ProjectFolder[];
  currentUser: User;
  onBack: () => void;
  onUpdateProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onDocsChange: () => void;
  onProgressChange: (v: number) => void;
}) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'mindmap' | 'kanban' | 'gantt'>('mindmap');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  // 보고서 팝업 모달 상태
  const [reportModal, setReportModal] = useState<{
    openNew?: boolean; focusReportId?: string; parentId?: string;
  } | null>(null);

  // 동적 칸반 컬럼 상태
  const [localCols, setLocalCols] = useState<KanbanColumnDef[]>(
    () => project.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS
  );

  // 프로젝트 변경 시 컬럼 초기화
  useEffect(() => {
    setLocalCols(project.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 간트 업무
  const [ganttTasks, setGanttTasks] = useState<ProjectItem[]>([]);
  const [taskModal, setTaskModal] = useState<{ task?: ProjectItem } | null>(null);

  const loadGanttTasks = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(salesDb, 'project_items'),
          where('projectId', '==', project.id),
          where('kind', '==', 'task'))
      );
      setGanttTasks(snap.docs.map(d => ({ ...d.data() } as ProjectItem))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')));
    } catch {}
  }, [project.id]);

  useEffect(() => { loadGanttTasks(); }, [loadGanttTasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));


  // 컬럼 설정 저장 (Firestore + 로컬 상태)
  const saveColumns = useCallback(async (newCols: KanbanColumnDef[]) => {
    setLocalCols(newCols);
    try {
      await updateDoc(doc(salesDb, 'projects', project.id), { kanbanColumns: newCols });
    } catch { toast.error('컬럼 저장 실패'); }
  }, [project.id, toast]);

  const handleAddColumn = () => {
    const nextColor = COLOR_ORDER[localCols.length % COLOR_ORDER.length] as KanbanColumnColor;
    saveColumns([...localCols, { id: `col_${Date.now()}`, label: '새 컬럼', color: nextColor }]);
  };

  const handleDeleteColumn = async (colId: string) => {
    if (localCols.length <= 1) { toast.error('컬럼은 1개 이상 필요합니다'); return; }
    const newCols = localCols.filter(c => c.id !== colId);
    const fallbackId = newCols[0].id;
    const orphaned = docs.filter(d => (d.kanbanColumn ?? localCols[0].id) === colId);
    if (orphaned.length > 0) {
      await Promise.all(orphaned.map(d =>
        updateDoc(doc(salesDb, 'reports', d.id), { kanbanColumn: fallbackId, updatedAt: ts() })
      ));
      onDocsChange();
    }
    saveColumns(newCols);
  };

  const handleRenameColumn = (colId: string, label: string) => {
    saveColumns(localCols.map(c => c.id === colId ? { ...c, label } : c));
  };

  const handleColorColumn = (colId: string, color: KanbanColumnColor) => {
    saveColumns(localCols.map(c => c.id === colId ? { ...c, color } : c));
  };

  const handleMoveColumn = (colId: string, dir: 'left' | 'right') => {
    const idx = localCols.findIndex(c => c.id === colId);
    if (idx < 0) return;
    const newIdx = dir === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= localCols.length) return;
    const newCols = [...localCols];
    [newCols[idx], newCols[newIdx]] = [newCols[newIdx], newCols[idx]];
    saveColumns(newCols);
  };

  const handleCardStatusChange = useCallback(async (reportId: string, colId: string) => {
    try {
      await updateDoc(doc(salesDb, 'reports', reportId), { kanbanColumn: colId, updatedAt: ts() });
      onDocsChange();
    } catch { toast.error('상태 변경 실패'); }
  }, [onDocsChange, toast]);

  const openReport = (report: Report) => {
    setReportModal({ focusReportId: report.id });
  };

  const openNewReport = (parentReportId?: string) => {
    setReportModal({ openNew: true, parentId: parentReportId });
  };

  const handleUnlink = async (report: Report) => {
    const ok = await confirm({
      title: '프로젝트에서 제거',
      message: `"${report.title || '(제목 없음)'}"을 이 프로젝트에서 제거할까요?\n보고서 원본은 결재보고센터에 유지됩니다.`,
      confirmLabel: '제거',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await updateDoc(doc(salesDb, 'reports', report.id), {
        projectId: deleteField(),
        projectTitle: deleteField(),
        kanbanColumn: deleteField(),
        parentReportId: deleteField(),
      });
      toast.success('제거됨');
      onDocsChange();
    } catch { toast.error('실패'); }
  };

  const handleLink = async (reportId: string) => {
    try {
      await updateDoc(doc(salesDb, 'reports', reportId), {
        projectId: project.id,
        projectTitle: project.title,
        kanbanColumn: localCols[0]?.id ?? 'todo',
        updatedAt: ts(),
      });
      toast.success('연결됨');
      onDocsChange();
      setShowDocPicker(false);
    } catch { toast.error('연결 실패'); }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const targetColId = over.id as string;
    const colIds = localCols.map(c => c.id);
    if (!colIds.includes(targetColId)) return;
    const dragged = docs.find(d => d.id === active.id);
    if (!dragged || (dragged.kanbanColumn ?? localCols[0]?.id) === targetColId) return;
    try {
      await updateDoc(doc(salesDb, 'reports', dragged.id), { kanbanColumn: targetColId, updatedAt: ts() });
      onDocsChange();
    } catch { toast.error('이동 실패'); }
  }, [docs, localCols, onDocsChange, toast]);

  const activeDoc = activeId ? docs.find(d => d.id === activeId) : null;
  const progress = project.progress ?? 0;
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
          {project.description && <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5 truncate">{project.description}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <ProgressPicker value={progress} onChange={onProgressChange} />
            {project.endDate && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1"><Calendar size={11} /> 마감 {fmtDate(project.endDate)}</span>
            )}
            {(project.memberNames ?? []).length > 0 && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <Users size={11} /> {(project.memberNames ?? []).slice(0, 3).join(', ')}{(project.memberNames ?? []).length > 3 ? ` +${(project.memberNames ?? []).length - 3}` : ''}
              </span>
            )}
          </div>
        </div>
        {/* 주요 액션 — 모든 탭에서 접근 가능 */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <button onClick={() => openNewReport()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
            <Plus size={12} /> 새 보고서
          </button>
          <button onClick={() => setShowDocPicker(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
            <Link size={12} /> 문서 연결
          </button>
          <button onClick={() => setShowProjectForm(true)}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
            <Edit2 size={15} />
          </button>
          {currentUser.role === 'admin' && (
            <button onClick={() => onDeleteProject(project.id)}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 뷰 토글 */}
      <div className="flex items-center gap-1 mb-4 border-b border-stone-200 dark:border-stone-700">
        {([
          { key: 'mindmap', icon: <GitBranch size={12} />, label: '마인드맵' },
          { key: 'kanban',  icon: <Kanban size={12} />,    label: '칸반' },
          { key: 'gantt',   icon: <BarChart2 size={12} />, label: '간트' },
        ] as { key: 'mindmap' | 'kanban' | 'gantt'; icon: React.ReactNode; label: string }[]).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${view === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* 마인드맵 */}
      {view === 'mindmap' && (
        <ProjectMindMap projectId={project.id} projectTitle={project.title} docs={docs} onOpenDoc={openReport} />
      )}

      {/* 칸반 */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex justify-end mb-3">
            <button
              onClick={handleAddColumn}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold border border-dashed border-stone-300 dark:border-stone-600 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
            >
              <Plus size={11} /> 컬럼 추가
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {localCols.map((colDef, idx) => (
              <DroppableColumn
                key={colDef.id}
                colDef={colDef}
                docs={docs}
                columns={localCols}
                isFirst={idx === 0}
                isLast={idx === localCols.length - 1}
                onNewReport={() => openNewReport()}
                onOpenDoc={openReport}
                onUnlinkDoc={handleUnlink}
                onStatusChange={handleCardStatusChange}
                onRename={label => handleRenameColumn(colDef.id, label)}
                onColorChange={color => handleColorColumn(colDef.id, color)}
                onMoveLeft={() => handleMoveColumn(colDef.id, 'left')}
                onMoveRight={() => handleMoveColumn(colDef.id, 'right')}
                onDelete={() => handleDeleteColumn(colDef.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDoc && <ReportCardGhost report={activeDoc} />}
          </DragOverlay>
        </DndContext>
      )}

      {/* 간트차트 */}
      {view === 'gantt' && (
        <ProjectGanttView
          project={project}
          docs={docs}
          columns={localCols}
          tasks={ganttTasks}
          onEditProject={() => setShowProjectForm(true)}
          onOpenDoc={openReport}
          onAddTask={() => setTaskModal({})}
          onEditTask={t => setTaskModal({ task: t })}
        />
      )}

      {/* 간트 업무 모달 */}
      {taskModal !== null && (
        <GanttTaskModal
          task={taskModal.task}
          projectId={project.id}
          onSaved={loadGanttTasks}
          onClose={() => setTaskModal(null)}
        />
      )}

      {/* 보고서 팝업 모달 */}
      {reportModal !== null && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-2 sm:p-4" onClick={() => setReportModal(null)}>
          <div className="bg-[#FDFBF7] dark:bg-stone-900 w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-sm shadow-2xl border border-stone-300 dark:border-stone-700" onClick={e => e.stopPropagation()}>
            <Suspense fallback={<div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" /></div>}>
              <ReportView
                currentUser={currentUser}
                projectId={project.id}
                projectTitle={project.title}
                focusReportId={reportModal.focusReportId}
                onDataChange={onDocsChange}
                openNew={reportModal.openNew}
                initialParentReportId={reportModal.parentId}
                onNewOpened={() => setReportModal(prev => prev ? { ...prev, openNew: false } : null)}
                onDismiss={() => setReportModal(null)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* 문서 연결 모달 */}
      {showDocPicker && (
        <DocLinkPickerModal
          existingIds={docs.map(d => d.id)}
          onLink={handleLink}
          onClose={() => setShowDocPicker(false)}
        />
      )}

      {/* 프로젝트 수정 모달 */}
      {showProjectForm && (
        <ProjectFormModal
          project={project}
          employees={employees}
          folders={folders}
          currentUser={currentUser}
          onSave={data => {
            onUpdateProject({ ...project, ...data, updatedAt: ts() });
            setShowProjectForm(false);
          }}
          onClose={() => setShowProjectForm(false)}
        />
      )}
    </div>
  );
}

// ── 회의록 미니 카드 ──────────────────────────────────────
function MeetingMiniCard({ meeting, onCreateProject }: {
  meeting: SimpleMeeting;
  onCreateProject: (m: SimpleMeeting) => void;
}) {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-3 mb-2 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">{meeting.title || '(제목 없음)'}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {meeting.date}{meeting.author ? ` · ${meeting.author}` : ''}{meeting.agendas?.length ? ` · 안건 ${meeting.agendas.length}개` : ''}
          </p>
        </div>
        <button
          onClick={() => onCreateProject(meeting)}
          className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-sm transition-colors whitespace-nowrap"
        >
          <Plus size={9} /> 프로젝트로
        </button>
      </div>
    </div>
  );
}

// ── 프로젝트 목록 카드 ────────────────────────────────────
function ProjectCard({ project, isFirst, isLast, onClick, onStatusChange, onProgressChange, onMoveUp, onMoveDown }: {
  project: Project;
  isFirst: boolean; isLast: boolean;
  onClick: () => void;
  onStatusChange: (status: ProjectStatus) => void;
  onProgressChange: (v: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const statusCfg = STATUS_CFG[project.status];
  const progress = project.progress ?? 0;
  const isEndingSoon = project.endDate && project.status === 'active' &&
    new Date(project.endDate) > new Date() && new Date(project.endDate) < new Date(Date.now() + 7 * 86400000);
  const isArchived = project.status === 'completed' || project.status === 'archived';

  return (
    <div className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm hover:shadow-md hover:border-stone-400 dark:hover:border-stone-500 transition-all group">
      <div onClick={onClick} className="text-left p-4 cursor-pointer">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-black text-stone-900 dark:text-white group-hover:text-stone-700 dark:group-hover:text-stone-200 leading-snug flex-1 min-w-0 truncate">{project.title}</h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
        </div>
        {project.description && <p className="text-xs text-stone-500 dark:text-stone-400 mb-2 line-clamp-2 leading-snug">{project.description}</p>}
        <div className="flex items-center gap-3 text-[10px] text-stone-400 flex-wrap">
          {(project.memberNames ?? []).length > 0 && (
            <span className="flex items-center gap-0.5">
              <Users size={9} /> {(project.memberNames ?? []).slice(0, 2).join(', ')}{(project.memberNames ?? []).length > 2 ? ` +${(project.memberNames ?? []).length - 2}` : ''}
            </span>
          )}
          {project.endDate && (
            <span className={`flex items-center gap-0.5 ${isEndingSoon ? 'text-amber-500 font-bold' : ''}`}>
              <Calendar size={9} /> {fmtDate(project.endDate)}{isEndingSoon ? ' ⚡' : ''}
            </span>
          )}
        </div>
      </div>

      {/* 진행률 설정 */}
      <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-800/50"
        onClick={e => e.stopPropagation()}>
        <ProgressPicker value={progress} onChange={onProgressChange} compact />
      </div>

      {/* 빠른 액션 풋터 */}
      <div className="px-4 pb-3 pt-1 border-t border-stone-100 dark:border-stone-800/50 flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}
          className="p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 rounded-sm transition-colors">
          <ChevronUp size={12} />
        </button>
        <button onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}
          className="p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 rounded-sm transition-colors">
          <ChevronDown size={12} />
        </button>
        <div className="flex-1" />
        {isArchived ? (
          <button
            onClick={e => { e.stopPropagation(); onStatusChange('active'); }}
            className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <RotateCcw size={9} /> 복구
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
              className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
            >
              <Archive size={9} /> 종료
            </button>
            {showMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm shadow-lg z-20 py-1 min-w-[7rem]">
                <button
                  onClick={() => { onStatusChange('completed'); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2"
                >
                  <CheckCircle2 size={11} className="text-blue-500" /> 완료
                </button>
                <button
                  onClick={() => { onStatusChange('archived'); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2"
                >
                  <Archive size={11} className="text-stone-400" /> 아카이브
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 ProjectsView ─────────────────────────────────────
export function ProjectsView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  // 폴더 상태
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null); // null=폴더목록, 'unclassified'=미분류, 폴더id=해당폴더
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);

  // 프로젝트 상태
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDocs, setProjectDocs] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'all' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);

  // 회의록 패널
  const [showMeetings, setShowMeetings] = useState(false);
  const [meetings, setMeetings] = useState<SimpleMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingToConvert, setMeetingToConvert] = useState<SimpleMeeting | null>(null);

  // ── 데이터 로드 ───────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'project_folders'), orderBy('order')));
    setFolders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectFolder)));
  }, []);

  const loadProjects = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'projects'), orderBy('updatedAt', 'desc')));
    setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
  }, []);

  const loadEmployees = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'employees'), orderBy('name')));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
  }, []);

  const loadProjectDocs = useCallback(async (projectId: string) => {
    try {
      const snap = await getDocs(query(collection(salesDb, 'reports'), where('projectId', '==', projectId)));
      setProjectDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadFolders(), loadProjects(), loadEmployees()]);
      setLoading(false);
    })();
  }, [loadFolders, loadProjects, loadEmployees]);

  // ── 폴더 CRUD ─────────────────────────────────────────────
  const handleCreateFolder = async (data: Omit<ProjectFolder, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => {
    const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const now = ts();
    const maxOrder = folders.reduce((max, f) => Math.max(max, f.order), -1);
    try {
      await setDoc(doc(salesDb, 'project_folders', id), scrub({ ...data, id, order: maxOrder + 1, createdAt: now, updatedAt: now }));
      toast.success('폴더 생성됨');
      await loadFolders();
      setShowFolderForm(false);
    } catch { toast.error('생성 실패'); }
  };

  const handleUpdateFolder = async (folder: ProjectFolder, data: Omit<ProjectFolder, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => {
    try {
      await updateDoc(doc(salesDb, 'project_folders', folder.id), scrub({ ...data, updatedAt: ts() }));
      toast.success('수정됨');
      await loadFolders();
      setEditingFolder(null);
    } catch { toast.error('수정 실패'); }
  };

  const handleDeleteFolder = async (folder: ProjectFolder) => {
    const projectsInFolder = projects.filter(p => p.folderId === folder.id);
    const ok = await confirm({
      title: '폴더 삭제',
      message: `"${folder.name}" 폴더를 삭제할까요?${projectsInFolder.length > 0 ? `\n폴더 안의 프로젝트 ${projectsInFolder.length}개는 미분류로 이동됩니다.` : ''}`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      if (projectsInFolder.length > 0) {
        await Promise.all(projectsInFolder.map(p =>
          updateDoc(doc(salesDb, 'projects', p.id), { folderId: deleteField(), folderOrder: deleteField(), updatedAt: ts() })
        ));
      }
      await deleteDoc(doc(salesDb, 'project_folders', folder.id));
      toast.success('삭제됨');
      if (selectedFolderId === folder.id) setSelectedFolderId(null);
      await Promise.all([loadFolders(), loadProjects()]);
    } catch { toast.error('삭제 실패'); }
  };

  const handleMoveFolderUp = async (idx: number) => {
    if (idx === 0) return;
    const newFolders = [...folders];
    [newFolders[idx - 1], newFolders[idx]] = [newFolders[idx], newFolders[idx - 1]];
    setFolders(newFolders);
    try {
      await Promise.all(newFolders.map((f, i) =>
        updateDoc(doc(salesDb, 'project_folders', f.id), { order: i, updatedAt: ts() })
      ));
    } catch { toast.error('순서 변경 실패'); await loadFolders(); }
  };

  const handleMoveFolderDown = async (idx: number) => {
    if (idx >= folders.length - 1) return;
    const newFolders = [...folders];
    [newFolders[idx], newFolders[idx + 1]] = [newFolders[idx + 1], newFolders[idx]];
    setFolders(newFolders);
    try {
      await Promise.all(newFolders.map((f, i) =>
        updateDoc(doc(salesDb, 'project_folders', f.id), { order: i, updatedAt: ts() })
      ));
    } catch { toast.error('순서 변경 실패'); await loadFolders(); }
  };

  // ── 프로젝트 CRUD ─────────────────────────────────────────
  const handleCreateProject = async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = genId();
    const now = ts();
    try {
      // folderOrder = 현재 폴더 내 최대 순서 + 1
      const folderProjects = projects.filter(p => p.folderId === data.folderId);
      const maxOrder = folderProjects.reduce((max, p) => Math.max(max, p.folderOrder ?? 0), -1);
      await setDoc(doc(salesDb, 'projects', id), scrub({ ...data, id, folderOrder: maxOrder + 1, createdAt: now, updatedAt: now }));
      toast.success('프로젝트 생성됨');
      await loadProjects();
      setShowProjectForm(false);
    } catch { toast.error('생성 실패'); }
  };

  const handleUpdateProject = async (updated: Project) => {
    try {
      const { id: _id, createdAt: _ca, ...fields } = updated;
      await updateDoc(doc(salesDb, 'projects', updated.id), scrub({ ...fields, updatedAt: ts() }));
      setSelectedProject(updated);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success('수정됨');
    } catch { toast.error('수정 실패'); }
  };

  const handleDeleteProject = async (id: string) => {
    const ok = await confirm({ title: '프로젝트 삭제', message: '프로젝트를 삭제할까요? 연결된 보고서는 유지됩니다.', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'projects', id));
      toast.success('삭제됨');
      setSelectedProject(null);
      await loadProjects();
    } catch { toast.error('삭제 실패'); }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    await loadProjectDocs(project.id);
  };

  const handleStatusChange = async (projectId: string, newStatus: ProjectStatus) => {
    try {
      await updateDoc(doc(salesDb, 'projects', projectId), { status: newStatus, updatedAt: ts() });
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
      const msg = newStatus === 'active' ? '진행중으로 복구됨' : newStatus === 'completed' ? '완료 처리됨' : '아카이브됨';
      toast.success(msg);
    } catch { toast.error('상태 변경 실패'); }
  };

  const handleProgressChange = async (projectId: string, progress: number) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, progress } : p));
    if (selectedProject?.id === projectId) setSelectedProject(prev => prev ? { ...prev, progress } : prev);
    try {
      await updateDoc(doc(salesDb, 'projects', projectId), { progress, updatedAt: ts() });
    } catch { toast.error('진행률 저장 실패'); }
  };

  // 폴더 내 프로젝트 순서 변경
  const handleMoveProjectInFolder = async (projectId: string, dir: 'up' | 'down', inFolderProjects: Project[]) => {
    const idx = inFolderProjects.findIndex(p => p.id === projectId);
    if (idx < 0) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= inFolderProjects.length) return;
    const newList = [...inFolderProjects];
    [newList[idx], newList[newIdx]] = [newList[newIdx], newList[idx]];
    // 로컬 상태 즉시 반영
    setProjects(prev => {
      const updated = [...prev];
      newList.forEach((p, i) => {
        const gi = updated.findIndex(x => x.id === p.id);
        if (gi >= 0) updated[gi] = { ...updated[gi], folderOrder: i };
      });
      return updated;
    });
    try {
      await Promise.all(newList.map((p, i) =>
        updateDoc(doc(salesDb, 'projects', p.id), { folderOrder: i, updatedAt: ts() })
      ));
    } catch { toast.error('순서 변경 실패'); await loadProjects(); }
  };

  // ── 회의록 ────────────────────────────────────────────────
  const loadMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    try {
      const snap = await getDocs(query(collection(salesDb, 'meetings'), orderBy('date', 'desc')));
      setMeetings(snap.docs.slice(0, 20).map(d => ({ id: d.id, ...d.data() } as SimpleMeeting)));
    } catch {} finally { setLoadingMeetings(false); }
  }, []);

  const handleToggleMeetings = async () => {
    if (!showMeetings && meetings.length === 0) await loadMeetings();
    setShowMeetings(v => !v);
  };

  const handleCreateFromMeeting = (meeting: SimpleMeeting) => {
    setMeetingToConvert(meeting);
    setShowProjectForm(true);
  };

  // ── 검색 ─────────────────────────────────────────────────
  const matchesSearch = (p: Project) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false) ||
      (p.memberNames ?? []).some(n => n.toLowerCase().includes(q));
  };

  // ── 현재 폴더의 프로젝트 목록 (순서 정렬) ────────────────
  const getProjectsInFolder = useCallback((folderId: string | null) => {
    const filtered = projects.filter(p =>
      folderId === 'unclassified' ? !p.folderId : p.folderId === folderId
    );
    return [...filtered].sort((a, b) => {
      const oa = a.folderOrder ?? Infinity;
      const ob = b.folderOrder ?? Infinity;
      if (oa !== ob) return oa - ob;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [projects]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  // ── 레벨 3: 프로젝트 상세 (도식화/칸반/간트) ─────────────
  if (selectedProject) {
    const currentFolder = selectedFolderId === 'unclassified'
      ? null
      : folders.find(f => f.id === selectedFolderId) ?? null;
    return (
      <>
        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-[11px] text-stone-400 mb-3 flex-wrap">
          <button onClick={() => { setSelectedProject(null); setSelectedFolderId(null); }}
            className="hover:text-stone-700 dark:hover:text-stone-200 transition-colors">프로젝트</button>
          <ChevronRight size={11} />
          <button onClick={() => setSelectedProject(null)}
            className="hover:text-stone-700 dark:hover:text-stone-200 transition-colors">
            {currentFolder?.name ?? '미분류'}
          </button>
          <ChevronRight size={11} />
          <span className="text-stone-700 dark:text-stone-300 font-bold">{selectedProject.title}</span>
        </div>
        <ProjectDetail
          project={selectedProject}
          docs={projectDocs}
          employees={employees}
          folders={folders}
          currentUser={currentUser}
          onBack={() => setSelectedProject(null)}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onDocsChange={() => loadProjectDocs(selectedProject.id)}
          onProgressChange={v => handleProgressChange(selectedProject.id, v)}
        />
      </>
    );
  }

  // ── 레벨 2: 폴더 내 프로젝트 목록 ───────────────────────
  if (selectedFolderId !== null) {
    const currentFolder = selectedFolderId === 'unclassified'
      ? null
      : folders.find(f => f.id === selectedFolderId);
    const folderName = currentFolder?.name ?? '미분류';
    const inFolderProjects = getProjectsInFolder(selectedFolderId);

    const filtered = inFolderProjects
      .filter(p => {
        if (tab === 'active') return p.status === 'active';
        if (tab === 'archived') return p.status === 'completed' || p.status === 'archived';
        return true;
      })
      .filter(matchesSearch);

    return (
      <div>
        {/* 브레드크럼 + 헤더 */}
        <div className="flex items-center gap-1.5 text-[11px] text-stone-400 mb-2">
          <button onClick={() => setSelectedFolderId(null)}
            className="hover:text-stone-700 dark:hover:text-stone-200 transition-colors">프로젝트</button>
          <ChevronRight size={11} />
          <span className="text-stone-700 dark:text-stone-300 font-bold">{folderName}</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedFolderId(null)}
              className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2">
                {currentFolder ? (
                  <span className={`inline-block w-3 h-3 rounded-full ${COLOR_CFG[currentFolder.color]?.dotCls ?? 'bg-stone-400'}`} />
                ) : null}
                {folderName}
              </h1>
              {currentFolder?.description && (
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">{currentFolder.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleMeetings}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-sm border transition-colors ${showMeetings ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
              <BookOpen size={13} /> 회의록
            </button>
            <button onClick={() => setShowProjectForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={13} /> 새 프로젝트
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2 mb-3">
          <Search size={13} className="text-stone-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="제목·설명·멤버 검색..."
            className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="text-stone-400 hover:text-stone-700"><X size={12} /></button>}
        </div>

        {/* 상태 탭 */}
        <div className="flex gap-0 border-b border-stone-200 dark:border-stone-700 mb-4">
          {([['active', '진행중'], ['all', '전체'], ['archived', '보관함']] as [typeof tab, string][]).map(([key, label]) => {
            const count = inFolderProjects.filter(p =>
              key === 'active' ? p.status === 'active' :
              key === 'archived' ? (p.status === 'completed' || p.status === 'archived') : true
            ).length;
            return (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px ${tab === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700'}`}>
                {label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        <div className={showMeetings ? 'flex gap-4' : ''}>
          {/* 회의록 패널 */}
          {showMeetings && (
            <div className="w-64 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-black text-stone-700 dark:text-stone-300 flex items-center gap-1"><BookOpen size={12} /> 최근 회의록</h2>
                <button onClick={() => setShowMeetings(false)} className="text-stone-400 hover:text-stone-700"><X size={13} /></button>
              </div>
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                {loadingMeetings ? (
                  <div className="flex justify-center py-8"><div className="w-4 h-4 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" /></div>
                ) : meetings.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-stone-400">회의록이 없습니다</div>
                ) : meetings.map(m => (
                  <MeetingMiniCard key={m.id} meeting={m} onCreateProject={handleCreateFromMeeting} />
                ))}
              </div>
            </div>
          )}

          {/* 프로젝트 카드 목록 */}
          <div className="flex-1 min-w-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <FolderKanban size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
                <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">
                  {search ? '검색 결과가 없습니다' :
                   tab === 'active' ? '진행 중인 프로젝트가 없습니다' :
                   tab === 'archived' ? '보관된 프로젝트가 없습니다' : '프로젝트가 없습니다'}
                </p>
                {!search && tab !== 'archived' && (
                  <button onClick={() => setShowProjectForm(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">
                    새 프로젝트 만들기
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((p, idx) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    isFirst={idx === 0}
                    isLast={idx === filtered.length - 1}
                    onClick={() => handleSelectProject(p)}
                    onStatusChange={newStatus => handleStatusChange(p.id, newStatus)}
                    onProgressChange={v => handleProgressChange(p.id, v)}
                    onMoveUp={() => handleMoveProjectInFolder(p.id, 'up', filtered)}
                    onMoveDown={() => handleMoveProjectInFolder(p.id, 'down', filtered)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 프로젝트 생성 모달 */}
        {showProjectForm && (
          <ProjectFormModal
            employees={employees}
            currentUser={currentUser}
            folders={folders}
            defaultFolderId={selectedFolderId === 'unclassified' ? '' : selectedFolderId ?? ''}
            initialTitle={meetingToConvert?.title}
            initialDescription={meetingToConvert?.agendas?.map(a => a.title).filter(Boolean).join(' / ')}
            onSave={async data => {
              await handleCreateProject(data);
              setMeetingToConvert(null);
            }}
            onClose={() => { setShowProjectForm(false); setMeetingToConvert(null); }}
          />
        )}
      </div>
    );
  }

  // ── 레벨 1: 폴더 목록 ────────────────────────────────────
  const unclassifiedCount = projects.filter(p => !p.folderId).length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white">프로젝트</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">폴더별 프로젝트 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFolderForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-sm border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
            <Folder size={13} /> 새 폴더
          </button>
          <button onClick={() => setShowProjectForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 transition-colors">
            <Plus size={13} /> 새 프로젝트
          </button>
        </div>
      </div>

      {/* 폴더 그리드 */}
      {folders.length === 0 && unclassifiedCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <FolderOpen size={48} className="text-stone-300 dark:text-stone-600 mb-4" />
          <h3 className="text-sm font-black text-stone-700 dark:text-stone-300 mb-1">폴더와 프로젝트를 만들어 보세요</h3>
          <p className="text-xs text-stone-400 mb-4">폴더로 프로젝트를 체계적으로 분류할 수 있습니다</p>
          <div className="flex gap-2">
            <button onClick={() => setShowFolderForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-sm hover:bg-stone-100 transition-colors">
              <Folder size={13} /> 폴더 만들기
            </button>
            <button onClick={() => setShowProjectForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={13} /> 프로젝트 만들기
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 폴더 카드 목록 */}
          {folders.map((folder, idx) => {
            const count = projects.filter(p => p.folderId === folder.id).length;
            return (
              <FolderCard
                key={folder.id}
                folder={folder}
                projectCount={count}
                isFirst={idx === 0}
                isLast={idx === folders.length - 1}
                onOpen={() => setSelectedFolderId(folder.id)}
                onEdit={() => setEditingFolder(folder)}
                onDelete={() => handleDeleteFolder(folder)}
                onMoveUp={() => handleMoveFolderUp(idx)}
                onMoveDown={() => handleMoveFolderDown(idx)}
              />
            );
          })}

          {/* 미분류 버킷 */}
          {unclassifiedCount > 0 && (
            <button
              onClick={() => setSelectedFolderId('unclassified')}
              className="bg-stone-50 dark:bg-stone-800/50 border border-dashed border-stone-300 dark:border-stone-600 rounded-sm p-4 hover:bg-stone-100 dark:hover:bg-stone-700/50 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-sm bg-stone-200 dark:bg-stone-700 flex items-center justify-center shrink-0">
                  <Folder size={18} className="text-stone-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-stone-600 dark:text-stone-400">미분류</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">폴더 없는 프로젝트</p>
                </div>
              </div>
              <p className="text-[11px] text-stone-400 flex items-center gap-1">
                <FolderKanban size={11} /> {unclassifiedCount}개 프로젝트
              </p>
            </button>
          )}
        </div>
      )}

      {/* 폴더 생성 모달 */}
      {showFolderForm && (
        <FolderFormModal
          onSave={handleCreateFolder}
          onClose={() => setShowFolderForm(false)}
        />
      )}

      {/* 폴더 수정 모달 */}
      {editingFolder && (
        <FolderFormModal
          folder={editingFolder}
          onSave={data => handleUpdateFolder(editingFolder, data)}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {/* 프로젝트 생성 모달 (폴더 목록에서 생성 시) */}
      {showProjectForm && (
        <ProjectFormModal
          employees={employees}
          currentUser={currentUser}
          folders={folders}
          initialTitle={meetingToConvert?.title}
          initialDescription={meetingToConvert?.agendas?.map(a => a.title).filter(Boolean).join(' / ')}
          onSave={async data => {
            await handleCreateProject(data);
            setMeetingToConvert(null);
          }}
          onClose={() => { setShowProjectForm(false); setMeetingToConvert(null); }}
        />
      )}
    </div>
  );
}
