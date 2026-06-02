import React, { useState, useEffect, useMemo } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { CalendarEvent, CalendarEventType, LeaveRequest, LeaveType, LeaveStatus, Employee, User, CalendarRoutine } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, ChevronLeft, ChevronRight, X, Check, Calendar, Clock, RefreshCw, Repeat, Trash2, Edit2 } from 'lucide-react';

/* ── 상수 ──────────────────────────────────────────────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const EVENT_COLORS: Record<CalendarEventType, string> = {
  personal:  'bg-blue-500',
  company:   'bg-emerald-500',
  holiday:   'bg-red-400',
  leave:     'bg-amber-400',
  meeting:   'bg-purple-500',
  franchise: 'bg-orange-400',
};
const EVENT_TEXT: Record<CalendarEventType, string> = {
  personal:  '개인',
  company:   '회사',
  holiday:   '공휴일',
  leave:     '연차',
  meeting:   '회의',
  franchise: '오픈',
};
const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual:   '연차',
  half_am:  '반차 (오전)',
  half_pm:  '반차 (오후)',
  sick:     '병가',
  special:  '경조사',
};
const LEAVE_DAYS: Record<LeaveType, number> = {
  annual: 1, half_am: 0.5, half_pm: 0.5, sick: 1, special: 1,
};

const genId = () => `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYMD = (s: string) => new Date(s + 'T00:00:00');
const fmtKor = (s: string) => {
  const d = parseYMD(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/* ── 이벤트 폼 ──────────────────────────────────────────── */
interface EventForm {
  title: string;
  type: CalendarEventType;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  visibility: 'private' | 'team' | 'all';
}
const emptyEventForm = (date?: string): EventForm => ({
  title: '', type: 'personal',
  startDate: date ?? toYMD(new Date()), endDate: date ?? toYMD(new Date()),
  allDay: true, startTime: '09:00', endTime: '18:00', visibility: 'all',
});

interface LeaveForm {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}
const emptyLeaveForm = (date?: string): LeaveForm => ({
  type: 'annual', startDate: date ?? toYMD(new Date()), endDate: date ?? toYMD(new Date()), reason: '',
});

/* ── 메인 컴포넌트 ──────────────────────────────────────── */
interface Props {
  currentUser: User;
}

