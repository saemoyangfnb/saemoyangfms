import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/Toast.tsx';
import { ConfirmProvider } from './components/ConfirmModal.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// PWA 구 청크 캐시 충돌 — 자동 새로고침 복구
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message ?? '';
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    e.preventDefault();
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
