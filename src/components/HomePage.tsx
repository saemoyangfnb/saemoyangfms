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
  currentUser, brands, menus, ingredients, ingredientChanges, onNavigate, onFirestoreError,
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
    const todayStr = new Date().toISOString().slice(0, 10);
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
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">

      {/* ── 인사 + 오늘 상태 ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
              {greeting()}, <span className="underline decoration-2 underline-offset-4 decoration-stone-300">{currentUser.name}</span>님
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{todayLabel}</p>
          </div>
          <button onClick={() => onNavigate(null, 'daily')}
            className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-xl hover:opacity-80">
            <ClipboardList size={13} /> 업무보고 하기
          </button>
        </div>

        {/* 오늘 상태 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            {
              label: '오전 업무보고',
              value: todayMorning === null ? '확인 중' : todayMorning ? '제출 완료' : '미제출',
              icon: todayMorning ? <CheckCircle size={15} className="text-emerald-500" /> : <Clock size={15} className="text-amber-400" />,
              cls: todayMorning ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-amber-200 dark:border-amber-800/50',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '퇴근 보고',
              value: todayEvening === null ? '확인 중' : todayEvening ? '제출 완료' : '미제출',
              icon: todayEvening ? <CheckCircle size={15} className="text-emerald-500" /> : <Clock size={15} className="text-stone-300" />,
              cls: todayEvening ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '대기 중 업무',
              value: `${pendingTaskCount}건`,
              icon: <Briefcase size={15} className={pendingTaskCount > 0 ? 'text-blue-500' : 'text-stone-300'} />,
              cls: pendingTaskCount > 0 ? 'border-blue-200 dark:border-blue-800/50' : 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate(null, 'daily'),
            },
            {
              label: '원가 알림',
              value: alertMenus > 0 ? `${alertMenus}건` : '이상 없음',
              icon: alertMenus > 0 ? <TriangleAlert size={15} className="text-amber-500" /> : <CheckCircle size={15} className="text-emerald-500" />,
              cls: alertMenus > 0 ? 'border-amber-200 dark:border-amber-800/50' : 'border-stone-200 dark:border-stone-700',
              onClick: () => onNavigate('dalbitgo', 'cost'),
            },
          ].map(card => (
            <button key={card.label} onClick={card.onClick}
              className={`flex items-center gap-2 p-3 border rounded-xl bg-stone-50 dark:bg-stone-800/40 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left ${card.cls}`}>
              {card.icon}
              <div className="min-w-0">
                <p className="text-[10px] text-stone-400 font-bold truncate">{card.label}</p>
                <p className="text-xs font-black text-stone-800 dark:text-stone-200 truncate">{card.value}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 인트라넷 + 공지사항 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* 인트라넷 바로가기 */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100 dark:border-stone-800">
            <Sparkles size={15} className="text-stone-400" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">인트라넷</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {intranetMenus.map(m => (
              <button key={m.label} onClick={m.onClick}
                className="relative flex flex-col items-start gap-1.5 p-3 border border-stone-200 dark:border-stone-700 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group">
                <span className="text-stone-500 dark:text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">{m.icon}</span>
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300">{m.label}</span>
                {m.badge && (
                  <span className={`absolute top-2 right-2 text-[9px] font-black text-white px-1.5 py-0.5 rounded-full ${m.badgeCls}`}>{m.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 최신 공지사항 */}
        <div className="lg:col-span-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-stone-400" />
              <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">공지사항</h3>
            </div>
            <button onClick={() => onNavigate(null, 'notice')} className="text-[11px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 flex items-center gap-0.5">
              전체 <ChevronRight size={12} />
            </button>
          </div>
          {latestNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-stone-300 dark:text-stone-700">
              <Megaphone size={28} className="mb-2" />
              <p className="text-xs">등록된 공지사항이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {latestNotices.map(notice => (
                <button key={notice.id} onClick={() => onNavigate(null, 'notice')}
                  className="w-full flex items-start gap-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 rounded-xl px-2 py-2 transition-colors group">
                  {notice.isPinned && <Pin size={11} className="text-stone-400 mt-0.5 shrink-0" />}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${CAT_STYLE[notice.category] ?? CAT_STYLE['전체공지']}`}>
                    {notice.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate group-hover:text-stone-700">{notice.title}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{notice.authorName} · {notice.createdAt.slice(0, 10)}</p>
                  </div>
                  <ChevronRight size={12} className="text-stone-300 shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 브랜드 바로가기 ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100 dark:border-stone-800">
          <Store size={15} className="text-stone-400" />
          <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">브랜드별 업무</h3>
          {alertMenus > 0 && (
            <span className="ml-auto text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <TriangleAlert size={11} /> 원가 알림 {alertMenus}건
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...brands].sort((a, b) => a.order - b.order).filter(b => b.isActive).map(brand => {
            const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
            return (
              <div key={brand.id} className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                {/* 브랜드 헤더 */}
                <button onClick={() => onNavigate(brand.id, 'cost')}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-left">
                  <div className="w-8 h-8 bg-stone-100 dark:bg-stone-800 rounded-lg flex items-center justify-center shrink-0">
                    <Store size={15} className="text-stone-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">{brand.name}</p>
                    <p className="text-[10px] text-stone-400 truncate">{getBrandSlogan(brand.id)}</p>
                  </div>
                  {hasReview && (
                    <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700 px-1.5 py-0.5 rounded-full shrink-0">관제ON</span>
                  )}
                </button>
                {/* 서브메뉴 */}
                <div className="grid grid-cols-3 border-t border-stone-100 dark:border-stone-800 divide-x divide-stone-100 dark:divide-stone-800">
                  {[
                    { label: '원가', icon: <LayoutDashboard size={13} />, section: 'cost' as SidebarSection },
                    { label: '매출', icon: <BarChart2 size={13} />, section: 'sales' as SidebarSection },
                    { label: '관제', icon: <ShieldAlert size={13} />, section: 'review' as SidebarSection, disabled: !hasReview },
                  ].map(sub => (
                    <button key={sub.label}
                      onClick={() => !sub.disabled && onNavigate(brand.id, sub.section)}
                      disabled={sub.disabled}
                      className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${sub.disabled ? 'text-stone-300 dark:text-stone-700 cursor-not-allowed' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50 hover:text-stone-900 dark:hover:text-stone-100'}`}
                    >
                      {sub.icon}{sub.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
