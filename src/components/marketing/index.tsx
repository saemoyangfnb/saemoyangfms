import React, { useState } from 'react';
import { MarketingGenerator } from './MarketingGenerator';
import { MarketingScheduleView } from './MarketingScheduleView';
import { Bot, CalendarDays } from 'lucide-react';

export function MarketingDashboard({ activeBrand }: { activeBrand: string | null }) {
  const [tab, setTab] = useState<'generate' | 'schedule'>('generate');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 dark:text-stone-100 flex items-center gap-2 tracking-tight">
            마케팅 프리패스
            <span className="text-[10px] font-bold bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400 px-2 py-0.5 rounded-sm mt-1 border border-stone-300 dark:border-stone-700 tracking-widest">
              AI 자동화
            </span>
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1.5 font-medium">
            리뷰 사진을 첨부하면 Gemini AI가 네이버, 인스타, 당근 맞춤형 원고를 자동 생성합니다.
          </p>
        </div>
        
        <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700 shadow-sm">
          <button
            onClick={() => setTab('generate')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${
              tab === 'generate' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            <Bot size={16} /> 원고 생성
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${
              tab === 'schedule' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            <CalendarDays size={16} /> 보관함
          </button>
        </div>
      </div>

      <div className={tab === 'generate' ? 'block' : 'hidden'}>
        <MarketingGenerator activeBrand={activeBrand} />
      </div>
      <div className={tab === 'schedule' ? 'block' : 'hidden'}>
        <MarketingScheduleView activeBrand={activeBrand} />
      </div>
    </div>
  );
}
