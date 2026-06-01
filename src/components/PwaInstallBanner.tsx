import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* 이미 앱으로 실행 중인지 */
function useIsStandalone() {
  const [v, setV] = useState(false);
  useEffect(() => {
    setV(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }, []);
  return v;
}

/* iOS 기기 여부 */
function useIsIos() {
  const [v, setV] = useState(false);
  useEffect(() => {
    setV(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);
  return v;
}

/* ── iOS 설치 안내 모달 ──────────────────────────────────── */
function IosGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[200] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-stone-200 dark:border-stone-700 mb-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <img src="/icon.svg" className="w-12 h-12 rounded-2xl shrink-0" alt="앱 아이콘" />
          <div>
            <p className="text-sm font-black text-stone-900 dark:text-white">홈 화면에 추가</p>
            <p className="text-[11px] text-stone-400">Safari에서 아래 순서대로 진행하세요</p>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          {[
            {
              step: '1',
              icon: (
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              ),
              text: 'Safari 하단의 공유 버튼 탭',
              sub: '네모에 위쪽 화살표 아이콘',
            },
            {
              step: '2',
              icon: <span className="text-lg">➕</span>,
              text: '\'홈 화면에 추가\' 선택',
              sub: '스크롤을 내리면 나타납니다',
            },
            {
              step: '3',
              icon: <span className="text-lg">✅</span>,
              text: '오른쪽 상단 \'추가\' 탭',
              sub: '홈 화면에 앱 아이콘이 생깁니다',
            },
          ].map(({ step, icon, text, sub }) => (
            <div key={step} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-[11px] font-black text-stone-500 shrink-0">
                {step}
              </div>
              <div className="w-7 flex items-center justify-center shrink-0">{icon}</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200">{text}</p>
                <p className="text-[10px] text-stone-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4">
          ⚠️ 반드시 <strong>Safari</strong>에서 열어야 합니다. Chrome/네이버앱에서는 지원 안 됩니다.
        </p>

        <button onClick={onClose}
          className="w-full py-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl text-sm font-black hover:opacity-80">
          확인
        </button>
      </div>
    </div>
  );
}

/* ── 공통 훅 ─────────────────────────────────────────────── */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isStandalone = useIsStandalone();
  const isIos = useIsIos();
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (isIos) { setShowIosGuide(true); return; }
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  return { canInstall: !isStandalone && (!!prompt || isIos), install, isIos, showIosGuide, setShowIosGuide };
}

/* ── 하단 플로팅 배너 (최초 방문 or localStorage 7일 후 재노출) ── */
export function PwaInstallBanner() {
  const { canInstall, install, isIos, showIosGuide, setShowIosGuide } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!canInstall) return;
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (!dismissed) { setVisible(true); return; }
    const days = (Date.now() - parseInt(dismissed)) / 86400000;
    if (days >= 7) setVisible(true); // 7일 후 재노출
  }, [canInstall]);

  const dismiss = () => {
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()));
    setVisible(false);
  };

  if (!visible) return showIosGuide ? <IosGuideModal onClose={() => setShowIosGuide(false)} /> : null;

  return (
    <>
      <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[90] bg-stone-900 dark:bg-stone-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
        <img src="/icon.svg" className="w-10 h-10 rounded-xl shrink-0" alt="" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">홈 화면에 앱 추가</p>
          <p className="text-[11px] text-stone-300 mt-0.5">
            {isIos ? 'Safari 공유 → 홈 화면에 추가' : '클릭 한 번으로 앱처럼 사용'}
          </p>
        </div>
        <button onClick={install}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-900 rounded-xl text-xs font-black hover:bg-stone-100 shrink-0">
          <Download size={13} /> {isIos ? '방법 보기' : '설치'}
        </button>
        <button onClick={dismiss} className="text-stone-400 hover:text-white shrink-0">
          <X size={16} />
        </button>
      </div>
      {showIosGuide && <IosGuideModal onClose={() => setShowIosGuide(false)} />}
    </>
  );
}

/* ── 사이드바/설정용 인라인 버튼 ─────────────────────────── */
export function PwaInstallButton({ collapsed }: { collapsed?: boolean }) {
  const { canInstall, install, isIos, showIosGuide, setShowIosGuide } = usePwaInstall();
  if (!canInstall) return null;

  return (
    <>
      <button
        onClick={install}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
        title="홈 화면에 앱 추가"
      >
        <Smartphone size={14} className="shrink-0" />
        {!collapsed && <span>{isIos ? '홈 화면에 추가' : '앱 설치'}</span>}
      </button>
      {showIosGuide && <IosGuideModal onClose={() => setShowIosGuide(false)} />}
    </>
  );
}
