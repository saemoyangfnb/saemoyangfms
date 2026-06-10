import React, { useState, useEffect, useRef } from 'react';
import {
  StickyNote, FileText, NotebookPen, CheckSquare,
  X, ArrowRight,
} from 'lucide-react';
import { salesDb } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useToast } from './Toast';
import type { User, SidebarSection, BrandId } from '../types';

function scrub<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

type Mode = 'menu' | 'memo';

interface Props {
  onClose: () => void;
  onNavigate: (brandId: BrandId | null, section: SidebarSection) => void;
  currentUser: User;
}

const ACTIONS = [
  { id: 'memo',    icon: <StickyNote size={18} />,   label: '빠른 메모',      sub: '개인 메모 바로 작성' },
  { id: 'daily',   icon: <FileText size={18} />,     label: '업무보고 바로가기', sub: '오늘 업무보고 작성' },
  { id: 'meeting', icon: <NotebookPen size={18} />,  label: '회의록 바로가기', sub: '새 회의록 작성' },
  { id: 'my',      icon: <CheckSquare size={18} />,  label: '내 업무공간',     sub: '메모·담당업무·일정 한눈에' },
] as const;

type ActionId = typeof ACTIONS[number]['id'];

export function QuickInputPalette({ onClose, onNavigate, currentUser }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('menu');
  const [memoText, setMemoText] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Arrow key nav in menu mode
  useEffect(() => {
    if (mode !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, ACTIONS.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); handleAction(ACTIONS[focusIdx].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, focusIdx]);

  const handleAction = (id: ActionId) => {
    if (id === 'memo') {
      setMode('memo');
      setTimeout(() => textareaRef.current?.focus(), 50);
      return;
    }
    if (id === 'daily')   { onNavigate(null, 'daily');    onClose(); return; }
    if (id === 'meeting') { onNavigate(null, 'meetings'); onClose(); return; }
    if (id === 'my')      { onNavigate(null, 'my');       onClose(); return; }
  };

  const handleSaveMemo = async () => {
    const content = memoText.trim();
    if (!content) { onClose(); return; }
    const now = new Date().toISOString();
    try {
      await addDoc(collection(salesDb, 'user_memos'), scrub({
        uid: currentUser.uid,
        content,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      }));
      toast.success('메모가 저장됐습니다');
    } catch {
      toast.error('메모 저장 실패');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[200] pt-24 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <p className="text-xs font-black text-stone-500 dark:text-stone-400 tracking-widest uppercase">
            {mode === 'menu' ? '빠른 입력' : '메모 작성'}
          </p>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-sm transition-colors">
            <X size={14} />
          </button>
        </div>

        {mode === 'menu' ? (
          <div ref={listRef} className="py-2">
            {ACTIONS.map((action, i) => (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                onMouseEnter={() => setFocusIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  focusIdx === i
                    ? 'bg-stone-100 dark:bg-stone-800'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <span className="text-stone-500 dark:text-stone-400 shrink-0">{action.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{action.label}</p>
                  <p className="text-[11px] text-stone-400 font-medium">{action.sub}</p>
                </div>
                <ArrowRight size={14} className="text-stone-300 dark:text-stone-600 shrink-0" />
              </button>
            ))}
            <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-800 mt-1">
              <p className="text-[10px] text-stone-400 font-medium">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <textarea
              ref={textareaRef}
              value={memoText}
              onChange={e => setMemoText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveMemo();
              }}
              placeholder="메모를 입력하세요... (Ctrl+Enter 저장)"
              rows={5}
              className="w-full text-sm px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-sm bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:border-stone-600 dark:focus:border-stone-400 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveMemo}
                className="flex-1 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-bold rounded-sm hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => setMode('menu')}
                className="px-4 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm transition-colors"
              >
                뒤로
              </button>
            </div>
            <p className="text-[10px] text-stone-400 text-center mt-2">Ctrl+Enter 저장 · Esc 닫기</p>
          </div>
        )}
      </div>
    </div>
  );
}
