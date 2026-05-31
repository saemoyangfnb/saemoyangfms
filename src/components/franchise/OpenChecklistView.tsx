import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Search, Printer, Plus, FileText, UploadCloud, Info, CheckCircle2, X, Eye, EyeOff, Lock, Unlock, CheckSquare, Loader2, Clock, Pencil } from 'lucide-react';
import { FranchiseSchedule, FileAttachment, Department, WorkItem, User, DepartmentTask, DepartmentTaskStatus } from '../../types';
import { ProcessSettings } from './ProcessMasterModal';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import { uploadBytes, ref, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, db, salesDb } from '../../firebase';
import { doc, getDoc, getDocs, onSnapshot, collection, updateDoc, query, where } from 'firebase/firestore';
import { computeWorkItemDates } from '../../utils';

interface Props {
  schedules?: FranchiseSchedule[];
  currentUser: User | null;
  processSettings?: ProcessSettings;
  initialSelectedStoreId?: string | null;
  initialScrollToItemId?: string;
  onClearInitialStore?: () => void;
  onNewStore?: () => void;
  onUpdateProgress?: (scheduleId: string, checkId: string, isCustom: boolean, current: boolean) => void;
  onUpdateSchedule?: (scheduleId: string, data: Partial<FranchiseSchedule>) => Promise<void>;
  onUpdateMasterList?: (list: any[]) => Promise<void>;
  onOpenForm?: (scheduleId: string) => void;
}

function NoteInput({ itemId, field, initialValue, workItem, onSave, className, placeholder, type = 'text' }: {
  itemId: string; field: string; initialValue: string; workItem: any;
  onSave: (itemId: string, field: string, value: string, workItem: any) => void;
  className?: string; placeholder?: string; type?: string;
}) {
  const [local, setLocal] = useState(initialValue);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setLocal(initialValue); }, [initialValue]);
  return (
    <input type={type} value={local} className={className} placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onSave(itemId, field, local, workItem); }}
    />
  );
}

