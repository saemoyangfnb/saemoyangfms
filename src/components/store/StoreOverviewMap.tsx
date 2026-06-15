import { useState, useEffect, useRef } from 'react';
import type { FcdaumStore } from '../../fcdaum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kk = () => (window as any).kakao;

const geoCache = new Map<string, { lat: number; lng: number } | null>();

interface StoreItem {
  store: FcdaumStore;
  days: number | null;
  level: number;
}

interface Counts {
  all: number;
  urgent: number;
  needsVisit: number;
  ok: number;
  unknown: number;
}

interface Props {
  storeList: StoreItem[];
  counts: Counts;
  onSelect: (storeId: string, storeNo: number) => void;
}

const LEVEL_HEX: Record<number, string> = {
  0: '#94a3b8', 1: '#ef4444', 2: '#f97316', 3: '#f59e0b', 4: '#10b981',
};
const LEVEL_LABEL: Record<number, string> = {
  0: '미확인', 1: '긴급', 2: '주의', 3: '관리필요', 4: '양호',
};

function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(address)) return Promise.resolve(geoCache.get(address) ?? null);
  const k = kk();
  if (!k?.maps?.services) return Promise.resolve(null);
  return new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new k.maps.services.Geocoder().addressSearch(address, (res: any[], status: string) => {
      const pos = status === 'OK' && res[0] ? { lat: +res[0].y, lng: +res[0].x } : null;
      geoCache.set(address, pos);
      resolve(pos);
    });
  });
}

