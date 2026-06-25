import { salesDb } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ref = () => doc(salesDb, 'store_settings', 'merged_ids');

export async function loadHiddenStoreIds(): Promise<Set<string>> {
  try {
    const snap = await getDoc(ref());
    return new Set<string>((snap.data()?.ids as string[] | undefined) ?? []);
  } catch { return new Set(); }
}

export async function toggleHiddenStoreId(storeId: string, hide: boolean): Promise<void> {
  const snap = await getDoc(ref());
  const ids: string[] = (snap.data()?.ids as string[] | undefined) ?? [];
  const updated = hide
    ? [...new Set([...ids, storeId])]
    : ids.filter(id => id !== storeId);
  await setDoc(ref(), { ids: updated });
}
