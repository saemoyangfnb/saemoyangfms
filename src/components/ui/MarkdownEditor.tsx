import React, { useEffect, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';

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

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  height?: number;
  preview?: 'edit' | 'preview' | 'live';
}

export function MarkdownEditor({
  value, onChange, placeholder, height = 200, preview = 'live',
}: MarkdownEditorProps) {
  const colorMode = useDarkMode();

  return (
    <div data-color-mode={colorMode} className="wmde-markdown-var">
      <MDEditor
        value={value}
        onChange={v => onChange(v ?? '')}
        preview={preview}
        height={height}
        visibleDragbar={false}
        textareaProps={{ placeholder }}
        style={{ fontSize: 13 }}
      />
    </div>
  );
}

interface MarkdownViewProps {
  source: string;
  className?: string;
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  const colorMode = useDarkMode();
  return (
    <div data-color-mode={colorMode} className={className}>
      <MDEditor.Markdown source={source} />
    </div>
  );
}
