import React, { useState, useEffect, useMemo } from 'react';
import { FranchiseSchedule, TeamSetting, FileAttachment, Department, SystemConfig } from '../../types';
import { X, Calculator, AlertCircle, Palette, Eye, EyeOff, FileText, UploadCloud, Loader2, ClipboardList } from 'lucide-react';
import { useToast } from '../Toast';
import { addDays, diffDays, addExcludingSunday, getOvenInDate, getPreTrainingStartDate } from '../../utils';
import { ProcessSettings, DEFAULT_MASTER_CHECKLIST, ChecklistMasterItem } from './ProcessMasterModal';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, salesDb, db } from '../../firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';

const CHECKLIST_STATUS_LABELS = ['미진행', '안내완료', '진행중', '완료'];
const CHECKLIST_STATUS_CLASSES = [
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
];

interface Props {
  initial: Partial<FranchiseSchedule>;
  teams: TeamSetting[];
  schedules: FranchiseSchedule[];
  processSettings?: ProcessSettings;
  onSave: (data: Partial<FranchiseSchedule>) => Promise<void>;
  onUpdateSchedule?: (scheduleId: string, data: Partial<FranchiseSchedule>) => Promise<void>;
  onClose: () => void;
}

// 💡 [Step 4] 기본값 정의 (DB 로드 전까지 사용)
const DEFAULT_CONFIG: SystemConfig = {
  constTypes: ['더원', '감리', '직접입력'],
  signTypes: ['동영', '직접'],
  kitchenVendors: ['형제', '신광', '주원'],
  preTrainingLocations: ['남원', '예당마을', '청주율량', '직접입력'],
  gasTypes: ['LNG', 'LPG', '미등록', '직접입력']
};

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

