/**
 * ReviewDashboard.tsx
 * 달빛에구운고등어 가맹점 통합 관제 대시보드
 * 리뷰 분석 | 순위 추적 | 키워드 ROI | 경쟁사 모니터링 | 주간 리포트
 */

import React, { useState, useEffect, useMemo } from 'react';
import { reviewDb as db } from '../firebase';
import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, CheckCircle, Star, Minus, Search,
  ShieldAlert, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, RefreshCw, Eye,
  Target, Trophy, AlertCircle, Clock, Store,
  ArrowUp, ArrowDown, Activity, Download, FileText
} from 'lucide-react';

// ==========================================
// 타입 정의
// ==========================================
interface Review {
  id: string;
  매장명: string;
  작성일: string;
  리뷰내용: string;
  감정분석: '긍정' | '부정' | '중립';
}

interface RankData {
  id: string;
  매장명: string;
  타겟키워드: string;
  현재순위: number;
  등락폭: string;
  '1위_매장명': string;
  '1위_사용_키워드': string;
  AI_인사이트: string;
  수집일자: string;
}

interface RoiData {
  id: string;
  매장명: string;
  세팅된_키워드: string;
  네이버_월간_총검색량: string;
  키워드_적중률: string;
}

interface CompetitorData {
  id: string;
  경쟁브랜드명_엑셀: string;
  실제_플레이스_업체명: string;
  타겟_키워드: string;
  메뉴_및_가격: string;
  수집일자: string;
}

interface WeeklyReport {
  id: string;
  생성일시: string;
  기간_시작: string;
  기간_종료: string;
  리뷰_요약: {
    총_신규리뷰: string;
    전주_리뷰수: string;
    증감: string;
    긍정수: string;
    부정수: string;
    긍정률: string;
    매장별_집계: {
      매장명: string;
      이번주_리뷰수: string;
      지난주_리뷰수: string;
      증감: string;
      긍정: string;
      부정: string;
      긍정률: string;
    }[];
    부정_리뷰_목록: { 매장명: string; 작성일: string; 리뷰내용: string }[];
  };
  키워드_분석: {
    매장명: string;
    긍정_핵심키워드: string;
    부정_핵심키워드: string;
  }[];
  경쟁사_변동: {
    브랜드: string;
    변동: string;
    이번주_최저가: string;
    지난주_최저가: string;
  }[];
  순위_변동: {
    상승_매장: { 매장명: string; 타겟키워드: string; 현재순위: string; 등락폭: string }[];
    하락_매장: { 매장명: string; 타겟키워드: string; 현재순위: string; 등락폭: string }[];
    노출실패: { 매장명: string; 타겟키워드: string }[];
  };
}

interface ReviewState {
  resolved: string[];
  overridden: string[];
}

type TabType = 'overview' | 'store' | 'marketing' | 'competitor' | 'weekly';

// ==========================================
// 유틸
// ==========================================
function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function parseRate(x: string): number {
  try { return parseFloat(String(x).replace('%', '').replace('분석 불가 (리뷰 없음)', '0')); }
  catch { return 0; }
}

// ==========================================
// 공통 컴포넌트
// ==========================================
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <span className="text-slate-300 dark:text-slate-600">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color || 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  if (sentiment === '긍정') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 shrink-0">
      <Star size={9} fill="currentColor" /> 긍정
    </span>
  );
  if (sentiment === '부정') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-800 shrink-0">
      <AlertTriangle size={9} /> 부정
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
      <Minus size={9} /> 중립
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const r = Number(rank);
  if (r >= 999) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">노출 실패</span>;
  if (r <= 3) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"><Trophy size={9} /> {r}위</span>;
  if (r <= 5) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">{r}위</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-800">{r}위</span>;
}

