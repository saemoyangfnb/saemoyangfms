import { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { FcdaumStore } from '../../fcdaum';

// southkorea-maps 공개 TopoJSON (시도 경계)
const GEO_URL =
  'https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-provinces-2018-topo-simple.json';

// 주소 첫 단어 → TopoJSON name 필드 매핑
const ADDR_TO_SIDO: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시',
  인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시',
  울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도',
  강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전라북도',   전남: '전라남도',   경북: '경상북도',
  경남: '경상남도',   제주: '제주특별자치도',
};

// 시도별 확대 뷰 (경도, 위도, zoom 배율)
const SIDO_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  '서울특별시':    { center: [126.98, 37.57], zoom: 14 },
  '부산광역시':    { center: [129.08, 35.18], zoom: 12 },
  '대구광역시':    { center: [128.60, 35.87], zoom: 12 },
  '인천광역시':    { center: [126.60, 37.49], zoom: 10 },
  '광주광역시':    { center: [126.85, 35.16], zoom: 13 },
  '대전광역시':    { center: [127.38, 36.35], zoom: 13 },
  '울산광역시':    { center: [129.31, 35.54], zoom: 11 },
  '세종특별자치시': { center: [127.29, 36.48], zoom: 14 },
  '경기도':        { center: [127.20, 37.45], zoom: 6  },
  '강원특별자치도': { center: [128.20, 37.65], zoom: 5  },
  '충청북도':      { center: [127.73, 36.63], zoom: 7  },
  '충청남도':      { center: [126.90, 36.62], zoom: 7  },
  '전라북도':      { center: [127.15, 35.71], zoom: 7  },
  '전라남도':      { center: [126.99, 34.89], zoom: 6  },
  '경상북도':      { center: [128.89, 36.42], zoom: 5  },
  '경상남도':      { center: [128.24, 35.41], zoom: 6  },
  '제주특별자치도': { center: [126.53, 33.38], zoom: 10 },
};

// QSC 레벨 → 지도 채색
const REGION_COLOR: Record<number, { base: string; hover: string; stroke: string }> = {
  '-1': { base: '#f8fafc', hover: '#f1f5f9', stroke: '#e2e8f0' },  // 매장 없음
   0: { base: '#f1f5f9', hover: '#e2e8f0', stroke: '#cbd5e1' },    // 미확인
   1: { base: '#fee2e2', hover: '#fecaca', stroke: '#fca5a5' },    // 긴급
   2: { base: '#ffedd5', hover: '#fed7aa', stroke: '#fdba74' },    // 주의
   3: { base: '#fefce8', hover: '#fef9c3', stroke: '#fde047' },    // 관리필요
   4: { base: '#dcfce7', hover: '#bbf7d0', stroke: '#86efac' },    // 양호
} as Record<number, { base: string; hover: string; stroke: string }>;

const LEVEL_HEX: Record<number, string> = {
  0: '#94a3b8', 1: '#ef4444', 2: '#f97316', 3: '#f59e0b', 4: '#10b981',
};
const LEVEL_LABEL: Record<number, string> = {
  0: '미확인', 1: '긴급', 2: '주의', 3: '관리필요', 4: '양호',
};

interface StoreItem { store: FcdaumStore; days: number | null; level: number; }
interface Counts { all: number; urgent: number; needsVisit: number; ok: number; unknown: number; }
interface Props {
  storeList: StoreItem[];
  counts: Counts;
  onSelect: (storeId: string, storeNo: number) => void;
}

function getSido(address: string) {
  return ADDR_TO_SIDO[address.split(' ')[0]] ?? '';
}

