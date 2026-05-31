import React, { useState, useEffect } from 'react';
import { db, salesDb } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { User, Department, PERMISSION_SECTIONS, SECTION_LABELS, SectionPermission, PermissionSection } from '../../types';
import { Shield, ChevronDown, ChevronUp, Check, Lock } from 'lucide-react';
import { useToast } from '../Toast';

const PERMISSION_OPTIONS: { value: SectionPermission; label: string; color: string }[] = [
  { value: 'edit',  label: '수정',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'view',  label: '열람',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'none',  label: '접근제한', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

// 기본값이 'none'인 섹션 — 명시적으로 허용해야 접근 가능
const BRAND_RESTRICTED_SECTIONS: PermissionSection[] = ['cost', 'sales', 'review', 'marketing'];

export function UserPermissionManager() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)).filter(u => u.isApproved));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(salesDb, 'departments'), orderBy('order'));
    const unsub = onSnapshot(q, snap => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    });
    return () => unsub();
  }, []);

  const getPermission = (user: User, section: PermissionSection): SectionPermission => {
    if (user.role === 'admin') return 'edit';
    const stored = user.sectionPermissions?.[section];
    if (stored !== undefined) return stored;
    return BRAND_RESTRICTED_SECTIONS.includes(section) ? 'none' : 'edit';
  };

  const isDefaultRestricted = (section: PermissionSection) => BRAND_RESTRICTED_SECTIONS.includes(section);

  const handlePermissionChange = async (user: User, section: PermissionSection, value: SectionPermission) => {
    setSaving(user.uid);
    try {
      const updated: Partial<Record<PermissionSection, SectionPermission>> = {
        ...(user.sectionPermissions ?? {}),
        [section]: value,
      };
      await updateDoc(doc(db, 'users', user.uid), { sectionPermissions: updated });
    } catch {
      toast.error('저장 실패');
    } finally {
      setSaving(null);
    }
  };

  const handleDeptHeadToggle = async (user: User, deptId: string) => {
    setSaving(user.uid);
    try {
      const current = user.departmentHeadOf ?? [];
      const next = current.includes(deptId)
        ? current.filter(id => id !== deptId)
        : [...current, deptId];
      await updateDoc(doc(db, 'users', user.uid), { departmentHeadOf: next });
    } catch {
      toast.error('저장 실패');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      {users.length === 0 && (
        <p className="text-sm text-slate-400 py-6 text-center">승인된 사용자가 없습니다.</p>
      )}
      {users.map(user => {
        const isExpanded = expandedUid === user.uid;
        const isAdmin = user.role === 'admin';

        return (
          <div key={user.uid} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* 사용자 헤더 */}
            <button
              onClick={() => setExpandedUid(isExpanded ? null : user.uid)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-200">
                  {user.name?.[0] ?? '?'}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                {isAdmin && (
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black rounded">최고 관리자</span>
                )}
                {(user.departmentHeadOf?.length ?? 0) > 0 && (
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-black rounded">부서장</span>
                )}
              </div>
              {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>

            {/* 상세 권한 설정 */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-2 bg-slate-50 dark:bg-slate-800/50 space-y-4 border-t border-slate-100 dark:border-slate-700">

                {/* 부서장 지정 */}
                {departments.length > 0 && (
                  <div>
                    <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 mb-2 tracking-wider">부서장 지정</p>
                    <div className="flex flex-wrap gap-2">
                      {departments.map(dept => {
                        const isHead = user.departmentHeadOf?.includes(dept.id) ?? false;
                        return (
                          <button
                            key={dept.id}
                            disabled={isAdmin || saving === user.uid}
                            onClick={() => handleDeptHeadToggle(user, dept.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              isHead
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-purple-400'
                            } disabled:opacity-50`}
                          >
                            {isHead && <Check size={12} />}
                            {dept.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 섹션별 권한 */}
                <div>
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 mb-2 tracking-wider">섹션별 접근 권한</p>
                  {isAdmin ? (
                    <p className="text-xs text-slate-400 italic">최고 관리자는 모든 섹션에 수정 권한이 부여됩니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {PERMISSION_SECTIONS.filter(s => s !== 'admin').map(section => {
                        const current = getPermission(user, section);
                        const isStored = user.sectionPermissions?.[section] !== undefined;
                        return (
                          <div key={section} className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-24 shrink-0 flex items-center gap-1">
                              {SECTION_LABELS[section]}
                              {isDefaultRestricted(section) && !isStored && (
                                <Lock size={10} className="text-red-400 shrink-0" title="기본 접근 제한 섹션" />
                              )}
                            </span>
                            <div className="flex gap-1.5">
                              {PERMISSION_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  disabled={saving === user.uid}
                                  onClick={() => handlePermissionChange(user, section, opt.value)}
                                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                                    current === opt.value
                                      ? opt.color + ' border-current shadow-sm'
                                      : 'bg-white dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600 hover:border-slate-400'
                                  } disabled:opacity-50`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {saving === user.uid && (
                  <p className="text-xs text-blue-500 font-bold">저장 중...</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
