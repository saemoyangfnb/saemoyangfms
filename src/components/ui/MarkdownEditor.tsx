import React, { useState } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

/* ── 마크다운 미리보기 (읽기 전용) ─ */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  if (!source) return null;
  const html = marked(source) as string;
  return (
    <div
      className={`md-prose ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ── 마크다운 에디터 (편집 + 미리보기 탭) ─ */
interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

export function MarkdownEditor({ value, onChange, placeholder, rows = 7 }: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  return (
    <div className="border border-stone-200 dark:border-stone-600 rounded-xl overflow-hidden">
      {/* 탭 헤더 */}
      <div className="flex border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
        {(['write', 'preview'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              tab === t
                ? 'text-stone-900 dark:text-stone-100 border-b-2 border-stone-800 dark:border-stone-200 -mb-px bg-white dark:bg-stone-900'
                : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
            }`}
          >
            {t === 'write' ? '편집' : '미리보기'}
          </button>
        ))}
        <div className="flex-1" />
        <span className="px-3 py-2 text-[10px] text-stone-300 dark:text-stone-600 self-center">
          마크다운 지원
        </span>
      </div>

      {tab === 'write' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-3 text-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 outline-none resize-none leading-relaxed placeholder:text-stone-300 dark:placeholder:text-stone-600"
        />
      ) : (
        <div className="min-h-[120px] px-4 py-3 bg-white dark:bg-stone-900">
          {value.trim() ? (
            <MarkdownView source={value} className="text-sm text-stone-800 dark:text-stone-200" />
          ) : (
            <p className="text-sm text-stone-300 dark:text-stone-600">미리볼 내용이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
