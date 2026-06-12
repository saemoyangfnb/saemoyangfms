import React, { useState, useCallback } from 'react';
import { Menu, Ingredient, Region, MenuCategory, RecipeItem } from '../types';
import { calculateTotalCost, formatCurrency, formatPercent, checkMenuAlert, hasMissingIngredients } from '../utils';
import {
  AlertCircle, EyeOff, TrendingUp, TrendingDown,
  ChefHat, LayoutGrid, Table as TableIcon, FlaskConical,
  ChevronDown, ChevronUp, Plus, Trash2, Search, X, Copy, BookOpen, RotateCcw, Save,
} from 'lucide-react';

interface Props {
  menus: Menu[];
  menuCategories: MenuCategory[];
  ingredients: Ingredient[];
  isAdmin?: boolean;
  visibleColumns: {
    cost: boolean;
    margin: boolean;
    costRate: boolean;
    marginRate: boolean;
  };
  onAcknowledgeAlert?: (menuId: string) => void;
  onNavigateToTab: (tab: string) => void;
  onToggleColumn: (column: keyof Props['visibleColumns']) => void;
  onSaveRecipe?: (menuId: string, recipe: RecipeItem[], notes: string) => void;
  onDuplicateMenu?: (menuId: string) => void;
  onBulkSavePrices?: (updates: Array<{ menuId: string; prices: Partial<Record<string, number>> }>) => Promise<void>;
}

const regions: Region[] = ['지방권', '광역권', '수도권'];

