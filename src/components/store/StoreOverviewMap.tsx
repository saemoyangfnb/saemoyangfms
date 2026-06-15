import { useState, useEffect, useRef, useCallback } from 'react';
import { Map, CustomOverlayMap } from 'react-kakao-maps-sdk';
import type { FcdaumStore } from '../../fcdaum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = window as any;

// 세션 내 지오코딩 캐시 (새로고침 전까지 유지)
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
  0: '#94a3b8',
  1: '#ef4444',
  2: '#f97316',
  3: '#f59e0b',
  4: '#10b981',
};

const LEVEL_LABEL: Record<number, string> = {
  0: '미확인', 1: '긴급', 2: '주의', 3: '관리필요', 4: '양호',
};

function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(address)) return Promise.resolve(geoCache.get(address) ?? null);
  if (!win.kakao?.maps?.services) return Promise.resolve(null);
  return new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new win.kakao.maps.services.Geocoder().addressSearch(address, (res: any[], status: string) => {
      if (status === 'OK' && res[0]) {
        const pos = { lat: +res[0].y, lng: +res[0].x };
        geoCache.set(address, pos);
        resolve(pos);
      } else {
        geoCache.set(address, null);
        resolve(null);
      }
    });
  });
}

export default function StoreOverviewMap({ storeList, counts, onSelect }: Props) {
  const [kakaoReady, setKakaoReady] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [positions, setPositions] = useState<Map<number, { lat: number; lng: number }>>(new Map());
  const [activeNo, setActiveNo] = useState<number | null>(null);
  const cancelRef = useRef(false);

  // 카카오맵 SDK 동적 로드
  useEffect(() => {
    const key = import.meta.env.VITE_KAKAO_MAPS_KEY as string | undefined;
    if (!key) { setNoKey(true); return; }

    // 이미 로드된 경우
    if (win.kakao?.maps?.Map) { setKakaoReady(true); return; }
    if (win.kakao?.maps) { win.kakao.maps.load(() => setKakaoReady(true)); return; }
    if (document.querySelector('script[data-kakao-maps]')) return;

    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    script.setAttribute('data-kakao-maps', '1');
    script.onload = () => win.kakao.maps.load(() => setKakaoReady(true));
    script.onerror = () => setNoKey(true);
    document.head.appendChild(script);
  }, []);

  // 주소 → 좌표 순차 변환 (100ms 간격, rate limit 대응)
  useEffect(() => {
    if (!kakaoReady) return;
    cancelRef.current = false;
    (async () => {
      for (const { store } of storeList) {
        if (cancelRef.current) return;
        const pos = await geocodeAddress(store.address);
        if (!cancelRef.current && pos) {
          setPositions(prev => new Map(prev).set(store.storeNo, pos));
        }
        await new Promise(r => setTimeout(r, 80));
      }
    })();
    return () => { cancelRef.current = true; };
  }, [kakaoReady, storeList]);

  const handleMarkerClick = useCallback((storeNo: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveNo(prev => prev === storeNo ? null : storeNo);
  }, []);

  const warningCount = counts.needsVisit - (counts.urgent ?? 0);

  const statCards = [
    { label: '전체',     value: counts.all,      border: 'border-l-slate-400 dark:border-l-slate-500', num: 'text-slate-900 dark:text-white' },
    { label: '긴급',     value: counts.urgent,   border: 'border-l-red-500',                           num: 'text-red-600 dark:text-red-400' },
    { label: '주의/관리', value: warningCount,     border: 'border-l-amber-400',                         num: 'text-amber-600 dark:text-amber-400' },
    { label: '양호',     value: counts.ok,       border: 'border-l-emerald-500',                       num: 'text-emerald-600 dark:text-emerald-400' },
    { label: '미확인',   value: counts.unknown,  border: 'border-l-stone-400 dark:border-l-stone-500', num: 'text-stone-500 dark:text-stone-400' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 현황 요약 카드 */}
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
      <div className="flex-1 relative min-h-0" onClick={() => setActiveNo(null)}>
        {noKey ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 gap-2">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">카카오맵 API 키 미설정</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">.env.local에 VITE_KAKAO_MAPS_KEY를 추가하세요</p>
          </div>
        ) : !kakaoReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-500 animate-pulse">지도 로딩 중...</p>
          </div>
        ) : (
          <Map
            center={{ lat: 36.3, lng: 127.8 }}
            level={8}
            style={{ width: '100%', height: '100%' }}
          >
            {storeList.map(item => {
              const pos = positions.get(item.store.storeNo);
              if (!pos) return null;
              const isActive = activeNo === item.store.storeNo;

              return (
                <CustomOverlayMap key={item.store.storeNo} position={pos} zIndex={isActive ? 20 : 1}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    {/* 마커 */}
                    <div
                      onClick={e => handleMarkerClick(item.store.storeNo, e)}
                      title={item.store.storeNm}
                      style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: LEVEL_HEX[item.level],
                        border: '2.5px solid white',
                        boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />

                    {/* 클릭 팝업 */}
                    {isActive && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', bottom: 18, left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'white', borderRadius: 10,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                          padding: '10px 14px', minWidth: 190, zIndex: 30,
                        }}
                      >
                        {/* 말풍선 꼬리 */}
                        <div style={{
                          position: 'absolute', bottom: -7, left: '50%',
                          transform: 'translateX(-50%)',
                          width: 14, height: 7, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: 14, height: 14, background: 'white',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                            transform: 'rotate(45deg)', marginTop: -7, marginLeft: 0,
                          }} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: LEVEL_HEX[item.level],
                          }} />
                          <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {item.store.storeNm}
                          </span>
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 9999,
                            background: LEVEL_HEX[item.level] + '22',
                            color: LEVEL_HEX[item.level], fontWeight: 700, whiteSpace: 'nowrap',
                          }}>
                            {LEVEL_LABEL[item.level]}
                          </span>
                        </div>

                        <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, whiteSpace: 'nowrap' }}>
                          {item.store.address.split(' ').slice(0, 3).join(' ')}
                        </p>

                        {item.days !== null && (
                          <p style={{
                            fontSize: 11, fontWeight: 700, color: LEVEL_HEX[item.level],
                            marginBottom: 8, whiteSpace: 'nowrap',
                          }}>
                            QSC 점검 {item.days}일 경과
                          </p>
                        )}

                        <button
                          onClick={e => { e.stopPropagation(); onSelect(item.store.storeId, item.store.storeNo); setActiveNo(null); }}
                          style={{
                            display: 'block', width: '100%', padding: '6px 0',
                            background: '#4f46e5', color: 'white', border: 'none',
                            borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          매장 상세 보기 →
                        </button>
                      </div>
                    )}
                  </div>
                </CustomOverlayMap>
              );
            })}
          </Map>
        )}

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

        {/* 지오코딩 진행률 표시 */}
        {kakaoReady && positions.size > 0 && positions.size < storeList.length && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full shadow-sm px-4 py-1.5 z-10 pointer-events-none">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              매장 위치 로딩 {positions.size} / {storeList.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