export function CompanyCalendar({ currentUser }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const [showEventModal, setShowEventModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showLeaveListModal, setShowLeaveListModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm());
  const [leaveForm, setLeaveForm] = useState<LeaveForm>(emptyLeaveForm());
  const [activeTab, setActiveTab] = useState<'calendar' | 'leave' | 'routine'>('calendar');

  // ── 루틴 상태 ──
  const [routines, setRoutines] = useState<CalendarRoutine[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<CalendarRoutine | null>(null);
  const [rForm, setRForm] = useState({ title: '', recurrence: 'daily' as CalendarRoutine['recurrence'], weekdays: [] as number[], monthDay: 1, timeSlot: 'allday' as CalendarRoutine['timeSlot'] });
  const [pendingReject, setPendingReject] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  /* 데이터 불러오기 */
  const fetchData = async () => {
    setLoading(true);
    try {
      const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = new Date(year, month + 1, 0);
      const endStr = toYMD(endDate);

      const [evtSnap, leaveSnap, empSnap, meetingSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'calendar_events'),
          where('startDate', '<=', endStr), orderBy('startDate'))),
        getDocs(query(collection(salesDb, 'leave_requests'), orderBy('startDate', 'desc'))),
        getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
        getDocs(collection(salesDb, 'meetings')),
      ]);

      /* 캘린더 이벤트 */
      const calEvents = evtSnap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent))
        .filter(e => e.endDate >= startStr);

      /* 회의록 → 가상 이벤트 (저장 안 함, 표시만) */
      const meetingEvents: CalendarEvent[] = meetingSnap.docs
        .map(d => d.data() as { id: string; title: string; date: string })
        .filter(m => m.date >= startStr && m.date <= endStr)
        .map(m => ({
          id: `meeting_${m.id}`,
          type: 'meeting' as CalendarEventType,
          title: `📋 ${m.title}`,
          startDate: m.date, endDate: m.date,
          allDay: true,
          visibility: 'all',
          createdAt: '', updatedAt: '',
        }));

      setEvents([...calEvents, ...meetingEvents]);

      const allLeave = leaveSnap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
      setLeaveRequests(allLeave);

      const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      setEmployees(emps);
      setMyEmployee(emps.find(e => e.linkedUid === currentUser.uid) ?? null);
    } catch (e) {
      console.error('Calendar fetchData error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [year, month]);

  /* ── 루틴 로드 ── */
  const fetchRoutines = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [rSnap, cSnap] = await Promise.all([
      getDocs(query(collection(salesDb, 'calendar_routines'), where('ownerId', '==', currentUser.uid))),
      getDocs(query(collection(salesDb, 'routine_completions'), where('ownerId', '==', currentUser.uid), where('date', '==', today))),
    ]);
    setRoutines(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarRoutine)).filter(r => r.isActive));
    setCompletedToday(new Set(cSnap.docs.map(d => d.data().routineId as string)));
  };
  useEffect(() => { fetchRoutines(); }, []);

  const isTodayRoutine = (r: CalendarRoutine) => {
    const now = new Date();
    if (r.recurrence === 'daily') return true;
    if (r.recurrence === 'weekly') return (r.weekdays ?? []).includes(now.getDay());
    if (r.recurrence === 'monthly') return r.monthDay === now.getDate();
    return false;
  };

  const toggleRoutineComplete = async (routineId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${today}_${routineId}`;
    if (completedToday.has(routineId)) {
      await deleteDoc(doc(salesDb, 'routine_completions', docId));
      setCompletedToday(prev => { const s = new Set(prev); s.delete(routineId); return s; });
    } else {
      await setDoc(doc(salesDb, 'routine_completions', docId), { routineId, ownerId: currentUser.uid, date: today, completedAt: new Date().toISOString() });
      setCompletedToday(prev => new Set([...prev, routineId]));
    }
  };

  const openRoutineForm = (r?: CalendarRoutine) => {
    if (r) { setEditingRoutine(r); setRForm({ title: r.title, recurrence: r.recurrence, weekdays: r.weekdays ?? [], monthDay: r.monthDay ?? 1, timeSlot: r.timeSlot }); }
    else { setEditingRoutine(null); setRForm({ title: '', recurrence: 'daily', weekdays: [], monthDay: 1, timeSlot: 'allday' }); }
    setShowRoutineForm(true);
  };

  const saveRoutine = async () => {
    if (!rForm.title.trim()) return;
    const base: Omit<CalendarRoutine, 'id' | 'createdAt'> = {
      title: rForm.title.trim(), recurrence: rForm.recurrence,
      weekdays: rForm.recurrence === 'weekly' ? rForm.weekdays : undefined,
      monthDay: rForm.recurrence === 'monthly' ? rForm.monthDay : undefined,
      timeSlot: rForm.timeSlot, ownerId: currentUser.uid, ownerName: currentUser.name,
      isTeamRoutine: false, isActive: true,
    };
    const scrub = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([,v]) => v !== undefined));
    if (editingRoutine) {
      await updateDoc(doc(salesDb, 'calendar_routines', editingRoutine.id), scrub(base as Record<string, unknown>));
    } else {
      const id = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      await setDoc(doc(salesDb, 'calendar_routines', id), scrub({ ...base, id, createdAt: new Date().toISOString() } as Record<string, unknown>));
    }
    toast.success(editingRoutine ? '수정됨' : '루틴 추가됨');
    setShowRoutineForm(false);
    await fetchRoutines();
  };

  const deleteRoutine = async (r: CalendarRoutine) => {
    await updateDoc(doc(salesDb, 'calendar_routines', r.id), { isActive: false });
    toast.success('삭제됨');
    await fetchRoutines();
  };

  /* 달력 셀 계산 */
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  /* 날짜별 이벤트 */
  const eventsForDate = (ymd: string) => {
    const dayEvents = events.filter(e => e.startDate <= ymd && e.endDate >= ymd);
    const approvedLeaves = leaveRequests.filter(
      l => l.status === 'approved' && l.startDate <= ymd && l.endDate >= ymd
    );
    const leaveEvents: CalendarEvent[] = approvedLeaves.map(l => ({
      id: l.id, type: 'leave', title: `${getEmpName(l.employeeId)} 연차`,
      startDate: l.startDate, endDate: l.endDate, allDay: true, visibility: 'all',
      createdAt: l.submittedAt, updatedAt: l.submittedAt,
    }));
    return [...dayEvents, ...leaveEvents];
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? '-';

  /* 이벤트 저장 (신규/수정 겸용) */
  const saveEvent = async () => {
    if (!eventForm.title.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (eventForm.startDate > eventForm.endDate) { toast.error('종료일이 시작일보다 빠릅니다'); return; }
    const now = new Date().toISOString();
    if (editingEvent) {
      await updateDoc(doc(salesDb, 'calendar_events', editingEvent.id), { ...eventForm, updatedAt: now });
      toast.success('일정이 수정되었습니다');
    } else {
      const id = genId();
      const evt: CalendarEvent = { id, ...eventForm, employeeId: myEmployee?.id, createdAt: now, updatedAt: now };
      await setDoc(doc(salesDb, 'calendar_events', id), evt);
      toast.success('일정이 추가되었습니다');
    }
    setShowEventModal(false);
    setEditingEvent(null);
    fetchData();
  };

  /* 이벤트 삭제 */
  const deleteEvent = async (evt: CalendarEvent) => {
    const ok = await confirm({ title: '일정 삭제', message: `"${evt.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'calendar_events', evt.id));
    toast.success('삭제되었습니다');
    fetchData();
  };

  /* 연차 신청 */
  const submitLeave = async () => {
    if (!myEmployee) { toast.error('직원 명부에 계정이 연결되어 있지 않습니다. 관리자에게 문의하세요'); return; }
    if (leaveForm.startDate > leaveForm.endDate) { toast.error('종료일이 시작일보다 빠릅니다'); return; }
    const days = LEAVE_DAYS[leaveForm.type] *
      (leaveForm.type === 'annual' || leaveForm.type === 'sick' || leaveForm.type === 'special'
        ? Math.max(1, Math.ceil((parseYMD(leaveForm.endDate).getTime() - parseYMD(leaveForm.startDate).getTime()) / 86400000) + 1)
        : 1);
    if (days > myEmployee.annualLeaveBalance) {
      toast.error(`잔여 연차(${myEmployee.annualLeaveBalance}일)가 부족합니다`);
      return;
    }
    const id = `leave_${Date.now()}`;
    const req: LeaveRequest = {
      id, employeeId: myEmployee.id, ...leaveForm, days,
      status: 'pending', submittedAt: new Date().toISOString(),
    };
    await setDoc(doc(salesDb, 'leave_requests', id), req);
    toast.success('연차 신청이 완료되었습니다. 결재 대기 중입니다');
    setShowLeaveModal(false);
    fetchData();
  };

  /* 연차 결재 (관리자) */
  const handleLeaveApproval = async (req: LeaveRequest, action: 'approved' | 'rejected', comment?: string) => {
    const now = new Date().toISOString();
    await updateDoc(doc(salesDb, 'leave_requests', req.id), {
      status: action, approverId: myEmployee?.id ?? currentUser.uid,
      approverComment: comment ?? '', approvedAt: now,
    });
    if (action === 'approved') {
      const emp = employees.find(e => e.id === req.employeeId);
      if (emp) {
        await updateDoc(doc(salesDb, 'employees', emp.id), {
          annualLeaveBalance: Math.max(0, emp.annualLeaveBalance - req.days),
          updatedAt: now,
        });
      }
    }
    toast.success(action === 'approved' ? '승인되었습니다' : '반려되었습니다');
    fetchData();
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');
  const myLeaves = leaveRequests.filter(l => l.employeeId === myEmployee?.id);

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">캘린더</h1>
          {myEmployee && (
            <p className="text-sm text-stone-400 mt-0.5">잔여 연차 <strong className="text-stone-700 dark:text-stone-300">{myEmployee.annualLeaveBalance}일</strong></p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {isAdmin && pendingLeaves.length > 0 && (
            <button onClick={() => setShowLeaveListModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold hover:opacity-80">
              <span className="hidden sm:inline">연차 결재 대기 </span>{pendingLeaves.length}건
            </button>
          )}
          <button onClick={() => { setLeaveForm(emptyLeaveForm()); setShowLeaveModal(true); }} className="flex items-center gap-1 px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
            연차 신청
          </button>
          <button onClick={() => { setEventForm(emptyEventForm()); setShowEventModal(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-bold hover:opacity-80">
            <Plus size={14} /><span className="hidden sm:inline">일정 추가</span><span className="sm:hidden">추가</span>
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-stone-200 dark:border-stone-700">
        {([['calendar', '달력'], ['leave', '연차 내역'], ['routine', '루틴']] as [string, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t as typeof activeTab)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === t ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'routine' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">매일/매주/매월 반복 업무를 등록하세요</p>
            </div>
            <button onClick={() => openRoutineForm()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={13} /> 루틴 추가
            </button>
          </div>

          {/* 오늘 할 루틴 */}
          {(() => {
            const todayRoutines = routines.filter(isTodayRoutine);
            if (todayRoutines.length === 0 && routines.length > 0) return null;
            if (todayRoutines.length > 0) return (
              <div className="mb-5">
                <p className="text-[11px] font-bold text-stone-400 tracking-widest mb-2">오늘 해야 할 루틴</p>
                <div className="space-y-2">
                  {todayRoutines.map(r => {
                    const done = completedToday.has(r.id);
                    return (
                      <div key={r.id} className={`flex items-center gap-3 p-3 rounded-sm border transition-all ${done ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700'}`}>
                        <button onClick={() => toggleRoutineComplete(r.id)}
                          className={`w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-all ${done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-600 hover:border-emerald-400'}`}>
                          {done && <Check size={12} className="text-white" />}
                        </button>
                        <span className={`flex-1 text-sm font-medium ${done ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'}`}>{r.title}</span>
                        <span className="text-[10px] text-stone-400">{r.timeSlot === 'morning' ? '오전' : r.timeSlot === 'afternoon' ? '오후' : '종일'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            return null;
          })()}

          {/* 전체 루틴 목록 */}
          <p className="text-[11px] font-bold text-stone-400 tracking-widest mb-2">등록된 루틴</p>
          {routines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Repeat size={32} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm text-stone-400">루틴이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {routines.map(r => {
                const recLabel = r.recurrence === 'daily' ? '매일' : r.recurrence === 'weekly' ? `매주 ${(r.weekdays ?? []).map(d => ['일','월','화','수','목','금','토'][d]).join(',')}` : `매월 ${r.monthDay}일`;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm group">
                    <Repeat size={13} className="text-stone-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{r.title}</p>
                      <p className="text-[10px] text-stone-400">{recLabel} · {r.timeSlot === 'morning' ? '오전' : r.timeSlot === 'afternoon' ? '오후' : '종일'}</p>
                    </div>
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button onClick={() => openRoutineForm(r)} className="p-1 text-stone-400 hover:text-blue-600 rounded-sm"><Edit2 size={12} /></button>
                      <button onClick={() => deleteRoutine(r)} className="p-1 text-stone-400 hover:text-red-600 rounded-sm"><Trash2 size={12} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 루틴 폼 모달 */}
          {showRoutineForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-sm border border-stone-200 dark:border-stone-700">
                <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
                  <h2 className="text-sm font-black text-stone-900 dark:text-white">{editingRoutine ? '루틴 수정' : '루틴 추가'}</h2>
                  <button onClick={() => setShowRoutineForm(false)} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1">루틴 이름 *</label>
                    <input value={rForm.title} onChange={e => setRForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="예: 매장 재고 확인"
                      className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">반복 주기</label>
                      <select value={rForm.recurrence} onChange={e => setRForm(f => ({ ...f, recurrence: e.target.value as CalendarRoutine['recurrence'] }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                        <option value="daily">매일</option>
                        <option value="weekly">매주</option>
                        <option value="monthly">매월</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">시간대</label>
                      <select value={rForm.timeSlot} onChange={e => setRForm(f => ({ ...f, timeSlot: e.target.value as CalendarRoutine['timeSlot'] }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                        <option value="morning">오전</option>
                        <option value="afternoon">오후</option>
                        <option value="allday">종일</option>
                      </select>
                    </div>
                  </div>
                  {rForm.recurrence === 'weekly' && (
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">요일 선택</label>
                      <div className="flex gap-1 flex-wrap">
                        {['일','월','화','수','목','금','토'].map((d, i) => (
                          <button key={i} type="button"
                            onClick={() => setRForm(f => ({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter(w => w !== i) : [...f.weekdays, i] }))}
                            className={`w-8 h-8 text-xs font-bold rounded-sm transition-colors ${rForm.weekdays.includes(i) ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {rForm.recurrence === 'monthly' && (
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">매월 몇 일?</label>
                      <input type="number" min={1} max={31} value={rForm.monthDay} onChange={e => setRForm(f => ({ ...f, monthDay: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
                  <button onClick={() => setShowRoutineForm(false)} className="px-4 py-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
                  <button onClick={saveRoutine} disabled={!rForm.title.trim()}
                    className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
                    {editingRoutine ? '저장' : '추가'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' ? (
        <>
          {/* 월 네비게이션 */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"><ChevronLeft size={16} /></button>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 min-w-28 text-center">{year}년 {MONTHS[month]}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"><ChevronRight size={16} /></button>
            <button onClick={goToday} className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold ml-2">
              <RefreshCw size={11} /> 오늘
            </button>
            {/* 범례 — 데스크탑만 표시 */}
            <div className="ml-auto hidden sm:flex items-center gap-3 flex-wrap">
              {(Object.entries(EVENT_COLORS) as [CalendarEventType, string][])
                .filter(([type]) => type !== 'franchise')
                .map(([type, color]) => (
                  <span key={type} className="flex items-center gap-1 text-[11px] text-stone-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    {EVENT_TEXT[type]}
                  </span>
                ))}
            </div>
          </div>

          {/* 달력 그리드 */}
          {loading ? (
            <div className="text-center py-20 text-stone-400 text-sm">불러오는 중...</div>
          ) : (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-700">
                {DAYS.map((d, i) => (
                  <div key={d} className={`py-2 text-center text-[11px] font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-stone-500 dark:text-stone-400'}`}>{d}</div>
                ))}
              </div>

              {/* 날짜 셀 */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day, idx) => {
                  if (!day) return <div key={idx} className="min-h-14 sm:min-h-24 border-b border-r border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 last:border-r-0" />;
                  const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = ymd === toYMD(today);
                  const dayOfWeek = idx % 7;
                  const dayEvts = eventsForDate(ymd);
                  return (
                    <div key={idx}
                      className={`min-h-14 sm:min-h-24 p-1 sm:p-1.5 border-b border-r border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                      onClick={() => { setSelectedDate(ymd); setEventForm(emptyEventForm(ymd)); setShowEventModal(true); }}>
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${isToday ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-stone-700 dark:text-stone-300'}`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvts.slice(0, 3).map(evt => {
                          const isReadOnly = evt.type === 'meeting' || evt.type === 'leave';
                          return (
                            <div key={evt.id}
                              className={`text-white rounded truncate ${EVENT_COLORS[evt.type]} ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                              onClick={e => { e.stopPropagation(); if (!isReadOnly) setSelectedEvent(evt); }}
                              title={evt.title}
                            >
                              {/* 모바일: 점, 데스크탑: 텍스트 */}
                              <span className="block sm:hidden w-2 h-2 rounded-full mx-auto mt-0.5" />
                              <span className="hidden sm:block text-[10px] px-1 py-0.5">{evt.title}</span>
                            </div>
                          );
                        })}
                        {dayEvts.length > 3 && (
                          <div className="text-[10px] text-stone-400 pl-1">+{dayEvts.length - 3}개</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 연차 내역 탭 */
        <div className="space-y-3">
          {myLeaves.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">신청한 연차가 없습니다</div>
          ) : myLeaves.map(req => (
            <div key={req.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{LEAVE_TYPE_LABELS[req.type]}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {req.status === 'approved' ? '승인' : req.status === 'rejected' ? '반려' : '대기'}
                  </span>
                </div>
                <p className="text-xs text-stone-500">{fmtKor(req.startDate)}{req.startDate !== req.endDate ? ` ~ ${fmtKor(req.endDate)}` : ''} · {req.days}일</p>
                {req.reason && <p className="text-xs text-stone-400 mt-0.5">사유: {req.reason}</p>}
                {req.approverComment && <p className="text-xs text-red-400 mt-0.5">반려 사유: {req.approverComment}</p>}
              </div>
              <div className="text-[11px] text-stone-400">{req.submittedAt.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}

      {/* 일정 상세/수정 팝업 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 w-72" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-700">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${EVENT_COLORS[selectedEvent.type]}`} />
                  <span className="text-[11px] text-stone-400">{EVENT_TEXT[selectedEvent.type]}</span>
                </div>
                <p className="text-sm font-black text-stone-900 dark:text-white">{selectedEvent.title}</p>
                <p className="text-xs text-stone-400 mt-1 flex items-center gap-0.5">
                  <Calendar size={10} />
                  {fmtKor(selectedEvent.startDate)}{selectedEvent.startDate !== selectedEvent.endDate ? ` ~ ${fmtKor(selectedEvent.endDate)}` : ''}
                </p>
                {!selectedEvent.allDay && selectedEvent.startTime && (
                  <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-0.5">
                    <Clock size={10} /> {selectedEvent.startTime} ~ {selectedEvent.endTime}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm shrink-0"><X size={16} /></button>
            </div>
            <div className="p-3 flex gap-2">
              <button
                onClick={() => {
                  setEditingEvent(selectedEvent);
                  setEventForm({
                    title: selectedEvent.title,
                    type: selectedEvent.type,
                    startDate: selectedEvent.startDate,
                    endDate: selectedEvent.endDate,
                    allDay: selectedEvent.allDay ?? true,
                    startTime: (selectedEvent as any).startTime ?? '09:00',
                    endTime: (selectedEvent as any).endTime ?? '18:00',
                    visibility: selectedEvent.visibility ?? 'all',
                  });
                  setSelectedEvent(null);
                  setShowEventModal(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Edit2 size={12} /> 수정
              </button>
              <button
                onClick={() => { const ev = selectedEvent; setSelectedEvent(null); deleteEvent(ev); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold border border-red-200 dark:border-red-800 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={12} /> 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 추가/수정 모달 */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100">{editingEvent ? '일정 수정' : '일정 추가'}</h2>
              <button onClick={() => { setShowEventModal(false); setEditingEvent(null); }}><X size={18} className="text-stone-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">제목 *</label>
                <input value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                  placeholder="일정 제목" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">구분</label>
                  <select value={eventForm.type} onChange={e => setEventForm(p => ({ ...p, type: e.target.value as CalendarEventType }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                    <option value="personal">개인 일정</option>
                    <option value="company">회사 일정</option>
                    {isAdmin && <option value="holiday">공휴일/휴무</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">공개 범위</label>
                  <select value={eventForm.visibility} onChange={e => setEventForm(p => ({ ...p, visibility: e.target.value as 'private' | 'team' | 'all' }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                    <option value="private">나만 보기</option>
                    <option value="team">팀 공개</option>
                    <option value="all">전체 공개</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">시작일 *</label>
                  <input type="date" value={eventForm.startDate} onChange={e => setEventForm(p => ({ ...p, startDate: e.target.value, endDate: e.target.value > p.endDate ? e.target.value : p.endDate }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">종료일 *</label>
                  <input type="date" value={eventForm.endDate} onChange={e => setEventForm(p => ({ ...p, endDate: e.target.value }))}
                    min={eventForm.startDate}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 cursor-pointer">
                <input type="checkbox" checked={eventForm.allDay} onChange={e => setEventForm(p => ({ ...p, allDay: e.target.checked }))} className="accent-stone-700" />
                하루 종일
              </label>
              {!eventForm.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1">시작 시간</label>
                    <input type="time" value={eventForm.startTime} onChange={e => setEventForm(p => ({ ...p, startTime: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1">종료 시간</label>
                    <input type="time" value={eventForm.endTime} onChange={e => setEventForm(p => ({ ...p, endTime: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">취소</button>
              <button onClick={saveEvent} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
                <Check size={13} /> {editingEvent ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 연차 신청 모달 */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100">연차 신청</h2>
              <button onClick={() => setShowLeaveModal(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {myEmployee ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">잔여 연차: <strong>{myEmployee.annualLeaveBalance}일</strong></p>
                </div>
              ) : (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-red-600 dark:text-red-400">직원 명부에 계정이 연결되어 있지 않습니다. 관리자에게 문의하세요.</p>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">연차 종류</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(p => ({ ...p, type: e.target.value as LeaveType }))}
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                  {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">시작일</label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value, endDate: e.target.value > p.endDate ? e.target.value : p.endDate }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">종료일</label>
                  <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))}
                    min={leaveForm.startDate}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">사유 (선택)</label>
                <input value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                  placeholder="개인 사유" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => setShowLeaveModal(false)} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">취소</button>
              <button onClick={submitLeave} disabled={!myEmployee} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg font-bold hover:opacity-80 disabled:opacity-40">
                <Check size={13} /> 신청
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 연차 결재 목록 (관리자) */}
      {showLeaveListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100">연차 결재함</h2>
              <button onClick={() => setShowLeaveListModal(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingLeaves.length === 0 ? (
                <p className="text-center py-8 text-stone-400 text-sm">대기 중인 연차 신청이 없습니다</p>
              ) : pendingLeaves.map(req => (
                <div key={req.id} className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                        {getEmpName(req.employeeId)} · {LEAVE_TYPE_LABELS[req.type]}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {fmtKor(req.startDate)}{req.startDate !== req.endDate ? ` ~ ${fmtKor(req.endDate)}` : ''} · {req.days}일
                      </p>
                      {req.reason && <p className="text-xs text-stone-500 mt-0.5">사유: {req.reason}</p>}
                    </div>
                    <span className="text-[11px] text-stone-400 shrink-0">{req.submittedAt.slice(0, 10)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleLeaveApproval(req, 'approved')} className="flex-1 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:opacity-80">
                      승인
                    </button>
                    <button onClick={() => { setPendingReject(req); setRejectReason(''); }} className="flex-1 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:opacity-80">
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 반려 사유 모달 */}
      {pendingReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={() => setPendingReject(null)}>
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-stone-200 dark:border-stone-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-1">연차 반려</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
              {pendingReject.employeeName} · {pendingReject.startDate === pendingReject.endDate ? pendingReject.startDate : `${pendingReject.startDate} ~ ${pendingReject.endDate}`}
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="반려 사유 (선택)"
              rows={3}
              className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 bg-white dark:bg-stone-800 text-stone-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setPendingReject(null)} className="flex-1 py-2 text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg hover:opacity-80">
                취소
              </button>
              <button onClick={async () => {
                const req = pendingReject;
                setPendingReject(null);
                await handleLeaveApproval(req, 'rejected', rejectReason);
              }} className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:opacity-80">
                반려 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