export default function StoreOverviewMap({ storeList, counts, onSelect }: Props) {
  const [kakaoReady, setKakaoReady] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const mapDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activePopupRef = useRef<any>(null);
  const cancelRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── 1. SDK 동적 로드 ─────────────────────────────────────────
  useEffect(() => {
    const key = import.meta.env.VITE_KAKAO_MAPS_KEY as string | undefined;
    if (!key) { setNoKey(true); return; }

    const activate = () => kk().maps.load(() => setKakaoReady(true));

    if (kk()?.maps?.Map) { setKakaoReady(true); return; }
    if (kk()?.maps)       { activate(); return; }
    if (document.querySelector('script[data-kakao-maps]')) return;

    const s = document.createElement('script');
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    s.setAttribute('data-kakao-maps', '1');
    s.onload  = activate;
    s.onerror = () => setNoKey(true);
    document.head.appendChild(s);
  }, []);

  // ── 2. 지도 초기화 ───────────────────────────────────────────
  useEffect(() => {
    if (!kakaoReady || !mapDivRef.current) return;
    const k = kk();
    const map = new k.maps.Map(mapDivRef.current, {
      center: new k.maps.LatLng(36.3, 127.8),
      level: 8,
    });
    mapRef.current = map;

    k.maps.event.addListener(map, 'click', () => {
      if (activePopupRef.current) { activePopupRef.current.setMap(null); activePopupRef.current = null; }
    });

    return () => { mapRef.current = null; };
  }, [kakaoReady]);

  // ── 3. 지오코딩 + 마커 생성 ──────────────────────────────────
  useEffect(() => {
    if (!kakaoReady || !mapRef.current) return;
    cancelRef.current = false;
    setLoadedCount(0);

    // 기존 오버레이 정리
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    if (activePopupRef.current) { activePopupRef.current.setMap(null); activePopupRef.current = null; }

    const map = mapRef.current;
    const k = kk();

    (async () => {
      for (const item of storeList) {
        if (cancelRef.current) return;
        const pos = await geocodeAddress(item.store.address);
        if (cancelRef.current) return;
        if (!pos) { await new Promise(r => setTimeout(r, 80)); continue; }

        // 마커 dot
        const dot = document.createElement('div');
        dot.style.cssText = [
          `width:14px`, `height:14px`, `border-radius:50%`,
          `background:${LEVEL_HEX[item.level]}`,
          `border:2.5px solid white`,
          `box-shadow:0 1px 5px rgba(0,0,0,0.4)`,
          `cursor:pointer`,
          `transform:translate(-50%,-50%)`,
          `transition:transform .1s`,
        ].join(';');

        const markerOverlay = new k.maps.CustomOverlay({
          position: new k.maps.LatLng(pos.lat, pos.lng),
          content: dot,
          zIndex: 3,
        });
        markerOverlay.setMap(map);
        overlaysRef.current.push(markerOverlay);

        // 클릭 → 팝업
        dot.addEventListener('click', e => {
          e.stopPropagation();
          dot.style.transform = 'translate(-50%,-50%) scale(1.3)';
          setTimeout(() => { dot.style.transform = 'translate(-50%,-50%)'; }, 150);

          if (activePopupRef.current) { activePopupRef.current.setMap(null); activePopupRef.current = null; }

          const popup = document.createElement('div');
          popup.style.cssText = [
            `background:white`, `border-radius:10px`,
            `box-shadow:0 4px 20px rgba(0,0,0,0.18)`,
            `padding:10px 14px`, `min-width:190px`, `white-space:nowrap`,
            `font-family:inherit`,
          ].join(';');

          const addrShort = item.store.address.split(' ').slice(0, 3).join(' ');
          const daysHtml = item.days !== null
            ? `<p style="font-size:11px;font-weight:700;color:${LEVEL_HEX[item.level]};margin:0 0 8px">QSC 점검 ${item.days}일 경과</p>`
            : '';

          popup.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="width:8px;height:8px;border-radius:50%;background:${LEVEL_HEX[item.level]};display:inline-block;flex-shrink:0"></span>
              <span style="font-weight:800;font-size:13px;color:#0f172a">${item.store.storeNm}</span>
              <span style="font-size:10px;padding:1px 6px;border-radius:9999px;background:${LEVEL_HEX[item.level]}22;color:${LEVEL_HEX[item.level]};font-weight:700">${LEVEL_LABEL[item.level]}</span>
            </div>
            <p style="font-size:11px;color:#94a3b8;margin:0 0 6px">${addrShort}</p>
            ${daysHtml}
            <button data-select style="display:block;width:100%;padding:6px 0;background:#4f46e5;color:white;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">
              매장 상세 보기 →
            </button>
          `;

          popup.querySelector('[data-select]')?.addEventListener('click', ev => {
            ev.stopPropagation();
            onSelectRef.current(item.store.storeId, item.store.storeNo);
            if (activePopupRef.current) { activePopupRef.current.setMap(null); activePopupRef.current = null; }
          });

          const popupOverlay = new k.maps.CustomOverlay({
            position: new k.maps.LatLng(pos.lat, pos.lng),
            content: popup,
            yAnchor: 1.5,
            zIndex: 10,
          });
          popupOverlay.setMap(map);
          activePopupRef.current = popupOverlay;
        });

        setLoadedCount(n => n + 1);
        await new Promise(r => setTimeout(r, 80));
      }
    })();

    return () => {
      cancelRef.current = true;
      overlaysRef.current.forEach(o => o.setMap(null));
      overlaysRef.current = [];
      if (activePopupRef.current) { activePopupRef.current.setMap(null); activePopupRef.current = null; }
    };
  }, [kakaoReady, storeList]);

  // ── 현황 카드 데이터 ─────────────────────────────────────────
  const warningCount = counts.needsVisit - (counts.urgent ?? 0);
  const statCards = [
    { label: '전체',      value: counts.all,     border: 'border-l-slate-400 dark:border-l-slate-500', num: 'text-slate-900 dark:text-white' },
    { label: '긴급',      value: counts.urgent,  border: 'border-l-red-500',                           num: 'text-red-600 dark:text-red-400' },
    { label: '주의/관리', value: warningCount,    border: 'border-l-amber-400',                         num: 'text-amber-600 dark:text-amber-400' },
    { label: '양호',      value: counts.ok,      border: 'border-l-emerald-500',                       num: 'text-emerald-600 dark:text-emerald-400' },
    { label: '미확인',    value: counts.unknown, border: 'border-l-stone-400 dark:border-l-stone-500', num: 'text-stone-500 dark:text-stone-400' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 현황 카드 */}
      <div className="px-6 py-4 shrink-0 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">가맹점 현황</p>
        <div className="grid grid-cols-5 gap-2">
          {statCards.map(c => (
            <div key={c.label} className={`border-l-4 ${c.border} bg-white dark:bg-slate-800 rounded-r-lg px-3 py-2.5 shadow-sm`}>
              <p className={`text-2xl font-black leading-none ${c.num}`}>{c.value}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 지도 영역 */}
      <div className="flex-1 relative min-h-0">
        {noKey ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 gap-2">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">카카오맵 API 키 미설정</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">.env.local에 VITE_KAKAO_MAPS_KEY를 추가하세요</p>
          </div>
        ) : !kakaoReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-500 animate-pulse">지도 로딩 중...</p>
          </div>
        ) : null}

        {/* 지도 컨테이너 — kakaoReady 관계없이 DOM에 항상 존재해야 ref 연결됨 */}
        <div
          ref={mapDivRef}
          className="absolute inset-0"
          style={{ display: kakaoReady ? 'block' : 'none' }}
        />

        {/* 범례 */}
        {kakaoReady && (
          <div className="absolute bottom-4 right-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg px-3 py-2.5 z-10 pointer-events-none">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">QSC 현황</p>
            {([1, 2, 3, 4, 0] as const).map(lv => (
              <div key={lv} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL_HEX[lv], display: 'inline-block', flexShrink: 0 }} />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{LEVEL_LABEL[lv]}</span>
              </div>
            ))}
          </div>
        )}

        {/* 로딩 진행률 */}
        {kakaoReady && loadedCount > 0 && loadedCount < storeList.length && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full shadow-sm px-4 py-1.5 z-10 pointer-events-none">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              매장 위치 로딩 {loadedCount} / {storeList.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
