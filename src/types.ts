export type Region = '지방권' | '광역권' | '수도권';
export type Unit = 'kg' | 'g' | 'ea' | '미' | '수';
export type BrandId = string;

export interface Brand {
  id: BrandId;
  name: string;
  order: number;
  isActive: boolean;
  createdAt: string;
}

export const DEFAULT_BRANDS: Brand[] = [
  { id: 'dalbitgo', name: '달빛에구운고등어', order: 0, isActive: true, createdAt: new Date().toISOString() },
  { id: 'mansoo', name: '만수식당', order: 1, isActive: true, createdAt: new Date().toISOString() },
  { id: 'yams', name: '얌스', order: 2, isActive: true, createdAt: new Date().toISOString() },
  { id: 'bom', name: '봄초밥여름소바', order: 3, isActive: true, createdAt: new Date().toISOString() },
  { id: 'noeul', name: '노을에구운짚불쭈꾸미', order: 4, isActive: true, createdAt: new Date().toISOString() },
];

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

export type CostCalcMethod = 'purchase_divide' | 'sales_divide' | 'manual';

export interface Ingredient {
  id: string;
  brandId?: BrandId;
  name: string;
  spec: string;
  boxCost: number;
  boxQuantity: number;
  unitCost: number;
  salesPrice: number;
  unitSalesPrice: number;
  unit: Unit;
  costCalcMethod?: CostCalcMethod;
  isArchived?: boolean;
  isSelectedForMenu?: boolean;
  createdAt?: string;
}

export interface IngredientChange {
  id: string;
  brandId?: BrandId;
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

export type RecipeItemType = 'ingredient' | 'menu' | 'custom';

export interface RecipeItem {
  type?: RecipeItemType;
  ingredientId?: string;
  menuId?: string;
  customName?: string;
  customCost?: number;
  customUnit?: string;
  quantity: number;
  yieldRate?: number;
}

export interface MenuCategory {
  id: string;
  brandId?: BrandId;
  name: string;
  order: number;
  isVisible: boolean;
}

export interface Menu {
  id: string;
  brandId?: BrandId;
  name: string;
  categoryId?: string;
  order?: number;
  isVisible?: boolean;
  prices: Record<Region, number>;
  recipe: RecipeItem[];
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  lastAcknowledgedCost?: number;
  hasAlert?: boolean;
}

export interface SalesRecord {
  id: string;
  brandId: BrandId;
  storeName: string;
  date: string;
  totalSales: number;
  netSales: number;
  receiptCount: number;
  receiptAvg: number;
  normalAmount: number;
  takeoutAmount: number;
  deliveryAmount: number;
  createdAt: string;
}