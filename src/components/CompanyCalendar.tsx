import React, { useState, useEffect, useMemo } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { CalendarEvent, CalendarEventType, LeaveRequest, LeaveType, LeaveStatus, Employee, User, CalendarRoutine, FranchiseSchedule } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, ChevronLeft, ChevronRight, X, Check, Calendar, Clock, RefreshCw, Repeat, Trash2, Edit2 } from 'lucide-react';
import { TabBar } from './ui/Tabs';

/* ── 상수 ──────────────────────────────────────────────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const FRANCHISE_PHASES: Record<string, { emoji: string; label: string }> = {
  open:         { emoji: '🏪', label: '오픈일' },
  construction: { emoji: '🔨', label: '공사' },
  preTraining:  { emoji: '📚', label: '사전교육' },
  training:     { emoji: '🎓', label: '본교육' },
  equipmentIn:  { emoji: '🍳', label: '화구류입고' },
};

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
  const [activeTab, setActiveTab] = useState<'all' | 'personal' | 'open' | 'leave' | 'routine'>('all');
  const [franchiseEvents, setFranchiseEvents] = useState<CalendarEvent[]>([]);

  // ── 루틴 상태 ──
  const [routines, setRoutines] = useState<CalendarRoutine[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<CalendarRoutine | null>(null);
  const [rForm, setRForm] = useState({
    title: '',
    recurrence: 'daily' as CalendarRoutine['recurrence'],
    weekdays: [] as number[],
    monthDay: 1,
    timeSlot: 'allday' as CalendarRoutine['timeSlot'],
    durationMinutes: 0,
    priority: 'medium' as NonNullable<CalendarRoutine['priority']>,
    color: 'stone' as NonNullable<CalendarRoutine['color']>,
    description: '',
    visibility: 'personal' as CalendarRoutine['visibility'],
  });
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set(['open', 'construction']));
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

  useEffect(() => {
    getDocs(collection(salesDb, 'franchise_schedules')).then(snap => {
      const fEvents: CalendarEvent[] = [];
      snap.docs.forEach(d => {
        const sch = d.data() as FranchiseSchedule;
        if (sch.archived) return;
        const add = (phaseKey: string, title: string, start?: string, end?: string) => {
          if (!start) return;
          fEvents.push({
            id: `franchise_${d.id}_${phaseKey}`,
            type: 'franchise',
            title,
            startDate: start, endDate: end || start,
            allDay: true, visibility: 'all',
            createdAt: '', updatedAt: '',
          });
        };
        add('open',         `🏪 ${sch.storeName}`,          sch.openDate);
        add('construction', `🔨 ${sch.storeName} 공사`,      sch.constructionStart, sch.constructionEnd);
        add('preTraining',  `📚 ${sch.storeName} 사전교육`,  sch.preTrainingStart, sch.preTrainingEnd);
        add('training',     `🎓 ${sch.storeName} 본교육`,    sch.trainingStart, sch.trainingEnd);
        add('equipmentIn',  `🍳 ${sch.storeName} 화구류`,    sch.equipmentIn);
      });
      setFranchiseEvents(fEvents);
    }).catch(() => {});
  }, []);

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
    const todayDay = now.getDay();
    if (r.weekdays && r.weekdays.length > 0 && !r.weekdays.includes(todayDay)) return false;
    if (r.recurrence === 'daily') return true;
    if (r.recurrence === 'weekly') return (r.weekdays ?? []).includes(todayDay);
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
    if (r) {
      setEditingRoutine(r);
      setRForm({
        title: r.title,
        recurrence: r.recurrence,
        weekdays: r.weekdays ?? [],
        monthDay: r.monthDay ?? 1,
        timeSlot: r.timeSlot,
        durationMinutes: r.durationMinutes ?? 0,
        priority: r.priority ?? 'medium',
        color: r.color ?? 'stone',
        description: r.description ?? '',
        visibility: r.visibility ?? (r.isTeamRoutine ? 'team' : 'personal'),
      });
    } else {
      setEditingRoutine(null);
      setRForm({ title: '', recurrence: 'daily', weekdays: [], monthDay: 1, timeSlot: 'allday', durationMinutes: 0, priority: 'medium', color: 'stone', description: '', visibility: 'personal' });
    }
    setShowRoutineForm(true);
  };

  const saveRoutine = async () => {
    if (!rForm.title.trim()) return;
    const base: Omit<CalendarRoutine, 'id' | 'createdAt'> = {
      title: rForm.title.trim(),
      recurrence: rForm.recurrence,
      weekdays: rForm.weekdays.length > 0 ? rForm.weekdays : undefined,
      monthDay: rForm.recurrence === 'monthly' ? rForm.monthDay : undefined,
      timeSlot: rForm.timeSlot,
      durationMinutes: rForm.durationMinutes || undefined,
      priority: rForm.priority,
      color: rForm.color,
      description: rForm.description.trim() || undefined,
      visibility: rForm.visibility,
      ownerId: currentUser.uid,
      ownerName: currentUser.name,
      isTeamRoutine: rForm.visibility === 'team',
      isActive: true,
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
  const eventsForDate = (ymd: string, view: typeof activeTab = activeTab) => {
    if (view === 'open') {
      return franchiseEvents.filter(e => {
        const parts = e.id.split('_');
        const phaseKey = parts[parts.length - 1];
        return openFilters.has(phaseKey) && e.startDate <= ymd && e.endDate >= ymd;
      });
    }
    if (view === 'personal') {
      return events.filter(e =>
        e.startDate <= ymd && e.endDate >= ymd &&
        e.visibility === 'private' && e.employeeId === myEmployee?.id
      );
    }
    // 전체 (all)
    const dayEvents = events.filter(e => e.startDate <= ymd && e.endDate >= ymd);
    const approvedLeaves = leaveRequests.filter(
      l => l.status === 'approved' && l.startDate <= ymd && l.endDate >= ymd
    );
    const leaveEvents: CalendarEvent[] = approvedLeaves.map(l => ({
      id: l.id, type: 'leave', title: `${getEmpName(l.employeeId)} 연차`,
      startDate: l.startDate, endDate: l.endDate, allDay: true, visibility: 'all',
      createdAt: l.submittedAt, updatedAt: l.submittedAt,
    }));
    const dayFranchise = franchiseEvents.filter(e => e.startDate <= ymd && e.endDate >= ymd);
    return [...dayEvents, ...leaveEvents, ...dayFranchise];
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

      <TabBar
        tabs={[
          { id: 'all',      label: '전체' },
          { id: 'personal', label: '개인' },
          { id: 'open',     label: '오픈 일정' },
          { id: 'leave',    label: '연차 내역' },
          { id: 'routine',  label: '루틴' },
        ]}
        active={activeTab}
        onChange={v => setActiveTab(v as typeof activeTab)}
        className="mb-4"
      />

      {activeTab === 'routine' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-stone-500 dark:text-stone-400">반복 업무를 요일·주기·우선순위별로 관리하세요</p>
            <button onClick={() => openRoutineForm()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
              <Plus size={13} /> 루틴 추가
            </button>
          </div>

          {/* 오늘 할 루틴 */}
          {(() => {
            const ROUTINE_DOT: Record<string, string> = {
              stone: 'bg-stone-500', red: 'bg-red-500', orange: 'bg-orange-500',
              amber: 'bg-amber-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
            };
            const PRIORITY_CLS: Record<string, string> = {
              high: 'text-red-600 dark:text-red-400',
              medium: 'text-stone-500 dark:text-stone-400',
              low: 'text-stone-400 dark:text-stone-500',
            };
            const PRIORITY_LABEL: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' };
            const DUR_LABEL = (m?: number) => !m ? '' : m < 60 ? `${m}분` : `${m / 60}시간`;
            const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
            const recLabel = (r: CalendarRoutine) => {
              const wdStr = (r.weekdays ?? []).length > 0
                ? (r.weekdays ?? []).map(d => WEEKDAY_NAMES[d]).join('·')
                : '';
              if (r.recurrence === 'daily') return wdStr ? `매일 (${wdStr})` : '매일';
              if (r.recurrence === 'weekly') return wdStr ? `매주 ${wdStr}` : '매주';
              return `매월 ${r.monthDay}일`;
            };

            const todayRoutines = routines.filter(isTodayRoutine);
            return (
              <>
                {todayRoutines.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-bold text-stone-400 tracking-widest mb-2">오늘 해야 할 루틴 ({todayRoutines.length})</p>
                    <div className="space-y-2">
                      {[...todayRoutines].sort((a, b) => {
                        const po = { high: 0, medium: 1, low: 2 };
                        return (po[a.priority ?? 'medium'] ?? 1) - (po[b.priority ?? 'medium'] ?? 1);
                      }).map(r => {
                        const done = completedToday.has(r.id);
                        return (
                          <div key={r.id} className={`flex items-start gap-3 p-3 rounded-sm border transition-all ${done ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700'}`}>
                            <button onClick={() => toggleRoutineComplete(r.id)}
                              className={`w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-600 hover:border-emerald-400'}`}>
                              {done && <Check size={12} className="text-white" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${ROUTINE_DOT[r.color ?? 'stone'] ?? 'bg-stone-500'}`} />
                                <span className={`text-sm font-bold ${done ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'}`}>{r.title}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-stone-400">{r.timeSlot === 'morning' ? '오전' : r.timeSlot === 'afternoon' ? '오후' : '종일'}</span>
                                {r.durationMinutes && <span className="text-[10px] text-stone-400">· {DUR_LABEL(r.durationMinutes)}</span>}
                                {r.priority && r.priority !== 'medium' && <span className={`text-[10px] font-bold ${PRIORITY_CLS[r.priority]}`}>· {PRIORITY_LABEL[r.priority]}</span>}
                              </div>
                              {r.description && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{r.description}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 전체 루틴 목록 — 요일별 그룹 */}
                <p className="text-[11px] font-bold text-stone-400 tracking-widest mb-2">등록된 루틴</p>
                {routines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Repeat size={32} className="text-stone-300 dark:text-stone-600 mb-3" />
                    <p className="text-sm text-stone-400">루틴이 없습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...routines].sort((a, b) => {
                      const po = { high: 0, medium: 1, low: 2 };
                      return (po[a.priority ?? 'medium'] ?? 1) - (po[b.priority ?? 'medium'] ?? 1);
                    }).map(r => (
                      <div key={r.id} className="flex items-start gap-3 p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm group">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${ROUTINE_DOT[r.color ?? 'stone'] ?? 'bg-stone-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-800 dark:text-stone-200">{r.title}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] font-bold text-stone-400">{recLabel(r)}</span>
                            <span className="text-[10px] text-stone-300 dark:text-stone-600">·</span>
                            <span className="text-[10px] text-stone-400">{r.timeSlot === 'morning' ? '오전' : r.timeSlot === 'afternoon' ? '오후' : '종일'}</span>
                            {r.durationMinutes && <><span className="text-[10px] text-stone-300 dark:text-stone-600">·</span><span className="text-[10px] text-stone-400">{DUR_LABEL(r.durationMinutes)}</span></>}
                            {r.priority && r.priority !== 'medium' && <span className={`text-[10px] font-bold ${PRIORITY_CLS[r.priority]}`}>· {PRIORITY_LABEL[r.priority]}</span>}
                            {r.visibility === 'team' && <span className="text-[10px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-sm font-bold">팀</span>}
                          </div>
                          {r.description && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{r.description}</p>}
                        </div>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button onClick={() => openRoutineForm(r)} className="p-1 text-stone-400 hover:text-blue-600 rounded-sm"><Edit2 size={12} /></button>
                          <button onClick={() => deleteRoutine(r)} className="p-1 text-stone-400 hover:text-red-600 rounded-sm"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* 루틴 폼 모달 */}
          {showRoutineForm && (
            <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-md border border-stone-200 dark:border-stone-700 my-8">
                <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400 sticky top-0 bg-white dark:bg-stone-900 z-10">
                  <h2 className="text-sm font-black text-stone-900 dark:text-white">{editingRoutine ? '루틴 수정' : '루틴 추가'}</h2>
                  <button onClick={() => setShowRoutineForm(false)} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-4">

                  {/* 이름 */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1">루틴 이름 *</label>
                    <input value={rForm.title} onChange={e => setRForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="예: 매장 재고 확인"
                      className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:border-stone-500" autoFocus />
                  </div>

                  {/* 반복 주기 + 시간대 */}
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

                  {/* 요일 선택 — daily/weekly 모두 표시 */}
                  {rForm.recurrence !== 'monthly' && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-stone-500">
                          {rForm.recurrence === 'daily' ? '특정 요일만 (선택 없으면 매일)' : '반복 요일 *'}
                        </label>
                        <div className="flex gap-1">
                          {[['평일', [1,2,3,4,5]], ['주말', [0,6]], ['전체', [0,1,2,3,4,5,6]]].map(([label, days]) => (
                            <button key={label as string} type="button"
                              onClick={() => setRForm(f => ({ ...f, weekdays: days as number[] }))}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm border border-stone-300 dark:border-stone-600 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                              {label as string}
                            </button>
                          ))}
                          {rForm.weekdays.length > 0 && (
                            <button type="button" onClick={() => setRForm(f => ({ ...f, weekdays: [] }))}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm border border-stone-300 dark:border-stone-600 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                              초기화
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {['일','월','화','수','목','금','토'].map((d, i) => (
                          <button key={i} type="button"
                            onClick={() => setRForm(f => ({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter(w => w !== i) : [...f.weekdays, i] }))}
                            className={`flex-1 h-9 text-xs font-bold rounded-sm transition-colors ${rForm.weekdays.includes(i) ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'} ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''} ${rForm.weekdays.includes(i) ? 'text-white' : ''}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 매월 날짜 */}
                  {rForm.recurrence === 'monthly' && (
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">매월 몇 일?</label>
                      <input type="number" min={1} max={31} value={rForm.monthDay} onChange={e => setRForm(f => ({ ...f, monthDay: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
                    </div>
                  )}

                  {/* 소요 시간 + 우선순위 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">소요 시간</label>
                      <select value={rForm.durationMinutes} onChange={e => setRForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                        <option value={0}>미설정</option>
                        <option value={15}>15분</option>
                        <option value={30}>30분</option>
                        <option value={60}>1시간</option>
                        <option value={90}>1시간 30분</option>
                        <option value={120}>2시간</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 mb-1">우선순위</label>
                      <select value={rForm.priority} onChange={e => setRForm(f => ({ ...f, priority: e.target.value as NonNullable<CalendarRoutine['priority']> }))}
                        className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none">
                        <option value="high">높음</option>
                        <option value="medium">보통</option>
                        <option value="low">낮음</option>
                      </select>
                    </div>
                  </div>

                  {/* 색상 */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1.5">색상</label>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { key: 'stone', cls: 'bg-stone-500' },
                        { key: 'red', cls: 'bg-red-500' },
                        { key: 'orange', cls: 'bg-orange-500' },
                        { key: 'amber', cls: 'bg-amber-500' },
                        { key: 'emerald', cls: 'bg-emerald-500' },
                        { key: 'blue', cls: 'bg-blue-500' },
                        { key: 'purple', cls: 'bg-purple-500' },
                      ] as { key: string; cls: string }[]).map(({ key, cls }) => (
                        <button key={key} type="button"
                          onClick={() => setRForm(f => ({ ...f, color: key }))}
                          className={`w-7 h-7 rounded-full ${cls} transition-all ${rForm.color === key ? 'ring-2 ring-offset-2 ring-stone-600 dark:ring-stone-300 scale-110' : 'hover:scale-110'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 공개 범위 */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1.5">공개 범위</label>
                    <div className="flex gap-2">
                      {[{ v: 'personal', label: '나만 보기' }, { v: 'team', label: '팀과 공유' }].map(({ v, label }) => (
                        <button key={v} type="button"
                          onClick={() => setRForm(f => ({ ...f, visibility: v as CalendarRoutine['visibility'] }))}
                          className={`flex-1 py-2 text-xs font-bold rounded-sm border transition-colors ${rForm.visibility === v ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-300 dark:border-stone-600 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 메모 */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-500 mb-1">메모 (선택)</label>
                    <textarea value={rForm.description} onChange={e => setRForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="루틴에 대한 추가 설명이나 주의사항"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:border-stone-500 resize-none" />
                  </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700 sticky bottom-0 bg-white dark:bg-stone-900">
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

      {(['all', 'personal', 'open'] as const).includes(activeTab as 'all' | 'personal' | 'open') ? (
        <>
          {/* 오픈 일정 공정 필터 */}
          {activeTab === 'open' && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className="text-[11px] font-bold text-stone-400 mr-1">공정 표시</span>
              {Object.entries(FRANCHISE_PHASES).map(([key, phase]) => (
                <button key={key}
                  onClick={() => setOpenFilters(prev => {
                    const next = new Set(prev);
                    next.has(key) ? next.delete(key) : next.add(key);
                    return next;
                  })}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                    openFilters.has(key)
                      ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200'
                      : 'bg-white dark:bg-stone-900 text-stone-400 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                  }`}>
                  {phase.emoji} {phase.label}
                </button>
              ))}
            </div>
          )}

          {/* 월 네비게이션 */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"><ChevronLeft size={16} /></button>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 min-w-28 text-center">{year}년 {MONTHS[month]}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"><ChevronRight size={16} /></button>
            <button onClick={goToday} className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold ml-2">
              <RefreshCw size={11} /> 오늘
            </button>
            {/* 범례 */}
            <div className="ml-auto hidden sm:flex items-center gap-3 flex-wrap">
              {activeTab === 'open' ? (
                <span className="flex items-center gap-1 text-[11px] text-stone-500">
                  <span className={`w-2.5 h-2.5 rounded-full ${EVENT_COLORS['franchise']}`} />
                  {EVENT_TEXT['franchise']}
                </span>
              ) : (
                (Object.entries(EVENT_COLORS) as [CalendarEventType, string][])
                  .filter(([type]) => activeTab === 'personal' ? type === 'personal' : true)
                  .map(([type, color]) => (
                    <span key={type} className="flex items-center gap-1 text-[11px] text-stone-500">
                      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      {EVENT_TEXT[type]}
                    </span>
                  ))
              )}
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
                          const isReadOnly = evt.type === 'meeting' || evt.type === 'leave' || evt.type === 'franchise';
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
      ) : null}

      {activeTab === 'leave' && (
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
