import React from 'react';
import { Menu, Ingredient, Region, MenuCategory } from '../types';
import { calculateTotalCost, formatCurrency, formatPercent, checkMenuAlert, hasMissingIngredients } from '../utils';
import { Edit2, Archive, ChefHat, AlertCircle, CheckCircle2, Eye, EyeOff, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface Props {
  menus: Menu[];
  menuCategories: MenuCategory[];
  ingredients: Ingredient[];
  region: Region;
  isAdmin: boolean;
  visibleColumns: {
    cost: boolean;
    margin: boolean;
    costRate: boolean;
    marginRate: boolean;
  };
  onEditMenu: (menu: Menu) => void;
  onArchiveMenu: (id: string) => void;
  onEditRecipe: (menu: Menu) => void;
  onAcknowledgeAlert: (id: string) => void;
  onNavigateToTab: (tab: string) => void;
  onReorderMenu: (menuId: string, sourceCategoryId: string | undefined, destinationCategoryId: string | undefined, newIndex: number) => void;
  onToggleMenuVisibility: (menuId: string) => void;
  onToggleColumn: (column: keyof Props['visibleColumns']) => void;
}

export const MenuTable: React.FC<Props> = ({ 
  menus, 
  menuCategories,
  ingredients, 
  region, 
  isAdmin, 
  visibleColumns,
  onEditMenu, 
  onArchiveMenu, 
  onEditRecipe, 
  onAcknowledgeAlert,
  onNavigateToTab,
  onReorderMenu,
  onToggleMenuVisibility,
  onToggleColumn
}) => {
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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceCategoryId = result.source.droppableId === 'uncategorized' ? undefined : result.source.droppableId;
    const destinationCategoryId = result.destination.droppableId === 'uncategorized' ? undefined : result.destination.droppableId;

    onReorderMenu(
      result.draggableId,
      sourceCategoryId,
      destinationCategoryId,
      result.destination.index
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
          <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3">메뉴명</th>
              <th className="px-4 py-3 text-right">판매가</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('cost')}>
                원가 {visibleColumns.cost ? '' : '(숨김)'}
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('margin')}>
                마진 {visibleColumns.margin ? '' : '(숨김)'}
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('costRate')}>
                원가율 {visibleColumns.costRate ? '' : '(숨김)'}
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onClick={() => onToggleColumn('marginRate')}>
                마진율 {visibleColumns.marginRate ? '' : '(숨김)'}
              </th>
              <th className="px-4 py-3 text-center">레시피</th>
              <th className="px-4 py-3 text-center">관리</th>
            </tr>
          </thead>
          {groupedMenus.map(group => {
            if (!group.category.isVisible && !isAdmin) return null; // Hide invisible categories for non-admins
            
            const droppableId = group.category.id || 'uncategorized';
            
            return (
              <Droppable key={droppableId} droppableId={droppableId}>
                {(provided) => (
                  <tbody
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="divide-y divide-slate-200 dark:divide-slate-800"
                  >
                    {/* Category Header */}
                    <tr className="bg-slate-100/50 dark:bg-slate-800/30">
                      <td colSpan={8} className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          {group.category.name}
                          {!group.category.isVisible && <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400">숨김</span>}
                        </div>
                      </td>
                    </tr>
                    {/* Menus in Category */}
                    {group.menus.map((menu, index) => {
                      if (menu.isVisible === false && !isAdmin) return null; // Hide invisible menus for non-admins

                      const price = menu.prices[region] || 0;
                      const cost = calculateTotalCost(menu.recipe, ingredients, menus);
                      const margin = price - cost;
                      const costRate = price > 0 ? cost / price : 0;
                      const marginRate = price > 0 ? margin / price : 0;
                      const hasAlert = checkMenuAlert(menu, ingredients, menus);
                      const missing = hasMissingIngredients(menu.recipe, ingredients, menus);

                      return (
                        <React.Fragment key={menu.id}>
                          <Draggable draggableId={menu.id} index={index} isDragDisabled={!isAdmin}>
                            {(provided, snapshot) => (
                              <tr 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`bg-blue-50/30 dark:bg-blue-900/10 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors group ${hasAlert ? 'border-l-4 border-l-rose-500' : ''} ${menu.isVisible === false ? 'opacity-50' : ''} ${snapshot.isDragging ? 'shadow-lg bg-blue-100 dark:bg-blue-900/50 relative z-10' : ''}`}
                                style={provided.draggableProps.style}
                              >
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-800 dark:group-hover:text-blue-400 transition-colors">
                                  <div className="flex items-center gap-2">
                                    {isAdmin && (
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                        <GripVertical size={16} />
                                      </div>
                                    )}
                                    {menu.name}
                                    {menu.isVisible === false && <EyeOff size={14} className="text-slate-400" />}
                                    {hasAlert && (
                                      <button 
                                        onClick={() => onNavigateToTab('변동사항')}
                                        className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                                        title={missing ? '식자재가 데이터베이스에서 삭제되었습니다. 클릭하여 확인' : '식자재 원가가 변동되었습니다. 클릭하여 확인'}
                                      >
                                        <AlertCircle size={10} />
                                        {missing ? '식자재 누락' : '원가 변동'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(price)}</td>
                                <td className={`px-4 py-3 text-right ${hasAlert ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                                  {visibleColumns.cost ? formatCurrency(cost) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {visibleColumns.margin ? formatCurrency(margin) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                  {visibleColumns.costRate ? formatPercent(costRate) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {visibleColumns.marginRate ? formatPercent(marginRate) : '-'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button onClick={() => onEditRecipe(menu)} className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="레시피 관리">
                                    <ChefHat size={16} />
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-center space-x-1">
                                  {isAdmin && (
                                    <button onClick={() => onToggleMenuVisibility(menu.id)} className="p-1 text-slate-400 hover:text-blue-600 rounded-md transition-colors" title={menu.isVisible === false ? "보이기" : "숨기기"}>
                                      {menu.isVisible === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                  )}
                                  {hasAlert && isAdmin && (
                                    <button 
                                      onClick={() => onAcknowledgeAlert(menu.id)} 
                                      className="p-1.5 text-rose-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors" 
                                      title="알림 해결 (관리자)"
                                    >
                                      <CheckCircle2 size={16} />
                                    </button>
                                  )}
                                  <button onClick={() => onEditMenu(menu)} className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="메뉴 수정">
                                    <Edit2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            )}
                          </Draggable>
                        </React.Fragment>
                      );
                    })}
                    {provided.placeholder}
                    {group.menus.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500 text-xs bg-slate-50/50 dark:bg-slate-900/50">이 카테고리에 등록된 메뉴가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                )}
              </Droppable>
            );
          })}
          {menus.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">등록된 메뉴가 없습니다.</td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </DragDropContext>
  );
};