export default function StoreOverviewMap({ storeList, counts, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 시도별 최고 위험 레벨
  const sidoLevel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const { store, level } of storeList) {
      const sido = getSido(store.address);
      if (sido) m[sido] = Math.max(m[sido] ?? 0, level);
    }
    return m;
  }, [storeList]);

  // 시도별 매장 목록 (위험도 내림차순)
  const sidoStores = useMemo(() => {
    const m: Record<string, StoreItem[]> = {};
    for (const item of storeList) {
      const sido = getSido(item.store.address);
      if (!sido) continue;
      if (!m[sido]) m[sido] = [];
      m[sido].push(item);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    }
    return m;
  }, [storeList]);

  const view = selected
    ? (SIDO_VIEW[selected] ?? { center: [127.5, 36.0] as [number, number], zoom: 5 })
    : { center: [127.5, 36.5] as [number, number], zoom: 1 };

  const warningCount = counts.needsVisit - (counts.urgent ?? 0);
  const statCards = [
    { label: '전체',      value: counts.all,     border: 'border-l-slate-300 dark:border-l-slate-600', num: 'text-slate-800 dark:text-white' },
    { label: '긴급',      value: counts.urgent,  border: 'border-l-red-400',                           num: 'text-red-600 dark:text-red-400' },
    { label: '주의/관리', value: warningCount,    border: 'border-l-amber-400',                         num: 'text-amber-600 dark:text-amber-400' },
    { label: '양호',      value: counts.ok,      border: 'border-l-emerald-400',                       num: 'text-emerald-600 dark:text-emerald-400' },
    { label: '미확인',    value: counts.unknown, border: 'border-l-stone-300 dark:border-l-stone-600', num: 'text-stone-500 dark:text-stone-400' },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* 현황 카드 */}
      <div className="px-6 py-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              가맹점 현황
            </span>
            {selected && (
              <>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">›</span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{selected}</span>
              </>
            )}
          </div>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 underline"
            >
              ← 전체 지도
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {statCards.map(c => (
            <div key={c.label} className={`border-l-4 ${c.border} bg-slate-50 dark:bg-slate-800 rounded-r-lg px-3 py-2.5`}>
              <p className={`text-2xl font-black leading-none ${c.num}`}>{c.value}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 지도 + 목록 */}
      <div className="flex-1 flex min-h-0">

        {/* SVG 지도 */}
        <div
          className={`relative flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-all duration-500 ${selected ? 'w-1/2' : 'w-full'}`}
        >
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [127.5, 36.0], scale: 5500 }}
            style={{ width: '100%', height: '100%' }}
          >
            <ZoomableGroup
              center={view.center}
              zoom={view.zoom}
              minZoom={1}
              maxZoom={30}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const name: string = geo.properties?.name ?? '';
                    const level: number = sidoLevel[name] ?? -1;
                    const colors = REGION_COLOR[level] ?? REGION_COLOR[-1];
                    const isSelected = selected === name;
                    const isHovered = hovered === name;
                    const hasStores = level >= 0;

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => { if (hasStores) setSelected(p => p === name ? null : name); }}
                        onMouseEnter={() => setHovered(name)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          default: {
                            fill: isSelected ? '#e0e7ff' : colors.base,
                            stroke: isSelected ? '#818cf8' : colors.stroke,
                            strokeWidth: isSelected ? 1.5 : 0.7,
                            outline: 'none',
                            transition: 'fill 0.2s, filter 0.2s, stroke 0.2s',
                            filter: isHovered && hasStores
                              ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.20)) brightness(0.97)'
                              : 'none',
                            cursor: hasStores ? 'pointer' : 'default',
                          },
                          hover: {
                            fill: isSelected ? '#c7d2fe' : (hasStores ? colors.hover : colors.base),
                            stroke: hasStores ? '#94a3b8' : colors.stroke,
                            strokeWidth: hasStores ? 1 : 0.7,
                            outline: 'none',
                            filter: hasStores
                              ? 'drop-shadow(0 8px 14px rgba(0,0,0,0.22)) brightness(0.96)'
                              : 'none',
                            cursor: hasStores ? 'pointer' : 'default',
                          },
                          pressed: {
                            fill: '#c7d2fe',
                            stroke: '#6366f1',
                            strokeWidth: 1.5,
                            outline: 'none',
                            filter: 'none',
                          },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* 범례 */}
          {!selected && (
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-md px-3 py-2.5 pointer-events-none">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">QSC 위험도</p>
              {([1, 2, 3, 4] as const).map(lv => (
                <div key={lv} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: REGION_COLOR[lv].base,
                    border: `1px solid ${REGION_COLOR[lv].stroke}`,
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{LEVEL_LABEL[lv]}</span>
                </div>
              ))}
            </div>
          )}

          {/* 호버 시 매장 수 표시 */}
          {hovered && sidoLevel[hovered] >= 0 && !selected && (
            <div className="absolute top-4 right-4 bg-white dark:bg-slate-800 rounded-lg shadow-md px-3 py-2 pointer-events-none">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{hovered}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                매장 {sidoStores[hovered]?.length ?? 0}개
                {sidoLevel[hovered] > 0 && (
                  <span style={{ color: LEVEL_HEX[sidoLevel[hovered]] }} className="ml-1 font-bold">
                    · {LEVEL_LABEL[sidoLevel[hovered]]}
                  </span>
                )}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">클릭하면 확대됩니다</p>
            </div>
          )}
        </div>

        {/* 선택 지역 매장 목록 */}
        {selected && (
          <div className="w-1/2 flex flex-col border-l border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{selected}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {(sidoStores[selected] ?? []).length}개 매장
                    {sidoLevel[selected] >= 0 && (
                      <>
                        <span className="mx-1">·</span>
                        <span style={{ color: LEVEL_HEX[sidoLevel[selected]] }} className="font-bold">
                          최고위험 {LEVEL_LABEL[sidoLevel[selected]]}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {(sidoStores[selected] ?? []).length === 0 ? (
                <p className="p-8 text-center text-[11px] text-slate-400">이 지역에 매장이 없습니다.</p>
              ) : (
                (sidoStores[selected] ?? []).map(item => (
                  <button
                    key={item.store.storeNo}
                    onClick={() => onSelect(item.store.storeId, item.store.storeNo)}
                    className="w-full px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: LEVEL_HEX[item.level],
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex-1 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.store.storeNm}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.days !== null && (
                          <span className="text-[10px] text-slate-400">{item.days}일</span>
                        )}
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: LEVEL_HEX[item.level] + '20', color: LEVEL_HEX[item.level] }}
                        >
                          {LEVEL_LABEL[item.level]}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-3.5 mt-0.5 truncate">{item.store.address}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
