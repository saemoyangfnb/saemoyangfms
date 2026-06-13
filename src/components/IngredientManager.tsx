import React, { useState, useRef } from 'react';
import { Ingredient, Unit, IngredientChange } from '../types';
import { X, Plus, Archive, Edit2, RotateCcw, Trash2, Upload, Search, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { formatCurrency } from '../utils';
import Papa from 'papaparse';
import { PriceHistoryGraph } from './PriceHistoryGraph';
import { useToast } from './Toast';

interface Props {
  ingredients: Ingredient[];
  ingredientChanges: IngredientChange[];
  onSave: (ingredients: Ingredient[]) => void;
  onClose: () => void;
}

export const IngredientManager: React.FC<Props> = ({ ingredients: initialIngredients, ingredientChanges, onSave, onClose }) => {
  const toast = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [boxCost, setBoxCost] = useState<number>(0);
  const [salesPrice, setSalesPrice] = useState<number>(0);
  const [boxQuantity, setBoxQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('kg');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    setHoverPosition({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newIngredients: Ingredient[] = [];
        let errorCount = 0;

        results.data.forEach((row: any) => {
          try {
            // CSV 헤더: 상품명, 규격, 매입가, 매출가, 단위, 내품수량
            const name = row['상품명']?.trim();
            const spec = row['규격']?.toString() || '';
            const boxCostStr = row['매입가']?.toString().replace(/,/g, '');
            const boxCost = parseFloat(boxCostStr);
            const salesPriceStr = row['매출가']?.toString().replace(/,/g, '');
            const salesPrice = parseFloat(salesPriceStr) || 0;
            const unitStr = row['단위']?.trim().toLowerCase();
            const boxQuantity = parseFloat(row['내품수량']) || 1;

            // 단위 매핑
            let unit: Unit = 'ea';
            if (unitStr === 'kg') unit = 'kg';
            else if (unitStr === 'g') unit = 'g';
            else if (unitStr === '미') unit = '미';

            if (name && !isNaN(boxCost)) {
              const unitCost = Math.round(boxCost / boxQuantity);
              const unitSalesPrice = Math.round(salesPrice / boxQuantity);

              newIngredients.push({
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
            } else {
              errorCount++;
            }
          } catch (e) {
            errorCount++;
          }
        });

        if (newIngredients.length > 0) {
          setIngredients(prev => [...prev, ...newIngredients]);
          toast.success(`${newIngredients.length}개의 식자재를 불러왔습니다.${errorCount > 0 ? ` (${errorCount}개 형식 오류 제외)` : ''}`);
        } else {
          toast.error('불러올 수 있는 유효한 데이터가 없습니다. CSV 파일 형식을 확인해주세요.');
        }

        // 파일 입력 초기화
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        toast.error(`CSV 파일 읽기 오류: ${error.message}`);
      }
    });
  };

  const handleAddOrUpdate = () => {
    if (!name || boxCost < 0 || boxQuantity <= 0) return;

    const unitCost = Math.round(boxCost / boxQuantity);

    if (editingId) {
      setIngredients(ingredients.map(ing => 
        ing.id === editingId ? { ...ing, name, spec, boxCost, salesPrice, boxQuantity, unitCost, unit } : ing
      ));
      setEditingId(null);
    } else {
      setIngredients([...ingredients, {
        id: Date.now().toString(),
        name,
        spec,
        boxCost,
        salesPrice,
        boxQuantity,
        unitCost,
        unitSalesPrice: salesPrice > 0 && boxQuantity > 0 ? Math.round(salesPrice / boxQuantity) : 0,
        unit,
        isArchived: false,
        createdAt: new Date().toISOString()
      }]);
    }
    setName('');
    setSpec('');
    setBoxCost(0);
    setSalesPrice(0);
    setBoxQuantity(1);
    setUnit('kg');
  };

  const handleEdit = (ing: Ingredient) => {
    setEditingId(ing.id);
    setName(ing.name);
    setSpec(ing.spec || '');
    setBoxCost(ing.boxCost);
    setSalesPrice(ing.salesPrice || 0);
    setBoxQuantity(ing.boxQuantity);
    setUnit(ing.unit);
  };

  const handleArchive = (id: string) => {
    setIngredients(ingredients.map(ing => ing.id === id ? { ...ing, isArchived: true } : ing));
  };

  const handleRestore = (id: string) => {
    setIngredients(ingredients.map(ing => ing.id === id ? { ...ing, isArchived: false } : ing));
  };

  const handlePermanentDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleToggleSelection = (id: string) => {
    setIngredients(ingredients.map(ing => 
      ing.id === id ? { ...ing, isSelectedForMenu: !ing.isSelectedForMenu } : ing
    ));
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">식자재 관리</h2>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-md transition-colors font-medium border border-emerald-200 dark:border-emerald-800"
              title="CSV 파일 업로드 (형식: 출처분류,제품명,규격,총 가격,기준 단위,1단위당 단가(원))"
            >
              <Upload size={16} />
              CSV 불러오기
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              <X size={20} />
            </button>
          </div>
        </div>

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
          <div className="ml-auto pb-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="식자재 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-64"
            />
          </div>
        </div>

        {activeTab === 'active' && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/30 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">재료명</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="예: 고등어"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">규격</label>
              <input 
                type="text" 
                value={spec} 
                onChange={e => setSpec(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="3kg"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">매입가(박스)</label>
              <input 
                type="number" 
                min="0" 
                step="100"
                value={boxCost} 
                onChange={e => setBoxCost(parseInt(e.target.value) || 0)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">매출가</label>
              <input 
                type="number" 
                min="0" 
                step="100"
                value={salesPrice} 
                onChange={e => setSalesPrice(parseInt(e.target.value) || 0)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">박스당 수량</label>
              <input 
                type="number" 
                min="0.1" 
                step="0.1"
                value={boxQuantity} 
                onChange={e => setBoxQuantity(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">단위</label>
              <select 
                value={unit} 
                onChange={e => setUnit(e.target.value as Unit)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="ea">ea</option>
                <option value="미">미</option>
              </select>
            </div>
            <div className="w-24 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-right">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 text-left">단가(원)</label>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrency(boxQuantity > 0 ? Math.round(boxCost / boxQuantity) : 0)}
              </span>
            </div>
            <button 
              onClick={handleAddOrUpdate}
              disabled={!name || boxQuantity <= 0}
              className="px-3 py-1.5 bg-slate-900 dark:bg-blue-600 text-white rounded-md hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm h-[34px] transition-colors"
            >
              {editingId ? '수정' : <><Plus size={16} /> 추가</>}
            </button>
            {editingId && (
              <>
                <button 
                  onClick={() => {
                    handleArchive(editingId);
                    setEditingId(null);
                    setName('');
                    setBoxCost(0);
                    setBoxQuantity(1);
                    setUnit('kg');
                  }}
                  className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 text-sm h-[34px] transition-colors"
                >
                  보관함 이동
                </button>
                <button 
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                    setBoxCost(0);
                    setBoxQuantity(1);
                    setUnit('kg');
                  }}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 text-sm h-[34px] transition-colors"
                >
                  취소
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
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
                <th className="pb-2 text-right">단가(원)</th>
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
                  <td className="py-2 text-right font-medium text-blue-600 dark:text-blue-400">{formatCurrency(ing.unitCost)}</td>
                  <td className="py-2 text-center space-x-1">
                    {activeTab === 'active' ? (
                      <>
                        <button onClick={() => handleEdit(ing)} className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors" title="수정">
                          <Edit2 size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleRestore(ing.id)} className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition-colors" title="복구">
                          <RotateCcw size={16} />
                        </button>
                        <button onClick={() => handlePermanentDelete(ing.id)} className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors" title="영구 삭제">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {displayedIngredients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    {searchQuery 
                      ? '검색 결과가 없습니다.' 
                      : (activeTab === 'active' ? '등록된 식자재가 없습니다.' : '보관된 식자재가 없습니다.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors">
            취소
          </button>
          <button onClick={() => onSave(ingredients)} className="px-4 py-2 text-sm text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md transition-colors">
            저장
          </button>
        </div>
      </div>

      {/* Hover Graph */}
      {hoveredId && (
        <div 
          className="fixed z-[100] pointer-events-none"
          style={{ left: hoverPosition.x, top: hoverPosition.y }}
        >
          <PriceHistoryGraph ingredientId={hoveredId} changes={ingredientChanges} />
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
                  setIngredients(ingredients.filter(ing => ing.id !== deleteConfirmId));
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
    </div>
  );
};
