import React from 'react';
import { Menu, Ingredient, Region, MenuCategory } from '../types';
import { calculateTotalCost, formatCurrency, formatPercent, checkMenuAlert, hasMissingIngredients } from '../utils';
import { AlertCircle, CheckCircle2, EyeOff } from 'lucide-react';

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
}

export const OverviewTable: React.FC<Props> = ({ 
  menus, 
  menuCategories,
  ingredients, 
  isAdmin, 
  visibleColumns,
  onAcknowledgeAlert,
  onNavigateToTab,
  onToggleColumn
}) => {
  const regions: Region[] = ['지방권', '광역권', '수도권'];

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
        <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 dark:border-slate-700 align-middle">메뉴명</th>
            <th rowSpan={2} className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 align-middle cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('cost')}>
              원가 {visibleColumns.cost ? '' : '(숨김)'}
            </th>
            {regions.map(r => (
              <th key={r} colSpan={4} className="px-4 py-2 text-center border-b border-r border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800">{r}</th>
            ))}
          </tr>
          <tr>
            {regions.map(r => (
              <React.Fragment key={`${r}-sub`}>
                <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30">판매가</th>
                <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('margin')}>
                  마진 {visibleColumns.margin ? '' : '(숨김)'}
                </th>
                <th className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('costRate')}>
                  원가율 {visibleColumns.costRate ? '' : '(숨김)'}
                </th>
                <th className="px-2 py-2 text-right border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('marginRate')}>
                  마진율 {visibleColumns.marginRate ? '' : '(숨김)'}
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {groupedMenus.map(group => {
            if (!group.category.isVisible && !isAdmin) return null; // Hide invisible categories for non-admins
            
            return (
              <React.Fragment key={group.category.id || 'uncategorized'}>
                {/* Category Header */}
                <tr className="bg-slate-100/50 dark:bg-slate-800/30">
                  <td colSpan={14} className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      {group.category.name}
                      {!group.category.isVisible && <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400">숨김</span>}
                    </div>
                  </td>
                </tr>
                {/* Menus in Category */}
                {group.menus.map(menu => {
                  if (menu.isVisible === false && !isAdmin) return null; // Hide invisible menus for non-admins

                  const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                  const hasAlert = checkMenuAlert(menu, ingredients, menus);
                  const missing = hasMissingIngredients(menu.recipe, ingredients, menus);

                  return (
                    <tr key={menu.id} className={`bg-blue-50/30 dark:bg-blue-900/10 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors group ${hasAlert ? 'border-l-4 border-l-rose-500' : ''} ${menu.isVisible === false ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 group-hover:text-blue-800 dark:group-hover:text-blue-400 transition-colors">
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
                          {isAdmin && hasAlert && onAcknowledgeAlert && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAcknowledgeAlert(menu.id);
                              }}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded transition-colors"
                              title="알림 해결"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 ${hasAlert ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                        {visibleColumns.cost ? formatCurrency(cost) : '-'}
                      </td>
                      
                      {regions.map(r => {
                        const price = menu.prices[r] || 0;
                        const margin = price - cost;
                        const costRate = price > 0 ? cost / price : 0;
                        const marginRate = price > 0 ? margin / price : 0;
                        return (
                          <React.Fragment key={`${menu.id}-${r}`}>
                            <td className="px-2 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(price)}</td>
                            <td className="px-2 py-3 text-right text-emerald-600 dark:text-emerald-400">
                              {visibleColumns.margin ? formatCurrency(margin) : '-'}
                            </td>
                            <td className="px-2 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                              {visibleColumns.costRate ? formatPercent(costRate) : '-'}
                            </td>
                            <td className="px-2 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                              {visibleColumns.marginRate ? formatPercent(marginRate) : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
                {group.menus.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500 text-xs bg-slate-50/50 dark:bg-slate-900/50">이 카테고리에 등록된 메뉴가 없습니다.</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {menus.length === 0 && (
            <tr>
              <td colSpan={14} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">등록된 메뉴가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
