/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Menu, MenuCategory, Ingredient, Region, RecipeItem, User, IngredientChange, BrandId, Brand, DEFAULT_BRANDS, SalesRecord } from './types';
import { MenuTable } from './components/MenuTable';
import { OverviewTable } from './components/OverviewTable';
import { MenuModal } from './components/MenuModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { RecipeModal } from './components/RecipeModal';
import { ArchiveView } from './components/ArchiveView';
import { IngredientChangeView } from './components/IngredientChangeView';
import { Auth, ChangePasswordModal } from './components/Auth';
import { PwaInstallBanner, PwaInstallButton } from './components/PwaInstallBanner';

const DatabaseView = lazy(() => import('./components/DatabaseView').then(m => ({ default: m.DatabaseView })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const ReviewDashboard = lazy(() => import('./components/ReviewDashboard').then(m => ({ default: m.ReviewDashboard })));
const AgentsDashboard = lazy(() => import('./components/AgentsDashboard').then(m => ({ default: m.AgentsDashboard })));
const MarketingDashboard = lazy(() => import('./components/marketing').then(m => ({ default: m.MarketingDashboard })));
const SalesDashboard = lazy(() => import('./components/sales/SalesDashboard').then(m => ({ default: m.SalesDashboard })));
const FranchiseScheduleView = lazy(() => import('./components/franchise').then(m => ({ default: m.FranchiseScheduleView })));
const ActivityLogView = lazy(() => import('./components/ActivityLogView').then(m => ({ default: m.ActivityLogView })));
const MeetingView = lazy(() => import('./components/MeetingView').then(m => ({ default: m.MeetingView })));
const HomePage = lazy(() => import('./components/HomePage').then(m => ({ default: m.HomePage })));
const EmployeeDirectory = lazy(() => import('./components/EmployeeDirectory').then(m => ({ default: m.EmployeeDirectory })));
const CompanyCalendar = lazy(() => import('./components/CompanyCalendar').then(m => ({ default: m.CompanyCalendar })));
const ReportView = lazy(() => import('./components/ReportView').then(m => ({ default: m.ReportView })));
const NoticeBoard = lazy(() => import('./components/NoticeBoard').then(m => ({ default: m.NoticeBoard })));
const DailyReportView = lazy(() => import('./components/DailyReportView').then(m => ({ default: m.DailyReportView })));
const SopView = lazy(() => import('./components/SopView').then(m => ({ default: m.SopView })));
const ProjectsView = lazy(() => import('./components/ProjectsView').then(m => ({ default: m.ProjectsView })));
const OKRView = lazy(() => import('./components/OKRView').then(m => ({ default: m.OKRView })));
const CompanyInfoView = lazy(() => import('./components/CompanyInfoView').then(m => ({ default: m.CompanyInfoView })));
const WorkMapView = lazy(() => import('./components/WorkMapView').then(m => ({ default: m.WorkMapView })));
const FactoryView = lazy(() => import('./components/FactoryView').then(m => ({ default: m.FactoryView })));
const StoreListView = lazy(() => import('./components/store/StoreListView').then(m => ({ default: m.StoreListView })));

import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmModal';
import { useReadabilityMode } from './hooks/useReadabilityMode';
import {
  Plus, Download, LogOut, KeyRound, Sun, Moon,
  Archive, AlertTriangle, Trash2, X, ChevronLeft, ChevronRight,
  ChevronDown, LayoutDashboard, Database, Settings,
  BarChart2, Edit2, Check, Store, TrendingUp, ShieldAlert,
  ArrowRight, Bell, Menu as MenuIcon, TriangleAlert, CalendarDays, ArrowUpRight, Sparkles, LayoutList, Zap, Eye,
  CheckSquare, FileText, History, NotebookPen, Users, Calendar, Megaphone, ClipboardList, BookOpen,
  Flag, GitBranch, Building2, Target, FolderKanban, Package, Type, Search,
} from 'lucide-react';
import { GlobalSearch } from './components/GlobalSearch';
import { OnboardingTour } from './components/OnboardingTour';
import Papa from 'papaparse';
import { calculateTotalCost, formatPercent, doesMenuContainIngredient, checkMenuAlert } from './utils';
import { auth, db, reviewDb, salesDb } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc, getDoc, getDocs, collection, onSnapshot, setDoc, updateDoc, addDoc,
  deleteDoc, writeBatch, query, where, deleteField, limit
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete',
  LIST = 'list', GET = 'get', WRITE = 'write',
}

const SECTION_GROUP: Record<string, string> = {
  notice: 'comm', meetings: 'comm', daily: 'comm', reports: 'comm',
  projects: 'work', okr: 'work', workmap: 'work', sop: 'work', factory: 'work',
  calendar: 'sch', employees: 'sch', stores: 'sch',
  database: 'mgmt', history: 'mgmt', admin: 'mgmt', agents: 'mgmt',
};

type CostTabType = Region | '전체보기' | '메뉴 관리' | '변동사항';
type SidebarSection = 'cost' | 'sales' | 'database' | 'admin' | 'review' | 'home' | 'agents' | 'stores' | 'marketing' | 'franchise' | 'meetings' | 'daily' | 'calendar' | 'notice' | 'reports' | 'employees' | 'sop' | 'history' | 'projects' | 'okr' | 'mvc' | 'brand_history' | 'company_profile' | 'workmap' | 'factory';

interface SidebarState {
  brandId: BrandId | null;
  section: SidebarSection;
  costTab: CostTabType;
  reviewTab?: string;
}

// 가맹점 관제 데이터가 있는 브랜드 (크롤러 연동 완료)
const REVIEW_ENABLED_BRANDS = ['dalbitgo'];

// HomePage는 src/components/HomePage.tsx 참고
function _OldHomePage_UNUSED({
  currentUser,
  brands,
  menus,
  ingredients,
  ingredientChanges,
  onNavigate,
  onFirestoreError,
}: {
  currentUser: User;
  brands: Brand[];
  menus: Menu[];
  ingredients: Ingredient[];
  ingredientChanges: IngredientChange[];
  onNavigate: (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType, reviewTab?: string) => void;
  onFirestoreError: (error: unknown, operationType: OperationType, path: string | null) => void;
}) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침입니다';
    if (hour < 18) return '안녕하세요';
    return '수고하셨습니다';
  };

  const [activeSchedulesCount, setActiveSchedulesCount] = useState<number | string>('-');
  const [unresolvedReviewsCount, setUnresolvedReviewsCount] = useState<number | string>('-');
  const [competitorChangesCount, setCompetitorChangesCount] = useState<number>(0);
  const [missingScheduleStores, setMissingScheduleStores] = useState<{name: string, number: string}[]>([]);
  const [missingDrawingStores, setMissingDrawingStores] = useState<{name: string, number: string}[]>([]);

  useEffect(() => {
    // franchise_schedules — 1회 조회로 변경 (onSnapshot 제거, 할당량 절감)
    getDocs(collection(salesDb, 'franchise_schedules')).then(snap => {
      let count = 0;
      const missing: {name: string, number: string}[] = [];
      const missingDrawings: {name: string, number: string}[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (!data.archived) {
          count++;
          const hasDetails = data.constructionStart || data.openDate || data.equipmentIn || data.ovenIn || data.initialStockIn || data.trainingStart || data.ownerGuideStart;
          if (data.storeName && !hasDetails) {
            missing.push({ name: data.storeName, number: data.storeNumber || '호수미정' });
          }
          if (data.storeName && !data.finalDrawingPdfUrl) {
            missingDrawings.push({ name: data.storeName, number: data.storeNumber || '호수미정' });
          }
        }
      });
      setActiveSchedulesCount(count);
      setMissingScheduleStores(missing);
      setMissingDrawingStores(missingDrawings);
    }).catch(error => onFirestoreError(error, OperationType.GET, 'franchise_schedules'));

    // 미조치 부정리뷰 수 — 실시간 불필요, 1회 조회
    Promise.all([
      getDoc(doc(reviewDb, 'review_states', 'resolved')),
      getDoc(doc(reviewDb, 'review_states', 'overridden')),
    ]).then(([resolvedDoc, overriddenDoc]) => {
      const resolved = resolvedDoc.exists() ? resolvedDoc.data()?.ids || [] : [];
      const overridden = overriddenDoc.exists() ? overriddenDoc.data()?.ids || [] : [];
      const qRev = query(collection(reviewDb, 'reviews'), where('감정분석', '==', '부정'), limit(200));
      getDocs(qRev).then(snap => {
        let count = 0;
        snap.forEach(d => { if (!resolved.includes(d.id) && !overridden.includes(d.id)) count++; });
        setUnresolvedReviewsCount(count);
      });
    }).catch(() => setUnresolvedReviewsCount(0));

    // 경쟁사 가격 변동 — 실시간 불필요, 1회 조회
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    getDocs(
      query(collection(reviewDb, 'competitor_menu'), where('수집일자', '>=', twoWeeksAgo.toISOString().split('T')[0]))
    ).then(snap => {
      const data: any[] = [];
      snap.forEach(d => data.push(d.data()));

      const dates = [...new Set(data.map(c => c.수집일자 as string))].filter(Boolean).sort();
      if (dates.length < 2) { setCompetitorChangesCount(0); return; }
      const latestDate = dates[dates.length - 1];
      const d = new Date(latestDate);
      if (isNaN(d.getTime())) { setCompetitorChangesCount(0); return; }
      d.setDate(d.getDate() - 7);
      const weekAgoStr = d.toISOString().split('T')[0];
      const validPrevDates = dates.filter(date => date >= weekAgoStr && date < latestDate);
      const prevDate = validPrevDates.length > 0 ? validPrevDates[0] : dates[dates.length - 2];
      const latestData = data.filter(c => c.수집일자 === latestDate);
      const prevData = data.filter(c => c.수집일자 === prevDate);

      const getPrice = (menuStr: string) => {
        if (!menuStr || menuStr === '수집 실패') return 0;
        const items = menuStr.replace(/\n/g, '|').split('|').map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < items.length; i++) {
          let name = items[i]; let priceStr = '';
          if (items[i].includes(':')) { const parts = items[i].split(':'); name = parts[0]; priceStr = parts.slice(1).join(':'); }
          else if (i + 1 < items.length && /[0-9,]+\s*원/.test(items[i + 1])) { priceStr = items[i + 1]; i++; }
          else { const match = items[i].match(/([0-9]{1,2}(?:,[0-9]{3})+|[0-9]{4,5})\s*원?/); if (match) priceStr = match[0]; }
          if (name.includes('고등어')) { const v = parseInt(priceStr.replace(/[^0-9]/g, ''), 10); if (!isNaN(v) && v >= 3000 && v <= 25000) return v; }
        }
        return 0;
      };

      let changes = 0;
      ['산으로간고등어', '화덕으로간고등어', '부산에뜬고등어', '북극해고등어'].forEach(brand => {
        const lMin = Math.min(...latestData.filter(d => (d.경쟁브랜드명_엑셀 || '').includes(brand)).map(d => getPrice(d.메뉴_및_가격)).filter(p => p > 0));
        const pMin = Math.min(...prevData.filter(d => (d.경쟁브랜드명_엑셀 || '').includes(brand)).map(d => getPrice(d.메뉴_및_가격)).filter(p => p > 0));
        if (lMin > 0 && pMin > 0 && lMin !== pMin) changes++;
      });
      setCompetitorChangesCount(changes);
    }).catch(() => setCompetitorChangesCount(0));

    return () => {};
  }, []);

  const alertMenus = menus.filter(m => (m.hasAlert || checkMenuAlert(m, ingredients, menus)) && !m.isArchived).length;

  const kpiCards = [
    {
      label: '오픈 일정',
      value: activeSchedulesCount,
      unit: '개점',
      icon: <Store size={20} strokeWidth={1.5} />,
      color: 'text-blue-900 dark:text-blue-400',
      iconBg: 'text-blue-800 dark:text-blue-400',
      onClick: () => onNavigate('dalbitgo', 'franchise'),
    },
    {
      label: '미조치 부정리뷰',
      value: unresolvedReviewsCount,
      unit: '건',
      icon: <ShieldAlert size={20} strokeWidth={1.5} />,
      color: typeof unresolvedReviewsCount === 'number' && unresolvedReviewsCount > 0 ? 'text-rose-800 dark:text-rose-500' : 'text-emerald-800 dark:text-emerald-500',
      iconBg: typeof unresolvedReviewsCount === 'number' && unresolvedReviewsCount > 0 ? 'text-rose-800 dark:text-rose-500' : 'text-emerald-800 dark:text-emerald-500',
      onClick: () => onNavigate('dalbitgo', 'review'),
      highlight: typeof unresolvedReviewsCount === 'number' && unresolvedReviewsCount > 0,
    },
    {
      label: '원가 알림',
      value: alertMenus,
      unit: '건',
      icon: <TriangleAlert size={20} strokeWidth={1.5} />,
      color: alertMenus > 0 ? 'text-amber-800 dark:text-amber-500' : 'text-stone-400 dark:text-stone-500',
      iconBg: alertMenus > 0 ? 'text-rose-800 dark:text-rose-500' : 'text-stone-400',
      onClick: () => onNavigate('dalbitgo', 'cost'),
      highlight: alertMenus > 0,
    },
    {
      label: '경쟁사 모니터링',
      value: competitorChangesCount > 0 ? competitorChangesCount : '4',
      unit: competitorChangesCount > 0 ? '건 변동' : '개사',
      icon: <Eye size={20} strokeWidth={1.5} />,
      color: competitorChangesCount > 0 ? 'text-amber-800 dark:text-amber-500' : 'text-stone-800 dark:text-stone-300',
      iconBg: competitorChangesCount > 0 ? 'text-amber-800 dark:text-amber-500' : 'text-stone-700 dark:text-stone-400',
      onClick: () => onNavigate('dalbitgo', 'review', undefined, 'competitor'),
      highlight: competitorChangesCount > 0,
    },
  ];

  const quickMenus = [
    {
      label: '원가 계산기',
      icon: <LayoutDashboard size={18} />,
      onClick: () => onNavigate('dalbitgo', 'cost'),
    },
    {
      label: '가맹점 관제',
      icon: <ShieldAlert size={18} />,
      onClick: () => onNavigate('dalbitgo', 'review'),
    },
    {
      label: '식재료 데이터베이스',
      icon: <Database size={18} />,
      onClick: () => onNavigate(null, 'database'),
    },
    {
      label: '매출 현황',
      icon: <BarChart2 size={18} />,
      onClick: () => onNavigate('dalbitgo', 'sales'),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">

      {/* 🚨 세부일정 누락 경고 배너 */}
      {missingScheduleStores.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-2 tracking-tight">오픈 일정 등록이 필요한 매장이 있습니다.</h4>
            <div className="flex flex-wrap gap-2">
              {missingScheduleStores.map((s, idx) => (
                <span key={idx} className="text-xs font-bold bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-md border border-amber-100 dark:border-amber-700/50 shadow-sm cursor-default">
                  {s.name} [{s.number}] 일정 등록 필요
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🚨 도면 누락 경고 배너 */}
      {missingDrawingStores.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
          <FileText className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-400 mb-2 tracking-tight">최종 도면 등록이 필요한 매장이 있습니다.</h4>
            <div className="flex flex-wrap gap-2">
              {missingDrawingStores.map((s, idx) => (
                <span key={idx} className="text-xs font-bold bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-700/50 shadow-sm cursor-default">
                  {s.name} [{s.number}] 도면 등록 필요
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 1. Newspaper Header (Masthead) */}
      <header className="border-b-[3px] border-double border-stone-800 dark:border-stone-300 pb-6 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <CalendarDays size={14} />
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-4xl sm:text-5xl font-black text-stone-900 dark:text-stone-50 tracking-tighter leading-none">
            SAEMOYANG DAILY
          </h1>
        </div>
        <div className="text-left sm:text-right">
          <h2 className="text-lg font-bold text-stone-700 dark:text-stone-300 tracking-tight">
            {greeting()}, <span className="text-stone-900 dark:text-white underline decoration-2 underline-offset-4 decoration-stone-300">{currentUser.name}</span>님
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 font-medium">
            정확한 데이터 기반의 프랜차이즈 의사결정
          </p>
        </div>
      </header>

      {/* 2. KPI Section (The Headlines) */}
      <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 dark:divide-stone-800 shadow-sm">
        {kpiCards.map(card => (
          <button
            key={card.label}
            onClick={card.onClick}
            className={`flex flex-col p-6 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group relative ${card.highlight ? 'bg-rose-50/30 dark:bg-rose-900/10' : ''}`}
          >
            {card.highlight && <div className="absolute top-0 left-0 w-full h-1 bg-rose-700 dark:bg-rose-500" />}
            <div className="flex items-center gap-2 mb-4">
              <span className={`${card.iconBg}`}>{card.icon}</span>
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 tracking-widest">{card.label}</span>
            </div>
            <div className="mt-auto flex items-baseline gap-1">
              <span className={`text-3xl sm:text-4xl font-black tracking-tighter ${card.color}`}>{card.value}</span>
              <span className="text-sm font-bold text-stone-500">{card.unit}</span>
            </div>
          </button>
        ))}
      </section>

      {/* 3. Layout Split: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         
         {/* Left Column: Quick Actions & Brands (Main Articles) */}
         <div className="lg:col-span-8 space-y-8">
            
            {/* Quick Actions */}
            <section>
               <div className="border-b-2 border-stone-800 dark:border-stone-400 mb-4 pb-2 flex items-center justify-between">
                  <h3 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">빠른 실행 <span className="text-xs text-stone-400 ml-1 tracking-widest font-normal">단축 메뉴</span></h3>
               </div>
               <div className="grid grid-cols-2 gap-px bg-stone-200 dark:bg-stone-800 border border-stone-200 dark:border-stone-800 shadow-sm">
                  {quickMenus.map(item => (
                     <button key={item.label} onClick={item.onClick} className="flex items-center justify-between p-5 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group">
                        <div className="flex items-center gap-3">
                           <span className="text-stone-400 group-hover:text-stone-800 dark:text-stone-500 dark:group-hover:text-stone-300 transition-colors">{item.icon}</span>
                           <span className="text-sm font-bold text-stone-800 dark:text-stone-200">{item.label}</span>
                        </div>
                        <ArrowRight size={16} className="text-stone-300 group-hover:text-stone-800 dark:text-stone-600 dark:group-hover:text-stone-400 transition-all -translate-x-2 group-hover:translate-x-0" />
                     </button>
                  ))}
               </div>
            </section>

            {/* Brand Status */}
            <section>
               <div className="border-b-2 border-stone-800 dark:border-stone-400 mb-4 pb-2 flex items-center justify-between">
                  <h3 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">브랜드 지수 <span className="text-xs text-stone-400 ml-1 tracking-widest font-normal">관제 현황</span></h3>
               </div>
               <div className="border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-200 dark:divide-stone-800 shadow-sm">
                {brands.map((brand, idx) => {
                  const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
                  const getBrandSlogan = (brandId: string) => {
                    switch (brandId) {
                      case 'dalbitgo': return <>대한민국 1등 생선구이와<br />12첩 계절 밥상</>;
                      case 'mansoo': return <>많이 드시라고 만수,<br />만수무강 하시라고 만수</>;
                      case 'yams': return '감성 분식 얌스';
                      case 'bom': return '노랗게 밥을 물들이다';
                      case 'noeul': return '노을의 향을 짚불로 그리다';
                      default: return '프리미엄 외식 브랜드';
                    }
                  };
                  return (
                    <React.Fragment key={brand.id}>
                        <button onClick={() => onNavigate(brand.id, 'cost')} className="w-full flex items-center justify-between p-5 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 flex items-center justify-center border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-500 group-hover:bg-stone-800 group-hover:text-white dark:group-hover:bg-stone-200 dark:group-hover:text-stone-900 transition-colors">
                              <Store size={20} strokeWidth={1.5} />
                          </div>
                          <div className="text-left">
                              <p className="font-black text-lg text-stone-900 dark:text-stone-100 tracking-tight leading-none mb-1.5">{brand.name}</p>
                              <p className="text-[10px] font-bold text-stone-500 tracking-widest leading-relaxed">{getBrandSlogan(brand.id)}</p>
                          </div>
                        </div>
                          <div>
                          {hasReview ? (
                              <span className="px-2.5 py-1 text-[10px] font-bold border border-rose-800 text-rose-800 dark:border-rose-400 dark:text-rose-400 flex items-center gap-1.5 shadow-sm">
                                <span className="w-1.5 h-1.5 bg-rose-700 dark:bg-rose-400 rounded-full animate-pulse" /> 관제ON
                              </span>
                          ) : (
                              <span className="px-2.5 py-1 text-[10px] font-bold border border-stone-300 text-stone-400 dark:border-stone-700 dark:text-stone-500">
                                준비중
                              </span>
                          )}
                          </div>
                        </button>
                    </React.Fragment>
                  );
                })}
               </div>
            </section>
         </div>

         {/* Right Column: System Notice (Side Column) */}
         <div className="lg:col-span-4">
            <section className="h-full border-2 border-stone-800 dark:border-stone-500 p-6 bg-[#FDFBF7] dark:bg-stone-900 shadow-sm flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Sparkles size={120} />
               </div>
               <div className="relative z-10 flex items-center gap-2 mb-8 pb-4 border-b border-stone-300 dark:border-stone-700">
                  <Bell size={20} className="text-stone-900 dark:text-stone-100" />
                  <h3 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">시스템 공지</h3>
               </div>
               <ul className="space-y-8 flex-1 relative z-10">
                  <li className="flex gap-4">
                     <span className="text-stone-300 dark:text-stone-700 font-serif font-black text-4xl leading-none mt-1">1</span>
                     <div>
                        <p className="text-sm font-black text-stone-900 dark:text-stone-100 mb-1.5 leading-tight">가맹점 데이터 수집</p>
                        <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed font-medium">매일 오전 6시에 자동으로 네이버 플레이스 순위 및 리뷰 데이터가 갱신됩니다.</p>
                     </div>
                  </li>
                  <li className="flex gap-4">
                     <span className="text-stone-300 dark:text-stone-700 font-serif font-black text-4xl leading-none mt-1">2</span>
                     <div>
                        <p className="text-sm font-black text-stone-900 dark:text-stone-100 mb-1.5 leading-tight">주간 리포트 발행</p>
                        <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed font-medium">매주 월요일 오전 7시에 경쟁사 동향 및 마케팅 요약 리포트가 생성됩니다.</p>
                     </div>
                  </li>
               </ul>
               <div className="mt-8 pt-6 border-t border-stone-300 dark:border-stone-700 text-right relative z-10">
                  <p className="text-[10px] font-black text-stone-400 tracking-[0.2em] uppercase">Saemoyang F&B</p>
               </div>
            </section>
         </div>

      </div>
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const { enabled: readableMode, toggle: toggleReadableMode } = useReadabilityMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showMobileQuickMenu, setShowMobileQuickMenu] = useState(false);

  const [brands, setBrands] = useState<Brand[]>(DEFAULT_BRANDS);
  const [expandedBrands, setExpandedBrands] = useState<Set<BrandId>>(new Set(['dalbitgo']));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const toggleGroup = (id: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [showAllIntranet, setShowAllIntranet] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarState>({
    brandId: null,
    section: 'home',
    costTab: '수도권',
  });

  const [editingBrandId, setEditingBrandId] = useState<BrandId | null>(null);
  const [editingBrandName, setEditingBrandName] = useState('');

  // 관리자 보고 알림
  const [reportAlerts, setReportAlerts] = useState<{ id: string; employeeName: string; type: 'morning' | 'evening'; date: string }[]>([]);
  const seenReportIds = useRef<Set<string>>(new Set());
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [dragOverBrandId, setDragOverBrandId] = useState<BrandId | null>(null);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientChanges, setIngredientChanges] = useState<IngredientChange[]>([]);

  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | undefined>(undefined);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [recipeMenu, setRecipeMenu] = useState<Menu | null>(null);
  const [showDeleteAllMenusConfirm, setShowDeleteAllMenusConfirm] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [thresholdType, setThresholdType] = useState<'percentage' | 'absolute'>('absolute');
  const [thresholdValue, setThresholdValue] = useState<number>(0.01);
  const [visibleColumns, setVisibleColumns] = useState({
    cost: true, margin: true, costRate: true, marginRate: true,
  });

  const activeBrand = sidebar.brandId;
  const brandMenus = menus.filter(m => (m.brandId || 'dalbitgo') === activeBrand);
  const brandIngredients = ingredients;
  const brandCategories = menuCategories.filter(c => (c.brandId || 'dalbitgo') === activeBrand);
  const brandChanges = ingredientChanges;

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Quota exceeded') || message.includes('resource-exhausted')) {
      setGlobalError('Firestore 무료 할당량을 모두 소진했습니다. 내일 오전 9시(KST) 이후에 다시 시도해 주세요.');
    } else {
      setGlobalError(`오류가 발생했습니다: ${message}`);
      setTimeout(() => setGlobalError(null), 5000);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarCollapsed(true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user && user.emailVerified) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            const isAdminEmail = user.email === 'saemoyang_official@naver.com' || user.email === 'wnsdl9331@gmail.com';
            if (userData.isActive) {
              if (isAdminEmail && (userData.role !== 'admin' || !userData.isApproved)) {
                const updatedUser = { ...userData, role: 'admin' as const, isApproved: true };
                await setDoc(userDocRef, updatedUser, { merge: true });
                setCurrentUser(updatedUser);
              } else {
                setCurrentUser(userData);
              }
              if (userData.theme) setTheme(userData.theme);
            } else {
              alert('계정이 정지되었습니다. 관리자에게 문의하세요.');
              await signOut(auth);
              setCurrentUser(null);
            }
          } else {
            setCurrentUser(null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users');
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!currentUser) return;
    if (!localStorage.getItem('dalbitgo_tour_seen')) setShowTour(true);
  }, [currentUser?.uid]);

  // 관리자 — 오늘 보고서 실시간 알림
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let firstLoad = true;
    const unsub = onSnapshot(
      query(collection(salesDb, 'daily_reports'), where('date', '==', todayStr)),
      (snap) => {
        if (firstLoad) {
          // 첫 로드: 기존 문서 모두 "이미 본 것"으로 등록 (알림 없이)
          snap.docs.forEach(doc => seenReportIds.current.add(doc.id));
          firstLoad = false;
          return;
        }
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          const id = change.doc.id;
          if (seenReportIds.current.has(id)) return;
          if (data.employeeId === currentUser.uid) return; // 자신 보고 알림 제외
          seenReportIds.current.add(id);
          setReportAlerts(prev => [...prev, {
            id, employeeName: data.employeeName, type: data.type, date: data.date,
          }]);
        });
      }
    );
    return () => unsub();
  }, [currentUser?.uid, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(collection(db, 'brands'), (snapshot) => {
      if (snapshot.empty) {
        DEFAULT_BRANDS.forEach(brand => { setDoc(doc(db, 'brands', brand.id), brand); });
        setBrands(DEFAULT_BRANDS);
      } else {
        const data: Brand[] = [];
        snapshot.forEach(d => data.push(d.data() as Brand));
        setBrands(data.sort((a, b) => a.order - b.order));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'brands'));
    return () => unsubscribe();
  }, [currentUser]);

  // 메뉴·식재료 데이터는 실제로 필요한 섹션 진입 시에만 구독
  // (홈·인트라넷 섹션에서는 Firestore 읽기 발생 안 함)
  const COST_SECTIONS: SidebarSection[] = ['cost', 'sales', 'database', 'admin', 'history'];
  const needsCostData = sidebar.brandId !== null || COST_SECTIONS.includes(sidebar.section);

  useEffect(() => {
    if (!currentUser || (!currentUser.isApproved && currentUser.role !== 'admin')) return;
    if (!needsCostData) return;

    const unsubscribeMenus = onSnapshot(collection(db, 'menus'), (snapshot) => {
      const data: Menu[] = [];
      snapshot.forEach(doc => data.push(doc.data() as Menu));
      setMenus(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'menus'));

    const unsubscribeCategories = onSnapshot(collection(db, 'menu_categories'), (snapshot) => {
      const data: MenuCategory[] = [];
      snapshot.forEach(doc => data.push(doc.data() as MenuCategory));
      setMenuCategories(data.sort((a, b) => a.order - b.order));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'menu_categories'));

    const unsubscribeIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
      const data: Ingredient[] = [];
      snapshot.forEach(doc => data.push(doc.data() as Ingredient));
      setIngredients(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'ingredients'));

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const qChanges = query(
      collection(db, 'ingredient_changes'),
      where('timestamp', '>=', threeMonthsAgo.toISOString())
    );
    const unsubscribeChanges = onSnapshot(qChanges, (snapshot) => {
      const data: IngredientChange[] = [];
      snapshot.forEach(doc => data.push(doc.data() as IngredientChange));
      setIngredientChanges(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'ingredient_changes'));

    return () => {
      unsubscribeMenus(); unsubscribeCategories();
      unsubscribeIngredients(); unsubscribeChanges();
    };
  }, [currentUser, needsCostData]);

  useEffect(() => {
    if (currentUser) {
      setThresholdType(currentUser.alertThresholdType || 'absolute');
      setThresholdValue(currentUser.alertThresholdValue ?? 0.01);
    }
  }, [currentUser]);

  // 💡 [핵심 기능] 시스템 활동 자동 기록 (Audit Log)
  const logActivity = async (action: string, details: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'activity_logs'), {
        userId: currentUser.uid,
        userName: currentUser.name,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (currentUser) {
      try { await updateDoc(doc(db, 'users', currentUser.uid), { theme: newTheme }); }
      catch (error) { console.error(error); }
    }
  };

  const handleSaveThreshold = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        alertThresholdType: thresholdType, alertThresholdValue: thresholdValue
      });
      setCurrentUser({ ...currentUser, alertThresholdType: thresholdType, alertThresholdValue: thresholdValue });
      toast.success('알림 설정이 저장되었습니다.');
    } catch (error) { console.error(error); }
  };

  const shouldTriggerAlert = (oldPrice: number, newPrice: number) => {
    const type = currentUser?.alertThresholdType || 'absolute';
    const val = currentUser?.alertThresholdValue ?? 0.01;
    if (type === 'absolute') return Math.abs(oldPrice - newPrice) > val;
    if (oldPrice === 0) return newPrice > 0;
    return ((Math.abs(newPrice - oldPrice) / oldPrice) * 100) > val;
  };

  const handleLogout = async () => {
    await logActivity('로그아웃', '시스템 접속 종료');
    await signOut(auth);
    setCurrentUser(null);
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    const id = `brand-${Date.now()}`;
    const newBrand: Brand = {
      id, name: newBrandName.trim(),
      order: brands.length, isActive: true,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'brands', id), newBrand);
      setNewBrandName('');
      setShowAddBrand(false);
    } catch (error) { handleFirestoreError(error, OperationType.CREATE, 'brands'); }
  };

  const handleUpdateBrand = async (id: BrandId, name: string) => {
    try {
      await updateDoc(doc(db, 'brands', id), { name });
      setEditingBrandId(null);
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `brands/${id}`); }
  };

  const handleDeleteBrand = async (id: BrandId) => {
    const ok = await confirm({ title: '브랜드 삭제', message: '이 브랜드를 삭제하시겠습니까?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      if (sidebar.brandId === id) {
        setSidebar(prev => ({ ...prev, brandId: null, section: 'home' }));
      }
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, `brands/${id}`); }
  };

  const toggleBrandExpand = (brandId: BrandId) => {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

  const handleBrandDragStart = (e: React.DragEvent, brandId: BrandId) => {
    e.dataTransfer.setData('sidebar-brand', brandId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleBrandDragOver = (e: React.DragEvent, brandId: BrandId) => {
    if (!e.dataTransfer.types.includes('sidebar-brand')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverBrandId(brandId);
  };

  const handleBrandDrop = async (e: React.DragEvent, targetBrandId: BrandId) => {
    e.preventDefault();
    setDragOverBrandId(null);
    const sourceBrandId = e.dataTransfer.getData('sidebar-brand');
    if (!sourceBrandId || sourceBrandId === targetBrandId) return;

    const sorted = [...brands].sort((a, b) => a.order - b.order);
    const sourceIdx = sorted.findIndex(b => b.id === sourceBrandId);
    const targetIdx = sorted.findIndex(b => b.id === targetBrandId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    try {
      const batch = writeBatch(db);
      reordered.forEach((brand, idx) => {
        batch.update(doc(db, 'brands', brand.id), { order: idx });
      });
      await batch.commit();
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'brands'); }
  };

  const handleSubMenuDrop = async (e: React.DragEvent, targetId: string, currentMenuOrder: string[]) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('sidebar-submenu');
    if (!sourceId || sourceId === targetId || !currentUser) return;

    const sourceIdx = currentMenuOrder.indexOf(sourceId);
    const targetIdx = currentMenuOrder.indexOf(targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newOrder = [...currentMenuOrder];
    const [moved] = newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, moved);

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { menuOrder: newOrder });
      setCurrentUser(prev => prev ? { ...prev, menuOrder: newOrder } : prev);
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`); }
  };

  const navigateTo = (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType, reviewTab?: string) => {
    // 접근제한 섹션은 이동 자체를 차단 (홈 카드, 사이드바 모두 동일하게 적용)
    if (currentUser && currentUser.role !== 'admin') {
      const perm = (currentUser.sectionPermissions as any)?.[section] ?? 'edit';
      if (perm === 'none') return;
    }
    setSidebar({ brandId, section, costTab: costTab || '수도권', reviewTab });
    if (brandId && !expandedBrands.has(brandId)) {
      setExpandedBrands(prev => new Set([...prev, brandId]));
    }
    const group = SECTION_GROUP[section];
    if (group) setExpandedGroups(prev => new Set([...prev, group]));
    if (brandId) setExpandedGroups(prev => new Set([...prev, 'brands']));
  };

  const handleSaveCategories = async (updatedCategories: MenuCategory[]) => {
    try {
      const deletedCategories = brandCategories.filter(c => !updatedCategories.find(uc => uc.id === c.id));
      for (const cat of updatedCategories) {
        await setDoc(doc(db, 'menu_categories', cat.id), { ...cat, brandId: activeBrand });
      }
      for (const cat of deletedCategories) {
        await deleteDoc(doc(db, 'menu_categories', cat.id));
        for (const menu of brandMenus.filter(m => m.categoryId === cat.id)) {
          await updateDoc(doc(db, 'menus', menu.id), { categoryId: deleteField() });
        }
      }
      setIsCategoryModalOpen(false);
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'menu_categories'); }
  };

  const handleSaveMenu = async (menu: Menu) => {
    try {
      await setDoc(doc(db, 'menus', menu.id), { ...menu, brandId: activeBrand });
      setIsMenuModalOpen(false);
      setEditingMenu(undefined);
      logActivity('메뉴 저장', `[${currentBrand?.name || '공통'}] ${menu.name} 정보 업데이트`);
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, `menus/${menu.id}`); }
  };

  const handleArchiveMenu = async (id: string) => {
    const ok = await confirm({ title: '메뉴 보관', message: '메뉴를 보관함으로 이동하시겠습니까?', confirmLabel: '보관', variant: 'warning' });
    if (!ok) return;
    try { 
      await updateDoc(doc(db, 'menus', id), { isArchived: true }); 
      const m = brandMenus.find(x => x.id === id);
      if(m) logActivity('메뉴 보관', `[${currentBrand?.name || '공통'}] ${m.name} 보관함 이동`);
    }
    catch (error) { handleFirestoreError(error, OperationType.UPDATE, `menus/${id}`); }
  };

  const handleRestoreMenu = async (id: string) => {
    try { await updateDoc(doc(db, 'menus', id), { isArchived: false }); }
    catch (error) { handleFirestoreError(error, OperationType.UPDATE, `menus/${id}`); }
  };

  const handleDeleteMenu = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'menus', id));
      setIsMenuModalOpen(false);
      setEditingMenu(undefined);
      const m = brandMenus.find(x => x.id === id);
      if(m) logActivity('메뉴 삭제', `[${currentBrand?.name || '공통'}] ${m.name} 영구 삭제`);
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, `menus/${id}`); }
  };

  const handleDeleteAllMenus = async () => {
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < brandMenus.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        brandMenus.slice(i, i + CHUNK_SIZE).forEach(menu => batch.delete(doc(db, 'menus', menu.id)));
        await batch.commit();
      }
      setShowDeleteAllMenusConfirm(false);
      toast.success('모든 메뉴가 삭제되었습니다.');
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'menus'); }
  };

  const handleSaveRecipe = async (menuId: string, recipe: RecipeItem[], notes: string) => {
    try {
      await updateDoc(doc(db, 'menus', menuId), { recipe, notes });
      setIsRecipeModalOpen(false);
      setRecipeMenu(null);
      const m = brandMenus.find(x => x.id === menuId);
      if(m) logActivity('레시피 수정', `[${currentBrand?.name || '공통'}] ${m.name} 레시피/원가 갱신`);
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `menus/${menuId}`); }
  };

  const handleAcknowledgeAlert = async (menuId: string) => {
    if (currentUser?.role !== 'admin') { toast.error('관리자만 알림을 해결할 수 있습니다.'); return; }
    const menu = brandMenus.find(m => m.id === menuId);
    if (!menu) return;
    const currentCost = calculateTotalCost(menu.recipe, brandIngredients, brandMenus);
    try {
      await updateDoc(doc(db, 'menus', menuId), { lastAcknowledgedCost: currentCost, hasAlert: false });
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `menus/${menuId}`); }
  };

  const handleReorderMenu = async (menuId: string, sourceCategoryId: string | undefined, destinationCategoryId: string | undefined, newIndex: number) => {
    const menu = brandMenus.find(m => m.id === menuId);
    if (!menu) return;
    try {
      if (sourceCategoryId === destinationCategoryId) {
        const categoryMenus = brandMenus.filter(m => m.categoryId === sourceCategoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
        const oldIndex = categoryMenus.findIndex(m => m.id === menuId);
        if (oldIndex === newIndex) return;
        const newCategoryMenus = [...categoryMenus];
        const [movedMenu] = newCategoryMenus.splice(oldIndex, 1);
        newCategoryMenus.splice(newIndex, 0, movedMenu);
        for (let i = 0; i < newCategoryMenus.length; i++) {
          if (newCategoryMenus[i].order !== i) await updateDoc(doc(db, 'menus', newCategoryMenus[i].id), { order: i });
        }
      } else {
        const destMenus = brandMenus.filter(m => m.categoryId === destinationCategoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
        const newDestMenus = [...destMenus];
        newDestMenus.splice(newIndex, 0, menu);
        await updateDoc(doc(db, 'menus', menu.id), { categoryId: destinationCategoryId || deleteField(), order: newIndex });
        for (let i = 0; i < newDestMenus.length; i++) {
          if (newDestMenus[i].id !== menu.id && newDestMenus[i].order !== i)
            await updateDoc(doc(db, 'menus', newDestMenus[i].id), { order: i });
        }
        const sourceMenus = brandMenus.filter(m => m.categoryId === sourceCategoryId && m.id !== menu.id).sort((a, b) => (a.order || 0) - (b.order || 0));
        for (let i = 0; i < sourceMenus.length; i++) {
          if (sourceMenus[i].order !== i) await updateDoc(doc(db, 'menus', sourceMenus[i].id), { order: i });
        }
      }
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'menus'); }
  };

  const handleToggleMenuVisibility = async (menuId: string) => {
    const menu = brandMenus.find(m => m.id === menuId);
    if (!menu) return;
    try { await updateDoc(doc(db, 'menus', menu.id), { isVisible: menu.isVisible === false }); }
    catch (error) { handleFirestoreError(error, OperationType.WRITE, 'menus'); }
  };

  const handleDeleteAllIngredients = async () => {
    const ok = await confirm({ title: '전체 데이터 삭제', message: '모든 식자재와 변경 이력을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', confirmLabel: '전체 삭제', variant: 'danger' });
    if (!ok) return;
    try {
      const CHUNK_SIZE = 500;
      const allOps = [
        ...ingredients.map(ing => ({ type: 'delete' as const, ref: doc(db, 'ingredients', ing.id) })),
        ...ingredientChanges.map(change => ({ type: 'delete' as const, ref: doc(db, 'ingredient_changes', change.id) })),
        ...menus.map(menu => ({ type: 'update' as const, ref: doc(db, 'menus', menu.id), data: { hasAlert: false, lastAcknowledgedCost: deleteField() } }))
      ];
      for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        allOps.slice(i, i + CHUNK_SIZE).forEach(op => {
          if (op.type === 'delete') batch.delete(op.ref);
          else if (op.type === 'update') batch.update(op.ref, op.data);
        });
        await batch.commit();
      }
      toast.success('전체 데이터가 초기화되었습니다.');
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'all_data'); }
  };

  const handleUnselectAllIngredients = async () => {
    const ok = await confirm({ title: '선택 전체 해제', message: '메뉴용 식자재 선택을 모두 해제하시겠습니까?', confirmLabel: '해제', variant: 'warning' });
    if (!ok) return;
    try {
      const CHUNK_SIZE = 500;
      const allOps: any[] = [];
      ingredients.forEach(ing => {
        if (ing.isSelectedForMenu) allOps.push({ type: 'update', ref: doc(db, 'ingredients', ing.id), data: { isSelectedForMenu: false } });
      });
      menus.forEach(menu => {
        if (menu.recipe.length > 0) allOps.push({ type: 'update', ref: doc(db, 'menus', menu.id), data: { hasAlert: true } });
      });
      for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        allOps.slice(i, i + CHUNK_SIZE).forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }
      toast.success('메뉴용 식자재 선택이 모두 해제되었습니다.');
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, 'ingredients'); }
  };

  const handleSaveIngredients = async (newIngredients: Ingredient[]) => {
    try {
      const CHUNK_SIZE = 500;
      const timestamp = new Date().toISOString();
      const allOps: any[] = [];
      const deletedIngredients = ingredients.filter(ing => !newIngredients.find(u => u.id === ing.id));

      deletedIngredients.forEach(ing => {
        allOps.push({ type: 'delete', ref: doc(db, 'ingredients', ing.id) });
        const changeId = `change-${Date.now()}-${ing.id}`;
        allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: { id: changeId, ingredientId: ing.id, name: ing.name, spec: ing.spec || '', type: 'deleted', prevPurchasePrice: ing.unitCost || 0, prevSalesPrice: ing.unitSalesPrice || 0, timestamp } });
      });

      const menusToAlert = new Set<string>();
      let changeCount = 0;

      newIngredients.forEach(ing => {
        const prevIng = ingredients.find(p => p.id === ing.id);
        const isNew = !prevIng;
        const isChanged = prevIng && (prevIng.name !== ing.name || prevIng.spec !== ing.spec || prevIng.unit !== ing.unit || prevIng.boxCost !== ing.boxCost || prevIng.boxQuantity !== ing.boxQuantity || prevIng.salesPrice !== ing.salesPrice || prevIng.isArchived !== ing.isArchived || prevIng.isSelectedForMenu !== ing.isSelectedForMenu);

        if (isNew || isChanged) {
          allOps.push({ type: 'set', ref: doc(db, 'ingredients', ing.id), data: ing });
          if (isNew) {
            changeCount++;
            const changeId = `change-${Date.now()}-${ing.id}`;
            allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: { id: changeId, ingredientId: ing.id, name: ing.name, spec: ing.spec || '', type: 'new', currPurchasePrice: ing.unitCost || 0, currSalesPrice: ing.unitSalesPrice || 0, timestamp } });
          } else if (prevIng) {
            const isPriceChanged = shouldTriggerAlert(prevIng.unitCost, ing.unitCost);
            const isSalesChanged = Math.abs((prevIng.unitSalesPrice || 0) - (ing.unitSalesPrice || 0)) > 0.01;
            if (isPriceChanged || isSalesChanged) {
              changeCount++;
              const changeId = `change-${Date.now()}-${ing.id}`;
              allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: { id: changeId, ingredientId: ing.id, name: ing.name, spec: ing.spec || '', type: 'price_change', prevPurchasePrice: prevIng.unitCost || 0, currPurchasePrice: ing.unitCost || 0, prevSalesPrice: prevIng.unitSalesPrice || 0, currSalesPrice: ing.unitSalesPrice || 0, timestamp } });
              menus.forEach(menu => { if (doesMenuContainIngredient(menu.recipe, ing.id, menus)) menusToAlert.add(menu.id); });
            }
          }
        }
      });

      deletedIngredients.forEach(ing => {
        menus.forEach(menu => { if (doesMenuContainIngredient(menu.recipe, ing.id, menus)) menusToAlert.add(menu.id); });
      });
      menusToAlert.forEach(menuId => allOps.push({ type: 'update', ref: doc(db, 'menus', menuId), data: { hasAlert: true } }));

      const opsToUse = changeCount > 50 ? (() => {
        const filtered = allOps.filter(op => op.ref.path.split('/')[0] !== 'ingredient_changes');
        const bulkId = `bulk-change-${Date.now()}`;
        filtered.push({ type: 'set', ref: doc(db, 'ingredient_changes', bulkId), data: { id: bulkId, ingredientId: 'bulk', name: '대량 업데이트', spec: `${changeCount}개 품목`, type: 'bulk_update', timestamp } });
        return filtered;
      })() : allOps;

      for (let i = 0; i < opsToUse.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        opsToUse.slice(i, i + CHUNK_SIZE).forEach(op => {
          if (op.type === 'set') batch.set(op.ref, op.data);
          else if (op.type === 'update') batch.update(op.ref, op.data);
          else if (op.type === 'delete') batch.delete(op.ref);
        });
        await batch.commit();
      }
      logActivity('식자재 업데이트', `데이터베이스 갱신 (신규/단가 변경 등 ${changeCount}건 처리)`);
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, 'ingredients'); }
  };

  const handleDeleteChange = async (id: string) => {
    const ok = await confirm({ title: '변동 이력 삭제', message: '이 변동 내역을 삭제하시겠습니까?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try { await deleteDoc(doc(db, 'ingredient_changes', id)); }
    catch (error) { handleFirestoreError(error, OperationType.DELETE, `ingredient_changes/${id}`); }
  };

  const handleExportCsv = () => {
    const activeMenus = brandMenus.filter(m => !m.isArchived && m.isVisible !== false);
    const data = activeMenus.map(m => {
      const cost = calculateTotalCost(m.recipe, brandIngredients, brandMenus);
      const row: any = { '메뉴명': m.name };
      if (visibleColumns.cost) row['원가'] = cost;
      (['지방권', '광역권', '수도권'] as Region[]).forEach(r => {
        const price = m.prices[r] || 0;
        const margin = price - cost;
        row[`${r}_판매가`] = price;
        if (visibleColumns.margin) row[`${r}_마진`] = margin;
        if (visibleColumns.costRate) row[`${r}_원가율`] = formatPercent(price > 0 ? cost / price : 0);
        if (visibleColumns.marginRate) row[`${r}_마진율`] = formatPercent(price > 0 ? margin / price : 0);
      });
      return row;
    });
    const csv = Papa.unparse(data);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeBrand}_menu_data.csv`;
    link.click();
    logActivity('엑셀 다운로드', `[${currentBrand?.name || '공통'}] 메뉴 원가 및 마진 데이터 CSV 다운로드`);
  };

  if (!isAuthReady) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm text-slate-400 dark:text-slate-500">로딩 중...</p>
    </div>
  );

  const renderGlobalError = () => globalError && (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-rose-600 text-white px-4 py-3 shadow-lg flex items-center justify-between">
      <div className="flex items-center gap-3"><AlertTriangle size={20} /><p className="text-sm font-medium">{globalError}</p></div>
      <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={18} /></button>
    </div>
  );

  if (!currentUser) return (<>{renderGlobalError()}<Auth /></>);

  if (!currentUser.isApproved && currentUser.role !== 'admin') {
    return (
      <>{renderGlobalError()}
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 text-center max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">승인 대기 중</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">관리자의 가입 승인을 기다리고 있습니다.</p>
            <button onClick={handleLogout} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">로그아웃</button>
          </div>
        </div>
      </>
    );
  }

  const activeMenus = brandMenus.filter(m => !m.isArchived);
  const archivedMenus = brandMenus.filter(m => m.isArchived);
  const currentBrand = brands.find(b => b.id === activeBrand);
  const costTabs: CostTabType[] = ['지방권', '광역권', '수도권', '전체보기', '메뉴 관리', '변동사항'];

  // 브랜드 운영 탭은 기본적으로 접근 제한 — 관리자가 명시 허용해야 접근 가능
  const BRAND_RESTRICTED: SidebarSection[] = ['cost', 'sales', 'review', 'marketing'];

  // 권한 체크 헬퍼 — admin은 항상 'edit', 일반 사용자는 sectionPermissions 우선
  const getSectionPermission = (section: SidebarSection): 'edit' | 'view' | 'none' => {
    if (!currentUser || currentUser.role === 'admin') return 'edit';
    const stored = (currentUser.sectionPermissions as any)?.[section] as 'edit' | 'view' | 'none' | undefined;
    if (stored !== undefined) return stored;
    // 브랜드 운영 탭은 명시적 허용 없으면 기본 차단
    if (BRAND_RESTRICTED.includes(section)) return 'none';
    return 'edit';
  };

  // 브랜드별 사이드바 서브메뉴 — 사용자 정의 순서 반영, 접근제한 섹션 숨김
  const DEFAULT_SUB_MENUS = [
    { id: 'cost' as SidebarSection, label: '원가 계산기', icon: <LayoutDashboard size={14} /> },
    { id: 'sales' as SidebarSection, label: '매출 현황', icon: <BarChart2 size={14} /> },
    { id: 'review' as SidebarSection, label: '가맹점 관제', icon: <ShieldAlert size={14} /> },
    { id: 'franchise' as SidebarSection, label: '오픈 일정', icon: <CalendarDays size={14} /> },
    { id: 'marketing' as SidebarSection, label: '마케팅 봇', icon: <Sparkles size={14} /> },
  ].filter(m => getSectionPermission(m.id) !== 'none');

  const getBrandSubMenus = (_brandId: BrandId) => {
    const order = currentUser?.menuOrder;
    if (!order || order.length === 0) return DEFAULT_SUB_MENUS;
    const sorted = [...DEFAULT_SUB_MENUS].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sorted;
  };

  const navigateAndCloseMobile = (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType, reviewTab?: string) => {
    navigateTo(brandId, section, costTab, reviewTab);
    if (isMobile) setMobileSidebarOpen(false);
  };

  // 💡 사이드바 닫힘 모드용 브랜드명 변환 함수
  const getShortBrandName = (name: string) => {
    if (name.includes('달빛')) return '달빛';
    if (name.includes('만수')) return '만수';
    if (name.includes('얌스')) return '얌스';
    if (name.includes('봄')) return '봄';
    if (name.includes('노을')) return '노을';
    return name.substring(0, 2); // 그 외의 경우 기본적으로 두 글자 반환
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex text-stone-900 dark:text-stone-100">
      {renderGlobalError()}
      <PwaInstallBanner />

      {/* 모바일 사이드바 오버레이 배경 */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* 전사 검색 오버레이 */}
      {showGlobalSearch && (
        <GlobalSearch
          onClose={() => setShowGlobalSearch(false)}
          onNavigate={(brandId, section) => navigateTo(brandId as any, section as any)}
        />
      )}

      {/* 온보딩 투어 */}
      {showTour && <OnboardingTour onClose={() => setShowTour(false)} />}

      {/* 모바일 햄버거 버튼 */}
      {isMobile && (
        <header className="bg-[#FDFBF7]/95 dark:bg-stone-900/95 backdrop-blur-md fixed top-0 w-full z-40 border-b-[3px] border-double border-stone-800 dark:border-stone-400 h-14 flex items-center justify-between px-4 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 p-1.5 rounded-sm transition-colors active:scale-95">
              <MenuIcon size={20} />
            </button>
            <h1 className="text-lg font-black tracking-tight text-stone-900 dark:text-stone-100 select-none">SAEMOYANG F&B</h1>
          </div>
          <button onClick={() => setShowGlobalSearch(true)} className="p-1.5 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-sm transition-colors">
            <Search size={18} />
          </button>
        </header>
      )}

      {/* 사이드바 */}
      <aside className={`${
        isMobile
          ? `fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : `${sidebarCollapsed ? 'w-14' : 'w-60'} transition-all duration-300 sticky top-0 h-screen shrink-0 print:hidden`
      } bg-[#FDFBF7] dark:bg-stone-900 border-r border-stone-300 dark:border-stone-700 flex flex-col shadow-sm print:hidden`}>

        <div className="flex items-center justify-between px-4 py-4 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
          {(!sidebarCollapsed || isMobile) && (
            <button
              id="tour-home-btn"
              onClick={() => {
                setSidebar({ brandId: null, section: 'home', costTab: '수도권' });
                if (isMobile) setMobileSidebarOpen(false);
              }}
              className="font-black text-base text-stone-900 dark:text-white tracking-tighter hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            >
              가맹관리시스템
            </button>
          )}
          {!isMobile && (
            <div className="flex items-center gap-0.5 ml-auto">
              <button id="tour-search-btn" onClick={() => setShowGlobalSearch(true)} className="p-1.5 rounded-sm hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500" title="검색 (Ctrl+K)">
                <Search size={14} />
              </button>
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 rounded-sm hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500">
                {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-sm hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 ml-auto">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">

          {/* ── 새모양에프엔비 ── */}
          {(!sidebarCollapsed || isMobile) && (
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-bold text-stone-400 tracking-widest">새모양에프엔비</p>
            </div>
          )}
          <div className="mx-2 space-y-0.5 mb-1">
            {([
              { section: 'mvc',             icon: <Flag size={14} />,      label: 'MVC' },
              { section: 'brand_history',   icon: <GitBranch size={14} />, label: '브랜드 연혁' },
              { section: 'company_profile', icon: <Building2 size={14} />, label: '회사 소개서' },
            ] as { section: import('./types').SidebarSection; icon: React.ReactNode; label: string }[])
              .map(({ section, icon, label }) => (
                <button
                  key={section}
                  onClick={() => navigateAndCloseMobile(null, section)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-xs transition-colors ${
                    sidebar.section === section
                      ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-l-[3px] border-stone-800 dark:border-stone-400 font-bold pl-2'
                      : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white border-l-[3px] border-transparent pl-2 font-medium'
                  }`}
                >
                  {icon}
                  {(!sidebarCollapsed || isMobile) && label}
                </button>
              ))}
          </div>

          {/* ── 운영 그룹 (아코디언) ── */}
          <div className="my-2 mx-4 border-t border-stone-200 dark:border-stone-700" />
          {([
            {
              id: 'comm', label: '소통', icon: <Megaphone size={13} />,
              items: [
                { section: 'notice' as SidebarSection,   icon: <Megaphone size={13} />,    label: '공지사항' },
                { section: 'meetings' as SidebarSection,  icon: <NotebookPen size={13} />,  label: '회의록' },
                { section: 'daily' as SidebarSection,     icon: <FileText size={13} />,     label: '업무보고' },
                { section: 'reports' as SidebarSection,   icon: <ClipboardList size={13} />, label: '결재보고센터' },
              ],
            },
            {
              id: 'work', label: '업무', icon: <FolderKanban size={13} />,
              items: [
                { section: 'projects' as SidebarSection,  icon: <FolderKanban size={13} />, label: '프로젝트' },
                { section: 'okr' as SidebarSection,       icon: <Target size={13} />,       label: 'OKR & KPI' },
                { section: 'workmap' as SidebarSection,   icon: <LayoutList size={13} />,   label: '업무지도' },
                { section: 'sop' as SidebarSection,       icon: <BookOpen size={13} />,     label: '업무규정' },
                { section: 'factory' as SidebarSection,   icon: <Package size={13} />,      label: '제조실' },
              ],
            },
            {
              id: 'sch', label: '일정 & 인원', icon: <Calendar size={13} />,
              items: [
                { section: 'calendar' as SidebarSection,  icon: <Calendar size={13} />,     label: '캘린더' },
                { section: 'employees' as SidebarSection, icon: <Users size={13} />,        label: '팀/부서' },
                { section: 'stores' as SidebarSection,    icon: <Store size={13} />,        label: '매장 관리' },
              ],
            },
          ]).map(group => {
            const isOpen = expandedGroups.has(group.id) || sidebarCollapsed;
            const hasActive = group.items.some(i => i.section === sidebar.section && sidebar.brandId === null);
            return (
              <div key={group.id} className="mx-2 mb-0.5">
                {(!sidebarCollapsed || isMobile) && (
                  <button
                    id={`tour-group-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-[11px] font-bold transition-colors ${
                      hasActive ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {group.icon}
                    <span className="flex-1 text-left tracking-wide">{group.label}</span>
                    <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {(isOpen || sidebarCollapsed) && (
                  <div className={`space-y-0.5 ${(!sidebarCollapsed && !isMobile) ? 'ml-3 pl-2 border-l border-stone-200 dark:border-stone-700' : ''}`}>
                    {group.items.map(({ section, icon, label }) => (
                      <button
                        key={section}
                        onClick={() => navigateAndCloseMobile(null, section)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-xs transition-colors ${
                          sidebar.section === section && sidebar.brandId === null
                            ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-l-[3px] border-stone-800 dark:border-stone-400 font-bold pl-2'
                            : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white border-l-[3px] border-transparent pl-2 font-medium'
                        }`}
                      >
                        {icon}
                        {(!sidebarCollapsed || isMobile) && label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── 브랜드 (아코디언) ── */}
          <div className="my-2 mx-4 border-t border-stone-200 dark:border-stone-700" />
          {(!sidebarCollapsed || isMobile) && (
            <div className="mx-2 mb-0.5">
              <button
                id="tour-brands"
                onClick={() => toggleGroup('brands')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-[11px] font-bold transition-colors ${
                  sidebar.brandId !== null ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <Store size={13} />
                <span className="flex-1 text-left tracking-wide">브랜드</span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${expandedGroups.has('brands') ? '' : '-rotate-90'}`} />
              </button>
            </div>
          )}

          {(expandedGroups.has('brands') || sidebarCollapsed || sidebar.brandId !== null) && [...brands].sort((a, b) => a.order - b.order).map(brand => {
            const isExpanded = expandedBrands.has(brand.id);
            const isActiveBrand = sidebar.brandId === brand.id;
            const subMenus = getBrandSubMenus(brand.id);
            const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
            const isDragOver = dragOverBrandId === brand.id;
            const menuOrderForUser = currentUser?.menuOrder || DEFAULT_SUB_MENUS.map(m => m.id);
            // 접근 가능한 서브메뉴가 1개이면 아코디언 없이 바로 이동
            const directSection = subMenus.length === 1 ? subMenus[0].id : null;

            return (
              <div
                key={brand.id}
                draggable={currentUser.role === 'admin' && !sidebarCollapsed}
                onDragStart={(e) => handleBrandDragStart(e, brand.id)}
                onDragOver={(e) => handleBrandDragOver(e, brand.id)}
                onDragLeave={() => setDragOverBrandId(null)}
                onDrop={(e) => handleBrandDrop(e, brand.id)}
                className={`transition-all ${isDragOver ? 'border-t-2 border-blue-400' : ''}`}
              >
                <div className={`flex items-center gap-1 mx-2 rounded-none px-1 py-1.5 group ${isActiveBrand ? 'bg-stone-200 dark:bg-stone-800 border-l-[3px] border-stone-800 dark:border-stone-400' : 'hover:bg-stone-100 dark:hover:bg-stone-800/50 border-l-[3px] border-transparent'} ${currentUser.role === 'admin' && !sidebarCollapsed ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                  {!sidebarCollapsed && !directSection && (
                    <button onClick={() => toggleBrandExpand(brand.id)} className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 shrink-0" onMouseDown={e => e.stopPropagation()}>
                      <ChevronDown size={13} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                    </button>
                  )}

                  {editingBrandId === brand.id && !sidebarCollapsed ? (
                    <input
                      type="text"
                      value={editingBrandName}
                      onChange={e => setEditingBrandName(e.target.value)}
                      onBlur={() => handleUpdateBrand(brand.id, editingBrandName)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateBrand(brand.id, editingBrandName); if (e.key === 'Escape') setEditingBrandId(null); }}
                      className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => directSection
                        ? navigateAndCloseMobile(brand.id, directSection)
                        : navigateTo(brand.id, subMenus[0]?.id ?? 'cost')
                      }
                      className={`flex-1 w-full text-xs truncate text-left pl-1.5 font-bold ${isActiveBrand ? 'text-stone-900 dark:text-white' : 'text-stone-600 dark:text-stone-400'}`}
                      title={sidebarCollapsed ? brand.name : undefined}
                    >
                      {sidebarCollapsed ? getShortBrandName(brand.name) : brand.name}
                    </button>
                  )}

                  {!sidebarCollapsed && currentUser.role === 'admin' && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button onClick={() => { setEditingBrandId(brand.id); setEditingBrandName(brand.name); }} className="p-0.5 text-stone-400 hover:text-blue-700 rounded-sm" onMouseDown={e => e.stopPropagation()}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={() => handleDeleteBrand(brand.id)} className="p-0.5 text-stone-400 hover:text-rose-700 rounded-sm" onMouseDown={e => e.stopPropagation()}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {!directSection && isExpanded && (!sidebarCollapsed || isMobile) && (
                  <div className="ml-6 mr-2 mb-1">
                    {subMenus.map(item => {
                      const isReviewMenu = item.id === 'review';
                      const isDisabled = isReviewMenu && !hasReview;
                      const isActive = sidebar.brandId === brand.id && sidebar.section === item.id;

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('sidebar-submenu', item.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragOver={e => { if (!e.dataTransfer.types.includes('sidebar-submenu')) return; e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => { e.stopPropagation(); handleSubMenuDrop(e, item.id, menuOrderForUser); }}
                        >
                          <button
                            onClick={() => !isDisabled && navigateAndCloseMobile(brand.id, item.id)}
                            className={`w-full flex items-center gap-2 px-2 py-2 rounded-none text-[11px] transition-colors group/sub ${
                              isActive
                                ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-l-[3px] border-stone-800 dark:border-stone-400 font-bold pl-2'
                                : isDisabled
                                ? 'text-stone-300 dark:text-stone-600 cursor-not-allowed'
                                : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white border-l-[3px] border-transparent pl-2 font-medium'
                            }`}
                          >
                            <span className="opacity-0 group-hover/sub:opacity-30 cursor-grab text-[9px]">⠿</span>
                            {item.icon}
                            {item.label}
                            {isDisabled && (
                              <span className="ml-auto text-[9px] text-slate-300 dark:text-slate-600">준비중</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {(!sidebarCollapsed || isMobile) && currentUser.role === 'admin' && (
            <div className="mx-2 mt-1">
              {showAddBrand ? (
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={e => setNewBrandName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddBrand(); if (e.key === 'Escape') setShowAddBrand(false); }}
                    placeholder="브랜드명"
                    className="flex-1 text-xs px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button onClick={handleAddBrand} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded"><Check size={13} /></button>
                  <button onClick={() => setShowAddBrand(false)} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><X size={13} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddBrand(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Plus size={13} /> 브랜드 추가
                </button>
              )}
            </div>
          )}

          {/* ── 관리 (아코디언) ── */}
          <div className="my-2 mx-4 border-t border-stone-200 dark:border-stone-700" />
          {(() => {
            const mgmtItems = [
              { section: 'database' as SidebarSection, icon: <Database size={13} />, label: '식재료 DB', always: true },
              { section: 'history'  as SidebarSection, icon: <History size={13} />,  label: '변경 이력', always: false, cond: currentUser.role === 'admin' || (currentUser.departmentHeadOf?.length ?? 0) > 0 },
              { section: 'admin'    as SidebarSection, icon: <Settings size={13} />, label: '관리자',    always: false, cond: currentUser.role === 'admin' },
            ].filter(i => i.always || i.cond);
            const isOpen = expandedGroups.has('mgmt') || sidebarCollapsed;
            const hasActive = mgmtItems.some(i => i.section === sidebar.section && sidebar.brandId === null);
            return (
              <div className="mx-2 mb-1">
                {(!sidebarCollapsed || isMobile) && (
                  <button
                    onClick={() => toggleGroup('mgmt')}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-[11px] font-bold transition-colors ${
                      hasActive ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    <Settings size={13} />
                    <span className="flex-1 text-left tracking-wide">관리</span>
                    <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {(isOpen || sidebarCollapsed) && (
                  <div className={`space-y-0.5 ${(!sidebarCollapsed && !isMobile) ? 'ml-3 pl-2 border-l border-stone-200 dark:border-stone-700' : ''}`}>
                    {mgmtItems.map(({ section, icon, label }) => (
                      <button
                        key={section}
                        onClick={() => navigateAndCloseMobile(null, section)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none text-xs transition-colors ${
                          sidebar.section === section && sidebar.brandId === null
                            ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-l-[3px] border-stone-800 dark:border-stone-400 font-bold pl-2'
                            : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white border-l-[3px] border-transparent pl-2 font-medium'
                        }`}
                      >
                        {icon}
                        {(!sidebarCollapsed || isMobile) && label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* 앱 설치 버튼 */}
        <div className="px-3 pb-1">
          <PwaInstallButton collapsed={sidebarCollapsed && !isMobile} />
        </div>

        <div className="px-4 py-4 border-t-[3px] border-double border-stone-800 dark:border-stone-400 bg-stone-100 dark:bg-stone-950">
          <div className={`flex items-center ${(sidebarCollapsed && !isMobile) ? 'justify-center' : 'justify-between'} gap-2`}>
            {(!sidebarCollapsed || isMobile) && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{currentUser.name}</span>
                <span className="text-[10px] text-stone-500 font-medium tracking-wide">{currentUser.role === 'admin' ? '최고 관리자' : '일반 사용자'}</span>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleReadableMode}
                className={`p-1.5 rounded-sm hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors ${readableMode ? 'text-stone-900 dark:text-stone-100 bg-stone-200 dark:bg-stone-800' : 'text-stone-500'}`}
                title={readableMode ? '가독성 모드 켜짐 — 클릭해서 끄기' : '가독성 모드 끄기 — 클릭해서 켜기'}
              >
                <Type size={14} />
              </button>
              <button id="tour-theme-btn" onClick={toggleTheme} className="p-1.5 rounded-sm text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800" title="테마">
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              </button>
              <button onClick={() => setIsChangePasswordOpen(true)} className="p-1.5 rounded-sm text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800" title="비밀번호 변경">
                <KeyRound size={14} />
              </button>
              <button
                id="tour-guide-btn"
                onClick={() => setShowTour(true)}
                className="p-1.5 rounded-sm text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-amber-500 transition-colors"
                title="기능 가이드"
              >
                <Sparkles size={14} />
              </button>
              <button onClick={handleLogout} className="p-1.5 rounded-sm text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800" title="로그아웃">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={`flex-1 overflow-auto ${isMobile ? 'pt-14 pb-20' : ''} print:p-0 print:overflow-visible print:bg-white`}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" /></div>}>

          {/* 접근제한 섹션 진입 차단 */}
          {sidebar.section !== 'home' && sidebar.section !== 'admin' && getSectionPermission(sidebar.section) === 'none' && (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <ShieldAlert size={48} className="text-red-300 dark:text-red-700 mb-4" />
              <h2 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">접근이 제한된 섹션입니다</h2>
              <p className="text-sm text-slate-400">관리자에게 권한을 요청하세요.</p>
            </div>
          )}

          {/* 열람 전용 모드 배너 */}
          {sidebar.section !== 'home' && sidebar.section !== 'admin' && getSectionPermission(sidebar.section) === 'view' && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Eye size={15} className="text-blue-500 shrink-0" />
              <span className="text-sm font-bold text-blue-700 dark:text-blue-400">열람 전용 모드 — 이 섹션은 조회만 가능합니다.</span>
            </div>
          )}

          {/* 홈 (랜딩) */}
          {sidebar.section === 'home' && (
            <HomePage
              currentUser={currentUser}
              brands={brands}
              menus={menus}
              ingredients={ingredients}
              ingredientChanges={ingredientChanges}
              onNavigate={navigateTo}
              onFirestoreError={handleFirestoreError}
              getSectionPermission={getSectionPermission}
            />
          )}

          {/* 식재료 데이터베이스 */}
          {sidebar.section === 'database' && sidebar.brandId === null && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">식재료 데이터베이스</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">전 브랜드 공유 식재료 관리</p>
              </div>
              <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <DatabaseView
                  ingredients={ingredients}
                  ingredientChanges={ingredientChanges}
                  onSave={handleSaveIngredients}
                  onDeleteAll={handleDeleteAllIngredients}
                  onUnselectAll={handleUnselectAllIngredients}
                  isAdmin={currentUser.role === 'admin'}
                  currentUser={currentUser}
                  onDeleteChange={handleDeleteChange}
                  thresholdType={thresholdType}
                  thresholdValue={thresholdValue}
                  onThresholdTypeChange={setThresholdType}
                  onThresholdValueChange={setThresholdValue}
                  onSaveThreshold={handleSaveThreshold}
                />
              </div>
            </>
          )}

          {/* 관리자 */}
          {sidebar.section === 'admin' && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">관리자</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">시스템 관리 및 사용자 관리</p>
              </div>
              <AdminPanel onFirestoreError={handleFirestoreError} ingredients={ingredients} currentUser={currentUser} />
            </>
          )}

          {/* 변경 이력 */}
          {sidebar.section === 'history' && (
            <ActivityLogView currentUser={currentUser} />
          )}

          {/* 에이전트 팀 */}
          {sidebar.section === 'agents' && <AgentsDashboard />}

          {/* 새모양에프엔비 섹션 */}
          {(sidebar.section === 'mvc' || sidebar.section === 'brand_history' || sidebar.section === 'company_profile') && (
            <CompanyInfoView section={sidebar.section} currentUser={currentUser} />
          )}

          {/* 업무 지도 */}
          {sidebar.section === 'workmap' && (
            <WorkMapView currentUser={currentUser} />
          )}

          {/* 제조실 */}
          {sidebar.section === 'factory' && (
            <FactoryView currentUser={currentUser} />
          )}

          {/* OKR & KPI */}
          {sidebar.section === 'okr' && (
            <OKRView currentUser={currentUser} />
          )}

          {/* 프로젝트 */}
          {sidebar.section === 'projects' && (
            <ProjectsView currentUser={currentUser} />
          )}

          {/* 회의록 */}
          {sidebar.section === 'meetings' && (
            <MeetingView currentUserName={currentUser.name} currentUser={currentUser} />
          )}

          {/* 일일 업무보고 */}
          {sidebar.section === 'daily' && (
            <DailyReportView currentUser={currentUser} onNavigateToReports={() => navigateTo(null, 'reports')} />
          )}

          {/* 캘린더 */}
          {sidebar.section === 'calendar' && (
            <CompanyCalendar currentUser={currentUser} />
          )}

          {/* 공지사항 */}
          {sidebar.section === 'notice' && (
            <NoticeBoard currentUser={currentUser} />
          )}

          {/* 보고서 */}
          {sidebar.section === 'reports' && (
            <ReportView currentUser={currentUser} />
          )}

          {/* 직원 명부 */}
          {sidebar.section === 'employees' && (
            <EmployeeDirectory currentUser={currentUser} />
          )}

          {/* 매장 관리 */}
          {sidebar.section === 'stores' && (
            <StoreListView currentUser={currentUser} />
          )}

          {/* 업무 규정 */}
          {sidebar.section === 'sop' && (
            <SopView currentUser={currentUser} />
          )}

          {/* 브랜드별 콘텐츠 */}
          {sidebar.brandId !== null && currentBrand && (
            <>
              {/* 가맹점 관제 */}
              {sidebar.section === 'review' && (
                <>
                  <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{currentBrand.name} · 가맹점 관제</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">리뷰 수집 · 네이버 순위 추적 · 키워드 ROI · 경쟁사 모니터링</p>
                  </div>
                  {REVIEW_ENABLED_BRANDS.includes(currentBrand.id) ? (
                    <ReviewDashboard initialTab={sidebar.reviewTab} />
                  ) : (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
                      <ShieldAlert size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">준비 중입니다</h2>
                      <p className="text-sm text-slate-400">{currentBrand.name}의 가맹점 관제 시스템이 곧 오픈됩니다.</p>
                    </div>
                  )}
                </>
              )}

              {/* 오픈 일정 */}
              {sidebar.section === 'franchise' && sidebar.brandId && getSectionPermission('franchise') !== 'none' && (
                <FranchiseScheduleView brandId={sidebar.brandId} currentUser={currentUser} isReadOnly={getSectionPermission('franchise') === 'view'} />
              )}

              {/* 마케팅 봇 */}
              {sidebar.section === 'marketing' && sidebar.brandId && (
                <MarketingDashboard activeBrand={sidebar.brandId} />
              )}

              {/* 매출 현황 */}
              {sidebar.section === 'sales' && sidebar.brandId && getSectionPermission('sales') !== 'none' && (
                <SalesDashboard activeBrand={sidebar.brandId} isReadOnly={getSectionPermission('sales') === 'view'} />
              )}

              {/* 원가 계산기 */}
              {sidebar.section === 'cost' && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{currentBrand.name}</h1>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">원가 계산기</p>
                    </div>
                    <button onClick={handleExportCsv} className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1.5 text-sm shadow-sm">
                      <Download size={16} /> 내보내기
                    </button>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-t-xl shadow-sm border-b border-slate-200 dark:border-slate-800">
                    <nav className="flex -mb-px overflow-x-auto hide-scrollbar snap-x">
                      {costTabs.filter(tab => tab !== '변동사항' || currentUser.role === 'admin').map(tab => (
                        <button
                          key={tab}
                          onClick={() => setSidebar(prev => ({ ...prev, costTab: tab }))}
                          className={`snap-start whitespace-nowrap py-3 px-4 sm:py-4 sm:px-5 border-b-2 font-medium text-sm transition-colors ${sidebar.costTab === tab ? 'border-slate-900 dark:border-blue-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          {tab}
                        </button>
                      ))}
                    </nav>
                  </div>

                  <div className="bg-white dark:bg-slate-900 shadow-sm rounded-b-xl overflow-hidden border border-t-0 border-slate-200 dark:border-slate-800">
                    {sidebar.costTab === '전체보기' ? (
                      <OverviewTable menus={activeMenus} menuCategories={brandCategories} ingredients={brandIngredients} isAdmin={currentUser.role === 'admin'} visibleColumns={visibleColumns} onAcknowledgeAlert={handleAcknowledgeAlert} onNavigateToTab={(tab) => setSidebar(prev => ({ ...prev, costTab: tab as CostTabType }))} onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))} onSaveRecipe={handleSaveRecipe} />
                    ) : sidebar.costTab === '메뉴 관리' ? (
                      <div className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                          <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">메뉴 관리</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">새로운 메뉴를 추가하거나 보관된 메뉴를 관리합니다.</p>
                          </div>
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                            <button onClick={() => setIsCategoryModalOpen(true)} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-lg flex items-center gap-2 text-sm border border-slate-200 dark:border-slate-700">카테고리 관리</button>
                            <button onClick={() => setShowDeleteAllMenusConfirm(true)} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 rounded-lg flex items-center gap-2 text-sm border border-rose-200 dark:border-rose-800"><Trash2 size={16} /> 전체 삭제</button>
                            <button onClick={() => { setEditingMenu(undefined); setIsMenuModalOpen(true); }} className="w-full sm:w-auto justify-center px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm"><Plus size={16} /> 메뉴 추가</button>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-4">
                          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Check size={15} className="text-emerald-500" /> 등록된 메뉴 <span className="text-xs font-normal text-slate-400">({activeMenus.length}개)</span>
                            </h3>
                          </div>
                          {activeMenus.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-slate-400">등록된 메뉴가 없습니다.</p>
                          ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                              {activeMenus.map(menu => (
                                <div key={menu.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{menu.name}</span>
                                    {menu.isVisible === false && <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">숨김</span>}
                                    {brandCategories.find(c => c.id === menu.categoryId) && (
                                      <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                                        {brandCategories.find(c => c.id === menu.categoryId)?.name}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => { setEditingMenu(menu); setIsMenuModalOpen(true); }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors shrink-0"
                                    title="수정"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Archive size={16} className="text-slate-400" />보관된 메뉴</h3>
                          <ArchiveView menus={archivedMenus} ingredients={brandIngredients} onRestoreMenu={handleRestoreMenu} onDeleteMenu={handleDeleteMenu} />
                        </div>
                      </div>
                    ) : sidebar.costTab === '변동사항' ? (
                      <IngredientChangeView changes={brandChanges} ingredients={brandIngredients} currentUser={currentUser} onDeleteChange={handleDeleteChange} />
                    ) : (
                      <MenuTable menus={activeMenus} menuCategories={brandCategories} ingredients={brandIngredients} region={sidebar.costTab as Region} visibleColumns={visibleColumns} onEditMenu={(menu) => { setEditingMenu(menu); setIsMenuModalOpen(true); }} onArchiveMenu={handleArchiveMenu} onEditRecipe={(menu) => { setRecipeMenu(menu); setIsRecipeModalOpen(true); }} isAdmin={currentUser.role === 'admin'} onAcknowledgeAlert={handleAcknowledgeAlert} onNavigateToTab={(tab) => setSidebar(prev => ({ ...prev, costTab: tab as CostTabType }))} onReorderMenu={handleReorderMenu} onToggleMenuVisibility={handleToggleMenuVisibility} onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))} onSaveRecipe={handleSaveRecipe} />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </Suspense>
        </div>
      </main>

      {/* 모바일 퀵 메뉴 모달 */}
      {showMobileQuickMenu && isMobile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center pb-safe" onClick={() => setShowMobileQuickMenu(false)}>
          <div className="bg-stone-100 dark:bg-stone-900 w-full rounded-t-2xl p-6 pb-24 animate-in slide-in-from-bottom-full duration-300 shadow-2xl border-t-2 border-stone-800 dark:border-stone-400" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 mx-auto rounded-full mb-6"></div>
            <h3 className="text-lg font-black text-stone-900 dark:text-white mb-4 tracking-tight">빠른 메뉴</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '원가 계산', icon: <LayoutDashboard size={20}/>, action: () => navigateAndCloseMobile('dalbitgo', 'cost') },
                { label: '매출 현황', icon: <BarChart2 size={20}/>, action: () => navigateAndCloseMobile('dalbitgo', 'sales') },
                { label: '가맹 관제', icon: <ShieldAlert size={20}/>, action: () => navigateAndCloseMobile('dalbitgo', 'review') },
                { label: '오픈 일정', icon: <CalendarDays size={20}/>, action: () => navigateAndCloseMobile('dalbitgo', 'franchise') },
                { label: '마케팅 봇', icon: <Sparkles size={20}/>, action: () => navigateAndCloseMobile('dalbitgo', 'marketing') },
                { label: '식재료 DB', icon: <Database size={20}/>, action: () => navigateAndCloseMobile(null, 'database') },
              ].map(q => (
                <button key={q.label} onClick={() => { q.action(); setShowMobileQuickMenu(false); }} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-stone-800 rounded-sm shadow-sm border border-stone-300 dark:border-stone-700 hover:border-stone-800 transition-colors">
                  <div className="text-stone-600 dark:text-stone-300 mb-2">{q.icon}</div>
                  <span className="text-[10px] font-bold text-stone-800 dark:text-stone-200 tracking-tight">{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 모바일용 Bottom Navigation Bar */}
      {isMobile && !showMobileQuickMenu && (
        <nav className="bg-[#FDFBF7]/95 dark:bg-stone-900/95 backdrop-blur-md fixed bottom-0 left-0 right-0 flex justify-around items-center h-16 pb-safe px-2 z-40 border-t-[3px] border-double border-stone-800 dark:border-stone-400 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] text-[10px] font-bold">
          <button onClick={() => navigateTo(null, 'home')} className={`flex flex-col items-center justify-center w-16 h-12 rounded-sm transition-colors ${sidebar.section === 'home' ? 'text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-stone-300' : 'text-stone-400 hover:text-stone-700'}`}>
            <LayoutList size={20} className="mb-0.5" />
            <span>홈</span>
          </button>
          <button onClick={() => setMobileSidebarOpen(true)} className={`flex flex-col items-center justify-center w-16 h-12 rounded-sm transition-colors ${sidebar.brandId !== null && sidebar.section !== 'home' ? 'text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-stone-300' : 'text-stone-400 hover:text-stone-700'}`}>
            <Store size={20} className="mb-0.5" />
            <span>브랜드</span>
          </button>
          <button onClick={() => setShowMobileQuickMenu(true)} className={`flex flex-col items-center justify-center w-16 h-12 rounded-sm transition-colors text-stone-400 hover:text-stone-700`}>
            <Zap size={20} className="mb-0.5" />
            <span>빠른메뉴</span>
          </button>
          <button onClick={() => navigateTo(null, 'admin')} className={`flex flex-col items-center justify-center w-16 h-12 rounded-sm transition-colors ${sidebar.section === 'admin' ? 'text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-stone-300' : 'text-stone-400 hover:text-stone-700'}`}>
            <Settings size={20} className="mb-0.5" />
            <span>설정</span>
          </button>
        </nav>
      )}

      {/* 모달 */}
      {isCategoryModalOpen && <CategoryManagementModal categories={brandCategories} onSave={handleSaveCategories} onClose={() => setIsCategoryModalOpen(false)} />}
      {isMenuModalOpen && <MenuModal menu={editingMenu} menuCategories={brandCategories} onSave={handleSaveMenu} onClose={() => { setIsMenuModalOpen(false); setEditingMenu(undefined); }} onArchive={handleArchiveMenu} onDelete={handleDeleteMenu} />}
      {isRecipeModalOpen && recipeMenu && <RecipeModal menu={recipeMenu} ingredients={brandIngredients} menus={brandMenus} onSave={handleSaveRecipe} onClose={() => { setIsRecipeModalOpen(false); setRecipeMenu(null); }} />}
      {/* 보고서 제출 알림 팝업 (관리자) */}
      {reportAlerts.length > 0 && (() => {
        const alert = reportAlerts[0];
        const label = alert.type === 'morning' ? '출근' : '퇴근';
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4">
            <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-stone-800 dark:border-stone-400">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Bell size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-stone-900 dark:text-white">보고서 제출 알림</p>
                  <p className="text-xs text-stone-400 mt-0.5">{alert.date}</p>
                </div>
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300 mb-5 leading-relaxed">
                <span className="font-bold text-stone-900 dark:text-white">{alert.employeeName}</span>님의{' '}
                <span className="font-bold text-blue-600 dark:text-blue-400">{label} 보고서</span>가 제출되었습니다.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setReportAlerts(prev => prev.slice(1));
                    navigateTo(null, 'daily');
                    if (isMobile) setMobileSidebarOpen(false);
                  }}
                  className="flex-1 py-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-bold rounded-xl hover:opacity-80">
                  지금 확인
                </button>
                <button
                  onClick={() => setReportAlerts(prev => prev.slice(1))}
                  className="flex-1 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-sm font-bold rounded-xl hover:opacity-80">
                  나중에 보기
                </button>
              </div>
              {reportAlerts.length > 1 && (
                <p className="text-center text-[11px] text-stone-400 mt-3">대기 중 알림 {reportAlerts.length - 1}건 더</p>
              )}
            </div>
          </div>
        );
      })()}

      {isChangePasswordOpen && <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />}
      {showDeleteAllMenusConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4"><AlertTriangle size={24} /><h3 className="text-lg font-bold">메뉴 전체 삭제</h3></div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">정말로 모든 메뉴를 영구 삭제하시겠습니까?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteAllMenusConfirm(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">취소</button>
              <button onClick={handleDeleteAllMenus} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg">삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
