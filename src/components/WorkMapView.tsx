// 업무 지도 — 프로젝트별 담당자·진행률·업무보고 통합 뷰
import React, { useState, useEffect, useCallback } from 'react';
import { db, salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where,
} from 'firebase/firestore';
import {
  Task, Employee, User, TaskStatus, TaskSourceType, Project, DailyReport,
} from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, X, Edit2, ChevronDown, ChevronRight, Search,
  LayoutList, BarChart2, BookOpen, Calendar, Briefcase,
  CheckCircle2, AlertCircle, Users,
} from 'lucide-react';

// ── 로컬 타입 ──────────────────────────────────────────────
interface SimpleMeeting { id: string; title: string; date: string; }
type TrackStatus = 'done' | 'late' | 'urgent' | 'normal' | 'no_date';

// ── 유틸 ───────────────────────────────────────────────────
const genId = (prefix = 'item') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const nowTs = () => new Date().toISOString();
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fmtDate(ymd?: string) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function getDDay(ymd?: string) {
  if (!ymd) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(ymd + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'D-Day';
  if (diff < 0) return `D+${Math.abs(diff)}`;
  return `D-${diff}`;
}

function getTrackStatus(task: Task): TrackStatus {
  if (task.status === 'done') return 'done';
  if (!task.dueDate) return 'no_date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate + 'T00:00:00');
  if (due < today) return 'late';
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff <= 7) return 'urgent';
  return 'normal';
}

const TRACK_CFG: Record<TrackStatus, { dot: string; label: string; labelCls: string; rowBg: string }> = {
  done:    { dot: 'bg-stone-300 dark:bg-stone-600', label: '완료',     labelCls: 'text-stone-400',                              rowBg: '' },
  late:    { dot: 'bg-red-500',                     label: '지연',     labelCls: 'text-red-500 font-bold',                      rowBg: 'bg-red-50/50 dark:bg-red-900/10' },
  urgent:  { dot: 'bg-amber-400',                   label: '임박',     labelCls: 'text-amber-600 dark:text-amber-400 font-bold', rowBg: 'bg-amber-50/50 dark:bg-amber-900/10' },
  normal:  { dot: 'bg-emerald-500',                 label: '진행중',   labelCls: 'text-emerald-600 dark:text-emerald-400',       rowBg: '' },
  no_date: { dot: 'bg-stone-300 dark:bg-stone-600', label: '기한없음', labelCls: 'text-stone-400',                              rowBg: '' },
};

