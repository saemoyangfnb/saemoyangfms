import React, { useState, useEffect, useMemo, useRef } from 'react';
import { salesDb as db, db as mainDb, auth } from '../../firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc, getDoc, setDoc, onSnapshot, query, where, writeBatch, orderBy } from 'firebase/firestore';
import { FranchiseSchedule, TeamSetting, BrandId, Department, User, WorkItem, SystemActionType, SystemConfig, DepartmentTask } from '../../types';
import { Plus, Search, Settings, CheckCircle2, Eye, EyeOff, X, Layers, CheckCheck, Sparkles, Bot, Send, User as UserIcon, CalendarDays, AlertTriangle, FileText, CheckSquare, LayoutList } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Subcomponents
import { ScheduleTimeline } from './ScheduleTimeline';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';
import { TeamSettingsModal } from './TeamSettingsModal';
import { OpenChecklistView } from './OpenChecklistView';
import { DepartmentTaskView } from './DepartmentTaskView';
import { addDays, computeWorkItemDates } from '../../utils';
import {
  ProcessSettings,
  DEFAULT_PROCESS_SETTINGS,
  CALENDAR_PHASES,
  DEFAULT_MASTER_CHECKLIST,
} from './ProcessMasterModal';

interface Props {
  brandId: BrandId;
  currentUser: User | null;
  isReadOnly?: boolean;
}

// 💡 Firestore 저장을 위한 재귀적 데이터 정제 유틸 (undefined 제거)
const scrubData = (obj: any): any => {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj.map(scrubData).filter(v => v !== undefined);
  }
  if (obj && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const val = scrubData(obj[key]);
      if (val !== undefined) newObj[key] = val;
    }
    return newObj;
  }
  return obj;
};

