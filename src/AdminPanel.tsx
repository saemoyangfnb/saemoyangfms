import React, { useState, useEffect } from 'react';
import { db, auth, salesDb } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, limit, getDoc, setDoc } from 'firebase/firestore';
import { User, Ingredient, Department, BrandId, SystemConfig } from '../types';
import { Check, X, Trash2, ShieldAlert, Database, RefreshCw, AlertCircle, History, Key, Settings2, ListChecks, Tags } from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import { useConfirm } from './ConfirmModal';
import { useToast } from './Toast';
import { DepartmentManager } from './admin/DepartmentManager';
import { WorkMasterManager } from './admin/WorkMasterManager';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

interface Props {
  onFirestoreError: (error: unknown, operationType: OperationType, path: string | null) => void;
  ingredients: Ingredient[];
  activeBrand?: BrandId | null;
}

export const AdminPanel: React.FC<Props> = ({ onFirestoreError, ingredients, activeBrand }) => {
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcStatus, setRecalcStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [naverPlacePassword, setNaverPlacePassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const toast = useToast();
  const brandId: BrandId = activeBrand || 'dalbitgo';

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach((doc) => {
        usersData.push(doc.data() as User);
      });
      setUsers(usersData);
    }, (error) => {
      onFirestoreError(error, OperationType.GET, 'users');
    });
    return () => unsubscribe();
  }, [onFirestoreError]);

  useEffect(() => {
    const unsub = onSnapshot(collection(salesDb, 'departments'), snap => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)).filter(d => d.brandId === brandId));
    });
    return () => unsub();
  }, [brandId]);

  const handleToggleUserDepartment = async (uid: string, departmentId: string, currentIds: string[] = []) => {
    try {
      const newIds = currentIds.includes(departmentId)
        ? currentIds.filter(id => id !== departmentId)
        : [...currentIds, departmentId];
      
      await updateDoc(doc(db, 'users', uid), { departmentIds: newIds });
      toast.success('부서 권한이 업데이트되었습니다.');
    } catch (error) {
      onFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(150));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData: any[] = [];
      snapshot.forEach(doc => logsData.push({ id: doc.id, ...doc.data() }));
      setLogs(logsData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchSecurity = async () => {
      try {
        const snap = await getDoc(doc(db, 'system_settings', 'security'));
        if (snap.exists()) setNaverPlacePassword(snap.data().naverPlacePassword || '');
      } catch(e) {}
    };
    fetchSecurity();
  }, []);

  const handleApprove = async (uid: string, isApproved: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isApproved });
    } catch (error) {
      onFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleToggleActive = async (uid: string, isActive: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isActive });
    } catch (error) {
      onFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDelete = async (uid: string) => {
    const ok = await confirm({ title: '사용자 삭제', message: '정말 이 사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      onFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleRecalculateUnitSalesPrices = async () => {
    const ok = await confirm({ title: '매출단가 재계산', message: '전체 식자재의 매출단가를 (매출가 ÷ 수량)으로 재계산하여 업데이트하시겠습니까?', confirmLabel: '재계산', variant: 'warning' });
    if (!ok) return;

    setIsRecalculating(true);
    setRecalcStatus('데이터 처리 중...');

    try {
      let count = 0;
      const CHUNK_SIZE = 500;
      const ingredientsToUpdate = ingredients.filter(ing => {
        const salesPrice = ing.salesPrice || 0;
        const boxQuantity = ing.boxQuantity || 1;
        const unitSalesPrice = Math.round(salesPrice / boxQuantity);
        return ing.unitSalesPrice !== unitSalesPrice;
      });

      if (ingredientsToUpdate.length === 0) {
        setRecalcStatus('업데이트할 데이터가 없습니다 (이미 모두 최신 상태입니다).');
        setIsRecalculating(false);
        return;
      }

      // Process in chunks of 500
      for (let i = 0; i < ingredientsToUpdate.length; i += CHUNK_SIZE) {
        const chunk = ingredientsToUpdate.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        
        chunk.forEach(ing => {
          const salesPrice = ing.salesPrice || 0;
          const boxQuantity = ing.boxQuantity || 1;
          const unitSalesPrice = Math.round(salesPrice / boxQuantity);
          batch.update(doc(db, 'ingredients', ing.id), { unitSalesPrice });
          count++;
        });

        await batch.commit();
        setRecalcStatus(`데이터 처리 중... (${count}/${ingredientsToUpdate.length})`);
      }

      setRecalcStatus(`${count}개의 식자재 매출단가가 업데이트되었습니다.`);
    } catch (error) {
      onFirestoreError(error, OperationType.UPDATE, 'ingredients');
      setRecalcStatus('오류가 발생했습니다.');
    } finally {
      setIsRecalculating(false);
      setTimeout(() => setRecalcStatus(null), 5000);
    }
  };

  const handleSavePassword = async () => {
    setIsSavingPassword(true);
    try {
      await setDoc(doc(db, 'system_settings', 'security'), { naverPlacePassword }, { merge: true });
      toast.success('보안 비밀번호가 저장되었습니다.');
    } catch(e) {
      onFirestoreError(e, OperationType.WRITE, 'system_settings/security');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // 💡 [Step 4] 시스템 설정(공통 코드) 관리 컴포넌트
  const SystemConfigManager = () => {
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      const unsub = onSnapshot(doc(db, 'system_settings', 'config'), (snap) => {
        if (snap.exists()) setConfig(snap.data() as SystemConfig);
      });
      return () => unsub();
    }, []);

    const handleSaveConfig = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!config) return;
      setIsSaving(true);
      try {
        await setDoc(doc(db, 'system_settings', 'config'), config);
        toast.success('시스템 공통 코드가 저장되었습니다.');
      } finally {
        setIsSaving(false);
      }
    };

    const updateField = (key: keyof SystemConfig, val: string) => {
      if (!config) return;
      setConfig({ ...config, [key]: val.split(',').map(s => s.trim()).filter(Boolean) });
    };

    if (!config) return <div className="p-4 text-center text-stone-400">설정 로드 중...</div>;

    return (
      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden mt-6">
        <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-2">
          <Tags className="text-stone-800 dark:text-stone-300" size={20} />
          <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white">시스템 공통 코드 관리</h2>
        </div>
        <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
          <p className="text-xs text-stone-400 font-medium mb-4">각 항목은 쉼표(,)로 구분하여 입력해 주세요. 저장 시 즉시 일정 폼의 선택 목록에 반영됩니다.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: '공사 업체 리스트', key: 'constTypes' as const },
              { label: '간판 업체 리스트', key: 'signTypes' as const },
              { label: '주방 업체 리스트', key: 'kitchenVendors' as const },
              { label: '가스 종류 리스트', key: 'gasTypes' as const },
              { label: '사전 교육 장소', key: 'preTrainingLocations' as const },
            ].map(item => (
              <div key={item.key}>
                <label className="block text-[10px] font-bold tracking-widest text-stone-500 dark:text-stone-400 mb-1.5 uppercase">{item.label}</label>
                <textarea
                  value={config[item.key].join(', ')}
                  onChange={e => updateField(item.key, e.target.value)}
                  rows={2}
                  className="w-full border border-stone-300 dark:border-stone-700 px-3 py-2 rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-900 text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white font-medium"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-4 border-t border-stone-200 dark:border-stone-800 mt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-black rounded-sm hover:bg-stone-800 dark:hover:bg-white transition-all shadow-sm"
            >
              {isSaving ? '저장 중...' : '공통 코드 저장'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 💡 [Step 4] 시스템 공통 코드 관리 */}
      {currentUser.role === 'admin' && <SystemConfigManager />}

      {/* Database Maintenance Section */}
      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden">
        <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-2">
          <Database className="text-stone-800 dark:text-stone-300" size={20} />
          <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white">데이터베이스 관리</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-1">매출단가 자동 생성 및 오류 수정</h3>
              <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                전체 데이터베이스를 검사하여 매출단가가 0원이거나 잘못된 경우 (매출가 / 수량)으로 재계산하여 반영합니다.
              </p>
            </div>
            <button
              onClick={handleRecalculateUnitSalesPrices}
              disabled={isRecalculating}
              className="flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-sm text-sm font-bold transition-colors shadow-sm"
            >
              {isRecalculating ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              매출단가 일괄 재계산
            </button>
          </div>
          
          {recalcStatus && (
            <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${recalcStatus.includes('오류') ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'}`}>
              {recalcStatus.includes('오류') ? <AlertCircle size={14} /> : <Check size={14} />}
              {recalcStatus}
            </div>
          )}
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden">
        <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-2">
          <Key className="text-stone-800 dark:text-stone-300" size={20} />
          <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white">보안 설정</h2>
        </div>
        <div className="p-6">
          <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-1">네이버 플레이스 계정 열람 마스터 비밀번호</h3>
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-4">
            오픈 체크리스트에서 가맹점 네이버 플레이스 권한을 열람할 때 공통으로 사용할 암호를 설정합니다.
          </p>
          <div className="flex items-center gap-3 max-w-md">
            <input
              type="password"
              placeholder="마스터 비밀번호"
              value={naverPlacePassword}
              onChange={e => setNaverPlacePassword(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
            <button onClick={handleSavePassword} disabled={isSavingPassword || !naverPlacePassword} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-sm disabled:opacity-50 transition-colors shadow-sm">
              {isSavingPassword ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden">
      <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-2">
        <ShieldAlert className="text-stone-800 dark:text-stone-300" size={20} />
        <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white">관리자 패널 - 사용자 관리</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-stone-700 dark:text-stone-400">
          <thead className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest bg-stone-100 dark:bg-stone-800/50 border-b border-stone-300 dark:border-stone-700">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3 text-center">부서</th>
              <th className="px-4 py-3 text-center">권한</th>
              <th className="px-4 py-3 text-center">승인 상태</th>
              <th className="px-4 py-3 text-center">활성 상태</th>
              <th className="px-4 py-3 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800 bg-white dark:bg-stone-900">
            {users.map(user => (
              <tr key={user.uid} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                <td className="px-4 py-3 font-bold text-stone-900 dark:text-stone-100">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 justify-center max-w-[200px] mx-auto">
                    {departments.map(d => {
                      const isAssigned = (user.departmentIds || []).includes(d.id);
                      return (
                        <button
                          key={d.id}
                          onClick={() => handleToggleUserDepartment(user.uid, d.id, user.departmentIds)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${isAssigned ? 'bg-slate-800 text-white border-transparent' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'}`}
                        >
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-sm text-[10px] font-bold border ${user.role === 'admin' ? 'bg-stone-800 border-stone-800 text-white' : 'bg-stone-100 border-stone-300 text-stone-600'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {user.isApproved ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1"><Check size={14}/> 승인됨</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-1">대기중</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {user.isActive ? (
                    <span className="text-blue-700 dark:text-blue-400 font-bold">활성</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">정지됨</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center space-x-2">
                  {user.role !== 'admin' && (
                    <>
                      <button 
                        onClick={() => handleApprove(user.uid, !user.isApproved)} 
                        className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${user.isApproved ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                      >
                        {user.isApproved ? '승인 취소' : '가입 승인'}
                      </button>
                      <button 
                        onClick={() => handleToggleActive(user.uid, !user.isActive)} 
                        className={`px-2 py-1 text-[10px] font-bold rounded-sm border ${user.isActive ? 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'border-stone-300 dark:border-stone-800 text-stone-700 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900/20'}`}
                      >
                        {user.isActive ? '계정 정지' : '계정 활성'}
                      </button>
                      <button 
                        onClick={() => handleDelete(user.uid)} 
                        className="px-2 py-1 text-[10px] font-bold rounded-sm border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-rose-700 dark:hover:text-rose-400"
                        title="완전 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* System Activity Logs Section */}
    <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden">
      <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-2">
        <History className="text-stone-800 dark:text-stone-300" size={20} />
        <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white">시스템 활동 기록 (Audit Log)</h2>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-left text-stone-700 dark:text-stone-400">
          <thead className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest bg-stone-100 dark:bg-stone-800/50 border-b border-stone-300 dark:border-stone-700 sticky top-0">
            <tr>
              <th className="px-4 py-3 w-40">일시</th>
              <th className="px-4 py-3 w-32">사용자</th>
              <th className="px-4 py-3 w-32">작업 분류</th>
              <th className="px-4 py-3">상세 내용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800 bg-white dark:bg-stone-900">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-3 font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">{log.userName}</td>
                <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-bold rounded border border-stone-300 dark:border-stone-700">{log.action}</span></td>
                <td className="px-4 py-3 text-xs text-stone-600 dark:text-stone-400 break-all">{log.details}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-500">기록된 활동 로그가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {/* 오픈 프로세스 관리 (통합) */}
    <ProcessManager brandId={brandId} departments={departments} />
  </div>
);
};

function ProcessManager({ brandId, departments }: { brandId: BrandId; departments: Department[] }) {
  const [tab, setTab] = useState<'work' | 'dept'>('work');
  const TABS = [
    { id: 'work' as const, label: '업무 항목 관리' },
    { id: 'dept' as const, label: '부서 관리' },
  ];
  return (
    <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 overflow-hidden">
      <div className="border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-800/50 flex items-center gap-0">
        <div className="px-4 py-3 flex items-center gap-2 border-r border-stone-200 dark:border-stone-700 shrink-0">
          <Settings2 className="text-stone-800 dark:text-stone-300" size={18} />
          <span className="text-base font-black tracking-tight text-stone-900 dark:text-white">오픈 프로세스 관리</span>
        </div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-xs font-bold border-b-2 transition-all ${tab === t.id ? 'border-stone-800 dark:border-white text-stone-900 dark:text-white' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab === 'work' && <WorkMasterManager brandId={brandId} departments={departments} />}
        {tab === 'dept' && <DepartmentManager brandId={brandId} />}
      </div>
    </div>
  );
}
