import React, { useState } from 'react';
import { salesDb } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Store } from '../../types';
import { RefreshCw, EyeOff, Users } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import { loadHiddenStoreIds, toggleHiddenStoreId } from '../../storeHidden';
import { normalizeStoreNo } from '../../fcdaum';

interface DuplicateGroup {
  key: string;
  reason: 'storeNo' | 'name';
  stores: Store[];
}

function pushToGroup(map: Map<string, Store[]>, key: string, store: Store) {
  const list = map.get(key);
  if (list) list.push(store);
  else map.set(key, [store]);
}

// storeNo가 같은 문서(1차 수정 이전에 생성된 전형적 중복)와, storeNo가 다르더라도
// 이름+주소가 같은 문서(양도양수 등으로 FC다움 자체에 별도 storeNo로 남는 경우)를 찾는다.
function buildDuplicateGroups(stores: Store[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  const byStoreNo = new Map<string, Store[]>();
  stores.forEach(s => {
    const key = normalizeStoreNo(s.storeNo || (/^\d+$/.test(s.id) ? s.id : ''));
    if (key) pushToGroup(byStoreNo, key, s);
  });
  byStoreNo.forEach((list, key) => {
    if (list.length > 1) groups.push({ key: `storeNo:${key}`, reason: 'storeNo', stores: list });
  });

  const groupedIds = new Set(groups.flatMap(g => g.stores.map(s => s.id)));
  const byNameAddr = new Map<string, Store[]>();
  stores.forEach(s => {
    if (groupedIds.has(s.id)) return;
    const nameKey = s.name.replace(/\s/g, '');
    const addrKey = (s.address || '').replace(/\s/g, '').slice(0, 12);
    if (!nameKey || !addrKey) return;
    pushToGroup(byNameAddr, `${nameKey}|${addrKey}`, s);
  });
  byNameAddr.forEach((list, key) => {
    if (list.length > 1) groups.push({ key: `name:${key}`, reason: 'name', stores: list });
  });

  return groups;
}

export function DuplicateStoreFinder() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleScan = async () => {
    setLoading(true);
    try {
      const [snap, hidden] = await Promise.all([
        getDocs(collection(salesDb, 'stores')),
        loadHiddenStoreIds(),
      ]);
      const stores = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Store))
        .filter(s => !hidden.has(s.id));
      setGroups(buildDuplicateGroups(stores));
    } catch (err) {
      console.error(err);
      toast.error('중복 후보 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleHide = async (store: Store) => {
    const ok = await confirm({
      title: '매장 숨김 처리',
      message: `"${store.name}"(${store.storeCode || store.id})을 숨김 처리하시겠습니까?\n매장 폼 관리·가맹 관리 화면과 이후 재임포트에서 제외됩니다.`,
      confirmLabel: '숨김',
      variant: 'danger',
    });
    if (!ok) return;
    setBusyId(store.id);
    try {
      await toggleHiddenStoreId(store.id, true);
      setGroups(prev => (prev ?? [])
        .map(g => ({ ...g, stores: g.stores.filter(s => s.id !== store.id) }))
        .filter(g => g.stores.length > 1));
      toast.success('숨김 처리했습니다.');
    } catch {
      toast.error('처리 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleScan}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-white text-sm font-bold rounded-sm transition-colors"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? '중복 후보 찾는 중...' : '중복 매장 후보 찾기'}
      </button>

      {groups && groups.length === 0 && (
        <p className="text-sm text-stone-500 text-center py-4">중복 후보가 없습니다.</p>
      )}

      {groups && groups.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-stone-500">
            {groups.length}건의 중복 후보가 발견됐습니다. 남길 매장을 확인하고 나머지를 숨김 처리하세요.
          </p>
          {groups.map(g => (
            <div key={g.key} className="border border-amber-200 dark:border-amber-800 rounded-sm overflow-hidden">
              <div className="bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Users size={12} />
                {g.reason === 'storeNo' ? '같은 관리번호(storeNo)' : '이름·주소 유사 (양도양수 등 가능성)'}
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {g.stores.map(s => (
                  <div key={s.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-800 dark:text-stone-200 truncate">{s.name}</p>
                      <p className="text-stone-400 truncate">
                        관리번호 {s.storeNo || s.id} · 매장코드 {s.storeCode || '-'} · {s.status || '-'} · {s.address || '-'}
                      </p>
                      <p className="text-stone-400">최종 임포트 {s.importedAt ? s.importedAt.slice(0, 10) : '-'}</p>
                    </div>
                    <button
                      onClick={() => handleHide(s)}
                      disabled={busyId === s.id}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-sm border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 font-bold"
                    >
                      <EyeOff size={12} /> 숨김
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
