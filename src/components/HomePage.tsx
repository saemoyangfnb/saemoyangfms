import React, { useState, useEffect } from 'react';
import { User, Brand, Menu, Ingredient, IngredientChange, BrandId, SidebarSection, CostTabType, OperationType, Notice } from '../types';
import { checkMenuAlert } from '../utils';
import { salesDb } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
  Store, ShieldAlert, LayoutDashboard, BarChart2,
  CalendarDays, Bell, Sparkles, TriangleAlert, FileText,
  ClipboardList, CheckCircle, Clock, Briefcase, NotebookPen,
  Megaphone, Calendar, Users, ChevronRight, Pin,
} from 'lucide-react';

const REVIEW_ENABLED_BRANDS = ['dalbitgo'];

const CAT_STYLE: Record<string, string> = {
  '긴급':    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '전체공지': 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  '부서공지': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '이벤트':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

export function HomePage({
  currentUser, brands, menus, ingredients, ingredientChanges, onNavigate, onFirestoreError, getSectionPermission,
}: {
  currentUser: User;
  brands: Brand[];
  menus: Menu[];
  ingredients: Ingredient[];
  ingredientChanges: IngredientChange[];
  onNavigate: (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType, reviewTab?: string) => void;
  onFirestoreError: (error: unknown, operationType: OperationType, path: string | null) => void;
  getSectionPermission: (section: SidebarSection) => 'edit' | 'view' | 'none';
}) {
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return '좋은 아침입니다';
    if (h < 18) return '안녕하세요';
    return '수고하셨습니다';
  };

  // 인트라넷 상태
  const [todayMorning, setTodayMorning] = useState<boolean | null>(null);
  const [todayEvening, setTodayEvening] = useState<boolean | null>(null);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [latestNotices, setLatestNotices] = useState<Notice[]>([]);
  const [recentMeetingTitle, setRecentMeetingTitle] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // 가벼운 인트라넷 데이터만 조회
    Promise.all([
      getDocs(query(collection(salesDb, 'daily_reports'), where('date', '==', todayStr))),
      getDocs(query(collection(salesDb, 'tasks'), where('status', '==', 'pending'))),
      getDocs(query(collection(salesDb, 'leave_requests'), where('status', '==', 'pending'))),
      getDocs(query(collection(salesDb, 'notices'), orderBy('createdAt', 'desc'), limit(4))),
      getDocs(query(collection(salesDb, 'meetings'), orderBy('date', 'desc'), limit(1))),
    ]).then(([dailySnap, taskSnap, leaveSnap, noticeSnap, meetingSnap]) => {
      const reports = dailySnap.docs.map(d => d.data());
      setTodayMorning(reports.some(r => r.type === 'morning'));
      setTodayEvening(reports.some(r => r.type === 'evening'));
      setPendingTaskCount(taskSnap.size);
      setPendingLeaveCount(leaveSnap.size);
      setLatestNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
      if (!meetingSnap.empty) setRecentMeetingTitle(meetingSnap.docs[0].data().title);
    }).catch(() => {});
  }, []);

  const alertMenus = menus.filter(m => (m.hasAlert || checkMenuAlert(m, ingredients, menus)) && !m.isArchived).length;
  const todayLabel = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  /* 인트라넷 바로가기 */
  const intranetMenus = [
    { label: '일일 업무보고', icon: <ClipboardList size={18} />, onClick: () => onNavigate(null, 'daily'), badge: (!todayMorning && todayMorning !== null) ? '미제출' : undefined, badgeCls: 'bg-amber-500' },
    { label: '공지사항', icon: <Megaphone size={18} />, onClick: () => onNavigate(null, 'notice') },
    { label: '회의록', icon: <NotebookPen size={18} />, onClick: () => onNavigate(null, 'meetings') },
    { label: '캘린더', icon: <Calendar size={18} />, onClick: () => onNavigate(null, 'calendar'), badge: pendingLeaveCount > 0 ? `연차 ${pendingLeaveCount}` : undefined, badgeCls: 'bg-blue-500' },
    { label: '보고서', icon: <FileText size={18} />, onClick: () => onNavigate(null, 'reports') },
    { label: '직원 명부', icon: <Users size={18} />, onClick: () => onNavigate(null, 'employees') },
  ];

  /* 브랜드별 서브메뉴 */
  const getBrandSlogan = (id: string) => {
    const map: Record<string, string> = {
      dalbitgo: '달빛에 구운 고등어', mansoo: '만수 식당', yams: '얌스',
      bom: '봄초밥여름소바', noeul: '노을에 구운 짚불쭈꾸미',
    };
    return map[id] ?? '프리미엄 외식 브랜드';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-300 pb-16">

      {/* ── 헤더 배너 ── */}
      <div className="relative bg-stone-900 dark:bg-stone-950 rounded-2xl overflow-hidden px-6 py-5">
        {/* 배경 패턴 */}
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '14px 14px' }} />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold text-stone-400 tracking-widest uppercase mb-1">SAEMOYANG F&B · {todayLabel}</p>
            <h2 className="text-xl font-black text-white leading-tight">
              {greeting()},&nbsp;
              <span className="text-stone-300">{currentUser.name}</span>님
            </h2>
          </div>
          <button onClick={() => onNavigate(null, 'daily')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-stone-900 text-xs font-black rounded-xl hover:bg-stone-100 shrink-0 transition-colors">
            <ClipboardList size={14} /> 업무보고
          </button>
        </div>

        {/* 오늘 상태 — 가로 스트립 */}
        <div className="relative mt-4 grid grid-cols-4 gap-2">
          {[
            {
              label: '오전 보고',
              value: todayMorning === null ? '—' : todayMorning ? '완료' : '미제출',
              dot: todayMorning ? 'bg-emerald-400' : 'bg-amber-400',
              ok: !!todayMorning,
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '퇴근 보고',
              value: todayEvening === null ? '—' : todayEvening ? '완료' : '미제출',
              dot: todayEvening ? 'bg-emerald-400' : 'bg-stone-600',
              ok: !!todayEvening,
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '받은 업무',
              value: `${pendingTaskCount}건`,
              dot: pendingTaskCount > 0 ? 'bg-blue-400' : 'bg-stone-600',
              ok: pendingTaskCount === 0,
              onClick: () => onNavigate(null, 'daily'),
            },
            ...(getSectionPermission('cost') !== 'none' ? [{
              label: '원가 알림',
              value: alertMenus > 0 ? `${alertMenus}건` : '정상',
              dot: alertMenus > 0 ? 'bg-amber-400' : 'bg-emerald-400',
              ok: alertMenus === 0,
              onClick: () => onNavigate('dalbitgo', 'cost'),
            }] : []),
          ].map(s => (
            <button key={s.label} onClick={s.onClick}
              className="bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2.5 text-left transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-[10px] font-bold text-stone-400">{s.label}</span>
              </div>
              <p className={`text-sm font-black ${s.ok ? 'text-stone-300' : 'text-white'}`}>{s.value}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── 빠른 이동 + 공지사항 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* 빠른 이동 */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-4">
          <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase mb-3">빠른 이동</p>
          <div className="space-y-1">
            {intranetMenus.map(m => (
              <button key={m.label} onClick={m.onClick}
                className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group text-left">
                <span className="text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors shrink-0">{m.icon}</span>
                <span className="text-sm font-bold text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">{m.label}</span>
                {m.badge && (
                  <span className={`ml-auto text-[9px] font-black text-white px-2 py-0.5 rounded-full ${m.badgeCls}`}>{m.badge}</span>
                )}
                <ChevronRight size={13} className="ml-auto text-stone-300 group-hover:text-stone-500 transition-colors shrink-0" />
              </button>
            ))}
            {recentMeetingTitle && (
              <button onClick={() => onNavigate(null, 'meetings')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group text-left">
                <span className="text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0"><NotebookPen size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">최근 회의록</p>
                  <p className="text-[10px] text-stone-400 truncate">{recentMeetingTitle}</p>
                </div>
                <ChevronRight size={13} className="text-stone-300 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* 공지사항 */}
        <div className="lg:col-span-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase">공지사항</p>
            <button onClick={() => onNavigate(null, 'notice')}
              className="text-[11px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 flex items-center gap-0.5">
              전체 <ChevronRight size={11} />
            </button>
          </div>
          {latestNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-stone-300 dark:text-stone-700">
              <Megaphone size={24} className="mb-2" />
              <p className="text-xs">등록된 공지사항이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1">
              {latestNotices.map(notice => (
                <button key={notice.id} onClick={() => onNavigate(null, 'notice')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group text-left">
                  <div className="flex items-center gap-2 shrink-0">
                    {notice.isPinned && <Pin size={10} className="text-stone-400" />}
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${CAT_STYLE[notice.category] ?? CAT_STYLE['전체공지']}`}>
                      {notice.category}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{notice.title}</p>
                    <p className="text-[10px] text-stone-400">{notice.authorName} · {notice.createdAt.slice(5, 10)}</p>
                  </div>
                  <ChevronRight size={12} className="text-stone-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 브랜드 업무 ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase">브랜드 업무</p>
          {alertMenus > 0 && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <TriangleAlert size={10} /> 원가 알림 {alertMenus}건
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {[...brands].sort((a, b) => a.order - b.order).filter(b => b.isActive).map(brand => {
            const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
            const allBrandSubs = [
              { label: '원가', icon: <LayoutDashboard size={12} />, section: 'cost' as SidebarSection },
              { label: '매출', icon: <BarChart2 size={12} />, section: 'sales' as SidebarSection },
              { label: '관제', icon: <ShieldAlert size={12} />, section: 'review' as SidebarSection, reviewOnly: true },
              { label: '오픈일정', icon: <CalendarDays size={12} />, section: 'franchise' as SidebarSection },
              { label: '마케팅', icon: <Sparkles size={12} />, section: 'marketing' as SidebarSection },
            ];
            const visibleSubs = allBrandSubs.filter(sub => {
              if (sub.reviewOnly && !hasReview) return false;
              return getSectionPermission(sub.section) !== 'none';
            });
            const firstSub = visibleSubs[0];
            return (
              <div key={brand.id} className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => firstSub && onNavigate(brand.id, firstSub.section)}
                  disabled={!firstSub}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-left disabled:opacity-50">
                  <div className="w-7 h-7 bg-stone-900 dark:bg-stone-700 rounded-lg flex items-center justify-center shrink-0">
                    <Store size={13} className="text-stone-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">{brand.name}</p>
                    <p className="text-[10px] text-stone-400 truncate">{getBrandSlogan(brand.id)}</p>
                  </div>
                  {hasReview && getSectionPermission('review') !== 'none' && (
                    <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded shrink-0">관제</span>
                  )}
                </button>
                {visibleSubs.length > 0 ? (
                  <div className="grid border-t border-stone-100 dark:border-stone-800 divide-x divide-stone-100 dark:divide-stone-800"
                    style={{ gridTemplateColumns: `repeat(${Math.min(visibleSubs.length, 5)}, minmax(0, 1fr))` }}>
                    {visibleSubs.map(sub => (
                      <button key={sub.label}
                        onClick={() => onNavigate(brand.id, sub.section)}
                        className="flex flex-col items-center gap-1 py-2 text-[10px] font-bold text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
                        {sub.icon}{sub.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-800 text-[10px] text-stone-400 text-center">
                    접근 가능한 메뉴 없음
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
