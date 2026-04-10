import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { salesDb as db } from '../../firebase';
import { MonthlySalesRecord } from '../../types';
import { formatShortMoney } from '../../utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList } from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Minus, Filter, List } from 'lucide-react';

export function MonthlySalesView({ activeBrand }: { activeBrand: string | null }) {
  const [data, setData] = useState<MonthlySalesRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [years, setYears] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  
  const [storesMultiMode, setStoresMultiMode] = useState(false);

  useEffect(() => {
    if (!activeBrand) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'monthly_sales'), where('brandId', '==', activeBrand));
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(doc => doc.data() as MonthlySalesRecord);
        setData(records);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeBrand]);

  // Derived unique lists for filters
  const allYears = useMemo(() => Array.from(new Set(data.map(d => d.yearMonth.split('-')[0]))).sort((a: string, b: string) => b.localeCompare(a)), [data]);
  
  // Apply year filter to cascading lists
  const filteredByYear = useMemo(() => years.length > 0 ? data.filter(d => years.includes(d.yearMonth.split('-')[0])) : data, [data, years]);
  const allCities = useMemo(() => Array.from(new Set(filteredByYear.map(d => d.city))).sort(), [filteredByYear]);

  const filteredByCity = useMemo(() => cities.length > 0 ? filteredByYear.filter(d => cities.includes(d.city)) : filteredByYear, [filteredByYear, cities]);
  const allDistricts = useMemo(() => Array.from(new Set(filteredByCity.map(d => d.district))).sort(), [filteredByCity]);

  const filteredByDistrict = useMemo(() => districts.length > 0 ? filteredByCity.filter(d => districts.includes(d.district)) : filteredByCity, [filteredByCity, districts]);
  const allStores = useMemo(() => Array.from(new Set(filteredByDistrict.map(d => d.storeName))).sort(), [filteredByDistrict]);

  // Final Filtered Data
  const finalData = useMemo(() => {
    if (stores.length > 0) {
      return filteredByDistrict.filter(d => stores.includes(d.storeName));
    }
    return filteredByDistrict;
  }, [filteredByDistrict, stores]);

  const toggleFilter = (setFn: React.Dispatch<React.SetStateAction<string[]>>, val: string, multi: boolean = true) => {
    setFn(prev => {
      if (!multi) return prev.includes(val) ? [] : [val];
      return prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val];
    });
  };

  // Trend Analysis
  const trendAnalysis = useMemo(() => {
    if (finalData.length === 0) return null;
    const monthlySumMap = finalData.reduce((acc, curr) => {
      acc[curr.yearMonth] = (acc[curr.yearMonth] || 0) + curr.totalSales;
      return acc;
    }, {} as Record<string, number>);

    const sortedMonths = Object.keys(monthlySumMap).sort();
    const recent3 = sortedMonths.slice(-3);
    
    let growthRate = 0;
    if (recent3.length > 1) {
       const first = monthlySumMap[recent3[0]];
       const last = monthlySumMap[recent3[recent3.length-1]];
       growthRate = first > 0 ? ((last - first) / first) * 100 : 0;
    }

    return { monthlySumMap, recent3, growthRate };
  }, [finalData]);

  // Chart Data preparation — 빈 월도 0으로 채워 연속 표시
  const chartData = useMemo(() => {
    if (finalData.length === 0) return [];

    const existingMonths = Array.from(new Set(finalData.map(d => d.yearMonth))).sort();
    const minYM = existingMonths[0];
    const maxYM = existingMonths[existingMonths.length - 1];

    // minYM ~ maxYM 사이 모든 월 생성
    const allMonths: string[] = [];
    let [cy, cm] = minYM.split('-').map(Number);
    const [ey, em] = maxYM.split('-').map(Number);
    while (cy < ey || (cy === ey && cm <= em)) {
      allMonths.push(`${cy}-${String(cm).padStart(2, '0')}`);
      cm++;
      if (cm > 12) { cm = 1; cy++; }
    }

    // 월별 집계 맵 초기화 (모든 월 포함)
    const map = new Map<string, any>();
    allMonths.forEach(ym => map.set(ym, { yearMonth: ym, _hasData: false }));

    finalData.forEach(d => {
      const obj = map.get(d.yearMonth)!;
      obj[d.storeName] = (obj[d.storeName] || 0) + d.totalSales;
      obj._hasData = true;
    });

    return allMonths.map(ym => map.get(ym)!);
  }, [finalData]);

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></div>;
  if (data.length === 0) return <div className="p-8 text-center text-slate-500">업로드된 월별 매출 데이터가 없습니다.</div>;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 shadow-lg border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between gap-4">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className="font-medium">{formatShortMoney(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Year Filter */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold flex items-center gap-1"><Filter size={14}/> 연도</span>
            <button onClick={() => setYears([])} className="text-xs text-slate-500 hover:text-blue-500">초기화</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allYears.map(y => (
              <button key={y} onClick={() => toggleFilter(setYears, y)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${years.includes(y) ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'}`}>{y}년</button>
            ))}
          </div>
        </div>

        {/* City Filter */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold flex items-center gap-1"><Filter size={14}/> 도시</span>
            <button onClick={() => setCities([])} className="text-xs text-slate-500 hover:text-blue-500">초기화</button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 md:max-h-60 overflow-y-auto pb-1">
            {allCities.map(c => (
              <button key={c} onClick={() => toggleFilter(setCities, c)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${cities.includes(c) ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'}`}>{c}</button>
            ))}
          </div>
        </div>

        {/* District Filter */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold flex items-center gap-1"><Filter size={14}/> 시군</span>
            <button onClick={() => setDistricts([])} className="text-xs text-slate-500 hover:text-blue-500">초기화</button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 md:max-h-60 overflow-y-auto pb-1">
            {allDistricts.map(d => (
              <button key={d} onClick={() => toggleFilter(setDistricts, d)} className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${districts.includes(d) ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'}`}>{d}</button>
            ))}
          </div>
        </div>

        {/* Store Filter */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold flex items-center gap-1"><Filter size={14}/> 매장 요약</span>
            <div className="flex gap-2">
              <label className="text-xs flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={storesMultiMode} onChange={e => {setStoresMultiMode(e.target.checked); setStores([]);}} />
                중복선택
              </label>
              <button onClick={() => setStores([])} className="text-xs text-slate-500 hover:text-blue-500">초기화</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 flex-1 items-start content-start overflow-y-auto max-h-40 md:max-h-60 pb-1">
            {allStores.map(s => (
              <button key={s} onClick={() => toggleFilter(setStores, s, storesMultiMode)} className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${stores.includes(s) ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'}`}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {finalData.length > 0 ? (
        <>
          {/* KPIs */}
          {trendAnalysis && trendAnalysis.recent3.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {trendAnalysis.recent3.map((m, i) => {
                const prev = i > 0 ? trendAnalysis.monthlySumMap[trendAnalysis.recent3[i-1]] : null;
                const curr = trendAnalysis.monthlySumMap[m];
                const storeCount = Array.from(new Set(finalData.filter(d => d.yearMonth === m).map(d => d.storeName))).length;
                
                return (
                  <div key={m} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{m} 매출 (합계: {storeCount}개)</div>
                    <div className="text-2xl font-bold font-mono">{formatShortMoney(curr)}</div>
                    {prev !== null && (
                      <div className={`text-xs mt-1 font-medium ${curr - prev > 0 ? 'text-emerald-500' : curr - prev < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                        {curr - prev > 0 ? '+' : ''}{formatShortMoney(curr - prev)}
                      </div>
                    )}
                  </div>
                );
              })}
              
              <div className={`col-span-2 md:col-span-1 p-4 rounded-xl border shadow-sm flex flex-col justify-center ${trendAnalysis.growthRate > 2 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : trendAnalysis.growthRate < -2 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                <div className="text-xs font-bold mb-1 flex items-center gap-1 opacity-80">
                  {trendAnalysis.growthRate > 2 ? <TrendingUp size={14}/> : trendAnalysis.growthRate < -2 ? <TrendingDown size={14}/> : <Minus size={14}/>} AI 분석
                </div>
                <div className="text-sm font-medium">
                  최근 전체 매출은 <strong className="text-base">{trendAnalysis.growthRate > 2 ? "상승 📈" : trendAnalysis.growthRate < -2 ? "하락 📉" : "보합(중립) ➖"}</strong> 추세입니다.
                </div>
                <div className="text-xs opacity-70 mt-1">(변동률: {trendAnalysis.growthRate > 0 ? '+' : ''}{trendAnalysis.growthRate.toFixed(1)}%)</div>
              </div>
            </div>
          )}

          {/* Line Chart */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-base font-bold mb-6 pl-2 border-l-4 border-blue-500">가맹점별 월별 매출 추이</h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="yearMonth" tick={{fontSize: 12}} tickMargin={10} stroke="#94a3b8" />
                  <YAxis tickFormatter={(val) => formatShortMoney(val)} tick={{fontSize: 12}} stroke="#94a3b8" width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                  <ReferenceLine y={100000000} label={{ position: 'insideTopLeft', value: '1억원 (기준 매출)', fill: '#ef4444', fontSize: 12 }} stroke="#ef4444" strokeDasharray="3 3" />
                  {allStores.filter(s => (stores.length === 0 || stores.includes(s))).map((store, idx) => {
                    const strokeColor = `hsl(${(idx * 137.5) % 360}, 70%, 50%)`;
                    return (
                      <Line key={store} type="monotone" dataKey={store} stroke={strokeColor} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false}>
                        {stores.length === 1 && (
                          <LabelList dataKey={store} position="top" offset={10} formatter={(val: any) => val ? formatShortMoney(val) : ''} style={{ fontSize: '11px', fill: strokeColor, fontWeight: 500 }} />
                        )}
                      </Line>
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw Data Table */}
          <details className="group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-2 p-4 cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none">
              <List size={18} className="text-blue-500 transition-transform group-open:text-slate-400" />
              세부 데이터 보기 (단위: 천원)
            </summary>
            <div className="p-4 pt-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">년-월</th>
                    <th className="px-4 py-3">도시</th>
                    <th className="px-4 py-3">시군</th>
                    <th className="px-4 py-3">매장 요약</th>
                    <th className="px-4 py-3 text-right">총매출(천원)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {finalData.slice().sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth)).map((d, i) => (
                    <tr key={`${d.id}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2">{d.yearMonth}</td>
                      <td className="px-4 py-2">{d.city}</td>
                      <td className="px-4 py-2">{d.district}</td>
                      <td className="px-4 py-2 font-medium">{d.storeName}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                        {Math.floor(d.totalSales / 1000).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="p-12 text-center text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          조건에 일치하는 월별 매출 데이터가 없습니다.
        </div>
      )}

    </div>
  );
}
