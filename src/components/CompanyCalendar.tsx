import React, { useState, useEffect, useMemo } from 'react';
import { salesDb, db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { CalendarEvent, CalendarEventType, LeaveRequest, LeaveType, LeaveStatus, Employee, User } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, ChevronLeft, ChevronRight, X, Check, Calendar, Clock, RefreshCw } from 'lucide-react';

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
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
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
  const confirm = useConfirm();
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
  const [activeTab, setActiveTab] = useState<'calendar' | 'leave'>('calendar');

  /* 데이터 불러오기 */
  const fetchData = async () => {
    setLoading(true);
    try {
      const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = new Date(year, month + 1, 0);
      const endStr = toYMD(endDate);

      const [evtSnap, leaveSnap, empSnap, meetingSnap, franchiseSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'calendar_events'),
          where('startDate', '<=', endStr), orderBy('startDate'))),
        getDocs(query(collection(salesDb, 'leave_requests'), orderBy('startDate', 'desc'))),
        getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
        // 회의록 — 이 달 범위 내 (읽기 전용)
        getDocs(collection(salesDb, 'meetings')),
        // 오픈 일정 — 전체 읽어서 클라이언트 필터 (읽기 전용)
        getDocs(query(collection(salesDb, 'franchise_schedules'))),
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

      /* 오픈 일정 주요 날짜 → 가상 이벤트 (저장 안 함, 표시만) */
      const franchiseEvents: CalendarEvent[] = [];
      franchiseSnap.docs.forEach(d => {
        const s = d.data() as Record<string, string>;
        if (s.archived) return;
        const name = s.storeName || s.storeNumber || '매장';
        const dateFields: { key: string; label: string }[] = [
          { key: 'openDate',        label: `🏪 ${name} 오픈` },
          { key: 'trainingStart',   label: `📚 ${name} 교육시작` },
          { key: 'constructionStart', label: `🔨 ${name} 공사시작` },
          { key: 'constructionEnd', label: `✅ ${name} 공사완료` },
        ];
        dateFields.forEach(({ key, label }) => {
          const dateVal = s[key];
          if (dateVal && dateVal >= startStr && dateVal <= endStr) {
            franchiseEvents.push({
              id: `franchise_${d.id}_${key}`,
              type: 'franchise' as CalendarEventType,
              title: label,
              startDate: dateVal, endDate: dateVal,
              allDay: true,
              visibility: 'all',
              createdAt: '', updatedAt: '',
            });
          }
        });
      });

      setEvents([...calEvents, ...meetingEvents, ...franchiseEvents]);

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

  /* 이벤트 저장 */
  const saveEvent = async () => {
    if (!eventForm.title.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (eventForm.startDate > eventForm.endDate) { toast.error('종료일이 시작일보다 빠릅니다'); return; }
    const now = new Date().toISOString();
    const id = genId();
    const evt: CalendarEvent = {
      id, ...eventForm,
      employeeId: myEmployee?.id,
      createdAt: now, updatedAt: now,
    };
    await setDoc(doc(salesDb, 'calendar_events', id), evt);
    toast.success('일정이 추가되었습니다');
    setShowEventModal(false);
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
        <div className="flex gap-2">
          {isAdmin && pendingLeaves.length > 0 && (
            <button onClick={() => setShowLeaveListModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold hover:opacity-80">
              연차 결재 대기 {pendingLeaves.length}건
            </button>
          )}
          <button onClick={() => { setLeaveForm(emptyLeaveForm()); setShowLeaveModal(true); }} className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
            연차 신청
          </button>
          <button onClick={() => { setEventForm(emptyEventForm()); setShowEventModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
            <Plus size={14} /> 일정 추가
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-stone-200 dark:border-stone-700">
        {(['calendar', 'leave'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === t ? 'border-stone-800 dark:border-stone-300 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
            {t === 'calendar' ? '달력' : '연차 내역'}
          </button>
        ))}
      </div>

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
            {/* 범례 */}
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              {(Object.entries(EVENT_COLORS) as [CalendarEventType, string][]).map(([type, color]) => (
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
                  if (!day) return <div key={idx} className="min-h-24 border-b border-r border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 last:border-r-0" />;
                  const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = ymd === toYMD(today);
                  const dayOfWeek = idx % 7;
                  const dayEvts = eventsForDate(ymd);
                  return (
                    <div key={idx}
                      className={`min-h-24 p-1.5 border-b border-r border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                      onClick={() => { setSelectedDate(ymd); setEventForm(emptyEventForm(ymd)); setShowEventModal(true); }}>
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${isToday ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-stone-700 dark:text-stone-300'}`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvts.slice(0, 3).map(evt => {
                          const isReadOnly = evt.type === 'meeting' || evt.type === 'franchise' || evt.type === 'leave';
                          return (
                            <div key={evt.id}
                              className={`text-white rounded truncate ${EVENT_COLORS[evt.type]} ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                              onClick={e => { e.stopPropagation(); if (!isReadOnly) deleteEvent(evt); }}
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

      {/* 일정 추가 모달 */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100">일정 추가</h2>
              <button onClick={() => setShowEventModal(false)}><X size={18} className="text-stone-400" /></button>
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
              <button onClick={() => setShowEventModal(false)} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">취소</button>
              <button onClick={saveEvent} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
                <Check size={13} /> 저장
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
                    <button onClick={async () => {
                      const reason = window.prompt('반려 사유를 입력하세요 (선택)');
                      if (reason !== null) await handleLeaveApproval(req, 'rejected', reason);
                    }} className="flex-1 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:opacity-80">
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