function TrendBadge({ trend }: { trend: string }) {
  if (!trend || trend === '-') return <span className="text-xs text-slate-400">-</span>;
  if (trend.includes('▲') || trend.includes('상승') || trend.includes('진입')) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <ArrowUp size={10} /> {trend.replace('▲', '').trim()}
    </span>
  );
  if (trend.includes('▼') || trend.includes('하락') || trend.includes('이탈')) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
      <ArrowDown size={10} /> {trend.replace('▼', '').trim()}
    </span>
  );
  return <span className="text-xs text-slate-400">{trend}</span>;
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="py-16 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">{icon}</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

// ==========================================
// 탭 1: 전체 브랜드 현황
// ==========================================
function OverviewTab({ reviews, reviewState, onResolve, onOverride }: {
  reviews: Review[];
  reviewState: ReviewState;
  onResolve: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const yesterdayStr = getYesterday();

  const activeNegative = reviews
    .filter(r => r.감정분석 === '부정' && !reviewState.resolved.includes(r.id) && !reviewState.overridden.includes(r.id))
    .sort((a, b) => b.작성일.localeCompare(a.작성일));

  const positiveCount = reviews.filter(r => r.감정분석 === '긍정').length;
  const positiveRate = reviews.length > 0 ? Math.round(positiveCount / reviews.length * 100) : 0;

  const storeRanking = useMemo(() => {
    const allStores = [...new Set(reviews.map(r => r.매장명))];
    const yesterdayReviews = reviews.filter(r => r.작성일 === yesterdayStr);
    return allStores
      .map(store => ({ store, count: yesterdayReviews.filter(r => r.매장명 === store).length }))
      .sort((a, b) => b.count - a.count);
  }, [reviews, yesterdayStr]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="누적 수집 리뷰" value={`${reviews.length.toLocaleString()}건`} sub="전체 가맹점 합산" icon={<Activity size={16} />} />
        <KpiCard label="미조치 부정 리뷰" value={`${activeNegative.length}건`} sub="즉각 조치 필요" icon={<ShieldAlert size={16} />}
          color={activeNegative.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'} />
        <KpiCard label="긍정 리뷰 비율" value={`${positiveRate}%`} sub={`${positiveCount.toLocaleString()}건 긍정`} icon={<Star size={16} />}
          color={positiveRate >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
        <KpiCard label="모니터링 매장 수" value={`${new Set(reviews.map(r => r.매장명)).size}개`} sub="전국 가맹점" icon={<Store size={16} />} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <ShieldAlert size={15} className="text-rose-500" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">즉각 조치 요망</h3>
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full border ${activeNegative.length > 0
            ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800'
            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800'}`}>
            {activeNegative.length > 0 ? `${activeNegative.length}건 미조치` : '전체 조치 완료'}
          </span>
        </div>
        {activeNegative.length === 0 ? (
          <EmptyState icon={<CheckCircle size={20} className="text-emerald-400" />} message="미조치 부정 리뷰가 없습니다." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {activeNegative.map(review => (
              <div key={review.id} className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <button className="w-full text-left" onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}>
                  <div className="flex items-center gap-2">
                    <SentimentBadge sentiment={review.감정분석} />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{review.매장명}</span>
                    <span className="text-xs text-slate-400 shrink-0">{review.작성일}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{review.리뷰내용.slice(0, 45)}...</span>
                    <span className="shrink-0 text-slate-300 dark:text-slate-600">
                      {expandedId === review.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </span>
                  </div>
                </button>
                {expandedId === review.id && (
                  <div className="mt-3 space-y-3">
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-lg p-3">
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{review.리뷰내용}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => onResolve(review.id)} className="flex-1 py-2 text-xs font-semibold bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-blue-700 transition-colors">
                        해피콜 조치 완료
                      </button>
                      <button onClick={() => onOverride(review.id)} className="flex-1 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                        긍정 예외 처리
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { title: '리뷰 활성화 우수 매장', icon: <TrendingUp size={15} className="text-emerald-500" />, stores: storeRanking.slice(0, 5), type: 'top' },
          { title: '리뷰 관리 필요 매장', icon: <TrendingDown size={15} className="text-amber-500" />, stores: [...storeRanking].reverse().slice(0, 5), type: 'bottom' },
        ].map(({ title, icon, stores, type }) => (
          <div key={title} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              {icon}
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{title}</h3>
              <span className="ml-auto text-xs text-slate-400">기준: {yesterdayStr}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {stores.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-400">전일 데이터 없음</div>
              ) : stores.map((item, idx) => (
                <div key={item.store} className="px-5 py-3 flex items-center gap-3">
                  <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${type === 'top'
                    ? idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border border-rose-100 dark:border-rose-800'}`}>
                    {type === 'top' ? idx + 1 : '!'}
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">{item.store}</span>
                  <span className={`text-sm font-bold shrink-0 ${item.count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{item.count}건</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 탭 2: 개별 매장 상세 분석
// ==========================================
function StoreTab({ reviews }: { reviews: Review[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('');

  const allStores = useMemo(() => [...new Set(reviews.map(r => r.매장명))].sort(), [reviews]);
  const filteredStores = searchQuery ? allStores.filter(s => s.replace(/ /g, '').includes(searchQuery.replace(/ /g, ''))) : allStores;

  useEffect(() => {
    if (filteredStores.length > 0 && !filteredStores.includes(selectedStore)) setSelectedStore(filteredStores[0]);
  }, [filteredStores]);

  const storeReviews = useMemo(() =>
    reviews.filter(r => r.매장명 === selectedStore).sort((a, b) => b.작성일.localeCompare(a.작성일)),
    [reviews, selectedStore]
  );

  const uniqueDays = new Set(storeReviews.map(r => r.작성일)).size;
  const dailyAvg = uniqueDays > 0 ? (storeReviews.length / uniqueDays).toFixed(1) : '0';
  const posCount = storeReviews.filter(r => r.감정분석 === '긍정').length;
  const negCount = storeReviews.filter(r => r.감정분석 === '부정').length;

  const trendData = useMemo(() => {
    const map: Record<string, { 긍정: number; 부정: number; 중립: number }> = {};
    storeReviews.forEach(r => {
      if (!map[r.작성일]) map[r.작성일] = { 긍정: 0, 부정: 0, 중립: 0 };
      map[r.작성일][r.감정분석 as '긍정' | '부정' | '중립']++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  }, [storeReviews]);

  const maxCount = Math.max(...trendData.map(([, v]) => v.긍정 + v.부정 + v.중립), 1);

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="매장명 검색"
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400" />
        </div>
        <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
          className="flex-1 py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-blue-500 text-slate-900 dark:text-white">
          {filteredStores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {selectedStore && storeReviews.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="누적 수집 리뷰" value={`${storeReviews.length}건`} icon={<Activity size={16} />} />
            <KpiCard label="일평균 작성량" value={`${dailyAvg}건`} sub={`${uniqueDays}일치 데이터`} icon={<Clock size={16} />} />
            <KpiCard label="긍정 평가" value={`${posCount}건`} icon={<Star size={16} />} color="text-emerald-600 dark:text-emerald-400" />
            <KpiCard label="부정 평가" value={`${negCount}건`} icon={<AlertTriangle size={16} />} color={negCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined} />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-4">일자별 리뷰 감정 추이 (최근 14일)</h3>
            <div className="flex items-end gap-1 h-28">
              {trendData.map(([date, counts]) => {
                const total = counts.긍정 + counts.부정 + counts.중립;
                const heightPct = Math.round((total / maxCount) * 100);
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-5 mb-1 hidden group-hover:block z-10 pointer-events-none">
                      <div className="bg-slate-900 dark:bg-slate-700 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                        {date} | 긍{counts.긍정} 부{counts.부정} 중{counts.중립}
                      </div>
                    </div>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                      <div className="w-full flex flex-col rounded-t overflow-hidden" style={{ height: `${heightPct}%` }}>
                        {counts.부정 > 0 && <div className="w-full bg-rose-400 dark:bg-rose-500" style={{ flex: counts.부정 }} />}
                        {counts.중립 > 0 && <div className="w-full bg-slate-200 dark:bg-slate-600" style={{ flex: counts.중립 }} />}
                        {counts.긍정 > 0 && <div className="w-full bg-emerald-400 dark:bg-emerald-500" style={{ flex: counts.긍정 }} />}
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400">{date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {[['bg-emerald-400', '긍정'], ['bg-slate-200 dark:bg-slate-600', '중립'], ['bg-rose-400', '부정']].map(([cls, label]) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-3 h-3 rounded-sm ${cls} inline-block`} />{label}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">수집된 리뷰 목록</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {storeReviews.map(review => (
                <div key={review.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <SentimentBadge sentiment={review.감정분석} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-1">{review.작성일}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{review.리뷰내용}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={<Store size={20} className="text-slate-400" />} message={selectedStore ? '수집된 리뷰가 없습니다.' : '매장을 선택해 주세요.'} />
      )}
    </div>
  );
}

// ==========================================
// 탭 3: 로컬 마케팅 관제
// ==========================================
function MarketingTab({ rankData, roiData }: { rankData: RankData[]; roiData: RoiData[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('');

  const allStores = useMemo(() => [...new Set(roiData.map(r => r.매장명))].sort(), [roiData]);
  const filteredStores = searchQuery ? allStores.filter(s => s.replace(/ /g, '').includes(searchQuery.replace(/ /g, ''))) : allStores;

  useEffect(() => {
    if (filteredStores.length > 0 && !filteredStores.includes(selectedStore)) setSelectedStore(filteredStores[0]);
  }, [filteredStores]);

  const latestDate = useMemo(() => { const dates = rankData.map(r => r.수집일자).sort(); return dates[dates.length - 1] || ''; }, [rankData]);
  const latestRankData = useMemo(() => rankData.filter(r => r.수집일자 === latestDate), [rankData, latestDate]);
  const top5Count = latestRankData.filter(r => Number(r.현재순위) <= 5).length;
  const failCount = latestRankData.filter(r => Number(r.현재순위) >= 999).length;
  const noKeywordCount = roiData.filter(r => r.세팅된_키워드 === '키워드 미설정').length;
  const storeRoi = roiData.find(r => r.매장명 === selectedStore);
  const storeRanks = latestRankData.filter(r => r.매장명 === selectedStore);
  const sortedRoi = useMemo(() => [...roiData].sort((a, b) => parseRate(b.키워드_적중률) - parseRate(a.키워드_적중률)), [roiData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="분석 완료 가맹점" value={`${roiData.length}개`} icon={<Store size={16} />} />
        <KpiCard label="1페이지 방어 성공" value={`${top5Count}개`} icon={<Trophy size={16} />} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="노출 실패 경고" value={`${failCount}건`} icon={<AlertCircle size={16} />} color={failCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined} />
        <KpiCard label="키워드 미설정 매장" value={`${noKeywordCount}개`} icon={<Target size={16} />} color={noKeywordCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">가맹점 정밀 진단</h3>
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="매장명 검색"
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400" />
            </div>
            <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
              className="flex-1 py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none text-slate-900 dark:text-white">
              {filteredStores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {storeRoi && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '설정된 키워드', value: storeRoi.세팅된_키워드 === '키워드 미설정' ? '미설정' : `${storeRoi.세팅된_키워드.split(',').length}개 세팅`, warn: storeRoi.세팅된_키워드 === '키워드 미설정' },
                { label: '리뷰 적중률 (ROI)', value: storeRoi.키워드_적중률, warn: false },
                { label: '월간 총검색량', value: storeRoi.네이버_월간_총검색량, warn: false },
              ].map(({ label, value, warn }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                  <p className={`text-sm font-semibold ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
                </div>
              ))}
            </div>
            {storeRanks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">키워드별 네이버 플레이스 순위</p>
                {storeRanks.map((rank, idx) => (
                  <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 flex items-center gap-2 flex-wrap">
                      <Target size={12} className="text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">[{rank.타겟키워드}]</span>
                      <RankBadge rank={Number(rank.현재순위)} />
                      <TrendBadge trend={rank.등락폭} />
                    </div>
                    {rank.AI_인사이트 && (
                      <div className={`px-4 py-2 border-t border-slate-100 dark:border-slate-700 ${Number(rank.현재순위) >= 999 ? 'bg-rose-50 dark:bg-rose-900/10' : Number(rank.현재순위) <= 5 ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-amber-50 dark:bg-amber-900/10'}`}>
                        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                          <span className="font-semibold">본사 권고: </span>{rank.AI_인사이트}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">전체 가맹점 마케팅 성적표</h3>
          <p className="text-xs text-slate-400 mt-0.5">키워드 적중률 높은 순 · 클릭하면 위 진단 화면으로 이동</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                {['매장명', '키워드 적중률', '월간 검색량', '세팅된 키워드'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedRoi.map(roi => {
                const rate = parseRate(roi.키워드_적중률);
                const isNoKeyword = roi.세팅된_키워드 === '키워드 미설정';
                return (
                  <tr key={roi.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${selectedStore === roi.매장명 ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`} onClick={() => setSelectedStore(roi.매장명)}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200">{roi.매장명}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${rate >= 70 ? 'bg-emerald-400' : rate >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{roi.키워드_적중률}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{roi.네이버_월간_총검색량}</td>
                    <td className="px-4 py-3">
                      {isNoKeyword ? <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">미설정</span>
                        : <span className="text-xs text-slate-500 dark:text-slate-400 truncate block max-w-xs">{roi.세팅된_키워드}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 탭 4: 경쟁사 모니터링
// ==========================================
function CompetitorTab({ competitorData }: { competitorData: CompetitorData[] }) {
  const TARGET_BRANDS = ['산으로간고등어', '화덕으로간고등어', '부산에뜬고등어', '북극해고등어'];
  const latestDate = useMemo(() => { const dates = [...new Set(competitorData.map(c => c.수집일자))].sort(); return dates[dates.length - 1] || ''; }, [competitorData]);
  const prevDate = useMemo(() => { const dates = [...new Set(competitorData.map(c => c.수집일자))].sort(); return dates.length >= 2 ? dates[dates.length - 2] : ''; }, [competitorData]);
  const latestData = competitorData.filter(c => c.수집일자 === latestDate);
  const prevData = competitorData.filter(c => c.수집일자 === prevDate);

  function getMackerelPrice(menuStr: string): number {
    if (!menuStr || menuStr === '수집 실패') return 0;
    for (const item of menuStr.split('|')) {
      if (item.includes('고등어')) {
        const m = item.match(/(\d{4,6})원/);
        if (m) { const v = parseInt(m[1]); if (v <= 20000) return v; }
      }
    }
    return 0;
  }

  function getPriceRange(brand: string, data: CompetitorData[]) {
    const prices = data.filter(d => d.경쟁브랜드명_엑셀.includes(brand)).map(d => getMackerelPrice(d.메뉴_및_가격)).filter(p => p > 0);
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        데이터 기준일: <span className="font-medium text-slate-700 dark:text-slate-300">{latestDate || '수집 전'}</span>
        <span className="ml-2 text-slate-400">· 매일 자동 수집되며 경쟁사 메뉴 및 가격 변동을 감지합니다.</span>
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {TARGET_BRANDS.map(brand => {
          const brandData = latestData.filter(d => d.경쟁브랜드명_엑셀.includes(brand));
          const latestRange = getPriceRange(brand, latestData);
          const prevRange = getPriceRange(brand, prevData);
          const priceDisplay = latestRange.min > 0 ? latestRange.min === latestRange.max ? `${latestRange.min.toLocaleString()}원` : `${latestRange.min.toLocaleString()} ~ ${latestRange.max.toLocaleString()}원` : '확인 불가';
          let trendEl = null;
          if (latestRange.min > 0 && prevRange.min > 0) {
            const diff = latestRange.min - prevRange.min;
            if (diff > 0) trendEl = <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-800"><ArrowUp size={9} /> {diff.toLocaleString()}원 인상 감지</span>;
            else if (diff < 0) trendEl = <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800"><ArrowDown size={9} /> {Math.abs(diff).toLocaleString()}원 인하 감지</span>;
            else trendEl = <span className="text-xs text-slate-400">변동 없음</span>;
          }
          return (
            <div key={brand} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{brand}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">대표 고등어구이 가격대</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{priceDisplay}</p>
                    {trendEl && <div className="mt-1">{trendEl}</div>}
                  </div>
                </div>
              </div>
              {brandData.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-400">수집된 데이터가 없습니다.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {brandData.slice(0, 3).map((store, idx) => {
                    const menuItems = store.메뉴_및_가격 && store.메뉴_및_가격 !== '수집 실패' ? store.메뉴_및_가격.split('|').slice(0, 5) : [];
                    return (
                      <div key={idx} className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Store size={11} className="text-slate-400 shrink-0" />
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{store.실제_플레이스_업체명}</p>
                        </div>
                        {menuItems.length > 0 ? (
                          <div className="space-y-1">
                            {menuItems.map((item, i) => {
                              const [name, price] = item.split(':').map(s => s.trim());
                              const isHighlight = (name || '').includes('고등어');
                              return (
                                <div key={i} className={`flex justify-between text-xs ${isHighlight ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                  <span className="truncate flex-1 mr-2">{name}</span>
                                  <span className="shrink-0">{price}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-xs text-slate-400">메뉴 수집 실패</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 탭 5: 주간 리포트 (신규)
// ==========================================
function WeeklyReportTab() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'weekly_reports'), snap => {
      const data: WeeklyReport[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as WeeklyReport));
      data.sort((a, b) => b.기간_시작.localeCompare(a.기간_시작));
      setReports(data);
      if (data.length > 0 && !selectedReport) setSelectedReport(data[0]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 엑셀 내보내기
  const handleExportExcel = () => {
    if (!selectedReport) return;
    const r = selectedReport;
    const wb = XLSX.utils.book_new();

    // 시트 1: 리뷰 요약
    const summaryData = [
      ['항목', '내용'],
      ['분석 기간', `${r.기간_시작} ~ ${r.기간_종료}`],
      ['신규 리뷰 수', r.리뷰_요약.총_신규리뷰],
      ['전주 리뷰 수', r.리뷰_요약.전주_리뷰수],
      ['전주 대비 증감', r.리뷰_요약.증감],
      ['긍정 리뷰 수', r.리뷰_요약.긍정수],
      ['부정 리뷰 수', r.리뷰_요약.부정수],
      ['긍정률', r.리뷰_요약.긍정률],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), '리뷰 요약');

    // 시트 2: 매장별 집계
    if (r.리뷰_요약.매장별_집계?.length > 0) {
      const storeHeaders = ['매장명', '이번주 리뷰', '지난주 리뷰', '증감', '긍정', '부정', '긍정률'];
      const storeRows = r.리뷰_요약.매장별_집계.map(s => [s.매장명, s.이번주_리뷰수, s.지난주_리뷰수, s.증감, s.긍정, s.부정, s.긍정률]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([storeHeaders, ...storeRows]), '매장별 집계');
    }

    // 시트 3: 부정 리뷰 목록
    if (r.리뷰_요약.부정_리뷰_목록?.length > 0) {
      const negHeaders = ['매장명', '작성일', '리뷰내용'];
      const negRows = r.리뷰_요약.부정_리뷰_목록.map(n => [n.매장명, n.작성일, n.리뷰내용]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([negHeaders, ...negRows]), '부정 리뷰 목록');
    }

    // 시트 4: 키워드 분석
    if (r.키워드_분석?.length > 0) {
      const kwHeaders = ['매장명', '긍정 핵심 키워드', '부정 핵심 키워드'];
      const kwRows = r.키워드_분석.map((k: any) => [k.매장명, k.긍정_핵심키워드, k.부정_핵심키워드]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([kwHeaders, ...kwRows]), '키워드 분석');
    }

    // 시트 5: 경쟁사 변동
    if (r.경쟁사_변동?.length > 0) {
      const compHeaders = ['브랜드', '변동', '이번주 최저가', '지난주 최저가'];
      const compRows = r.경쟁사_변동.map(c => [c.브랜드, c.변동, c.이번주_최저가, c.지난주_최저가]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([compHeaders, ...compRows]), '경쟁사 가격 변동');
    }

    // 시트 6: 순위 변동
    if (r.순위_변동) {
      const rankData: any[][] = [['구분', '매장명', '타겟 키워드', '현재 순위', '등락폭']];
      r.순위_변동.상승_매장?.forEach((m: any) => rankData.push(['상승', m.매장명, m.타겟키워드, m.현재순위, m.등락폭]));
      r.순위_변동.하락_매장?.forEach((m: any) => rankData.push(['하락', m.매장명, m.타겟키워드, m.현재순위, m.등락폭]));
      r.순위_변동.노출실패?.forEach((m: any) => rankData.push(['노출 실패', m.매장명, m.타겟키워드, '999', '-']));
      if (rankData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rankData), '순위 변동');
    }

    XLSX.writeFile(wb, `주간리포트_${r.기간_시작}_${r.기간_종료}.xlsx`);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw size={20} className="text-slate-400 animate-spin mr-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400">리포트를 불러오는 중...</p>
    </div>
  );

  if (reports.length === 0) return (
    <EmptyState icon={<FileText size={20} className="text-slate-400" />} message="아직 생성된 주간 리포트가 없습니다. 서버에서 weekly_report.py를 실행해 주세요." />
  );

  const r = selectedReport;
  if (!r) return null;

  return (
    <div className="space-y-5">
      {/* 리포트 선택 + 엑셀 다운로드 */}
      <div className="flex items-center gap-3">
        <select
          value={selectedReport?.id || ''}
          onChange={e => setSelectedReport(reports.find(r => r.id === e.target.value) || null)}
          className="flex-1 max-w-xs py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none text-slate-900 dark:text-white"
        >
          {reports.map(rep => (
            <option key={rep.id} value={rep.id}>{rep.기간_시작} ~ {rep.기간_종료}</option>
          ))}
        </select>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Download size={14} /> 엑셀 내보내기
        </button>
      </div>

      {/* 리뷰 요약 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="신규 리뷰" value={`${r.리뷰_요약.총_신규리뷰}건`} sub={`전주 대비 ${r.리뷰_요약.증감}건`} icon={<Activity size={16} />} />
        <KpiCard label="긍정 리뷰" value={`${r.리뷰_요약.긍정수}건`} icon={<Star size={16} />} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="부정 리뷰" value={`${r.리뷰_요약.부정수}건`} icon={<AlertTriangle size={16} />}
          color={Number(r.리뷰_요약.부정수) > 0 ? 'text-rose-600 dark:text-rose-400' : undefined} />
        <KpiCard label="긍정률" value={r.리뷰_요약.긍정률} icon={<TrendingUp size={16} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 매장별 집계 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">매장별 리뷰 집계</h3>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0">
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {['매장명', '이번주', '전주', '증감', '긍정률'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.리뷰_요약.매장별_집계?.sort((a, b) => Number(b.이번주_리뷰수) - Number(a.이번주_리뷰수)).map(s => (
                  <tr key={s.매장명} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200">{s.매장명}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{s.이번주_리뷰수}건</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{s.지난주_리뷰수}건</td>
                    <td className="px-3 py-2 text-xs font-semibold">
                      <span className={String(s.증감).startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : String(s.증감).startsWith('-') ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}>
                        {s.증감}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{s.긍정률}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 순위 변동 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">네이버 순위 변동</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {r.순위_변동?.상승_매장?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800 shrink-0">상승</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">{m.등락폭}</span>
              </div>
            ))}
            {r.순위_변동?.하락_매장?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-800 shrink-0">하락</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
                <span className="text-xs text-rose-600 dark:text-rose-400 shrink-0">{m.등락폭}</span>
              </div>
            ))}
            {r.순위_변동?.노출실패?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">실패</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
              </div>
            ))}
            {!r.순위_변동?.상승_매장?.length && !r.순위_변동?.하락_매장?.length && !r.순위_변동?.노출실패?.length && (
              <div className="px-5 py-8 text-center text-xs text-slate-400">순위 변동 데이터 없음</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 경쟁사 가격 변동 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">경쟁사 가격 변동</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {r.경쟁사_변동?.length > 0 ? r.경쟁사_변동.map((c, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{c.브랜드}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.지난주_최저가} → {c.이번주_최저가}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${c.변동.includes('인상')
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800'
                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'}`}>
                  {c.변동}
                </span>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-xs text-slate-400">이번 주 가격 변동 없음</div>
            )}
          </div>
        </div>

        {/* 부정 리뷰 목록 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">이번 주 부정 리뷰</h3>
            <span className="ml-auto text-xs text-slate-400">{r.리뷰_요약.부정_리뷰_목록?.length || 0}건</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
            {r.리뷰_요약.부정_리뷰_목록?.length > 0 ? r.리뷰_요약.부정_리뷰_목록.map((n, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{n.매장명}</span>
                  <span className="text-xs text-slate-400">{n.작성일}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{n.리뷰내용}</p>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-xs text-slate-400">이번 주 부정 리뷰 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 메인 컴포넌트
// ==========================================
export function ReviewDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rankData, setRankData] = useState<RankData[]>([]);
  const [roiData, setRoiData] = useState<RoiData[]>([]);
  const [competitorData, setCompetitorData] = useState<CompetitorData[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState>({ resolved: [], overridden: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(collection(db, 'reviews'), snap => {
      const data: Review[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as Review));
      setReviews(data);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
      setLoading(false);
    }));

    unsubs.push(onSnapshot(collection(db, 'rank_tracking'), snap => {
      const data: RankData[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as RankData));
      setRankData(data);
    }));

    unsubs.push(onSnapshot(collection(db, 'roi_analysis'), snap => {
      const data: RoiData[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as RoiData));
      setRoiData(data);
    }));

    unsubs.push(onSnapshot(collection(db, 'competitor_menu'), snap => {
      const data: CompetitorData[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as CompetitorData));
      setCompetitorData(data);
    }));

    const loadState = async () => {
      try {
        const [resolvedDoc, overriddenDoc] = await Promise.all([
          getDoc(doc(db, 'review_states', 'resolved')),
          getDoc(doc(db, 'review_states', 'overridden')),
        ]);
        setReviewState({
          resolved: resolvedDoc.exists() ? resolvedDoc.data()?.ids || [] : [],
          overridden: overriddenDoc.exists() ? overriddenDoc.data()?.ids || [] : [],
        });
      } catch { }
    };
    loadState();

    return () => unsubs.forEach(u => u());
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
      <RefreshCw size={24} className="mx-auto text-slate-400 mb-3 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          리뷰 수집 · 순위 추적 · 키워드 ROI · 경쟁사 모니터링 · 주간 리포트
          {lastUpdated && <span className="ml-2 text-slate-400">· 갱신 {lastUpdated}</span>}
        </p>
        {activeNegCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg shrink-0">
            <AlertTriangle size={13} className="text-rose-500" />
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">미조치 {activeNegCount}건</span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <nav className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                ? 'border-slate-900 dark:border-blue-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
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

export default ReviewDashboard;