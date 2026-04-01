export type Region = '지방권' | '광역권' | '수도권';
export type Unit = 'kg' | 'g' | 'ea' | '미';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isApproved: boolean;
  isActive: boolean;
  theme?: 'light' | 'dark';
  createdAt: string;
  alertThresholdType?: 'percentage' | 'absolute';
  alertThresholdValue?: number;
}

export interface Ingredient {
  id: string;
  name: string;
  spec: string;
  boxCost: number;
  boxQuantity: number;
  unitCost: number;
  salesPrice: number;
  unitSalesPrice: number;
  unit: Unit;
  isArchived?: boolean;
  isSelectedForMenu?: boolean;
  createdAt?: string;
}

export interface IngredientChange {
  id: string;
  ingredientId: string;
  name: string;
  spec: string;
  type: 'new' | 'deleted' | 'price_change' | 'bulk_update';
  prevPurchasePrice?: number;
  currPurchasePrice?: number;
  prevSalesPrice?: number;
  currSalesPrice?: number;
  timestamp: string;
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface Menu {
  id: string;
  name: string;
  prices: Record<Region, number>;
  recipe: RecipeItem[];
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  lastAcknowledgedCost?: number;
  hasAlert?: boolean;
}