const STATUS_STAGES = [
  { label: '미진행', class: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200' },
  { label: '안내완료', class: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
  { label: '진행중', class: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
  { label: '완료', class: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 font-bold' }
];

export function OpenChecklistView({ schedules, currentUser, processSettings, initialSelectedStoreId, initialScrollToItemId, onClearInitialStore, onNewStore, onUpdateSchedule, onUpdateMasterList, onOpenForm }: Props) {
  if (!schedules || !processSettings || !onUpdateSchedule) {
    return (
      <div className="py-20 text-center text-slate-400 font-bold">오픈 체크리스트 로딩 중...</div>
    );
  }

  const toast = useToast();
  const { confirm } = useConfirm();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'active' | 'completed'>('active');
  
  const [dbDepartments, setDbDepartments] = useState<Department[]>([]);
  const [storeTasks, setStoreTasks] = useState<DepartmentTask[]>([]);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  
  const [unlockedItems, setUnlockedItems] = useState<Record<string, boolean>>({});
  const [unlockAdminId, setUnlockAdminId] = useState<string | null>(null);
  const [adminPwdInput, setAdminPwdInput] = useState('');
  const [actualAdminPwd, setActualAdminPwd] = useState('1234');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');

  // (debounce 제거 — NoteInput 컴포넌트의 onBlur 저장으로 대체)

  // ? 아이콘 — 매뉴얼 설명 모달
  const [descModal, setDescModal] = useState<{ itemId: string; text: string; desc: string } | null>(null);
  const [descEdit, setDescEdit] = useState('');
  const [hoveredDescId, setHoveredDescId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPwd = async () => {
      try {
        const snap = await getDoc(doc(db, 'system_settings', 'security'));
        if (snap.exists() && snap.data().naverPlacePassword) {
          setActualAdminPwd(snap.data().naverPlacePassword);
        }
      } catch (e) {}
    };
    fetchPwd();
  }, []);

  
  // 매뉴얼 설명 저장
  const saveDescription = async () => {
    if (!descModal || !onUpdateMasterList) return;
    const masterItems = processSettings.masterItems || [];
    const updated = masterItems.map((m: WorkItem) =>
      m.id === descModal.itemId ? { ...m, description: descEdit } : m
    );
    await onUpdateMasterList(updated);
    toast.success('매뉴얼이 저장되었습니다.');
    setDescModal(null);
  };

  const deleteDescription = async () => {
    if (!descModal || !onUpdateMasterList) return;
    const masterItems = processSettings.masterItems || [];
    const updated = masterItems.map((m: WorkItem) =>
      m.id === descModal.itemId ? { ...m, description: '' } : m
    );
    await onUpdateMasterList(updated);
    toast.success('매뉴얼이 삭제되었습니다.');
    setDescModal(null);
  };

  //  부서 정보 일회성 로드 (변경 빈도 낮음, Firestore 비용 절감)
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(salesDb, 'departments')).then(snap => {
      if (cancelled) return;
      setDbDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    });
    return () => { cancelled = true; };
  }, []);

  // 매장별 실제 태스크 데이터 로드 (실제 DB 연동)
  useEffect(() => {
    if (!selectedStoreId) { setStoreTasks([]); return; }
    const q = query(collection(salesDb, 'department_tasks'), where('scheduleId', '==', selectedStoreId));
    const unsub = onSnapshot(q, snap => {
      setStoreTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentTask)));
    });
    return () => unsub();
  }, [selectedStoreId]);

  // 캘린더에서 매장 선택 시 자동 선택
  useEffect(() => {
    if (initialSelectedStoreId) {
      setSelectedStoreId(initialSelectedStoreId);
      onClearInitialStore?.();
    }
  }, [initialSelectedStoreId]);

  // 캘린더에서 특정 항목 클릭 시 해당 카드로 스크롤
  useEffect(() => {
    if (!initialScrollToItemId) return;
    const el = document.getElementById(`checklist-item-${initialScrollToItemId}`);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-1');
        setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-1'), 2000);
      }, 300);
    }
  }, [initialScrollToItemId, selectedStoreId]);

  const activeChecklist = useMemo(() =>
    (processSettings?.masterItems || [])
      .filter(item => item.category === 'checklist' && !item.isArchived)
      .sort((a, b) => a.order - b.order),
    [processSettings?.masterItems]
  );

  const activeScheduleDates = useMemo(() =>
    (processSettings?.masterItems || [])
      .filter(item => item.category === 'schedule_date' && !item.isArchived)
      .sort((a, b) => a.order - b.order),
    [processSettings?.masterItems]
  );

  const activeTaskItems = useMemo(() =>
    (processSettings?.masterItems || [])
      .filter(item => item.category === 'task' && !item.isArchived),
    [processSettings?.masterItems]
  );
  const filteredStores = schedules
    .filter(s => s.storeName.includes(searchQuery) && (currentTab === 'active' ? !s.archived : s.archived))
    .sort((a, b) => {
      const numA = parseInt(a.storeNumber?.replace(/[^0-9]/g, '') || '0', 10);
      const numB = parseInt(b.storeNumber?.replace(/[^0-9]/g, '') || '0', 10);
      return numA - numB;
    });
  const selectedStore = schedules?.find(s => s.id === selectedStoreId);

  //   모든 항목을 하나의 리스트로 통합 및 정렬
  const unifiedList = useMemo(() => {
    if (!selectedStore) return [];
    
    const items: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    // 1. 일정 날짜 항목 추가 (MasterItems)
    activeScheduleDates.forEach(ws => {
      const dateVal = (selectedStore as any)[ws.scheduleField!] || '';
      items.push({
        ...ws,
        uType: 'date',
        uDate: dateVal,
        uStatus: dateVal ? 3 : 0,
      });
    });

    // 2. 체크리스트 항목 추가 (MasterItems)
    activeChecklist.forEach(wc => {
      const data = (selectedStore as any).checklistData?.[wc.id] || { status: 0 };
      items.push({
        ...wc,
        uType: 'check',
        uDate: wc.inputType === 'password' ? '' : (data.note3 || ''),
        uStatus: data.status,
      });
    });

    // 3. 태스크 날짜 계산 — utils.ts computeWorkItemDates 사용 (캘린더와 동일 로직)
    const allWorkItems = processSettings?.masterItems?.filter(i => !i.isArchived) || [];
    const computedTaskDates = computeWorkItemDates(allWorkItems, selectedStore);

    activeTaskItems.forEach(wt => {
      const realTask = storeTasks.find(t => t.title === wt.text);
      const statusMap: Record<DepartmentTaskStatus, number> = { pending: 0, in_progress: 2, done: 3, blocked: 0 };
      const d = computedTaskDates[wt.id];
      const displayStart = d?.start || '';
      const displayEnd = d?.end || '';

      items.push({
        ...wt,
        uType: 'task',
        uDate: displayStart,
        uEndDate: displayEnd,
        uStatus: realTask ? statusMap[realTask.status] : ((selectedStore.checklistData as any)?.[wt.id]?.status ?? 0),
        uNote: realTask?.note || '',
        realTaskId: realTask?.id
      });
    });

    // 날짜로 정렬하지 않음 — 원래 등록 순서(order) 유지, 날짜는 참고 표기
    return items.filter(i => {
      if (selectedDeptFilter === 'all') return true;
      const ids: string[] = i.departmentIds?.length ? i.departmentIds : (i.departmentId ? [i.departmentId] : []);
      return ids.includes(selectedDeptFilter);
    });
  }, [selectedStore, activeChecklist, activeScheduleDates, activeTaskItems, selectedDeptFilter, storeTasks]);

  const getStoreData = (store: FranchiseSchedule) => (store as any).checklistData || {};

  //   양방향 동기화 엔진
  const handleUpdateItem = (itemId: string, field: string, value: any, workItem: WorkItem) => {
    if (!selectedStore || !onUpdateSchedule) return;
    const currentData = getStoreData(selectedStore);
    
    // 태스크인 경우 note1(비고)은 department_tasks에도 저장, note3(날짜)는 checklistData에 저장
    if (workItem.category === 'task' && (workItem as any).realTaskId) {
       if (field === 'note1') {
         updateDoc(doc(salesDb, 'department_tasks', (workItem as any).realTaskId), { note: value, updatedAt: new Date().toISOString() });
         return; // note1은 task 문서에만 저장
       }
       // note3(날짜) 등 나머지 필드는 아래 checklistData 경로로 저장
    }

    const itemData = currentData[itemId] || { status: 0 };
    const modMeta = {
      lastModifiedBy: currentUser?.name || currentUser?.email || '알 수 없음',
      lastModifiedAt: new Date().toISOString(),
    };
    const updates: any = {
      checklistData: { ...currentData, [itemId]: { ...itemData, [field]: value, ...modMeta } }
    };

    //   마스터 설정 기반 syncToField 동기화 (날짜 메모 변경 시)
    if (field === 'note3' && workItem.syncToField) {
      updates[workItem.syncToField] = value;
      // 기간 데이터인 경우 End 필드도 함께 업데이트 시도
      if (workItem.inputType === 'training_payment' || workItem.inputType === 'file_date') {
        const endField = workItem.syncToField.replace('Start', 'End').replace('In', 'End');
        updates[endField] = value;
      }
    }
    
    //  기존 하드코딩된 예외 케이스 처리 (인원 등)
    if (workItem.inputType === 'training_payment' && field === 'note7') {
      updates.preTrainingParticipants = parseInt(String(value).replace('명','')) || 0;
    } else if (workItem.inputType === 'training_payment' && field === 'note1') {
      updates.preTrainingLocation = value;
    }

    onUpdateSchedule(selectedStore.id, updates);
  };

  const handleTaskStatusChange = async (taskId: string, currentStatus: number) => {
    const statusCycle: DepartmentTaskStatus[] = ['pending', 'in_progress', 'done', 'blocked'];
    const currentStatusKey = statusCycle.find(s => {
       if (s === 'pending') return currentStatus === 0;
       if (s === 'in_progress') return currentStatus === 2;
       if (s === 'done') return currentStatus === 3;
       return false;
    }) || 'pending';
    
    const nextIndex = (statusCycle.indexOf(currentStatusKey) + 1) % statusCycle.length;
    const nextStatus = statusCycle[nextIndex];

    await updateDoc(doc(salesDb, 'department_tasks', taskId), { 
      status: nextStatus, 
      updatedAt: new Date().toISOString(),
      completedBy: nextStatus === 'done' ? (currentUser?.name || '알 수 없음') : null,
      completedAt: nextStatus === 'done' ? new Date().toISOString() : null
    });
  };

  const cycleStatus = async (itemId: string, workItem: WorkItem) => {
    if (!selectedStore) return;
    if (workItem.category === 'task' && (workItem as any).realTaskId) {
       handleTaskStatusChange((workItem as any).realTaskId, (workItem as any).uStatus);
       return;
    }
    const currentData = getStoreData(selectedStore);
    const currentStatus = currentData[itemId]?.status || 0;
    const nextStatus = (currentStatus + 1) % STATUS_STAGES.length;
    handleUpdateItem(itemId, 'status', nextStatus, workItem);
  };

  const verifyAdminPwd = (itemId: string) => {
    if (adminPwdInput === actualAdminPwd) {
       setUnlockedItems(p => ({...p, [itemId]: true}));
       setUnlockAdminId(null);
       setAdminPwdInput('');
    } else {
       toast.error('관리자 패널에서 설정한 보안 마스터 암호가 틀렸습니다.');
    }
  };

  // 기존 fileUrl 단일 필드 → files 배열로 하위 호환 변환
  const getItemFiles = (itemData: any): FileAttachment[] => {
    if (itemData?.files?.length) return itemData.files;
    if (itemData?.fileUrl) return [{ url: itemData.fileUrl, name: '첨부파일' }];
    return [];
  };

  const handleFileDelete = async (itemId: string, fileUrl: string) => {
    if (!selectedStore) return;
    try {
      const path = decodeURIComponent(fileUrl.split('/o/')[1].split('?')[0]);
      await deleteObject(ref(storage, path));
    } catch {
      // Storage 삭제 실패해도 Firestore 데이터는 초기화
    }
    const currentData = getStoreData(selectedStore);
    const { fileUrl: _old1, ...restItemData1 } = currentData[itemId] || { status: 0 };
    const newFiles = getItemFiles(currentData[itemId] || {}).filter(f => f.url !== fileUrl);
    const newItemData = { ...restItemData1, files: newFiles, status: newFiles.length === 0 ? 0 : (restItemData1.status ?? 0) };
    onUpdateSchedule(selectedStore.id, {
      checklistData: { ...currentData, [itemId]: newItemData }
    });
    toast.success('파일이 삭제되었습니다.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0 || !selectedStore) return;
    // input 초기화 (같은 파일 재선택 가능하도록)
    e.target.value = '';

    setUploadingItem(itemId);
    toast.success(`${selectedFiles.length}개 파일을 업로드 중입니다...`);
    try {
      const uploadedAttachments: FileAttachment[] = [];
      for (const file of selectedFiles) {
        const fileRef = ref(storage, `checklist_files/${selectedStore.id}_${itemId}_${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedAttachments.push({ url, name: file.name });
      }

      const currentData = getStoreData(selectedStore);
      const { fileUrl: _old2, ...restItemData2 } = currentData[itemId] || { status: 0 };
      const currentFiles = getItemFiles(currentData[itemId] || {});
      const newFiles = [...currentFiles, ...uploadedAttachments];
      const newItemData = { ...restItemData2, files: newFiles, status: 3 };

      const updates: any = { 
        checklistData: { ...currentData, [itemId]: newItemData } 
      };

      //   Metadata 기반 도면 연동 (Hardcoded ID 제거)
      const workItem = activeChecklist.find(i => i.id === itemId);
      if (workItem?.systemAction === 'drawing_upload') {
        updates.finalDrawingPdfs = newFiles;
        updates.finalDrawingPdfUrl = newFiles[0].url;
        updates.progressCheck = { ...(selectedStore.progressCheck || {}), drawingUpload: true };
      }

      onUpdateSchedule(selectedStore.id, updates);
      toast.success('파일이 성공적으로 첨부되었습니다.');
    } catch (err) {
      toast.error('파일 업로드에 실패했습니다.');
    } finally {
      setUploadingItem(null);
    }
  };

  return (
    <>
    <div className="h-[calc(100vh-120px)] min-h-0 flex gap-3 md:gap-6 animate-in fade-in duration-300 relative print:h-auto print:block print:bg-white">

      {/* 왼쪽: 매장 리스트 패널 — 모바일: 전체 / PC: 고정 사이드바 */}
      <div className={`w-full md:w-56 lg:w-64 xl:w-72 flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm print:hidden ${selectedStoreId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 md:p-4 border-b border-slate-200 dark:border-slate-800 bg-[#FDFBF7] dark:bg-slate-800/50">
          <div className="flex items-center justify-between mb-3">
             <h2 className="font-black text-base md:text-lg text-slate-900 dark:text-white tracking-tight">매장 현황</h2>
             {onNewStore && (
               <button onClick={onNewStore} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                 <Plus size={12} /> 신규
               </button>
             )}
                                  </div>
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg mb-3">
            <button onClick={() => { setCurrentTab('active'); setSelectedStoreId(null); }} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'active' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500'}`}>진행 중</button>
            <button onClick={() => { setCurrentTab('completed'); setSelectedStoreId(null); }} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'completed' ? 'bg-white dark:bg-slate-700 text-slate-800 shadow-sm' : 'text-slate-500'}`}>완료</button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="매장명 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 transition-shadow" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filteredStores.map(store => {
            const data = getStoreData(store);
            const totalItems = activeChecklist.length;
            const checkedItems = activeChecklist.filter(i => data[i.id]?.status === 3).length;
            const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

            // 부서별 태스크 미완료 집계
            const deptIncomplete: { dept: Department; count: number }[] = dbDepartments.map(dept => {
              const deptTasks = activeTaskItems.filter(i => {
                const ids: string[] = i.departmentIds?.length ? i.departmentIds : (i.departmentId ? [i.departmentId] : []);
                return ids.includes(dept.id);
              });
              const incomplete = deptTasks.filter(i => (data[i.id]?.status ?? 0) < 3).length;
              return { dept, count: incomplete };
            }).filter(x => x.count > 0);

            const isSelected = selectedStoreId === store.id;
            return (
              <button key={store.id} onClick={() => setSelectedStoreId(store.id)} className={`w-full text-left px-3 py-3 md:px-4 md:py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-3 ${isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-500 dark:bg-indigo-900/20' : 'border-l-4 border-transparent'}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 bg-${store.colorCode || 'slate'}-500`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-black text-sm text-slate-900 dark:text-white truncate">{store.storeName}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{store.storeNumber || ''}</span>
                  </div>
                  {store.team && (
                    <p className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500 truncate mb-1">{store.team}</p>
                  )}
                  {/* 부서별 미완료 태스크 뱃지 */}
                  {deptIncomplete.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {deptIncomplete.map(({ dept, count }) => (
                        <span
                          key={dept.id}
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                        >
                          {dept.name} {count}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 w-7 text-right shrink-0">{progress}%</span>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredStores.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">없음</div>
          )}
        </div>
      </div>

      {/* 오른쪽: 체크리스트 상세 패널 */}
      <div className={`flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm print:border-none print:shadow-none print:w-full print:block ${!selectedStoreId ? 'hidden md:flex' : 'flex'}`}>
        {selectedStore ? (
          <>
            {/* 상세 화면 헤더 */}
            <div className="px-4 py-3 md:px-5 md:py-4 border-b border-slate-200 dark:border-slate-800 bg-[#FDFBF7] dark:bg-slate-800/50 flex items-center gap-2 shrink-0 print:border-none print:bg-transparent print:p-0 print:mb-6">
              {/* 뒤로가기 (모바일) */}
              <button onClick={() => setSelectedStoreId(null)} className="md:hidden p-2 -ml-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors print:hidden shrink-0">
                <ArrowLeft size={18} />
              </button>
              {/* 색상 점 */}
              <div className={`w-3 h-3 rounded-full shrink-0 bg-${selectedStore.colorCode || 'slate'}-500 hidden md:block`} />
              {/* 매장명 + 상태 뱃지 */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h2 className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter truncate print:text-4xl">
                  {selectedStore.storeName}
                </h2>
                <span className="text-sm font-bold text-slate-400 shrink-0">{selectedStore.storeNumber}</span>
                <span className={`hidden sm:inline px-2 py-0.5 text-[10px] font-black rounded shrink-0 print:hidden ${selectedStore.archived ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'}`}>
                  {selectedStore.archived ? '완료' : '진행중'}
                </span>
              </div>
              {/* 우측 버튼들 */}
              <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                {onOpenForm && (
                  <button onClick={() => onOpenForm(selectedStore.id)} className="hidden sm:flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1.5 rounded text-xs font-bold transition">
                    <Pencil size={13} /> 매장 편집
                  </button>
                )}
                <button onClick={() => window.print()} className="hidden sm:flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded text-xs font-bold transition">
                  <Printer size={13} /> 인쇄
                </button>
                <button onClick={() => onUpdateSchedule(selectedStore.id, { archived: !selectedStore.archived })} className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold transition border ${selectedStore.archived ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                  <CheckCircle2 size={13} /> <span className="hidden sm:inline">{selectedStore.archived ? '복구' : '오픈완료'}</span><span className="sm:hidden">{selectedStore.archived ? '복구' : '완료'}</span>
                </button>
              </div>
            </div>

            {/* 부서 필터 탭 */}
            <div className="flex gap-0 overflow-x-auto hide-scrollbar border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:hidden shrink-0">
              {(() => {
                // 전체 탭 미완료 수
                const storeData = getStoreData(selectedStore);
                const totalIncomplete = unifiedList.filter(i =>
                  i.uType !== 'date' && (i.uStatus ?? storeData[i.id]?.status ?? 0) < 3
                ).length;
                return (
                  <button onClick={() => setSelectedDeptFilter('all')} className={`shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${selectedDeptFilter === 'all' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    전체
                    {totalIncomplete > 0 && <span className="text-[10px] font-black px-1 py-0.5 rounded-full bg-rose-500 text-white leading-none">{totalIncomplete}</span>}
                  </button>
                );
              })()}
              {dbDepartments.map(dept => {
                const storeData = getStoreData(selectedStore);
                const deptItems = unifiedList.filter(i => {
                  if (i.uType === 'date') return false;
                  const ids: string[] = i.departmentIds?.length ? i.departmentIds : (i.departmentId ? [i.departmentId] : []);
                  return ids.includes(dept.id);
                });
                const deptIncomplete = deptItems.filter(i => (i.uStatus ?? storeData[i.id]?.status ?? 0) < 3).length;
                return (
                  <button key={dept.id} onClick={() => setSelectedDeptFilter(dept.id)} className={`shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${selectedDeptFilter === dept.id ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {dept.name}
                    {deptIncomplete > 0 && <span className="text-[10px] font-black px-1 py-0.5 rounded-full bg-rose-500 text-white leading-none">{deptIncomplete}</span>}
                  </button>
                );
              })}
            </div>

            {/* ── 통합 스크롤 뷰 ── */}
            <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 print:overflow-visible print:h-auto p-3 space-y-2">
              {unifiedList.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-bold">
                  {selectedDeptFilter === 'all' ? '등록된 항목이 없습니다.' : '선택한 부서의 항목이 없습니다.'}
                </div>
              ) : (
                unifiedList.map((item) => {
                  const itemData = (item.uType === 'check' || item.uType === 'task')
                    ? (getStoreData(selectedStore)[item.id] || { status: 0 })
                    : { status: 0 };
                  const lastModBy: string = itemData.lastModifiedBy || '';
                  const lastModAt: string = itemData.lastModifiedAt || '';
                  const lastModDate = lastModAt ? new Date(lastModAt) : null;
                  const lastModLabel = lastModBy && lastModDate && !isNaN(lastModDate.getTime())
                    ? `${lastModBy} · ${lastModDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} ${lastModDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                    : '';
                  const statusIdx = item.uStatus ?? itemData.status ?? 0;
                  const statusObj = STATUS_STAGES[statusIdx];
                  const isDone = statusIdx === 3;
                  const timeOptions = () => Array.from({length: 14}, (_, i) => {
                    const time = String(i + 9).padStart(2, '0') + ':00';
                    return <option key={time} value={time}>{time}</option>;
                  });

                  // 상태 토글 버튼 (왼쪽 배치)
                  let statusButton = null;
                  if (item.uType !== 'date') {
                    statusButton = (
                      <button onClick={() => cycleStatus(item.id, item)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg border text-[10px] font-black tracking-tighter whitespace-nowrap min-w-[64px] ${statusObj.class}`}>
                        {statusObj.label}
                      </button>
                    );
                  }

                  // 체크리스트 / 태스크 입력 UI
                  let inputHtml = null;
                  if (item.uType === 'check' || item.uType === 'task') {
                    if (item.inputType === 'file' || item.inputType === 'email') {
                      const attachedFiles = getItemFiles(itemData);
                      inputHtml = (
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex items-center gap-2">
                            <NoteInput type="text" placeholder={item.inputType === 'email' ? '이메일 주소 입력' : '메모 입력'} className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                            {item.inputType === 'file' && (
                              <>
                                <input type="file" id={`file-${item.id}`} className="hidden" multiple onChange={(e) => handleFileUpload(e, item.id)} />
                                <label htmlFor={`file-${item.id}`} className="shrink-0 p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer transition-colors print:hidden">
                                  {uploadingItem === item.id ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                                </label>
                              </>
                            )}
                          </div>
                          {attachedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 print:hidden">
                              {attachedFiles.map((f, i) => (
                                <div key={i} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md px-2 py-1 max-w-[220px]">
                                  <FileText size={11} className="text-blue-500 shrink-0" />
                                  <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 truncate hover:underline">{f.name}</a>
                                  <button onClick={() => handleFileDelete(item.id, f.url)} className="shrink-0 p-0.5 text-rose-400 hover:text-rose-600 ml-0.5"><X size={11} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    } else if (item.inputType === 'phone') {
                      inputHtml = (
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
                          <NoteInput type="tel" placeholder="000-0000-0000" className="flex-none w-full md:w-[140px] text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note2 || ''} itemId={item.id} field="note2" workItem={item} onSave={handleUpdateItem} />
                          <NoteInput type="text" placeholder="비고 작성란" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                        </div>
                      );
                    } else if (item.inputType === 'date') {
                      // task 타입은 캘린더 계산 날짜(uDate)를 폴백으로 표시
                      const dateDisplayValue = itemData.note3 || (item.uType === 'task' ? item.uDate || '' : '');
                      inputHtml = (
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
                          <input type="date" className="flex-none w-full md:w-[130px] text-sm font-bold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" value={dateDisplayValue} onChange={e => handleUpdateItem(item.id, 'note3', e.target.value, item)} />
                          <NoteInput type="text" placeholder="비고 작성란" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                        </div>
                      );
                    } else if (item.inputType === 'hiorder') {
                      inputHtml = (
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
                          <input type="date" className="flex-none w-full md:w-[130px] text-sm font-bold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" value={itemData.note3 || ''} onChange={e => handleUpdateItem(item.id, 'note3', e.target.value, item)} />
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 cursor-pointer">
                            <input type="checkbox" checked={itemData.note4 === 'Y'} onChange={e => handleUpdateItem(item.id, 'note4', e.target.checked ? 'Y' : 'N', item)} className="rounded" />
                            광케이블 설치
                          </label>
                          <NoteInput type="text" placeholder="비고 작성란" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                        </div>
                      );
                    } else if (item.inputType === 'showcase') {
                      inputHtml = (
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
                          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                            {(['좌도어', '우도어', '홍시냉장고'] as const).map((label, ni) => (
                              <select key={label} className="flex-1 md:w-auto text-xs font-bold border-slate-200 dark:border-slate-700 rounded border px-1.5 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" value={itemData[`note${ni + 2}`] || ''} onChange={e => handleUpdateItem(item.id, `note${ni + 2}`, e.target.value, item)}>
                                <option value="">{label}</option>
                                {[0,1,2,3,4,5].map(n => <option key={n} value={`${n}개`}>{n}개</option>)}
                              </select>
                            ))}
                          </div>
                          <NoteInput type="text" placeholder="비고 작성란" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                        </div>
                      );
                    } else if (item.inputType === 'food_waste') {
                      inputHtml = (
                        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
                          <select className="flex-none w-full md:w-auto text-sm font-bold border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" value={itemData.note2 || ''} onChange={e => handleUpdateItem(item.id, 'note2', e.target.value, item)}>
                            <option value="">수거 방식 선택</option>
                            <option value="음식물수거통">음식물수거통</option>
                            <option value="음식물처리기">음식물처리기</option>
                          </select>
                          <NoteInput type="text" placeholder="비고 작성란" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                        </div>
                      );
                    } else if (item.inputType === 'file_date') {
                      const attachedFiles = getItemFiles(itemData);
                      inputHtml = (
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <input type="date" className="flex-none w-full md:w-[130px] text-sm font-bold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" value={itemData.note3 || ''} onChange={e => handleUpdateItem(item.id, 'note3', e.target.value, item)} />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <NoteInput type="text" placeholder="메모 입력" className="flex-1 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                              <input type="file" id={`file-${item.id}`} className="hidden" multiple onChange={(e) => handleFileUpload(e, item.id)} />
                              <label htmlFor={`file-${item.id}`} className="shrink-0 p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded cursor-pointer transition-colors print:hidden">
                                {uploadingItem === item.id ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                              </label>
                            </div>
                          </div>
                          {attachedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 print:hidden">
                              {attachedFiles.map((f, i) => (
                                <div key={i} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md px-2 py-1 max-w-[220px]">
                                  <FileText size={11} className="text-blue-500 shrink-0" />
                                  <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 truncate hover:underline">{f.name}</a>
                                  <button onClick={() => handleFileDelete(item.id, f.url)} className="shrink-0 p-0.5 text-rose-400 hover:text-rose-600 ml-0.5"><X size={11} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    } else if (item.inputType === 'password') {
                      if (!unlockedItems[item.id]) {
                        inputHtml = (
                          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full relative print:hidden">
                            <button onClick={() => { setUnlockAdminId(item.id); setAdminPwdInput(''); }} className="flex-1 w-full py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors">
                              <Lock size={14} /> 권한 정보 보기 (관리자 암호 필요)
                            </button>
                            {unlockAdminId === item.id && (
                              <div className="absolute left-0 top-full mt-1 p-2 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-lg flex gap-2 z-50 animate-in fade-in zoom-in-95">
                                <input type="password" placeholder="보안 마스터 암호 입력" autoFocus value={adminPwdInput} onChange={e => setAdminPwdInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') verifyAdminPwd(item.id); }} className="text-xs border px-2 py-1.5 rounded w-40 dark:bg-slate-900 focus:outline-none focus:border-blue-500" />
                                <button onClick={() => verifyAdminPwd(item.id)} className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded font-bold hover:bg-slate-800">확인</button>
                              </div>
                            )}
                            <NoteInput type="text" placeholder="비고 작성란" className="flex-1 w-full min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                          </div>
                        );
                      } else {
                        inputHtml = (
                          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full animate-in fade-in slide-in-from-top-1">
                            <NoteInput type="text" placeholder="접속 아이디" className="flex-1 w-full md:w-32 min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800 font-bold" initialValue={itemData.note2 || ''} itemId={item.id} field="note2" workItem={item} onSave={handleUpdateItem} />
                            <div className="relative flex-1 w-full md:w-32 min-w-0">
                              <NoteInput type="text" placeholder="비밀번호" className="w-full text-sm font-bold border-slate-200 dark:border-slate-700 rounded border pl-2 pr-8 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note3 || ''} itemId={item.id} field="note3" workItem={item} onSave={handleUpdateItem} />
                              <button onClick={() => setUnlockedItems(p => ({...p, [item.id]: false}))} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 print:hidden"><Unlock size={14} /></button>
                            </div>
                            <NoteInput type="text" placeholder="비고 작성란" className="flex-1 w-full min-w-0 text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />
                          </div>
                        );
                      }
                    } else if (item.inputType === 'staffing') {
                      inputHtml = (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full">
                          {['홀 직원', '홀 파트', '주방 직원', '주방 파트'].map((label, i) => (
                            <div key={label} className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 focus-within:border-blue-400 transition">
                              <span className="text-[10px] text-slate-500 font-bold w-8 text-center leading-tight">{label.split(' ')[0]}<br className="hidden md:block" />{label.split(' ')[1]}</span>
                              <input type="number" placeholder="0명" className="w-full text-sm font-bold focus:outline-none bg-transparent dark:text-white" value={itemData[`note${i + 1}`] || ''} onChange={e => handleUpdateItem(item.id, `note${i + 1}`, e.target.value, item)} />
                            </div>
                          ))}
                        </div>
                      );
                    } else if (item.inputType === 'training_payment') {
                      inputHtml = (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-500 w-8 shrink-0">장소</span>
                              <select className="flex-1 md:flex-none w-auto border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus:border-blue-500 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200" value={itemData.note1 || ''} onChange={e => handleUpdateItem(item.id, 'note1', e.target.value, item)}>
                                <option value="">선택</option>
                                {['예당마을점', '남원점', '청주율량점', '직접입력'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                              {itemData.note1 === '직접입력' && <NoteInput type="text" placeholder="직접입력" className="flex-1 md:w-24 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 dark:bg-slate-800 min-w-0" initialValue={itemData.note2 || ''} itemId={item.id} field="note2" workItem={item} onSave={handleUpdateItem} />}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-500 md:ml-2 w-8 md:w-auto shrink-0">인원</span>
                              <select className="flex-1 md:flex-none border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus:border-blue-500 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200" value={itemData.note7 || ''} onChange={e => handleUpdateItem(item.id, 'note7', e.target.value, item)}>
                                <option value="">선택</option>
                                {[1,2,3,4,5].map(n => <option key={n} value={`${n}명`}>{n}명</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col xl:flex-row xl:items-center gap-2 text-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-500 w-8 shrink-0">일시</span>
                              <input type="date" className="flex-1 md:w-[115px] text-xs border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 font-bold focus:border-blue-500 dark:bg-slate-800 text-slate-800 dark:text-slate-200" value={itemData.note3 || ''} onChange={e => handleUpdateItem(item.id, 'note3', e.target.value, item)} />
                              <span className="text-slate-400">~</span>
                              <input type="date" className="flex-1 md:w-[115px] text-xs border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 font-bold focus:border-blue-500 dark:bg-slate-800 text-slate-800 dark:text-slate-200" value={itemData.note4 || ''} onChange={e => handleUpdateItem(item.id, 'note4', e.target.value, item)} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-500 w-8 xl:ml-2 shrink-0">시간</span>
                              <select className="flex-1 md:w-[70px] text-sm border border-slate-200 dark:border-slate-700 rounded px-1 py-1 focus:border-blue-500 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold" value={itemData.note5 || ''} onChange={e => handleUpdateItem(item.id, 'note5', e.target.value, item)}>
                                <option value="">시작</option>{timeOptions()}
                              </select>
                              <span className="text-slate-400">~</span>
                              <select className="flex-1 md:w-[70px] text-sm border border-slate-200 dark:border-slate-700 rounded px-1 py-1 focus:border-blue-500 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold" value={itemData.note6 || ''} onChange={e => handleUpdateItem(item.id, 'note6', e.target.value, item)}>
                                <option value="">종료</option>{timeOptions()}
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-500 w-8 shrink-0">교육비</span>
                            <select className={`flex-1 md:flex-none border rounded px-2 py-1.5 font-bold text-sm focus:outline-none focus:border-blue-500 dark:bg-slate-800 ${itemData.note8 === '미입금' ? 'border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-900/20' : itemData.note8 === '입금' ? 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'}`} value={itemData.note8 || ''} onChange={e => handleUpdateItem(item.id, 'note8', e.target.value, item)}>
                              <option value="">결제 상태</option>
                              <option value="입금">입금 (완료)</option>
                              <option value="미입금">미입금 (대기)</option>
                            </select>
                          </div>
                          <p className="text-[10px] text-indigo-500 font-bold flex items-center gap-1 leading-tight"><Info size={12} className="shrink-0" /> 일정을 변경하면 캘린더/간트차트에 즉시 동기화됩니다.</p>
                        </div>
                      );
                    } else {
                      inputHtml = <NoteInput type="text" placeholder="비고 작성란 (선택)" className="w-full text-sm border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none bg-transparent hover:bg-white dark:hover:bg-slate-800 transition" initialValue={itemData.note1 || ''} itemId={item.id} field="note1" workItem={item} onSave={handleUpdateItem} />;
                    }

                  // 태스크 타입이면서 날짜 위젯이 없는 inputType → 날짜 input 자동 추가
                  const DATE_WIDGET_TYPES = ['date', 'file_date', 'hiorder', 'training_payment'];
                  if (item.uType === 'task' && !DATE_WIDGET_TYPES.includes(item.inputType)) {
                    const taskDateValue = itemData.note3 || item.uDate || '';
                    inputHtml = (
                      <div className="flex flex-col gap-2 w-full">
                        <input
                          type="date"
                          className="flex-none w-full md:w-[130px] text-sm font-bold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded border px-2 py-1.5 focus:border-blue-500 focus:outline-none dark:bg-slate-800"
                          value={taskDateValue}
                          onChange={e => handleUpdateItem(item.id, 'note3', e.target.value, item)}
                        />
                        {inputHtml}
                      </div>
                    );
                  }
                  }

                  // D-day 뱃지 계산
                  const today = new Date().toISOString().split('T')[0];
                  let dDayBadge = null;
                  if (item.uType === 'task' && item.uDate) {
                    const diff = Math.round((new Date(item.uDate).getTime() - new Date(today).getTime()) / 86400000);
                    const badgeColor = isDone ? 'bg-emerald-100 text-emerald-600' : diff < 0 ? 'bg-rose-100 text-rose-600' : diff === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
                    const label = isDone ? '완료' : diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
                    dDayBadge = <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${badgeColor}`}>{label}</span>;
                  }

                  // ? 매뉴얼 아이콘
                  const masterItem = (processSettings.masterItems || []).find((m: WorkItem) => m.id === item.id);
                  const itemDesc = masterItem?.description || '';
                  const qIcon = (
                    <div className="relative shrink-0 print:hidden">
                      <button
                        onMouseEnter={() => setHoveredDescId(item.id)}
                        onMouseLeave={() => setHoveredDescId(null)}
                        onDoubleClick={() => {
                          setDescModal({ itemId: item.id, text: item.text, desc: itemDesc });
                          setDescEdit(itemDesc);
                        }}
                        className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-blue-100 hover:text-blue-500 flex items-center justify-center text-[10px] font-black border border-slate-200 dark:border-slate-600 transition-colors"
                        title="더블클릭으로 매뉴얼 편집"
                      >?</button>
                      {hoveredDescId === item.id && (
                        <div className="absolute top-full right-0 mt-1.5 z-50 w-64 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl pointer-events-none">
                          <div className="absolute bottom-full right-3 border-4 border-transparent border-b-slate-800" />
                          {itemDesc ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{itemDesc}</p>
                          ) : (
                            <p className="text-slate-400 italic">매뉴얼이 없습니다. 더블클릭으로 등록하세요.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <div key={`${item.uType}-${item.id}`}
                      id={`checklist-item-${item.id}`}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-shadow duration-500">
                      {/* 카드 상단: 상태버튼(왼) + 제목/날짜 + D-day뱃지(우) */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* 상태 버튼 — 왼쪽 */}
                        {statusButton}

                        {/* 제목 + 날짜 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-snug text-slate-800 dark:text-slate-100">
                            {item.text}
                          </p>
                          {/* check 타입 + 날짜 위젯 없는 경우만 소제목 날짜 표시 */}
                          {item.uDate && item.uType === 'check' && !['date','file_date','hiorder','training_payment'].includes(item.inputType) && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {item.uDate}{item.uEndDate && item.uEndDate !== item.uDate ? ` ~ ${item.uEndDate}` : ''}
                            </p>
                          )}
                          {lastModLabel && (
                            <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5 print:hidden">
                              ✎ {lastModLabel}
                            </p>
                          )}
                        </div>

                        {/* 오른쪽: D-day 뱃지 or 날짜 입력 + ? 아이콘 */}
                        <div className="flex items-center gap-1.5">
                          {item.uType === 'date' ? (() => {
                            const schedField = item.scheduleField as keyof FranchiseSchedule | undefined;
                            const currentValue = schedField ? (selectedStore as any)[schedField] || '' : '';
                            return (
                              <input type="date" value={currentValue}
                                onChange={e => schedField && onUpdateSchedule(selectedStore!.id, { [schedField]: e.target.value } as any)}
                                className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-blue-500"
                              />
                            );
                          })() : dDayBadge}
                          {qIcon}
                        </div>
                      </div>

                      {/* 입력 영역 */}
                      {inputHtml && (
                        <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="pt-3">{inputHtml}</div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center print:hidden">
            <CheckSquare size={48} className="mb-4 text-slate-300 dark:text-slate-700" strokeWidth={1.5} />
            <h3 className="text-lg font-black text-slate-700 dark:text-slate-300 mb-2 tracking-tight">대시보드 매장을 선택해주세요</h3>
            <p className="text-sm font-medium">왼쪽 목록에서 매장을 선택하면<br/>상세 체크리스트와 파일을 관리할 수 있습니다.</p>
          </div>
        )}
      </div>
    </div>

    {/* 매뉴얼 편집 모달 */}

    {descModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">업무 매뉴얼</p>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 leading-snug">{descModal.text}</h3>
            </div>
            <button onClick={() => setDescModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 py-4">
            <textarea
              value={descEdit}
              onChange={e => setDescEdit(e.target.value)}
              placeholder="이 업무를 어떻게 처리하는지 매뉴얼을 작성해주세요..."
              rows={6}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2 px-5 pb-4">
            {currentUser?.role === 'admin' && descModal.desc && (
              <button onClick={deleteDescription}
                className="px-3 py-2 rounded-lg text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors">
                삭제
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => setDescModal(null)}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              취소
            </button>
            {currentUser?.role === 'admin' && (
              <button onClick={saveDescription}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                저장
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}