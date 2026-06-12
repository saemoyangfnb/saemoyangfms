import React, { lazy, Suspense, useEffect, useState } from 'react';

const MDEditor = lazy(() => import('@uiw/react-md-editor'));

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  height?: number;
  preview?: 'edit' | 'preview' | 'live';
}

function useDarkMode() {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const update = () => {
      setColorMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colorMode;
}

export function MarkdownEditor({
  value, onChange, placeholder, height = 200, preview = 'live',
}: MarkdownEditorProps) {
  const colorMode = useDarkMode();

  return (
    <div data-color-mode={colorMode} className="wmde-markdown-var">
      <Suspense fallback={
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 outline-none resize-none"
        />
      }>
        <MDEditor
          value={value}
          onChange={v => onChange(v ?? '')}
          preview={preview}
          height={height}
          visibleDragbar={false}
          textareaProps={{ placeholder }}
          style={{ fontSize: 13 }}
        />
      </Suspense>
    </div>
  );
}

interface MarkdownViewProps {
  source: string;
  className?: string;
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  const colorMode = useDarkMode();
  const [MDEditorModule, setMDEditorModule] = useState<{ Markdown: React.FC<{ source: string }> } | null>(null);

  useEffect(() => {
    import('@uiw/react-md-editor').then(m => setMDEditorModule(m.default as unknown as { Markdown: React.FC<{ source: string }> }));
  }, []);

  if (!MDEditorModule) {
    return <p className={`text-sm whitespace-pre-wrap ${className ?? ''}`}>{source}</p>;
  }

  const { Markdown } = MDEditorModule;
  return (
    <div data-color-mode={colorMode} className={className}>
      <Markdown source={source} />
    </div>
  );
}
