import React, { useState, useEffect, useMemo } from 'react';
import { FranchiseSchedule, TeamSetting } from '../../types';
import { X, Calculator, AlertCircle, Palette, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../Toast';
import { addDays, diffDays, addExcludingSunday, getOvenInDate, getPreTrainingStartDate } from '../../utils';

interface Props {
  initial: Partial<FranchiseSchedule>;
  teams: TeamSetting[];
  schedules: FranchiseSchedule[];
  onSave: (data: Partial<FranchiseSchedule>) => Promise<void>;
  onClose: () => void;
}

const CONST_TYPES = ['더원', '감리', '직접입력'];
const SIGN_TYPES = ['동영', '직접'];
const KITCHEN_VENDORS = ['형제', '신광', '주원'];
const PRE_TRAINING_LOCATIONS = ['남원', '예당마을', '청주율량', '직접입력'];
const GAS_TYPES = ['LNG', 'LPG', '미등록', '직접입력'];

export const CALENDAR_COLORS = [
  { id: 'blue', bg: 'bg-blue-500', hover: 'hover:bg-blue-600' },
  { id: 'rose', bg: 'bg-rose-500', hover: 'hover:bg-rose-600' },
  { id: 'emerald', bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  { id: 'amber', bg: 'bg-amber-500', hover: 'hover:bg-amber-600' },
  { id: 'purple', bg: 'bg-purple-500', hover: 'hover:bg-purple-600' },
  { id: 'cyan', bg: 'bg-cyan-500', hover: 'hover:bg-cyan-600' },
  { id: 'pink', bg: 'bg-pink-500', hover: 'hover:bg-pink-600' },
  { id: 'indigo', bg: 'bg-indigo-500', hover: 'hover:bg-indigo-600' },
  { id: 'violet', bg: 'bg-violet-500', hover: 'hover:bg-violet-600' },
  { id: 'fuchsia', bg: 'bg-fuchsia-500', hover: 'hover:bg-fuchsia-600' },
  { id: 'orange', bg: 'bg-orange-500', hover: 'hover:bg-orange-600' },
  { id: 'teal', bg: 'bg-teal-500', hover: 'hover:bg-teal-600' },
  { id: 'sky', bg: 'bg-sky-500', hover: 'hover:bg-sky-600' },
  { id: 'lime', bg: 'bg-lime-500', hover: 'hover:bg-lime-600' },
  { id: 'yellow', bg: 'bg-yellow-500', hover: 'hover:bg-yellow-600' },
  { id: 'red', bg: 'bg-red-500', hover: 'hover:bg-red-600' },
  { id: 'stone', bg: 'bg-stone-500', hover: 'hover:bg-stone-600' },
  { id: 'zinc', bg: 'bg-zinc-500', hover: 'hover:bg-zinc-600' },
  { id: 'slate', bg: 'bg-slate-500', hover: 'hover:bg-slate-600' },
  { id: 'neutral', bg: 'bg-neutral-500', hover: 'hover:bg-neutral-600' },
];

export function ScheduleFormModal({ initial, teams, schedules, onSave, onClose }: Props) {
  const [form, setForm] = useState<Partial<FranchiseSchedule>>({
    showInCalendar: true,
    progressCheck: {
      ovenOrder: false,
      ownerGuide: false,
      equipmentOrder: false,
      internetOrder: false,
      initialEntry: false
    },
    ...initial
  });
  
  const [isGasCustom, setIsGasCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (field: keyof FranchiseSchedule, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const setProgress = (key: keyof FranchiseSchedule['progressCheck'], val: boolean) => {
    setForm(prev => ({
      ...prev,
      progressCheck: {
        ...(prev.progressCheck || { ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
        [key]: val
      }
    }));
  };

  const allTeamMembers = teams.flatMap(t => t.members.map(m => ({ ...m, teamName: t.name })));
  const isDuplicateStoreNumber = schedules.some(s => s.id !== form.id && s.storeNumber === form.storeNumber);

  // 사용 중인 색상 파악 (보관되지 않은 매장 기준)
  const usedColors = useMemo(() => {
    return new Set(schedules.filter(s => s.id !== form.id && !s.archived).map(s => s.colorCode));
  }, [schedules, form.id]);

  // 색상 자동 배정 로직 (신규 등록 시)
  useEffect(() => {
    if (!form.id && !form.colorCode) {
      const available = CALENDAR_COLORS.find(c => !usedColors.has(c.id));
      if (available) {
        set('colorCode', available.id);
      } else {
        set('colorCode', 'slate'); // 풀이 찼을 경우 기본값
      }
    }
  }, [form.id, form.colorCode, usedColors]);

  // 가스 구분 초기화 로직
  useEffect(() => {
    if (form.gasType && !GAS_TYPES.filter(t => t !== '직접입력').includes(form.gasType)) {
      setIsGasCustom(true);
    }
  }, [form.gasType]);

  // 자동 계산 로직
  useEffect(() => {
    if (form.constructionStart && form.constructionEnd) {
      const start = form.constructionStart;
      const end = form.constructionEnd;

      const initialStockIn = addDays(end, 1);
      const trainingStart = addDays(end, 3);
      const openDate = addDays(end, 4);
      const preTrainingStart = getPreTrainingStartDate(end);
      const ovenIn = getOvenInDate(end);
      const equipmentIn = addDays(ovenIn, 1);
      
      const ownerGuideStart = addExcludingSunday(start, 5);

      const trainingEnd = addDays(trainingStart, 4);
      const preTrainingEnd = addDays(preTrainingStart, 4);
      const ovenEnd = addDays(ovenIn, 1);

      setForm(prev => ({
        ...prev,
        initialStockIn,
        initialStockEnd: addDays(initialStockIn, 1),
        trainingStart,
        trainingEnd,
        openDate,
        preTrainingStart,
        preTrainingEnd,
        ovenIn,
        ovenEnd,
        equipmentIn,
        ownerGuideStart,
      }));
    }
  }, [form.constructionStart, form.constructionEnd]);

  useEffect(() => {
    if (form.preTrainingStart && form.preTrainingEnd) {
      const days = diffDays(form.preTrainingStart, form.preTrainingEnd) + 1;
      if (form.preTrainingDays !== days) {
        set('preTrainingDays', days);
      }
    }
  }, [form.preTrainingStart, form.preTrainingEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeName?.trim()) { toast.error('매장명을 입력해 주세요.'); return; }
    if (!form.storeNumber?.trim()) { toast.error('매장 호수를 입력해 주세요.'); return; }
    if (isDuplicateStoreNumber) { toast.error('이미 등록된 매장 호수입니다.'); return; }
    
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-50";
  const labelCls = "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-5xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[95vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-4">
             <h2 className="text-lg font-bold text-slate-900 dark:text-white">가맹점 일정 상세 정보</h2>
             <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">캘린더 노출</span>
                <button 
                  type="button"
                  onClick={() => set('showInCalendar', !form.showInCalendar)}
                  className={`p-1 rounded-md transition-colors ${form.showInCalendar ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-700'}`}
                >
                  {form.showInCalendar ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
             </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1">
              <label className={labelCls}>매장 호수 *</label>
              <div className="relative">
                <input className={`${inputCls} ${isDuplicateStoreNumber ? 'border-red-500 pr-10' : ''}`} placeholder="예: 120호" value={form.storeNumber || ''} onChange={e => set('storeNumber', e.target.value)} />
                {isDuplicateStoreNumber && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" size={16} />}
              </div>
              {isDuplicateStoreNumber && <p className="text-[10px] text-red-500 mt-1 font-bold">이미 등록된 호수입니다.</p>}
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>매장명 *</label>
              <input className={inputCls} placeholder="예: 달빛고등어 광주본점" value={form.storeName || ''} onChange={e => set('storeName', e.target.value)} />
            </div>
            <div>
               <label className={labelCls}>매장 고유 색상</label>
               <div className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className={`w-6 h-6 rounded-md shadow-sm ${CALENDAR_COLORS.find(c => c.id === form.colorCode)?.bg || 'bg-slate-500'}`} />
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex gap-1.5 pb-0.5">
                      {CALENDAR_COLORS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => set('colorCode', c.id)}
                          className={`w-5 h-5 min-w-[20px] rounded-full transition-all border-2 ${form.colorCode === c.id ? 'border-blue-500 scale-110 shadow-md' : 'border-transparent hover:scale-110'} ${c.bg} ${usedColors.has(c.id) && form.colorCode !== c.id ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
                          title={usedColors.has(c.id) ? `${c.id} (사용 중)` : c.id}
                          disabled={usedColors.has(c.id) && form.colorCode !== c.id}
                        />
                      ))}
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className={labelCls}>공사 구분 / 가스</label>
              <div className="flex gap-2">
                <select className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" value={form.constructionType || ''} onChange={e => set('constructionType', e.target.value)}>
                   {CONST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex-1">
                   {isGasCustom ? (
                     <div className="relative">
                       <input className={inputCls} value={form.gasType || ''} onChange={e => set('gasType', e.target.value)} placeholder="가스 입력" autoFocus />
                       <button onClick={() => { setIsGasCustom(false); set('gasType', 'LNG'); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold">취소</button>
                     </div>
                   ) : (
                     <select className={inputCls} value={form.gasType || ''} onChange={e => {
                        if (e.target.value === '직접입력') {
                           setIsGasCustom(true);
                           set('gasType', '');
                        } else {
                           set('gasType', e.target.value);
                        }
                     }}>
                        {GAS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                   )}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>간판 구분</label>
              <select className={inputCls} value={form.signageType || ''} onChange={e => set('signageType', e.target.value)}>
                <option value="">업체 선택</option>
                {SIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>주방 업체</label>
              <select className={inputCls} value={form.kitchenSupplier || ''} onChange={e => set('kitchenSupplier', e.target.value)}>
                <option value="">업체 선택</option>
                {KITCHEN_VENDORS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>담당 팀 / SV</label>
              <div className="flex gap-2">
                <select className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" value={form.team || ''} onChange={e => {
                  const teamName = e.target.value;
                  const selTeam = teams.find(t => t.name === teamName);
                  setForm(prev => ({
                    ...prev,
                    team: teamName,
                    supervisor: selTeam && selTeam.members.length > 0 ? selTeam.members[0].name : '',
                    teamMembersSnapshot: selTeam ? selTeam.members : prev.teamMembersSnapshot
                  }));
                }}>
                  <option value="">팀</option>
                  {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <select className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" value={form.supervisor || ''} onChange={e => set('supervisor', e.target.value)}>
                  <option value="">SV</option>
                  {allTeamMembers.map(m => <option key={`${m.teamName}-${m.id}`} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                <span className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center text-xs">01</span>
                공사 및 집기 입고
              </h3>
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                <div><label className={labelCls}>공사 시작일</label><input type="date" className={inputCls} value={form.constructionStart || ''} onChange={e => set('constructionStart', e.target.value)} /></div>
                <div><label className={labelCls}>공사 종료일</label><input type="date" className={inputCls} value={form.constructionEnd || ''} onChange={e => set('constructionEnd', e.target.value)} /></div>
                <div><label className={labelCls}>화덕 입고일</label><input type="date" className={inputCls} value={form.ovenIn || ''} onChange={e => set('ovenIn', e.target.value)} /></div>
                <div><label className={labelCls}>화구류 입고일</label><input type="date" className={inputCls} value={form.equipmentIn || ''} onChange={e => set('equipmentIn', e.target.value)} /></div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                <span className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-xs">02</span>
                교육 프로세스
              </h3>
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex gap-2">
                   <div className="flex-1"><label className={labelCls}>사전교육 시작</label><input type="date" className={inputCls} value={form.preTrainingStart || ''} onChange={e => set('preTrainingStart', e.target.value)} /></div>
                   <div className="flex-1"><label className={labelCls}>일수</label><input type="number" className={inputCls} value={form.preTrainingDays || 0} readOnly /></div>
                </div>
                <div>
                   <label className={labelCls}>사전교육 장소</label>
                   <select className={inputCls} value={form.preTrainingLocation || ''} onChange={e => set('preTrainingLocation', e.target.value)}>
                     <option value="">장소 선택</option>
                     {PRE_TRAINING_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                   </select>
                </div>
                <div><label className={labelCls}>참여 인원</label>
                  <select className={inputCls} value={form.preTrainingParticipants || 1} onChange={e => set('preTrainingParticipants', parseInt(e.target.value))}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>본사 교육 시작일</label><input type="date" className={inputCls} value={form.trainingStart || ''} onChange={e => set('trainingStart', e.target.value)} /></div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                <span className="w-6 h-6 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center text-xs">03</span>
                행정 및 그랜드 오픈
              </h3>
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                <div><label className={labelCls}>점주 안내 시작일</label><input type="date" className={inputCls} value={form.ownerGuideStart || ''} onChange={e => set('ownerGuideStart', e.target.value)} /></div>
                <div><label className={labelCls}>초도물품 입고일</label><input type="date" className={inputCls} value={form.initialStockIn || ''} onChange={e => set('initialStockIn', e.target.value)} /></div>
                <div><label className={labelCls}>그랜드 오픈일</label><input type="date" className={`${inputCls} border-rose-200 dark:border-rose-900 font-bold text-rose-600`} value={form.openDate || ''} onChange={e => set('openDate', e.target.value)} /></div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-2xl text-white">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-slate-400 uppercase tracking-wider">
              <Calculator size={16} /> 진행 관리 프로세스
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { key: 'ovenOrder', label: '화덕 발주' },
                { key: 'ownerGuide', label: '점주 안내' },
                { key: 'equipmentOrder', label: '대/소집기 발주' },
                { key: 'internetOrder', label: '인터넷 주문' },
                { key: 'initialEntry', label: '초도 입력' }
              ].map(item => (
                <button 
                  key={item.key} 
                  type="button"
                  onClick={() => setProgress(item.key as any, !form.progressCheck?.[item.key as keyof typeof form.progressCheck])}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all group ${form.progressCheck?.[item.key as keyof typeof form.progressCheck] ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-400'}`}
                >
                  <div className={`w-5 h-5 mb-3 rounded border flex items-center justify-center ${form.progressCheck?.[item.key as keyof typeof form.progressCheck] ? 'bg-white text-blue-600 border-white' : 'border-slate-700'}`}>
                    {form.progressCheck?.[item.key as keyof typeof form.progressCheck] && <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm" />}
                  </div>
                  <span className="text-xs font-bold">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>특이사항 메모</label>
            <textarea className={`${inputCls} min-h-[80px]`} placeholder="매장 특이사항 및 전달사항 입력" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="text-[10px] text-slate-400 font-medium italic">
            * 모든 날짜는 자동 계산되지만 수동 변경이 가능합니다. 색상은 현재 진행 중인 타 매장과 중복되지 않게 배정됩니다.
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg">
              취소
            </button>
            <button type="submit" disabled={saving || isDuplicateStoreNumber} onClick={handleSubmit as any} className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold shadow-lg shadow-blue-500/20">
              {saving ? '저장 중...' : '상세 일정 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
