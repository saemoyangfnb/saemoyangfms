import React, { useState } from 'react';
import { Menu, Region, MenuCategory } from '../types';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  menu?: Menu;
  menuCategories: MenuCategory[];
  onSave: (menu: Menu) => void;
  onClose: () => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const MenuModal: React.FC<Props> = ({ menu, menuCategories, onSave, onClose, onArchive, onDelete }) => {
  const isEdit = !!menu;
  const [name, setName] = useState(menu?.name || '');
  const [categoryId, setCategoryId] = useState(menu?.categoryId || '');
  const [prices, setPrices] = useState<Record<Region, number>>(
    menu?.prices || { '지방권': 0, '광역권': 0, '수도권': 0 }
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newMenu: Menu = {
      id: menu?.id || Date.now().toString(),
      name,
      order: menu?.order ?? 0,
      isVisible: menu?.isVisible ?? true,
      prices,
      recipe: menu?.recipe || [],
      isArchived: menu?.isArchived || false,
      createdAt: menu?.createdAt || new Date().toISOString(),
    };
    
    if (categoryId) {
      newMenu.categoryId = categoryId;
    }
    
    onSave(newMenu);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEdit ? '메뉴 수정' : '새 메뉴 추가'}</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">메뉴명</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="예: 고등어구이"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">카테고리</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="">미분류</option>
                {menuCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">권역별 판매가 설정</h3>
              <div className="space-y-3">
                {(['지방권', '광역권', '수도권'] as Region[]).map(region => (
                  <div key={region} className="flex items-center gap-3">
                    <label className="w-16 text-sm text-slate-600 dark:text-slate-400">{region}</label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        required
                        min="0"
                        step="100"
                        value={prices[region]}
                        onChange={e => setPrices({ ...prices, [region]: parseInt(e.target.value) || 0 })}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-md pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                      <span className="absolute right-3 top-1.5 text-slate-400 text-sm">원</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4">
              <div className="flex gap-2">
                {isEdit && onArchive && (
                  <button type="button" onClick={() => { onArchive(menu.id); onClose(); }} className="px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors">
                    보관함으로 이동
                  </button>
                )}
                {isEdit && onDelete && (
                  <button type="button" onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                    영구 삭제
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
                  취소
                </button>
                <button type="submit" className="px-4 py-2 text-sm text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md">
                  저장
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">메뉴 영구 삭제</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                정말로 이 메뉴를 영구 삭제하시겠습니까?<br />
                <span className="text-rose-600 dark:text-rose-400 font-medium">이 작업은 되돌릴 수 없습니다.</span>
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  취소
                </button>
                <button 
                  onClick={() => {
                    if (menu?.id) {
                      onDelete?.(menu.id);
                      onClose();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/20"
                >
                  삭제하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
