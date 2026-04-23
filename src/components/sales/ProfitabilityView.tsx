import React, { useState, useEffect, useMemo } from 'react';
import { BrandId, MenuSalesRecord, Menu, Ingredient } from '../../types';
import { salesDb } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { calculateTotalCost } from '../../utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line
} from 'recharts';
import { TrendingUp, Store, BarChart2, AlertCircle } from 'lucide-react';

// ==========================================
// 유틸
// ==========================================

const fmt = (n: number) => n.toLocaleString('ko-KR');
const fmtRate = (n: number) => (n * 100).toFixed(1) + '%';

/** POS 상품명 정규화:
 *  - 앞의 (점) 제거 (점심 특선 표시)
 *  - 뒤의 T 제거 (티오더 표시)
 *  - 괄호 안 내용 제거 (고/무침 등 구성 설명)
 *  - 공백 제거, 소문자
 */
const normalizePosName = (s: string): string =>
  s
    .replace(/^\(점\)\s*/u, '')        // (점) 접두사
    .replace(/T$/u, '')                // T 접미사 (티오더)
    .replace(/\s*\([^)]*\)\s*/g, '')   // 괄호 내용 제거 (고/무침 등)
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();

const normalizeMenuName = (s: string): string =>
  s
    .replace(/\s*\([^)]*\)\s*/g, '')   // 괄호 내용 제거
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();

/** POS 상품명 ↔ 시스템 메뉴명 매칭 (4단계) */
const matchMenu = (salesName: string, menus: Menu[]): Menu | null => {
  const rawClean = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  // 1차: 공백만 제거한 정확 일치
  const t1 = rawClean(salesName);
  const exact = menus.find(m => rawClean(m.name) === t1);
  if (exact) return exact;

  // 2차: POS 정규화 후 정확 일치
  const t2 = normalizePosName(salesName);
  const norm = menus.find(m => normalizeMenuName(m.name) === t2);
  if (norm) return norm;

  // 3차: 포함 관계 (정규화 기준)
  const partial = menus.find(m => {
    const mn = normalizeMenuName(m.name);
    return t2.includes(mn) || mn.includes(t2);
  });
  if (partial) return partial;

  // 4차: 포함 관계 (원본 공백 제거 기준)
  const partial2 = menus.find(m => {
    const mn = rawClean(m.name);
    return t1.includes(mn) || mn.includes(t1);
  });
  return partial2 ?? null;
};

// ==========================================
// 서브 컴포넌트: 매장별 비교
// ==========================================

interface StoreRow {
  store: string;
  netSales: number;
  estCost: number;
  profit: number;
  costRate: number;
  matchedSales: number; // 원가 매칭된 매출 비중
}

