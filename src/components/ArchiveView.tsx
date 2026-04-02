import React, { useState } from 'react';
import { Menu, Ingredient } from '../types';
import { calculateTotalCost, formatCurrency } from '../utils';
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react';

interface Props {
  menus: Menu[];
  ingredients: Ingredient[];
  onRestoreMenu: (id: string) => void;
  onDeleteMenu: (id: string) => void;
}

export const ArchiveView: React.FC<Props> = ({ menus, ingredients, onRestoreMenu, onDeleteMenu }) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
        <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="px-4 py-3">메뉴명</th>
            <th className="px-4 py-3 text-right">원가</th>
            <th className="px-4 py-3 text-center">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {menus.map(menu => {
            const cost = calculateTotalCost(menu.recipe, ingredients, menus);

            return (
              <tr key={menu.id} className="bg-white dark:bg-slate-900 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors group">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-800 dark:group-hover:text-blue-400 transition-colors">{menu.name}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(cost)}</td>
                <td className="px-4 py-3 text-center space-x-2">
                  <button onClick={() => onRestoreMenu(menu.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors" title="복구">
                    <RotateCcw size={16} />
                  </button>
                  <button onClick={() => setDeleteConfirmId(menu.id)} className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md transition-colors" title="영구 삭제">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {menus.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">보관된 메뉴가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">메뉴 영구 삭제</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              정말로 이 메뉴를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
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
                  onDeleteMenu(deleteConfirmId);
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
