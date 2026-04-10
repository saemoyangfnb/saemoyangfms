/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Menu, MenuCategory, Ingredient, Region, RecipeItem, User, IngredientChange, BrandId, Brand, DEFAULT_BRANDS, SalesRecord } from './types';
import { MenuTable } from './components/MenuTable';
import { OverviewTable } from './components/OverviewTable';
import { MenuModal } from './components/MenuModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { RecipeModal } from './components/RecipeModal';
import { ArchiveView } from './components/ArchiveView';
import { IngredientChangeView } from './components/IngredientChangeView';
import { DatabaseView } from './components/DatabaseView';
import { Auth, ChangePasswordModal } from './components/Auth';
import { AdminPanel } from './components/AdminPanel';
import { ReviewDashboard } from './components/ReviewDashboard';
import { AgentsDashboard } from './components/AgentsDashboard';
import { StoreManagement } from './components/StoreManagement';
import { MarketingDashboard } from './components/marketing';
import { SalesDashboard } from './components/sales/SalesDashboard';
import { FranchiseScheduleView } from './components/franchise';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmModal';
import {
  Plus, Download, LogOut, KeyRound, Sun, Moon,
  Archive, AlertTriangle, Trash2, X, ChevronLeft, ChevronRight,
  ChevronDown, LayoutDashboard, Database, Settings,
  BarChart2, Edit2, Check, Store, TrendingUp, ShieldAlert,
  ArrowRight, Bell, Menu as MenuIcon, TriangleAlert, Bot, CalendarDays
} from 'lucide-react';
import Papa from 'papaparse';
import { calculateTotalCost, formatPercent, doesMenuContainIngredient } from './utils';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc, getDoc, collection, onSnapshot, setDoc, updateDoc,
  deleteDoc, writeBatch, query, where, deleteField
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete',
  LIST = 'list', GET = 'get', WRITE = 'write',
}

type CostTabType = Region | '전체보기' | '메뉴 관리' | '변동사항';
type SidebarSection = 'cost' | 'sales' | 'database' | 'admin' | 'review' | 'home' | 'agents' | 'stores' | 'marketing' | 'franchise';

interface SidebarState {
  brandId: BrandId | null;
  section: SidebarSection;
  costTab: CostTabType;
}

// 가맹점 관제 데이터가 있는 브랜드 (크롤러 연동 완료)
const REVIEW_ENABLED_BRANDS = ['dalbitgo'];

