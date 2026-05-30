import React, { useState, useEffect } from 'react';
import { User, Brand, Menu, Ingredient, IngredientChange, BrandId, SidebarSection, CostTabType, OperationType } from '../types';
import { checkMenuAlert } from '../utils';
import { reviewDb, salesDb } from '../firebase';
import { collection, getDocs, doc, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
import {
  Store, ShieldAlert, AlertTriangle, Eye, LayoutDashboard, Database, BarChart2,
  ArrowRight, CalendarDays, Bell, Sparkles, TriangleAlert, FileText,
  ClipboardList, CheckCircle, XCircle, Clock, Briefcase, NotebookPen, Users
} from 'lucide-react';

const REVIEW_ENABLED_BRANDS = ['dalbitgo'];

export function HomePage({
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

  // 인트라넷 대시보드 데이터
  const [todayMorning, setTodayMorning] = useState<boolean | null>(null);
  const [todayEvening, setTodayEvening] = useState<boolean | null>(null);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [recentMeetingTitle, setRecentMeetingTitle] = useState<string | null>(null);

  useEffect(() => {
    // franchise_schedules — 1회 조회 (onSnapshot → getDocs, 할당량 절감)
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

    // 미조치 부정리뷰 수 — 1회 조회
    Promise.all([
      getDoc(doc(reviewDb, 'review_states', 'resolved')),
      getDoc(doc(reviewDb, 'review_states', 'overridden')),
    ]).then(([resolvedDoc, overriddenDoc]) => {
      const resolved = resolvedDoc.exists() ? resolvedDoc.data()?.ids || [] : [];
      const overridden = overriddenDoc.exists() ? overriddenDoc.data()?.ids || [] : [];
      getDocs(query(collection(reviewDb, 'reviews'), where('감정분석', '==', '부정'), limit(200))).then(snap => {
        let count = 0;
        snap.forEach(d => { if (!resolved.includes(d.id) && !overridden.includes(d.id)) count++; });
        setUnresolvedReviewsCount(count);
      });
    }).catch(() => setUnresolvedReviewsCount(0));

    // 경쟁사 가격 변동 — 1회 조회
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
      const prevDate = dates.filter(date => date >= weekAgoStr && date < latestDate)[0] || dates[dates.length - 2];
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

    // 인트라넷 데이터 1회 조회
    const todayStr = new Date().toISOString().slice(0, 10);
    Promise.all([
      getDocs(query(collection(salesDb, 'daily_reports'), where('date', '==', todayStr))),
      getDocs(query(collection(salesDb, 'tasks'), where('status', '==', 'pending'))),
      getDocs(query(collection(salesDb, 'leave_requests'), where('status', '==', 'pending'))),
      getDocs(query(collection(salesDb, 'meetings'), orderBy('date', 'desc'), limit(1))),
    ]).then(([dailySnap, taskSnap, leaveSnap, meetingSnap]) => {
      const reports = dailySnap.docs.map(d => d.data());
      setTodayMorning(reports.some(r => r.type === 'morning'));
      setTodayEvening(reports.some(r => r.type === 'evening'));
      setPendingTaskCount(taskSnap.size);
      setPendingLeaveCount(leaveSnap.size);
      if (!meetingSnap.empty) setRecentMeetingTitle(meetingSnap.docs[0].data().title);
    }).catch(() => {});

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
    { label: '원가 계산기', icon: <LayoutDashboard size={18} />, onClick: () => onNavigate('dalbitgo', 'cost') },
    { label: '가맹점 관제', icon: <ShieldAlert size={18} />, onClick: () => onNavigate('dalbitgo', 'review') },
    { label: '식재료 데이터베이스', icon: <Database size={18} />, onClick: () => onNavigate(null, 'database') },
    { label: '매출 현황', icon: <BarChart2 size={18} />, onClick: () => onNavigate('dalbitgo', 'sales') },
  ];

  const todayStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">

      {/* ── 인트라넷 현황 바 ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-black text-stone-800 dark:text-stone-200">
              {greeting()}, <span className="underline decoration-2 underline-offset-4 decoration-stone-300">{currentUser.name}</span>님
            </p>
            <p className="text-[11px] text-stone-400 mt-0.5">{todayStr}</p>
          </div>
          <button onClick={() => onNavigate(null, 'daily')} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-lg hover:opacity-80">
            <ClipboardList size={12} /> 업무보고
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: '오전 업무보고',
              status: todayMorning === null ? '-' : todayMorning ? '제출 완료' : '미제출',
              icon: todayMorning ? <CheckCircle size={14} className="text-emerald-500" /> : <Clock size={14} className="text-amber-500" />,
              cls: todayMorning ? 'border-emerald-200 dark:border-emerald-800' : 'border-amber-200 dark:border-amber-800',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '퇴근 보고',
              status: todayEvening === null ? '-' : todayEvening ? '제출 완료' : '미제출',
              icon: todayEvening ? <CheckCircle size={14} className="text-emerald-500" /> : <Clock size={14} className="text-stone-400" />,
              cls: todayEvening ? 'border-emerald-200 dark:border-emerald-800' : 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '대기 중 업무',
              status: `${pendingTaskCount}건`,
              icon: <Briefcase size={14} className={pendingTaskCount > 0 ? 'text-blue-500' : 'text-stone-400'} />,
              cls: pendingTaskCount > 0 ? 'border-blue-200 dark:border-blue-800' : 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '최근 회의록',
              status: recentMeetingTitle ? recentMeetingTitle.slice(0, 12) + (recentMeetingTitle.length > 12 ? '…' : '') : '-',
              icon: <NotebookPen size={14} className="text-stone-500" />,
              cls: 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate(null, 'meetings'),
            },
          ].map(card => (
            <button key={card.label} onClick={card.onClick}
              className={`flex items-center gap-2 p-3 border rounded-lg bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left ${card.cls}`}>
              {card.icon}
              <div className="min-w-0">
                <p className="text-[10px] text-stone-400 font-bold truncate">{card.label}</p>
                <p className="text-xs font-black text-stone-800 dark:text-stone-200 truncate">{card.status}</p>
              </div>
            </button>
          ))}
        </div>
        {currentUser.role === 'admin' && pendingLeaveCount > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <button onClick={() => onNavigate(null, 'calendar')} className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 hover:underline">
              <Clock size={11} /> 연차 결재 대기 {pendingLeaveCount}건
            </button>
          </div>
        )}
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        <div className="lg:col-span-8 space-y-8">

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

          <section>
            <div className="border-b-2 border-stone-800 dark:border-stone-400 mb-4 pb-2 flex items-center justify-between">
              <h3 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">브랜드 지수 <span className="text-xs text-stone-400 ml-1 tracking-widest font-normal">관제 현황</span></h3>
            </div>
            <div className="border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-200 dark:divide-stone-800 shadow-sm">
              {brands.map((brand) => {
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
