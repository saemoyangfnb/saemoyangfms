import React, { useState } from 'react';
import { Menu, Ingredient } from '../../types';
import { SalesDataImporter } from './SalesDataImporter';
import { MonthlySalesView } from './MonthlySalesView';
import { DailySalesView } from './DailySalesView';
import { MenuSalesUploadView } from './MenuSalesUploadView';
import { ProfitabilityView } from './ProfitabilityView';
import { LayoutDashboard, CalendarDays, UploadCloud, TrendingUp, FileBarChart } from 'lucide-react';

type Tab = 'monthly' | 'daily' | 'profitability' | 'menu_upload' | 'import';

interface Props {
  activeBrand: string | null;
  menus: Menu[];
  ingredients: Ingredient[];
}

export function SalesDashboard({ activeBrand, menus, ingredients }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('monthly');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('monthly');
  };

  const handleMenuUploaded = () => {
    setActiveTab('profitability');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'monthly',      label: '월별 분석',        icon: <LayoutDashboard size={16} /> },
    { key: 'daily',        label: '일일 보고',         icon: <CalendarDays size={16} /> },
    { key: 'profitability',label: '수익성 분석',       icon: <TrendingUp size={16} /> },
    { key: 'menu_upload',  label: '메뉴 매출 업로드',  icon: <FileBarChart size={16} /> },
    { key: 'import',       label: '관리자 데이터 관리', icon: <UploadCloud size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 p-4 sm:p-6 rounded-sm border border-stone-300 dark:border-stone-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
              매출 현황 대시보드 <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1 mt-1">Sales Report</span>
            </h2>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400 mt-1">
              월별 매출 추이, 수익성 분석, 메뉴별 판매 현황을 확인합니다.
            </p>
          </div>
          <div className="flex overflow-x-auto snap-x hide-scrollbar bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700 w-full sm:w-auto">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-shrink-0 snap-start flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === t.key
                    ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-white'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'import' ? (
          <SalesDataImporter activeBrand={activeBrand} onUploaded={handleUploaded} />
        ) : activeTab === 'menu_upload' ? (
          <MenuSalesUploadView activeBrand={activeBrand} onUploaded={handleMenuUploaded} />
        ) : activeTab === 'profitability' ? (
          <ProfitabilityView activeBrand={activeBrand} menus={menus} ingredients={ingredients} />
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
