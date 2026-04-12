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
      <div className="bg-[#FDFBF7] dark:bg-stone-900 p-4 sm:p-6 rounded-sm border border-stone-300 dark:border-stone-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
              매출 현황 대시보드 <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1 mt-1">Sales Report</span>
            </h2>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400 mt-1">
              월별 매출 추이와 일별 상세 매출 현황을 분석합니다.
            </p>
          </div>
          <div className="flex overflow-x-auto snap-x hide-scrollbar bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${
                activeTab === 'monthly'
                  ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} /> 월별 분석
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${
                activeTab === 'daily'
                  ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
              }`}
            >
              <CalendarDays size={16} /> 일일 보고
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${
                activeTab === 'import'
                  ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
              }`}
            >
              <UploadCloud size={16} /> 관리자 데이터 관리
            </button>
          </div>
        </div>

        {activeTab === 'import' ? (
          <SalesDataImporter activeBrand={activeBrand} onUploaded={handleUploaded} />
        ) : (
          <div className="w-full overflow-x-auto hide-scrollbar pb-4">
            <div className="min-w-[800px]">
              {activeTab === 'monthly' && <MonthlySalesView key={refreshKey} activeBrand={activeBrand} />}
              {activeTab === 'daily' && <DailySalesView activeBrand={activeBrand} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
