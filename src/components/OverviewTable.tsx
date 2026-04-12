import React, { useState } from 'react';
import { Menu, Ingredient, Region, MenuCategory, RecipeItem } from '../types';
import { calculateTotalCost, formatCurrency, formatPercent, checkMenuAlert, hasMissingIngredients } from '../utils';
import { AlertCircle, CheckCircle2, EyeOff, TrendingUp, TrendingDown, ChefHat, LayoutGrid, Table as TableIcon, ChevronDown, ChevronUp, Plus, Trash2, Search, X } from 'lucide-react';

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
}

// 💡 [신규] 카드 내부에서 바로 동작하는 인라인 레시피 에디터 컴포넌트
const InlineRecipeEditor = ({ menu, ingredients, allMenus, onSave, onClose }: { menu: Menu, ingredients: Ingredient[], allMenus: Menu[], onSave: (id: string, recipe: RecipeItem[], notes: string) => void, onClose: () => void }) => {
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
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-3">
         <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">레시피 상세 및 수정</h4>
         <span className="text-xs font-bold text-rose-500 dark:text-rose-400">총 원가: {formatCurrency(calculateTotalCost(recipe, ingredients, allMenus))}</span>
      </div>
      <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
        {recipe.length === 0 ? <div className="text-xs text-center py-4 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">등록된 레시피 항목이 없습니다.</div> : (
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
                  <button onClick={() => setRecipe(recipe.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-500"><Trash2 size={12}/></button>
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
              <input type="text" placeholder={selectedItemName || "항목 검색..."} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500" />
              {isDropdownOpen && (
                <div className="absolute z-[60] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg max-h-40 overflow-y-auto">
                  {filteredItems.map(item => <button key={item.id} onClick={() => { setSelectedId(item.id); setIsDropdownOpen(false); setSearchQuery(''); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 truncate">{item.name}</button>)}
                  {filteredItems.length === 0 && <div className="px-2 py-2 text-xs text-slate-400 text-center">결과 없음</div>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-1.5"><input type="text" placeholder="항목명" value={customName} onChange={e => setCustomName(e.target.value)} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" /><input type="number" placeholder="단가" value={customCost || ''} onChange={e => setCustomCost(parseFloat(e.target.value))} className="w-16 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" /></div>
          )}
          <div className="flex gap-1.5">
            <input type="number" min="0.1" step="0.1" placeholder="수량" value={quantity || ''} onChange={e => setQuantity(parseFloat(e.target.value))} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
            <input type="number" min="1" max="100" step="1" placeholder="수율" value={yieldRate || ''} onChange={e => setYieldRate(parseFloat(e.target.value))} className="flex-1 w-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500" />
            <button onClick={handleAdd} disabled={activeTab === 'custom' ? !customName.trim() : !selectedId} className="px-2 bg-slate-800 dark:bg-blue-600 text-white rounded text-xs font-bold disabled:opacity-50"><Plus size={14}/></button>
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
  onSaveRecipe
}) => {
  const regions: Region[] = ['지방권', '광역권', '수도권'];
  
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  // Group menus by category
  const groupedMenus = menuCategories.map(category => ({
    category,
    menus: menus.filter(m => m.categoryId === category.id).sort((a, b) => (a.order || 0) - (b.order || 0))
  }));

  // Add uncategorized menus
  const uncategorizedMenus = menus.filter(m => !m.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (uncategorizedMenus.length > 0) {
    groupedMenus.push({
      category: { id: '', name: '미분류', order: 999, isVisible: true },
      menus: uncategorizedMenus
    });
  }

  return (
    <div className="p-4 sm:p-6 bg-stone-100 dark:bg-stone-950 space-y-8">
      
      {/* 상단 컨트롤 패널 (뷰 토글 및 지역 선택) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700">
          <button 
            onClick={() => setViewMode('card')} 
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${viewMode === 'card' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
          >
            <LayoutGrid size={16} /> 카드형 메뉴판
          </button>
          <button 
            onClick={() => setViewMode('table')} 
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-sm text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300 dark:border-stone-600' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
          >
            <TableIcon size={16} /> 전체 표 보기
          </button>
        </div>
      </div>

      {/* 뷰어 영역 */}
      {viewMode === 'card' ? (
        <div className="space-y-10">
          {groupedMenus.map(group => {
            if (!group.category.isVisible && !isAdmin) return null;
            if (group.menus.length === 0) return null;

            return (
              <section key={group.category.id || 'uncategorized'}>
                <div className="flex items-center gap-3 mb-6 border-b-2 border-stone-800 dark:border-stone-400 pb-3">
                  <h3 className="text-xl font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">{group.category.name}</h3>
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
                      <div 
                        key={menu.id} 
                        className={`group relative flex flex-col bg-[#FDFBF7] dark:bg-stone-900 rounded-sm p-6 border transition-all hover:-translate-y-1 hover:shadow-md ${
                          hasAlert 
                            ? 'border-rose-800 dark:border-rose-600' 
                            : 'border-stone-300 dark:border-stone-700 hover:border-stone-800 dark:hover:border-stone-400'
                        }`}
                      >
                        {/* 상단 알림 뱃지 */}
                        {hasAlert && (
                          <div className="absolute -top-3 -right-3">
                            <button 
                              onClick={() => onNavigateToTab('변동사항')}
                              className="flex items-center gap-1 bg-rose-800 dark:bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-sm shadow-md animate-bounce hover:bg-rose-900 transition-colors"
                            >
                              <AlertCircle size={14} />
                              {missing ? '식재료 누락!' : '원가 변동!'}
                            </button>
                          </div>
                        )}
                        {menu.isVisible === false && (
                          <div className="absolute -top-3 -left-3 bg-stone-700 text-white text-[10px] font-bold px-2 py-1 rounded-sm shadow">숨김</div>
                        )}

                        {/* 메뉴명 영역 */}
                        <div className="mb-5 flex-1">
                          <h4 className="text-xl font-black text-stone-900 dark:text-white leading-tight pr-4 tracking-tight">{menu.name}</h4>
                        </div>

                        
                        {/* 식재료 원가 (공통) */}
                        <div className="flex justify-between items-center bg-white dark:bg-stone-800/50 px-4 py-3 rounded-sm border border-stone-200 dark:border-stone-700 mb-6">
                          <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">식재료 원가</span>
                          <span className="text-base font-bold text-stone-700 dark:text-stone-200 tracking-tight">
                            {visibleColumns.cost ? formatCurrency(cost) : '***원'}
                          </span>
                        </div>

                        
                        {/* 💡 전체보기 특화: 3개 권역 한눈에 보기 */}
                        <div className="flex gap-2 mt-auto">
                          {regions.map(r => {
                            const price = menu.prices[r] || 0;
                            const rate = price > 0 ? cost / price : 0;
                            const isGood = rate > 0 && rate < 0.40;
                            const isWarning = rate >= 0.40 && rate <= 0.42;
                            
                            const bgClass = isGood ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-800 dark:border-emerald-800/50' : isWarning ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-800 dark:border-amber-800/50' : 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-800 dark:border-rose-800/50';
                            const textClass = isGood ? 'text-emerald-800 dark:text-emerald-400' : isWarning ? 'text-amber-800 dark:text-amber-400' : 'text-rose-800 dark:text-rose-400';
                            const Icon = isGood ? TrendingDown : TrendingUp;
                            
                            return (
                              <div key={r} className={`flex-1 flex flex-col items-center justify-center py-3 px-1 rounded-sm border ${bgClass}`}>
                                <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 mb-1">{r}</span>
                                <span className="text-[13px] font-black text-stone-900 dark:text-stone-100 tracking-tighter mb-1">
                                  {formatCurrency(price)}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <Icon size={12} className={textClass} />
                                  <span className={`text-[11px] font-black tracking-tight ${textClass}`}>
                                    {visibleColumns.costRate ? formatPercent(rate) : '**.*%'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* 💡 추가: 레시피 인라인 편집 아코디언 */}
                        {onSaveRecipe && (
                          <>
                            <div className="mt-6 pt-4 border-t border-stone-300 dark:border-stone-800">
                              <button 
                                onClick={() => setExpandedRecipeId(expandedRecipeId === menu.id ? null : menu.id)}
                                className="w-full flex items-center justify-center gap-1 text-[11px] font-bold text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors py-1 tracking-widest"
                              >
                                레시피 상세 및 수정 {expandedRecipeId === menu.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                              </button>
                            </div>
                            {expandedRecipeId === menu.id && (
                              <InlineRecipeEditor 
                                menu={menu} ingredients={ingredients} allMenus={menus} 
                                onSave={(id, recipe, notes) => { onSaveRecipe(id, recipe, notes); setExpandedRecipeId(null); }} 
                                onClose={() => setExpandedRecipeId(null)} 
                              />
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
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
            <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 dark:border-slate-700 align-middle whitespace-nowrap">메뉴명</th>
                <th rowSpan={2} className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 align-middle cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap" onClick={() => onToggleColumn('cost')}>
                  원가 {visibleColumns.cost ? '' : '(숨김)'}
                </th>
                {regions.map(r => (
                  <th key={r} colSpan={4} className="px-4 py-2 text-center border-b border-r border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800 whitespace-nowrap">{r}</th>
                ))}
              </tr>
              <tr>
                {regions.map(r => (
                  <React.Fragment key={`${r}-sub`}>
                    <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30 whitespace-nowrap">판매가</th>
                    <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap" onClick={() => onToggleColumn('margin')}>
                      마진 {visibleColumns.margin ? '' : '(숨김)'}
                    </th>
                    <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap" onClick={() => onToggleColumn('costRate')}>
                      원가율 {visibleColumns.costRate ? '' : '(숨김)'}
                    </th>
                    <th className="px-2 py-2 text-right border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap" onClick={() => onToggleColumn('marginRate')}>
                      마진율 {visibleColumns.marginRate ? '' : '(숨김)'}
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {groupedMenus.map(group => {
                if (!group.category.isVisible && !isAdmin) return null;
                if (group.menus.length === 0) return null;
                
                return (
                  <React.Fragment key={group.category.id || 'uncategorized'}>
                    <tr className="bg-slate-100/50 dark:bg-slate-800/30">
                      <td colSpan={14} className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          {group.category.name}
                          {!group.category.isVisible && <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400">숨김</span>}
                        </div>
                      </td>
                    </tr>
                    {group.menus.map(menu => {
                      if (menu.isVisible === false && !isAdmin) return null;

                      const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                      const hasAlert = menu.hasAlert || checkMenuAlert(menu, ingredients, menus);
                      const missing = hasMissingIngredients(menu.recipe, ingredients, menus);

                      return (
                        <tr key={menu.id} className={`bg-white dark:bg-slate-900 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group ${hasAlert ? 'border-l-4 border-l-rose-500' : ''} ${menu.isVisible === false ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {menu.name}
                              {menu.isVisible === false && <EyeOff size={14} className="text-slate-400" />}
                              {hasAlert && (
                                <button 
                                  onClick={() => onNavigateToTab('변동사항')}
                                  className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                                  title={missing ? '식자재 누락. 클릭하여 확인' : '원가 변동. 클릭하여 확인'}
                                >
                                  <AlertCircle size={10} />
                                  {missing ? '누락' : '변동'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 ${hasAlert ? 'text-rose-600 dark:text-rose-400 font-bold' : ''} whitespace-nowrap`}>
                            {visibleColumns.cost ? formatCurrency(cost) : '-'}
                          </td>
                          
                          {regions.map(r => {
                            const price = menu.prices[r] || 0;
                            const margin = price - cost;
                            const costRate = price > 0 ? cost / price : 0;
                            const marginRate = price > 0 ? margin / price : 0;
                            
                            // 표(Table) 모드에서도 원가율 신호등 색상 적용
                            const getRateColorClasses = (r: number) => {
                              if (r > 0 && r < 0.40) return 'text-emerald-600 dark:text-emerald-400';
                              if (r >= 0.40 && r <= 0.42) return 'text-amber-600 dark:text-amber-400';
                              return 'text-rose-600 dark:text-rose-400';
                            };
                            const rateColor = getRateColorClasses(costRate);

                            return (
                              <React.Fragment key={`${menu.id}-${r}`}>
                                <td className="px-2 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatCurrency(price)}</td>
                                <td className="px-2 py-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {visibleColumns.margin ? formatCurrency(margin) : '-'}
                                </td>
                                <td className={`px-2 py-3 text-right font-bold ${rateColor} whitespace-nowrap`}>
                                  {visibleColumns.costRate ? formatPercent(costRate) : '-'}
                                </td>
                                <td className="px-2 py-3 text-right border-r border-slate-200 dark:border-slate-700 text-slate-400 whitespace-nowrap">
                                  {visibleColumns.marginRate ? formatPercent(marginRate) : '-'}
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
      )}

      {menus.length === 0 && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <ChefHat size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">등록된 메뉴가 없습니다.</p>
          <p className="text-sm mt-1">메뉴 관리 탭에서 새로운 메뉴를 추가해 보세요.</p>
        </div>
      )}
    </div>
  );
};