export function FranchiseScheduleView({ brandId, currentUser, isReadOnly = false }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();

  // Data states
  const [schedules, setSchedules] = useState<FranchiseSchedule[]>([]);
  const [teams, setTeams] = useState<TeamSetting[]>([]);
  const [loading, setLoading] = useState(true);

  // View states
  const [viewTab, setViewTab] = useState<'calendar' | 'store'>('calendar');
  const [showArchived, setShowArchived] = useState(false);
  const [monthsView, setMonthsView] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [dbDepartments, setDbDepartments] = useState<Department[]>([]);
  const [sysConfig, setSysConfig] = useState<SystemConfig>({
    constTypes: [], signTypes: [], kitchenVendors: [], preTrainingLocations: [], gasTypes: []
  });

  // 💡 공통 코드 일회성 로드 (변경 빈도 낮음)
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(mainDb, 'system_settings', 'config')).then(snap => {
      if (!cancelled && snap.exists()) setSysConfig(snap.data() as SystemConfig);
    });
    return () => { cancelled = true; };
  }, []);

  //  DB 부서 정보 일회성 로드
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'departments')).then(snap => {
      if (cancelled) return;
      setDbDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department))
        .filter(d => d.brandId === brandId));
    });
    return () => { cancelled = true; };
  }, [brandId]);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingData, setEditingData] = useState<Partial<FranchiseSchedule> | null>(null);
  const [showStoreReg, setShowStoreReg] = useState(false);
  const [checklistSelectedStoreId, setChecklistSelectedStoreId] = useState<string | null>(null);
  const [checklistScrollToItemId, setChecklistScrollToItemId] = useState<string | undefined>(undefined);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [processSettings, setProcessSettings] = useState<ProcessSettings>(DEFAULT_PROCESS_SETTINGS);
  
  const [hoveredTeam, setHoveredTeam] = useState<{ name: string, members: any[], x: number, y: number } | null>(null);

  // AI 등록 관련 상태
  const [showAiModal, setShowAiModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'bot'|'user', text: string}[]>([]);
  const [chatStep, setChatStep] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAutoCalc, setIsAutoCalc] = useState(false);
  const [pendingAiData, setPendingAiData] = useState<Partial<FranchiseSchedule> | null>(null);
  const [chatMode, setChatMode] = useState<'CREATE' | 'UPDATE' | 'SEARCH_DRAWING' | null>(null);
  const [draftData, setDraftData] = useState<Partial<FranchiseSchedule>>({});
  const [updateStoreNotFound, setUpdateStoreNotFound] = useState(false);
  const [updateField, setUpdateField] = useState('');
  const [updateDates, setUpdateDates] = useState<{start: string, end: string|null} | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  //  미니 달력 선택기 상태
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState(new Date());

  //  시스템 활동 로그 기록 센서
  const logActivity = async (
    action: string,
    details: string,
    extra?: { storeName?: string; before?: string; after?: string; section?: string }
  ) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(mainDb, 'activity_logs'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || '관리자',
        action,
        details,
        timestamp: new Date().toISOString(),
        section: 'franchise',
        ...(extra ?? {}),
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  useEffect(() => {
    if (showAiModal) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showAiModal]);

  // franchise_schedules + team_settings 실시간 구독
  useEffect(() => {
    setLoading(true);
    const unsubSch = onSnapshot(
      query(collection(db, 'franchise_schedules'), where('brandId', '==', brandId)),
      (snap) => {
        setSchedules(snap.docs.map(d => ({ ...d.data() as FranchiseSchedule, id: d.id })));
        setLoading(false);
      },
      () => { toast.error('일정 데이터를 불러오지 못했습니다.'); setLoading(false); }
    );
    const unsubTeam = onSnapshot(
      query(collection(db, 'team_settings'), where('brandId', '==', brandId)),
      (snap) => { setTeams(snap.docs.map(d => ({ ...d.data() as TeamSetting, id: d.id }))); }
    );
    return () => { unsubSch(); unsubTeam(); };
  }, [brandId]);

  //   마스터 항목 통합 마이그레이션 및 로드 (onSnapshot → getDoc으로 변경, write-in-listener 루프 방지)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const snap = await getDoc(doc(db, 'process_settings', brandId));
      if (!snap.exists() || cancelled) return;
      const data = snap.data() as ProcessSettings;

      if (!data.masterItemsMigrated || !data.masterItems) {
        console.log("🛠️ 업무 마스터 통합 마이그레이션 시작...");
        const migratedItems: WorkItem[] = [];
        let order = 0;

        const oldChecklist = data.masterChecklist || DEFAULT_MASTER_CHECKLIST;
        oldChecklist.forEach(item => {
          const syncToFieldMap: Record<string, keyof FranchiseSchedule> = {
            'item_16': 'preTrainingStart' as any,
            'item_24': 'ownerGuideStart' as any
          };
          const systemActionMap: Record<string, SystemActionType> = {
            'item_18': 'drawing_upload',
            'item_16': 'pre_training_pay',
            'item_24': 'owner_guide_sync'
          };

          const newItem: WorkItem = {
            id: item.id,
            text: item.text,
            category: 'checklist',
            inputType: item.type as any,
            departmentId: item.departmentId || '',
            dDayOffset: 0,
            order: order++,
            isArchived: false
          };
          if (syncToFieldMap[item.id]) newItem.syncToField = syncToFieldMap[item.id];
          if (systemActionMap[item.id]) newItem.systemAction = systemActionMap[item.id];
          migratedItems.push(newItem);
        });

        const fieldToKeyMap: Record<string, keyof FranchiseSchedule> = {
          'constructionStart': 'constructionStart', 'constructionEnd': 'constructionEnd',
          'oven': 'ovenIn', 'burner': 'burnerIn', 'equipment': 'equipmentIn',
          'guide': 'ownerGuideStart', 'preTraining': 'preTrainingStart',
          'training': 'trainingStart', 'initialStock': 'initialStockIn', 'open': 'openDate'
        };

        CALENDAR_PHASES.forEach(phase => {
          const schField = fieldToKeyMap[phase.id];
          const newItem: WorkItem = {
            id: `sch_${phase.id}`,
            text: phase.label,
            category: 'schedule_date',
            inputType: (phase.id === 'preTraining' || phase.id === 'training') ? 'date_range' : 'date',
            calendarVisible: data.phaseVisibility?.[phase.id] !== false,
            order: order++,
            isArchived: false
          };
          if (schField) newItem.scheduleField = schField;
          migratedItems.push(newItem);
        });

        if (!cancelled) {
          await updateDoc(doc(db, 'process_settings', brandId), {
            masterItems: scrubData(migratedItems),
            masterItemsMigrated: true
          });
          toast.info("업무 마스터 마이그레이션이 완료되었습니다.");
          // 마이그레이션 후 재로드
          const snap2 = await getDoc(doc(db, 'process_settings', brandId));
          if (!cancelled && snap2.exists()) setProcessSettings(snap2.data() as ProcessSettings);
        }
      } else {
        // 2차 마이그레이션: 공사시작/종료를 isSystem으로 보호 + 명칭 고정
        const SYSTEM_CONSTRUCTION_IDS = ['sch_constructionStart', 'sch_constructionEnd'];
        const SYSTEM_LABELS: Record<string, string> = {
          sch_constructionStart: '공사 시작일',
          sch_constructionEnd: '공사 종료일',
        };
        const items: WorkItem[] = data.masterItems || [];
        let needsSystemMigration = items.some(i =>
          SYSTEM_CONSTRUCTION_IDS.includes(i.id) && (!i.isSystem || i.text !== SYSTEM_LABELS[i.id])
        );
        // 시스템 항목이 아예 없는 경우도 체크
        const missingSystem = SYSTEM_CONSTRUCTION_IDS.filter(id => !items.find(i => i.id === id));
        if (missingSystem.length > 0) needsSystemMigration = true;

        if (needsSystemMigration && !cancelled) {
          let updatedItems = items.map(i =>
            SYSTEM_CONSTRUCTION_IDS.includes(i.id)
              ? { ...i, isSystem: true, text: SYSTEM_LABELS[i.id] }
              : i
          );
          // 없는 시스템 항목 추가 (맨 앞에)
          missingSystem.forEach(id => {
            const schField = id === 'sch_constructionStart' ? 'constructionStart' : 'constructionEnd';
            updatedItems = [
              {
                id,
                text: SYSTEM_LABELS[id],
                category: 'schedule_date' as any,
                inputType: 'date' as any,
                scheduleField: schField as any,
                isSystem: true,
                calendarVisible: true,
                order: -1,
                isArchived: false,
              },
              ...updatedItems,
            ];
          });
          // order 재정렬
          updatedItems = updatedItems.map((i, idx) => ({ ...i, order: idx }));
          await updateDoc(doc(db, 'process_settings', brandId), { masterItems: scrubData(updatedItems) });
          const snap2 = await getDoc(doc(db, 'process_settings', brandId));
          if (!cancelled && snap2.exists()) setProcessSettings(snap2.data() as ProcessSettings);
        } else {
          if (!cancelled) setProcessSettings(data);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [brandId]);


  const handleSaveSchedule = async (data: Partial<FranchiseSchedule>) => {
    try {
      if (data.id) {
        const { id, ...updates } = data;

        // 변경 전/후 비교를 위해 기존 데이터 조회
        const existing = schedules.find(s => s.id === id);
        const DATE_FIELD_LABELS: Record<string, string> = {
          constructionStart: '공사 시작일', constructionEnd: '공사 종료일',
          openDate: '오픈일', equipmentIn: '기기 반입일', ovenIn: '오븐 반입일',
          initialStockIn: '초도 발주일', trainingStart: '교육 시작일',
          ownerGuideStart: '점주 교육일',
        };
        const changedFields: string[] = [];
        let beforeSummary = '';
        let afterSummary = '';
        if (existing) {
          for (const [key, label] of Object.entries(DATE_FIELD_LABELS)) {
            const oldVal = (existing as any)[key];
            const newVal = (updates as any)[key];
            if (newVal !== undefined && oldVal !== newVal) {
              changedFields.push(label);
              beforeSummary = beforeSummary || `${label}: ${oldVal || '미설정'}`;
              afterSummary = afterSummary || `${label}: ${newVal || '미설정'}`;
            }
          }
          if (existing.storeName !== updates.storeName && updates.storeName) {
            changedFields.push('매장명');
            beforeSummary = `매장명: ${existing.storeName}`;
            afterSummary = `매장명: ${updates.storeName}`;
          }
        }
        const detailMsg = changedFields.length > 0
          ? `[${updates.storeName || existing?.storeName || '매장'}] ${changedFields.join(', ')} 변경`
          : `[${updates.storeName || '매장'}] 오픈 일정 변경`;

        await updateDoc(doc(db, 'franchise_schedules', id), {
          ...updates,
          updatedAt: new Date().toISOString()
        });
        toast.success('일정이 수정되었습니다.');
        await logActivity('일정 수정', detailMsg, {
          storeName: updates.storeName || existing?.storeName,
          before: beforeSummary || undefined,
          after: afterSummary || undefined,
        });

        // openDate 변경 시 department_tasks dueDate 일괄 재계산
        if (existing && updates.openDate && updates.openDate !== existing.openDate) {
          const tasksSnap = await getDocs(
            query(collection(db, 'department_tasks'), where('scheduleId', '==', id))
          );
          if (!tasksSnap.empty) {
            const taskBatch = writeBatch(db);
            const now = new Date().toISOString();
            tasksSnap.forEach(tDoc => {
              const task = tDoc.data() as DepartmentTask;
              if (typeof task.dDayOffset === 'number') {
                taskBatch.update(tDoc.ref, {
                  dueDate: addDays(updates.openDate!, task.dDayOffset),
                  updatedAt: now,
                });
              }
            });
            await taskBatch.commit();
            toast.success(`부서 업무 ${tasksSnap.size}건 날짜 자동 조정 완료`);
          }
        }
      } else {
        //  [신규] 매장 등록과 동시에 템플릿 업무를 자동 생성합니다.
        const docRef = await addDoc(collection(db, 'franchise_schedules'), {
          ...data,
          brandId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        if (data.openDate) {
           // 관리자 패널에서 설정한 템플릿 로드
           const templateSnap = await getDocs(query(collection(db, 'task_templates'), where('brandId', '==', brandId)));
           if (!templateSnap.empty) {
              const batch = writeBatch(db);
              templateSnap.forEach(tDoc => {
                const template = tDoc.data();
                const taskRef = doc(collection(db, 'department_tasks'));
                // 오픈일 기준 D-Day 자동 계산
                const dueDate = addDays(data.openDate!, template.dDayOffset || 0);
                
                batch.set(taskRef, {
                  scheduleId: docRef.id,
                  brandId,
                  departmentId: template.departmentId,
                  title: template.title,
                  status: 'pending',
                  dueDate,
                  dDayOffset: template.dDayOffset || 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
              });
              await batch.commit();
           }
        }

        toast.success('새 일정이 등록되고 부서별 업무가 자동 배분되었습니다.');
        await logActivity('일정 등록', `[${data.storeName || '매장'}] 신규 오픈 일정 등록 및 업무 자동 생성`);
      }
      setShowForm(false);
      setEditingData(null);
      // onSnapshot이 자동으로 반영
    } catch (err) {
      console.error(err);
      toast.error('일정을 저장하지 못했습니다.');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const ok = await confirm({ title: '일정 삭제', message: '정말 삭제하시겠습니까?', confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    try {
      const s = schedules.find(x => x.id === id);
      await deleteDoc(doc(db, 'franchise_schedules', id));
      await logActivity('일정 삭제', `[${s?.storeName || '매장'}] 오픈 일정 삭제`);
      toast.success('일정 삭제됨');
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handleUpdateProgress = async (scheduleId: string, checkId: string, isCustom: boolean, currentVal: boolean) => {
    try {
      const schedule = schedules.find(s => s.id === scheduleId);
      if (!schedule) return;

      if (isCustom) {
        const newProgress = { ...((schedule as any).customProgressCheck || {}), [checkId]: !currentVal };
        setSchedules(prev => prev.map(x => x.id === scheduleId ? { ...x, customProgressCheck: newProgress } : x));
        await updateDoc(doc(db, 'franchise_schedules', scheduleId), { [`customProgressCheck.${checkId}`]: !currentVal });
        await logActivity('진행 체크', `[${schedule.storeName}] 커스텀 진행 항목 상태 변경`);
      } else {
        const newProgress = {
          ...(schedule.progressCheck || { drawingUpload: false, ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
          [checkId]: !currentVal
        };
        setSchedules(prev => prev.map(x => x.id === scheduleId ? { ...x, progressCheck: newProgress as any } : x));
        await updateDoc(doc(db, 'franchise_schedules', scheduleId), { progressCheck: newProgress });
        await logActivity('진행 체크', `[${schedule.storeName}] 진행 항목 상태 변경`);
      }
    } catch(e) { console.error(e); }
  };

  // 💡 [성능 최적화] 낙관적 업데이트 적용: 화면을 먼저 수정하고 서버는 백그라운드에서 저장
  const handleTaskOffsetUpdate = async (scheduleId: string, itemId: string, diffDays: number, newStartDate: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    const workItem = (processSettings.masterItems || []).find(i => i.id === itemId);
    if (!schedule || !workItem) return;

    // 1. 고정 필드형 (Milestone) 처리
    if (workItem.category === 'schedule_date' && workItem.scheduleField) {
      const updates: any = { [workItem.scheduleField]: newStartDate };

      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, ...updates } : s));
      await updateDoc(doc(db, 'franchise_schedules', scheduleId), updates);

      // 오픈일 드래그 이동 시 department_tasks 전체 재계산
      if (workItem.scheduleField === 'openDate') {
        const tasksSnap = await getDocs(
          query(collection(db, 'department_tasks'), where('scheduleId', '==', scheduleId))
        );
        if (!tasksSnap.empty) {
          const taskBatch = writeBatch(db);
          const now = new Date().toISOString();
          tasksSnap.forEach(tDoc => {
            const task = tDoc.data() as DepartmentTask;
            if (typeof task.dDayOffset === 'number') {
              taskBatch.update(tDoc.ref, {
                dueDate: addDays(newStartDate, task.dDayOffset),
                updatedAt: now,
              });
            }
          });
          await taskBatch.commit();
          toast.success(`[${schedule.storeName}] 오픈일 변경 → 부서 업무 ${tasksSnap.size}건 자동 조정`);
        } else {
          toast.success(`[${schedule.storeName}] ${workItem.text} 일정이 변경되었습니다.`);
        }
      } else {
        toast.success(`[${schedule.storeName}] ${workItem.text} 일정이 변경되었습니다.`);
      }
      return;
    }

    // 2. 태스크/체크리스트형 처리 (fixedDate 사용)
    const currentData = (schedule as any).checklistData || {};
    const itemData = currentData[itemId] || { status: 0 };

    // 기존 기간(duration)을 유지하며 종료일 재계산
    let finalEndDate = newStartDate;
    const prevStart = itemData.fixedDate;
    const prevEnd = itemData.fixedEndDate;
    if (prevStart && prevEnd && prevEnd > prevStart) {
      const durMs = new Date(prevEnd).getTime() - new Date(prevStart).getTime();
      const newEnd = new Date(new Date(newStartDate).getTime() + durMs);
      finalEndDate = newEnd.toISOString().split('T')[0];
    }

    // 1. 로컬 상태 즉시 업데이트 (사용자는 딜레이를 느끼지 못함)
    setSchedules(prev => prev.map(s => {
      if (s.id === scheduleId) {
        return {
          ...s,
          checklistData: {
            ...currentData,
            [itemId]: { ...itemData, fixedDate: newStartDate, fixedEndDate: finalEndDate }
          }
        };
      }
      return s;
    }));

    // 2. 서버 업데이트 (비동기 처리)
    const updatedChecklistData = {
      ...currentData,
      [itemId]: { ...itemData, fixedDate: newStartDate, fixedEndDate: finalEndDate }
    };

    try {
      // 메인 문서 업데이트
      await updateDoc(doc(db, 'franchise_schedules', scheduleId), { checklistData: updatedChecklistData });

      // 관련 태스크 문서 검색 및 업데이트 (성능을 위해 await 제거)
      const taskQuery = query(collection(db, 'department_tasks'), 
        where('scheduleId', '==', scheduleId), 
        where('title', '==', workItem.text)
      );
      getDocs(taskQuery).then(taskSnap => {
        if (!taskSnap.empty) {
          updateDoc(doc(db, 'department_tasks', taskSnap.docs[0].id), { dueDate: newStartDate });
        }
      });

      await logActivity('매장 일정 개별 변경', `${schedule.storeName}: ${workItem.text} 이동`);
    } catch (err) {
      toast.error('일정 저장 중 오류가 발생했습니다.');
    }
  };

  const handleArchive = async (id: string) => {
    const ok = await confirm({ title: '오픈 완료 및 보관', message: '오픈 완료 상태로 보관하시겠습니까?', confirmLabel: '보관하기', variant: 'danger' });
    if (!ok) return;
    try {
      const s = schedules.find(x => x.id === id);
      await updateDoc(doc(db, 'franchise_schedules', id), { archived: true });
      await logActivity('일정 보관', `[${s?.storeName || '매장'}] 오픈 완료 및 보관함 이동`);
      toast.success('매장이 보관되었습니다.');
    } catch(e) { console.error(e); }
  };

  //  신규: 다음 호수 자동 추출 (에러 해결)
  const nextStoreNumber = useMemo(() => {
    const nums = schedules
      .map(s => parseInt((s.storeNumber || '').replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n));
    if (nums.length === 0) return 1;
    return Math.max(...nums) + 1;
  }, [schedules]);

  //  세부일정 미입력 매장 감지 (사전교육 제외)
  const missingSchedules = useMemo(() => {
    return schedules.filter(s =>
      !s.archived && s.storeName &&
      !s.constructionStart && !s.constructionEnd &&
      !s.ovenIn && !s.equipmentIn && !s.trainingStart &&
      !s.initialStockIn && !s.ownerGuideStart && !s.openDate
    );
  }, [schedules]);

  //  도면 미입력 매장 감지
  const missingDrawings = useMemo(() => {
    return schedules.filter(s => !s.archived && s.storeName && !s.finalDrawingPdfUrl);
  }, [schedules]);

  //  교육비 미입금 매장 감지
  const unpaidSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (s.archived) return false;
      const data = (s as any).checklistData || {};
      return Object.values(data).some((item: any) => item.note8 === '미입금');
    });
  }, [schedules]);

  const CHAT_QUESTIONS = useMemo(() => {
    return [
      "안녕하세요! ✨ 일정을 관리해 드릴게요.\n원하시는 작업을 버튼으로 선택해 주세요.", // 0
      "어느 매장인가요? (매장명 2~4글자로 짧게 작성해 주세요. 예: 첨단점)", // 1
      `몇 호점인가요? (가장 최근 등록된 다음 번호로 세팅되었습니다.)`, // 2
      "담당할 팀을 선택해 주세요.", // 3
      "매장 일정을 어떻게 입력하시겠어요?\n\n🔹 자동 계산: 공사일만 선택하면 완료\n🔹 수동 상세 입력: 모든 일정을 직접 캘린더로 지정", // 4
      "공사 시작일과 종료일을 캘린더에서 선택해 주세요. (첫 클릭: 시작일, 두 번째 클릭: 종료일)", // 5
      "최종 도면이 준비되었나요? (준비되었다면 '네', 아니면 패스를 선택해 주세요. 실제 파일 첨부는 대화 완료 후 가능합니다.)", // 6
      "공사 업체는 어디인가요?", // 7
      "간판 업체는 어디인가요?", // 8
      "화덕 입고일은 언제인가요? 캘린더에서 선택해 주세요.", // 9
      "가스 종류는 무엇인가요?", // 10
      "화구류 입고일은 언제인가요? 캘린더에서 선택해 주세요.", // 11
      "점주 안내 시작일은 언제인가요? 캘린더에서 선택해 주세요.", // 12
      "사전교육 시작일과 종료일을 캘린더에서 선택해 주세요. (진행 안 하시면 '진행 안함' 클릭)", // 13
      "사전교육 장소와 참여 인원은 어떻게 되나요? (예: 남원 3명. 모르면 엔터)", // 14
      "초도물품 입고일은 언제인가요? 캘린더에서 선택해 주세요.", // 15
      "본사교육 시작일과 종료일을 캘린더에서 선택해 주세요. (진행 안 하시면 '진행 안함' 클릭)", // 16
      "그랜드 오픈일은 언제인가요? 캘린더에서 선택해 주세요.", // 17
      "마지막으로 기타 특이사항/메모가 있나요? (없으면 엔터 치시면 완료됩니다!)" // 18
    ];
  }, []);

  const openAiChat = () => {
    setChatMessages([{ role: 'bot', text: CHAT_QUESTIONS[0] }]);
    setChatStep(0);
    setChatInput('');
    setPendingAiData(null);
    setRangeStart(null);
    setRangeEnd(null);
    setChatMode(null);
    setDraftData({});
    setUpdateStoreNotFound(false);
    setUpdateField('');
    setUpdateDates(null);
    setPickerMonth(new Date());
    setIsAutoCalc(false);
    setShowAiModal(true);
  };

  //  미니 캘린더 렌더러
  const renderMiniCalendar = () => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);

    const handleDateClick = (d: string) => {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(d); setRangeEnd(null);
      } else {
        if (d < rangeStart) { setRangeStart(d); setRangeEnd(null); } 
        else { setRangeEnd(d); }
      }
    };

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm select-none">
        <div className="flex justify-between items-center mb-3 px-2">
          <button type="button" onClick={() => setPickerMonth(new Date(year, month - 1, 1))} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1">&lt;</button>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{year}년 {month + 1}월</span>
          <button type="button" onClick={() => setPickerMonth(new Date(year, month + 1, 1))} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1">&gt;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 font-semibold">
          <span className="text-rose-500">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span className="text-blue-500">토</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((d, i) => {
            if (!d) return <div key={i} className="h-8" />;
            const dateNum = parseInt(d.split('-')[2]);
            const isStart = d === rangeStart; const isEnd = d === rangeEnd;
            const inRange = rangeStart && rangeEnd && d > rangeStart && d < rangeEnd;
            
            let bgClass = 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md';
            if (isStart) bgClass = 'bg-indigo-600 text-white rounded-l-md rounded-r-none';
            if (isEnd) bgClass = 'bg-indigo-600 text-white rounded-r-md rounded-l-none';
            if (isStart && isEnd || (!isEnd && isStart && !rangeEnd)) bgClass = 'bg-indigo-600 text-white rounded-md';
            if (inRange) bgClass = 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 rounded-none';

            return <button key={i} type="button" onClick={() => handleDateClick(d)} className={`h-8 text-xs font-medium flex items-center justify-center cursor-pointer transition-colors ${bgClass}`}>{dateNum}</button>;
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => { setRangeStart(null); setRangeEnd(null); submitChat('패스 (진행 안함)'); }} className="flex-1 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">진행 안함 (패스)</button>
          <button type="button" disabled={!rangeStart} onClick={() => { submitChat(rangeStart && rangeEnd ? `${rangeStart} ~ ${rangeEnd}` : `${rangeStart} ~ ${rangeStart}`); setRangeStart(null); setRangeEnd(null); }} className="flex-1 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">{rangeStart && rangeEnd ? '기간 선택 완료' : rangeStart ? '시작일만 선택됨 (하루)' : '날짜를 선택하세요'}</button>
        </div>
      </div>
    );
  };

  const handleSendChatForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    submitChat(chatInput);
  };

  const submitChat = async (text: string) => {
    if (isAiProcessing) return;

    if (pendingAiData) {
      setEditingData(pendingAiData);
      setShowAiModal(false);
      setShowForm(true);
      setPendingAiData(null);
      return;
    }

    let rawInput = text.trim();
    if (!rawInput && chatStep === 2) rawInput = `${nextStoreNumber}호`;
    if (!rawInput && chatStep === 3) rawInput = '선택 안함';
    if (!rawInput) rawInput = '엔터 (패스)';

    setChatInput('');
    
    const newMessages = [...chatMessages, { role: 'user' as const, text: rawInput || '엔터 (패스)' }];
    setChatMessages(newMessages);

    //   라이브 프리뷰 업데이트 (Draft Data)
    let currentMode = chatMode;
    if (chatStep === 0) {
      if (rawInput.includes('신규') || rawInput.includes('1')) currentMode = 'CREATE';
      else if (rawInput.includes('도면') || rawInput.includes('검색')) currentMode = 'SEARCH_DRAWING';
      else currentMode = 'UPDATE';
      setChatMode(currentMode);
    }
    
    let validationError = '';
    let newDraft = { ...draftData } as Partial<FranchiseSchedule>;
    if (chatStep === 1) {
      if (currentMode === 'UPDATE' || currentMode === 'SEARCH_DRAWING') {
        const existing = schedules.find(s => s.storeName.includes(rawInput) || rawInput.includes(s.storeName));
        if (existing) {
          newDraft = { ...existing };
          setUpdateStoreNotFound(false);
          
          if (currentMode === 'SEARCH_DRAWING') {
            setDraftData(newDraft);
            if (existing.finalDrawingPdfUrl) {
              setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: `✨ [${existing.storeName}] 매장의 도면을 찾았습니다!\n\n새 창에서 PDF가 자동으로 열립니다. (팝업이 차단된 경우 아래 링크를 클릭하세요)\n🔗 ${existing.finalDrawingPdfUrl}` }]), 300);
              setTimeout(() => window.open(existing.finalDrawingPdfUrl, '_blank'), 800);
            } else {
              setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: `앗, [${existing.storeName}] 매장은 아직 첨부된 도면(PDF)이 없습니다. 😢\n창을 닫거나 처음으로 돌아가 주세요.` }]), 300);
            }
            setChatStep(99); // 대화 종료 스텝
            return;
          }
        } else {
          validationError = "⚠️ 해당 매장명을 찾을 수 없습니다. 아래 목록에서 선택해 주세요.";
          setUpdateStoreNotFound(true);
        }
      } else {
        if (rawInput === '엔터 (패스)' || rawInput.length < 2 || rawInput.length > 4) {
          validationError = "⚠️ 매장명은 2~4글자로 짧게 작성해 주세요. (예: 첨단점)";
        } else {
        newDraft.storeName = rawInput;
        }
      }
    }
    if (chatStep === 2) newDraft.storeNumber = rawInput === '엔터 (패스)' ? '' : rawInput;
    if (chatStep === 3) newDraft.team = rawInput === '엔터 (패스)' ? '' : rawInput;
    
    const parseDates = (text: string) => {
      if (text === '패스 (진행 안함)' || text === '엔터 (패스)') return null;
      if (text.includes('~')) { const parts = text.split('~').map(s => s.trim()); return { start: parts[0], end: parts[1] || parts[0] }; }
      return { start: text, end: text };
    };
    const applyDraft = (k1: string, v1: string, k2: string, v2: string) => {
      if (v1 && !v1.includes('월요일') && !v1.includes('내일')) { (newDraft as any)[k1] = v1; (newDraft as any)[k2] = v2; }
    };
    
    if (chatStep === 5) { const d = parseDates(rawInput); if (d) applyDraft('constructionStart', d.start, 'constructionEnd', d.end); }
    if (chatStep === 6) {
      if (rawInput === '네' || rawInput.includes('준비') || rawInput.includes('ㅇㅇ')) {
        newDraft.progressCheck = { ...(newDraft.progressCheck || {}), drawingUpload: true } as any;
      }
    }
    if (chatStep === 7 && rawInput !== '엔터 (패스)') newDraft.constructionType = rawInput;
    if (chatStep === 8 && rawInput !== '엔터 (패스)') newDraft.signageType = rawInput;
    if (chatStep === 9) { const d = parseDates(rawInput); if (d) applyDraft('ovenIn', d.start, 'ovenEnd', d.start); }
    if (chatStep === 10 && rawInput !== '엔터 (패스)') newDraft.gasType = rawInput;
    if (chatStep === 11) { const d = parseDates(rawInput); if (d) applyDraft('equipmentIn', d.start, 'equipmentIn', d.start); }
    if (chatStep === 12) { const d = parseDates(rawInput); if (d) applyDraft('ownerGuideStart', d.start, 'ownerGuideStart', d.start); }
    if (chatStep === 13) { const d = parseDates(rawInput); if (d) applyDraft('preTrainingStart', d.start, 'preTrainingEnd', d.end); }
    if (chatStep === 15) { const d = parseDates(rawInput); if (d) applyDraft('initialStockIn', d.start, 'initialStockEnd', d.start); }
    if (chatStep === 16) { const d = parseDates(rawInput); if (d) applyDraft('trainingStart', d.start, 'trainingEnd', d.end); }
    if (chatStep === 17) { const d = parseDates(rawInput); if (d) applyDraft('openDate', d.start, 'openDate', d.start); }
    
    setDraftData(newDraft);

    if (validationError) {
      setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: validationError }]), 300);
      return; // ❌ 에러가 있으면 다음 단계로 안 넘어감!
    }

    //   UPDATE(변경) 모드 전용 채팅 플로우
    if (currentMode === 'UPDATE') {
      if (chatStep === 1) {
         setDraftData(newDraft);
         setChatStep(20);
         setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: '어떤 일정을 변경하시겠어요?' }]), 300);
         return;
      }
      if (chatStep === 20) {
         setUpdateField(rawInput); 
         setChatStep(21);
         setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: '새로운 일정을 달력에서 선택해 주세요.' }]), 300);
         return;
      }
      if (chatStep === 21) {
         const d = parseDates(rawInput);
         if (!d) return;
         setUpdateDates(d);
         setChatStep(22);
         let oldStr = '';
         if (updateField === '공사') oldStr = `${newDraft.constructionStart||'-'} ~ ${newDraft.constructionEnd||'-'}`;
         else if (updateField === '화덕') oldStr = `화덕: ${newDraft.ovenIn||'-'}`;
         else if (updateField === '화구') oldStr = `화구: ${newDraft.equipmentIn||'-'}`;
         else if (updateField === '점주안내') oldStr = `점주안내: ${newDraft.ownerGuideStart||'-'}`;
         else if (updateField === '사전교육') oldStr = `${newDraft.preTrainingStart||'-'} ~ ${newDraft.preTrainingEnd||'-'}`;
         else if (updateField === '초도물품') oldStr = `초도물품: ${newDraft.initialStockIn||'-'}`;
         else if (updateField === '본사교육') oldStr = `${newDraft.trainingStart||'-'} ~ ${newDraft.trainingEnd||'-'}`;
         else if (updateField === '오픈일') oldStr = `오픈일: ${newDraft.openDate||'-'}`;

         let newStr = d.start === d.end ? d.start : `${d.start} ~ ${d.end}`;
         setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: `[${newDraft.storeName}] ${updateField} 일정을 아래와 같이 변경할까요?\n\n기존: ${oldStr}\n변경: ${newStr}` }]), 300);
         return;
      }
      if (chatStep === 22) {
         if (rawInput === '네') {
             const d = updateDates;
             if (d) {
               if (updateField === '공사') { newDraft.constructionStart = d.start; newDraft.constructionEnd = d.end || d.start; }
               else if (updateField === '화덕') { newDraft.ovenIn = d.start; newDraft.ovenEnd = d.start; }
               else if (updateField === '화구') { newDraft.equipmentIn = d.start; }
               else if (updateField === '점주안내') { newDraft.ownerGuideStart = d.start; }
               else if (updateField === '사전교육') { newDraft.preTrainingStart = d.start; newDraft.preTrainingEnd = d.end || d.start; }
               else if (updateField === '초도물품') { newDraft.initialStockIn = d.start; newDraft.initialStockEnd = d.start; }
               else if (updateField === '본사교육') { newDraft.trainingStart = d.start; newDraft.trainingEnd = d.end || d.start; }
               else if (updateField === '오픈일') { newDraft.openDate = d.start; }
             }
             setDraftData(newDraft);
             setPendingAiData(newDraft);
             setChatStep(23); // 최종 확정
             setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: "✨ 변경이 완료되었습니다. 위 요약표를 확인 후 [엔터]를 누르시면 최종 저장 폼으로 이동합니다." }]), 300);
         } else {
             setChatStep(20);
             setUpdateDates(null);
             setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: '취소되었습니다. 어떤 일정을 변경하시겠어요?' }]), 300);
         }
         return;
      }
    }

    let nextStep = chatStep + 1;
    //  핵심 분기: 자동 계산 모드면 6번(도면) 질문 이후 바로 18번(종료)으로 스킵!
    if (chatStep === 6 && isAutoCalc) {
      nextStep = 18;
    }

    if (nextStep < CHAT_QUESTIONS.length) {
      setChatStep(nextStep);
      if (nextStep === 2) setChatInput(`${nextStoreNumber}호`);
      if (nextStep === 3) setChatInput('선택 안함');
      
      setTimeout(() => {
        let msgText = CHAT_QUESTIONS[nextStep];
        
        //  초도물품 입고일 질문 시 공사 종료일 안내 가이드 동적 삽입
        if (nextStep === 15) {
          msgText += `\n\n💡 참고: 설정하신 공사 종료일은 [ ${newDraft.constructionEnd || '미정'} ] 입니다.`;
        }
        setChatMessages(prev => [...prev, { role: 'bot', text: msgText }]);
      }, 300); // 약간의 딜레이로 자연스러운 채팅 연출
    } else {
      setChatMessages(prev => [...prev, { role: 'bot', text: '입력하신 정보를 바탕으로 일정을 생성하고 있습니다. 잠시만 기다려주세요... ⏳' }]);
      await handleAiAnalyze(newMessages);
    }
  };

  const handleAiAnalyze = async (messages: {role: string, text: string}[]) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('API 키가 설정되지 않았습니다. 관리자에게 문의하세요.');
      return;
    }
    setIsAiProcessing(true);
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const transcript = messages.map(m => `${m.role === 'bot' ? '질문' : '답변'}: ${m.text}`).join('\n');
      
      const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

      const prompt = `당신은 프랜차이즈 매장 오픈 일정을 관리하는 최고 수준의 엘리트 AI 비서입니다. 사용자와의 대화 내역을 분석해서 JSON 형식으로 데이터를 추출해 주세요.

[🔥 핵심 지침 🔥]
1. 첫 번째 답변을 분석하여 "CREATE" 또는 "UPDATE"로 'action' 값을 정확히 설정하세요.
2. 오늘 날짜는 ${todayStr} 입니다. '내일', '다음주 월요일' 등 날짜 관련 표현을 오늘을 기준으로 정확한 연도와 날짜(YYYY-MM-DD) 형식으로 변환하세요.
3. 정보가 누락되었거나 '패스', '진행 안함'이라고 대답한 항목은 절대 억지로 지어내지 말고 반드시 빈 문자열("")로 비워두세요.
4. 마크다운 기호 없이 오직 순수 JSON 객체 1개만 반환하세요.

[출력 JSON 포맷]
{
  "action": "CREATE" 또는 "UPDATE",
  "targetStoreName": "일정 변경인 경우, 대상이 되는 매장명 (신규면 빈칸)",
  "data": {
    "storeName": "매장명",
    "storeNumber": "매장 호수",
    "constructionStart": "공사 시작일 (YYYY-MM-DD)",
    "constructionEnd": "공사 종료일",
    "constructionType": "공사 업체 (더원, 감리, 직접입력 중 1)",
    "signageType": "간판 (동영, 직접 중 1)",
    "kitchenSupplier": "주방 (형제, 신광, 주원 중 1)",
    "gasType": "가스 (LNG, LPG, 미등록 중 1)",
    "team": "담당 팀명",
    "supervisor": "담당 SV 이름",
    "ovenIn": "화덕 입고일",
    "equipmentIn": "화구류 입고일",
    "preTrainingStart": "사전교육 시작일",
    "preTrainingEnd": "사전교육 종료일",
    "preTrainingLocation": "사전교육 장소",
    "trainingStart": "본사교육 시작일",
    "trainingEnd": "본사교육 종료일",
    "initialStockIn": "초도물품 입고일",
    "openDate": "그랜드 오픈일",
    "ownerGuideStart": "점주 안내 시작일",
    "notes": "특이사항",
    "progressCheck": {
      "drawingUpload": "도면 준비 여부 (true/false)"
    }
  }
}

[대화 내역]
${transcript}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      let resultText = response.text || '';
      resultText = resultText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim(); // 마크다운 강제 제거 (파싱 에러 방지)
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        let finalData = parsed.data;

        if (parsed.action === 'UPDATE' && parsed.targetStoreName) {
          const existing = schedules.find(s => s.storeName.includes(parsed.targetStoreName) || parsed.targetStoreName.includes(s.storeName));
          if (existing) {
            const cleanUpdates = Object.fromEntries(Object.entries(parsed.data).filter(([k, v]) => v !== "" && k !== "progressCheck"));
            finalData = { ...existing, ...cleanUpdates };
            if (parsed.data.progressCheck) {
               finalData.progressCheck = { ...existing.progressCheck, ...parsed.data.progressCheck };
            }
          }
        }
        
        finalData.isAiAutoCalc = isAutoCalc;

        const previewText = `[일정표 요약]
