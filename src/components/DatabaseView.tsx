import React, { useState, useRef, useEffect } from 'react';
import { Ingredient, Unit, IngredientChange, CostCalcMethod, User } from '../types';
import { Plus, Archive, Edit2, RotateCcw, Trash2, Upload, Search, AlertTriangle, CheckCircle2, Circle, Download, History } from 'lucide-react';
import { formatCurrency } from '../utils';
import Papa from 'papaparse';
import { PriceHistoryGraph } from './PriceHistoryGraph';
import { IngredientChangeView } from './IngredientChangeView';
import { useToast } from './Toast';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface Props {
  ingredients: Ingredient[];
  ingredientChanges: IngredientChange[];
  onSave: (ingredients: Ingredient[]) => void;
  onDeleteAll: () => void;
  onUnselectAll: () => void;
  isAdmin: boolean;
  currentUser: User;
  onDeleteChange: (id: string) => void;
  thresholdType: 'percentage' | 'absolute';
  thresholdValue: number;
  onThresholdTypeChange: (type: 'percentage' | 'absolute') => void;
  onThresholdValueChange: (value: number) => void;
  onSaveThreshold: () => void;
}

export const DatabaseView: React.FC<Props> = ({
  ingredients: initialIngredients,
  ingredientChanges,
  onSave,
  onDeleteAll,
  onUnselectAll,
  isAdmin,
  currentUser,
  onDeleteChange,
  thresholdType,
  thresholdValue,
  onThresholdTypeChange,
  onThresholdValueChange,
  onSaveThreshold
}) => {
  const toast = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);

  useEffect(() => {
    setIngredients(initialIngredients);
  }, [initialIngredients]);

  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [boxCost, setBoxCost] = useState<number>(0);
  const [salesPrice, setSalesPrice] = useState<number>(0);
  const [boxQuantity, setBoxQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('kg');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'all' | 'changes'>('all');
  const [costCalcMethod, setCostCalcMethod] = useState<CostCalcMethod>('purchase_divide');
  const [manualUnitCost, setManualUnitCost] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logActivity = async (action: string, details: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'activity_logs'), {
        userId: currentUser.uid,
        userName: currentUser.name,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Try to detect encoding or just use Papa's default
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const currentIngredients = [...ingredients];
        let newCount = 0;
        let updateCount = 0;
        let errorCount = 0;

        if (results.data.length === 0) {
          toast.error('파일에 데이터가 없습니다.');
          return;
        }

        // Check if required headers exist (at least '상품명' or '매입가')
        const firstRow = results.data[0] as any;
        const hasRequiredHeaders = ('상품명' in firstRow || 'Name' in firstRow) && ('매입가' in firstRow || 'Cost' in firstRow);

        if (!hasRequiredHeaders) {
          toast.error('CSV 형식 오류: 필수 항목(상품명, 매입가)이 없습니다. 템플릿을 다운로드하여 형식을 확인해주세요.');
          return;
        }

        results.data.forEach((row: any) => {
          try {
            const name = (row['상품명'] || row['Name'] || row['item'])?.trim() || '';
            const spec = (row['규격'] || row['Spec'] || row['size'])?.toString().trim() || '';
            const boxCostStr = (row['매입가'] || row['Cost'] || row['price'])?.toString().replace(/,/g, '');
            const boxCost = parseFloat(boxCostStr);
            const salesPriceStr = (row['매출가'] || row['Sales'] || row['sell'])?.toString().replace(/,/g, '');
            const salesPrice = parseFloat(salesPriceStr) || 0;

            const nameText = name.toLowerCase().replace(/\s/g, '');
            const specText = spec.toLowerCase().replace(/\s/g, '');
            const searchText = nameText + specText;

            let unit: Unit = 'ea';
            let boxQuantity = 1;

            // 💡 [프랜차이즈 전용 특수 규칙]
            if (nameText.includes('아이스홍시') || nameText.includes('아이스 홍시')) {
              unit = '수';
              boxQuantity = 144;
            } else if (nameText.includes('백미새우')) {
              unit = '미';
              let trayCount = 1;
              const trayMatch = searchText.match(/(\d+)(?:트레이|팩|개)/);
              if (trayMatch) {
                trayCount = parseInt(trayMatch[1], 10);
              }
              boxQuantity = 20 * trayCount;
            } else if (nameText.includes('국내산고등어') && nameText.includes('원물')) {
              unit = '미';
              boxQuantity = 28;
            } else if (searchText.includes('미')) {
              const match = searchText.match(/(\d+)미/);
              if (match) {
                boxQuantity = parseInt(match[1]);
                unit = '미';
              }
            } else if (searchText.includes('kg')) {
              const match = searchText.match(/([\d\.]+)kg/);
              if (match) {
                const weightKg = parseFloat(match[1]);
                boxQuantity = weightKg * 1000;
                unit = 'g';
              }
            } else if (searchText.includes('g')) {
              const match = searchText.match(/([\d\.]+)g/);
              if (match) {
                boxQuantity = parseFloat(match[1]);
                unit = 'g';
              }
            } else if (searchText.includes('개') || searchText.includes('팩')) {
              const match = searchText.match(/(\d+)(개|팩)/);
              if (match) {
                boxQuantity = parseInt(match[1]);
                unit = 'ea';
              }
            } else {
              // Fallback to existing columns if parsing fails
              const unitStr = (row['단위'] || row['Unit'] || row['unit'])?.trim().toLowerCase();
              boxQuantity = Math.max(0.001, parseFloat(row['내품수량'] || row['Quantity'] || row['qty'] || row['count']) || 1);
              if (unitStr === 'kg') unit = 'kg';
              else if (unitStr === 'g') unit = 'g';
              else if (unitStr === '미') unit = '미';
            }

            if (name && !isNaN(boxCost)) {
              const unitCost = Math.round(boxCost / boxQuantity);
              const unitSalesPrice = Math.round(salesPrice / boxQuantity);
              const existingIndex = currentIngredients.findIndex(ing => ing.name === name);

              if (existingIndex !== -1) {
                // Update existing
                currentIngredients[existingIndex] = {
                  ...currentIngredients[existingIndex],
                  spec,
                  boxCost,
                  salesPrice,
                  boxQuantity,
                  unitCost,
                  unitSalesPrice,
                  unit,
                  isArchived: false
                };
                updateCount++;
              } else {
                // Add new
                currentIngredients.push({
                  id: Date.now().toString() + Math.random().toString(36).substring(7),
                  name,
                  spec,
                  boxCost,
                  salesPrice,
                  boxQuantity,
                  unitCost,
                  unitSalesPrice,
                  unit,
                  isArchived: false,
                  createdAt: new Date().toISOString()
                });
                newCount++;
              }
            } else {
              if (name || boxCostStr) errorCount++;
            }
          } catch (e) {
            errorCount++;
          }
        });

        if (newCount > 0 || updateCount > 0) {
          setIngredients(currentIngredients);
          onSave(currentIngredients);
          const errMsg = errorCount > 0 ? ` (${errorCount}행 제외)` : '';
          toast.success(`CSV 업로드 완료: 신규 ${newCount}건, 업데이트 ${updateCount}건${errMsg}`);
          logActivity('엑셀 업로드', `식자재 CSV 일괄 업로드 (신규 ${newCount}건, 업데이트 ${updateCount}건)`);
        } else {
          toast.error('유효한 데이터가 없습니다. CSV 파일 형식을 확인해주세요.');
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        toast.error(`CSV 파일 읽기 오류: ${error.message}`);
      }
    });
  };

  const downloadTemplate = () => {
    const headers = ['상품명', '규격', '매입가', '매출가', '단위', '내품수량'];
    const csvContent = "\uFEFF" + headers.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '식자재_업로드_템플릿.csv';
    link.click();
    logActivity('엑셀 다운로드', '식자재 업로드용 CSV 템플릿 다운로드');
  };

  const computeUnitCost = (bc: number, sp: number, bq: number, method: CostCalcMethod, manual: number): number => {
    if (method === 'manual') return manual;
    if (method === 'sales_divide') return bq > 0 ? Math.round(sp / bq) : 0;
    return bq > 0 ? Math.round(bc / bq) : 0;
  };

  const handleAddOrUpdate = () => {
    if (!name || boxCost < 0 || boxQuantity <= 0) return;

    const unitCost = computeUnitCost(boxCost, salesPrice, boxQuantity, costCalcMethod, manualUnitCost);
    const unitSalesPrice = Math.round(salesPrice / boxQuantity);
    let updated: Ingredient[];

    if (editingId) {
      updated = ingredients.map(ing =>
        ing.id === editingId ? { ...ing, name, spec, boxCost, salesPrice, boxQuantity, unitCost, unitSalesPrice, unit, costCalcMethod } : ing
      );
      setEditingId(null);
    } else {
      updated = [...ingredients, {
        id: Date.now().toString(),
        name,
        spec,
        boxCost,
        salesPrice,
        boxQuantity,
        unitCost,
        unitSalesPrice,
        unit,
        costCalcMethod,
        isArchived: false,
        createdAt: new Date().toISOString()
      }];
    }
    
    setIngredients(updated);
    onSave(updated);
    
    setName('');
    setSpec('');
    setBoxCost(0);
    setSalesPrice(0);
    setBoxQuantity(1);
    setUnit('kg');
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSpec('');
    setBoxCost(0);
    setSalesPrice(0);
    setBoxQuantity(1);
    setUnit('kg');
    setCostCalcMethod('purchase_divide');
    setManualUnitCost(0);
  };

  const handleEdit = (ing: Ingredient) => {
    setEditingId(ing.id);
    setName(ing.name);
    setSpec(ing.spec || '');
    setBoxCost(ing.boxCost);
    setSalesPrice(ing.salesPrice || 0);
    setBoxQuantity(ing.boxQuantity);
    setUnit(ing.unit);
    setCostCalcMethod(ing.costCalcMethod || 'purchase_divide');
    setManualUnitCost(ing.unitCost);
    
    // Scroll to form
    const formElement = document.getElementById('ingredient-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleArchive = (id: string) => {
    const updated = ingredients.map(ing => ing.id === id ? { ...ing, isArchived: true } : ing);
    setIngredients(updated);
    onSave(updated);
  };

  const handleRestore = (id: string) => {
    const updated = ingredients.map(ing => ing.id === id ? { ...ing, isArchived: false } : ing);
    setIngredients(updated);
    onSave(updated);
  };

  const handlePermanentDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllType, setDeleteAllType] = useState<'all' | 'active' | null>(null);

  const handleToggleSelection = (id: string) => {
    const updated = ingredients.map(ing => 
      ing.id === id ? { ...ing, isSelectedForMenu: !ing.isSelectedForMenu } : ing
    );
    setIngredients(updated);
    onSave(updated);
  };

  const activeIngredients = ingredients.filter(ing => !ing.isArchived && ing.isSelectedForMenu);
  const archivedIngredients = ingredients.filter(ing => ing.isArchived);
  const allIngredients = ingredients.filter(ing => !ing.isArchived);

  const displayedIngredients = (
    activeTab === 'active' ? activeIngredients : 
    activeTab === 'archived' ? archivedIngredients : 
    allIngredients
  ).filter(ing => ing.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 pt-2 shrink-0 items-center">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'active' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          메뉴용 식자재
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'all' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          전체 데이터베이스
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'archived' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          보관함
        </button>
        <button
          onClick={() => setActiveTab('changes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1.5 ${activeTab === 'changes' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          <History size={14} />
          변동사항
        </button>
        <div className="ml-auto pb-2 flex items-center gap-4">
          {activeTab !== 'changes' && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="식자재 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-64"
                />
              </div>
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors font-medium border border-blue-200 dark:border-blue-800"
                title="CSV 템플릿 다운로드"
              >
                <Download size={16} />
                템플릿
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-md transition-colors font-medium border border-emerald-200 dark:border-emerald-800"
              >
                <Upload size={16} />
                CSV 불러오기
              </button>
              <button
                onClick={() => {
                  setDeleteAllType(activeTab === 'active' ? 'active' : 'all');
                  setShowDeleteAllConfirm(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-md transition-colors font-medium border border-rose-200 dark:border-rose-800"
              >
                <Trash2 size={16} />
                {activeTab === 'active' ? '메뉴용 식자재 전체 삭제' : '전체 데이터 삭제'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert Sensitivity Settings */}
      {isAdmin && (activeTab === 'active' || activeTab === 'all') && (
        <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">변동 알림 민감도 설정:</span>
          </div>
          <div className="flex items-center gap-2">
            <select 
              value={thresholdType}
              onChange={(e) => onThresholdTypeChange(e.target.value as 'percentage' | 'absolute')}
              className="text-xs border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="absolute">절대값 (원)</option>
              <option value="percentage">퍼센트 (%)</option>
            </select>
            <input 
              type="number"
              step={thresholdType === 'absolute' ? '1' : '0.1'}
              value={thresholdValue}
              onChange={(e) => onThresholdValueChange(parseFloat(e.target.value) || 0)}
              className="w-20 text-xs border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-right"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {thresholdType === 'absolute' ? '원 초과 변동 시 알림' : '% 초과 변동 시 알림'}
            </span>
          </div>
          <button 
            onClick={onSaveThreshold}
            className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 transition-colors font-medium"
          >
            설정 저장
          </button>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
            * 매입단가 변동이 설정값보다 클 경우에만 '변동사항'에 기록되고 메뉴에 경고가 표시됩니다.
          </p>
        </div>
      )}

      {(activeTab === 'active' || activeTab === 'all') && (
        <div 
          id="ingredient-form"
          className={`p-4 border-b shrink-0 transition-all duration-300 ${
            editingId 
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-inner' 
              : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit2 size={16} className="text-blue-600" />
                  <span className="text-blue-600">식자재 수정 중</span>
                </>
              ) : (
                <>
                  <Plus size={16} className="text-slate-600" />
                  <span>새 식자재 추가</span>
                </>
              )}
            </h3>
            {editingId && (
              <button 
              onClick={resetForm}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              수정 취소
            </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              {editingId ? '수정 중인 재료명' : '재료명'}
            </label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              className={`w-full border rounded-md px-3 py-2 text-sm transition-all ${
                editingId 
                  ? 'border-blue-400 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900' 
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
              } text-slate-900 dark:text-white`}
              placeholder="예: 고등어"
            />
          </div>
          <div className="w-full sm:w-24">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">규격</label>
            <input 
              type="text" 
              value={spec} 
              onChange={e => setSpec(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="3kg"
            />
          </div>
          <div className="w-[calc(50%-6px)] sm:w-28">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">매입가(박스)</label>
            <input 
              type="number" 
              min="0" 
              step="100"
              value={boxCost} 
              onChange={e => setBoxCost(parseInt(e.target.value) || 0)}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="w-[calc(50%-6px)] sm:w-28">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">매출가</label>
            <input 
              type="number" 
              min="0" 
              step="100"
              value={salesPrice} 
              onChange={e => setSalesPrice(parseInt(e.target.value) || 0)}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="w-[calc(50%-6px)] sm:w-24">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">박스당 수량</label>
            <input 
              type="number" 
              min="0.1" 
              step="0.1"
              value={boxQuantity} 
              onChange={e => setBoxQuantity(parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="w-[calc(50%-6px)] sm:w-20">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">단위</label>
            <select 
              value={unit} 
              onChange={e => setUnit(e.target.value as Unit)}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-2 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="ea">ea</option>
              <option value="미">미</option>
            </select>
          </div>
          <div className="w-full sm:w-36">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">단가 계산 방식</label>
            <select
              value={costCalcMethod}
              onChange={e => {
                const method = e.target.value as CostCalcMethod;
                setCostCalcMethod(method);
                if (method !== 'manual') setManualUnitCost(0);
                else setManualUnitCost(computeUnitCost(boxCost, salesPrice, boxQuantity, 'purchase_divide', 0));
              }}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-2 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="purchase_divide">매입가 ÷ 수량</option>
              <option value="sales_divide">매출가 ÷ 수량</option>
              <option value="manual">직접 입력</option>
            </select>
          </div>
          {costCalcMethod === 'manual' ? (
            <div className="w-full sm:w-24">
              <label className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 uppercase tracking-wider">매입단가 (직접)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={manualUnitCost}
                onChange={e => setManualUnitCost(parseInt(e.target.value) || 0)}
                className="w-full border border-amber-400 dark:border-amber-600 rounded-md px-3 py-2 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
              />
            </div>
          ) : (
            <div className="w-full sm:w-24 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-right">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5 text-left uppercase">매입단가</label>
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
                {formatCurrency(computeUnitCost(boxCost, salesPrice, boxQuantity, costCalcMethod, 0))}
              </span>
            </div>
          )}
          <div className="w-full sm:w-24 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md border border-blue-100 dark:border-blue-800 text-right">
            <label className="block text-[10px] font-bold text-blue-500 dark:text-blue-400 mb-0.5 text-left uppercase">매출단가</label>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(boxQuantity > 0 ? Math.round(salesPrice / boxQuantity) : 0)}
            </span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={handleAddOrUpdate}
              disabled={!name || boxQuantity <= 0}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-md font-bold text-sm h-[38px] transition-all flex items-center justify-center gap-2 shadow-sm ${
                editingId 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white'
              } disabled:opacity-50`}
            >
              {editingId ? '수정 완료' : <><Plus size={18} /> 추가</>}
            </button>
            {editingId && (
              <>
                <button 
                  onClick={() => {
                    handleArchive(editingId);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 text-sm font-bold h-[38px] transition-colors shadow-sm"
                >
                  보관함
                </button>
                <button 
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 text-sm font-bold h-[38px] transition-colors shadow-sm"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}

      {/* 변동사항 탭 */}
      {activeTab === 'changes' && (
        <div className="flex-1 overflow-auto">
          <IngredientChangeView
            changes={ingredientChanges}
            ingredients={ingredients}
            currentUser={currentUser}
            onDeleteChange={onDeleteChange}
          />
        </div>
      )}

      <div className={`flex-1 overflow-auto p-4 ${activeTab === 'changes' ? 'hidden' : ''}`}>
        {/* Desktop Table */}
        <div className="hidden md:block min-w-[800px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="pb-2 w-10 text-center">선택</th>
                <th className="pb-2">재료명</th>
                <th className="pb-2">규격</th>
                <th className="pb-2 text-right">매입가</th>
                <th className="pb-2 text-right">매출가</th>
                <th className="pb-2 text-right">수량</th>
                <th className="pb-2 text-center">단위</th>
                <th className="pb-2 text-right">매입단가</th>
                <th className="pb-2 text-right">매출단가</th>
                <th className="pb-2 text-center w-20">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {displayedIngredients.map(ing => (
                <tr 
                  key={ing.id} 
                  className={`hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors group ${editingId === ing.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                  onMouseEnter={(e) => { setHoveredId(ing.id); handleMouseMove(e); }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <td className="py-2 text-center">
                    <button 
                      onClick={() => handleToggleSelection(ing.id)}
                      className={`transition-colors ${ing.isSelectedForMenu ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700 hover:text-slate-400'}`}
                    >
                      {ing.isSelectedForMenu ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                  </td>
                  <td className="py-2 text-slate-900 dark:text-slate-100 group-hover:text-blue-800 dark:group-hover:text-blue-400 transition-colors">{ing.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{ing.spec}</td>
                  <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatCurrency(ing.boxCost)}</td>
                  <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatCurrency(ing.salesPrice || 0)}</td>
                  <td className="py-2 text-right text-slate-500 dark:text-slate-400">{ing.boxQuantity}</td>
                  <td className="py-2 text-center text-slate-500 dark:text-slate-400">{ing.unit}</td>
                  <td className="py-2 text-right">
                    <div className="text-slate-500 dark:text-slate-400">{formatCurrency(ing.unitCost)}</div>
                    {ing.costCalcMethod && ing.costCalcMethod !== 'purchase_divide' && (
                      <div className={`text-[10px] font-bold mt-0.5 ${ing.costCalcMethod === 'manual' ? 'text-amber-500' : 'text-indigo-500'}`}>
                        {ing.costCalcMethod === 'manual' ? '직접입력' : '매출가÷'}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-medium text-blue-600 dark:text-blue-400">{formatCurrency(ing.unitSalesPrice || 0)}</td>
                  <td className="py-2 text-center space-x-1">
                    {isAdmin && (activeTab === 'active' || activeTab === 'all') ? (
                      <>
                        <button onClick={() => handleEdit(ing)} className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors" title="수정">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleArchive(ing.id)} className="p-1 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded transition-colors" title="보관">
                          <Archive size={16} />
                        </button>
                      </>
                    ) : isAdmin ? (
                      <>
                        <button onClick={() => handleRestore(ing.id)} className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition-colors" title="복구">
                          <RotateCcw size={16} />
                        </button>
                        <button onClick={() => handlePermanentDelete(ing.id)} className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors" title="영구 삭제">
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400">권한 없음</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {displayedIngredients.map(ing => (
            <div 
              key={ing.id}
              className={`bg-white dark:bg-slate-900 rounded-xl p-4 border transition-all ${
                editingId === ing.id 
                  ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md' 
                  : 'border-slate-200 dark:border-slate-800 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleToggleSelection(ing.id)}
                    className={`transition-colors ${ing.isSelectedForMenu ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-700'}`}
                  >
                    {ing.isSelectedForMenu ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </button>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{ing.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ing.spec || '규격 없음'} | {ing.unit}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {isAdmin && (activeTab === 'active' || activeTab === 'all') ? (
                    <>
                      <button onClick={() => handleEdit(ing)} className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleArchive(ing.id)} className="p-2 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Archive size={18} />
                      </button>
                    </>
                  ) : isAdmin ? (
                    <>
                      <button onClick={() => handleRestore(ing.id)} className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <RotateCcw size={18} />
                      </button>
                      <button onClick={() => handlePermanentDelete(ing.id)} className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">매입가 (박스)</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(ing.boxCost)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">단가: {formatCurrency(ing.unitCost)}</p>
                </div>
                <div className="bg-blue-50/50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800">
                  <p className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-bold mb-1">매출가</p>
                  <p className="font-semibold text-blue-700 dark:text-blue-300">{formatCurrency(ing.salesPrice || 0)}</p>
                  <p className="text-[10px] text-blue-400 mt-1">단가: {formatCurrency(ing.unitSalesPrice || 0)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {displayedIngredients.length === 0 && (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            {searchQuery 
              ? '검색 결과가 없습니다.' 
              : (activeTab === 'active' ? '등록된 식자재가 없습니다.' : '데이터가 없습니다.')}
          </div>
        )}
      </div>

      {hoveredId && activeTab !== 'changes' && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{ left: hoverPosition.x, top: hoverPosition.y }}
        >
          <PriceHistoryGraph ingredientId={hoveredId} changes={ingredientChanges} />
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">식자재 영구 삭제</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              정말로 이 식자재를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const updated = ingredients.filter(ing => ing.id !== deleteConfirmId);
                  setIngredients(updated);
                  onSave(updated);
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">
                {deleteAllType === 'active' ? '메뉴용 식자재 전체 삭제' : '전체 데이터 삭제'}
              </h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {deleteAllType === 'active' 
                ? '메뉴용으로 선택된 모든 식자재를 목록에서 제거하시겠습니까?' 
                : '데이터베이스의 모든 식자재와 변동 이력을 삭제하고 메뉴 알림을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteAllConfirm(false);
                  setDeleteAllType(null);
                }}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (deleteAllType === 'active') {
                    onUnselectAll();
                  } else {
                    onDeleteAll();
                  }
                  setShowDeleteAllConfirm(false);
                  setDeleteAllType(null);
                }}
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
};
