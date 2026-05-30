import React, { useState, useEffect } from 'react';
import { salesDb, db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { Employee, EmployeePosition, Department, User } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, Edit2, Trash2, X, Check, Link, UserCheck, UserX, ChevronDown } from 'lucide-react';

const POSITIONS: EmployeePosition[] = ['대표', '전무', '이사', '부장', '차장', '과장', '대리', '사원', '인턴', '슈퍼바이저', '기타'];

const positionOrder: Record<EmployeePosition, number> = {
  '대표': 0, '전무': 1, '이사': 2, '부장': 3, '차장': 4, '과장': 5, '대리': 6, '사원': 7, '인턴': 8, '슈퍼바이저': 9, '기타': 10,
};

const genId = () => `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface FormState {
  name: string;
  position: EmployeePosition;
  departmentId: string;
  managerId: string;
  phone: string;
  email: string;
  hireDate: string;
  annualLeaveBalance: number;
  linkedUid: string;
}

const emptyForm = (): FormState => ({
  name: '', position: '사원', departmentId: '', managerId: '',
  phone: '', email: '', hireDate: '', annualLeaveBalance: 15, linkedUid: '',
});

interface Props {
  currentUser: User;
}

export function EmployeeDirectory({ currentUser }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [authUsers, setAuthUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterDeptId, setFilterDeptId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    const [empSnap, deptSnap, userSnap] = await Promise.all([
      getDocs(query(collection(salesDb, 'employees'), orderBy('name'))),
      getDocs(query(collection(salesDb, 'departments'), orderBy('order'))),
      getDocs(collection(db, 'users')),
    ]);
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    setAuthUsers(userSnap.docs.map(d => ({ uid: d.id, ...d.data() } as User)).filter(u => u.isApproved));
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setForm(emptyForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (emp: Employee) => {
    setForm({
      name: emp.name, position: emp.position, departmentId: emp.departmentId,
      managerId: emp.managerId ?? '', phone: emp.phone ?? '', email: emp.email ?? '',
      hireDate: emp.hireDate ?? '', annualLeaveBalance: emp.annualLeaveBalance,
      linkedUid: emp.linkedUid ?? '',
    });
    setEditingId(emp.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('이름을 입력해주세요'); return; }
    if (!form.departmentId) { toast.error('부서를 선택해주세요'); return; }

    const now = new Date().toISOString();
    if (editingId) {
      await updateDoc(doc(salesDb, 'employees', editingId), {
        ...form, updatedAt: now,
      });
      toast.success('직원 정보가 수정되었습니다');
    } else {
      const id = genId();
      const emp: Employee = {
        id, ...form, isActive: true, createdAt: now, updatedAt: now,
      };
      await setDoc(doc(salesDb, 'employees', id), emp);
      toast.success('직원이 등록되었습니다');
    }
    setShowForm(false);
    fetch();
  };

  const handleToggleActive = async (emp: Employee) => {
    const action = emp.isActive ? '비활성화' : '복직';
    const ok = await confirm({ title: `직원 ${action}`, message: `${emp.name}님을 ${action}하시겠습니까?`, confirmLabel: action, variant: emp.isActive ? 'danger' : 'warning' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'employees', emp.id), { isActive: !emp.isActive, updatedAt: new Date().toISOString() });
    toast.success(`${action} 처리되었습니다`);
    fetch();
  };

  const filtered = employees
    .filter(e => !filterDeptId || e.departmentId === filterDeptId)
    .sort((a, b) => (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99));

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? '-';
  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? '-';
  const getLinkedUserName = (uid: string) => authUsers.find(u => u.uid === uid)?.email ?? uid;

  const activeCount = employees.filter(e => e.isActive).length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">직원 명부</h1>
          <p className="text-sm text-stone-400 mt-0.5">재직 {activeCount}명 · 전체 {employees.length}명</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
            <Plus size={15} /> 직원 추가
          </button>
        )}
      </div>

      {/* 부서 필터 */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button
          onClick={() => setFilterDeptId('')}
          className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${!filterDeptId ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
        >
          전체
        </button>
        {departments.map(d => (
          <button
            key={d.id}
            onClick={() => setFilterDeptId(d.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${filterDeptId === d.id ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100' : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-stone-400 text-sm">등록된 직원이 없습니다</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const isExpanded = expandedId === emp.id;
            return (
              <div
                key={emp.id}
                className={`bg-white dark:bg-stone-900 border rounded-xl overflow-hidden transition-all ${emp.isActive ? 'border-stone-200 dark:border-stone-700' : 'border-stone-100 dark:border-stone-800 opacity-50'}`}
              >
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                >
                  {/* 아바타 */}
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 font-black text-sm shrink-0">
                    {emp.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-stone-900 dark:text-stone-100">{emp.name}</span>
                      <span className="text-[11px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-full font-semibold">{emp.position}</span>
                      <span className="text-[11px] text-stone-400">{getDeptName(emp.departmentId)}</span>
                      {emp.linkedUid && <UserCheck size={13} className="text-emerald-500" />}
                      {!emp.isActive && <span className="text-[10px] text-red-400 font-bold">퇴직</span>}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5 flex gap-3 flex-wrap">
                      {emp.phone && <span>{emp.phone}</span>}
                      {emp.email && <span>{emp.email}</span>}
                      {emp.managerId && <span>결재선: {getEmpName(emp.managerId)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-stone-400">잔여 연차 <strong className="text-stone-700 dark:text-stone-300">{emp.annualLeaveBalance}일</strong></span>
                    {isAdmin && (
                      <>
                        <button onClick={e => { e.stopPropagation(); openEdit(emp); }} className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleToggleActive(emp); }} className={`p-1.5 rounded transition-colors ${emp.isActive ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-stone-400 hover:text-red-500' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-stone-400 hover:text-emerald-500'}`}>
                          {emp.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>
                      </>
                    )}
                    <ChevronDown size={14} className={`text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-4 pt-0 border-t border-stone-100 dark:border-stone-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: '입사일', value: emp.hireDate || '-' },
                      { label: '잔여 연차', value: `${emp.annualLeaveBalance}일` },
                      { label: '결재 상급자', value: emp.managerId ? getEmpName(emp.managerId) : '-' },
                      { label: '계정 연결', value: emp.linkedUid ? getLinkedUserName(emp.linkedUid) : '미연결' },
                    ].map(item => (
                      <div key={item.label} className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">{item.label}</p>
                        <p className="text-xs font-semibold text-stone-700 dark:text-stone-300 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 직원 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
                {editingId ? '직원 정보 수정' : '직원 추가'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">이름 *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                    placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">직급 *</label>
                  <select value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value as EmployeePosition }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">부서 *</label>
                  <select value={form.departmentId} onChange={e => setForm(p => ({ ...p, departmentId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                    <option value="">부서 선택</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">결재 상급자</label>
                  <select value={form.managerId} onChange={e => setForm(p => ({ ...p, managerId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                    <option value="">없음 (최상위)</option>
                    {employees.filter(e => e.id !== editingId && e.isActive).map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.position})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">연락처</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                    placeholder="010-0000-0000" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">이메일</label>
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
                    placeholder="hong@saemoyang.com" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">입사일</label>
                  <input type="date" value={form.hireDate} onChange={e => setForm(p => ({ ...p, hireDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">초기 잔여 연차 (일)</label>
                  <input type="number" min={0} max={30} value={form.annualLeaveBalance}
                    onChange={e => setForm(p => ({ ...p, annualLeaveBalance: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1 flex items-center gap-1">
                  <Link size={11} /> 인트라넷 계정 연결
                </label>
                <select value={form.linkedUid} onChange={e => setForm(p => ({ ...p, linkedUid: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500">
                  <option value="">미연결</option>
                  {authUsers.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <p className="text-[10px] text-stone-400 mt-1">연결하면 해당 계정으로 로그인 시 직원 정보가 자동 적용됩니다</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">
                취소
              </button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
                <Check size={13} /> 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
