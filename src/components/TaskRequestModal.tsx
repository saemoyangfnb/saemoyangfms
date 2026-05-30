import React, { useState, useEffect } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, setDoc, doc, query, orderBy } from 'firebase/firestore';
import { Task, Employee, User } from '../types';
import { useToast } from './Toast';
import { X, Check, UserPlus, AtSign } from 'lucide-react';

interface Props {
  agendaTitle: string;
  meetingId: string;
  currentUser: User;
  onClose: () => void;
  onDone: () => void;
}

const genId = () => `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const today = () => new Date().toISOString().slice(0, 10);

export function TaskRequestModal({ agendaTitle, meetingId, currentUser, onClose, onDone }: Props) {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(salesDb, 'employees'), orderBy('name'))).then(snap => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.isActive);
      setEmployees(emps);
      const me = emps.find(e => e.linkedUid === currentUser.uid) ?? null;
      setMyEmployee(me);
      if (me) setAssigneeId(me.id); // 기본값: 본인
      setLoading(false);
    });
  }, [currentUser.uid]);

  const toggleCollaborator = (id: string) => {
    setCollaboratorIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!assigneeId) { toast.error('담당자를 선택해주세요'); return; }
    const assignee = employees.find(e => e.id === assigneeId);
    if (!assignee) return;

    const collabs = collaboratorIds.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[];
    const now = new Date().toISOString();
    const isSelf = myEmployee?.id === assigneeId;

    const task: Task = {
      id: genId(),
      title: agendaTitle,
      note: note.trim() || undefined,
      sourceType: isSelf ? 'meeting' : 'request',
      sourceMeetingId: meetingId,
      sourceAgendaTitle: agendaTitle,
      assigneeId,
      assigneeName: assignee.name,
      requesterId: myEmployee?.id,
      requesterName: currentUser.name,
      collaboratorIds: collabs.map(e => e.id),
      collaboratorNames: collabs.map(e => e.name),
      dueDate: dueDate || undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(salesDb, 'tasks', task.id), task);
    toast.success(isSelf ? '내 업무로 추가했습니다' : `${assignee.name}님께 업무를 요청했습니다`);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          <div>
            <h2 className="text-sm font-black text-stone-900 dark:text-stone-100">업무 요청</h2>
            <p className="text-[11px] text-stone-400 mt-0.5 truncate max-w-64">안건: {agendaTitle}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-stone-400" /></button>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-stone-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* 담당자 */}
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-2 flex items-center gap-1">
                <UserPlus size={11} /> 담당자 *
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => setAssigneeId(emp.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors border ${
                      assigneeId === emp.id
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100'
                        : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-black shrink-0">
                      {emp.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{emp.name}</p>
                      <p className={`text-[10px] truncate ${assigneeId === emp.id ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'}`}>{emp.position}</p>
                    </div>
                    {myEmployee?.id === emp.id && (
                      <span className={`ml-auto text-[9px] font-bold shrink-0 ${assigneeId === emp.id ? 'text-stone-300' : 'text-stone-400'}`}>나</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* @협업 태그 */}
            <div>
              <label className="block text-[11px] font-bold text-stone-500 mb-2 flex items-center gap-1">
                <AtSign size={11} /> 협업 태그 <span className="font-normal text-stone-400">(선택, 복수 가능)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {employees.filter(e => e.id !== assigneeId).map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => toggleCollaborator(emp.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                      collaboratorIds.includes(emp.id)
                        ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
                        : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    @{emp.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 기한 + 메모 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">기한 (선택)</label>
                <input type="date" value={dueDate} min={today()} onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">메모 (선택)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="추가 지시사항"
                  className="w-full px-3 py-2 text-xs border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
              </div>
            </div>

            {/* 미리보기 */}
            {assigneeId && (
              <div className="bg-stone-50 dark:bg-stone-800/50 rounded-xl px-4 py-3 text-xs text-stone-600 dark:text-stone-400">
                <span className="font-bold text-stone-800 dark:text-stone-200">{employees.find(e => e.id === assigneeId)?.name}</span>님
                {myEmployee?.id !== assigneeId && <span>께 <span className="font-bold">업무 요청</span></span>}
                {myEmployee?.id === assigneeId && <span>의 <span className="font-bold">내 업무</span>로 추가</span>}
                {collaboratorIds.length > 0 && (
                  <span className="text-blue-600 dark:text-blue-400"> · @{collaboratorIds.map(id => employees.find(e => e.id === id)?.name).join(' @')}</span>
                )}
                {dueDate && <span> · 기한 {dueDate}</span>}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">취소</button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
            <Check size={13} />
            {employees.find(e => e.id === assigneeId)?.id === myEmployee?.id ? '내 업무로 추가' : '업무 요청'}
          </button>
        </div>
      </div>
    </div>
  );
}
