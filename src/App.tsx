/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Menu, MenuCategory, Ingredient, Region, RecipeItem, User, IngredientChange } from './types';
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
import { 
  Plus, 
  Settings, 
  Upload, 
  Download, 
  LogOut, 
  KeyRound, 
  Users, 
  Sun, 
  Moon,
  LayoutDashboard,
  Archive,
  AlertTriangle,
  Trash2,
  X,
  History
} from 'lucide-react';
import Papa from 'papaparse';
import { calculateTotalCost, formatPercent, doesMenuContainIngredient } from './utils';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, User as FirebaseUser } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  collection, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocFromServer,
  deleteField
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

type TabType = Region | '전체보기' | '메뉴 관리' | '데이터 베이스' | '변동사항';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientChanges, setIngredientChanges] = useState<IngredientChange[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('지방권');
  
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | undefined>(undefined);
  
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const handleSaveCategories = async (updatedCategories: MenuCategory[]) => {
    try {
      // Find deleted categories
      const deletedCategories = menuCategories.filter(c => !updatedCategories.find(uc => uc.id === c.id));
      
      // Update or add categories
      for (const cat of updatedCategories) {
        await setDoc(doc(db, 'menu_categories', cat.id), cat);
      }
      
      // Delete removed categories
      for (const cat of deletedCategories) {
        await deleteDoc(doc(db, 'menu_categories', cat.id));
        
        // Update menus that were in this category to be uncategorized
        const affectedMenus = menus.filter(m => m.categoryId === cat.id);
        for (const menu of affectedMenus) {
          await updateDoc(doc(db, 'menus', menu.id), { categoryId: deleteField() });
        }
      }
      
      setIsCategoryModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menu_categories');
    }
  };
  const [recipeMenu, setRecipeMenu] = useState<Menu | null>(null);
  const [showDeleteAllMenusConfirm, setShowDeleteAllMenusConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ingredientFileInputRef = useRef<HTMLInputElement>(null);

  const [globalError, setGlobalError] = useState<string | null>(null);

  const [thresholdType, setThresholdType] = useState<'percentage' | 'absolute'>('absolute');
  const [thresholdValue, setThresholdValue] = useState<number>(0.01);

  const [visibleColumns, setVisibleColumns] = useState({
    cost: true,
    margin: true,
    costRate: true,
    marginRate: true,
  });

  const tabs: TabType[] = ['지방권', '광역권', '수도권', '전체보기', '메뉴 관리', '데이터 베이스', '변동사항'];

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const message = error instanceof Error ? error.message : String(error);
    const errInfo: FirestoreErrorInfo = {
      error: message,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));

    if (message.includes('Quota exceeded') || message.includes('resource-exhausted') || message.includes('quota-exceeded')) {
      setGlobalError('Firestore 무료 할당량(Quota)을 모두 소진했습니다. 일일 쓰기/읽기 한도에 도달하여 현재 데이터를 저장하거나 불러올 수 없습니다. 내일 오전 9시(KST) 이후에 다시 시도해 주세요.');
    } else {
      setGlobalError(`오류가 발생했습니다: ${message}`);
    }

    // Auto-clear non-quota errors after 5 seconds
    if (!message.includes('Quota exceeded') && !message.includes('resource-exhausted')) {
      setTimeout(() => setGlobalError(null), 5000);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user && user.emailVerified) {
        // Fetch user document from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          const isAdminEmail = user.email === 'saemoyang_official@naver.com' || user.email === 'wnsdl9331@gmail.com';
          
          if (userData.isActive) {
            // Force admin role for hardcoded emails if not already set
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
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), { theme: newTheme });
      } catch (error) {
        console.error('Error updating theme preference:', error);
      }
    }
  };

  useEffect(() => {
    if (!currentUser || (!currentUser.isApproved && currentUser.role !== 'admin')) return;

    const unsubscribeMenus = onSnapshot(collection(db, 'menus'), (snapshot) => {
      const menusData: Menu[] = [];
      snapshot.forEach(doc => menusData.push(doc.data() as Menu));
      setMenus(menusData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'menus');
    });

    const unsubscribeMenuCategories = onSnapshot(collection(db, 'menu_categories'), (snapshot) => {
      const categoriesData: MenuCategory[] = [];
      snapshot.forEach(doc => categoriesData.push(doc.data() as MenuCategory));
      setMenuCategories(categoriesData.sort((a, b) => a.order - b.order));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'menu_categories');
    });

    const unsubscribeIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
      const ingredientsData: Ingredient[] = [];
      snapshot.forEach(doc => ingredientsData.push(doc.data() as Ingredient));
      setIngredients(ingredientsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'ingredients');
    });

    // Fetch changes from last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const qChanges = query(
      collection(db, 'ingredient_changes'),
      where('timestamp', '>=', threeMonthsAgo.toISOString())
    );

    const unsubscribeChanges = onSnapshot(qChanges, (snapshot) => {
      const changesData: IngredientChange[] = [];
      snapshot.forEach(doc => changesData.push(doc.data() as IngredientChange));
      setIngredientChanges(changesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'ingredient_changes');
    });

    return () => {
      unsubscribeMenus();
      unsubscribeMenuCategories();
      unsubscribeIngredients();
      unsubscribeChanges();
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setThresholdType(currentUser.alertThresholdType || 'absolute');
      setThresholdValue(currentUser.alertThresholdValue ?? 0.01);
    }
  }, [currentUser]);

  const handleSaveThreshold = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        alertThresholdType: thresholdType,
        alertThresholdValue: thresholdValue
      });
      setCurrentUser({
        ...currentUser,
        alertThresholdType: thresholdType,
        alertThresholdValue: thresholdValue
      });
      alert('알림 설정이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving threshold:', error);
      alert('설정 저장 중 오류가 발생했습니다.');
    }
  };

  const shouldTriggerAlert = (oldPrice: number, newPrice: number) => {
    const type = currentUser?.alertThresholdType || 'absolute';
    const val = currentUser?.alertThresholdValue ?? 0.01;
    
    if (type === 'absolute') {
      return Math.abs(oldPrice - newPrice) > val;
    } else {
      if (oldPrice === 0) return newPrice > 0;
      const percentChange = (Math.abs(newPrice - oldPrice) / oldPrice) * 100;
      return percentChange > val;
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">로딩 중...</div>;
  }

  const renderGlobalError = () => globalError && (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-rose-600 text-white px-4 py-3 shadow-lg flex items-center justify-between animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} />
        <p className="text-sm font-medium">{globalError}</p>
      </div>
      <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
        <X size={18} />
      </button>
    </div>
  );

  if (!currentUser) {
    return (
      <>
        {renderGlobalError()}
        <Auth />
      </>
    );
  }

  if (!currentUser.isApproved && currentUser.role !== 'admin') {
    return (
      <>
        {renderGlobalError()}
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 mb-2">승인 대기 중</h2>
            <p className="text-slate-600 mb-6">관리자의 가입 승인을 기다리고 있습니다. 승인 후 이용 가능합니다.</p>
            <button onClick={handleLogout} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
              로그아웃
            </button>
          </div>
        </div>
      </>
    );
  }

  const activeMenus = menus.filter(m => !m.isArchived);
  const archivedMenus = menus.filter(m => m.isArchived);

  const handleReorderMenu = async (menuId: string, sourceCategoryId: string | undefined, destinationCategoryId: string | undefined, newIndex: number) => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;

    try {
      if (sourceCategoryId === destinationCategoryId) {
        // Reordering within the same category
        const categoryMenus = menus
          .filter(m => m.categoryId === sourceCategoryId)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const oldIndex = categoryMenus.findIndex(m => m.id === menuId);
        if (oldIndex === newIndex) return;

        const newCategoryMenus = [...categoryMenus];
        const [movedMenu] = newCategoryMenus.splice(oldIndex, 1);
        newCategoryMenus.splice(newIndex, 0, movedMenu);

        for (let i = 0; i < newCategoryMenus.length; i++) {
          if (newCategoryMenus[i].order !== i) {
            await updateDoc(doc(db, 'menus', newCategoryMenus[i].id), { order: i });
          }
        }
      } else {
        // Moving to a different category
        const destCategoryMenus = menus
          .filter(m => m.categoryId === destinationCategoryId)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const newDestCategoryMenus = [...destCategoryMenus];
        newDestCategoryMenus.splice(newIndex, 0, menu);

        // Update the moved menu's category
        await updateDoc(doc(db, 'menus', menu.id), { 
          categoryId: destinationCategoryId || deleteField(),
          order: newIndex
        });

        // Update orders in the destination category
        for (let i = 0; i < newDestCategoryMenus.length; i++) {
          if (newDestCategoryMenus[i].id !== menu.id && newDestCategoryMenus[i].order !== i) {
            await updateDoc(doc(db, 'menus', newDestCategoryMenus[i].id), { order: i });
          }
        }
        
        // Update orders in the source category
        const sourceCategoryMenus = menus
          .filter(m => m.categoryId === sourceCategoryId && m.id !== menu.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
          
        for (let i = 0; i < sourceCategoryMenus.length; i++) {
          if (sourceCategoryMenus[i].order !== i) {
            await updateDoc(doc(db, 'menus', sourceCategoryMenus[i].id), { order: i });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menus');
    }
  };

  const handleToggleMenuVisibility = async (menuId: string) => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;
    try {
      await updateDoc(doc(db, 'menus', menu.id), { isVisible: menu.isVisible === false ? true : false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menus');
    }
  };

  const handleSaveMenu = async (menu: Menu) => {
    try {
      await setDoc(doc(db, 'menus', menu.id), menu);
      setIsMenuModalOpen(false);
      setEditingMenu(undefined);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `menus/${menu.id}`);
    }
  };

  const handleArchiveMenu = async (id: string) => {
    if (window.confirm('메뉴를 보관함으로 이동하시겠습니까?')) {
      try {
        await updateDoc(doc(db, 'menus', id), { isArchived: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `menus/${id}`);
      }
    }
  };

  const handleRestoreMenu = async (id: string) => {
    try {
      await updateDoc(doc(db, 'menus', id), { isArchived: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menus/${id}`);
    }
  };

  const handleDeleteMenu = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'menus', id));
      setIsMenuModalOpen(false);
      setEditingMenu(undefined);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `menus/${id}`);
    }
  };

  const handleDeleteAllMenus = async () => {
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < menus.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = menus.slice(i, i + CHUNK_SIZE);
        chunk.forEach(menu => {
          batch.delete(doc(db, 'menus', menu.id));
        });
        await batch.commit();
      }
      setShowDeleteAllMenusConfirm(false);
      alert('모든 메뉴가 삭제되었습니다.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'menus');
    }
  };

  const handleSaveRecipe = async (menuId: string, recipe: RecipeItem[], notes: string) => {
    try {
      await updateDoc(doc(db, 'menus', menuId), { recipe, notes });
      setIsRecipeModalOpen(false);
      setRecipeMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menus/${menuId}`);
    }
  };

  const handleAcknowledgeAlert = async (menuId: string) => {
    if (currentUser.role !== 'admin') {
      alert('관리자만 알림을 해결할 수 있습니다.');
      return;
    }

    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;

    const currentCost = calculateTotalCost(menu.recipe, ingredients, menus);
    
    try {
      await updateDoc(doc(db, 'menus', menuId), {
        lastAcknowledgedCost: currentCost,
        hasAlert: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menus/${menuId}`);
    }
  };

  const handleDeleteAllIngredients = async () => {
    if (!window.confirm('데이터베이스의 모든 식자재와 변경 이력을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      const CHUNK_SIZE = 500;
      const allOps = [
        ...ingredients.map(ing => ({ type: 'delete' as const, ref: doc(db, 'ingredients', ing.id) })),
        ...ingredientChanges.map(change => ({ type: 'delete' as const, ref: doc(db, 'ingredient_changes', change.id) })),
        ...menus.map(menu => ({ 
          type: 'update' as const, 
          ref: doc(db, 'menus', menu.id), 
          data: { hasAlert: false, lastAcknowledgedCost: deleteField() } 
        }))
      ];

      for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = allOps.slice(i, i + CHUNK_SIZE);
        chunk.forEach(op => {
          if (op.type === 'delete') batch.delete(op.ref);
          else if (op.type === 'update') batch.update(op.ref, op.data);
        });
        await batch.commit();
      }
      
      alert('전체 데이터가 초기화되었습니다. 이제 새로운 데이터를 등록할 수 있습니다.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'all_data');
    }
  };

  const handleUnselectAllIngredients = async () => {
    if (!window.confirm('메뉴용 식자재 선택을 모두 해제하시겠습니까?')) return;
    try {
      const CHUNK_SIZE = 500;
      const allOps: any[] = [];
      
      ingredients.forEach(ing => {
        if (ing.isSelectedForMenu) {
          allOps.push({ type: 'update', ref: doc(db, 'ingredients', ing.id), data: { isSelectedForMenu: false } });
        }
      });
      
      menus.forEach(menu => {
        if (menu.recipe.length > 0) {
          allOps.push({ type: 'update', ref: doc(db, 'menus', menu.id), data: { hasAlert: true } });
        }
      });

      for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = allOps.slice(i, i + CHUNK_SIZE);
        chunk.forEach(op => {
          batch.update(op.ref, op.data);
        });
        await batch.commit();
      }
      
      alert('메뉴용 식자재 선택이 모두 해제되었습니다.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'ingredients');
    }
  };

  const handleSaveIngredients = async (newIngredients: Ingredient[]) => {
    try {
      const CHUNK_SIZE = 500;
      const timestamp = new Date().toISOString();
      const allOps: any[] = [];
      
      // Find deleted ingredients
      const deletedIngredients = ingredients.filter(ing => !newIngredients.find(u => u.id === ing.id));
      
      deletedIngredients.forEach(ing => {
        allOps.push({ type: 'delete', ref: doc(db, 'ingredients', ing.id) });
        
        // Record deletion change
        const changeId = `change-${Date.now()}-${ing.id}`;
        const change: IngredientChange = {
          id: changeId,
          ingredientId: ing.id,
          name: ing.name,
          spec: ing.spec || '',
          type: 'deleted',
          prevPurchasePrice: ing.unitCost || 0,
          prevSalesPrice: ing.unitSalesPrice || 0,
          timestamp
        };
        allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: change });
      });

      const menusToAlert = new Set<string>();
      let changeCount = 0;

      newIngredients.forEach(ing => {
        const prevIng = ingredients.find(p => p.id === ing.id);
        const isNew = !prevIng;
        const isChanged = prevIng && (
          prevIng.name !== ing.name ||
          prevIng.spec !== ing.spec ||
          prevIng.unit !== ing.unit ||
          prevIng.boxCost !== ing.boxCost ||
          prevIng.boxQuantity !== ing.boxQuantity ||
          prevIng.salesPrice !== ing.salesPrice ||
          prevIng.isArchived !== ing.isArchived ||
          prevIng.isSelectedForMenu !== ing.isSelectedForMenu
        );

        if (isNew || isChanged) {
          allOps.push({ type: 'set', ref: doc(db, 'ingredients', ing.id), data: ing });
          
          if (isNew) {
            changeCount++;
            const changeId = `change-${Date.now()}-${ing.id}`;
            const change: IngredientChange = {
              id: changeId,
              ingredientId: ing.id,
              name: ing.name,
              spec: ing.spec || '',
              type: 'new',
              currPurchasePrice: ing.unitCost || 0,
              currSalesPrice: ing.unitSalesPrice || 0,
              timestamp
            };
            allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: change });
          } else {
            const isPurchasePriceChanged = shouldTriggerAlert(prevIng.unitCost, ing.unitCost);
            const isSalesPriceChanged = Math.abs((prevIng.unitSalesPrice || 0) - (ing.unitSalesPrice || 0)) > 0.01;

            if (isPurchasePriceChanged || isSalesPriceChanged) {
              changeCount++;
              const changeId = `change-${Date.now()}-${ing.id}`;
              const change: IngredientChange = {
                id: changeId,
                ingredientId: ing.id,
                name: ing.name,
                spec: ing.spec || '',
                type: 'price_change',
                prevPurchasePrice: prevIng.unitCost || 0,
                currPurchasePrice: ing.unitCost || 0,
                prevSalesPrice: prevIng.unitSalesPrice || 0,
                currSalesPrice: ing.unitSalesPrice || 0,
                timestamp
              };
              allOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', changeId), data: change });

              // Mark menus using this ingredient as having an alert
              menus.forEach(menu => {
                if (doesMenuContainIngredient(menu.recipe, ing.id, menus)) {
                  menusToAlert.add(menu.id);
                }
              });
            }
          }
        }
      });

      // Also mark menus with deleted ingredients as having an alert
      deletedIngredients.forEach(ing => {
        menus.forEach(menu => {
          if (doesMenuContainIngredient(menu.recipe, ing.id, menus)) {
            menusToAlert.add(menu.id);
          }
        });
      });

      // Apply alerts to menus
      menusToAlert.forEach(menuId => {
        allOps.push({ type: 'update', ref: doc(db, 'menus', menuId), data: { hasAlert: true } });
      });

      // If there are too many changes, replace individual change records with a single bulk update record to save quota
      if (changeCount > 50) {
        // Filter out individual change records
        const filteredOps = allOps.filter(op => op.ref.path.split('/')[0] !== 'ingredient_changes');
        
        // Add one bulk update record
        const bulkChangeId = `bulk-change-${Date.now()}`;
        const bulkChange: IngredientChange = {
          id: bulkChangeId,
          ingredientId: 'bulk',
          name: '대량 업데이트',
          spec: `${changeCount}개 품목`,
          type: 'bulk_update',
          timestamp
        };
        filteredOps.push({ type: 'set', ref: doc(db, 'ingredient_changes', bulkChangeId), data: bulkChange });
        
        // Use filtered ops
        for (let i = 0; i < filteredOps.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          const chunk = filteredOps.slice(i, i + CHUNK_SIZE);
          chunk.forEach(op => {
            if (op.type === 'set') batch.set(op.ref, op.data);
            else if (op.type === 'update') batch.update(op.ref, op.data);
            else if (op.type === 'delete') batch.delete(op.ref);
          });
          await batch.commit();
        }
      } else {
        // Use all ops in chunks
        for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          const chunk = allOps.slice(i, i + CHUNK_SIZE);
          chunk.forEach(op => {
            if (op.type === 'set') batch.set(op.ref, op.data);
            else if (op.type === 'update') batch.update(op.ref, op.data);
            else if (op.type === 'delete') batch.delete(op.ref);
          });
          await batch.commit();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'ingredients');
    }
  };

  const handleImportMenuCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const newMenus: Menu[] = results.data.map((row: any, index) => ({
            id: `imported-${Date.now()}-${index}`,
            name: row['메뉴명'] || '이름 없음',
            prices: {
              '지방권': parseInt(row['지방권_판매가']?.replace(/,/g, '')) || 0,
              '광역권': parseInt(row['광역권_판매가']?.replace(/,/g, '')) || 0,
              '수도권': parseInt(row['수도권_판매가']?.replace(/,/g, '')) || 0,
            },
            recipe: [],
            isArchived: false,
            createdAt: new Date().toISOString()
          }));
          
          if (newMenus.length > 0) {
            const CHUNK_SIZE = 500;
            for (let i = 0; i < newMenus.length; i += CHUNK_SIZE) {
              const batch = writeBatch(db);
              const chunk = newMenus.slice(i, i + CHUNK_SIZE);
              chunk.forEach(menu => {
                batch.set(doc(db, 'menus', menu.id), menu);
              });
              await batch.commit();
            }
            alert(`${newMenus.length}개의 메뉴가 추가되었습니다.`);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'menus_import');
        }
      }
    });
    
    if (e.target) e.target.value = '';
  };

  const handleDeleteChange = async (id: string) => {
    if (!window.confirm('이 변동 내역을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'ingredient_changes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ingredient_changes/${id}`);
    }
  };

  const handleExportCsv = () => {
    const data = activeMenus.map(m => {
      const cost = calculateTotalCost(m.recipe, ingredients, menus);
      const row: any = {
        '메뉴명': m.name,
      };
      
      if (visibleColumns.cost) {
        row['원가'] = cost;
      }
      
      (['지방권', '광역권', '수도권'] as Region[]).forEach(r => {
        const price = m.prices[r] || 0;
        const margin = price - cost;
        const costRate = price > 0 ? cost / price : 0;
        const marginRate = price > 0 ? margin / price : 0;
        
        row[`${r}_판매가`] = price;
        if (visibleColumns.margin) row[`${r}_마진`] = margin;
        if (visibleColumns.costRate) row[`${r}_원가율`] = formatPercent(costRate);
        if (visibleColumns.marginRate) row[`${r}_마진율`] = formatPercent(marginRate);
      });
      
      return row;
    });
    
    const csv = Papa.unparse(data);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'menu_data.csv';
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {renderGlobalError()}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">메뉴 원가/마진 대시보드</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">권역별 메뉴 가격 및 레시피 원가 관리</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
                title={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              <button 
                onClick={handleExportCsv}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-sm shadow-sm transition-colors"
              >
                <Download size={16} /> <span className="hidden sm:inline">내보내기</span>
              </button>
            </div>
            
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">{currentUser.name}님</span>
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{currentUser.role === 'admin' ? '관리자' : '사용자'}</span>
              </div>
              
              <div className="flex items-center gap-1">
                {currentUser.role === 'admin' && (
                  <button 
                    onClick={() => setShowAdminPanel(!showAdminPanel)} 
                    className={`p-1.5 rounded-md transition-colors ${showAdminPanel ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    title="관리자 패널"
                  >
                    <Users size={18} />
                  </button>
                )}
                <button 
                  onClick={() => setIsChangePasswordOpen(true)} 
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                  title="비밀번호 변경"
                >
                  <KeyRound size={18} />
                </button>
                <button 
                  onClick={handleLogout} 
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                  title="로그아웃"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {showAdminPanel && currentUser.role === 'admin' && (
          <div className="mb-8">
            <AdminPanel onFirestoreError={handleFirestoreError} ingredients={ingredients} />
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-t-xl shadow-sm border-b border-slate-200 dark:border-slate-800">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.filter(tab => tab !== '변동사항' || currentUser.role === 'admin').map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-slate-900 dark:border-blue-500 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-slate-900 shadow-sm rounded-b-xl overflow-hidden border border-t-0 border-slate-200 dark:border-slate-800">
          {activeTab === '전체보기' ? (
            <OverviewTable 
              menus={activeMenus} 
              menuCategories={menuCategories}
              ingredients={ingredients} 
              isAdmin={currentUser.role === 'admin'}
              visibleColumns={visibleColumns}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onNavigateToTab={setActiveTab}
              onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))}
            />
          ) : activeTab === '메뉴 관리' ? (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">메뉴 관리</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">새로운 메뉴를 추가하거나 보관된 메뉴를 관리합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2 text-sm shadow-sm transition-colors border border-slate-200 dark:border-slate-700"
                  >
                    카테고리 관리
                  </button>
                  <button 
                    onClick={() => setShowDeleteAllMenusConfirm(true)}
                    className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg flex items-center gap-2 text-sm shadow-sm transition-colors border border-rose-200 dark:border-rose-800"
                  >
                    <Trash2 size={18} /> 메뉴 전체 삭제
                  </button>
                  <button 
                    onClick={() => { setEditingMenu(undefined); setIsMenuModalOpen(true); }}
                    className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-700 flex items-center gap-2 text-sm shadow-sm transition-colors"
                  >
                    <Plus size={18} /> 메뉴 추가
                  </button>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Archive size={16} className="text-slate-400" />
                    보관된 메뉴 목록
                  </h3>
                  <ArchiveView 
                    menus={archivedMenus} 
                    ingredients={ingredients} 
                    onRestoreMenu={handleRestoreMenu} 
                    onDeleteMenu={handleDeleteMenu} 
                  />
                </div>
              </div>
            </div>
          ) : activeTab === '데이터 베이스' ? (
            <DatabaseView 
              ingredients={ingredients}
              ingredientChanges={ingredientChanges}
              onSave={handleSaveIngredients}
              onDeleteAll={handleDeleteAllIngredients}
              onUnselectAll={handleUnselectAllIngredients}
              isAdmin={currentUser.role === 'admin'}
              thresholdType={thresholdType}
              thresholdValue={thresholdValue}
              onThresholdTypeChange={setThresholdType}
              onThresholdValueChange={setThresholdValue}
              onSaveThreshold={handleSaveThreshold}
            />
          ) : activeTab === '변동사항' ? (
            <IngredientChangeView 
              changes={ingredientChanges}
              ingredients={ingredients}
              currentUser={currentUser}
              onDeleteChange={handleDeleteChange}
            />
          ) : (
            <MenuTable 
              menus={activeMenus} 
              menuCategories={menuCategories}
              ingredients={ingredients} 
              region={activeTab as Region} 
              visibleColumns={visibleColumns}
              onEditMenu={(menu) => { setEditingMenu(menu); setIsMenuModalOpen(true); }}
              onArchiveMenu={handleArchiveMenu}
              onEditRecipe={(menu) => { setRecipeMenu(menu); setIsRecipeModalOpen(true); }}
              isAdmin={currentUser.role === 'admin'}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onNavigateToTab={setActiveTab}
              onReorderMenu={handleReorderMenu}
              onToggleMenuVisibility={handleToggleMenuVisibility}
              onToggleColumn={(column) => setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {isCategoryModalOpen && (
        <CategoryManagementModal
          categories={menuCategories}
          onSave={handleSaveCategories}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}

      {isMenuModalOpen && (
        <MenuModal 
          menu={editingMenu} 
          menuCategories={menuCategories}
          onSave={handleSaveMenu} 
          onClose={() => { setIsMenuModalOpen(false); setEditingMenu(undefined); }} 
          onArchive={handleArchiveMenu}
          onDelete={handleDeleteMenu}
        />
      )}
      
      {isRecipeModalOpen && recipeMenu && (
        <RecipeModal 
          menu={recipeMenu} 
          ingredients={ingredients}
          menus={menus}
          onSave={handleSaveRecipe}
          onClose={() => { setIsRecipeModalOpen(false); setRecipeMenu(null); }}
        />
      )}

      {isChangePasswordOpen && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}

      {showDeleteAllMenusConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">메뉴 전체 삭제</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              정말로 모든 메뉴를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteAllMenusConfirm(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAllMenus}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