const PROGRESS_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// ── 미니 진행률 피커 ───────────────────────────────────────
function MiniPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  const display = hov ?? value;
  const segCls = (s: number) => {
    if (display >= s) {
      if (display === 100) return 'bg-blue-500';
      if (display >= 70) return 'bg-emerald-500';
      if (display >= 40) return 'bg-amber-400';
      return 'bg-stone-400';
    }
    return 'bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600';
  };
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHov(null)}>
      <div className="flex gap-0.5">
        {PROGRESS_STEPS.map(s => (
          <button key={s} type="button"
            onClick={e => { e.stopPropagation(); onChange(value === s ? 0 : s); }}
            onMouseEnter={() => setHov(s)}
            className={`w-3 h-2 rounded-sm transition-colors cursor-pointer ${segCls(s)}`}
            title={`${s}%`}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold tabular-nums text-stone-500 dark:text-stone-400 w-6 text-right">{display}%</span>
    </div>
  );
}

// ── 업무 등록/수정 모달 ────────────────────────────────────
function TaskFormModal({
  task, employees, meetings, projects, defaultProjectId, onSave, onClose,
}: {
  task?: Task;
  employees: Employee[];
  meetings: SimpleMeeting[];
  projects: Project[];
  defaultProjectId?: string;
  onSave: (data: Partial<Task>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [sourceType, setSourceType] = useState<TaskSourceType>(task?.sourceType ?? 'manual');
  const [sourceMeetingId, setSourceMeetingId] = useState(task?.sourceMeetingId ?? '');
  const [sourceAgendaTitle, setSourceAgendaTitle] = useState(task?.sourceAgendaTitle ?? '');
  const [startDate, setStartDate] = useState(task?.startDate ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [note, setNote] = useState(task?.note ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pending');

  const assigneeName = employees.find(e => e.id === assigneeId)?.name ?? assigneeId;

  const handleSave = () => {
    if (!title.trim() || !assigneeId) return;
    onSave({
      title: title.trim(),
      assigneeId,
      assigneeName,
      projectId: projectId || undefined,
      sourceType,
      sourceMeetingId: sourceType === 'meeting' ? (sourceMeetingId || undefined) : undefined,
      sourceAgendaTitle: sourceType === 'meeting' ? (sourceAgendaTitle.trim() || undefined) : undefined,
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      progress,
      note: note.trim() || undefined,
      status,
    });
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-lg border border-stone-200 dark:border-stone-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          <h2 className="text-sm font-black text-stone-900 dark:text-white">{task ? '업무 수정' : '업무 등록'}</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          {/* 업무명 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">업무명 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="업무 내용" autoFocus className={inputCls} />
          </div>

          {/* 프로젝트 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">프로젝트</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
              <option value="">-- 미분류 --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>

          {/* 담당자 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">담당자 *</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
              <option value="">-- 담당자 선택 --</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} {e.position ? `(${e.position})` : ''}</option>)}
            </select>
          </div>

          {/* 출처 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">출처</label>
            <div className="flex gap-2 mb-2">
              {(['manual', 'meeting'] as TaskSourceType[]).map(t => (
                <button key={t} type="button" onClick={() => setSourceType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-sm border transition-colors ${sourceType === t ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                  {t === 'manual' ? <><Plus size={11} /> 직접 등록</> : <><BookOpen size={11} /> 회의에서</>}
                </button>
              ))}
            </div>
            {sourceType === 'meeting' && (
              <div className="space-y-2 pl-1">
                <select value={sourceMeetingId} onChange={e => setSourceMeetingId(e.target.value)} className={inputCls}>
                  <option value="">-- 회의 선택 (선택) --</option>
                  {meetings.map(m => <option key={m.id} value={m.id}>{m.date} {m.title}</option>)}
                </select>
                <input value={sourceAgendaTitle} onChange={e => setSourceAgendaTitle(e.target.value)}
                  placeholder="안건 제목 (선택)" className={inputCls} />
              </div>
            )}
          </div>

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-1">마감일</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 진행률 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-2">진행률</label>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {PROGRESS_STEPS.map(s => {
                  const filled = progress >= s;
                  let cls = 'bg-stone-200 dark:bg-stone-700 hover:bg-stone-300';
                  if (filled) {
                    if (progress === 100) cls = 'bg-blue-500';
                    else if (progress >= 70) cls = 'bg-emerald-500';
                    else if (progress >= 40) cls = 'bg-amber-400';
                    else cls = 'bg-stone-400';
                  }
                  return <button key={s} type="button" onClick={() => setProgress(progress === s ? 0 : s)} className={`w-5 h-4 rounded-sm transition-colors ${cls}`} title={`${s}%`} />;
                })}
              </div>
              <span className="text-sm font-bold tabular-nums text-stone-600 dark:text-stone-300 w-10">{progress}%</span>
            </div>
          </div>

          {/* 상태 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">상태</label>
            <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} className={inputCls}>
              <option value="pending">진행 전</option>
              <option value="in_progress">진행 중</option>
              <option value="done">완료</option>
            </select>
          </div>

          {/* 특이사항 */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 mb-1">특이사항 / 메모</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="특이사항이나 메모를 입력하세요"
              className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
          <button onClick={handleSave} disabled={!title.trim() || !assigneeId}
            className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {task ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 업무 행 ────────────────────────────────────────────────
function TaskRow({
  task, meetingMap, onEdit, onDelete, onProgressChange, onToggleDone,
}: {
  task: Task;
  meetingMap: Map<string, SimpleMeeting>;
  onEdit: () => void;
  onDelete: () => void;
  onProgressChange: (v: number) => void;
  onToggleDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tStatus = getTrackStatus(task);
  const cfg = TRACK_CFG[tStatus];
  const meeting = task.sourceMeetingId ? meetingMap.get(task.sourceMeetingId) : null;
  const dday = getDDay(task.dueDate);
  const isDone = task.status === 'done';

  return (
    <div className={`border-b border-stone-100 dark:border-stone-800 last:border-b-0 ${cfg.rowBg}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
        <button onClick={onToggleDone} title={isDone ? '진행중으로 되돌리기' : '완료 처리'} className="shrink-0 flex items-center gap-1.5 group">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all group-hover:scale-125 ${cfg.dot}`} />
          <span className={`text-[9px] font-bold w-9 ${cfg.labelCls} hidden sm:block`}>{cfg.label}</span>
        </button>
        <button onClick={() => setOpen(v => !v)} className="flex-1 min-w-0 text-left flex items-center gap-1">
          {open ? <ChevronDown size={11} className="text-stone-400 shrink-0" /> : <ChevronRight size={11} className="text-stone-400 shrink-0" />}
          <span className={`text-xs font-bold truncate ${isDone ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'}`}>
            {task.title}
          </span>
        </button>
        <div className="hidden md:flex items-center shrink-0">
          {task.sourceMeetingId && meeting ? (
            <span className="flex items-center gap-1 text-[10px] text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-sm max-w-[100px] truncate">
              <BookOpen size={9} /> {fmtDate(meeting.date)} {meeting.title}
            </span>
          ) : task.sourceType === 'meeting' ? (
            <span className="flex items-center gap-1 text-[10px] text-stone-400"><BookOpen size={9} /> 회의</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-stone-300 dark:text-stone-600"><Plus size={9} /> 직접</span>
          )}
        </div>
        <div className="hidden sm:flex flex-col items-end shrink-0 w-16">
          {task.dueDate && (
            <>
              <span className="text-[10px] text-stone-500 dark:text-stone-400 tabular-nums">{fmtDate(task.dueDate)}</span>
              <span className={`text-[9px] font-bold tabular-nums ${cfg.labelCls}`}>{dday}</span>
            </>
          )}
        </div>
        <div className="shrink-0 w-28 hidden lg:block">
          <MiniPicker value={task.progress ?? 0} onChange={onProgressChange} />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onEdit} className="p-1 text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 rounded-sm transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 text-stone-300 dark:text-stone-600 hover:text-red-500 rounded-sm transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-9 pb-3 space-y-2">
          <div className="lg:hidden"><MiniPicker value={task.progress ?? 0} onChange={onProgressChange} /></div>
          {task.sourceAgendaTitle && (
            <p className="text-[11px] text-stone-400"><span className="font-bold">안건:</span> {task.sourceAgendaTitle}</p>
          )}
          {task.dueDate && (
            <p className="sm:hidden text-[11px] text-stone-400">
              마감 {fmtDate(task.dueDate)} <span className={`font-bold ${cfg.labelCls}`}>{dday}</span>
            </p>
          )}
          {task.note ? (
            <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm px-2.5 py-2">
              <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">{task.note}</p>
            </div>
          ) : (
            <p className="text-[11px] text-stone-300 dark:text-stone-600">특이사항 없음</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 캘린더 탭 ─────────────────────────────────────────────
function CalendarTab({
  tasks, reports, calMonth, setCalMonth, onClickTask, loading,
}: {
  tasks: Task[];
  reports: DailyReport[];
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  onClickTask: (t: Task) => void;
  loading: boolean;
}) {
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();

  const tasksByDate = new Map<string, Task[]>();
  const reportsByDate = new Map<string, DailyReport[]>();

  tasks.filter(t => !!t.dueDate).forEach(t => {
    const d = t.dueDate!;
    if (!tasksByDate.has(d)) tasksByDate.set(d, []);
    tasksByDate.get(d)!.push(t);
  });
  reports.forEach(r => {
    if (!reportsByDate.has(r.date)) reportsByDate.set(r.date, []);
    reportsByDate.get(r.date)!.push(r);
  });

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toYMD(new Date());

  return (
    <div>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCalMonth(new Date(year, month - 1, 1))}
          className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm text-sm">
          ◀
        </button>
        <span className="text-sm font-black text-stone-900 dark:text-white">{year}년 {month + 1}월</span>
        <button
          onClick={() => setCalMonth(new Date(year, month + 1, 1))}
          className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm text-sm">
          ▶
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-px mb-px">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* 달력 그리드 */}
          <div className="grid grid-cols-7 gap-px bg-stone-200 dark:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
            {cells.map((day, i) => {
              if (!day) return (
                <div key={i} className="bg-stone-50 dark:bg-stone-800/40 min-h-[88px]" />
              );
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayTasks = tasksByDate.get(dateStr) ?? [];
              const dayReports = reportsByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSun = i % 7 === 0;
              const isSat = i % 7 === 6;
              // Show max 2 reports + 2 tasks, then overflow
              const shownReports = dayReports.slice(0, 2);
              const remaining = 4 - shownReports.length;
              const shownTasks = dayTasks.slice(0, Math.max(0, remaining));
              const overflowCount = dayReports.length + dayTasks.length - shownReports.length - shownTasks.length;

              return (
                <div key={i} className={`bg-white dark:bg-stone-900 p-1 min-h-[88px] ${isToday ? 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500' : ''}`}>
                  {/* 날짜 숫자 */}
                  <div className={`text-[10px] font-bold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full mx-auto ${isToday ? 'bg-blue-500 dark:bg-blue-600 text-white' : isSun ? 'text-red-500' : isSat ? 'text-blue-500 dark:text-blue-400' : 'text-stone-700 dark:text-stone-300'}`}>
                    {day}
                  </div>

                  <div className="space-y-0.5">
                    {/* 업무보고 칩 */}
                    {shownReports.map(r => (
                      <div key={r.id}
                        title={`${r.employeeName} ${r.type === 'morning' ? '아침' : '저녁'} 업무보고 (${r.items.length}건)`}
                        className={`text-[9px] px-1 py-0.5 rounded-sm truncate leading-tight cursor-default ${r.type === 'morning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'}`}>
                        {r.employeeName} {r.type === 'morning' ? '☀' : '🌙'}
                      </div>
                    ))}

                    {/* 업무 마감 칩 */}
                    {shownTasks.map(t => {
                      const ts2 = getTrackStatus(t);
                      const cls = ts2 === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                : ts2 === 'urgent' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                : ts2 === 'done' ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                                : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
                      return (
                        <button key={t.id} onClick={() => onClickTask(t)}
                          className={`w-full text-[9px] px-1 py-0.5 rounded-sm truncate text-left leading-tight ${cls}`}
                          title={`${t.title} (${t.assigneeName})`}>
                          {t.title}
                        </button>
                      );
                    })}

                    {/* 오버플로우 */}
                    {overflowCount > 0 && (
                      <div className="text-[9px] text-stone-400 px-1">+{overflowCount}개</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 범례 */}
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { cls: 'bg-amber-100 dark:bg-amber-900/30', label: '아침 업무보고' },
              { cls: 'bg-indigo-100 dark:bg-indigo-900/30', label: '저녁 업무보고' },
              { cls: 'bg-red-100 dark:bg-red-900/30', label: '지연 업무' },
              { cls: 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300', label: '임박 업무' },
              { cls: 'bg-emerald-100 dark:bg-emerald-900/30', label: '진행중 업무' },
            ].map(({ cls, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded-sm ${cls}`} />
                <span className="text-[10px] text-stone-500 dark:text-stone-400">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── 타임라인 뷰 ────────────────────────────────────────────
function TimelineView({
  tasks, meetingMap, employees, onEdit,
}: {
  tasks: Task[];
  meetingMap: Map<string, SimpleMeeting>;
  employees: Employee[];
  onEdit: (task: Task) => void;
}) {
  const [rangeType, setRangeType] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { rangeStart, rangeEnd } = (() => {
    if (rangeType === 'week') {
      const day = today.getDay();
      const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { rangeStart: mon, rangeEnd: sun };
    } else {
      const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
      return { rangeStart: first, rangeEnd: last };
    }
  })();

  const totalMs = rangeEnd.getTime() - rangeStart.getTime() + 86400000;
  const pct = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100));
  const todayPct = pct(today);

  const dayLabels: { label: string; p: number }[] = [];
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    if (rangeType === 'week' || cur.getDate() % 5 === 1 || cur.getDate() === 1) {
      dayLabels.push({ label: `${cur.getMonth() + 1}/${cur.getDate()}`, p: pct(cur) });
    }
    cur.setDate(cur.getDate() + (rangeType === 'week' ? 1 : 5));
  }

  const grouped = new Map<string, { name: string; tasks: Task[] }>();
  tasks.forEach(t => {
    if (!grouped.has(t.assigneeId)) grouped.set(t.assigneeId, { name: t.assigneeName, tasks: [] });
    grouped.get(t.assigneeId)!.tasks.push(t);
  });

  const rangeLabel = rangeType === 'week'
    ? `${rangeStart.getMonth() + 1}/${rangeStart.getDate()} ~ ${rangeEnd.getMonth() + 1}/${rangeEnd.getDate()}`
    : `${rangeStart.getFullYear()}년 ${rangeStart.getMonth() + 1}월`;

  const TRACK_BAR_CLS: Record<TrackStatus, string> = {
    done:    'bg-stone-300 dark:bg-stone-600',
    late:    'bg-red-400 dark:bg-red-600',
    urgent:  'bg-amber-400 dark:bg-amber-500',
    normal:  'bg-emerald-400 dark:bg-emerald-600',
    no_date: 'bg-stone-200 dark:bg-stone-700',
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {(['week', 'month'] as const).map(r => (
            <button key={r} onClick={() => { setRangeType(r); setOffset(0); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-sm border transition-colors ${rangeType === r ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
              {r === 'week' ? '주간' : '월간'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(v => v - 1)} className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">◀</button>
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300 w-28 text-center">{rangeLabel}</span>
          <button onClick={() => setOffset(v => v + 1)} className="p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">▶</button>
          <button onClick={() => setOffset(0)} className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1 rounded-sm">오늘</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex mb-1">
            <div className="w-24 shrink-0" />
            <div className="flex-1 relative h-6 border-b border-stone-200 dark:border-stone-700">
              {dayLabels.map((lbl, i) => (
                <span key={i} className="absolute bottom-0.5 text-[9px] text-stone-400 font-bold" style={{ left: `${lbl.p}%` }}>{lbl.label}</span>
              ))}
              {todayPct >= 0 && todayPct <= 100 && (
                <span className="absolute bottom-0.5 text-[9px] font-black text-red-400" style={{ left: `${todayPct}%`, transform: 'translateX(-50%)' }}>오늘</span>
              )}
            </div>
          </div>
          {[...grouped.entries()].map(([assigneeId, { name, tasks: aTasks }]) => (
            <div key={assigneeId} className="mb-3">
              <div className="flex items-center h-6 mb-0.5">
                <div className="w-24 shrink-0 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[9px] font-black text-stone-600 dark:text-stone-300 shrink-0">{name[0]}</div>
                  <span className="text-[11px] font-bold text-stone-700 dark:text-stone-300 truncate">{name}</span>
                </div>
                <div className="flex-1 h-px bg-stone-100 dark:bg-stone-800" />
              </div>
              {aTasks.map(task => {
                const tStatus = getTrackStatus(task);
                const barCls = TRACK_BAR_CLS[tStatus];
                if (!task.dueDate) {
                  return (
                    <div key={task.id} className="flex items-center h-7 border-b border-stone-50 dark:border-stone-800/50">
                      <div className="w-24 shrink-0" />
                      <div className="flex-1 relative h-full">
                        <div className="absolute top-0 bottom-0 w-px bg-red-200 dark:bg-red-900/40" style={{ left: `${todayPct}%` }} />
                        <div className={`absolute top-1/2 w-2 h-2 rotate-45 ${barCls}`} style={{ left: `${todayPct}%`, transform: 'translateY(-50%) translateX(-50%) rotate(45deg)' }} />
                        <button onClick={() => onEdit(task)} className="absolute inset-0 flex items-center" style={{ left: `${Math.min(todayPct + 0.5, 95)}%` }}>
                          <span className="text-[9px] text-stone-400 truncate max-w-[80px]">{task.title}</span>
                        </button>
                      </div>
                    </div>
                  );
                }
                const dueD = new Date(task.dueDate + 'T00:00:00');
                const startD = task.startDate ? new Date(task.startDate + 'T00:00:00') : new Date(dueD.getTime() - 6 * 86400000);
                const barLeft = pct(startD);
                const barWidth = Math.max(pct(dueD) - barLeft, 0.8);
                const prog = task.progress ?? 0;
                return (
                  <div key={task.id} className="flex items-center h-7 border-b border-stone-50 dark:border-stone-800/50">
                    <div className="w-24 shrink-0" />
                    <div className="flex-1 relative h-full">
                      {todayPct >= 0 && todayPct <= 100 && (
                        <div className="absolute inset-y-0 w-px bg-red-300/50 dark:bg-red-700/40" style={{ left: `${todayPct}%` }} />
                      )}
                      <button onClick={() => onEdit(task)} className="absolute top-1/2 -translate-y-1/2 group" style={{ left: `${barLeft}%`, width: `${barWidth}%` }}>
                        <div className={`h-4 rounded-sm ${barCls} opacity-30 dark:opacity-20`} />
                        <div className={`absolute inset-y-0 left-0 rounded-sm ${barCls}`} style={{ width: `${prog}%` }} />
                        <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                          <span className={`text-[9px] font-bold truncate ${task.status === 'done' ? 'line-through text-stone-400' : 'text-stone-700 dark:text-white'}`}>{task.title}</span>
                          {prog > 0 && <span className="text-[8px] text-stone-500 dark:text-white/60 ml-1 shrink-0">{prog}%</span>}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {grouped.size === 0 && (
            <div className="text-center py-12 text-xs text-stone-400">이 기간에 업무가 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export function WorkMapView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [meetings, setMeetings] = useState<SimpleMeeting[]>([]);
  const [meetingMap, setMeetingMap] = useState<Map<string, SimpleMeeting>>(new Map());
  const [monthReports, setMonthReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectListTab, setProjectListTab] = useState<'active' | 'done'>('active');
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'timeline'>('list');
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | TrackStatus>('all');
  const [filterAssignee, setFilterAssignee] = useState('');

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);

  // ── 데이터 로드 ───────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projectSnap, taskSnap, empSnap, meetingSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'projects'), orderBy('updatedAt', 'desc'))),
        getDocs(collection(salesDb, 'tasks')),
        getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
        getDocs(query(collection(db, 'meetings'), orderBy('date', 'desc'))),
      ]);
      setProjects(projectSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkProject)));
      const loadedTasks = taskSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Task))
        .filter(t => t.status !== 'rejected')
        .sort((a, b) => {
          const order: Record<TrackStatus, number> = { late: 0, urgent: 1, normal: 2, no_date: 3, done: 4 };
          const sa = order[getTrackStatus(a)];
          const sb = order[getTrackStatus(b)];
          if (sa !== sb) return sa - sb;
          return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
        });
      setTasks(loadedTasks);
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
      const mtgs = meetingSnap.docs.slice(0, 50).map(d => ({ id: d.id, ...d.data() } as SimpleMeeting));
      setMeetings(mtgs);
      setMeetingMap(new Map(mtgs.map(m => [m.id, m])));
    } catch (e) {
      console.error('WorkMapView loadAll error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 캘린더 탭 활성 시 해당 월 업무보고 로드
  useEffect(() => {
    if (activeTab !== 'calendar') return;
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    setLoadingReports(true);
    getDocs(query(
      collection(salesDb, 'daily_reports'),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    )).then(snap => {
      setMonthReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport)));
    }).catch(console.error).finally(() => setLoadingReports(false));
  }, [activeTab, calMonth]);

  // ── 업무 CRUD ─────────────────────────────────────────────
  const handleSaveTask = async (data: Partial<Task>) => {
    try {
      if (editingTask) {
        await updateDoc(doc(salesDb, 'tasks', editingTask.id), { ...data, updatedAt: nowTs() });
        toast.success('수정됨');
      } else {
        const id = genId('task');
        const now = nowTs();
        await setDoc(doc(salesDb, 'tasks', id), {
          id, ...data, status: data.status ?? 'pending', createdAt: now, updatedAt: now,
        });
        toast.success('업무 등록됨');
      }
      setShowTaskForm(false);
      setEditingTask(null);
      await loadAll();
    } catch { toast.error('저장 실패'); }
  };

  const handleDeleteTask = async (task: Task) => {
    const ok = await confirm({ title: '업무 삭제', message: `"${task.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(salesDb, 'tasks', task.id));
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast.success('삭제됨');
    } catch { toast.error('삭제 실패'); }
  };

  const handleProgressChange = async (taskId: string, progress: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress } : t));
    try {
      await updateDoc(doc(salesDb, 'tasks', taskId), { progress, updatedAt: nowTs() });
    } catch { toast.error('저장 실패'); }
  };

  const handleToggleDone = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'done' ? 'in_progress' : 'done';
    const newProgress = newStatus === 'done' ? 100 : task.progress;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, progress: newProgress } : t));
    try {
      await updateDoc(doc(salesDb, 'tasks', task.id), { status: newStatus, progress: newProgress, updatedAt: nowTs() });
    } catch { toast.error('저장 실패'); }
  };

  // ── 파생 데이터 ───────────────────────────────────────────
  // 활성: active + on_hold / 완료·보관: completed + archived
  const visibleProjects = projects.filter(p =>
    projectListTab === 'active'
      ? p.status === 'active' || p.status === 'on_hold'
      : p.status === 'completed' || p.status === 'archived'
  );

  const filteredTasks = tasks.filter(t => {
    if (selectedProjectId !== null && t.projectId !== selectedProjectId) return false;
    if (filterStatus !== 'all' && getTrackStatus(t) !== filterStatus) return false;
    if (filterAssignee && t.assigneeId !== filterAssignee) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) ||
        t.assigneeName.toLowerCase().includes(q) ||
        (t.note?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  const grouped = new Map<string, { name: string; tasks: Task[] }>();
  filteredTasks.forEach(t => {
    if (!grouped.has(t.assigneeId)) grouped.set(t.assigneeId, { name: t.assigneeName, tasks: [] });
    grouped.get(t.assigneeId)!.tasks.push(t);
  });

  const projectActiveCounts = new Map<string, number>();
  tasks.forEach(t => {
    if (t.projectId && t.status !== 'done')
      projectActiveCounts.set(t.projectId, (projectActiveCounts.get(t.projectId) ?? 0) + 1);
  });

  const totalActive = tasks.filter(t => t.status !== 'done').length;

  const counts = { late: 0, urgent: 0, normal: 0, no_date: 0, done: 0 };
  filteredTasks.forEach(t => { counts[getTrackStatus(t)]++; });

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex min-h-0" style={{ height: 'calc(100vh - 140px)' }}>

      {/* ── 좌측 사이드바 ─────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col border-r border-stone-200 dark:border-stone-700 overflow-hidden bg-stone-50 dark:bg-stone-900">
        {/* 헤더 */}
        <div className="px-3 pt-3 pb-2 border-b border-stone-200 dark:border-stone-800">
          <div className="mb-2">
            <span className="text-[10px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest">프로젝트</span>
            <p className="text-[9px] text-stone-400 dark:text-stone-500 mt-0.5">프로젝트 메뉴에서 관리</p>
          </div>
          <div className="flex gap-0.5">
            {(['active', 'done'] as const).map(tab => (
              <button key={tab} onClick={() => setProjectListTab(tab)}
                className={`flex-1 py-1 text-[10px] font-bold rounded-sm transition-colors ${projectListTab === tab ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700'}`}>
                {tab === 'active' ? '진행중' : '완료'}
              </button>
            ))}
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* 전체 업무 (활성 탭에서만) */}
          {projectListTab === 'active' && (
            <button
              onClick={() => setSelectedProjectId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${selectedProjectId === null ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500 text-blue-700 dark:text-blue-400' : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 border-l-2 border-transparent'}`}>
              <Users size={13} className="shrink-0" />
              <span className="flex-1 text-xs font-bold truncate">전체 업무</span>
              {totalActive > 0 && (
                <span className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums">{totalActive}</span>
              )}
            </button>
          )}

          {/* 프로젝트 아이템 */}
          {visibleProjects.map(p => {
            const activeCnt = projectActiveCounts.get(p.id) ?? 0;
            const statusDot = p.status === 'on_hold'
              ? 'bg-amber-400'
              : p.status === 'completed' ? 'bg-stone-300 dark:bg-stone-600'
              : 'bg-emerald-500';
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${selectedProjectId === p.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500 text-blue-700 dark:text-blue-400' : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 border-l-2 border-transparent'}`}>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                <span className="flex-1 text-xs font-bold truncate">{p.title}</span>
                {activeCnt > 0 && (
                  <span className="text-[10px] text-stone-400 tabular-nums">{activeCnt}</span>
                )}
              </button>
            );
          })}

          {visibleProjects.length === 0 && (
            <div className="px-3 py-5 text-center">
              <p className="text-[10px] text-stone-400">
                {projectListTab === 'active' ? '진행중인 프로젝트 없음' : '완료된 프로젝트 없음'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 우측 메인 패널 ─────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 패널 헤더 */}
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div>
            <h1 className="text-base font-black text-stone-900 dark:text-white">
              {selectedProject ? selectedProject.title : '전체 업무'}
            </h1>
            {selectedProject?.description && (
              <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 max-w-xs truncate">
                {selectedProject.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px]">
              {counts.late > 0 && <span className="text-red-500 font-bold">지연 {counts.late}</span>}
              {counts.urgent > 0 && <span className="text-amber-600 dark:text-amber-400 font-bold">임박 {counts.urgent}</span>}
              <span className="text-stone-400">{counts.done}/{filteredTasks.length} 완료</span>
            </div>
            <button
              onClick={() => { setEditingTask(null); setShowTaskForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors">
              <Plus size={13} /> 업무 추가
            </button>
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="flex border-b border-stone-200 dark:border-stone-700 px-4 shrink-0">
          {([
            { key: 'list' as const,     label: '목록',     icon: LayoutList },
            { key: 'calendar' as const, label: '캘린더',   icon: Calendar },
            { key: 'timeline' as const, label: '타임라인', icon: BarChart2 },
          ]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${activeTab === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── 목록 탭 ── */}
          {activeTab === 'list' && (
            <>
              {/* 검색 + 담당자 필터 */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                  <Search size={13} className="text-stone-400 shrink-0" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="업무명·담당자 검색..."
                    className="flex-1 text-xs bg-transparent text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none" />
                  {search && <button onClick={() => setSearch('')} className="text-stone-400 hover:text-stone-700"><X size={12} /></button>}
                </div>
                <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
                  className="text-xs border border-stone-200 dark:border-stone-600 rounded-sm px-2 py-2 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none">
                  <option value="">전체 담당자</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* 상태 필터 탭 */}
              <div className="flex gap-1 border-b border-stone-200 dark:border-stone-700 mb-4 overflow-x-auto">
                {([
                  { key: 'all' as const,     label: `전체 ${filteredTasks.length}` },
                  { key: 'late' as const,    label: `지연 ${counts.late}` },
                  { key: 'urgent' as const,  label: `임박 ${counts.urgent}` },
                  { key: 'normal' as const,  label: `진행중 ${counts.normal}` },
                  { key: 'done' as const,    label: `완료 ${counts.done}` },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setFilterStatus(key)}
                    className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${filterStatus === key ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'} ${key === 'late' && counts.late > 0 && filterStatus !== 'late' ? 'text-red-400' : ''} ${key === 'urgent' && counts.urgent > 0 && filterStatus !== 'urgent' ? 'text-amber-500' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* 담당자별 그룹 */}
              {grouped.size === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <CheckCircle2 size={40} className="text-stone-300 dark:text-stone-600 mb-3" />
                  <p className="text-sm font-bold text-stone-500 dark:text-stone-400">
                    {search || filterAssignee || filterStatus !== 'all' ? '검색 결과가 없습니다' : '이 프로젝트에 업무가 없습니다'}
                  </p>
                  {!search && filterStatus === 'all' && (
                    <button onClick={() => setShowTaskForm(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">
                      첫 업무 추가하기
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {[...grouped.entries()].map(([assigneeId, { name, tasks: aTasks }]) => {
                    const doneCount = aTasks.filter(t => t.status === 'done').length;
                    const lateCount = aTasks.filter(t => getTrackStatus(t) === 'late').length;
                    const emp = employees.find(e => e.id === assigneeId);
                    return (
                      <div key={assigneeId} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                          <div className="w-7 h-7 rounded-full bg-stone-800 dark:bg-stone-200 flex items-center justify-center text-xs font-black text-white dark:text-stone-900 shrink-0">
                            {name[0]}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-black text-stone-800 dark:text-stone-200">{name}</span>
                            {emp?.position && <span className="text-[10px] text-stone-400 ml-1.5">{emp.position}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            {lateCount > 0 && (
                              <span className="font-bold text-red-500 flex items-center gap-0.5">
                                <AlertCircle size={10} /> 지연 {lateCount}
                              </span>
                            )}
                            <span className="text-stone-400">{doneCount}/{aTasks.length} 완료</span>
                            <div className="w-16 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${aTasks.length > 0 ? Math.round(doneCount / aTasks.length * 100) : 0}%` }} />
                            </div>
                          </div>
                        </div>
                        {aTasks.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            meetingMap={meetingMap}
                            onEdit={() => { setEditingTask(task); setShowTaskForm(true); }}
                            onDelete={() => handleDeleteTask(task)}
                            onProgressChange={v => handleProgressChange(task.id, v)}
                            onToggleDone={() => handleToggleDone(task)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── 캘린더 탭 ── */}
          {activeTab === 'calendar' && (
            <CalendarTab
              tasks={filteredTasks}
              reports={monthReports}
              calMonth={calMonth}
              setCalMonth={setCalMonth}
              onClickTask={task => { setEditingTask(task); setShowTaskForm(true); }}
              loading={loadingReports}
            />
          )}

          {/* ── 타임라인 탭 ── */}
          {activeTab === 'timeline' && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-4">
              <TimelineView
                tasks={filteredTasks}
                meetingMap={meetingMap}
                employees={employees}
                onEdit={task => { setEditingTask(task); setShowTaskForm(true); }}
              />
            </div>
          )}

        </div>
      </div>

      {/* 업무 폼 모달 */}
      {showTaskForm && (
        <TaskFormModal
          task={editingTask ?? undefined}
          employees={employees}
          meetings={meetings}
          projects={projects.filter(p => p.status === 'active' || p.status === 'on_hold')}
          defaultProjectId={selectedProjectId ?? undefined}
          onSave={handleSaveTask}
          onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
