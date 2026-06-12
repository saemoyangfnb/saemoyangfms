/**
 * StoreManagement.tsx
 * 가맹점 마스터 데이터 관리 컴포넌트
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db, salesDb } from '../firebase';
import {
  collection, getDocs, setDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { User, StoreFormEntry } from '../types';
import {
  Plus, X, Edit2, Trash2, Store, ChevronDown,
  Calendar, Phone, MapPin, User as UserIcon, Search,
} from 'lucide-react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';

// ==========================================
// 타입 정의
// ==========================================
interface Store {
  id: string;
  brandId: string;
  name: string;
  ownerName: string;
  phone: string;
  region: '지방권' | '광역권' | '수도권';
  address: string;
  contractStart: string;
  contractEnd: string;
  status: 'active' | 'suspended' | 'terminated';
  createdAt: string;
}

interface Props {
  brandId: string;
  currentUser: User;
}

type FormState = Omit<Store, 'id' | 'createdAt'>;

const EMPTY_FORM: FormState = {
  brandId: '',
  name: '',
  ownerName: '',
  phone: '',
  region: '수도권',
  address: '',
  contractStart: '',
  contractEnd: '',
  status: 'active',
};

// ==========================================
// D-day 계산
// ==========================================
function calcDday(contractEnd: string): number | null {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

function FormBadge({ stat }: { stat?: { done: number; total: number } }) {
  if (!stat || stat.total === 0) return null;
  const allDone = stat.done === stat.total;
  const hasSome = stat.done > 0;
  const cls = allDone
    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
    : hasSome
      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${cls}`}
      title="매장 폼 관리 완료 현황">
      폼 {stat.done}/{stat.total}
    </span>
  );
}

function DdayBadge({ contractEnd }: { contractEnd: string }) {
  const dday = calcDday(contractEnd);
  if (dday === null) return null;
  if (dday < 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
        만료
      </span>
    );
  }
  if (dday <= 30) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
        D-{dday}
      </span>
    );
  }
  if (dday <= 60) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        D-{dday}
      </span>
    );
  }
  return null;
}

function StatusBadge({ status }: { status: Store['status'] }) {
  const map = {
    active:     { label: '운영중',  cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    suspended:  { label: '정지',    cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    terminated: { label: '해지',    cls: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ==========================================
// 인라인 폼 모달
// ==========================================
function StoreFormModal({
  initial,
  brandId,
  onSave,
  onClose,
  title,
}: {
  initial: FormState;
  brandId: string;
  onSave: (data: FormState) => Promise<void>;
  onClose: () => void;
  title: string;
}) {
  const [form, setForm] = useState<FormState>({ ...initial, brandId });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('상호명을 입력해 주세요.'); return; }
    if (!form.ownerName.trim()) { toast.error('대표자명을 입력해 주세요.'); return; }
    if (!form.contractStart || !form.contractEnd) { toast.error('계약 기간을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';
  const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>상호명 *</label>
              <input className={inputCls} placeholder="예: 달빛에구운고등어 강남점" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>대표자 *</label>
              <input className={inputCls} placeholder="홍길동" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>연락처</label>
              <input className={inputCls} placeholder="010-0000-0000" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>지역</label>
              <div className="relative">
                <select className={`${inputCls} appearance-none pr-8`} value={form.region} onChange={e => set('region', e.target.value as Store['region'])}>
                  <option value="수도권">수도권</option>
                  <option value="광역권">광역권</option>
                  <option value="지방권">지방권</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className={labelCls}>상태</label>
              <div className="relative">
                <select className={`${inputCls} appearance-none pr-8`} value={form.status} onChange={e => set('status', e.target.value as Store['status'])}>
                  <option value="active">운영중</option>
                  <option value="suspended">정지</option>
                  <option value="terminated">해지</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>주소</label>
              <input className={inputCls} placeholder="서울시 강남구..." value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>계약 시작일 *</label>
              <input type="date" className={inputCls} value={form.contractStart} onChange={e => set('contractStart', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>계약 만료일 *</label>
              <input type="date" className={inputCls} value={form.contractEnd} onChange={e => set('contractEnd', e.target.value)} />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 메인 컴포넌트
// ==========================================
export function StoreManagement({ brandId, currentUser }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formStats, setFormStats] = useState<Map<string, { done: number; total: number }>>(new Map());

  const isAdmin = currentUser.role === 'admin';

  // ==========================================
  // Firestore 조회
  // ==========================================
  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'stores'),
        where('brandId', '==', brandId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const data: Store[] = [];
      snap.forEach(d => data.push({ id: d.id, ...(d.data() as Omit<Store, 'id'>) }));
      setStores(data);
    } catch (err) {
      console.error(err);
      toast.error('가맹점 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // 폼 완료 현황 로드 (salesDb)
  useEffect(() => {
    Promise.all([
      getDocs(collection(salesDb, 'store_forms')),
      getDocs(collection(salesDb, 'store_form_entries')),
    ]).then(([formsSnap, entriesSnap]) => {
      const activeFormIds = new Set(
        formsSnap.docs.filter(d => !d.data().isArchived).map(d => d.id)
      );
      const totalActive = activeFormIds.size;
      if (totalActive === 0) return;

      const doneByName = new Map<string, number>();
      entriesSnap.docs.forEach(d => {
        const e = d.data() as StoreFormEntry;
        if (!activeFormIds.has(e.formId)) return;
        if (!e.isDone) return;
        doneByName.set(e.storeName, (doneByName.get(e.storeName) ?? 0) + 1);
      });

      // 매장명이 한 번이라도 entry에 등장한 것만 통계에 포함
      const allStoreNames = new Set<string>();
      entriesSnap.docs.forEach(d => {
        const e = d.data() as StoreFormEntry;
        if (activeFormIds.has(e.formId)) allStoreNames.add(e.storeName);
      });

      const stats = new Map<string, { done: number; total: number }>();
      allStoreNames.forEach(name => {
        stats.set(name, { done: doneByName.get(name) ?? 0, total: totalActive });
      });
      setFormStats(stats);
    }).catch(console.error);
  }, []);

  // ==========================================
  // 저장/수정/삭제
  // ==========================================
  const handleAdd = async (form: FormState) => {
    try {
      const id = `${brandId}_${Date.now()}`;
      const storeData: Store = {
        ...form,
        id,
        brandId,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'stores', id), storeData);
      toast.success('가맹점이 등록되었습니다.');
      setShowAddModal(false);
      fetchStores();
    } catch (err) {
      console.error(err);
      toast.error('저장에 실패했습니다.');
    }
  };

  const handleEdit = async (form: FormState) => {
    if (!editingStore) return;
    try {
      await updateDoc(doc(db, 'stores', editingStore.id), { ...form });
      toast.success('수정되었습니다.');
      setEditingStore(null);
      fetchStores();
    } catch (err) {
      console.error(err);
      toast.error('수정에 실패했습니다.');
    }
  };

  const handleDelete = async (store: Store) => {
    const ok = await confirm({
      title: '가맹점 삭제',
      message: `${store.name}을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'stores', store.id));
      toast.success('삭제되었습니다.');
      fetchStores();
    } catch (err) {
      console.error(err);
      toast.error('삭제에 실패했습니다.');
    }
  };

  // ==========================================
  // 필터링
  // ==========================================
  const filtered = stores.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.ownerName.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">가맹점 관리</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            가맹점 마스터 데이터 · 계약 현황 관리
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-blue-600 text-white text-sm rounded-lg hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={15} />
            가맹점 추가
          </button>
        )}
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="상호명, 대표자, 주소 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Store size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {search ? '검색 결과가 없습니다.' : '등록된 가맹점이 없습니다.'}
            </p>
            {!search && isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus size={14} /> 첫 번째 가맹점 추가
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">상호명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">대표자</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">지역</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">계약 만료일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">상태</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">폼</th>
                    {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-20" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(store => (
                    <tr
                      key={store.id}
                      onClick={() => setEditingStore(store)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <Store size={13} className="text-slate-400" />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white">{store.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{store.ownerName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {store.region}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400 text-xs">{store.contractEnd || '-'}</span>
                          <DdayBadge contractEnd={store.contractEnd} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={store.status} />
                      </td>
                      <td className="px-4 py-3">
                        <FormBadge stat={formStats.get(store.name)} />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingStore(store)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="수정"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(store)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(store => (
                <div
                  key={store.id}
                  onClick={() => setEditingStore(store)}
                  className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{store.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <UserIcon size={10} /> {store.ownerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <FormBadge stat={formStats.get(store.name)} />
                      <StatusBadge status={store.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={10} />{store.region}</span>
                    {store.phone && <span className="flex items-center gap-1"><Phone size={10} />{store.phone}</span>}
                    {store.contractEnd && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />{store.contractEnd}
                        <DdayBadge contractEnd={store.contractEnd} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 요약 */}
      {stores.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
          전체 {stores.length}개 가맹점
          {filtered.length !== stores.length && ` · 검색 결과 ${filtered.length}개`}
        </p>
      )}

      {/* 추가 모달 */}
      {showAddModal && (
        <StoreFormModal
          initial={{ ...EMPTY_FORM, brandId }}
          brandId={brandId}
          title="가맹점 추가"
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* 수정 모달 */}
      {editingStore && (
        <StoreFormModal
          initial={{
            brandId: editingStore.brandId,
            name: editingStore.name,
            ownerName: editingStore.ownerName,
            phone: editingStore.phone,
            region: editingStore.region,
            address: editingStore.address,
            contractStart: editingStore.contractStart,
            contractEnd: editingStore.contractEnd,
            status: editingStore.status,
          }}
          brandId={brandId}
          title="가맹점 수정"
          onSave={handleEdit}
          onClose={() => setEditingStore(null)}
        />
      )}
    </div>
  );
}
