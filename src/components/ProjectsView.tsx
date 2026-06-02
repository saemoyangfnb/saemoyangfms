import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { ReportView } from './ReportView';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, deleteField,
} from 'firebase/firestore';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  User, Employee, Department, Project, Report, ProjectStatus, KanbanColumn,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, ChevronLeft, Trash2, Edit2, X, Users, Calendar,
  GripVertical, FolderKanban, Check, Link, Search, Kanban, GitBranch, FileText,
  Archive, CheckCircle2, RotateCcw, BookOpen,
} from 'lucide-react';

// ── 유틸 ──────────────────────────────────────────────────
const genId = () => `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const ts = () => new Date().toISOString();
const scrub = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ── 설정 ──────────────────────────────────────────────────
const COL_CFG: Record<KanbanColumn, { label: string; headCls: string; bgCls: string; dotCls: string }> = {
  todo:  { label: '할 일',   headCls: 'text-stone-600 dark:text-stone-300',     bgCls: 'bg-stone-100/80 dark:bg-stone-800/50',    dotCls: 'bg-stone-400' },
  doing: { label: '진행 중', headCls: 'text-amber-600 dark:text-amber-400',     bgCls: 'bg-amber-50/80 dark:bg-amber-900/10',     dotCls: 'bg-amber-400' },
  done:  { label: '완료',    headCls: 'text-emerald-600 dark:text-emerald-400', bgCls: 'bg-emerald-50/80 dark:bg-emerald-900/10', dotCls: 'bg-emerald-500' },
};

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

const COLS: KanbanColumn[] = ['todo', 'doing', 'done'];

interface SimpleMeeting {
  id: string; title: string; date: string; author?: string;
  agendas?: { title: string }[];
}

// ── 보고서 칸반 카드 ──────────────────────────────────────
function ReportKanbanCard({
  report, onOpen, onUnlink,
}: {
  report: Report;
  onOpen: () => void;
  onUnlink: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: report.id });
  const ap = AP_CFG[report.approvalStatus] ?? AP_CFG.draft;
  const preview = report.sections?.[0]?.body ?? '';

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
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold ${ap.cls}`}>{ap.label}</span>
            <span className="text-[10px] text-stone-400">{report.authorName}</span>
            {report.updatedAt && <span className="text-[10px] text-stone-300">{fmtDate(report.updatedAt)}</span>}
          </div>
          <p className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-snug hover:text-stone-600 dark:hover:text-stone-300">
            {report.title || '(제목 없음)'}
          </p>
          {preview && (
            <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 leading-snug">{preview}</p>
          )}
        </div>
        {/* 항상 표시되는 제거 버튼 */}
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
  column, docs, onNewReport, onOpenDoc, onUnlinkDoc,
}: {
  column: KanbanColumn;
  docs: Report[];
  onNewReport: () => void;
  onOpenDoc: (r: Report) => void;
  onUnlinkDoc: (r: Report) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const cfg = COL_CFG[column];
  const colDocs = docs.filter(d => (d.kanbanColumn ?? 'todo') === column);

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`w-2 h-2 rounded-full ${cfg.dotCls} shrink-0`} />
        <h3 className={`text-xs font-bold ${cfg.headCls} flex-1`}>{cfg.label}</h3>
        <span className="text-[10px] text-stone-400 tabular-nums">{colDocs.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`${cfg.bgCls} rounded-sm p-2 flex-1 min-h-[120px] transition-all border-2 ${isOver ? 'border-blue-400 dark:border-blue-500' : 'border-transparent'}`}
      >
        {colDocs.map(doc => (
          <ReportKanbanCard
            key={doc.id}
            report={doc}
            onOpen={() => onOpenDoc(doc)}
            onUnlink={() => onUnlinkDoc(doc)}
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
  report, allDocs, onNodeClick, onUnlink, depth,
}: {
  report: Report;
  allDocs: Report[];
  onNodeClick: (r: Report) => void;
  onUnlink: (r: Report) => void;
  depth: number;
}) {
  const children = allDocs.filter(d => d.parentReportId === report.id);
  const col = report.kanbanColumn ?? 'todo';
  const borderCls =
    col === 'done'  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
    col === 'doing' ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                     'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800';

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <button
          onClick={() => onNodeClick(report)}
          className={`border-2 rounded-sm p-2.5 w-44 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all ${borderCls}`}
        >
          <div className="flex items-center gap-1 mb-1.5">
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded-sm ${COL_CFG[col].bgCls} ${COL_CFG[col].headCls}`}>{COL_CFG[col].label}</span>
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
                <ReportDiagramNode report={child} allDocs={allDocs} onNodeClick={onNodeClick} onUnlink={onUnlink} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReportTreeDiagram({
  docs, onNodeClick, onUnlink,
}: {
  docs: Report[];
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
            <ReportDiagramNode key={root.id} report={root} allDocs={docs} onNodeClick={onNodeClick} onUnlink={onUnlink} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 도식화 노드 팝업 ──────────────────────────────────────
function NodeActionPopup({
  report, onView, onAddSibling, onAddChild, onClose,
}: {
  report: Report;
  onView: () => void;
  onAddSibling: () => void;
  onAddChild: () => void;
  onClose: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const ap = AP_CFG[report.approvalStatus] ?? AP_CFG.draft;
  const col = report.kanbanColumn ?? 'todo';
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
            <span className={`text-[10px] font-bold ${COL_CFG[col].headCls}`}>● {COL_CFG[col].label}</span>
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
                <p className="text-[10px] text-stone-400">하위 단계 (자식)</p>
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

// ── 도식화에서 빠른 보고서 작성 ───────────────────────────
function QuickReportModal({
  project, currentUser, parentReportId, mode, parentReportTitle, onSave, onClose,
}: {
  project: Project;
  currentUser: User;
  parentReportId?: string;
  mode: 'sibling' | 'child';
  parentReportTitle?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [column, setColumn] = useState<KanbanColumn>('todo');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = genId();
      const now = ts();
      const data: Record<string, unknown> = {
        id,
        title: title.trim(),
        type: 'general',
        sections: body.trim() ? [{ title: '', body: body.trim() }] : [],
        photoUrls: [],
        authorName: currentUser.name,
        authorId: currentUser.uid,
        approvalStatus: 'draft',
        projectId: project.id,
        projectTitle: project.title,
        kanbanColumn: column,
        createdAt: now,
        updatedAt: now,
      };
      if (parentReportId) data.parentReportId = parentReportId;
      await setDoc(doc(salesDb, 'reports', id), data);
      toast.success('보고서 생성됨');
      onSave();
      onClose();
    } catch { toast.error('생성 실패'); } finally { setSaving(false); }
  };

  const contextLabel = mode === 'child'
    ? `"${parentReportTitle || '상위 보고서'}"의 하위`
    : '같은 단계에 추가';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-md border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <div>
            <h2 className="text-sm font-black text-stone-900 dark:text-white">새 보고서</h2>
            <p className="text-[10px] text-stone-400 mt-0.5">{contextLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">제목 *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="보고서 제목"
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">내용 (선택)</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)} rows={3}
              placeholder="보고서 내용..."
              className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">상태</label>
            <div className="flex gap-2">
              {COLS.map(col => (
                <button key={col} onClick={() => setColumn(col)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-sm transition-colors border-2 ${
                    column === col
                      ? `${COL_CFG[col].headCls} border-current bg-white dark:bg-stone-800`
                      : 'border-stone-200 dark:border-stone-700 text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}>
                  {COL_CFG[col].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button onClick={handleSubmit} disabled={!title.trim() || saving}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {saving ? '저장 중...' : '작성'}
          </button>
        </div>
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
                onClick={() => onLink(d.id)}
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

// ── 프로젝트 생성/수정 폼 ─────────────────────────────────
function ProjectFormModal({
  project, employees, currentUser, initialTitle, initialDescription, onSave, onClose,
}: {
  project?: Project;
  employees: Employee[];
  currentUser: User;
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

// ── 프로젝트 상세 ─────────────────────────────────────────
function ProjectDetail({
  project, docs, employees, currentUser, onBack,
  onUpdateProject, onDeleteProject, onDocsChange,
}: {
  project: Project;
  docs: Report[];
  employees: Employee[];
  currentUser: User;
  onBack: () => void;
  onUpdateProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onDocsChange: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'diagram' | 'kanban' | 'docs'>('diagram');
  const [focusReportId, setFocusReportId] = useState<string | undefined>();
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);

  type NodeActionState =
    | { kind: 'menu'; report: Report }
    | { kind: 'quick'; report: Report; mode: 'sibling' | 'child' };
  const [nodeAction, setNodeAction] = useState<NodeActionState | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // 문서 탭을 벗어나면 focusReportId 초기화
  useEffect(() => {
    if (view !== 'docs') setFocusReportId(undefined);
  }, [view]);

  const openReport = (report: Report) => {
    setNodeAction(null);
    setFocusReportId(report.id);
    setView('docs');
  };

  const handleNodeClick = (report: Report) => {
    setNodeAction({ kind: 'menu', report });
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
        kanbanColumn: 'todo',
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
    const targetCol = over.id as KanbanColumn;
    if (!COLS.includes(targetCol)) return;
    const dragged = docs.find(d => d.id === active.id);
    if (!dragged || (dragged.kanbanColumn ?? 'todo') === targetCol) return;
    try {
      await updateDoc(doc(salesDb, 'reports', dragged.id), { kanbanColumn: targetCol, updatedAt: ts() });
      onDocsChange();
    } catch { toast.error('이동 실패'); }
  }, [docs, onDocsChange, toast]);

  const activeDoc = activeId ? docs.find(d => d.id === activeId) : null;
  const doneCount = docs.filter(d => d.kanbanColumn === 'done').length;
  const progress = docs.length > 0 ? Math.round((doneCount / docs.length) * 100) : 0;
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
            {docs.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[11px] text-stone-500 tabular-nums">{doneCount}/{docs.length} ({progress}%)</span>
              </div>
            )}
            {project.endDate && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1"><Calendar size={11} /> 마감 {fmtDate(project.endDate)}</span>
            )}
            {project.memberNames.length > 0 && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <Users size={11} /> {project.memberNames.slice(0, 3).join(', ')}{project.memberNames.length > 3 ? ` +${project.memberNames.length - 3}` : ''}
              </span>
            )}
          </div>
        </div>
        {/* 주요 액션 — 모든 탭에서 접근 가능 */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <button onClick={() => setView('docs')}
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
          { key: 'diagram', icon: <GitBranch size={12} />, label: '도식화' },
          { key: 'kanban',  icon: <Kanban size={12} />,    label: '칸반' },
          { key: 'docs',    icon: <Plus size={12} />,      label: '문서 작성' },
        ] as { key: 'diagram' | 'kanban' | 'docs'; icon: React.ReactNode; label: string }[]).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${view === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* 도식화 */}
      {view === 'diagram' && (
        docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <GitBranch size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
            <h3 className="text-sm font-black text-stone-700 dark:text-stone-300 mb-1">아직 보고서가 없습니다</h3>
            <p className="text-xs text-stone-400 mb-4">새 보고서를 작성하거나 기존 보고서를 연결하세요</p>
            <div className="flex gap-2">
              <button onClick={() => setView('docs')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
                <Plus size={13} /> 새 보고서 작성
              </button>
              <button onClick={() => setShowDocPicker(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                <Link size={13} /> 기존 보고서 연결
              </button>
            </div>
          </div>
        ) : (
          <ReportTreeDiagram docs={docs} onNodeClick={handleNodeClick} onUnlink={handleUnlink} />
        )
      )}

      {/* 칸반 */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {COLS.map(col => (
              <DroppableColumn key={col} column={col} docs={docs}
                onNewReport={() => setView('docs')}
                onOpenDoc={openReport}
                onUnlinkDoc={handleUnlink}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDoc && <ReportCardGhost report={activeDoc} />}
          </DragOverlay>
        </DndContext>
      )}

      {/* 문서 작성/조회 */}
      {view === 'docs' && (
        <Suspense fallback={<div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" /></div>}>
          <ReportView
            currentUser={currentUser}
            projectId={project.id}
            projectTitle={project.title}
            focusReportId={focusReportId}
            onDataChange={onDocsChange}
          />
        </Suspense>
      )}

      {/* 도식화 노드 팝업 */}
      {nodeAction?.kind === 'menu' && (
        <NodeActionPopup
          report={nodeAction.report}
          onView={() => openReport(nodeAction.report)}
          onAddSibling={() => setNodeAction({ kind: 'quick', report: nodeAction.report, mode: 'sibling' })}
          onAddChild={() => setNodeAction({ kind: 'quick', report: nodeAction.report, mode: 'child' })}
          onClose={() => setNodeAction(null)}
        />
      )}

      {/* 도식화에서 빠른 보고서 작성 */}
      {nodeAction?.kind === 'quick' && (
        <QuickReportModal
          project={project}
          currentUser={currentUser}
          parentReportId={nodeAction.mode === 'child' ? nodeAction.report.id : nodeAction.report.parentReportId}
          mode={nodeAction.mode}
          parentReportTitle={nodeAction.report.title}
          onSave={() => { setNodeAction(null); onDocsChange(); }}
          onClose={() => setNodeAction(null)}
        />
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
function ProjectCard({ project, docCount, doneCount, onClick, onStatusChange }: {
  project: Project; docCount: number; doneCount: number; onClick: () => void;
  onStatusChange: (status: ProjectStatus) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const statusCfg = STATUS_CFG[project.status];
  const progress = docCount > 0 ? Math.round((doneCount / docCount) * 100) : 0;
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
        {project.description && <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 line-clamp-2 leading-snug">{project.description}</p>}
        {docCount > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-stone-400 mb-1">
              <span>진행률</span>
              <span className="tabular-nums">{doneCount}/{docCount} ({progress}%)</span>
            </div>
            <div className="h-1 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${project.status === 'completed' ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
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
      </div>
      {/* 빠른 액션 풋터 */}
      <div className="px-4 pb-3 border-t border-stone-100 dark:border-stone-800/50 pt-2">
        {isArchived ? (
          <button
            onClick={() => onStatusChange('active')}
            className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <RotateCcw size={9} /> 진행중으로 복구
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
              <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm shadow-lg z-20 py-1 min-w-[7rem]">
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
  const confirm = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDocs, setProjectDocs] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'all' | 'archived' | 'visual'>('active');
  const [search, setSearch] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [docStats, setDocStats] = useState<Record<string, { total: number; done: number }>>({});
  const [showMeetings, setShowMeetings] = useState(false);
  const [meetings, setMeetings] = useState<SimpleMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingToConvert, setMeetingToConvert] = useState<SimpleMeeting | null>(null);

  const loadProjects = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'projects'), orderBy('updatedAt', 'desc')));
    setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
  }, []);

  const loadDocStats = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(salesDb, 'reports'), where('projectId', '!=', null)));
      const stats: Record<string, { total: number; done: number }> = {};
      snap.docs.forEach(d => {
        const r = d.data() as Report;
        if (!r.projectId) return;
        if (!stats[r.projectId]) stats[r.projectId] = { total: 0, done: 0 };
        stats[r.projectId].total += 1;
        if (r.kanbanColumn === 'done') stats[r.projectId].done += 1;
      });
      setDocStats(stats);
    } catch {}
  }, []);

  const loadEmployees = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'employees'), orderBy('name')));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
  }, []);

  const loadProjectDocs = useCallback(async (projectId: string) => {
    try {
      const snap = await getDocs(query(collection(salesDb, 'reports'), where('projectId', '==', projectId)));
      setProjectDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (e) { console.error('loadProjectDocs 오류:', e); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadProjects(), loadDocStats(), loadEmployees()]);
      setLoading(false);
    })();
  }, [loadProjects, loadDocStats, loadEmployees]);

  const handleCreateProject = async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = genId();
    const now = ts();
    try {
      await setDoc(doc(salesDb, 'projects', id), scrub({ ...data, id, createdAt: now, updatedAt: now }));
      toast.success('프로젝트 생성됨');
      await loadProjects();
      setShowProjectForm(false);
    } catch { toast.error('생성 실패'); }
  };

  const handleUpdateProject = async (updated: Project) => {
    try {
      await updateDoc(doc(salesDb, 'projects', updated.id), scrub({ ...updated, updatedAt: ts() }));
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

  const matchesSearch = (p: Project) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false) ||
      p.memberNames.some(n => n.toLowerCase().includes(q));
  };

  const filteredProjects = projects
    .filter(p => {
      if (tab === 'active') return p.status === 'active';
      if (tab === 'archived') return p.status === 'completed' || p.status === 'archived';
      return true;
    })
    .filter(matchesSearch);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  // 프로젝트 상세
  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        docs={projectDocs}
        employees={employees}
        currentUser={currentUser}
        onBack={() => setSelectedProject(null)}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onDocsChange={() => {
          loadProjectDocs(selectedProject.id);
          loadDocStats();
        }}
      />
    );
  }

  // 프로젝트 목록
  const archivedCount = projects.filter(p => p.status === 'completed' || p.status === 'archived').length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-white">프로젝트</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">전사 프로젝트 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMeetings}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-sm border transition-colors ${showMeetings ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          >
            <BookOpen size={13} /> 회의록
          </button>
          <button onClick={() => setShowProjectForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors">
            <Plus size={13} /> 새 프로젝트
          </button>
        </div>
      </div>

      {/* 검색바 */}
      <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2 mb-3">
        <Search size={13} className="text-stone-400 shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목·설명·멤버 검색..."
          className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-stone-400 hover:text-stone-700">
            <X size={12} />
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-0 border-b border-stone-200 dark:border-stone-700 mb-4">
        {([
          ['active', '진행중'],
          ['all', '전체'],
          ['archived', '보관함'],
          ['visual', '시각화'],
        ] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px ${tab === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'}`}>
            {label}
            {key === 'active' && projects.filter(p => p.status === 'active').length > 0 && (
              <span className="ml-1.5 text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full tabular-nums">
                {projects.filter(p => p.status === 'active').length}
              </span>
            )}
            {key === 'archived' && archivedCount > 0 && (
              <span className="ml-1.5 text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full tabular-nums">
                {archivedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 본문: 회의록 분할 레이아웃 or 단독 */}
      <div className={showMeetings && tab !== 'visual' ? 'flex gap-4' : ''}>

        {/* 좌측 — 회의록 패널 */}
        {showMeetings && tab !== 'visual' && (
          <div className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-black text-stone-700 dark:text-stone-300 flex items-center gap-1">
                <BookOpen size={12} /> 최근 회의록
              </h2>
              <button onClick={() => setShowMeetings(false)} className="text-stone-400 hover:text-stone-700">
                <X size={13} />
              </button>
            </div>
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {loadingMeetings ? (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                </div>
              ) : meetings.length === 0 ? (
                <div className="text-center py-8 text-[11px] text-stone-400">회의록이 없습니다</div>
              ) : (
                meetings.map(m => (
                  <MeetingMiniCard key={m.id} meeting={m} onCreateProject={handleCreateFromMeeting} />
                ))
              )}
            </div>
          </div>
        )}

        {/* 우측 — 프로젝트 목록 */}
        <div className="flex-1 min-w-0">

          {/* 시각화 탭 */}
          {tab === 'visual' && (
            <div className="space-y-3">
              {projects.filter(p => p.status !== 'archived').filter(matchesSearch).map(p => {
                const stats = docStats[p.id] ?? { total: 0, done: 0 };
                const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
                const statusCfg = STATUS_CFG[p.status];
                return (
                  <button key={p.id} onClick={() => handleSelectProject(p)}
                    className="w-full text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-4 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                      <span className="text-sm font-black text-stone-900 dark:text-white flex-1 truncate">{p.title}</span>
                      <span className="text-[11px] text-stone-400 tabular-nums shrink-0">{pct}%</span>
                    </div>
                    <div className="h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${p.status === 'completed' ? 'bg-blue-500' : p.status === 'on_hold' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-400">
                      {stats.total > 0 && <span>{stats.done}/{stats.total} 완료</span>}
                      {p.endDate && <span className="flex items-center gap-0.5"><Calendar size={9} /> {fmtDate(p.endDate)}</span>}
                      {p.memberNames.length > 0 && <span className="flex items-center gap-0.5"><Users size={9} /> {p.memberNames.slice(0, 2).join(', ')}</span>}
                    </div>
                  </button>
                );
              })}
              {projects.filter(p => p.status !== 'archived').filter(matchesSearch).length === 0 && (
                <div className="text-center py-16 text-stone-400">프로젝트가 없습니다.</div>
              )}
            </div>
          )}

          {/* 목록 탭 (active / all / archived) */}
          {tab !== 'visual' && (
            filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <FolderKanban size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
                <p className="text-sm font-bold text-stone-500 dark:text-stone-400 mb-1">
                  {tab === 'active' ? '진행 중인 프로젝트가 없습니다' :
                   tab === 'archived' ? '보관된 프로젝트가 없습니다' :
                   search ? '검색 결과가 없습니다' : '프로젝트가 없습니다'}
                </p>
                {tab !== 'archived' && !search && (
                  <button onClick={() => setShowProjectForm(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">
                    새 프로젝트 만들기
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredProjects.map(p => {
                  const stats = docStats[p.id] ?? { total: 0, done: 0 };
                  return (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      docCount={stats.total}
                      doneCount={stats.done}
                      onClick={() => handleSelectProject(p)}
                      onStatusChange={newStatus => handleStatusChange(p.id, newStatus)}
                    />
                  );
                })}
              </div>
            )
          )}

        </div>
      </div>

      {showProjectForm && (
        <ProjectFormModal
          employees={employees}
          currentUser={currentUser}
          initialTitle={meetingToConvert?.title}
          initialDescription={meetingToConvert?.agendas?.map(a => a.title).filter(Boolean).join(' / ')}
          onSave={data => {
            handleCreateProject(data);
            setMeetingToConvert(null);
          }}
          onClose={() => {
            setShowProjectForm(false);
            setMeetingToConvert(null);
          }}
        />
      )}
    </div>
  );
}
