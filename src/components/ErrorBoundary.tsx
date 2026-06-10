import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const isChunkLoadError = (err: Error) =>
  err?.message?.includes('Failed to fetch dynamically imported module') ||
  err?.message?.includes('Importing a module script failed') ||
  err?.name === 'ChunkLoadError';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
    // PWA 구 청크 캐시 충돌 — 즉시 새로고침으로 복구
    if (isChunkLoadError(error)) {
      window.location.reload();
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;
    const isFirestoreInternal = error?.message?.includes('INTERNAL ASSERTION FAILED');
    const isChunkError = error ? isChunkLoadError(error) : false;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-stone-100 dark:bg-stone-950">
        <div className="max-w-2xl w-full bg-[#FDFBF7] dark:bg-stone-900 border-2 border-stone-800 dark:border-stone-500 shadow-sm">
          <div className="border-b-[3px] border-double border-stone-800 dark:border-stone-300 px-6 py-5 flex items-center gap-3">
            <AlertTriangle className="text-rose-600 dark:text-rose-400" size={22} />
            <div>
              <h1 className="text-xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                일시적인 오류가 발생했습니다
              </h1>
              <p className="text-xs text-stone-500 dark:text-stone-400 tracking-widest mt-1">
                ERROR · 화면 일부를 표시할 수 없습니다
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
              {isChunkError
                ? '앱이 업데이트되었습니다. 자동으로 새로고침 중...'
                : isFirestoreInternal
                  ? '데이터베이스 연결 상태에 일시적 문제가 발생했습니다. 페이지를 새로고침하면 대부분 해결됩니다.'
                  : '예기치 않은 오류로 화면이 멈췄습니다. 새로고침 또는 다시 시도를 눌러 주세요.'}
            </p>

            {error && (
              <details className="text-xs text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 p-3">
                <summary className="cursor-pointer font-bold tracking-widest uppercase">기술 정보</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">
                  {error.name}: {error.message}
                  {errorInfo?.componentStack && '\n\n' + errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-bold hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-sm font-bold hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors border border-stone-300 dark:border-stone-700"
              >
                다시 시도
              </button>
            </div>

            <p className="text-[11px] text-stone-400 dark:text-stone-500 pt-2">
              데이터에는 영향이 없습니다. 새로고침으로 해결되지 않으면 관리자에게 문의해 주세요.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
