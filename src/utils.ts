import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Ingredient, RecipeItem, Menu } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const calculateTotalCost = (recipe: RecipeItem[], ingredients: Ingredient[], menus: Menu[] = [], visitedMenuIds: Set<string> = new Set()): number => {
  return recipe.reduce((total, item) => {
    const yr = (item.yieldRate ?? 100) / 100;
    const yieldMultiplier = yr > 0 ? 1 / yr : 1;

    if (item.type === 'menu' && item.menuId) {
      if (visitedMenuIds.has(item.menuId)) return total;
      const subMenu = menus.find(m => m.id === item.menuId);
      if (subMenu) {
        const newVisited = new Set(visitedMenuIds);
        newVisited.add(item.menuId);
        return total + calculateTotalCost(subMenu.recipe, ingredients, menus, newVisited) * item.quantity * yieldMultiplier;
      }
      return total;
    } else if (item.type === 'custom') {
      return total + (item.customCost || 0) * item.quantity * yieldMultiplier;
    } else {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      return total + (ingredient ? (ingredient.unitSalesPrice || 0) * item.quantity * yieldMultiplier : 0);
    }
  }, 0);
};

export const doesMenuContainIngredient = (recipe: RecipeItem[], ingredientId: string, menus: Menu[] = [], visitedMenuIds: Set<string> = new Set()): boolean => {
  return recipe.some(item => {
    if (item.type === 'menu' && item.menuId) {
      if (visitedMenuIds.has(item.menuId)) return false;
      const subMenu = menus.find(m => m.id === item.menuId);
      if (!subMenu) return false;
      const newVisited = new Set(visitedMenuIds);
      newVisited.add(item.menuId);
      return doesMenuContainIngredient(subMenu.recipe, ingredientId, menus, newVisited);
    } else if (item.type === 'custom') {
      return false;
    } else {
      return item.ingredientId === ingredientId;
    }
  });
};

export const hasMissingIngredients = (recipe: RecipeItem[], ingredients: Ingredient[], menus: Menu[] = [], visitedMenuIds: Set<string> = new Set()): boolean => {
  return recipe.some(item => {
    if (item.type === 'menu' && item.menuId) {
      if (visitedMenuIds.has(item.menuId)) return false;
      const subMenu = menus.find(m => m.id === item.menuId);
      if (!subMenu) return true;
      const newVisited = new Set(visitedMenuIds);
      newVisited.add(item.menuId);
      return hasMissingIngredients(subMenu.recipe, ingredients, menus, newVisited);
    } else if (item.type === 'custom') {
      return false;
    } else {
      return !ingredients.find(i => i.id === item.ingredientId);
    }
  });
};

export const checkMenuAlert = (menu: any, ingredients: Ingredient[], menus: Menu[] = []) => {
  if (menu.hasAlert === true) return true;
  
  const currentCost = calculateTotalCost(menu.recipe, ingredients, menus);
  const missing = hasMissingIngredients(menu.recipe, ingredients, menus);
  
  if (menu.lastAcknowledgedCost === undefined) {
    return missing || menu.hasAlert;
  }

  const costChanged = Math.abs(currentCost - menu.lastAcknowledgedCost) > 0.1;
  
  if (costChanged) return true;

  return false;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
};

export const formatPercent = (rate: number) => {
  if (isNaN(rate) || !isFinite(rate)) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
};

export const formatShortMoney = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0원';
  let numVal = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  if (isNaN(numVal) || numVal === 0) return '0원';

  const isNegative = numVal < 0;
  numVal = Math.abs(numVal);
  
  const uk = Math.floor(numVal / 100000000);
  const man = Math.floor((numVal % 100000000) / 10000);
  
  let res = '';
  if (uk > 0) res += `${uk}억`;
  if (man > 0) {
    if (man % 1000 === 0) res += ` ${Math.floor(man / 1000)}천만`;
    else res += ` ${man}만`;
  }
  
  res = res.trim();
  if (!res) res = `${Math.floor(numVal).toLocaleString('ko-KR')}`;
  
  return isNegative ? `-${res}원` : `${res}원`;
};

// ==========================================
// 날짜 유틸리티 (Franchise Schedule 등)
// ==========================================

export const addDays = (dateStr: string, days: number): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

export const diffDays = (startStr: string, endStr: string): number => {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  // 시간 차이를 일(day) 단위로 변환
  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isDateInRange = (targetStr: string, startStr: string, endStr: string): boolean => {
  if (!targetStr || !startStr || !endStr) return false;
  const target = new Date(targetStr).getTime();
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  return target >= start && target <= end;
};

// ==========================================
// 가맹점 일정 특수 계산 로직
// ==========================================

/**
 * 일요일을 제외하고 일수를 더함
 */
export const addExcludingSunday = (dateStr: string, days: number): string => {
  if (!dateStr) return '';
  let d = new Date(dateStr);
  let count = 0;
  let absDays = Math.abs(days);
  let step = days >= 0 ? 1 : -1;

  while (count < absDays) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0) { // 0 is Sunday
      count++;
    }
  }
  return d.toISOString().split('T')[0];
};

/**
 * 주말(토, 일)을 제외하고 일수를 더함
 */
export const addWeekdays = (dateStr: string, days: number): string => {
  if (!dateStr) return '';
  let d = new Date(dateStr);
  let count = 0;
  let absDays = Math.abs(days);
  let step = days >= 0 ? 1 : -1;

  while (count < absDays) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) { // 0: Sun, 6: Sat
      count++;
    }
  }
  return d.toISOString().split('T')[0];
};

/**
 * 특정 날짜의 14일 전을 구하고, 주말이면 그 직전 금요일로 조정
 */
export const getOvenInDate = (dateStr: string): string => {
  if (!dateStr) return '';
  let d = new Date(dateStr);
  d.setDate(d.getDate() - 14);
  
  const day = d.getDay();
  if (day === 0) { // Sunday -> Friday
    d.setDate(d.getDate() - 2);
  } else if (day === 6) { // Saturday -> Friday
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
};

/**
 * 공사 종료일 기준 직전 주 월요일 (종료일 포함 주 제외)
 */
export const getPreTrainingStartDate = (endDateStr: string): string => {
  if (!endDateStr) return '';
  let d = new Date(endDateStr);
  let day = d.getDay();
  
  // 이번 주 월요일 구하기 (0:일, 1:월, ..., 6:토)
  let diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  
  // 지난 주 월요일로 7일 더 뒤로
  d.setDate(d.getDate() - 7);
  
  return d.toISOString().split('T')[0];
};