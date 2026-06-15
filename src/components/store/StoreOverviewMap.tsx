import { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { FcdaumStore } from '../../fcdaum';

const GEO_URL =
  'https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-provinces-2018-topo-simple.json';

const ADDR_TO_SIDO: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시',
  인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시',
  울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도',
  강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전라북도',   전남: '전라남도',   경북: '경상북도',
  경남: '경상남도',   제주: '제주특별자치도',
};

// ZoomableGroup 없이 projectionConfig 교체로 zoom 구현
// scale = 5500 기준, province별 배율 사전 지정
const SIDO_PROJ: Record<string, { center: [number, number]; scale: number }> = {
  '서울특별시':    { center: [126.98, 37.57], scale: 80000 },
  '부산광역시':    { center: [129.08, 35.18], scale: 55000 },
  '대구광역시':    { center: [128.60, 35.87], scale: 55000 },
  '인천광역시':    { center: [126.55, 37.49], scale: 45000 },
  '광주광역시':    { center: [126.85, 35.16], scale: 65000 },
  '대전광역시':    { center: [127.38, 36.35], scale: 65000 },
  '울산광역시':    { center: [129.31, 35.54], scale: 50000 },
  '세종특별자치시': { center: [127.29, 36.48], scale: 90000 },
  '경기도':        { center: [127.20, 37.45], scale: 22000 },
  '강원특별자치도': { center: [128.30, 37.65], scale: 18000 },
  '충청북도':      { center: [127.73, 36.63], scale: 28000 },
  '충청남도':      { center: [126.90, 36.55], scale: 28000 },
  '전라북도':      { center: [127.15, 35.71], scale: 28000 },
  '전라남도':      { center: [127.00, 34.85], scale: 22000 },
  '경상북도':      { center: [128.89, 36.42], scale: 18000 },
  '경상남도':      { center: [128.25, 35.35], scale: 22000 },
  '제주특별자치도': { center: [126.53, 33.38], scale: 38000 },
};

const OVERVIEW_PROJ = { center: [127.5, 36.2] as [number, number], scale: 5200 };

const REGION_COLOR: Record<string, { base: string; hover: string; stroke: string }> = {
  none: { base: '#f8fafc', hover: '#f1f5f9', stroke: '#e2e8f0' },
  '0':  { base: '#f1f5f9', hover: '#e2e8f0', stroke: '#cbd5e1' },
  '1':  { base: '#fee2e2', hover: '#fecaca', stroke: '#fca5a5' },
  '2':  { base: '#ffedd5', hover: '#fed7aa', stroke: '#fdba74' },
  '3':  { base: '#fefce8', hover: '#fef9c3', stroke: '#fde047' },
  '4':  { base: '#dcfce7', hover: '#bbf7d0', stroke: '#86efac' },
};

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
  const [hovered, setHovered]   = useState<string | null>(null);

  const sidoLevel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const { store, level } of storeList) {
      const s = getSido(store.address);
      if (s) m[s] = Math.max(m[s] ?? 0, level);
    }
    return m;
  }, [storeList]);

  const sidoStores = useMemo(() => {
    const m: Record<string, StoreItem[]> = {};
    for (const item of storeList) {
      const s = getSido(item.store.address);
      if (!s) continue;
      if (!m[s]) m[s] = [];
      m[s].push(item);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    }
    return m;
  }, [storeList]);

  const proj = selected ? (SIDO_PROJ[selected] ?? OVERVIEW_PROJ) : OVERVIEW_PROJ;

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
                <span className="text-slate-300 dark:text-slate-600 text-[10px]">›</span>
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
        <div className={`relative bg-slate-50 dark:bg-slate-950 transition-all duration-300 ${selected ? 'w-1/2' : 'w-full'}`}>
          <ComposableMap
            key={selected ?? '__overview__'}   // proj 교체 시 완전 리마운트로 깜빡임 방지
            projection="geoMercator"
            projectionConfig={{ center: proj.center, scale: proj.scale }}
            style={{ width: '100%', height: '100%' }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const name: string = geo.properties?.name ?? '';
                  const level = sidoLevel[name];
                  const hasStores = level !== undefined;
                  const colorKey = hasStores ? String(level) : 'none';
                  const colors = REGION_COLOR[colorKey] ?? REGION_COLOR.none;
                  const isSelected = selected === name;
                  const isHovered  = hovered  === name;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => { if (hasStores) setSelected(p => p === name ? null : name); }}
                      onMouseEnter={() => setHovered(name)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        default: {
                          fill:        isSelected ? '#e0e7ff' : colors.base,
                          stroke:      isSelected ? '#818cf8' : colors.stroke,
                          strokeWidth: isSelected ? 1.5 : 0.7,
                          outline:     'none',
                          filter: isHovered && hasStores
                            ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.22)) brightness(0.96)'
                            : 'none',
                          cursor: hasStores ? 'pointer' : 'default',
                          transition: 'fill 0.15s, filter 0.15s',
                        },
                        hover: {
                          fill:        isSelected ? '#c7d2fe' : (hasStores ? colors.hover : colors.base),
                          stroke:      hasStores ? '#94a3b8' : colors.stroke,
                          strokeWidth: hasStores ? 1 : 0.7,
                          outline:     'none',
                          filter:      hasStores ? 'drop-shadow(0 8px 16px rgba(0,0,0,0.25)) brightness(0.95)' : 'none',
                          cursor:      hasStores ? 'pointer' : 'default',
                        },
                        pressed: {
                          fill:        '#c7d2fe',
                          stroke:      '#6366f1',
                          strokeWidth: 1.5,
                          outline:     'none',
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* 범례 */}
          {!selected && (
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-md px-3 py-2.5 pointer-events-none">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">QSC 위험도</p>
              {(['1','2','3','4'] as const).map(lv => (
                <div key={lv} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: REGION_COLOR[lv].base,
                    border: `1px solid ${REGION_COLOR[lv].stroke}`,
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{LEVEL_LABEL[+lv]}</span>
                </div>
              ))}
            </div>
          )}

          {/* 호버 툴팁 */}
          {hovered && sidoLevel[hovered] !== undefined && !selected && (
            <div className="absolute top-4 right-4 bg-white dark:bg-slate-800 rounded-xl shadow-md px-3.5 py-2.5 pointer-events-none">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{hovered}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                매장 {sidoStores[hovered]?.length ?? 0}개
                <span style={{ color: LEVEL_HEX[sidoLevel[hovered]] }} className="ml-1.5 font-bold">
                  {LEVEL_LABEL[sidoLevel[hovered]]}
                </span>
              </p>
              <p className="text-[9px] text-indigo-400 mt-1">클릭해서 확대</p>
            </div>
          )}
        </div>

        {/* 선택 지역 매장 목록 */}
        {selected && (
          <div className="w-1/2 flex flex-col border-l border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <p className="text-sm font-black text-slate-900 dark:text-white">{selected}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {(sidoStores[selected] ?? []).length}개 매장
                {sidoLevel[selected] !== undefined && (
                  <>
                    <span className="mx-1">·</span>
                    <span style={{ color: LEVEL_HEX[sidoLevel[selected]] }} className="font-bold">
                      최고위험 {LEVEL_LABEL[sidoLevel[selected]]}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
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
