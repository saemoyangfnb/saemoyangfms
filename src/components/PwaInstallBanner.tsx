import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const wasDismissed = sessionStorage.getItem('pwa-banner-dismissed') === '1';
  if (isStandalone || wasDismissed || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-banner-dismissed', '1');
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setDismissed(true);
  };

  // iOS: 설치 안내 (beforeinstallprompt 미지원)
  if (isIos && !prompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-stone-900 dark:bg-stone-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3">
        <img src="/icon.svg" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">앱으로 설치하기</p>
          <p className="text-[11px] text-stone-300 mt-0.5">
            Safari 하단 <span className="font-bold">공유</span> → <span className="font-bold">홈 화면에 추가</span>
          </p>
        </div>
        <button onClick={handleDismiss} className="text-stone-400 hover:text-white shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
    );
  }

  // Android / 기타: 설치 버튼
  if (prompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-stone-900 dark:bg-stone-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <img src="/icon.svg" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">SAEMOYANG 앱 설치</p>
          <p className="text-[11px] text-stone-300 mt-0.5">홈 화면에 추가하면 더 빠르게 접속</p>
        </div>
        <button onClick={handleInstall}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-900 rounded-xl text-xs font-black hover:bg-stone-100 shrink-0">
          <Download size={13} /> 설치
        </button>
        <button onClick={handleDismiss} className="text-stone-400 hover:text-white shrink-0">
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
}
