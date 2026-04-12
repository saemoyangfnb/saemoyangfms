import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { User, Ingredient } from '../types';
import { Check, X, Trash2, ShieldAlert, Database, RefreshCw, AlertCircle } from 'lucide-react';
import { writeBatch } from 'firebase/firestore';
import { useConfirm } from './ConfirmModal';

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
}

export const AdminPanel: React.FC<Props> = ({ onFirestoreError, ingredients }) => {
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcStatus, setRecalcStatus] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
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
  </div>
);
};