📌 매장명: ${finalData.storeName || '-'} ${finalData.storeNumber || ''}
📅 공사: ${finalData.constructionStart || '-'} ~ ${finalData.constructionEnd || '-'}
🔥 화덕 입고: ${finalData.ovenIn || '-'}
📦 화구 입고: ${finalData.equipmentIn || '-'}
🎓 사전교육: ${finalData.preTrainingStart || '-'} ~ ${finalData.preTrainingEnd || '-'}
🏢 본사교육: ${finalData.trainingStart || '-'} ~ ${finalData.trainingEnd || '-'}
🎉 그랜드오픈: ${finalData.openDate || '-'}

✨ 위 일정이 맞으시면 [엔터]를 눌러 폼으로 이동하시고, 취소/수정하시려면 [ESC]를 눌러주세요.`;

        setChatMessages(prev => [...prev, { role: 'bot', text: previewText }]);
        setPendingAiData(finalData);
        logActivity('AI 일정 분석', `자연어 기반 오픈 일정 ${parsed.action === 'UPDATE' ? '변경' : '생성'} 요약 안내 (${finalData.storeName || '매장미상'})`);
      } else {
        toast.error('AI 분석 결과를 처리할 수 없습니다. 좀 더 명확하게 작성해 주세요.');
      }
    } catch (err: any) {
      toast.error(`AI 분석 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsAiProcessing(false);
    }
  };

  //  라이브 프리뷰 (미니 캘린더) 렌더러
  const renderLivePreview = () => {
    const baseDateStr = draftData.constructionStart || draftData.openDate || new Date().toISOString().split('T')[0];
    // pickerMonth와 동기화하여 현재 선택중인 달을 보여줍니다.
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);

    return (
      <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-900 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 p-5 flex flex-col overflow-y-auto">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <CalendarDays size={16} className="text-indigo-500" /> 라이브 프리뷰
        </h3>
        
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              {chatMode === 'UPDATE' ? '변경' : chatMode === 'SEARCH_DRAWING' ? '검색' : '신규'}
            </span>
            <span className="font-bold text-slate-900 dark:text-white truncate">{draftData.storeName || '매장명 미정'}</span>
            <span className="text-xs font-semibold text-slate-500">{draftData.storeNumber || ''}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            <p>담당 팀: {draftData.team || '미정'} {draftData.supervisor ? `/ ${draftData.supervisor}` : ''}</p>
            {draftData.gasType && <p>가스 종류: {draftData.gasType}</p>}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm select-none">
          <div className="flex justify-between items-center mb-2 px-2">
            <button type="button" onClick={() => setPickerMonth(new Date(year, month - 1, 1))} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1">&lt;</button>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{year}년 {month + 1}월</span>
            <button type="button" onClick={() => setPickerMonth(new Date(year, month + 1, 1))} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1">&gt;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] mb-1 font-semibold">
            <span className="text-rose-500">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span className="text-blue-500">토</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d, i) => {
              if (!d) return <div key={i} className="h-6" />;
              const dateNum = parseInt(d.split('-')[2]);
              
              let isConst = draftData.constructionStart && d >= draftData.constructionStart && (!draftData.constructionEnd || d <= draftData.constructionEnd);
              let isPreTrain = draftData.preTrainingStart && d >= draftData.preTrainingStart && (!draftData.preTrainingEnd || d <= draftData.preTrainingEnd);
              let isTrain = draftData.trainingStart && d >= draftData.trainingStart && (!draftData.trainingEnd || d <= draftData.trainingEnd);
              let isOven = d === draftData.ovenIn;
              let isBurner = d === draftData.equipmentIn;
              let isOpen = d === draftData.openDate;
              let isStock = d === draftData.initialStockIn;

              let bgClass = ''; let textClass = 'text-slate-700 dark:text-slate-300';
              if (isOpen) { bgClass = 'bg-rose-500'; textClass = 'text-white font-bold shadow-md ring-2 ring-rose-300'; }
              else if (isStock) { bgClass = 'bg-amber-500'; textClass = 'text-white font-bold'; }
              else if (isBurner) { bgClass = 'bg-orange-500'; textClass = 'text-white font-bold'; }
              else if (isOven) { bgClass = 'bg-red-500'; textClass = 'text-white font-bold'; }
              else if (isTrain) { bgClass = 'bg-blue-400'; textClass = 'text-white font-bold'; }
              else if (isPreTrain) { bgClass = 'bg-emerald-400'; textClass = 'text-white font-bold'; }
              else if (isConst) { bgClass = 'bg-slate-200 dark:bg-slate-700'; textClass = 'text-slate-800 dark:text-slate-200 font-bold'; }

              return <div key={i} className={`h-6 text-[10px] flex items-center justify-center rounded-sm transition-all ${bgClass} ${textClass}`}>{dateNum}</div>;
            })}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-[9px] font-bold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-200 dark:bg-slate-700"></span>공사</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400"></span>사전교육</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400"></span>본사교육</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500"></span>화덕</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500"></span>화구</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500"></span>초도</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500"></span>오픈</span>
          </div>
        </div>
      </div>
    );
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (!showArchived && s.archived) return false;
      if (showArchived && !s.archived) return false;
      if (search && !s.storeName.includes(search)) return false;
      if (filterTeam && s.team !== filterTeam) return false;
      return true;
    }).sort((a, b) => (a.openDate || '').localeCompare(b.openDate || ''));
  }, [schedules, search, filterTeam, showArchived]);

  const timelineDates = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return {
      start: new Date(y, m - 1, 1).toISOString().split('T')[0],
      end:   new Date(y, m + 2, 0).toISOString().split('T')[0],
    };
  }, [currentMonth]);

  return (
    <div className="space-y-6">
       {/* 🚨 세부일정 누락 경고 배너 */}
       {missingSchedules.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-2 tracking-tight">세부 일정 등록이 필요한 매장이 있습니다.</h4>
            <div className="flex flex-wrap gap-2">
              {missingSchedules.map(s => (
                <button key={s.id} onClick={() => { setEditingData(s); setShowForm(true); }} className="text-xs font-bold bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-md border border-amber-100 dark:border-amber-700/50 shadow-sm hover:bg-amber-100 dark:hover:bg-slate-700 transition-colors text-left flex items-center gap-1">
                  {s.storeName} [{s.storeNumber || '호수미정'}] 일정 등록 필요 <span className="opacity-50 ml-0.5">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
       )}

       {/* 🚨 도면 누락 경고 배너 */}
       {missingDrawings.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <FileText className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-400 mb-2 tracking-tight">최종 도면 등록이 필요한 매장이 있습니다.</h4>
            <div className="flex flex-wrap gap-2">
              {missingDrawings.map(s => (
                <button key={`dw-${s.id}`} onClick={() => { setEditingData(s); setShowForm(true); }} className="text-xs font-bold bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-700/50 shadow-sm hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors text-left flex items-center gap-1">
                  {s.storeName} [{s.storeNumber || '호수미정'}] 도면 등록 필요 <span className="opacity-50 ml-0.5">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
       )}

       {/* 🚨 교육비 미입금 경고 배너 */}
       {unpaidSchedules.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-rose-800 dark:text-rose-400 mb-2 tracking-tight">사전 교육비 미입금 매장이 있습니다.</h4>
            <div className="flex flex-wrap gap-2">
              {unpaidSchedules.map(s => (
                <button key={`up-${s.id}`} onClick={() => { setViewTab('store'); }} className="text-xs font-bold bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 px-2.5 py-1.5 rounded-md border border-rose-100 dark:border-rose-700/50 shadow-sm hover:bg-rose-100 dark:hover:bg-slate-700 transition-colors text-left flex items-center gap-1">
                  {s.storeName} [{s.storeNumber || '호수미정'}] 입금 확인 <span className="opacity-50 ml-0.5">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
       )}

       {/* 헤더: 1행 - 제목 + 탭 + 버튼 */}
       <div className="flex flex-col gap-3">
         <div className="flex items-center gap-3 flex-wrap">
           {/* 제목 */}
           <div className="flex-1 min-w-0">
             <h1 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
               오픈 일정 관리
               <span className="bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-widest">자동 계산</span>
             </h1>
           </div>

           {/* 뷰 전환 탭 */}
           <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-lg border border-stone-200 dark:border-stone-700 shrink-0">
             <button
               onClick={() => setViewTab('calendar')}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${viewTab === 'calendar' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
             >
               <CalendarDays size={15} /> 캘린더
             </button>
             <button
               onClick={() => setViewTab('store')}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${viewTab === 'store' ? 'bg-white dark:bg-stone-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
             >
               <CheckSquare size={15} /> 매장 관리
             </button>
           </div>

           {/* 액션 버튼 — 열람 전용 모드에서 숨김 */}
           {!isReadOnly && (
           <div className="flex items-center gap-2 shrink-0">
             <button onClick={() => setShowStoreReg(true)} className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white text-sm font-bold rounded-sm hover:bg-stone-800 transition-colors shadow-sm whitespace-nowrap">
               <Plus size={15} /> 신규 등록
             </button>
             <button onClick={openAiChat} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 text-sm font-bold rounded-sm hover:bg-indigo-100 transition-colors shadow-sm whitespace-nowrap">
               <Bot size={15} /> AI
             </button>
             <button onClick={() => setShowTeamSettings(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-700 border border-stone-300 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm hover:bg-stone-100 transition-colors shadow-sm whitespace-nowrap">
               <Settings size={15} /> 팀 설정
             </button>
           </div>
           )}
         </div>
       </div>

       {viewTab === 'calendar' ? (
         <>
       <div className="bg-[#FDFBF7] dark:bg-stone-900 p-4 rounded-sm border border-stone-300 dark:border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300 dark:border-stone-700">
               <button onClick={() => setMonthsView(1)} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${monthsView === 1 ? 'bg-stone-50 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>1개월</button>
               <button onClick={() => setMonthsView(2)} className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${monthsView === 2 ? 'bg-stone-50 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>2개월</button>
            </div>
            
            <div className="flex items-center gap-1 font-bold ml-4">
               <button className="text-stone-400 hover:text-stone-800" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>&lt;</button>
               <span className="text-sm px-2 text-stone-900">{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</span>
               <button className="text-stone-400 hover:text-stone-800" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>&gt;</button>
               <button className="ml-2 text-[10px] bg-stone-800 text-white px-2 py-0.5 rounded-sm font-bold tracking-widest" onClick={() => setCurrentMonth(new Date())}>오늘</button>
            </div>
            {/* 인쇄 버튼 */}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-stone-400 rounded-sm font-bold hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors ml-2"
              title="현재 캘린더 인쇄 (브라우저 인쇄 다이얼로그)"
            >
              🖨️ 인쇄
            </button>
         </div>

         <div className="flex items-center gap-2 flex-wrap">
            <select className="px-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">전체 팀</option>
              {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <select className="px-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" value={selectedDeptFilter} onChange={e => setSelectedDeptFilter(e.target.value)}>
              <option value="all">전체 부서</option>
              {dbDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" placeholder="매장명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" />
            </div>
         </div>
       </div>

       {loading ? (
          <div className="py-20 text-center text-stone-400 font-bold">불러오는 중...</div>
       ) : (
          <div className="flex flex-col gap-10">
              <div id="calendar-print-area" className={`grid grid-cols-1 ${monthsView === 2 ? 'xl:grid-cols-2' : ''} gap-6 items-start`}>
                <ScheduleCalendar
                   schedules={filteredSchedules}
                   currentMonth={currentMonth}
                   teams={teams}
                   workItems={(processSettings.masterItems || []).filter(i => !i.isArchived)}
                   phaseVisibility={processSettings.phaseVisibility}
                   selectedDeptFilter={selectedDeptFilter}
                   onEditStore={(id, workItemId) => { setChecklistSelectedStoreId(id); setChecklistScrollToItemId(workItemId); setViewTab('store'); }}
                   onOpenForm={(id) => { const s = schedules.find(x => x.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                   onTaskOffsetUpdate={handleTaskOffsetUpdate}
                   onScheduleUpdate={async (id, data, logDetails) => {
                     const s = schedules.find(x => x.id === id);
                     setSchedules(prev => prev.map(sc => sc.id === id ? { ...sc, ...data } : sc));
                     await updateDoc(doc(db, 'franchise_schedules', id), data);
                     await logActivity('일정 변경', logDetails || `[${s?.storeName || '매장'}] 캘린더에서 일정 드래그 이동`, { storeName: s?.storeName });
                   }}
                />
                {monthsView === 2 && (
                  <ScheduleCalendar
                     schedules={filteredSchedules}
                     currentMonth={new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)}
                     teams={teams}
                     workItems={(processSettings.masterItems || []).filter(i => !i.isArchived)}
                     phaseVisibility={processSettings.phaseVisibility}
                     selectedDeptFilter={selectedDeptFilter}
                     onEditStore={(id, workItemId) => { setChecklistSelectedStoreId(id); setChecklistScrollToItemId(workItemId); setViewTab('store'); }}
                     onOpenForm={(id) => { const s = schedules.find(x => x.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                     onTaskOffsetUpdate={handleTaskOffsetUpdate}
                     onScheduleUpdate={async (id, data, logDetails) => {
                       setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
                       await updateDoc(doc(db, 'franchise_schedules', id), data);
                       const s = schedules.find(x => x.id === id);
                       await logActivity('일정 변경', logDetails || `[${s?.storeName || '매장'}] 캘린더에서 일정 드래그 이동`);
                     }}
                  />
                )}
              </div>
            
              <div>
                 <div className="flex items-center justify-between mb-4 border-b-2 border-stone-800 dark:border-stone-400 pb-2">
                   <h3 className="font-black text-lg text-stone-900 dark:text-stone-200 tracking-tight">
                     {showArchived ? '보관된 오픈 완료 매장' : '진행중인 매장 목록'} ({filteredSchedules.length}건)
                   </h3>
                   <button onClick={() => setShowArchived(!showArchived)} className="text-xs px-3 py-1.5 rounded-sm border border-stone-400 font-bold hover:bg-stone-200 transition-colors">
                     {showArchived ? '진행중인 매장 보기' : '오픈완료 보관함'}
                   </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredSchedules.length === 0 ? (
                      <div className="col-span-full py-10 text-center font-bold text-stone-400 bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800">해당하는 매장이 없습니다.</div>
                    ) : (
                      filteredSchedules.map(sch => (
                        <div key={sch.id} className={`bg-[#FDFBF7] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-sm p-6 shadow-none hover:border-stone-800 transition-all flex flex-col ${sch.archived ? 'opacity-60' : ''}`}>
                          {/* Header: Actions & Visibility */}
                          <div className="flex justify-between items-start mb-4 border-b border-stone-300 dark:border-stone-700 pb-3">
                            <button onClick={() => { setChecklistSelectedStoreId(sch.id); setViewTab('store'); }} className="text-left group flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 bg-${sch.colorCode || 'slate'}-500 shadow-sm`} />
                                <span className="font-black text-xl tracking-tight text-stone-900 dark:text-white group-hover:text-stone-600 transition-colors truncate">{sch.storeName}</span>
                                <span className="text-[10px] font-bold text-stone-500 border border-stone-300 dark:border-stone-700 px-1.5 py-0.5 rounded-sm shrink-0">{sch.storeNumber || '호수 미정'}</span>
                                {Object.values((sch as any).checklistData || {}).some((item: any) => item.note8 === '미입금') && (
                                  <span className="text-[10px] font-bold text-rose-600 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded-sm shrink-0 shadow-sm">미입금</span>
                                )}
                              </div>
                              <div className="text-xs text-stone-500 font-bold ml-5 tracking-widest flex items-center gap-3">
                                <span>{sch.team || '팀 미정'}</span>
                                {sch.finalDrawingPdfUrl && (
                                  <a href={sch.finalDrawingPdfUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 transition-colors hover:bg-blue-100">
                                    <FileText size={10} /> 도면 보기
                                  </a>
                                )}
                              </div>
                            </button>
                            {!isReadOnly && (
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                               <button
                                 onClick={() => { updateDoc(doc(db, 'franchise_schedules', sch.id), { showInCalendar: sch.showInCalendar === false }); }}
                                 className={`p-1.5 rounded-sm transition-colors border ${sch.showInCalendar !== false ? 'text-blue-800 border-blue-200 bg-blue-50 hover:bg-blue-100' : 'text-stone-400 border-stone-200 hover:bg-stone-100'}`}
                                 title={sch.showInCalendar !== false ? '달력 노출 중' : '달력 숨김'}
                               >
                                  {sch.showInCalendar !== false ? <Eye size={15} /> : <EyeOff size={15} />}
                               </button>
                               {!sch.archived && (
                                 <button
                                   onClick={() => handleArchive(sch.id)}
                                   className="p-1.5 text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-sm transition-colors"
                                   title="오픈 완료 보관"
                                 >
                                   <CheckCheck size={15} />
                                 </button>
                               )}
                               <button onClick={() => handleDeleteSchedule(sch.id)} className="p-1.5 text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-sm transition-colors" title="삭제">
                                 <X size={15} />
                               </button>
                            </div>
                            )}
                          </div>
                          
                          {/* Info Grid — schedule_date masterItems 기반 동적 렌더링 */}
                          {(() => {
                            const schedAny = sch as unknown as Record<string, string>;
                            const dateItems = (processSettings.masterItems || [])
                              .filter(i => i.category === 'schedule_date' && !i.isArchived && i.scheduleField)
                              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                            const openItem = dateItems.find(i => i.scheduleField === 'openDate');
                            const nonOpenItems = dateItems.filter(i => i.scheduleField !== 'openDate');
                            return (
                              <div className="mt-auto bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 p-4 space-y-3 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 tracking-widest">가스 구분</span>
                                  <span className="font-bold text-stone-800 dark:text-stone-300">{sch.gasType || '-'}</span>
                                </div>
                                {/* 공사 기간 — 시스템 항목 고정 */}
                                <div className="flex justify-between items-start">
                                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mt-0.5 tracking-widest">공사 기간</span>
                                  <div className="text-right font-bold text-stone-700 dark:text-stone-400">
                                    <div>S: {sch.constructionStart || '-'}</div>
                                    <div>E: {sch.constructionEnd || '-'}</div>
                                  </div>
                                </div>
                                {/* 나머지 schedule_date 항목 동적 렌더 */}
                                {nonOpenItems.map(item => {
                                  const val = schedAny[item.scheduleField!];
                                  const endField = item.scheduleField!.replace('Start', 'End').replace('In', 'End');
                                  const endVal = schedAny[endField];
                                  if (!val && !endVal) return null;
                                  return (
                                    <div key={item.id} className="flex justify-between items-center">
                                      <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 tracking-widest">{item.text}</span>
                                      <span className="font-bold text-stone-700 dark:text-stone-400 text-right">
                                        {val || '-'}{endVal && endVal !== val ? ` ~ ${endVal}` : ''}
                                      </span>
                                    </div>
                                  );
                                })}
                                {/* 오픈일 — 시각적으로 강조 */}
                                {openItem && (
                                  <div className="flex justify-between items-center border-t border-stone-300 dark:border-stone-700 pt-3 mt-3">
                                    <span className="text-[11px] text-stone-500 dark:text-stone-400 font-bold tracking-widest">{openItem.text}</span>
                                    <span className="text-base font-black text-rose-700 tracking-tighter">{schedAny[openItem.scheduleField!] || '-'}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* showOnCard 항목: 이름 + 날짜/일정 + 상태 */}
                          {(() => {
                            const cardItems = (processSettings.masterItems || [])
                              .filter(i => i.showOnCard && !i.isArchived)
                              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                            if (cardItems.length === 0) return null;
                            const allWorkItems = (processSettings.masterItems || []).filter(i => !i.isArchived);
                            const computed = computeWorkItemDates(allWorkItems, sch);
                            const schedAny2 = sch as unknown as Record<string, string>;
                            const STATUS_LABELS = ['미진행', '안내완료', '진행중', '완료'];
                            const STATUS_CLS = [
                              'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                            ];
                            return (
                              <div className="mt-2 bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 p-3 space-y-2">
                                <p className="text-[10px] font-black text-stone-400 tracking-widest">체크리스트 / 태스크</p>
                                {cardItems.map(item => {
                                  const status = (sch.checklistData as any)?.[item.id]?.status ?? 0;
                                  const statusLabel = STATUS_LABELS[status] || '미진행';
                                  const statusCls = STATUS_CLS[status] || STATUS_CLS[0];

                                  // 날짜 계산: task → computeWorkItemDates, schedule_date → scheduleField 직접, checklist → fixedDate
                                  let dateStr = '';
                                  if (item.category === 'task') {
                                    const d = computed[item.id];
                                    if (d) dateStr = d.start === d.end ? d.start : `${d.start} ~ ${d.end}`;
                                  } else if (item.category === 'schedule_date' && item.scheduleField) {
                                    const start = schedAny2[item.scheduleField];
                                    const endField = item.scheduleField.replace('Start', 'End').replace('In', 'End');
                                    const end = schedAny2[endField];
                                    if (start) dateStr = (end && end !== start) ? `${start} ~ ${end}` : start;
                                  } else {
                                    const fixedDate = (sch.checklistData as any)?.[item.id]?.fixedDate;
                                    if (fixedDate) dateStr = fixedDate;
                                  }

                                  return (
                                    <div key={item.id} className="space-y-0.5">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-[11px] font-bold text-stone-700 dark:text-stone-300 truncate">{item.text}</span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${statusCls}`}>{statusLabel}</span>
                                      </div>
                                      {dateStr && (
                                        <div className="text-[10px] text-stone-400 font-bold">{dateStr}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      ))
                    )}
                 </div>
              </div>

{/* 간츠 차트 비활성화 */}
            </div>
          )}
        </>
      ) : (
        <OpenChecklistView
          schedules={schedules}
          currentUser={currentUser}
          processSettings={processSettings}
          initialSelectedStoreId={checklistSelectedStoreId}
          initialScrollToItemId={checklistScrollToItemId}
          onClearInitialStore={() => { setChecklistSelectedStoreId(null); setChecklistScrollToItemId(undefined); }}
          onNewStore={() => setShowStoreReg(true)}
          onUpdateProgress={handleUpdateProgress}
          onUpdateSchedule={async (id, data) => {
            setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
            await updateDoc(doc(db, 'franchise_schedules', id), data);
            await logActivity('체크리스트 업데이트', `오픈 체크리스트 상세 항목 및 일정 동기화`);
          }}
          onUpdateMasterList={async (list) => {
             setProcessSettings(prev => ({ ...prev, masterItems: list }));
             await updateDoc(doc(db, 'process_settings', brandId), { masterItems: list });
          }}
          onOpenForm={(id) => { const s = schedules.find(x => x.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
        />
      )}

        {showForm && (
          <ScheduleFormModal
            initial={editingData || {}}
            teams={teams}
            schedules={schedules}
            processSettings={processSettings}
            onSave={handleSaveSchedule}
            onUpdateSchedule={async (scheduleId, data) => {
              const { id: _id, ...updates } = { id: scheduleId, ...data };
              await updateDoc(doc(db, 'franchise_schedules', scheduleId), { ...updates, updatedAt: new Date().toISOString() });
              setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, ...updates } : s));
            }}
            onClose={() => { setShowForm(false); setEditingData(null); }}
          />
        )}

        {showTeamSettings && (
          <TeamSettingsModal brandId={brandId} onClose={() => setShowTeamSettings(false)} />
        )}

        {showStoreReg && (
          <ScheduleFormModal
            initial={{ brandId, storeNumber: `${nextStoreNumber}호`, showInCalendar: true, archived: false, checklistData: {} }}
            teams={teams}
            schedules={schedules}
            processSettings={processSettings}
            onSave={async (data) => {
              await handleSaveSchedule(data);
              setShowStoreReg(false);
            }}
            onClose={() => setShowStoreReg(false)}
          />
        )}

        {/* ✨ 신규: AI 대화형 일정 등록 모달 */}
        {showAiModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row h-[600px] overflow-hidden">
              {/* 왼쪽: 채팅 영역 */}
              <div className="flex-1 flex flex-col h-full min-w-0">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-500" />
                    AI 비서와 일정 관리하기
                  </h2>
                  <button onClick={() => setShowAiModal(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold shadow-sm">
                    <X size={14} /> 닫기
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-slate-950/50 scroll-smooth">
                  {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'bot' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                      {msg.role === 'bot' ? <Bot size={16} /> : <UserIcon size={16} />}
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'}`}>
                      {msg.text.split('\n').map((line, j) => <React.Fragment key={j}>{line}<br/></React.Fragment>)}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

                
                {/* 다이나믹 채팅 입력창 렌더링 */}
                {(() => {
                if (chatStep === 99) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => openAiChat()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm">처음으로 돌아가기</button>
                    <button onClick={() => setShowAiModal(false)} className="flex-1 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300 transition-colors shadow-sm">창 닫기</button>
                  </div>
                );
                if (chatStep === 0) return (
                  <div className="flex flex-wrap gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => submitChat('신규 일정 등록')} className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors shadow-sm">신규 일정 등록</button>
                    <button onClick={() => submitChat('기존 일정 변경')} className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors shadow-sm">기존 일정 변경</button>
                    <button onClick={() => submitChat('도면 검색')} className="flex-1 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl font-bold transition-colors shadow-sm">도면 검색</button>
                  </div>
                );
                if (chatStep === 1 && updateStoreNotFound) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || ''} onChange={e => { setChatInput(e.target.value); if(e.target.value) submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="">매장을 선택해 주세요</option>
                      {schedules.map(s => (
                        <option key={s.id} value={s.storeName}>{s.storeName} {s.archived ? '(오픈완료)' : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => submitChat(chatInput || '엔터 (패스)')} className="w-20 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300 transition-colors shadow-sm">패스</button>
                  </div>
                );
                if (chatStep === 20) return (
                  <div className="flex flex-wrap gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    {['공사', '화덕', '화구', '점주안내', '사전교육', '초도물품', '본사교육', '오픈일'].map(f => (
                      <button key={f} onClick={() => submitChat(f)} className="flex-1 min-w-[100px] py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors shadow-sm">{f} 일정</button>
                    ))}
                  </div>
                );
                if (chatStep === 21) return (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">{renderMiniCalendar()}</div>
                );
                if (chatStep === 22) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => submitChat('네')} className="flex-1 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl font-bold transition-colors shadow-sm">네, 변경합니다</button>
                    <button onClick={() => submitChat('아니오')} className="flex-1 py-3 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400 hover:bg-rose-100 rounded-xl font-bold transition-colors shadow-sm">아니오, 취소</button>
                  </div>
                );
                if (chatStep === 4) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => { setIsAutoCalc(true); submitChat('자동 계산 (공사일만 지정)'); }} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl font-bold transition-colors shadow-sm">자동 계산 <span className="text-[10px] font-medium text-emerald-600/70 dark:text-emerald-500/70">공사일만 선택 시 완료</span></button>
                    <button onClick={() => { setIsAutoCalc(false); submitChat('수동 상세 입력 (모든 일정)'); }} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400 hover:bg-blue-100 rounded-xl font-bold transition-colors shadow-sm">수동 상세 입력 <span className="text-[10px] font-medium text-blue-600/70 dark:text-blue-500/70">모든 일정을 직접 선택</span></button>
                  </div>
                );
                if (chatStep === 2) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || `${nextStoreNumber}호`} onChange={e => { setChatInput(e.target.value); submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      {Array.from({length: 15}).map((_, i) => {
                        const val = nextStoreNumber - 5 + i;
                        if (val > 0) return <option key={val} value={`${val}호`}>{val}호</option>;
                        return null;
                      })}
                    </select>
                    <button onClick={() => submitChat(chatInput || `${nextStoreNumber}호`)} className="w-20 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm">선택</button>
                  </div>
                );
                if (chatStep === 3) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || '선택 안함'} onChange={e => { setChatInput(e.target.value); submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="선택 안함">선택 안함</option>
                      {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <button onClick={() => submitChat(chatInput || '선택 안함')} className="w-20 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm">선택</button>
                  </div>
                );
                if (chatStep === 6) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => submitChat('네')} className="flex-1 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl font-bold transition-colors shadow-sm">네, 준비되었습니다</button>
                    <button onClick={() => submitChat('아니오')} className="flex-1 py-3 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-xl font-bold transition-colors shadow-sm">아니오, 나중에 할게요</button>
                  </div>
                );
                if (chatStep === 7) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || ''} onChange={e => { setChatInput(e.target.value); if(e.target.value) submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="">공사업체 선택 (또는 패스)</option>
                      {sysConfig.constTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => submitChat(chatInput || '엔터 (패스)')} className="w-20 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300 transition-colors shadow-sm">패스</button>
                  </div>
                );
                if (chatStep === 8) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || ''} onChange={e => { setChatInput(e.target.value); if(e.target.value) submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="">간판업체 선택 (또는 패스)</option>
                      {sysConfig.signTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => submitChat(chatInput || '엔터 (패스)')} className="w-20 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300 transition-colors shadow-sm">패스</button>
                  </div>
                );
              if (chatStep === 10) return (
                <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                  <select value={chatInput || ''} onChange={e => { setChatInput(e.target.value); if(e.target.value) submitChat(e.target.value); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                    <option value="">가스 종류 선택 (또는 패스)</option>
                    {sysConfig.gasTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => submitChat(chatInput || '엔터 (패스)')} className="w-20 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300 transition-colors shadow-sm">패스</button>
                </div>
              );
              if ([5, 9, 11, 12, 13, 15, 16, 17].includes(chatStep) && !pendingAiData && !isAiProcessing) return (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">{renderMiniCalendar()}</div>
                );
                return (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <form onSubmit={handleSendChatForm} className="flex gap-2 relative">
                      <input
                        type="text" autoFocus value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); if (pendingAiData) { setPendingAiData(null); setChatMessages(prev => [...prev, { role: 'bot', text: '⚠️ 확정이 취소되었습니다. 추가로 수정할 내용을 입력하시거나 창을 닫아주세요.' }]); } else { setShowAiModal(false); } } }}
                        placeholder={isAiProcessing ? "AI가 분석 중입니다..." : pendingAiData ? "엔터(확인) 또는 ESC(취소)를 눌러주세요" : "답변을 입력해주세요..."}
                        disabled={isAiProcessing} className="flex-1 pl-4 pr-12 py-3 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-700 rounded-xl outline-none text-sm text-slate-900 dark:text-white transition-colors"
                      />
                      <button type="submit" disabled={isAiProcessing} className="absolute right-1.5 top-1.5 bottom-1.5 w-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors shadow-sm">
                        <Send size={16} className={isAiProcessing ? "animate-bounce" : ""} />
                      </button>
                    </form>
                  </div>
                );
                })()}
              </div>

              {/* 오른쪽: 라이브 프리뷰 */}
              {renderLivePreview()}
            </div>
          </div>
        )}
    </div>
  );
}
