import React, { useState, useEffect, useMemo } from 'react';
import { salesDb as db } from '../../firebase';
import {
  collection, getDocs, query, where, updateDoc, doc
} from 'firebase/firestore';
import {
  FranchiseSchedule, Department, DepartmentTask, DepartmentTaskStatus, User
} from '../../types';
import {
  CheckCircle2, Clock, AlertCircle, Ban, ChevronDown, ChevronUp,
  Calendar, LayoutList, Search
} from 'lucide-react';
import { useToast } from '../Toast';

// ==========================================
// 상수 / 유틸
// ==========================================

const STATUS_CONFIG: Record<DepartmentTaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: '대기중',   color: 'text-stone-400',                  icon: <Clock size={14} /> },
  in_progress: { label: '진행중',   color: 'text-blue-500',                   icon: <AlertCircle size={14} /> },
  done:        { label: '완료',     color: 'text-green-500',                  icon: <CheckCircle2 size={14} /> },
  blocked:     { label: '보류',     color: 'text-red-400',                    icon: <Ban size={14} /> },
};

const STATUS_CYCLE: DepartmentTaskStatus[] = ['pending', 'in_progress', 'done', 'blocked'];

const formatDue = (dueDate: string, openDate: string) => {
  const due = new Date(dueDate);
  const open = new Date(openDate);
  const diffDays = Math.round((due.getTime() - open.getTime()) / 86400000);
  const label = diffDays === 0 ? 'D-day' : diffDays < 0 ? `D${diffDays}` : `D+${diffDays}`;
  return { date: dueDate, label };
};

const today = new Date().toISOString().split('T')[0];

const isOverdue = (task: DepartmentTask) =>
  task.status !== 'done' && task.dueDate < today;