// ==========================================
// 랜딩 페이지 컴포넌트
// ==========================================
function HomePage({
  currentUser,
  brands,
  menus,
  ingredients,
  ingredientChanges,
  onNavigate,
}: {
  currentUser: User;
  brands: Brand[];
  menus: Menu[];
  ingredients: Ingredient[];
  ingredientChanges: IngredientChange[];
  onNavigate: (brandId: BrandId | null, section: SidebarSection) => void;
}) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침입니다';
    if (hour < 18) return '안녕하세요';
    return '수고하셨습니다';
  };

  const totalMenus = menus.filter(m => !m.isArchived).length;
  const totalIngredients = ingredients.filter(i => !i.isArchived).length;
  const alertMenus = menus.filter(m => m.hasAlert && !m.isArchived).length;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentChanges = ingredientChanges.filter(c => new Date(c.timestamp) >= sevenDaysAgo).length;

  const kpiCards = [
    {
      label: '등록 메뉴',
      value: totalMenus,
      unit: '개',
      icon: <LayoutDashboard size={16} />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => onNavigate('dalbitgo', 'cost'),
    },
    {
      label: '식재료',
      value: totalIngredients,
      unit: '종',
      icon: <Database size={16} />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      onClick: () => onNavigate(null, 'database'),
    },
    {
      label: '원가 알림',
      value: alertMenus,
      unit: '건',
      icon: <TriangleAlert size={16} />,
      color: alertMenus > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500',
      bg: alertMenus > 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-800',
      onClick: () => onNavigate('dalbitgo', 'cost'),
      highlight: alertMenus > 0,
    },
    {
      label: '최근 7일 변동',
      value: recentChanges,
      unit: '건',
      icon: <TrendingUp size={16} />,
      color: recentChanges > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500',
      bg: recentChanges > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-800',
      onClick: () => onNavigate(null, 'database'),
    },
  ];

  const quickMenus = [
    {
      label: '원가 계산기',
      desc: '달빛에구운고등어 메뉴별 원가 및 마진 관리',
      icon: <LayoutDashboard size={22} className="text-blue-500" />,
      color: 'border-blue-100 dark:border-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => onNavigate('dalbitgo', 'cost'),
    },
    {
      label: '가맹점 관제',
      desc: '리뷰 수집 · 네이버 순위 · 경쟁사 모니터링',
      icon: <ShieldAlert size={22} className="text-rose-500" />,
      color: 'border-rose-100 dark:border-rose-900/40 hover:border-rose-300 dark:hover:border-rose-700',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      onClick: () => onNavigate('dalbitgo', 'review'),
    },
    {
      label: '식재료 데이터베이스',
      desc: '전 브랜드 공유 식재료 원가 및 변동 관리',
      icon: <Database size={22} className="text-emerald-500" />,
      color: 'border-emerald-100 dark:border-emerald-900/40 hover:border-emerald-300 dark:hover:border-emerald-700',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      onClick: () => onNavigate(null, 'database'),
    },
    {
      label: '매출 현황',
      desc: '브랜드별 매출 현황 분석 (준비 중)',
      icon: <TrendingUp size={22} className="text-amber-500" />,
      color: 'border-amber-100 dark:border-amber-900/40 hover:border-amber-300 dark:hover:border-amber-700',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      onClick: () => onNavigate('dalbitgo', 'sales'),
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* 인사말 */}
      <div className="pt-4">
        <p className="text-sm text-slate-400 dark:text-slate-500">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
          {greeting()}, <span className="text-slate-600 dark:text-slate-300">{currentUser.name}</span>님
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">새모양 F&B 가맹관리시스템에 오신 것을 환영합니다.</p>
      </div>

      {/* KPI 카드 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">현황</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpiCards.map(card => (
            <button
              key={card.label}
              onClick={card.onClick}
              className={`flex flex-col items-start p-4 bg-white dark:bg-slate-900 rounded-xl border transition-all text-left shadow-sm hover:shadow-md ${
                card.highlight
                  ? 'border-rose-200 dark:border-rose-800'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg mb-3 ${card.bg}`}>
                <span className={card.color}>{card.icon}</span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>
                {card.value}<span className="text-sm font-medium ml-0.5">{card.unit}</span>
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">빠른 메뉴</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickMenus.map(item => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border ${item.color} transition-all text-left shadow-sm hover:shadow-md group`}
            >
              <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${item.bg} shrink-0`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{item.desc}</p>
              </div>
              <ArrowRight size={15} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* 브랜드 현황 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">브랜드 현황</h2>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {brands.map(brand => {
              const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
              return (
                <div key={brand.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                    <Store size={15} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{brand.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {hasReview ? '원가 계산기 · 가맹점 관제' : '원가 계산기 · 가맹점 관제 준비 중'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasReview ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">운영중</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">준비중</span>
                    )}
                    <button
                      onClick={() => onNavigate(brand.id, 'cost')}
                      className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      바로가기 →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 시스템 안내 */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-start gap-3">
          <Bell size={15} className="text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">시스템 안내</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              가맹점 리뷰 수집은 매일 오전 6시 자동 실행됩니다. 주간 리포트는 매주 월요일 오전 7시에 생성됩니다. 문의사항은 관리자에게 연락해 주세요.
            </p>
          </div>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [brands, setBrands] = useState<Brand[]>(DEFAULT_BRANDS);
  const [expandedBrands, setExpandedBrands] = useState<Set<BrandId>>(new Set(['dalbitgo']));
  const [sidebar, setSidebar] = useState<SidebarState>({
    brandId: null,
    section: 'home',
    costTab: '수도권',
  });

  const [editingBrandId, setEditingBrandId] = useState<BrandId | null>(null);
  const [editingBrandName, setEditingBrandName] = useState('');
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
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user && user.emailVerified) {
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
    const unsubscribe = onSnapshot(collection(db, 'brands'), (snapshot) => {
      if (snapshot.empty) {
        DEFAULT_BRANDS.forEach(brand => { setDoc(doc(db, 'brands', brand.id), brand); });
        setBrands(DEFAULT_BRANDS);
      } else {
        const data: Brand[] = [];
        snapshot.forEach(d => data.push(d.data() as Brand));
        setBrands(data.sort((a, b) => a.order - b.order));
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || (!currentUser.isApproved && currentUser.role !== 'admin')) return;

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
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setThresholdType(currentUser.alertThresholdType || 'absolute');
      setThresholdValue(currentUser.alertThresholdValue ?? 0.01);
    }
  }, [currentUser]);

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

  const navigateTo = (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType) => {
    setSidebar({ brandId, section, costTab: costTab || '수도권' });
    if (brandId && !expandedBrands.has(brandId)) {
      setExpandedBrands(prev => new Set([...prev, brandId]));
    }
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
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, `menus/${menu.id}`); }
  };

  const handleArchiveMenu = async (id: string) => {
    const ok = await confirm({ title: '메뉴 보관', message: '메뉴를 보관함으로 이동하시겠습니까?', confirmLabel: '보관', variant: 'warning' });
    if (!ok) return;
    try { await updateDoc(doc(db, 'menus', id), { isArchived: true }); }
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

  // 브랜드별 사이드바 서브메뉴 — 사용자 정의 순서 반영
  const DEFAULT_SUB_MENUS = [
    { id: 'cost' as SidebarSection, label: '원가 계산기', icon: <LayoutDashboard size={14} /> },
    { id: 'sales' as SidebarSection, label: '매출 현황', icon: <BarChart2 size={14} /> },
    { id: 'review' as SidebarSection, label: '가맹점 관제', icon: <ShieldAlert size={14} /> },
    { id: 'franchise' as SidebarSection, label: '오픈 일정', icon: <CalendarDays size={14} /> },
    { id: 'marketing' as SidebarSection, label: '마케팅 봇', icon: <Bot size={14} /> },
  ];

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

  const navigateAndCloseMobile = (brandId: BrandId | null, section: SidebarSection, costTab?: CostTabType) => {
    navigateTo(brandId, section, costTab);
    if (isMobile) setMobileSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex text-slate-900 dark:text-slate-100">
      {renderGlobalError()}

      {/* 모바일 사이드바 오버레이 배경 */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* 모바일 햄버거 버튼 */}
      {isMobile && !mobileSidebarOpen && (
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="fixed top-3 left-3 z-40 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md text-slate-600 dark:text-slate-300"
        >
          <MenuIcon size={18} />
        </button>
      )}

      {/* 사이드바 */}
      <aside className={`${
        isMobile
          ? `fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : `${sidebarCollapsed ? 'w-14' : 'w-60'} transition-all duration-300 sticky top-0 h-screen shrink-0`
      } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col`}>

        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200 dark:border-slate-800">
          {(!sidebarCollapsed || isMobile) && (
            <button
              onClick={() => {
                setSidebar({ brandId: null, section: 'home', costTab: '수도권' });
                if (isMobile) setMobileSidebarOpen(false);
              }}
              className="font-bold text-sm text-slate-900 dark:text-white tracking-tight hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              가맹관리시스템
            </button>
          )}
          {!isMobile && (
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 ml-auto">
              {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
          )}
          {isMobile && (
            <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 ml-auto">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">

          {(!sidebarCollapsed || isMobile) && (
            <div className="px-3 mb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">브랜드</p>
            </div>
          )}

          {[...brands].sort((a, b) => a.order - b.order).map(brand => {
            const isExpanded = expandedBrands.has(brand.id);
            const isActiveBrand = sidebar.brandId === brand.id;
            const subMenus = getBrandSubMenus(brand.id);
            const hasReview = REVIEW_ENABLED_BRANDS.includes(brand.id);
            const isDragOver = dragOverBrandId === brand.id;
            const menuOrderForUser = currentUser?.menuOrder || DEFAULT_SUB_MENUS.map(m => m.id);

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
                <div className={`flex items-center gap-1 mx-2 rounded-md px-1 py-1.5 group ${isActiveBrand ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} ${currentUser.role === 'admin' && !sidebarCollapsed ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                  {!sidebarCollapsed && (
                    <button onClick={() => toggleBrandExpand(brand.id)} className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" onMouseDown={e => e.stopPropagation()}>
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
                      onClick={() => navigateTo(brand.id, 'cost')}
                      className={`flex-1 text-left text-xs font-medium truncate ${isActiveBrand ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
                      title={sidebarCollapsed ? brand.name : undefined}
                    >
                      {sidebarCollapsed ? brand.name[0] : brand.name}
                    </button>
                  )}

                  {!sidebarCollapsed && currentUser.role === 'admin' && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button onClick={() => { setEditingBrandId(brand.id); setEditingBrandName(brand.name); }} className="p-0.5 text-slate-400 hover:text-blue-600 rounded" onMouseDown={e => e.stopPropagation()}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={() => handleDeleteBrand(brand.id)} className="p-0.5 text-slate-400 hover:text-rose-600 rounded" onMouseDown={e => e.stopPropagation()}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (!sidebarCollapsed || isMobile) && (
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
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group/sub ${
                              isActive
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500 pl-1.5'
                                : isDisabled
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span className="opacity-30 group-hover/sub:opacity-60 cursor-grab text-[9px]">⠿</span>
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

          <div className="my-3 mx-3 border-t border-slate-200 dark:border-slate-800" />

          {(!sidebarCollapsed || isMobile) && (
            <div className="px-3 mb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">공통</p>
            </div>
          )}

          <div className="mx-2 space-y-0.5">
            <button
              onClick={() => navigateAndCloseMobile(null, 'database')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                sidebar.section === 'database' && sidebar.brandId === null
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500 pl-1.5'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database size={14} />
              {(!sidebarCollapsed || isMobile) && '식재료 데이터베이스'}
            </button>
            <button
              onClick={() => navigateAndCloseMobile(null, 'agents')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                sidebar.section === 'agents'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500 pl-1.5'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bot size={15} />
              {(!sidebarCollapsed || isMobile) && '에이전트 팀'}
            </button>
            {currentUser.role === 'admin' && (
              <button
                onClick={() => navigateAndCloseMobile(null, 'admin')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  sidebar.section === 'admin'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500 pl-1.5'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Settings size={14} />
                {(!sidebarCollapsed || isMobile) && '관리자'}
              </button>
            )}
          </div>
        </div>

        <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800">
          <div className={`flex items-center ${(sidebarCollapsed && !isMobile) ? 'justify-center' : 'justify-between'} gap-2`}>
            {(!sidebarCollapsed || isMobile) && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{currentUser.name}</span>
                <span className="text-[10px] text-slate-400">{currentUser.role === 'admin' ? '관리자' : '사용자'}</span>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={toggleTheme} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="테마">
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              </button>
              <button onClick={() => setIsChangePasswordOpen(true)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="비밀번호 변경">
                <KeyRound size={14} />
              </button>
              <button onClick={handleLogout} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="로그아웃">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        <div className={`max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 ${isMobile ? 'pt-14' : ''}`}>

          {/* 홈 (랜딩) */}
          {sidebar.section === 'home' && (
            <HomePage
              currentUser={currentUser}
              brands={brands}
              menus={menus}
              ingredients={ingredients}
              ingredientChanges={ingredientChanges}
              onNavigate={navigateTo}
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
              <AdminPanel onFirestoreError={handleFirestoreError} ingredients={ingredients} />
            </>
          )}

          {/* 에이전트 팀 */}
          {sidebar.section === 'agents' && <AgentsDashboard />}

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
                    <ReviewDashboard />
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
              {sidebar.section === 'franchise' && sidebar.brandId && (
                <FranchiseScheduleView brandId={sidebar.brandId} />
              )}

              {/* 마케팅 봇 */}
              {sidebar.section === 'marketing' && sidebar.brandId && (
                <MarketingDashboard activeBrand={sidebar.brandId} />
              )}

              {/* 매출 현황 */}
              {sidebar.section === 'sales' && sidebar.brandId && (
                <SalesDashboard activeBrand={sidebar.brandId} />
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
                      <OverviewTable menus={activeMenus} menuCategories={brandCategories} ingredients={brandIngredients} isAdmin={currentUser.role === 'admin'} visibleColumns={visibleColumns} onAcknowledgeAlert={handleAcknowledgeAlert} onNavigateToTab={(tab) => setSidebar(prev => ({ ...prev, costTab: tab as CostTabType }))} onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))} />
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
                      <MenuTable menus={activeMenus} menuCategories={brandCategories} ingredients={brandIngredients} region={sidebar.costTab as Region} visibleColumns={visibleColumns} onEditMenu={(menu) => { setEditingMenu(menu); setIsMenuModalOpen(true); }} onArchiveMenu={handleArchiveMenu} onEditRecipe={(menu) => { setRecipeMenu(menu); setIsRecipeModalOpen(true); }} isAdmin={currentUser.role === 'admin'} onAcknowledgeAlert={handleAcknowledgeAlert} onNavigateToTab={(tab) => setSidebar(prev => ({ ...prev, costTab: tab as CostTabType }))} onReorderMenu={handleReorderMenu} onToggleMenuVisibility={handleToggleMenuVisibility} onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))} />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* 모달 */}
      {isCategoryModalOpen && <CategoryManagementModal categories={brandCategories} onSave={handleSaveCategories} onClose={() => setIsCategoryModalOpen(false)} />}
      {isMenuModalOpen && <MenuModal menu={editingMenu} menuCategories={brandCategories} onSave={handleSaveMenu} onClose={() => { setIsMenuModalOpen(false); setEditingMenu(undefined); }} onArchive={handleArchiveMenu} onDelete={handleDeleteMenu} />}
      {isRecipeModalOpen && recipeMenu && <RecipeModal menu={recipeMenu} ingredients={brandIngredients} menus={brandMenus} onSave={handleSaveRecipe} onClose={() => { setIsRecipeModalOpen(false); setRecipeMenu(null); }} />}
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