export function ScheduleFormModal({ initial, teams, schedules, processSettings, onSave, onUpdateSchedule, onClose }: Props) {
  const [form, setForm] = useState<Partial<FranchiseSchedule>>({
    showInCalendar: true,
    progressCheck: {
      drawingUpload: false,
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
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [dbDepartments, setDbDepartments] = useState<Department[]>([]);
  const [sysConfig, setSysConfig] = useState<SystemConfig>(DEFAULT_CONFIG);

  //  DB 부서 정보 실시간 로드
  useEffect(() => {
    const unsub = onSnapshot(collection(salesDb, 'departments'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Department))
        .filter(d => d.brandId === (form.brandId || 'dalbitgo'));
      setDbDepartments(data);
    });
    return () => unsub();
  }, [form.brandId]);

  // 💡 [Step 4] 공통 코드(상수) 실시간 로드
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_settings', 'config'), (snap) => {
      if (snap.exists()) {
        setSysConfig(snap.data() as SystemConfig);
      }
    });
    return () => unsub();
  }, []);
  
  //  신규: 일정 자동 계산 토글 (AI가 자동계산을 요청했거나 기존 일정이 없으면 ON)
  const [autoCalc, setAutoCalc] = useState((initial as any).isAiAutoCalc ?? (!initial.id && !initial.openDate));
  const toast = useToast();

  const set = (field: keyof FranchiseSchedule, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const setProgress = (key: keyof FranchiseSchedule['progressCheck'], val: boolean) => {
    setForm(prev => ({
      ...prev,
      progressCheck: {
        ...(prev.progressCheck || { drawingUpload: false, ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
        [key]: val
      }
    }));
  };

  const setCustomProgress = (id: string, val: boolean) => {
    setForm(prev => ({
      ...prev,
      customProgressCheck: {
        ...((prev as any).customProgressCheck || {}),
        [id]: val
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
    if (form.gasType && !sysConfig.gasTypes.filter(t => t !== '직접입력').includes(form.gasType)) {
      setIsGasCustom(true);
    }
  }, [form.gasType, sysConfig.gasTypes]);

  // 자동 계산 로직
  useEffect(() => {
    if (autoCalc && form.constructionStart && form.constructionEnd) {
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
  }, [form.constructionStart, form.constructionEnd, autoCalc]);

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

  const getPdfs = (): FileAttachment[] => {
    if ((form as any).finalDrawingPdfs?.length) return (form as any).finalDrawingPdfs;
    if (form.finalDrawingPdfUrl) return [{ url: form.finalDrawingPdfUrl, name: '도면.pdf' }];
    return [];
  };

  const handlePdfDelete = async (targetUrl: string) => {
    try {
      const path = decodeURIComponent(targetUrl.split('/o/')[1].split('?')[0]);
      await deleteObject(ref(storage, path));
    } catch {
      // Storage 삭제 실패해도 폼 초기화
    }
    const newPdfs = getPdfs().filter(f => f.url !== targetUrl);
    setForm(prev => ({
      ...prev,
      finalDrawingPdfs: newPdfs,
      ...(newPdfs[0]?.url ? { finalDrawingPdfUrl: newPdfs[0].url } : { finalDrawingPdfUrl: '' }),
      progressCheck: {
        ...(prev.progressCheck || { drawingUpload: false, ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
        drawingUpload: newPdfs.length > 0
      }
    }));
    toast.success('도면 파일이 삭제되었습니다.');
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    e.target.value = '';
    const nonPdf = selectedFiles.find(f => f.type !== 'application/pdf');
    if (nonPdf) { toast.error('PDF 파일만 업로드 가능합니다.'); return; }
    setIsUploadingPdf(true);
    try {
      const uploaded: FileAttachment[] = [];
      for (const file of selectedFiles) {
        const fileRef = ref(storage, `drawings/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploaded.push({ url, name: file.name });
      }
      const newPdfs = [...getPdfs(), ...uploaded];
      
      // 💡 [Step 4] 하드코딩된 'item_18' 대신 Metadata(systemAction)로 항목 찾기
      const checklistItems = (processSettings?.masterItems || [])
        .filter(item => item.category === 'checklist' && !item.isArchived);
      const drawingWorkItem = checklistItems.find(i => i.systemAction === 'drawing_upload');
      const drawingId = drawingWorkItem?.id || 'item_18';

      const checklistData = (form as any).checklistData || {};
      const drawingItem = { 
        ...(checklistData[drawingId] || {}), 
        files: newPdfs, 
        status: 3 // 완료
      };

      const updates = {
        finalDrawingPdfs: newPdfs,
        finalDrawingPdfUrl: newPdfs[0]?.url || '',
        progressCheck: { ...(form.progressCheck as any), drawingUpload: true },
        checklistData: { ...checklistData, [drawingId]: drawingItem }
      };

      setForm(prev => ({ ...prev, ...updates }));
      if (form.id && onUpdateSchedule) {
        await onUpdateSchedule(form.id, updates);
      }
      toast.success(`도면 ${uploaded.length}개가 업로드되었습니다.`);
    } catch (err) {
      toast.error('도면 업로드에 실패했습니다.');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const inputCls = "w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-50";
  const labelCls = "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-2xl shadow-xl w-full max-w-5xl border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col h-full md:h-auto md:max-h-[95vh]">
        <div className="flex flex-col px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
             <h2 className="text-lg font-bold text-slate-900 dark:text-white flex-1 md:flex-none">가맹점 일정 상세 정보</h2>
             <button onClick={onClose} className="md:hidden p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
               <X size={18} />
             </button>
             
             <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
               <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full flex-1 md:flex-none justify-center">
                 <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                   <input type="checkbox" checked={autoCalc} onChange={e => setAutoCalc(e.target.checked)} className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-600" />
                   일정 자동 계산
                 </label>
               </div>

               <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full flex-1 md:flex-none justify-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">캘린더 노출</span>
                  <button 
                    type="button"
                    onClick={() => set('showInCalendar', !form.showInCalendar)}
                    className={`p-1 rounded-md transition-colors ${form.showInCalendar ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 bg-slate-200 dark:bg-slate-700'}`}
                  >
                    {form.showInCalendar ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
               </div>
             </div>
          </div>
          <button onClick={onClose} className="hidden md:block p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
          </div>

          {/* 💡 부서 탭: 클릭하기 편하게 더 크게 개선 */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedDeptId('all')}
              className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-black tracking-tight transition-all border shadow-sm ${selectedDeptId === 'all' ? 'bg-slate-800 text-white border-transparent shadow-md scale-105' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}
            >
              전체 항목
            </button>
            {dbDepartments.map(dept => (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDeptId(dept.id)}
                className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-black tracking-tight transition-all border shadow-sm ${selectedDeptId === dept.id ? `${dept.color} text-white border-transparent shadow-md scale-105` : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}
              >
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 md:p-6 space-y-6 md:space-y-8">
          {/* 매장 기본 정보는 항상 노출 */}
          {(true) && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2">
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
          )}

          {(true) && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className={labelCls}>공사 구분 / 가스</label>
              <div className="flex gap-2">
                <select className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" value={form.constructionType || ''} onChange={e => set('constructionType', e.target.value)}>
                   {sysConfig.constTypes.map(t => <option key={t} value={t}>{t}</option>)}
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
                        {sysConfig.gasTypes.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                   )}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>간판 구분</label>
              <select className={inputCls} value={form.signageType || ''} onChange={e => set('signageType', e.target.value)}>
                <option value="">업체 선택</option>
                {sysConfig.signTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>주방 업체</label>
              <select className={inputCls} value={form.kitchenSupplier || ''} onChange={e => set('kitchenSupplier', e.target.value)}>
                <option value="">업체 선택</option>
                {sysConfig.kitchenVendors.map(t => <option key={t} value={t}>{t}</option>)}
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
                  <option value="">팀 선택</option>
                  {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <select className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" value={form.supervisor || ''} onChange={e => set('supervisor', e.target.value)}>
                  <option value="">SV 선택</option>
                  {(form.team
                    ? (teams.find(t => t.name === form.team)?.members || [])
                    : allTeamMembers
                  ).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          )}

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* 💡  마스터 설정 기반 동적 일정 렌더링 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(() => {
              // 1. 마스터 아이템 중 활성화된 일정 날짜 항목만 추출
              const masterDates = (processSettings?.masterItems || [])
                .filter(item => item.category === 'schedule_date' && !item.isArchived)
                .sort((a, b) => a.order - b.order);
              
              // 2. 부서별 그룹핑
              const groupedByDept: Record<string, typeof masterDates> = {};
              masterDates.forEach(item => {
                const dept = item.departmentId || 'unassigned';
                if (!groupedByDept[dept]) groupedByDept[dept] = [];
                groupedByDept[dept].push(item);
              });

              // 3. 현재 탭(selectedDeptId)에 따라 렌더링할 부서 결정
              const targetDepts = selectedDeptId === 'all' 
                ? Object.keys(groupedByDept) 
                : [selectedDeptId].filter(id => groupedByDept[id]);

              return targetDepts.map((deptId, idx) => {
                const items = groupedByDept[deptId];
                const deptInfo = dbDepartments.find(d => d.id === deptId);
                
                return (
                  <div key={deptId} className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                      <span className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-xs">{(idx+1).toString().padStart(2, '0')}</span>
                      {deptInfo?.name || (deptId === 'unassigned' ? '기타 일정' : deptId)}
                      {deptInfo?.color && (
                         <span className={`text-[10px] ${deptInfo.color} text-white px-1.5 py-0.5 rounded font-bold ml-auto uppercase`}>
                           {deptInfo.name}
                         </span>
                      )}
                    </h3>
                    <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                      {items.map(item => {
                        const field = item.scheduleField;
                        if (!field) return null;

                        return (
                          <div key={item.id} className="space-y-1">
                            <label className={labelCls}>{item.text}</label>
                            {item.inputType === 'date' && (
                              <input type="date" className={inputCls} value={(form as any)[field] || ''} onChange={e => set(field, e.target.value)} />
                            )}
                            {item.inputType === 'date_range' && (
                              <div className="flex gap-2">
                                <input type="date" className={inputCls} value={(form as any)[field] || ''} onChange={e => set(field, e.target.value)} />
                                <span className="flex items-center text-slate-400">~</span>
                                {(() => {
                                  // Start 필드에 대응하는 End 필드 자동 추측 (예: constructionStart -> constructionEnd)
                                  const endField = field.replace('Start', 'End').replace('In', 'End') as keyof FranchiseSchedule;
                                  return (
                                    <input type="date" className={inputCls} value={(form as any)[endField] || ''} onChange={e => set(endField, e.target.value)} />
                                  );
                                })()}
                              </div>
                            )}
                            {item.inputType === 'location_select' && (
                              <select className={inputCls} value={form.preTrainingLocation || ''} onChange={e => set('preTrainingLocation', e.target.value)}>
                                <option value="">장소 선택</option>
                                {sysConfig.preTrainingLocations.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            )}
                            {item.inputType === 'participant_count' && (
                              <select className={inputCls} value={form.preTrainingParticipants || 1} onChange={e => set('preTrainingParticipants', parseInt(e.target.value))}>
                                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}명</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {(true) && (
            <>
              <hr className="border-slate-100 dark:border-slate-800" />
          <div className="space-y-2">
            <label className={labelCls}>최종 도면 (PDF)</label>
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
              <input type="file" accept=".pdf" id="pdf-upload" className="hidden" multiple onChange={handlePdfUpload} disabled={isUploadingPdf} />
              <label htmlFor="pdf-upload" className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-bold border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                {isUploadingPdf ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                {isUploadingPdf ? '업로드 중...' : 'PDF 첨부'}
              </label>
              {getPdfs().length > 0 && (
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {getPdfs().map((f, i) => (
                    <div key={i} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md px-2 py-1.5 max-w-[220px]">
                      <FileText size={12} className="text-blue-500 shrink-0" />
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 truncate hover:underline font-medium" title={f.name}>{f.name}</a>
                      <button type="button" onClick={() => handlePdfDelete(f.url)} className="shrink-0 p-0.5 text-rose-400 hover:text-rose-600 ml-0.5" title="삭제">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {/* 체크리스트 섹션 (기존 매장 편집 시에만 표시) */}
          {form.id && onUpdateSchedule && (() => {
            //   masterItems에서 checklist 카테고리만 추출
            const checklistItems = (processSettings?.masterItems || [])
              .filter(item => item.category === 'checklist' && !item.isArchived)
              .sort((a, b) => a.order - b.order);

            const checklistData: Record<string, any> = (form as any).checklistData || {};
            const filteredItems = selectedDeptId === 'all'
              ? checklistItems
              : checklistItems.filter(item => {
                  const ids = item.departmentIds?.length ? item.departmentIds : (item.departmentId ? [item.departmentId] : []);
                  return ids.includes(selectedDeptId);
                });
            
            if (filteredItems.length === 0) return null;
            const completedCount = filteredItems.filter(item => (checklistData[item.id]?.status || 0) === 3).length;
            return (
              <>
                <hr className="border-slate-100 dark:border-slate-800" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={16} className="text-blue-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">오픈 체크리스트</h3>
                    <span className="text-[10px] text-slate-500 ml-auto font-medium">
                      {completedCount}/{filteredItems.length} 완료
                    </span>
                    {selectedDeptId !== 'all' && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                        {dbDepartments.find(d => d.id === selectedDeptId)?.name || '해당 부서'}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    {filteredItems.map(item => {
                      const status = checklistData[item.id]?.status || 0;
                      const dept = dbDepartments.find(d => d.id === item.departmentId);
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 dark:text-slate-200 truncate font-medium">{item.text}</p>
                            {item.inputType === 'file' && checklistData[item.id]?.files?.length > 0 && (
                              <p className="text-[10px] text-blue-500 font-bold mt-0.5">📎 파일 {checklistData[item.id].files.length}개 첨부됨</p>
                            )}
                          </div>
                          {selectedDeptId === 'all' && dept && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${dept.color} opacity-70 shrink-0`}>
                              {dept.name}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = (status + 1) % 4;
                              const newChecklistData = {
                                ...checklistData,
                                [item.id]: { ...(checklistData[item.id] || {}), status: nextStatus }
                              };
                              setForm(prev => ({ ...prev, checklistData: newChecklistData } as any));
                              onUpdateSchedule(form.id!, { checklistData: newChecklistData });
                            }}
                            className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-bold transition-all ${CHECKLIST_STATUS_CLASSES[status]}`}
                          >
                            {CHECKLIST_STATUS_LABELS[status]}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}

          <div className="space-y-2">
            <label className={labelCls}>특이사항 메모</label>
            <textarea className={`${inputCls} min-h-[80px]`} placeholder="매장 특이사항 및 전달사항 입력" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </form>

        <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-4 md:px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between md:items-center shrink-0 z-10 pb-safe md:pb-4 gap-3">
          <div className="text-[10px] text-slate-400 font-medium italic text-center md:text-left">
            * 모든 날짜는 자동 계산되지만 수동 변경이 가능합니다. 색상은 중복되지 않게 배정됩니다.
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button type="button" onClick={onClose} className="flex-1 md:flex-none px-4 py-3 md:py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 md:border-none">
              취소
            </button>
            <button type="submit" disabled={saving || isDuplicateStoreNumber} onClick={handleSubmit as any} className="flex-1 md:flex-none px-6 py-3 md:py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold shadow-lg shadow-blue-500/20">
              {saving ? '저장 중...' : '상세 일정 저장'}
            </button>
          </div>
        </div>
      </div>
      
    </div>
  );
}
