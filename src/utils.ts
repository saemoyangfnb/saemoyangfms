import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Ingredient, RecipeItem, Menu } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const calculateTotalCost = (recipe: RecipeItem[], ingredients: Ingredient[], menus: Menu[] = [], visitedMenuIds: Set<string> = new Set()): number => {
  return recipe.reduce((total, item) => {
    if (item.type === 'menu' && item.menuId) {
      if (visitedMenuIds.has(item.menuId)) return total; // Prevent infinite loops
      const subMenu = menus.find(m => m.id === item.menuId);
      if (subMenu) {
        const newVisited = new Set(visitedMenuIds);
        newVisited.add(item.menuId);
        return total + calculateTotalCost(subMenu.recipe, ingredients, menus, newVisited) * item.quantity;
      }
      return total;
    } else if (item.type === 'custom') {
      return total + (item.customCost || 0) * item.quantity;
    } else {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      return total + (ingredient ? (ingredient.unitSalesPrice || 0) * item.quantity : 0);
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
  // If explicitly marked as having an alert, always show it
  if (menu.hasAlert === true) return true;
  
  const currentCost = calculateTotalCost(menu.recipe, ingredients, menus);
  const missing = hasMissingIngredients(menu.recipe, ingredients, menus);
  
  // If it's the first time (no lastAcknowledgedCost) and there's a problem, show alert
  if (menu.lastAcknowledgedCost === undefined) {
    return missing || menu.hasAlert;
  }

  // Check if cost has changed since last acknowledgment
  const costChanged = Math.abs(currentCost - menu.lastAcknowledgedCost) > 0.1;
  
  // If cost changed, it needs a new acknowledgment
  if (costChanged) return true;

  // If cost is same as acknowledged, and hasAlert is false, then no alert
  // even if 'missing' is true (user acknowledged the missing state)
  return false;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
};

export const formatPercent = (rate: number) => {
  if (isNaN(rate) || !isFinite(rate)) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
};
