import React, { useState } from 'react';
import { SalesDataImporter } from './SalesDataImporter';
import { MonthlySalesView } from './MonthlySalesView';
import { DailySalesView } from './DailySalesView';
import { LayoutDashboard, CalendarDays, UploadCloud } from 'lucide-react';

export function SalesDashboard({ activeBrand }: { activeBrand: string | null }) {
  const [activeTab, setActiveTab] = useState<'monthly' | 'daily' | 'import'>('monthly');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('monthly');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span className="text-2xl">🐟</span> 매출 현황 대시보드
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              월별 매출 추이와 일별 상세 매출 현황을 분석합니다.
            </p>
          </div>
          <div className="flex overflow-x-auto snap-x hide-scrollbar bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'monthly'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} /> 월별 분석
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'daily'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays size={16} /> 일일 보고
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'import'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UploadCloud size={16} /> 관리자 데이터 관리
            </button>
          </div>
        </div>

        {activeTab === 'import' && <SalesDataImporter activeBrand={activeBrand} onUploaded={handleUploaded} />}
        {activeTab === 'monthly' && <MonthlySalesView key={refreshKey} activeBrand={activeBrand} />}
        {activeTab === 'daily' && <DailySalesView activeBrand={activeBrand} />}
      </div>
    </div>
  );
}
