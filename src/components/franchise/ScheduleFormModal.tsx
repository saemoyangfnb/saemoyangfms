import React, { useState, useEffect } from 'react';
import { FranchiseSchedule, ScheduleStatus, TeamSetting } from '../../types';
import { X, Calculator, Plus } from 'lucide-react';
import { useToast } from '../Toast';
import { addDays } from '../../utils';

interface Props {
  initial: Partial<FranchiseSchedule>;
  teams: TeamSetting[];
  onSave: (data: Partial<FranchiseSchedule>) => Promise<void>;
  onClose: () => void;
}

const TEMPLATE_DAYS = {
  constructionTime: 30,
  ovenInDelay: 20,
  preTrainingDelay: 25,
  trainingDelay: 28,
  openDelay: 35
};

export function ScheduleFormModal({ initial, teams, onSave, onClose }: Props) {
  const [form, setForm] = useState<Partial<FranchiseSchedule>>(initial);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (field: keyof FranchiseSchedule, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeName?.trim()) { toast.error('상호명을 입력해 주세요.'); return; }
    
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const currentTeam = teams.find(t => t.name === form.team);

  // 자동 계산기 로직
  const handleAutoCalc = () => {
    if (!form.constructionStart) {
      toast.error('공사 시작일을 먼저 입력해주세요.');
      return;
    }
    const start = form.constructionStart;
    
    setForm(prev => ({
      ...prev,
      constructionEnd: addDays(start, TEMPLATE_DAYS.constructionTime),
      ovenIn: addDays(start, TEMPLATE_DAYS.ovenInDelay),
      ovenEnd: addDays(start, TEMPLATE_DAYS.ovenInDelay + 1),
      burnerIn: addDays(start, TEMPLATE_DAYS.ovenInDelay + 2),
      initialStockIn: addDays(start, TEMPLATE_DAYS.preTrainingDelay - 2),
      initialStockEnd: addDays(start, TEMPLATE_DAYS.preTrainingDelay - 1),
      preTrainingStart: addDays(start, TEMPLATE_DAYS.preTrainingDelay),
      preTrainingEnd: addDays(start, TEMPLATE_DAYS.preTrainingDelay + 4),
      trainingStart: addDays(start, TEMPLATE_DAYS.trainingDelay),
      trainingEnd: addDays(start, TEMPLATE_DAYS.trainingDelay + 4),
      openDate: addDays(start, TEMPLATE_DAYS.openDelay),
    }));
    toast.success('제공된 템플릿에 따라 일정이 자동 계산되었습니다.');
  };

  const inputCls = "w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white";
  const labelCls = "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">오픈 일정 {initial.id ? '수정' : '등록'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* 기본 정보 */}
          <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl space-y-4 border border-slate-100 dark:border-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">기본 매장 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>매장 호수</label>
                <input className={inputCls} placeholder="예: 120호" value={form.storeNumber || ''} onChange={e => set('storeNumber', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>상호명 *</label>
                <input className={inputCls} placeholder="예: 구운고등어 상무점" value={form.storeName || ''} onChange={e => set('storeName', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>진행 상태</label>
                <select className={inputCls} value={form.status || '계약완료'} onChange={e => set('status', e.target.value as ScheduleStatus)}>
                  <option value="계약완료">계약완료</option>
                  <option value="공사중">공사중</option>
                  <option value="사전교육">사전교육</option>
                  <option value="인테리어완료">인테리어완료</option>
                  <option value="본교육">본교육</option>
                  <option value="가오픈">가오픈</option>
                  <option value="오픈완료">오픈완료</option>
                  <option value="보류">보류</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>담당 팀</label>
                <select className={inputCls} value={form.team || ''} onChange={e => {set('team', e.target.value); set('supervisor', '') }}>
                  <option value="">팀 선택</option>
                  {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>세부 담당자 (SV)</label>
                <select className={inputCls} value={form.supervisor || ''} onChange={e => set('supervisor', e.target.value)} disabled={!currentTeam}>
                  <option value="">담당자 선택</option>
                  {currentTeam?.members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>공사 구분</label>
                <input className={inputCls} placeholder="신규 / 업종변경" value={form.constructionType || ''} onChange={e => set('constructionType', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>주방 업체</label>
                <input className={inputCls} placeholder="업체명" value={form.kitchenVendor || ''} onChange={e => set('kitchenVendor', e.target.value)} />
              </div>
              <div className="md:col-span-4">
                <label className={labelCls}>특이사항 메모</label>
                <input className={inputCls} placeholder="메모 입력" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 border-b border-slate-200 dark:border-slate-800 pb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200">일정표</h3>
            <button 
              type="button" 
              onClick={handleAutoCalc}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-bold rounded hover:bg-amber-200 transition-colors"
            >
              <Calculator size={14} /> 공사 시작일 기준 자동계산
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 공사 일정 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1 uppercase">공사 관련</h4>
              <div><label className={labelCls}>공사 시작일</label><input type="date" className={inputCls} value={form.constructionStart || ''} onChange={e => set('constructionStart', e.target.value)} /></div>
              <div><label className={labelCls}>공사 종료일</label><input type="date" className={inputCls} value={form.constructionEnd || ''} onChange={e => set('constructionEnd', e.target.value)} /></div>
              <div><label className={labelCls}>화덕 입고</label><input type="date" className={inputCls} value={form.ovenIn || ''} onChange={e => set('ovenIn', e.target.value)} /></div>
            </div>

            {/* 교육 일정 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1 uppercase">교육 및 집기</h4>
              <div><label className={labelCls}>초도물품 입고</label><input type="date" className={inputCls} value={form.initialStockIn || ''} onChange={e => set('initialStockIn', e.target.value)} /></div>
              <div className="flex gap-2">
                <div className="flex-1"><label className={labelCls}>사전교육(점주) 시작</label><input type="date" className={inputCls} value={form.preTrainingStart || ''} onChange={e => set('preTrainingStart', e.target.value)} /></div>
                <div className="flex-1"><label className={labelCls}>종료</label><input type="date" className={inputCls} value={form.preTrainingEnd || ''} onChange={e => set('preTrainingEnd', e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1"><label className={labelCls}>본교육(매장) 시작</label><input type="date" className={inputCls} value={form.trainingStart || ''} onChange={e => set('trainingStart', e.target.value)} /></div>
                <div className="flex-1"><label className={labelCls}>종료</label><input type="date" className={inputCls} value={form.trainingEnd || ''} onChange={e => set('trainingEnd', e.target.value)} /></div>
              </div>
            </div>

            {/* 오픈 일정 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1 uppercase">오픈 일정</h4>
              <div><label className={labelCls}>그랜드 오픈일</label><input type="date" className={inputCls} value={form.openDate || ''} onChange={e => set('openDate', e.target.value)} /></div>
              
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input type="checkbox" checked={form.showInCalendar !== false} onChange={e => set('showInCalendar', e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-300">달력/타임라인에 표시하기</span>
                 </label>
              </div>
            </div>

            {/* 커스텀 공정 (동적) */}
            <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
               <div className="flex items-center justify-between mb-4">
                 <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">추가 공정 (자율 항목)</h4>
                 <button 
                   type="button" 
                   onClick={() => {
                     const newPhase = {
                       id: crypto.randomUUID(), name: '', type: '단기' as const, startDate: '', endDate: '', notes: ''
                     };
                     set('customPhases', [...(form.customPhases || []), newPhase]);
                   }}
                   className="text-xs flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 px-2 py-1 rounded text-slate-600 hover:bg-slate-50 dark:text-slate-300"
                 >
                   <Plus size={12} /> 공정 추가
                 </button>
               </div>
               
               <div className="space-y-4">
                 {(form.customPhases || []).map((phase, idx) => (
                   <div key={phase.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg relative group">
                     <button type="button" onClick={() => {
                        const newArr = [...(form.customPhases || [])];
                        newArr.splice(idx, 1);
                        set('customPhases', newArr);
                     }} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={14} />
                     </button>
                     
                     <div className="flex flex-wrap gap-3 pr-6">
                        <div className="w-1/4 min-w-[120px]">
                           <label className={labelCls}>공정명</label>
                           <input type="text" className={inputCls} placeholder="예: 인테리어 점검" value={phase.name} onChange={e => {
                             const newArr = [...(form.customPhases || [])];
                             newArr[idx].name = e.target.value;
                             set('customPhases', newArr);
                           }} />
                        </div>
                        <div className="w-20">
                           <label className={labelCls}>형태</label>
                           <select className={inputCls} value={phase.type} onChange={e => {
                             const newArr = [...(form.customPhases || [])];
                             newArr[idx].type = e.target.value as '단기' | '장기';
                             if(e.target.value === '단기') { newArr[idx].endDate = newArr[idx].startDate; }
                             set('customPhases', newArr);
                           }}>
                              <option value="단기">단기(1일)</option>
                              <option value="장기">장기</option>
                           </select>
                        </div>
                        <div className="flex-1 min-w-[160px]">
                           <label className={labelCls}>시작일</label>
                           <input type="date" className={inputCls} value={phase.startDate} onChange={e => {
                             const newArr = [...(form.customPhases || [])];
                             newArr[idx].startDate = e.target.value;
                             if(newArr[idx].type === '단기') newArr[idx].endDate = e.target.value;
                             set('customPhases', newArr);
                           }} />
                        </div>
                        {phase.type === '장기' && (
                          <div className="flex-1 min-w-[160px]">
                             <label className={labelCls}>종료일</label>
                             <input type="date" className={inputCls} value={phase.endDate} onChange={e => {
                               const newArr = [...(form.customPhases || [])];
                               newArr[idx].endDate = e.target.value;
                               set('customPhases', newArr);
                             }} />
                          </div>
                        )}
                        <div className="w-full">
                           <label className={labelCls}>특이사항</label>
                           <input type="text" className={inputCls} placeholder="메모를 입력하세요" value={phase.notes} onChange={e => {
                             const newArr = [...(form.customPhases || [])];
                             newArr[idx].notes = e.target.value;
                             set('customPhases', newArr);
                           }} />
                        </div>
                     </div>
                   </div>
                 ))}
                 {(!form.customPhases || form.customPhases.length === 0) && (
                   <p className="text-xs text-center p-4 text-slate-400 font-medium">추가된 커스텀 공정이 없습니다.</p>
                 )}
               </div>
            </div>
            
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg">
            취소
          </button>
          <button type="submit" disabled={saving} onClick={handleSubmit as any} className="px-5 py-2 text-sm bg-slate-900 text-white dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
