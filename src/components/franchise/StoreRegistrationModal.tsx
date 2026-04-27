import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { salesDb as db, db as mainDb } from '../../firebase';
import { collection, addDoc, onSnapshot, doc } from 'firebase/firestore';
import { FranchiseSchedule, BrandId, TeamSetting, SystemConfig } from '../../types';
import { useToast } from '../Toast';

interface Props {
  brandId: BrandId;
  teams: TeamSetting[];
  schedules?: FranchiseSchedule[];
  onClose: () => void;
  onCreated: (id: string) => void;
}

const COLOR_OPTIONS = [
  { value: 'slate', label: '회색' },
  { value: 'red', label: '빨강' },
  { value: 'orange', label: '주황' },
  { value: 'amber', label: '노랑' },
  { value: 'green', label: '초록' },
  { value: 'teal', label: '청록' },
  { value: 'blue', label: '파랑' },
  { value: 'indigo', label: '남색' },
  { value: 'violet', label: '보라' },
  { value: 'pink', label: '분홍' },
];

const DEFAULT_CONFIG: SystemConfig = {
  constTypes: ['더원', '감리', '직접시공'],
  signTypes: ['동영', '직접', '기타'],
  kitchenVendors: ['형제', '신광', '주원', '기타'],
  preTrainingLocations: ['남원', '예당마을', '청주율량', '직접입력'],
  gasTypes: ['도시가스', 'LPG']
};

const ALL_COLORS = [
  'blue','rose','emerald','amber','purple','cyan','pink','indigo',
  'violet','fuchsia','orange','teal','sky','lime','yellow','red',
  'stone','zinc','slate','neutral'
];

export function StoreRegistrationModal({ brandId, teams, schedules = [], onClose, onCreated }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [sysConfig, setSysConfig] = useState<SystemConfig>(DEFAULT_CONFIG);

  // 사용 중인 색상 / 다음 호수 계산
  const usedColors = new Set(schedules.filter(s => !s.archived).map(s => s.colorCode).filter(Boolean));
  const nextColor = ALL_COLORS.find(c => !usedColors.has(c)) || 'slate';
  const nextNumber = (() => {
    const nums = schedules.map(s => parseInt(s.storeNumber?.replace(/[^0-9]/g, '') || '0', 10)).filter(n => n > 0);
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  })();

  // 💡 공통 코드 실시간 로드
  useEffect(() => {
    const unsub = onSnapshot(doc(mainDb, 'system_settings', 'config'), (snap) => {
      if (snap.exists()) {
        setSysConfig(snap.data() as SystemConfig);
        // 기본값 설정
        const data = snap.data() as SystemConfig;
        setForm(prev => ({
          ...prev,
          constructionType: data.constTypes[0] || '',
          signageType: data.signTypes[0] || '',
          kitchenSupplier: data.kitchenVendors[0] || '',
          gasType: data.gasTypes[0] || '',
        }));
      }
    });
    return () => unsub();
  }, []);

  const [form, setForm] = useState({
    storeNumber: `${nextNumber}호`,
    storeName: '',
    team: '',
    supervisor: '',
    colorCode: nextColor,
    constructionType: '더원',
    signageType: '동영',
    kitchenSupplier: '형제',
    gasType: '도시가스',
    constructionStart: '',
    constructionEnd: '',
    notes: '',
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const isDuplicateNumber = schedules.some(s => s.storeNumber?.trim() === form.storeNumber.trim());

  const handleSave = async () => {
    if (!form.storeName.trim()) {
      toast.error('매장명을 입력해주세요.');
      return;
    }
    if (isDuplicateNumber) {
      toast.error('이미 등록된 매장 호수입니다.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'franchise_schedules'), {
        brandId,
        storeNumber: form.storeNumber.trim(),
        storeName: form.storeName.trim(),
        team: form.team,
        supervisor: form.supervisor.trim(),
        colorCode: form.colorCode,
        constructionType: form.constructionType,
        signageType: form.signageType,
        kitchenSupplier: form.kitchenSupplier,
        gasType: form.gasType,
        notes: form.notes.trim(),
        showInCalendar: true,
        archived: false,
        checklistData: {},
        progressCheck: { drawingUpload: false, ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false },
        constructionStart: form.constructionStart, constructionEnd: form.constructionEnd, ovenIn: '', ovenEnd: '', burnerIn: '',
        initialStockIn: '', initialStockEnd: '', preTrainingStart: '', preTrainingEnd: '',
        trainingStart: '', trainingEnd: '', softOpenDate: '', openDate: '',
        ownerGuideStart: '', equipmentIn: '', preTrainingLocation: '', preTrainingDays: 0,
        preTrainingParticipants: 0, preTrainingPayment: '',
        finalDrawingPdfUrl: '', finalDrawingPdfs: [],
        createdAt: now, updatedAt: now,
      });
      toast.success(`${form.storeName} 매장이 등록되었습니다.`);
      onCreated(docRef.id);
    } catch (e) {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">신규 매장 등록</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">매장 호수</label>
              <input className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500 ${isDuplicateNumber ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`} placeholder="예: 120호" value={form.storeNumber} onChange={e => set('storeNumber', e.target.value)} />
              {isDuplicateNumber && <p className="text-[10px] text-red-500 mt-1 font-bold">이미 등록된 호수입니다.</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">매장명 <span className="text-rose-500">*</span></label>
              <input className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" placeholder="매장명 입력" value={form.storeName} onChange={e => set('storeName', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">담당 팀</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.team} onChange={e => {
                const teamName = e.target.value;
                const selTeam = teams.find(t => t.name === teamName);
                setForm(prev => ({
                  ...prev,
                  team: teamName,
                  supervisor: selTeam?.members?.[0]?.name || prev.supervisor,
                }));
              }}>
                <option value="">팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">담당 SV</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.supervisor} onChange={e => set('supervisor', e.target.value)}>
                <option value="">SV 선택</option>
                {(form.team ? (teams.find(t => t.name === form.team)?.members || []) : teams.flatMap(t => t.members)).map(m => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">매장 고유 색상 <span className="text-indigo-500 font-bold">(미사용 색상 자동 배정)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLORS.map(c => {
                const isUsed = usedColors.has(c) && form.colorCode !== c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => !isUsed && set('colorCode', c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all bg-${c}-500 ${form.colorCode === c ? 'border-slate-800 scale-125 shadow-md' : 'border-transparent hover:scale-110'} ${isUsed ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
                    title={isUsed ? `${c} (사용 중)` : c}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div>
              <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">공사 시작일</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-blue-500" value={form.constructionStart} onChange={e => set('constructionStart', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">공사 종료일</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-blue-500" value={form.constructionEnd} onChange={e => set('constructionEnd', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">공사 구분</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.constructionType} onChange={e => set('constructionType', e.target.value)}>
                {sysConfig.constTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">간판 구분</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.signageType} onChange={e => set('signageType', e.target.value)}>
                {sysConfig.signTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">주방 업체</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.kitchenSupplier} onChange={e => set('kitchenSupplier', e.target.value)}>
                {sysConfig.kitchenVendors.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">가스 종류</label>
              <select className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.gasType} onChange={e => set('gasType', e.target.value)}>
                {sysConfig.gasTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">특이사항</label>
            <textarea rows={3} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500 resize-none" placeholder="특이사항 메모..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            취소
          </button>
          <button onClick={handleSave} disabled={saving || isDuplicateNumber} className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
            <Plus size={15} /> {saving ? '등록 중...' : '매장 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