function StoreComparisonTab({ records, menus, ingredients }: {
  records: MenuSalesRecord[];
  menus: Menu[];
  ingredients: Ingredient[];
}) {
  const [showUnmatched, setShowUnmatched] = useState(false);

  const { rows, unmatchedNames } = useMemo(() => {
    const storeMap: Record<string, { netSales: number; estCost: number; matchedSales: number }> = {};
    const unmatched = new Set<string>();

    for (const r of records) {
      if (!storeMap[r.storeShortName]) {
        storeMap[r.storeShortName] = { netSales: 0, estCost: 0, matchedSales: 0 };
      }
      const s = storeMap[r.storeShortName];
      s.netSales += r.netSales;

      const menu = matchMenu(r.menuName, menus);
      if (menu && r.quantity > 0) {
        const unitCost = calculateTotalCost(menu.recipe, ingredients, menus);
        s.estCost += unitCost * r.quantity;
        s.matchedSales += r.netSales;
      } else if (r.netSales > 0) {
        unmatched.add(r.menuName);
      }
    }

    return {
      rows: Object.entries(storeMap)
        .map(([store, v]) => ({
          store,
          netSales: v.netSales,
          estCost: v.estCost,
          profit: v.netSales - v.estCost,
          costRate: v.netSales > 0 ? v.estCost / v.netSales : 0,
          matchedSales: v.matchedSales,
        }))
        .sort((a, b) => b.netSales - a.netSales),
      unmatchedNames: Array.from(unmatched).sort(),
    };
  }, [records, menus, ingredients]);

  const hasAnyMenu = menus.length > 0;
  const chartData = rows.map(r => ({
    name: r.store,
    매출: Math.round(r.netSales / 10000),
    추정원가: Math.round(r.estCost / 10000),
    이익: Math.round(r.profit / 10000),
  }));

  return (
    <div className="space-y-6">
      {!hasAnyMenu && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-sm text-yellow-700 dark:text-yellow-400">
          <AlertCircle size={16} />
          이 브랜드의 메뉴 데이터가 없어 원가 계산을 건너뜁니다.
        </div>
      )}

      {/* 미매칭 메뉴 목록 */}
      {hasAnyMenu && unmatchedNames.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-700 rounded-sm overflow-hidden">
          <button
            onClick={() => setShowUnmatched(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-500" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                원가 미매칭 POS 메뉴 {unmatchedNames.length}개 — 시스템 메뉴명과 달라 원가 계산 제외됨
              </span>
            </div>
            <span className="text-xs text-amber-500">{showUnmatched ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showUnmatched && (
            <div className="px-4 py-3 bg-white dark:bg-stone-900 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {unmatchedNames.map(name => (
                <div key={name} className="text-xs text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 rounded px-2 py-1 truncate">
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 바 차트 */}
      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-4">
        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">매장별 매출 / 원가 / 이익 (만원)</h4>
        <ResponsiveContainer width="100%" height={280} minWidth={300} minHeight={200} debounce={50}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}만`} />
            <Tooltip formatter={(v: number) => `${v.toLocaleString()}만원`} />
            <Legend verticalAlign="top" />
            <Bar dataKey="매출" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            {hasAnyMenu && <Bar dataKey="추정원가" fill="#f97316" radius={[2, 2, 0, 0]} />}
            {hasAnyMenu && <Bar dataKey="이익" fill="#22c55e" radius={[2, 2, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-stone-200 dark:border-stone-700">
              <th className="text-left py-3 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">매장</th>
              <th className="text-right py-3 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">실매출</th>
              {hasAnyMenu && <>
                <th className="text-right py-3 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">추정원가</th>
                <th className="text-right py-3 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">추정이익</th>
                <th className="text-right py-3 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">원가율</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.store} className={`border-b border-stone-100 dark:border-stone-800 ${i % 2 === 0 ? '' : 'bg-stone-50 dark:bg-stone-800/50'}`}>
                <td className="py-2.5 px-3 font-bold text-stone-800 dark:text-white">{r.store}</td>
                <td className="py-2.5 px-3 text-right text-stone-700 dark:text-stone-300">{fmt(r.netSales)}원</td>
                {hasAnyMenu && <>
                  <td className="py-2.5 px-3 text-right text-orange-600 dark:text-orange-400">
                    {r.estCost > 0 ? fmt(Math.round(r.estCost)) + '원' : <span className="text-stone-400 text-xs">미매칭</span>}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-bold ${r.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {r.estCost > 0 ? fmt(Math.round(r.profit)) + '원' : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {r.estCost > 0 ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        r.costRate < 0.3 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        r.costRate < 0.4 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>{fmtRate(r.costRate)}</span>
                    ) : '-'}
                  </td>
                </>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-300 dark:border-stone-600 font-black">
              <td className="py-3 px-3 text-stone-900 dark:text-white">합계</td>
              <td className="py-3 px-3 text-right text-stone-900 dark:text-white">
                {fmt(rows.reduce((s, r) => s + r.netSales, 0))}원
              </td>
              {hasAnyMenu && <>
                <td className="py-3 px-3 text-right text-orange-600 dark:text-orange-400">
                  {fmt(Math.round(rows.reduce((s, r) => s + r.estCost, 0)))}원
                </td>
                <td className="py-3 px-3 text-right text-green-600 dark:text-green-400">
                  {fmt(Math.round(rows.reduce((s, r) => s + r.profit, 0)))}원
                </td>
                <td className="py-3 px-3 text-right">
                  {(() => {
                    const totalSales = rows.reduce((s, r) => s + r.netSales, 0);
                    const totalCost = rows.reduce((s, r) => s + r.estCost, 0);
                    return totalSales > 0 ? fmtRate(totalCost / totalSales) : '-';
                  })()}
                </td>
              </>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 서브 컴포넌트: 메뉴별 분석
// ==========================================

interface MenuRow {
  menuName: string;
  category1: string;
  totalQty: number;
  totalSales: number;
  unitCost: number;
  totalCost: number;
  profit: number;
  costRate: number;
  matched: boolean;
}

function MenuAnalysisTab({ records, menus, ingredients }: {
  records: MenuSalesRecord[];
  menus: Menu[];
  ingredients: Ingredient[];
}) {
  const [sortKey, setSortKey] = useState<'totalSales' | 'totalQty' | 'costRate' | 'profit'>('totalSales');

  const rows = useMemo<MenuRow[]>(() => {
    const menuMap: Record<string, MenuRow> = {};

    for (const r of records) {
      if (!menuMap[r.menuName]) {
        const sysMenu = matchMenu(r.menuName, menus);
        const unitCost = sysMenu ? calculateTotalCost(sysMenu.recipe, ingredients, menus) : 0;
        menuMap[r.menuName] = {
          menuName: r.menuName,
          category1: r.category1,
          totalQty: 0,
          totalSales: 0,
          unitCost,
          totalCost: 0,
          profit: 0,
          costRate: 0,
          matched: !!sysMenu,
        };
      }
      const m = menuMap[r.menuName];
      m.totalQty += r.quantity;
      m.totalSales += r.netSales;
      m.totalCost += m.unitCost * r.quantity;
    }

    return Object.values(menuMap).map(m => ({
      ...m,
      profit: m.totalSales - m.totalCost,
      costRate: m.totalSales > 0 && m.totalCost > 0 ? m.totalCost / m.totalSales : 0,
    }));
  }, [records, menus, ingredients]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sortKey === 'costRate') return b.costRate - a.costRate;
    return b[sortKey] - a[sortKey];
  }), [rows, sortKey]);

  const totalSalesSum = rows.reduce((s, r) => s + r.totalSales, 0);

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button
      onClick={() => setSortKey(k)}
      className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
        sortKey === k
          ? 'bg-blue-600 text-white'
          : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-stone-500 font-bold">정렬:</span>
        <SortBtn k="totalSales" label="매출순" />
        <SortBtn k="totalQty" label="판매량순" />
        <SortBtn k="profit" label="이익순" />
        <SortBtn k="costRate" label="원가율순" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-stone-200 dark:border-stone-700">
              <th className="text-left py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">상품명</th>
              <th className="text-left py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider hidden sm:table-cell">카테고리</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">수량</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">실매출</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">매출비중</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">단위원가</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">원가율</th>
              <th className="text-right py-2.5 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">공헌이익</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.menuName}
                className={`border-b border-stone-100 dark:border-stone-800 ${i % 2 === 0 ? '' : 'bg-stone-50 dark:bg-stone-800/50'}`}
              >
                <td className="py-2 px-3">
                  <div className="font-bold text-stone-800 dark:text-white text-xs leading-tight">{r.menuName}</div>
                  {!r.matched && (
                    <div className="text-[10px] text-amber-500 mt-0.5">원가 미매칭</div>
                  )}
                </td>
                <td className="py-2 px-3 text-stone-500 dark:text-stone-400 text-xs hidden sm:table-cell">{r.category1}</td>
                <td className="py-2 px-3 text-right text-stone-700 dark:text-stone-300">{r.totalQty.toLocaleString()}</td>
                <td className="py-2 px-3 text-right text-stone-700 dark:text-stone-300 text-xs">{fmt(r.totalSales)}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-12 bg-stone-100 dark:bg-stone-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (r.totalSales / totalSalesSum) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-stone-600 dark:text-stone-400 w-8 text-right">
                      {totalSalesSum > 0 ? ((r.totalSales / totalSalesSum) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right text-xs text-stone-600 dark:text-stone-400">
                  {r.matched && r.unitCost > 0 ? fmt(Math.round(r.unitCost)) : '-'}
                </td>
                <td className="py-2 px-3 text-right">
                  {r.matched && r.costRate > 0 ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                      r.costRate < 0.3 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      r.costRate < 0.4 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{fmtRate(r.costRate)}</span>
                  ) : <span className="text-stone-300 dark:text-stone-600">-</span>}
                </td>
                <td className={`py-2 px-3 text-right text-xs font-bold ${r.profit > 0 ? 'text-green-600 dark:text-green-400' : r.profit < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                  {r.matched && r.totalCost > 0 ? fmt(Math.round(r.profit)) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// 서브 컴포넌트: 기간 트렌드
// ==========================================

function TrendTab({ brandId }: { brandId: BrandId }) {
  const [trendData, setTrendData] = useState<{ yearMonth: string; [store: string]: number | string }[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const q = query(collection(salesDb, 'menu_sales'), where('brandId', '==', brandId));
        const snap = await getDocs(q);
        const all: MenuSalesRecord[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuSalesRecord));

        // 월별 × 매장별 집계
        const map: Record<string, Record<string, number>> = {};
        const storeSet = new Set<string>();

        for (const r of all) {
          if (!map[r.yearMonth]) map[r.yearMonth] = {};
          map[r.yearMonth][r.storeShortName] = (map[r.yearMonth][r.storeShortName] || 0) + r.netSales;
          storeSet.add(r.storeShortName);
        }

        const storeList = Array.from(storeSet).sort();
        setStores(storeList);

        const rows = Object.keys(map).sort().map(ym => ({
          yearMonth: ym,
          ...Object.fromEntries(storeList.map(s => [s, Math.round((map[ym][s] || 0) / 10000)])),
        }));
        setTrendData(rows);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [brandId]);

  const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16', '#ef4444'];

  if (loading) return <div className="text-sm text-stone-400 py-8 text-center">불러오는 중...</div>;
  if (trendData.length === 0) return <div className="text-sm text-stone-400 py-8 text-center">데이터가 없습니다. 먼저 CSV를 업로드하세요.</div>;

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest">월별 매장별 실매출 추이 (만원)</h4>
      <ResponsiveContainer width="100%" height={320} minWidth={300} minHeight={200} debounce={50}>
        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}만`} />
          <Tooltip formatter={(v: number) => `${v.toLocaleString()}만원`} />
          <Legend />
          {stores.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ==========================================
// 메인 컴포넌트
// ==========================================

type Tab = 'store' | 'menu' | 'trend';

interface Props {
  activeBrand: BrandId | null;
  menus: Menu[];
  ingredients: Ingredient[];
}

export function ProfitabilityView({ activeBrand, menus, ingredients }: Props) {
  const [tab, setTab] = useState<Tab>('store');
  const [records, setRecords] = useState<MenuSalesRecord[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 업로드된 월 목록 조회
  useEffect(() => {
    if (!activeBrand) return;
    const fetchMonths = async () => {
      const q = query(collection(salesDb, 'menu_sales'), where('brandId', '==', activeBrand));
      const snap = await getDocs(q);
      const months = Array.from(new Set(snap.docs.map(d => d.data().yearMonth as string))).sort().reverse();
      setAvailableMonths(months);
      if (months.length > 0 && !selectedMonth) setSelectedMonth(months[0]);
    };
    fetchMonths();
  }, [activeBrand]);

  // 선택 월 데이터 조회
  useEffect(() => {
    if (!activeBrand || !selectedMonth) return;
    setLoading(true);
    const q = query(
      collection(salesDb, 'menu_sales'),
      where('brandId', '==', activeBrand),
      where('yearMonth', '==', selectedMonth)
    );
    getDocs(q).then(snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuSalesRecord)));
      setLoading(false);
    });
  }, [activeBrand, selectedMonth]);

  const brandMenus = useMemo(() => menus.filter(m => (m.brandId || 'dalbitgo') === activeBrand), [menus, activeBrand]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'store', label: '매장별 비교', icon: <Store size={15} /> },
    { key: 'menu', label: '메뉴별 분석', icon: <BarChart2 size={15} /> },
    { key: 'trend', label: '기간 트렌드', icon: <TrendingUp size={15} /> },
  ];

  if (availableMonths.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <BarChart2 size={36} className="text-stone-300" />
        <p className="text-sm font-bold text-stone-500 dark:text-stone-400">
          업로드된 메뉴 매출 데이터가 없습니다.
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-500">
          "메뉴 매출 업로드" 탭에서 firstpos CSV를 먼저 업로드하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 기간 선택 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">분석 기간:</span>
        {availableMonths.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              selectedMonth === m
                ? 'bg-blue-600 text-white'
                : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-sm border border-stone-200 dark:border-stone-700 w-full sm:w-auto sm:inline-flex">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 컨텐츠 */}
      {loading ? (
        <div className="text-sm text-stone-400 py-8 text-center">불러오는 중...</div>
      ) : (
        <>
          {tab === 'store' && (
            <StoreComparisonTab records={records} menus={brandMenus} ingredients={ingredients} />
          )}
          {tab === 'menu' && (
            <MenuAnalysisTab records={records} menus={brandMenus} ingredients={ingredients} />
          )}
          {tab === 'trend' && activeBrand && (
            <TrendTab brandId={activeBrand} />
          )}
        </>
      )}
    </div>
  );
}
