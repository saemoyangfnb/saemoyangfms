import React, { useState, useEffect } from 'react';
import { reviewDb as db, auth } from '../../firebase';
import { collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { AlertTriangle, RefreshCw, Activity, Store, Target, Eye, FileText } from 'lucide-react';
import { Review, RankData, RoiData, CompetitorData, ReviewState, TabType } from './types';
import { OverviewTab } from './OverviewTab';
import { StoreTab } from './StoreTab';
import { MarketingTab } from './MarketingTab';
import { CompetitorTab } from './CompetitorTab';
import { WeeklyReportTab } from './WeeklyReportTab';

export function ReviewDashboard({ initialTab }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState<TabType>((initialTab as TabType) || 'overview');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rankData, setRankData] = useState<RankData[]>([]);
  const [roiData, setRoiData] = useState<RoiData[]>([]);
  const [competitorData, setCompetitorData] = useState<CompetitorData[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState>({ resolved: [], overridden: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as TabType);
  }, [initialTab]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const date60Str = sixtyDaysAgo.toISOString().split('T')[0];
      const date14Str = fourteenDaysAgo.toISOString().split('T')[0];

      const [reviewsSnap, rankSnap, roiSnap, compSnap, resolvedDoc, overriddenDoc] = await Promise.all([
        getDocs(query(collection(db, 'reviews'), where('작성일', '>=', date60Str))),
        getDocs(query(collection(db, 'rank_tracking'), where('수집일자', '>=', date14Str))),
        getDocs(collection(db, 'roi_analysis')),
        getDocs(query(collection(db, 'competitor_menu'), where('수집일자', '>=', date14Str))),
        getDoc(doc(db, 'review_states', 'resolved')),
        getDoc(doc(db, 'review_states', 'overridden')),
      ]);

      setReviews(reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
      setRankData(rankSnap.docs.map(d => ({ id: d.id, ...d.data() } as RankData)));
      setRoiData(roiSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoiData)));
      setCompetitorData(compSnap.docs.map(d => ({ id: d.id, ...d.data() } as CompetitorData)));
      setReviewState({
        resolved: resolvedDoc.exists() ? resolvedDoc.data()?.ids || [] : [],
        overridden: overriddenDoc.exists() ? overriddenDoc.data()?.ids || [] : [],
      });
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      console.error('데이터 로드 실패', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleResolve = async (id: string) => {
    const newIds = [...reviewState.resolved, id];
    setReviewState(prev => ({ ...prev, resolved: newIds }));
    try { await setDoc(doc(db, 'review_states', 'resolved'), { ids: newIds, updated_at: new Date().toISOString() }); } catch { }
  };

  const handleOverride = async (id: string) => {
    const newIds = [...reviewState.overridden, id];
    setReviewState(prev => ({ ...prev, overridden: newIds }));
    try { await setDoc(doc(db, 'review_states', 'overridden'), { ids: newIds, updated_at: new Date().toISOString() }); } catch { }
  };

  const activeNegCount = reviews.filter(r =>
    r.감정분석 === '부정' && !reviewState.resolved.includes(r.id) && !reviewState.overridden.includes(r.id)
  ).length;

  const tabs = [
    { id: 'overview' as TabType, label: '전체 현황', icon: <Activity size={14} /> },
    { id: 'store' as TabType, label: '매장별 분석', icon: <Store size={14} /> },
    { id: 'marketing' as TabType, label: '마케팅 관제', icon: <Target size={14} /> },
    { id: 'competitor' as TabType, label: '경쟁사 모니터링', icon: <Eye size={14} /> },
    { id: 'weekly' as TabType, label: '주간 리포트', icon: <FileText size={14} /> },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw size={24} className="mx-auto text-slate-400 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            리뷰 수집 · 순위 추적 · 키워드 ROI · 경쟁사 모니터링 · 주간 리포트
            {lastUpdated && <span className="ml-2 text-slate-400">· 갱신 {lastUpdated}</span>}
          </p>
          <button onClick={fetchAllData} disabled={loading} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
        {activeNegCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg shrink-0">
            <AlertTriangle size={13} className="text-rose-500" />
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">미조치 {activeNegCount}건</span>
          </div>
        )}
      </div>

      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-700 shadow-none overflow-hidden">
        <nav className="flex border-b-[3px] border-double border-stone-300 dark:border-stone-700 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-6 py-4 text-sm font-bold border-b-[3px] -mb-[3px] transition-colors ${activeTab === tab.id ? 'border-stone-900 dark:border-stone-300 text-stone-900 dark:text-white' : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-300'}`}>
              {tab.icon}
              {tab.label}
              {tab.id === 'overview' && activeNegCount > 0 && (
                <span className="w-4 h-4 flex items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full">
                  {activeNegCount > 9 ? '9+' : activeNegCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-5">
          {activeTab === 'overview' && <OverviewTab reviews={reviews} reviewState={reviewState} onResolve={handleResolve} onOverride={handleOverride} />}
          {activeTab === 'store' && <StoreTab reviews={reviews} />}
          {activeTab === 'marketing' && <MarketingTab rankData={rankData} roiData={roiData} />}
          {activeTab === 'competitor' && <CompetitorTab competitorData={competitorData} />}
          {activeTab === 'weekly' && <WeeklyReportTab />}
        </div>
      </div>
    </div>
  );
}