function rateColor(rate: number) {
  if (rate > 0 && rate < 0.4) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' };
  if (rate >= 0.4 && rate <= 0.42) return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-400' };
  return { text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' };
}

function CostRateBar({ rate, showPct = true }: { rate: number; showPct?: boolean }) {
  const { text, bar } = rateColor(rate);
  return (
    <div className="flex items-center gap-1.5 min-w-[90px]">
      {showPct && <span className={`text-xs font-bold ${text} w-10 text-right shrink-0`}>{formatPercent(rate)}</span>}
      <div className="flex-1 h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden min-w-[36px]">
        <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${Math.min((rate / 0.6) * 100, 100)}%` }} />
      </div>
    </div>
  );
}

const InlineRecipeEditor = ({ menu, ingredients, allMenus, onSave, onClose }: {
  menu: Menu; ingredients: Ingredient[]; allMenus: Menu[];
  onSave: (id: string, recipe: RecipeItem[], notes: string) => void;
  onClose: () => void;
}) => {
  const [recipe, setRecipe] = useState<RecipeItem[]>(menu.recipe);
  const [activeTab, setActiveTab] = useState<'ingredient' | 'menu' | 'custom'>('ingredient');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [yieldRate, setYieldRate] = useState<number>(100);
  const [customName, setCustomName] = useState('');
  const [customCost, setCustomCost] = useState<number>(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const filteredItems = activeTab === 'ingredient'
    ? ingredients.filter(ing => !ing.isArchived && ing.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allMenus.filter(m => !m.isArchived && m.id !== menu.id && m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedItemName = activeTab === 'ingredient'
    ? ingredients.find(i => i.id === selectedId)?.name
    : allMenus.find(m => m.id === selectedId)?.name;

  const handleAdd = () => {
    const clampedYield = Math.min(100, Math.max(1, yieldRate));
    if (activeTab === 'ingredient' || activeTab === 'menu') {
      if (!selectedId || quantity <= 0) return;
      const existing = recipe.find(item => item.type === activeTab && (item.ingredientId === selectedId || item.menuId === selectedId));
      if (existing) {
        setRecipe(recipe.map(item => (item.ingredientId === selectedId || item.menuId === selectedId) ? { ...item, quantity: item.quantity + quantity, yieldRate: clampedYield } : item));
      } else {
        setRecipe([...recipe, activeTab === 'ingredient' ? { type: 'ingredient', ingredientId: selectedId, quantity, yieldRate: clampedYield } : { type: 'menu', menuId: selectedId, quantity, yieldRate: clampedYield }]);
      }
    } else {
      if (!customName.trim() || quantity <= 0) return;
      setRecipe([...recipe, { type: 'custom', customName: customName.trim(), customCost, customUnit: 'ea', quantity, yieldRate: clampedYield }]);
      setCustomName(''); setCustomCost(0);
    }
    setSelectedId(''); setQuantity(1); setYieldRate(100); setIsDropdownOpen(false); setSearchQuery('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">레시피 상세 및 수정</h4>
        <span className="text-xs font-bold text-rose-500 dark:text-rose-400">총 원가: {formatCurrency(calculateTotalCost(recipe, ingredients, allMenus))}</span>
      </div>
      <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
        {recipe.length === 0 ? (
          <div className="text-xs text-center py-4 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">등록된 레시피 항목이 없습니다.</div>
        ) : (
          recipe.map((item, index) => {
            let name = ''; let unitPrice = 0; let unit = ''; let isMissing = false;
            if (item.type === 'menu') {
              const m = allMenus.find(x => x.id === item.menuId);
              if (m) { name = m.name; unitPrice = calculateTotalCost(m.recipe, ingredients, allMenus); unit = 'ea'; } else { name = '삭제된 메뉴'; isMissing = true; }
            } else if (item.type === 'custom') {
              name = item.customName || '직접 등록'; unitPrice = item.customCost || 0; unit = item.customUnit || 'ea';
            } else {
              const ing = ingredients.find(i => i.id === item.ingredientId);
              if (ing) { name = ing.name; unitPrice = ing.unitSalesPrice || 0; unit = ing.unit; } else { name = '삭제된 식자재'; isMissing = true; }
            }
            const yr = item.yieldRate ?? 100;
            const cost = yr > 0 ? (unitPrice * item.quantity) / (yr / 100) : unitPrice * item.quantity;
            return (
              <div key={index} className="flex flex-col gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate pr-2">{isMissing ? `(누락) ${name}` : name}</span>
                  <button onClick={() => setRecipe(recipe.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 w-10 truncate">{formatCurrency(unitPrice)}</span>
                  <input type="number" min="0.1" step="0.1" value={item.quantity} onChange={e => setRecipe(recipe.map((r, i) => i === index ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r))} className="w-12 text-right px-1 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none" />
                  <span className="text-slate-400 w-5">{unit}</span>
                  <input type="number" min="1" max="100" step="1" value={item.yieldRate ?? 100} onChange={e => setRecipe(recipe.map((r, i) => i === index ? { ...r, yieldRate: parseFloat(e.target.value) || 100 } : r))} className="w-10 text-right px-1 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none" />
                  <span className="text-slate-400">%</span>
                  <span className="ml-auto font-bold text-slate-800 dark:text-slate-200">{formatCurrency(cost)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
        <div className="flex gap-1 mb-2">
          {[{ id: 'ingredient', label: '식자재' }, { id: 'menu', label: '기존 메뉴' }, { id: 'custom', label: '직접입력' }].map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id as any); setSelectedId(''); setSearchQuery(''); }} className={`flex-1 text-[10px] py-1 rounded font-bold transition-colors ${activeTab === t.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-2 relative">
          {activeTab !== 'custom' ? (
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder={selectedItemName || '항목 검색...'} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500" />
              {isDropdownOpen && (
                <div className="absolute z-[60] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg max-h-40 overflow-y-auto">
                  {filteredItems.map(item => <button key={item.id} onClick={() => { setSelectedId(item.id); setIsDropdownOpen(false); setSearchQuery(''); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 truncate">{item.name}</button>)}
                  {filteredItems.length === 0 && <div className="px-2 py-2 text-xs text-slate-400 text-center">결과 없음</div>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input type="text" placeholder="항목명" value={customName} onChange={e => setCustomName(e.target.value)} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
              <input type="number" placeholder="단가" value={customCost || ''} onChange={e => setCustomCost(parseFloat(e.target.value))} className="w-16 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
            </div>
          )}
          <div className="flex gap-1.5">
            <input type="number" min="0.1" step="0.1" placeholder="수량" value={quantity || ''} onChange={e => setQuantity(parseFloat(e.target.value))} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
            <input type="number" min="1" max="100" step="1" placeholder="수율" value={yieldRate || ''} onChange={e => setYieldRate(parseFloat(e.target.value))} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
            <button onClick={handleAdd} disabled={activeTab === 'custom' ? !customName.trim() : !selectedId} className="px-2 bg-slate-800 dark:bg-blue-600 text-white rounded text-xs font-bold disabled:opacity-50"><Plus size={14} /></button>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className="flex-1 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors">닫기</button>
        <button onClick={() => onSave(menu.id, recipe, menu.notes || '')} className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">변경사항 저장</button>
      </div>
    </div>
  );
};

export const OverviewTable: React.FC<Props> = ({
  menus,
  menuCategories,
  ingredients,
  isAdmin,
  visibleColumns,
  onAcknowledgeAlert,
  onNavigateToTab,
  onToggleColumn,
  onSaveRecipe,
  onDuplicateMenu,
  onBulkSavePrices,
}) => {
  const [viewMode, setViewMode] = useState<'card' | 'table' | 'sim'>('table');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeModalMenuId, setRecipeModalMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // simPrices: menuId → { region → price }
  const [simPrices, setSimPrices] = useState<Record<string, Partial<Record<Region, number>>>>({});
  const [simSaving, setSimSaving] = useState(false);

  const makeFreshSimPrices = useCallback(() => {
    const p: Record<string, Partial<Record<Region, number>>> = {};
    menus.forEach(m => { p[m.id] = { ...m.prices } as Record<Region, number>; });
    return p;
  }, [menus]);

  const enterSim = () => {
    setSimPrices(makeFreshSimPrices());
    setViewMode('sim');
  };

  const resetSim = () => setSimPrices(makeFreshSimPrices());

  const updateSimPrice = (menuId: string, region: Region, value: number) => {
    setSimPrices(prev => ({ ...prev, [menuId]: { ...(prev[menuId] || {}), [region]: value } }));
  };

  const changedMenuIds = Object.entries(simPrices).filter(([menuId, prices]) => {
    const orig = menus.find(m => m.id === menuId)?.prices;
    return regions.some(r => (prices[r] ?? 0) !== (orig?.[r] ?? 0));
  }).map(([id]) => id);

  const handleApplySim = async () => {
    if (!onBulkSavePrices || changedMenuIds.length === 0) return;
    setSimSaving(true);
    try {
      const updates = changedMenuIds.map(menuId => ({
        menuId,
        prices: simPrices[menuId] as Record<string, number>,
      }));
      await onBulkSavePrices(updates);
    } finally {
      setSimSaving(false);
    }
  };

  const filteredMenus = menus.filter(m => {
    const matchesSearch = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'all' || m.categoryId === categoryFilter || (categoryFilter === '__none' && !m.categoryId);
    return matchesSearch && matchesCat;
  });

  const groupedMenus = menuCategories.map(cat => ({
    category: cat,
    menus: filteredMenus.filter(m => m.categoryId === cat.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
  }));
  const uncategorized = filteredMenus.filter(m => !m.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (uncategorized.length > 0) groupedMenus.push({ category: { id: '__none', name: '미분류', order: 999, isVisible: true }, menus: uncategorized });

  // sim view uses all menus (no search filter applied)
  const simGroupedMenus = menuCategories.map(cat => ({
    category: cat,
    menus: menus.filter(m => m.categoryId === cat.id && !m.isArchived && m.isVisible !== false).sort((a, b) => (a.order || 0) - (b.order || 0)),
  }));
  const simUncategorized = menus.filter(m => !m.categoryId && !m.isArchived && m.isVisible !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (simUncategorized.length > 0) simGroupedMenus.push({ category: { id: '__none', name: '미분류', order: 999, isVisible: true }, menus: simUncategorized });

  const visibleGroupCount = groupedMenus.filter(g => (g.category.isVisible || isAdmin) && g.menus.length > 0).length;

  return (
    <div className="p-4 sm:p-6 bg-stone-100 dark:bg-stone-950 space-y-6">

      {/* 툴바 */}
      {viewMode !== 'sim' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* 뷰 토글 */}
            <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700 shrink-0">
              <button onClick={() => setViewMode('card')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-bold transition-all ${viewMode === 'card' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}>
                <LayoutGrid size={15} /> 카드형
              </button>
              <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}>
                <TableIcon size={15} /> 표 보기
              </button>
            </div>
            {/* 검색 */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input type="text" placeholder="메뉴 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-8 py-2 text-sm border border-stone-300 dark:border-stone-700 rounded-sm bg-white dark:bg-stone-900 text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:border-stone-600 dark:focus:border-stone-400" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"><X size={14} /></button>}
            </div>
            {/* 시뮬레이션 진입 버튼 */}
            <button onClick={enterSim} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-sm text-sm font-bold hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors shrink-0">
              <FlaskConical size={15} /> 가격 시뮬레이션
            </button>
          </div>
          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCategoryFilter('all')} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${categoryFilter === 'all' ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-700'}`}>
              전체 <span className="opacity-50">{menus.length}</span>
            </button>
            {menuCategories.filter(c => c.isVisible || isAdmin).map(c => {
              const count = menus.filter(m => m.categoryId === c.id).length;
              return (
                <button key={c.id} onClick={() => setCategoryFilter(c.id)} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${categoryFilter === c.id ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-700'}`}>
                  {c.name} <span className="opacity-50">{count}</span>
                  {!c.isVisible && isAdmin && <span className="ml-1 opacity-40">(숨김)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 검색 결과 없음 */}
      {viewMode !== 'sim' && searchQuery && visibleGroupCount === 0 && (
        <div className="py-12 text-center text-stone-400">
          <Search size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">'{searchQuery}'에 해당하는 메뉴가 없습니다.</p>
        </div>
      )}

      {/* ═══ 카드 뷰 ═══ */}
      {viewMode === 'card' && (
        <div className="space-y-10">
          {groupedMenus.map(group => {
            if (!group.category.isVisible && !isAdmin) return null;
            if (group.menus.length === 0) return null;
            return (
              <section key={group.category.id || 'uncategorized'}>
                <div className="flex items-center gap-3 mb-6 border-b-2 border-stone-800 dark:border-stone-400 pb-3">
                  <h3 className="text-xl font-black text-stone-900 dark:text-stone-100">{group.category.name}</h3>
                  {!group.category.isVisible && <span className="text-[10px] font-bold bg-stone-200 dark:bg-stone-800 text-stone-500 px-2 py-1 rounded-sm">숨김 카테고리</span>}
                  <span className="text-sm font-medium text-stone-500 ml-auto">{group.menus.length}개 메뉴</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {group.menus.map(menu => {
                    if (menu.isVisible === false && !isAdmin) return null;
                    const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                    const hasAlert = menu.hasAlert || checkMenuAlert(menu, ingredients, menus);
                    const missing = hasMissingIngredients(menu.recipe, ingredients, menus);
                    return (
                      <div key={menu.id} className={`group relative flex flex-col bg-[#FDFBF7] dark:bg-stone-900 rounded-sm p-6 border transition-all hover:-translate-y-1 hover:shadow-md ${hasAlert ? 'border-rose-800 dark:border-rose-600' : 'border-stone-300 dark:border-stone-700 hover:border-stone-800 dark:hover:border-stone-400'}`}>
                        {hasAlert && (
                          <div className="absolute -top-3 -right-3">
                            <button onClick={() => onNavigateToTab('변동사항')} className="flex items-center gap-1 bg-rose-800 dark:bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-sm shadow-md animate-bounce hover:bg-rose-900 transition-colors">
                              <AlertCircle size={14} />{missing ? '식재료 누락!' : '원가 변동!'}
                            </button>
                          </div>
                        )}
                        {menu.isVisible === false && <div className="absolute -top-3 -left-3 bg-stone-700 text-white text-[10px] font-bold px-2 py-1 rounded-sm shadow">숨김</div>}
                        <div className="mb-5 flex-1">
                          <h4 className="text-xl font-black text-stone-900 dark:text-white leading-tight pr-4 tracking-tight">{menu.name}</h4>
                        </div>
                        <div className="flex justify-between items-center bg-white dark:bg-stone-800/50 px-4 py-3 rounded-sm border border-stone-200 dark:border-stone-700 mb-4">
                          <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">식재료 원가</span>
                          <span className="text-base font-bold text-stone-700 dark:text-stone-200 tracking-tight">{visibleColumns.cost ? formatCurrency(cost) : '***원'}</span>
                        </div>
                        {/* 권역별 블록 — 진행바 포함 */}
                        <div className="flex gap-2 mt-auto">
                          {regions.map(r => {
                            const price = menu.prices[r] || 0;
                            const rate = price > 0 ? cost / price : 0;
                            const isGood = rate > 0 && rate < 0.40;
                            const isWarning = rate >= 0.40 && rate <= 0.42;
                            const { text: textClass, bar: barClass } = rateColor(rate);
                            const bgClass = isGood ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-800 dark:border-emerald-800/50' : isWarning ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-800 dark:border-amber-800/50' : 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-800 dark:border-rose-800/50';
                            const Icon = isGood ? TrendingDown : TrendingUp;
                            return (
                              <div key={r} className={`flex-1 flex flex-col items-center justify-center py-3 px-1 rounded-sm border ${bgClass}`}>
                                <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 mb-1">{r}</span>
                                <span className="text-[13px] font-black text-stone-900 dark:text-stone-100 tracking-tighter mb-1">{formatCurrency(price)}</span>
                                <div className="flex items-center gap-0.5 mb-1.5">
                                  <Icon size={11} className={textClass} />
                                  <span className={`text-[11px] font-black tracking-tight ${textClass}`}>{visibleColumns.costRate ? formatPercent(rate) : '**.*%'}</span>
                                </div>
                                {/* 진행바 */}
                                {price > 0 && visibleColumns.costRate && (
                                  <div className="w-full h-1 bg-white/60 dark:bg-stone-900/40 rounded-full overflow-hidden">
                                    <div className={`h-full ${barClass} rounded-full`} style={{ width: `${Math.min((rate / 0.6) * 100, 100)}%` }} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {(onSaveRecipe || onDuplicateMenu) && (
                          <>
                            <div className="mt-5 pt-4 border-t border-stone-300 dark:border-stone-800 flex items-center gap-2">
                              {onSaveRecipe && (
                                <button onClick={() => setExpandedRecipeId(expandedRecipeId === menu.id ? null : menu.id)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors py-1 tracking-widest">
                                  레시피 {expandedRecipeId === menu.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              )}
                              {onDuplicateMenu && (
                                <button onClick={() => onDuplicateMenu(menu.id)} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors" title="메뉴 복사"><Copy size={14} /></button>
                              )}
                            </div>
                            {onSaveRecipe && expandedRecipeId === menu.id && (
                              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2">
                                <InlineRecipeEditor menu={menu} ingredients={ingredients} allMenus={menus} onSave={(id, recipe, notes) => { onSaveRecipe(id, recipe, notes); setExpandedRecipeId(null); }} onClose={() => setExpandedRecipeId(null)} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ═══ 표 뷰 ═══ */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60">
                  <th className="py-3 px-4 text-left text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap">메뉴명</th>
                  <th className="py-3 px-4 text-right text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 select-none" onClick={() => onToggleColumn('cost')} title="클릭하여 숨기기/표시">
                    원가 {!visibleColumns.cost && <span className="text-[9px] opacity-60">(숨김)</span>}
                  </th>
                  {regions.map(r => (
                    <th key={r} colSpan={2} className="py-3 px-4 text-center text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap border-l border-stone-200 dark:border-stone-700">{r}</th>
                  ))}
                  <th className="py-3 px-3 whitespace-nowrap"></th>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/30">
                  <th className="pb-2 px-4"></th><th className="pb-2 px-4"></th>
                  {regions.map(r => (
                    <React.Fragment key={r}>
                      <th className="pb-2 px-4 text-right text-[10px] font-semibold text-stone-400 border-l border-stone-100 dark:border-stone-800 whitespace-nowrap">판매가</th>
                      <th className="pb-2 px-4 text-left text-[10px] font-semibold text-stone-400 whitespace-nowrap cursor-pointer hover:text-stone-600 select-none" onClick={() => onToggleColumn('costRate')} title="클릭하여 숨기기/표시">
                        원가율 {!visibleColumns.costRate && <span className="text-[9px]">(숨김)</span>}
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="pb-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {groupedMenus.map(group => {
                  if (!group.category.isVisible && !isAdmin) return null;
                  if (group.menus.length === 0) return null;
                  return (
                    <React.Fragment key={group.category.id || 'uncategorized'}>
                      <tr className="bg-stone-100/80 dark:bg-stone-800/50 border-y border-stone-200 dark:border-stone-700">
                        <td colSpan={9} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-stone-600 dark:text-stone-400 uppercase tracking-widest">{group.category.name}</span>
                            {!group.category.isVisible && <span className="text-[10px] font-medium text-stone-400">(숨김)</span>}
                            <span className="text-[10px] text-stone-400 ml-1">{group.menus.length}개</span>
                          </div>
                        </td>
                      </tr>
                      {group.menus.map(menu => {
                        if (menu.isVisible === false && !isAdmin) return null;
                        const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                        const hasAlert = menu.hasAlert || checkMenuAlert(menu, ingredients, menus);
                        const missing = hasMissingIngredients(menu.recipe, ingredients, menus);
                        return (
                          <tr key={menu.id} className={`border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-50 dark:hover:bg-stone-800/30 transition-colors ${hasAlert ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''} ${menu.isVisible === false ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-stone-900 dark:text-stone-100">{menu.name}</span>
                                {menu.isVisible === false && <EyeOff size={12} className="text-stone-400 shrink-0" />}
                                {hasAlert && (
                                  <button onClick={() => onNavigateToTab('변동사항')} className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-sm hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors shrink-0">
                                    <AlertCircle size={9} />{missing ? '누락' : '변동'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className={`py-3 px-4 text-right font-mono text-sm whitespace-nowrap ${hasAlert ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-stone-700 dark:text-stone-300'}`}>
                              {visibleColumns.cost ? formatCurrency(cost) : '—'}
                            </td>
                            {regions.map(r => {
                              const price = menu.prices[r] || 0;
                              const rate = price > 0 ? cost / price : 0;
                              return (
                                <React.Fragment key={r}>
                                  <td className="py-3 px-4 text-right font-semibold text-stone-700 dark:text-stone-200 border-l border-stone-100 dark:border-stone-800/50 whitespace-nowrap text-sm">{formatCurrency(price)}</td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    {price > 0 && visibleColumns.costRate
                                      ? <CostRateBar rate={rate} />
                                      : <span className="text-xs text-stone-300 dark:text-stone-600">—</span>}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-0.5">
                                {onSaveRecipe && <button onClick={() => setRecipeModalMenuId(menu.id)} className="p-1.5 text-stone-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="레시피 편집"><BookOpen size={14} /></button>}
                                {onDuplicateMenu && <button onClick={() => onDuplicateMenu(menu.id)} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors" title="메뉴 복사"><Copy size={14} /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ 시뮬레이션 뷰 ═══ */}
      {viewMode === 'sim' && (
        <div className="space-y-4">
          {/* 시뮬레이션 헤더 */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-stone-800 dark:bg-stone-700 rounded-sm text-white">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical size={16} className="text-stone-300" />
                <span className="text-sm font-black tracking-wider">가격 시뮬레이션</span>
                {changedMenuIds.length > 0 && (
                  <span className="text-[11px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-sm">{changedMenuIds.length}개 수정됨</span>
                )}
              </div>
              <p className="text-[11px] text-stone-400">판매가를 입력하면 원가율이 즉시 계산됩니다. 수정된 셀은 주황색으로 표시됩니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetSim} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-stone-300 hover:text-white bg-stone-700 dark:bg-stone-600 hover:bg-stone-600 dark:hover:bg-stone-500 rounded-sm transition-colors">
                <RotateCcw size={13} /> 초기화
              </button>
              {onBulkSavePrices && (
                <button onClick={handleApplySim} disabled={changedMenuIds.length === 0 || simSaving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-stone-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-sm transition-colors">
                  <Save size={13} /> {simSaving ? '저장 중...' : `가격 적용 (${changedMenuIds.length}개)`}
                </button>
              )}
              <button onClick={() => setViewMode('table')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-stone-400 hover:text-white hover:bg-stone-600 rounded-sm transition-colors">
                <X size={13} /> 닫기
              </button>
            </div>
          </div>

          {/* 원가율 범례 */}
          <div className="flex items-center gap-4 px-1">
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">원가율 기준:</span>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[11px] text-stone-500">양호 &lt;40%</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-400" /><span className="text-[11px] text-stone-500">주의 40~42%</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-rose-500" /><span className="text-[11px] text-stone-500">위험 &gt;42%</span></div>
          </div>

          {/* 시뮬레이션 테이블 */}
          <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60">
                    <th className="py-3 px-4 text-left text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap">메뉴명</th>
                    <th className="py-3 px-4 text-right text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap">원가</th>
                    {regions.map(r => (
                      <th key={r} colSpan={2} className="py-3 px-4 text-center text-[11px] font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider whitespace-nowrap border-l border-stone-200 dark:border-stone-700">{r}</th>
                    ))}
                  </tr>
                  <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/30">
                    <th className="pb-2 px-4"></th><th className="pb-2 px-4"></th>
                    {regions.map(r => (
                      <React.Fragment key={r}>
                        <th className="pb-2 px-4 text-center text-[10px] font-semibold text-stone-400 border-l border-stone-100 dark:border-stone-800 whitespace-nowrap">판매가 입력</th>
                        <th className="pb-2 px-4 text-left text-[10px] font-semibold text-stone-400 whitespace-nowrap">원가율</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simGroupedMenus.map(group => {
                    if (!group.category.isVisible && !isAdmin) return null;
                    if (group.menus.length === 0) return null;
                    return (
                      <React.Fragment key={group.category.id || 'uncategorized'}>
                        <tr className="bg-stone-100/80 dark:bg-stone-800/50 border-y border-stone-200 dark:border-stone-700">
                          <td colSpan={8} className="px-4 py-2">
                            <span className="text-[11px] font-black text-stone-600 dark:text-stone-400 uppercase tracking-widest">{group.category.name}</span>
                            <span className="text-[10px] text-stone-400 ml-2">{group.menus.length}개</span>
                          </td>
                        </tr>
                        {group.menus.map(menu => {
                          const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                          const isChanged = changedMenuIds.includes(menu.id);
                          return (
                            <tr key={menu.id} className={`border-b border-stone-100 dark:border-stone-800/60 transition-colors ${isChanged ? 'bg-amber-50/30 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/30'}`}>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className="font-bold text-stone-900 dark:text-stone-100">{menu.name}</span>
                                {isChanged && <span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-400">수정됨</span>}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-sm text-stone-700 dark:text-stone-300 whitespace-nowrap">{formatCurrency(cost)}</td>
                              {regions.map(r => {
                                const origPrice = menu.prices[r] ?? 0;
                                const simPrice = simPrices[menu.id]?.[r] ?? origPrice;
                                const changed = simPrice !== origPrice;
                                const rate = simPrice > 0 ? cost / simPrice : 0;
                                return (
                                  <React.Fragment key={r}>
                                    <td className="py-2 px-3 border-l border-stone-100 dark:border-stone-800/50">
                                      <div className="relative inline-block">
                                        <input
                                          type="number"
                                          min={0}
                                          step={500}
                                          value={simPrice || ''}
                                          onChange={e => updateSimPrice(menu.id, r, parseInt(e.target.value) || 0)}
                                          className={`w-[88px] text-right px-2 py-1.5 text-sm font-semibold border rounded-sm focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-500 transition-colors ${changed ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/25 text-amber-800 dark:text-amber-200' : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200'}`}
                                          placeholder={origPrice ? String(origPrice) : '0'}
                                        />
                                        {changed && (
                                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" title={`원본: ${formatCurrency(origPrice)}`} />
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-4 whitespace-nowrap">
                                      {simPrice > 0
                                        ? <CostRateBar rate={rate} />
                                        : <span className="text-xs text-stone-300 dark:text-stone-600">—</span>}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 하단 저장 버튼 (긴 목록용 반복) */}
          {onBulkSavePrices && changedMenuIds.length > 0 && (
            <div className="flex justify-end pt-2">
              <button onClick={handleApplySim} disabled={simSaving} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-stone-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-sm transition-colors">
                <Save size={15} /> {simSaving ? '저장 중...' : `${changedMenuIds.length}개 메뉴 가격 저장 적용`}
              </button>
            </div>
          )}
        </div>
      )}

      {menus.length === 0 && (
        <div className="py-20 text-center text-stone-500 dark:text-stone-400">
          <ChefHat size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">등록된 메뉴가 없습니다.</p>
          <p className="text-sm mt-1">메뉴 관리 탭에서 새로운 메뉴를 추가해 보세요.</p>
        </div>
      )}

      {/* 레시피 편집 모달 */}
      {recipeModalMenuId && onSaveRecipe && (() => {
        const menu = menus.find(m => m.id === recipeModalMenuId);
        if (!menu) return null;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setRecipeModalMenuId(null); }}>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">레시피 편집</p>
                  <h3 className="text-lg font-black text-stone-900 dark:text-white">{menu.name}</h3>
                </div>
                <button onClick={() => setRecipeModalMenuId(null)} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors"><X size={20} /></button>
              </div>
              <InlineRecipeEditor menu={menu} ingredients={ingredients} allMenus={menus} onSave={(id, recipe, notes) => { onSaveRecipe(id, recipe, notes); setRecipeModalMenuId(null); }} onClose={() => setRecipeModalMenuId(null)} />
            </div>
          </div>
        );
      })()}
    </div>
  );
};
