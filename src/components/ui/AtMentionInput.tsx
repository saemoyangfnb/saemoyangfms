import React, { useState, useRef, useEffect, useCallback } from 'react';
import { salesDb } from '../../firebase';
import { collection, getDocs, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { Store } from '../../types';
import { Building2 } from 'lucide-react';

/* ── 공유 store 캐시 ── */
let _storeCache: Store[] | null = null;
let _storeCachePromise: Promise<Store[]> | null = null;

async function loadStores(): Promise<Store[]> {
  if (_storeCache) return _storeCache;
  if (_storeCachePromise) return _storeCachePromise;
  _storeCachePromise = getDocs(collection(salesDb, 'stores'))
    .then(snap => {
      _storeCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as Store));
      return _storeCache;
    });
  return _storeCachePromise;
}

export function extractAtMentions(text: string): string[] {
  const matches = text.match(/@([^\s@,]+)/g) ?? [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

export interface MentionRecord {
  storeId: string;
  storeName: string;
  sourceType: 'meeting' | 'daily' | 'report';
  sourceId: string;
  sourceTitle: string;
  date: string;
  excerpt: string;
}

export async function saveMentions(
  texts: string[],
  sourceType: MentionRecord['sourceType'],
  sourceId: string,
  sourceTitle: string,
  date: string,
) {
  const stores = await loadStores();
  const mentioned = new Set<string>();
  texts.forEach(t => extractAtMentions(t).forEach(name => mentioned.add(name)));
  if (mentioned.size === 0) return;

  // 기존 mentions 삭제 후 재삽입 (중복 방지)
  const existingSnap = await getDocs(query(
    collection(salesDb, 'store_mentions'),
    where('sourceId', '==', sourceId),
  ));
  await Promise.all(existingSnap.docs.map(d => deleteDoc(d.ref)));

  const writes = [...mentioned].flatMap(name => {
    const store = stores.find(s => s.name === name || s.name.includes(name) || name.includes(s.name));
    if (!store) return [];
    const excerpt = texts.find(t => t.includes(`@${name}`))?.slice(0, 60) ?? '';
    return [addDoc(collection(salesDb, 'store_mentions'), {
      storeId: store.id,
      storeName: store.name,
      sourceType,
      sourceId,
      sourceTitle,
      date,
      excerpt,
      createdAt: new Date().toISOString(),
    } satisfies Omit<MentionRecord, 'storeId' | 'storeName'> & { storeId: string; storeName: string; createdAt: string })];
  });
  await Promise.all(writes);
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export const AtMentionInput = React.forwardRef<HTMLInputElement, Props>(
function AtMentionInput({ value, onChange, className = '', ...rest }, forwardedRef) {
  const [stores, setStores] = useState<Store[]>([]);
  const [popover, setPopover] = useState<{ q: string; atPos: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 ref와 내부 ref 동기화
  const setRef = useCallback((el: HTMLInputElement | null) => {
    (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [forwardedRef]);

  useEffect(() => { loadStores().then(setStores); }, []);

  const candidates = popover
    ? stores.filter(s => s.name.includes(popover.q)).slice(0, 6)
    : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart ?? v.length;
    const segment = v.slice(0, cursor);
    const atIdx = segment.lastIndexOf('@');
    if (atIdx !== -1 && !segment.slice(atIdx).includes(' ')) {
      setPopover({ q: segment.slice(atIdx + 1), atPos: atIdx });
    } else {
      setPopover(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setPopover(null);
    (rest.onKeyDown as any)?.(e);
  };

  const insertMention = useCallback((storeName: string) => {
    if (!popover) return;
    const before = value.slice(0, popover.atPos);
    const after = value.slice(popover.atPos + 1 + popover.q.length);
    onChange(`${before}@${storeName} ${after}`);
    setPopover(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value, onChange, popover]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={setRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setPopover(null), 150)}
        className={className}
        {...rest}
      />
      {popover && candidates.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm shadow-lg min-w-[180px] max-w-xs overflow-hidden">
          <div className="px-2 py-1 bg-stone-50 dark:bg-stone-800 border-b border-stone-100 dark:border-stone-700">
            <span className="text-[9px] font-black text-stone-400 tracking-widest">매장 멘션</span>
          </div>
          {candidates.map(s => (
            <button
              key={s.id}
              onMouseDown={() => insertMention(s.name)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              <Building2 size={11} className="text-stone-400 shrink-0" />
              {s.name}
              {s.region && <span className="text-stone-400 font-normal text-[10px]">{s.region}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
AtMentionInput.displayName = 'AtMentionInput';