// ==========================================
// 단일 태스크 행
// ==========================================
function TaskRow({
  task,
  onStatusChange,
  onNoteChange,
  currentUser,
}: {
  task: DepartmentTask;
  onStatusChange: (id: string, status: DepartmentTaskStatus, completedBy?: string) => void;
  onNoteChange: (id: string, note: string) => void;
  currentUser: User | null;
}) {
  const [editNote, setEditNote] = useState(false);
  const [noteVal, setNoteVal] = useState(task.note || '');
  const cfg = STATUS_CONFIG[task.status];
  const overdue = isOverdue(task);

  const cycleStatus = () => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length];
    onStatusChange(task.id, next, next === 'done' ? (currentUser?.name || '알 수 없음') : undefined);
  };

  return (
    <div className={`flex items-start gap-3 py-2.5 px-3 rounded transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 ${overdue ? 'border-l-2 border-red-400' : ''}`}>
      {/* 상태 토글 버튼 */}
      <button
        onClick={cycleStatus}
        className={`mt-0.5 flex-shrink-0 ${cfg.color} hover:opacity-70 transition-opacity`}
        title={`현재: ${cfg.label} → 클릭하여 변경`}
      >
        {cfg.icon}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-bold ${task.status === 'done' ? 'line-through text-stone-400' : 'text-stone-800 dark:text-white'}`}>
            {task.title}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            overdue
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
          }`}>
            {task.dueDate} ({task.dDayOffset === 0 ? 'D-day' : task.dDayOffset < 0 ? `D${task.dDayOffset}` : `D+${task.dDayOffset}`})
            {overdue && ' ⚠️ 기한초과'}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            task.status === 'done' ? 'border-green-300 text-green-600 dark:text-green-400' :
            task.status === 'in_progress' ? 'border-blue-300 text-blue-600 dark:text-blue-400' :
            task.status === 'blocked' ? 'border-red-300 text-red-500' :
            'border-stone-200 text-stone-400'
          }`}>
            {cfg.label}
          </span>
        </div>

        {/* 완료자 표시 */}
        {task.status === 'done' && task.completedBy && (
          <p className="text-xs text-stone-400 mt-0.5">완료: {task.completedBy} · {task.completedAt?.slice(0, 10)}</p>
        )}

        {/* 메모 */}
        {editNote ? (
          <div className="flex gap-2 mt-1">
            <input
              value={noteVal}
              onChange={e => setNoteVal(e.target.value)}
              className="flex-1 text-xs px-2 py-1 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
              placeholder="메모 입력..."
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  onNoteChange(task.id, noteVal);
                  setEditNote(false);
                }
                if (e.key === 'Escape') setEditNote(false);
              }}
            />
            <button onClick={() => { onNoteChange(task.id, noteVal); setEditNote(false); }} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">저장</button>
            <button onClick={() => setEditNote(false)} className="text-xs px-2 py-1 text-stone-500 border border-stone-300 dark:border-stone-600 rounded">취소</button>
          </div>
        ) : (
          <button
            onClick={() => setEditNote(true)}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 mt-0.5 text-left"
          >
            {task.note ? `📝 ${task.note}` : '+ 메모 추가'}
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 부서 섹션
// ==========================================
function DeptSection({
  dept,
  tasks,
  schedules,
  onStatusChange,
  onNoteChange,
  currentUser,
}: {
  dept: Department;
  tasks: DepartmentTask[];
  schedules: FranchiseSchedule[];
  onStatusChange: (id: string, status: DepartmentTaskStatus, completedBy?: string) => void;
  onNoteChange: (id: string, note: string) => void;
  currentUser: User | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => isOverdue(t)).length;

  // 매장별로 그룹화
  const bySchedule = useMemo(() => {
    const map: Record<string, { schedule: FranchiseSchedule; tasks: DepartmentTask[] }> = {};
    for (const t of tasks) {
      const sch = schedules.find(s => s.id === t.scheduleId);
      if (!sch) continue;
      if (!map[t.scheduleId]) map[t.scheduleId] = { schedule: sch, tasks: [] };
      map[t.scheduleId].tasks.push(t);
    }
    return Object.values(map).sort((a, b) => (a.schedule.openDate || '').localeCompare(b.schedule.openDate || ''));
  }, [tasks, schedules]);

  return (
    <div className="border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/50"
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-3 h-3 rounded-full ${dept.color}`} />
          <span className="text-sm font-black text-stone-800 dark:text-white">{dept.name}</span>
          <span className="text-xs text-stone-500">{done}/{tasks.length} 완료</span>
          {overdue > 0 && (
            <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
              기한초과 {overdue}건
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
      </button>

      {expanded && (
        <div className="divide-y divide-stone-100 dark:divide-stone-800 bg-white dark:bg-stone-900">
          {bySchedule.length === 0 && (
            <p className="text-xs text-stone-400 py-4 text-center">태스크 없음</p>
          )}
          {bySchedule.map(({ schedule, tasks: sTasks }) => (
            <div key={schedule.id} className="px-2 py-2">
              <div className="flex items-center gap-2 mb-1 px-1">
                <Calendar size={12} className="text-stone-400" />
                <span className="text-xs font-bold text-stone-600 dark:text-stone-300">{schedule.storeName}</span>
                {schedule.openDate && (
                  <span className="text-[10px] text-stone-400">오픈 {schedule.openDate}</span>
                )}
              </div>
              {sTasks
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map(t => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onStatusChange={onStatusChange}
                    onNoteChange={onNoteChange}
                    currentUser={currentUser}
                  />
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 메인 컴포넌트
// ==========================================

type ViewMode = 'dept' | 'schedule' | 'overview';

interface Props {
  brandId: string;
  schedules: FranchiseSchedule[];
  currentUser: User | null;
}

export function DepartmentTaskView({ brandId, schedules, currentUser }: Props) {
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<DepartmentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('dept');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DepartmentTaskStatus | 'all'>('all');

  const activeSchedules = schedules.filter(s => !s.archived);

  // 부서 목록
  useEffect(() => {
    getDocs(query(collection(db, 'departments'), where('brandId', '==', brandId)))
      .then(snap => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department))));
  }, [brandId]);

  // 태스크 목록
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const activeIds = activeSchedules.map(s => s.id);
      if (activeIds.length === 0) { setTasks([]); return; }

      // Firestore 'in' 쿼리는 30개 제한 → 청크 처리
      const CHUNK = 30;
      const all: DepartmentTask[] = [];
      for (let i = 0; i < activeIds.length; i += CHUNK) {
        const chunk = activeIds.slice(i, i + CHUNK);
        const snap = await getDocs(
          query(collection(db, 'department_tasks'), where('scheduleId', 'in', chunk))
        );
        all.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentTask)));
      }
      setTasks(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [brandId, schedules.length]);

  const handleStatusChange = async (id: string, status: DepartmentTaskStatus, completedBy?: string) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t, status,
      completedBy: status === 'done' ? completedBy : undefined,
      completedAt: status === 'done' ? now : undefined,
      updatedAt: now,
    } : t));
    try {
      await updateDoc(doc(db, 'department_tasks', id), {
        status,
        ...(status === 'done' ? { completedBy, completedAt: now } : { completedBy: null, completedAt: null }),
        updatedAt: now,
      });
    } catch {
      toast.error('상태 변경 실패');
      fetchTasks();
    }
  };

  const handleNoteChange = async (id: string, note: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, note } : t));
    await updateDoc(doc(db, 'department_tasks', id), { note, updatedAt: new Date().toISOString() });
  };

  // 필터링
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (selectedDeptId !== 'all' && t.departmentId !== selectedDeptId) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, selectedDeptId, filterStatus, search]);

  // 관리자 통합 현황: 매장 × 부서별 완료율
  const overviewData = useMemo(() => {
    return activeSchedules.map(sch => {
      const schTasks = filteredTasks.filter(t => t.scheduleId === sch.id);
      const deptStats = departments.map(dept => {
        const dTasks = schTasks.filter(t => t.departmentId === dept.id);
        const done = dTasks.filter(t => t.status === 'done').length;
        return { dept, total: dTasks.length, done, rate: dTasks.length > 0 ? done / dTasks.length : null };
      });
      const totalDone = schTasks.filter(t => t.status === 'done').length;
      const overdue = schTasks.filter(t => isOverdue(t)).length;
      return { schedule: sch, deptStats, totalDone, totalTasks: schTasks.length, overdue };
    }).filter(r => r.totalTasks > 0)
      .sort((a, b) => (a.schedule.openDate || '').localeCompare(b.schedule.openDate || ''));
  }, [activeSchedules, filteredTasks, departments]);

  if (loading) return <div className="py-12 text-center text-sm text-stone-400">불러오는 중...</div>;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <LayoutList size={36} className="text-stone-300" />
        <p className="text-sm font-bold text-stone-500 dark:text-stone-400">생성된 태스크가 없습니다.</p>
        <p className="text-xs text-stone-400 dark:text-stone-500">
          관리자 패널에서 부서와 태스크 템플릿을 설정한 후<br />
          오픈 일정을 등록하면 태스크가 자동으로 생성됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 뷰 모드 */}
        <div className="flex bg-stone-100 dark:bg-stone-800 rounded p-1 gap-1">
          {([['dept', '부서별'], ['schedule', '매장별'], ['overview', '통합 현황']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 부서 필터 */}
        {viewMode !== 'overview' && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedDeptId('all')}
              className={`px-2 py-1 text-xs font-bold rounded border transition-colors ${
                selectedDeptId === 'all'
                  ? 'bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800'
                  : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300'
              }`}
            >
              전체
            </button>
            {departments.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDeptId(d.id)}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border transition-colors ${
                  selectedDeptId === d.id
                    ? 'bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800'
                    : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${d.color}`} />
                {d.name}
              </button>
            ))}
          </div>
        )}

        {/* 상태 필터 */}
        {viewMode !== 'overview' && (
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as DepartmentTaskStatus | 'all')}
            className="text-xs px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300"
          >
            <option value="all">전체 상태</option>
            {(Object.entries(STATUS_CONFIG) as [DepartmentTaskStatus, typeof STATUS_CONFIG[DepartmentTaskStatus]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        )}

        {/* 검색 */}
        {viewMode !== 'overview' && (
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="태스크 검색..."
              className="pl-6 pr-3 py-1.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-white"
            />
          </div>
        )}

        <span className="text-xs text-stone-400 ml-auto">
          {filteredTasks.filter(t => t.status === 'done').length}/{filteredTasks.length} 완료
          {filteredTasks.filter(t => isOverdue(t)).length > 0 && (
            <span className="ml-2 text-red-500 font-bold">
              · 기한초과 {filteredTasks.filter(t => isOverdue(t)).length}건
            </span>
          )}
        </span>
      </div>

      {/* 부서별 뷰 */}
      {viewMode === 'dept' && (
        <div className="space-y-3">
          {departments
            .filter(d => selectedDeptId === 'all' || d.id === selectedDeptId)
            .map(dept => {
              const dTasks = filteredTasks.filter(t => t.departmentId === dept.id);
              if (dTasks.length === 0) return null;
              return (
                <DeptSection
                  key={dept.id}
                  dept={dept}
                  tasks={dTasks}
                  schedules={activeSchedules}
                  onStatusChange={handleStatusChange}
                  onNoteChange={handleNoteChange}
                  currentUser={currentUser}
                />
              );
            })}
        </div>
      )}

      {/* 매장별 뷰 */}
      {viewMode === 'schedule' && (
        <div className="space-y-3">
          {activeSchedules.map(sch => {
            const sTasks = filteredTasks.filter(t => t.scheduleId === sch.id);
            if (sTasks.length === 0) return null;
            const done = sTasks.filter(t => t.status === 'done').length;
            return (
              <div key={sch.id} className="border border-stone-200 dark:border-stone-700 rounded-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-stone-50 dark:bg-stone-800">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full bg-${sch.colorCode || 'stone'}-500`} />
                    <span className="text-sm font-black text-stone-800 dark:text-white">{sch.storeName}</span>
                    {sch.openDate && <span className="text-xs text-stone-400">오픈 {sch.openDate}</span>}
                    <span className="text-xs text-stone-500">{done}/{sTasks.length} 완료</span>
                  </div>
                </div>
                <div className="bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800">
                  {sTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(t => (
                    <div key={t.id} className="px-3">
                      <TaskRow task={t} onStatusChange={handleStatusChange} onNoteChange={handleNoteChange} currentUser={currentUser} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 통합 현황 (관리자용) */}
      {viewMode === 'overview' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                <th className="text-left py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">매장</th>
                <th className="text-center py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">오픈일</th>
                {departments.map(d => (
                  <th key={d.id} className="text-center py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${d.color}`} />
                      {d.name}
                    </div>
                  </th>
                ))}
                <th className="text-center py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">전체</th>
                <th className="text-center py-2.5 px-3 text-xs font-bold text-red-400 uppercase tracking-wider">기한초과</th>
              </tr>
            </thead>
            <tbody>
              {overviewData.map(({ schedule, deptStats, totalDone, totalTasks, overdue }, i) => (
                <tr key={schedule.id} className={`border-b border-stone-100 dark:border-stone-800 ${i % 2 === 0 ? '' : 'bg-stone-50 dark:bg-stone-800/30'}`}>
                  <td className="py-2.5 px-3 font-bold text-stone-800 dark:text-white">{schedule.storeName}</td>
                  <td className="py-2.5 px-3 text-center text-xs text-stone-500">{schedule.openDate || '-'}</td>
                  {deptStats.map(({ dept, total, done, rate }) => (
                    <td key={dept.id} className="py-2.5 px-3 text-center">
                      {rate === null ? (
                        <span className="text-stone-300 text-xs">-</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-xs font-bold ${rate === 1 ? 'text-green-600 dark:text-green-400' : rate > 0.5 ? 'text-blue-600 dark:text-blue-400' : 'text-stone-500'}`}>
                            {done}/{total}
                          </span>
                          <div className="w-12 h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${rate === 1 ? 'bg-green-500' : rate > 0.5 ? 'bg-blue-500' : 'bg-stone-300'}`}
                              style={{ width: `${rate * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs font-bold ${totalDone === totalTasks ? 'text-green-600 dark:text-green-400' : 'text-stone-600 dark:text-stone-300'}`}>
                      {Math.round((totalDone / totalTasks) * 100)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {overdue > 0
                      ? <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{overdue}건</span>
                      : <span className="text-xs text-stone-300">-</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
