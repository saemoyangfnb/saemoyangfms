import React, { useState } from 'react';
import { salesDb } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Store, FranchiseSchedule } from '../../types';
import { X, Link } from 'lucide-react';
import { useToast } from '../Toast';

interface Props {
  newStores: Store[];
  schedules: FranchiseSchedule[];
  onClose: () => void;
}

export function StoreMappingModal({ newStores, schedules, onClose }: Props) {
  const toast = useToast();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const entries = Object.entries(mapping).filter(([, schId]) => schId);
    if (entries.length === 0) { onClose(); return; }

    setSaving(true);
    try {
      await Promise.all(entries.map(async ([storeId, schId]) => {
        await updateDoc(doc(salesDb, 'stores', storeId), { scheduleId: schId });
        await updateDoc(doc(salesDb, 'franchise_schedules', schId), { storeId });
      }));
      toast.success(`${entries.length}개 매장 연결 완료`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('연결 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-2xl border border-stone-300 dark:border-stone-700 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Link size={18} className="text-stone-500" />
            <h2 className="text-base font-black text-stone-900 dark:text-white">신규 매장 — 오픈 스케줄 연결</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-sm text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <p className="text-xs text-stone-500 font-medium mb-4">
            신규 추가된 매장 {newStores.length}개를 기존 오픈 스케줄과 연결할 수 있습니다. (선택 사항)
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-stone-400 tracking-widest px-2 pb-1 border-b border-stone-200 dark:border-stone-700">
              <span>신규 매장</span>
              <span>오픈 스케줄 연결</span>
            </div>
            {newStores.map(store => (
              <div key={store.id} className="grid grid-cols-2 gap-2 items-center py-2 border-b border-stone-100 dark:border-stone-800">
                <div>
                  <p className="text-sm font-bold text-stone-800 dark:text-stone-200">{store.name}</p>
                  <p className="text-xs text-stone-400">{store.status} · {store.region}</p>
                </div>
                <select
                  value={mapping[store.id] || ''}
                  onChange={e => setMapping(prev => ({ ...prev, [store.id]: e.target.value }))}
                  className="px-2 py-1.5 text-xs rounded-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-stone-800 font-medium"
                >
                  <option value="">연결 안 함</option>
                  {schedules
                    .filter(s => !s.archived)
                    .sort((a, b) => a.storeName.localeCompare(b.storeName))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.storeName} ({s.storeNumber || '호수미정'})</option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors">건너뛰기</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-black rounded-sm hover:bg-stone-800 transition-all disabled:opacity-40 shadow-sm"
          >
            {saving ? '저장 중...' : '연결 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
