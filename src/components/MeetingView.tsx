import React, { useState, useEffect } from 'react';
import { salesDb as db, salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, where
} from 'firebase/firestore';
import {
  Plus, ArrowLeft, Printer, Edit2, Trash2, Check, X, RefreshCw, AlertTriangle, ChevronRight, Briefcase, Send
} from 'lucide-react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { User } from '../types';
import { TaskRequestModal } from './TaskRequestModal';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface CheckItem { text: string; done: boolean; assignee?: string }
interface Agenda {
  title: string; checklist: CheckItem[]; progress: number;
  assignee?: string; ref?: string; deadline?: string; urgency?: string; note?: string;
}
interface Meeting {
  id: string; title: string; date: string;
  author?: string; location?: string; attendees?: string[];
  agendas?: Agenda[]; createdAt?: string; updatedAt?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const urgLabel = (u?: string) => u === 'high' ? '긴급' : u === 'mid' ? '보통' : u === 'low' ? '낮음' : '-';
const urgColor = (u?: string) => u === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : u === 'mid' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : u === 'low' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
const progColor = (v: number) => v < 30 ? '#e24b4a' : v < 70 ? '#f59e0b' : '#2d6a4f';
const fmtDate = (s?: string) => {
  if (!s) return '-';
  return new Date(s + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
};
const calcProg = (ag: Agenda) => {
  if (!ag.checklist?.length) return ag.progress || 0;
  return Math.round(ag.checklist.filter(c => c.done).length / ag.checklist.length * 100);
};
const genId = () => Date.now().toString();

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  return (
    <div className="bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${value}%`, background: progColor(value) }} />
    </div>
  );
}

function Badge({ urgency }: { urgency?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${urgColor(urgency)}`}>{urgLabel(urgency)}</span>;
}

/* ─── Agenda Block (form) ────────────────────────────────────────────────── */
function AgendaBlock({
  idx, data, onChange, onRemove,
}: {
  idx: number;
  data: Agenda;
  onChange: (updated: Agenda) => void;
  onRemove: () => void;
}) {
  const [newCheck, setNewCheck] = useState('');

  const updateCheck = (ci: number, field: keyof CheckItem, val: string | boolean) => {
    const cl = data.checklist.map((c, i) => i === ci ? { ...c, [field]: val } : c);
    const done = cl.filter(c => c.done).length;
    onChange({ ...data, checklist: cl, progress: cl.length ? Math.round(done / cl.length * 100) : 0 });
  };

  const addCheck = () => {
    if (!newCheck.trim()) return;
    const cl = [...data.checklist, { text: newCheck.trim(), done: false, assignee: '' }];
    onChange({ ...data, checklist: cl, progress: 0 });
    setNewCheck('');
  };

  const removeCheck = (ci: number) => {
    const cl = data.checklist.filter((_, i) => i !== ci);
    const done = cl.filter(c => c.done).length;
    onChange({ ...data, checklist: cl, progress: cl.length ? Math.round(done / cl.length * 100) : 0 });
  };

  const setUrg = (u: string) => onChange({ ...data, urgency: u });

  return (
    <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-4 mb-3 bg-stone-50 dark:bg-stone-800/50">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">안건 {idx + 1}</span>
        <button onClick={onRemove} className="text-stone-400 hover:text-red-500 transition-colors"><X size={16} /></button>
      </div>

      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">안건 제목 *</label>
        <input
          type="text"
          value={data.title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          placeholder="안건을 한 줄로 요약"
          className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
        />
      </div>

      {/* 체크리스트 */}
      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-2">체크리스트</label>
        {data.checklist.map((c, ci) => (
          <div key={ci} className="flex items-center gap-2 mb-1.5">
            <input type="checkbox" checked={c.done} onChange={e => updateCheck(ci, 'done', e.target.checked)}
              className="w-3.5 h-3.5 shrink-0 accent-emerald-600" />
            <input type="text" value={c.text} onChange={e => updateCheck(ci, 'text', e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-400"
              placeholder="항목 내용" />
            <input type="text" value={c.assignee || ''} onChange={e => updateCheck(ci, 'assignee', e.target.value)}
              className="w-20 px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-500 outline-none focus:border-stone-400"
              placeholder="담당자" />
            <button onClick={() => removeCheck(ci)} className="text-stone-300 hover:text-red-400 shrink-0"><X size={13} /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-1.5">
          <input type="text" value={newCheck} onChange={e => setNewCheck(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheck())}
            className="flex-1 px-2 py-1.5 text-xs border border-dashed border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-400"
            placeholder="항목 입력 후 Enter" />
          <button onClick={addCheck} className="px-2 py-1.5 text-xs bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded font-semibold hover:opacity-80">추가</button>
        </div>
        {data.checklist.length > 0 && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5">
            {data.checklist.filter(c => c.done).length}/{data.checklist.length} 완료 · {calcProg(data)}%
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {[
          { id: 'assignee', label: '담당자', placeholder: '이름', type: 'text' },
          { id: 'ref', label: '참조', placeholder: '부서명', type: 'text' },
          { id: 'deadline', label: '기한', placeholder: '', type: 'date' },
        ].map(f => (
          <div key={f.id}>
            <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">{f.label}</label>
            <input type={f.type} value={(data as Record<string, string>)[f.id] || ''}
              onChange={e => onChange({ ...data, [f.id]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-400" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">긴급도</label>
          <div className="flex gap-1">
            {(['low', 'mid', 'high'] as const).map(u => (
              <button key={u}
                onClick={() => setUrg(u)}
                className={`flex-1 py-1 text-[11px] font-bold rounded border transition-colors ${data.urgency === u ? urgColor(u) + ' border-transparent' : 'border-stone-200 dark:border-stone-600 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'}`}>
                {urgLabel(u)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">비고</label>
          <input type="text" value={data.note || ''} onChange={e => onChange({ ...data, note: e.target.value })}
            placeholder="추가 메모"
            className="w-full px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-400" />
        </div>
      </div>
    </div>
  );
}

/* ─── Form (split layout) ────────────────────────────────────────────────── */
function MeetingForm({
  initial, prevMeeting, onSave, onCancel, currentUserName, onValidationError,
}: {
  initial?: Meeting;
  prevMeeting?: Meeting | null;
  onSave: (m: Meeting) => void;
  onCancel: () => void;
  currentUserName: string;
  onValidationError: (msg: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [author, setAuthor] = useState(initial?.author || currentUserName);
  const [location, setLocation] = useState(initial?.location || '');
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState<string[]>(initial?.attendees || []);
  const [agendas, setAgendas] = useState<Agenda[]>(initial?.agendas || [{ title: '', checklist: [], progress: 0, urgency: '' }]);
  const [carriedIdxs, setCarriedIdxs] = useState<Set<number>>(new Set());

  const addAttendee = () => {
    const v = attendeeInput.trim();
    if (v && !attendees.includes(v)) setAttendees(prev => [...prev, v]);
    setAttendeeInput('');
  };

  const carryAgenda = (i: number) => {
    if (!prevMeeting?.agendas) return;
    const a = prevMeeting.agendas[i];
    setAgendas(prev => [...prev, {
      title: '[이월] ' + a.title,
      checklist: (a.checklist || []).map(c => ({ text: c.text, done: false, assignee: c.assignee || '' })),
      progress: 0, assignee: a.assignee || '', ref: a.ref || '',
      deadline: a.deadline || '', urgency: a.urgency || '', note: a.note || '',
    }]);
    setCarriedIdxs(prev => new Set([...prev, i]));
  };

  const carryAll = () => {
    if (!prevMeeting?.agendas) return;
    prevMeeting.agendas.forEach((a, i) => {
      if (calcProg(a) < 100 && !carriedIdxs.has(i)) carryAgenda(i);
    });
  };

  const handleSave = () => {
    if (!title.trim()) { onValidationError('회의 제목을 입력해주세요'); return; }
    if (!date) { onValidationError('회의 일자를 선택해주세요'); return; }
    const m: Meeting = {
      id: initial?.id || genId(), title: title.trim(), date, author: author.trim(),
      location: location.trim(), attendees, agendas,
      createdAt: initial?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(m);
  };

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-120px)] gap-0 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden">
      {/* 이전 회의록 (모바일: 접힘, 데스크탑: 좌측) */}
      <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-stone-700 flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-900/50 max-h-64 lg:max-h-none">
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-bold text-stone-800 dark:text-stone-200">직전 회의록</p>
            <p className="text-[11px] text-stone-400 mt-0.5">{prevMeeting ? `${prevMeeting.title} · ${fmtDate(prevMeeting.date)}` : '이전 회의록 없음'}</p>
          </div>
          {prevMeeting && (prevMeeting.agendas || []).some(a => calcProg(a) < 100) && (
            <button onClick={carryAll} className="flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-xs font-bold rounded-lg hover:opacity-80">
              <RefreshCw size={12} /> 미완료 전체 이월
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!prevMeeting ? (
            <div className="flex flex-col items-center justify-center h-40 text-stone-400">
              <p className="text-sm">직전 회의록이 없습니다</p>
            </div>
          ) : (prevMeeting.agendas || []).length === 0 ? (
            <div className="text-sm text-stone-400 py-4">안건 없음</div>
          ) : (prevMeeting.agendas || []).map((a, i) => {
            const p = calcProg(a);
            return (
              <div key={i} className={`mb-3 p-3 rounded-lg border ${carriedIdxs.has(i) ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex-1">{a.title}</span>
                  <span className="text-[11px] font-bold shrink-0" style={{ color: progColor(p) }}>{p}%</span>
                </div>
                {(a.checklist || []).length > 0 && (
                  <div className="mb-2 space-y-0.5">
                    {(a.checklist || []).map((c, ci) => (
                      <div key={ci} className={`flex items-center gap-1.5 text-[11px] ${c.done ? 'line-through text-stone-400' : 'text-stone-600 dark:text-stone-300'}`}>
                        <div className={`w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${c.done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300'}`}>
                          {c.done && <Check size={8} className="text-white" />}
                        </div>
                        {c.text}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge urgency={a.urgency} />
                    {a.deadline && <span className="text-[10px] text-stone-400">{a.deadline}</span>}
                  </div>
                  {carriedIdxs.has(i) ? (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={11} /> 이월됨</span>
                  ) : p < 100 ? (
                    <button onClick={() => carryAgenda(i)} className="text-[11px] font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 border border-stone-300 dark:border-stone-600 px-2 py-0.5 rounded transition-colors">이월</button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1"><Check size={11} /> 완료</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 새 회의록 (모바일: 아래, 데스크탑: 우측) */}
      <div className="w-full lg:w-1/2 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-bold text-stone-800 dark:text-stone-200">{initial ? '회의록 수정' : '새 회의록 작성'}</p>
            <p className="text-[11px] text-stone-400 mt-0.5">안건마다 체크리스트를 추가하면 진행율이 자동 계산됩니다</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">
              <X size={13} /> 취소
            </button>
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
              <Check size={13} /> 저장
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* 기본 정보 */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-4 mb-3">
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-3">기본 정보</p>
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-stone-500 mb-1">회의 제목 *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="예) 6월 정기 경영지원 회의"
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {[
                { label: '회의 일자 *', type: 'date', value: date, setter: setDate },
                { label: '작성자', type: 'text', value: author, setter: setAuthor, placeholder: '이름' },
                { label: '장소', type: 'text', value: location, setter: setLocation, placeholder: '예) 2층 회의실' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)} placeholder={(f as { placeholder?: string }).placeholder}
                    className="w-full px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-500 mb-1">참석자</label>
              <div className="flex gap-2 mb-2">
                <input type="text" value={attendeeInput} onChange={e => setAttendeeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                  placeholder="이름 입력 후 Enter"
                  className="flex-1 px-2 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                <button onClick={addAttendee} className="px-2.5 py-1.5 text-xs bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-lg font-semibold hover:opacity-80">추가</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attendees.map(a => (
                  <span key={a} className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-full px-2 py-0.5 text-xs">
                    {a}
                    <button onClick={() => setAttendees(prev => prev.filter(x => x !== a))} className="text-stone-400 hover:text-red-500 ml-0.5"><X size={11} /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 안건 */}
          {agendas.map((a, i) => (
            <AgendaBlock key={i} idx={i} data={a}
              onChange={updated => setAgendas(prev => prev.map((x, xi) => xi === i ? updated : x))}
              onRemove={() => setAgendas(prev => prev.filter((_, xi) => xi !== i))} />
          ))}
          <button
            onClick={() => setAgendas(prev => [...prev, { title: '', checklist: [], progress: 0, urgency: '' }])}
            className="w-full py-2.5 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg text-xs font-semibold text-stone-400 hover:text-stone-600 hover:border-stone-400 dark:hover:border-stone-500 transition-colors mb-4">
            + 안건 추가
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail view ────────────────────────────────────────────────────────── */
function MeetingDetail({
  meeting, onBack, onEdit, onDelete, onToggleCheck, currentUser,
}: {
  meeting: Meeting;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleCheck: (agIdx: number, checkIdx: number) => void;
  currentUser: User;
}) {
  const ags = meeting.agendas || [];
  const avgP = ags.length ? Math.round(ags.reduce((s, a) => s + calcProg(a), 0) / ags.length) : 0;
  const [taskModal, setTaskModal] = useState<{ agendaTitle: string; mode: 'request' } | null>(null);
  const toast = useToast();

  /* 내 업무로 즉시 추가 */
  const handleSelfTask = async (agendaTitle: string) => {
    // 내 employee 조회
    const empSnap = await getDocs(
      query(collection(salesDb, 'employees'), where('linkedUid', '==', currentUser.uid))
    );
    const me = empSnap.docs[0] ? { id: empSnap.docs[0].id, ...empSnap.docs[0].data() } as { id: string; name: string } : null;

    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(salesDb, 'tasks', id), {
      id, title: agendaTitle,
      sourceType: 'meeting',
      sourceMeetingId: meeting.id,
      sourceAgendaTitle: agendaTitle,
      assigneeId: me?.id ?? currentUser.uid,
      assigneeName: me?.name ?? currentUser.name,
      requesterId: me?.id ?? currentUser.uid,
      requesterName: currentUser.name,
      collaboratorIds: [], collaboratorNames: [],
      status: 'pending',
      createdAt: now, updatedAt: now,
    });
    toast.success(`"${agendaTitle.slice(0, 15)}..." 내 업무에 추가됐습니다`);
  };

  return (
    <div>
      {/* 상단바 */}
      <div className="flex items-center gap-3 mb-5 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold shrink-0">
          <ArrowLeft size={13} /> 목록
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-black text-stone-900 dark:text-stone-100 truncate">{meeting.title}</h2>
          <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5 flex-wrap">
            <span>{fmtDate(meeting.date)}</span>
            {meeting.author && <span>{meeting.author}</span>}
            {meeting.location && <span>{meeting.location}</span>}
            {meeting.attendees?.length ? <span className="truncate max-w-[160px]">{meeting.attendees.join(', ')}</span> : null}
          </div>
        </div>
        {/* 데스크탑 버튼 */}
        <div className="hidden sm:flex gap-2 shrink-0">
          <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-semibold hover:opacity-80">
            <Printer size={13} /> 인쇄
          </button>
          <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">
            <Edit2 size={13} /> 수정
          </button>
          <button onClick={onDelete} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 font-semibold hover:opacity-80">
            <Trash2 size={13} /> 삭제
          </button>
        </div>
      </div>
      {/* 모바일 하단 액션 바 */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 px-4 py-3 flex gap-2 print:hidden">
        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-stone-200 dark:border-stone-600 rounded-xl text-sm font-bold text-stone-700 dark:text-stone-300">
          <Edit2 size={14} /> 수정
        </button>
        <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm font-bold text-red-600 dark:text-red-400">
          <Trash2 size={14} /> 삭제
        </button>
      </div>

      {/* 요약 바 */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-4 mb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-bold"><span className="text-2xl">{ags.length}</span><span className="text-stone-500 text-xs">건 안건</span></div>
        <div className="w-px h-6 bg-stone-200 dark:bg-stone-700" />
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-red-600">{ags.filter(a => a.urgency === 'high').length} 긴급</span>
          <span className="text-amber-600">{ags.filter(a => a.urgency === 'mid').length} 보통</span>
          <span className="text-emerald-600">{ags.filter(a => a.urgency === 'low').length} 낮음</span>
        </div>
        <div className="w-px h-6 bg-stone-200 dark:bg-stone-700" />
        <div className="flex-1 min-w-40">
          <div className="flex justify-between text-[11px] text-stone-500 mb-1.5"><span>전체 진행율</span><span className="font-bold">{avgP}%</span></div>
          <ProgressBar value={avgP} height={8} />
        </div>
      </div>

      {/* 안건 목록 */}
      {ags.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">안건이 없습니다</p>
        </div>
      ) : (
        <>
          {/* 모바일: 카드형 */}
          <div className="sm:hidden space-y-3 pb-24">
            {ags.map((a, i) => {
              const p = calcProg(a);
              const cl = a.checklist || [];
              return (
                <div key={i} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-4">
                  {/* 안건 헤더 */}
                  <div className="flex items-start gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-[11px] font-black text-stone-500 shrink-0 mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-stone-900 dark:text-stone-100">{a.title || '(제목 없음)'}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge urgency={a.urgency} />
                        {a.assignee && <span className="text-[10px] text-stone-500 dark:text-stone-400">담당 {a.assignee}</span>}
                        {a.deadline && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{a.deadline}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-black" style={{ color: progColor(p) }}>{p}%</span>
                    </div>
                  </div>
                  {/* 진행바 */}
                  <ProgressBar value={p} height={6} />
                  {/* 체크리스트 */}
                  {cl.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {cl.map((c, ci) => (
                        <div key={ci} className="flex items-start gap-2.5">
                          <button onClick={() => onToggleCheck(i, ci)}
                            className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${c.done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-600'}`}>
                            {c.done && <Check size={11} className="text-white" />}
                          </button>
                          <span className={`flex-1 text-sm leading-snug ${c.done ? 'line-through text-stone-400' : 'text-stone-700 dark:text-stone-300'}`}>{c.text}</span>
                          {c.assignee && <span className="text-[10px] text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full shrink-0">{c.assignee}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {a.note && <p className="text-xs text-stone-500 mt-3 pl-3 border-l-2 border-stone-200 dark:border-stone-700">{a.note}</p>}
                  {/* 업무 버튼 */}
                  {a.title && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                      <button onClick={() => handleSelfTask(a.title)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl">
                        <Briefcase size={12} /> 내 업무
                      </button>
                      <button onClick={() => setTaskModal({ agendaTitle: a.title, mode: 'request' })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-xl">
                        <Send size={12} /> 요청
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 데스크탑: 테이블 */}
          <div className="hidden sm:block bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-stone-50 dark:bg-stone-800 border-b-2 border-stone-200 dark:border-stone-700">
                  {['안건 제목 / 체크리스트', '담당 / 참조 / 기한', '긴급도', '진행율', '업무'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[11px] font-bold text-stone-400 uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ags.map((a, i) => {
                  const p = calcProg(a);
                  const cl = a.checklist || [];
                  return (
                    <tr key={i} className="border-b border-stone-100 dark:border-stone-800 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-4 py-3 align-top" style={{ width: '44%' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-500 shrink-0">{i + 1}</span>
                          <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{a.title || '(제목 없음)'}</span>
                        </div>
                        {cl.length > 0 && (
                          <div className="space-y-1 ml-7">
                            {cl.map((c, ci) => (
                              <div key={ci} className={`flex items-start gap-1.5 text-xs ${c.done ? 'line-through text-stone-400' : 'text-stone-600 dark:text-stone-300'}`}>
                                <button onClick={() => onToggleCheck(i, ci)}
                                  className={`w-3.5 h-3.5 mt-0.5 rounded border shrink-0 flex items-center justify-center transition-colors ${c.done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-600 hover:border-emerald-400'}`}>
                                  {c.done && <Check size={9} className="text-white" />}
                                </button>
                                <span className="flex-1">{c.text}</span>
                                {c.assignee && <span className="text-[10px] text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full shrink-0">{c.assignee}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {a.note && <p className="text-[11px] text-stone-500 mt-2 ml-7 pl-2 border-l-2 border-stone-200 dark:border-stone-700">{a.note}</p>}
                      </td>
                      <td className="px-4 py-3 align-top text-xs" style={{ width: '22%' }}>
                        <div className="space-y-1.5">
                          <div className="flex gap-1.5"><span className="text-stone-400 font-bold uppercase text-[10px] w-6">담당</span><strong className="text-stone-800 dark:text-stone-200">{a.assignee || '-'}</strong></div>
                          <div className="flex gap-1.5"><span className="text-stone-400 font-bold uppercase text-[10px] w-6">참조</span><span className="text-stone-600 dark:text-stone-300">{a.ref || '-'}</span></div>
                          <div className="flex gap-1.5"><span className="text-stone-400 font-bold uppercase text-[10px] w-6">기한</span><span className={a.deadline ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-stone-400'}>{a.deadline || '-'}</span></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-center" style={{ width: '13%' }}><Badge urgency={a.urgency} /></td>
                      <td className="px-4 py-3 align-top" style={{ width: '17%' }}>
                        <div className="text-xl font-bold mb-1.5" style={{ color: progColor(p) }}>{p}%</div>
                        <ProgressBar value={p} height={8} />
                        {cl.length > 0 && <p className="text-[10px] text-stone-400 mt-1">{cl.filter(c => c.done).length}/{cl.length} 완료</p>}
                      </td>
                      <td className="px-4 py-3 align-middle" style={{ width: '12%' }}>
                        <div className="flex flex-col gap-1.5">
                          <button onClick={() => handleSelfTask(a.title)} disabled={!a.title}
                            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:opacity-80 whitespace-nowrap disabled:opacity-30">
                            <Briefcase size={10} /> 내 업무
                          </button>
                          <button onClick={() => a.title && setTaskModal({ agendaTitle: a.title, mode: 'request' })} disabled={!a.title}
                            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 whitespace-nowrap disabled:opacity-30">
                            <Send size={10} /> 요청
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 업무 요청 모달 */}
      {taskModal && (
        <TaskRequestModal
          agendaTitle={taskModal.agendaTitle}
          meetingId={meeting.id}
          currentUser={currentUser}
          defaultToOther={true}
          onClose={() => setTaskModal(null)}
          onDone={() => { setTaskModal(null); toast.success('업무 요청이 전송되었습니다'); }}
        />
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function MeetingView({ currentUserName, currentUser }: { currentUserName: string; currentUser: User }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchMeetings = async () => {
    setLoading(true);
    const q = query(collection(db, 'meetings'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    setMeetings(snap.docs.map(d => d.data() as Meeting));
    setLoading(false);
  };

  useEffect(() => { fetchMeetings(); }, []);

  const seedData = async () => {
    const data: Meeting[] = [{"id":"1780023462820","title":"5월 5주차 바이저 회의","date":"2026-05-29","author":"조영준","location":"신사옥 2층 회의실","attendees":["최병재","김성중","이현채","김구수","임현민","조영준","이병인","장종규","강장혁"],"agendas":[{"title":"초도물품 수량 및 기물 변경","checklist":[{"text":"풀바트: 수량 축소- 하트바트: 수량 확대","done":false,"assignee":""},{"text":"인덕션 그릇: 황토색 도자기접시(무겁고 담는 양이 적어 효율성 저하) > 신항아리 14경으로 검토","done":false,"assignee":""},{"text":"누룽지 그릇 변경: 이더멜라민 한쪽 손잡이 제품으로 변경 검토(수량 확대 필요)-","done":false,"assignee":""},{"text":"반마리 접시 수량 조절 필요 언급: 현행 유지 의견 다수","done":false,"assignee":""},{"text":"고객 앞접시 제공: 새우장 그릇으로 임시 제공 중이나, 방안 검토 필요-","done":false,"assignee":""},{"text":"하얀색 접시 vs 검은색 접시 1가지만 진행 제안 [사유: 비율과 품목이 너무 많음]","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"가맹관리부,경영지원부","deadline":"2026-06-03","urgency":"low","note":""},{"title":"매출 하위 매장 집중 케어","checklist":[{"text":"메뉴 개발 진행은 각 담당자 진행중","done":false,"assignee":""},{"text":"담당자 재점검 후 밀착 관리 진행","done":false,"assignee":""},{"text":"갈치조림 또는 오징어 볶음 빠르게 개발하여 최우선 보급","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"가맹관리부,경영지원부,마케팅부","deadline":"2026-06-03","urgency":"high","note":""},{"title":"간택기 업무 과중 해결 방안","checklist":[{"text":"현재 매장 내 간택기 업무가 포화 상태, 조리 인력 피로도 매우 높음생선 비중은 점점 줄어들고 있음.","done":false,"assignee":""},{"text":"대안 마련 필요: 간택기 사용 줄이는 메뉴, 화덕 활용 메뉴 검토","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"가맹관리부","deadline":"2026-06-03","urgency":"mid","note":""},{"title":"신규 매장 오픈 진행 현황","checklist":[{"text":"강동 천호점 한울 나물 단가 협의 후 천호점부터 시행 예정","done":false,"assignee":"이현채"},{"text":"강동 천호점: 사전 안내 시작","done":false,"assignee":""},{"text":"창원 명곡점: 장종규 과장[조영준 과장 백업]","done":false,"assignee":""},{"text":"창원 명곡점 사전교육: 진해점 또는 명지점에서 2-3시간 정도 진행하도록 독려","done":false,"assignee":""},{"text":"구인현황 지속 관리 및 보고 진행","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"가맹관리부, 경영지원부","deadline":"2026-05-29","urgency":"mid","note":""},{"title":"제조실 메뉴 개발 및 과제","checklist":[{"text":"복장 규정(모자, 유니폼) 확인 - 체크리스트 작성하여 관리","done":false,"assignee":""},{"text":"2. 신규 인원(제조실+메뉴 개발) 출근 예정- 30년 경력","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"제조실","deadline":"2026-06-03","urgency":"mid","note":""},{"title":"메뉴 테스트 진행 사항","checklist":[{"text":"삼치구이: 구운 후 간장 활용방식(바르기/뿌리기) 확정 및 소스 테스트","done":false,"assignee":""},{"text":"백김치: 유자청 소스(교반기 활용) + 절임배추(중국산) 테스트","done":false,"assignee":""},{"text":"청국장: 파주 업체에서 샘플 도착, 고등어 비빔밥 메뉴 개발 연계","done":false,"assignee":""},{"text":"잡채/불고기: 소뚝불고기 및 잡채 소스 합본 테스트 진행중","done":false,"assignee":""},{"text":"원가 계산: 훈제 오리(최종 단계), 강된장(원가 계산 및 영상 촬영 후 고성권 차장 공유)","done":false,"assignee":""},{"text":"이관 품목: 도토리묵 양념장, 반찬류(조림) > 제조실 품목으로 고안중","done":false,"assignee":""},{"text":"아랍/예맨 갈치 및 서대 테스트 진행 예정","done":false,"assignee":""},{"text":"오징어 양념장 + 목초액 활용 술안주개발 > 영상 촬영 후 고성권 차장 공유","done":false,"assignee":""},{"text":"목함 수저통 제작 및 샘플 테스트","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"고성권","deadline":"2026-06-03","urgency":"mid","note":""},{"title":"어린이 메뉴 구성 기획","checklist":[{"text":"국내산 필렛 활용: 고등어 필렛+ @ 메뉴 고안4.","done":false,"assignee":""},{"text":"어린이 요금 따로 받는 방안","done":false,"assignee":""},{"text":"국내산 필렛 + 함박스테이크 1개","done":false,"assignee":""},{"text":"함박스테이크는 포장재까지 OEM 진행 예정[6월중 생산 예정]","done":false,"assignee":""},{"text":"국내산 필렛과 함박스테이크 메뉴 가격을 맞추고, 메뉴 가격 인하도 염두에 둘것.","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"","deadline":"","urgency":"mid","note":""},{"title":"매장 공지 사항","checklist":[{"text":"국내산 필렛 고등어 [ 소바 / 솥밥] 사용 공지","done":false,"assignee":""},{"text":"솥밥 진행 매장은 액자 발송까지 (정읍점 발송완료)","done":false,"assignee":""},{"text":"전란액 피드백 조사: 장종규 과장 > 신속 처리 필요","done":false,"assignee":""},{"text":"생선 초벌 작업 중요성 강조 > FC다움 체크리스트 등록, 교육 자료 작성","done":false,"assignee":""},{"text":"식용유+ 마가린 혼합 사용 안내","done":false,"assignee":""}],"progress":0,"assignee":"","ref":"","deadline":"2026-06-03","urgency":"mid","note":""}],"createdAt":"2026-05-29T02:57:42.820Z","updatedAt":"2026-05-29T03:53:02.391Z"}];
    for (const m of data) {
      await setDoc(doc(db, 'meetings', m.id), m);
    }
    toast.success('데이터 복구 완료');
    fetchMeetings();
  };

  const saveMeeting = async (m: Meeting) => {
    await setDoc(doc(db, 'meetings', m.id), m);
    await fetchMeetings();
    setSelectedId(m.id);
    setEditingId(null);
    setView('detail');
    toast.success('회의록이 저장되었습니다');
  };

  const deleteMeeting = async (id: string) => {
    const ok = await confirm({ title: '회의록 삭제', message: '이 회의록을 삭제할까요? 되돌릴 수 없습니다.', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    await deleteDoc(doc(db, 'meetings', id));
    await fetchMeetings();
    setView('list');
    setSelectedId(null);
    toast.success('삭제되었습니다');
  };

  const toggleCheck = async (meeting: Meeting, agIdx: number, checkIdx: number) => {
    if (!meeting.agendas) return;
    const agendas = meeting.agendas.map((a, i) => {
      if (i !== agIdx) return a;
      const checklist = a.checklist.map((c, ci) => ci === checkIdx ? { ...c, done: !c.done } : c);
      return { ...a, checklist, progress: Math.round(checklist.filter(c => c.done).length / checklist.length * 100) };
    });
    const updated = { ...meeting, agendas, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'meetings', meeting.id), updated);
  };

  const sorted = [...meetings].sort((a, b) => b.date > a.date ? 1 : -1);
  const selected = meetings.find(m => m.id === selectedId);
  const prevMeeting = sorted.filter(m => m.id !== editingId).find(m => editingId ? true : m.id !== selectedId) || null;
  const getPrev = (excludeId?: string | null) => sorted.filter(m => m.id !== excludeId)[0] || null;

  /* ── 대시보드 stats ── */
  const allAg = meetings.flatMap(m => m.agendas || []);
  const urgCount = allAg.filter(a => a.urgency === 'high').length;
  const avgProg = allAg.length ? Math.round(allAg.reduce((s, a) => s + calcProg(a), 0) / allAg.length) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-stone-400">
      <RefreshCw size={20} className="animate-spin mr-2" /> 불러오는 중...
    </div>
  );

  /* ── FORM ── */
  if (view === 'form') return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">회의록</h1>
        <ChevronRight size={16} className="text-stone-400" />
        <span className="text-sm text-stone-500">{editingId ? '수정' : '새 회의록 작성'}</span>
      </div>
      <MeetingForm
        initial={editingId ? meetings.find(m => m.id === editingId) : undefined}
        prevMeeting={getPrev(editingId)}
        onSave={saveMeeting}
        onCancel={() => { setEditingId(null); setView(selectedId ? 'detail' : 'list'); }}
        currentUserName={currentUserName}
        onValidationError={msg => toast.error(msg)}
      />
    </div>
  );

  /* ── DETAIL ── */
  if (view === 'detail' && selected) return (
    <div>
      <div className="flex items-center gap-2 mb-1 text-[11px] text-stone-400">
        <span className="font-bold">회의록</span>
        <ChevronRight size={12} />
        <span>상세</span>
      </div>
      <MeetingDetail
        meeting={selected}
        onBack={() => setView('list')}
        onEdit={() => { setEditingId(selected.id); setView('form'); }}
        onDelete={() => deleteMeeting(selected.id)}
        onToggleCheck={(agIdx, checkIdx) => toggleCheck(selected, agIdx, checkIdx)}
        currentUser={currentUser}
      />
    </div>
  );

  /* ── LIST ── */
  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">회의록</h1>
          <p className="text-sm text-stone-400 mt-0.5">총 {meetings.length}건</p>
        </div>
        <div className="flex gap-2">
          {meetings.length === 0 && (
            <button onClick={seedData} className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:opacity-80">
              데이터 복구
            </button>
          )}
          <button onClick={() => { setEditingId(null); setView('form'); }}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
            <Plus size={15} /> 새 회의록
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: '전체 회의록', value: meetings.length, unit: '건', color: '' },
          { label: '전체 안건', value: allAg.length, unit: '건', color: '' },
          { label: '긴급 안건', value: urgCount, unit: '건', color: urgCount > 0 ? 'text-red-600 dark:text-red-400' : '' },
          { label: '평균 진행율', value: avgProg + '%', unit: '', color: '' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}<span className="text-sm font-medium text-stone-400 ml-1">{c.unit}</span></p>
          </div>
        ))}
      </div>

      {/* 긴급 안건 */}
      {urgCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-red-500" />
            <span className="text-sm font-bold text-red-700 dark:text-red-400">긴급 안건</span>
          </div>
          <div className="space-y-2">
            {allAg.filter(a => a.urgency === 'high').slice(0, 5).map((a, i) => {
              const m = meetings.find(mt => (mt.agendas || []).some(ag => ag === a));
              return (
                <div key={i} onClick={() => { setSelectedId(m?.id || ''); setView('detail'); }}
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="flex-1 text-sm font-semibold text-red-700 dark:text-red-300 truncate">{a.title}</span>
                  <span className="text-xs text-red-500">{a.assignee || '-'} · {a.deadline || '-'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 회의록 목록 */}
      {sorted.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl py-20 text-center text-stone-400">
          <p className="text-sm mb-2">저장된 회의록이 없습니다</p>
          <p className="text-xs">새 회의록을 작성해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(m => {
            const ags = m.agendas || [];
            const avgP = ags.length ? Math.round(ags.reduce((s, a) => s + calcProg(a), 0) / ags.length) : 0;
            const hasUrgent = ags.some(a => a.urgency === 'high');
            const incompleteCount = ags.filter(a => calcProg(a) < 100).length;
            const d = m.date ? new Date(m.date + 'T00:00:00') : null;
            return (
              <div key={m.id} onClick={() => { setSelectedId(m.id); setView('detail'); }}
                className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-stone-400 dark:hover:border-stone-500 hover:shadow-sm transition-all">
                <div className="text-center min-w-10 font-mono">
                  <div className="text-[10px] text-stone-400 uppercase">{d ? d.toLocaleDateString('ko-KR', { month: 'short' }) : ''}</div>
                  <div className="text-xl font-black text-stone-800 dark:text-stone-200">{d ? d.getDate() : '-'}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate mb-1">{m.title}</div>
                  <div className="flex items-center gap-3 text-[11px] text-stone-400 flex-wrap">
                    <span>{m.author || '-'}</span>
                    <span>안건 {ags.length}건</span>
                    {incompleteCount > 0 && <span className="text-amber-500">미완료 {incompleteCount}건</span>}
                    {m.attendees?.length ? <span>{m.attendees.join(', ')}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {hasUrgent && <span className="w-2 h-2 rounded-full bg-red-500" />}
                  <div className="w-20">
                    <ProgressBar value={avgP} height={4} />
                    <p className="text-[10px] text-stone-400 mt-1 font-mono text-right">{avgP}%</p>
                  </div>
                  <ChevronRight size={16} className="text-stone-300" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
