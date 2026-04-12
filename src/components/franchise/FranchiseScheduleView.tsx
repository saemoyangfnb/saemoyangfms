import React, { useState, useEffect, useMemo, useRef } from 'react';
import { salesDb as db, db as mainDb, auth } from '../../firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { FranchiseSchedule, TeamSetting, BrandId } from '../../types';
import { Plus, Search, Settings, CheckCircle2, Eye, EyeOff, X, Layers, CheckCheck, Sparkles, Bot, Send, User as UserIcon, CalendarDays } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import { GoogleGenAI } from '@google/genai';

// Subcomponents
import { ScheduleTimeline } from './ScheduleTimeline';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';
import { TeamSettingsModal } from './TeamSettingsModal';
import {
  ProcessMasterModal,
  ProcessSettings,
  DEFAULT_PROCESS_SETTINGS,
  BUILTIN_PROGRESS,
} from './ProcessMasterModal';

interface Props {
  brandId: BrandId;
}

export function FranchiseScheduleView({ brandId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();

  // Data states
  const [schedules, setSchedules] = useState<FranchiseSchedule[]>([]);
  const [teams, setTeams] = useState<TeamSetting[]>([]);
  const [loading, setLoading] = useState(true);

  // View states
  const [showArchived, setShowArchived] = useState(false);
  const [monthsView, setMonthsView] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingData, setEditingData] = useState<Partial<FranchiseSchedule> | null>(null);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showProcessMaster, setShowProcessMaster] = useState(false);
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
  const [chatMode, setChatMode] = useState<'CREATE' | 'UPDATE' | null>(null);
  const [draftData, setDraftData] = useState<Partial<FranchiseSchedule>>({});
  const [updateStoreNotFound, setUpdateStoreNotFound] = useState(false);
  const [updateField, setUpdateField] = useState('');
  const [updateDates, setUpdateDates] = useState<{start: string, end: string|null} | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 💡 미니 달력 선택기 상태
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState(new Date());

  // 💡 시스템 활동 로그 기록 센서
  const logActivity = async (action: string, details: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(mainDb, 'activity_logs'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || '관리자',
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  useEffect(() => {
    if (showAiModal) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showAiModal]);

  useEffect(() => {
    fetchData();
  }, [brandId]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [schSnap, teamSnap, psSnap] = await Promise.all([
        getDocs(collection(db, 'franchise_schedules')),
        getDocs(collection(db, 'team_settings')),
        getDoc(doc(db, 'process_settings', brandId)),
      ]);
      if (psSnap.exists()) {
        const ps = psSnap.data() as ProcessSettings;
        setProcessSettings({ ...DEFAULT_PROCESS_SETTINGS, ...ps });
      }

      const schData: FranchiseSchedule[] = [];
      schSnap.forEach(d => {
        const item = d.data() as FranchiseSchedule;
        if (item.brandId === brandId) schData.push({ ...item, id: d.id });
      });
      setSchedules(schData);

      const teamData: TeamSetting[] = [];
      teamSnap.forEach(d => {
        const item = d.data() as TeamSetting;
        if (item.brandId === brandId) teamData.push({ ...item, id: d.id });
      });
      setTeams(teamData);

    } catch (err) {
      toast.error('일정 데이터를 불러오지 못했습니다.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSaveSchedule = async (data: Partial<FranchiseSchedule>) => {
    try {
      if (data.id) {
        const { id, ...updates } = data;
        await updateDoc(doc(db, 'franchise_schedules', id), {
          ...updates,
          updatedAt: new Date().toISOString()
        });
        toast.success('일정이 수정되었습니다.');
        await logActivity('일정 수정', `[${updates.storeName || '매장'}] 오픈 일정 변경`);
      } else {
        await addDoc(collection(db, 'franchise_schedules'), {
          ...data,
          brandId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        toast.success('새 일정이 등록되었습니다.');
        await logActivity('일정 등록', `[${data.storeName || '매장'}] 신규 오픈 일정 등록`);
      }
      setShowForm(false);
      setEditingData(null);
      fetchData();
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
      fetchData();
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handleToggleProgress = async (id: string, key: keyof FranchiseSchedule['progressCheck'], currentVal: boolean) => {
    try {
      const schedule = schedules.find(s => s.id === id);
      if (!schedule) return;
      const newProgress = {
        ...(schedule.progressCheck || { ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false }),
        [key]: !currentVal
      };
      setSchedules(prev => prev.map(x => x.id === id ? { ...x, progressCheck: newProgress } : x));
      await updateDoc(doc(db, 'franchise_schedules', id), { progressCheck: newProgress });
      await logActivity('진행 체크', `[${schedule.storeName}] 진행 항목 체크 상태 변경`);
      fetchData(true);
    } catch(e) { console.error(e); }
  };

  const handleArchive = async (id: string) => {
    const ok = await confirm({ title: '오픈 완료 및 보관', message: '오픈 완료 상태로 보관하시겠습니까?', confirmLabel: '보관하기', variant: 'danger' });
    if (!ok) return;
    try {
      const s = schedules.find(x => x.id === id);
      await updateDoc(doc(db, 'franchise_schedules', id), { archived: true });
      await logActivity('일정 보관', `[${s?.storeName || '매장'}] 오픈 완료 및 보관함 이동`);
      fetchData();
      toast.success('매장이 보관되었습니다.');
    } catch(e) { console.error(e); }
  };

  // 💡 신규: 최근 등록된 가장 높은 호수 3개 자동 추출
  const top3Stores = useMemo(() => {
    const nums = schedules
      .map(s => parseInt((s.storeNumber || '').replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a);
    return [...new Set(nums)].slice(0, 3).map(n => `${n}호`).join(', ');
  }, [schedules]);

  // 💡 신규: 다음 호수 자동 추출 (에러 해결)
  const nextStoreNumber = useMemo(() => {
    const nums = schedules
      .map(s => parseInt((s.storeNumber || '').replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n));
    if (nums.length === 0) return 1;
    return Math.max(...nums) + 1;
  }, [schedules]);

  const CHAT_QUESTIONS = useMemo(() => {
    return [
      "안녕하세요! ✨ 일정을 관리해 드릴게요.\n아래 중 원하시는 작업의 번호를 입력해 주세요.\n\n1. 신규 일정 등록\n2. 기존 일정 변경",
      "어느 매장인가요? (※ 필수 입력. 예: 광주 첨단점)",
      `몇 호점인가요? (예: 150호. 모르면 엔터)\n\n💡 참고: 최근 등록된 최고 호수 👉 ${top3Stores || '없음'}`,
      "담당할 팀과 SV(슈퍼바이저)는 누구인가요? (모르면 엔터)",
      "공사 업체는 어디인가요? (더원, 감리, 직접입력 중 선택. 모르면 엔터)",
      "공사 시작일과 종료일은 언제인가요? (※ 0410 형식으로 입력. 예: 1005부터 1020까지. 모르면 엔터)",
      "화덕 입고일과 화구류 입고일은 언제인가요? (※ 0410 형식. 모르면 엔터)",
      "사전교육 일정을 아래 달력에서 선택해 주세요. (첫 번째 클릭: 시작일, 두 번째 클릭: 종료일. 진행하지 않으면 '진행 안함' 클릭)",
      "사전교육 장소와 참여 인원은 어떻게 되나요? (예: 남원 3명. 모르면 엔터)",
      "본사교육 일정을 아래 달력에서 선택해 주세요. (첫 번째 클릭: 시작일, 두 번째 클릭: 종료일. 진행하지 않으면 '진행 안함' 클릭)",
      "초도물품 입고일과 그랜드 오픈일은 언제인가요? (※ 0410 형식. 모르면 엔터)",
      "마지막으로 점주 안내 시작일, 간판/가스 종류, 기타 메모가 있나요? (없으면 엔터 치시면 완료됩니다!)"
    ];
  }, [top3Stores]);

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

  // 💡 미니 캘린더 렌더러
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

    // 💡 [핵심] 라이브 프리뷰 업데이트 (Draft Data)
    let currentMode = chatMode;
    if (chatStep === 0) {
      currentMode = rawInput.includes('신규') || rawInput.includes('1') ? 'CREATE' : 'UPDATE';
      setChatMode(currentMode);
    }
    
    let validationError = '';
    let newDraft = { ...draftData } as Partial<FranchiseSchedule>;
    if (chatStep === 1) {
      if (currentMode === 'UPDATE') {
        const existing = schedules.find(s => s.storeName.includes(rawInput) || rawInput.includes(s.storeName));
        if (existing) {
          newDraft = { ...existing };
          setUpdateStoreNotFound(false);
        } else {
          validationError = "⚠️ 해당 매장명을 찾을 수 없습니다. 아래 진행 중인 매장 목록에서 선택해 주세요.";
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
    const applyDraft = (k1: keyof FranchiseSchedule, v1: string, k2: keyof FranchiseSchedule, v2: string) => {
      if (v1 && !v1.includes('월요일') && !v1.includes('내일')) { newDraft[k1] = v1 as any; newDraft[k2] = v2 as any; }
    };
    
    if (chatStep === 5) { const d = parseDates(rawInput); if (d) applyDraft('constructionStart', d.start, 'constructionEnd', d.end); }
    if (chatStep === 6) { const d = parseDates(rawInput); if (d) applyDraft('ovenIn', d.start, 'equipmentIn', d.end); }
    if (chatStep === 7) { const d = parseDates(rawInput); if (d) applyDraft('preTrainingStart', d.start, 'preTrainingEnd', d.end); }
    if (chatStep === 9) { const d = parseDates(rawInput); if (d) applyDraft('trainingStart', d.start, 'trainingEnd', d.end); }
    if (chatStep === 10) { const d = parseDates(rawInput); if (d) applyDraft('initialStockIn', d.start, 'openDate', d.end); }
    
    setDraftData(newDraft);

    if (validationError) {
      setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: validationError }]), 300);
      return; // ❌ 에러가 있으면 다음 단계로 안 넘어감!
    }

    // 💡 [핵심] UPDATE(변경) 모드 전용 채팅 플로우
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
         else if (updateField === '화덕/화구') oldStr = `화덕: ${newDraft.ovenIn||'-'}, 화구: ${newDraft.equipmentIn||'-'}`;
         else if (updateField === '사전교육') oldStr = `${newDraft.preTrainingStart||'-'} ~ ${newDraft.preTrainingEnd||'-'}`;
         else if (updateField === '본사교육') oldStr = `${newDraft.trainingStart||'-'} ~ ${newDraft.trainingEnd||'-'}`;
         else if (updateField === '초도/오픈') oldStr = `초도: ${newDraft.initialStockIn||'-'}, 오픈: ${newDraft.openDate||'-'}`;

         let newStr = (updateField === '화덕/화구' || updateField === '초도/오픈') ? `${d.start} / ${d.end}` : (d.start === d.end ? d.start : `${d.start} ~ ${d.end}`);
         setTimeout(() => setChatMessages(prev => [...prev, { role: 'bot', text: `[${newDraft.storeName}] ${updateField} 일정을 아래와 같이 변경할까요?\n\n기존: ${oldStr}\n변경: ${newStr}` }]), 300);
         return;
      }
      if (chatStep === 22) {
         if (rawInput === '네') {
             const d = updateDates;
             if (d) {
               if (updateField === '공사') { newDraft.constructionStart = d.start; newDraft.constructionEnd = d.end || d.start; }
               else if (updateField === '화덕/화구') { newDraft.ovenIn = d.start; newDraft.equipmentIn = d.end || d.start; }
               else if (updateField === '사전교육') { newDraft.preTrainingStart = d.start; newDraft.preTrainingEnd = d.end || d.start; }
               else if (updateField === '본사교육') { newDraft.trainingStart = d.start; newDraft.trainingEnd = d.end || d.start; }
               else if (updateField === '초도/오픈') { newDraft.initialStockIn = d.start; newDraft.openDate = d.end || d.start; }
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
    // 💡 핵심 분기: 자동 계산 모드면 5번(공사일) 질문 이후 바로 12번(종료)으로 스킵!
    if (chatStep === 5 && isAutoCalc) {
      nextStep = 12;
    }

    if (nextStep < CHAT_QUESTIONS.length) {
      setChatStep(nextStep);
      if (nextStep === 2) setChatInput(`${nextStoreNumber}호`);
      if (nextStep === 3) setChatInput('선택 안함');
      
      setTimeout(() => {
        setChatMessages(prev => [...prev, { role: 'bot', text: CHAT_QUESTIONS[nextStep] }]);
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
      const ai = new GoogleGenAI({ apiKey });
      const transcript = messages.map(m => `${m.role === 'bot' ? '질문' : '답변'}: ${m.text}`).join('\n');
      
      const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

      const prompt = `당신은 프랜차이즈 매장 오픈 일정을 관리하는 최고 수준의 엘리트 AI 비서입니다. 사용자와의 대화 내역을 분석해서 JSON 형식으로 데이터를 추출해 주세요.

[🔥 핵심 지침 🔥]
1. 첫 번째 답변을 분석하여 "CREATE" 또는 "UPDATE"로 'action' 값을 정확히 설정하세요.
2. 오늘 날짜는 ${todayStr} 입니다. 사용자가 '0410', '410' 등 3~4자리 숫자로 날짜를 입력하면 올해(또는 다가오는) 월/일로 간주하여 정확한 YYYY-MM-DD 형식으로 변환하세요. '내일', '다음주 월요일' 등도 동일하게 변환하세요.
3. 정보가 누락되었거나 '패스', '진행 안함'이라고 대답한 항목은 절대 억지로 지어내지 말고 반드시 빈 문자열("")로 비워두세요.
4. '화덕 입고일 / 화구류 입고일' 답변에 날짜가 2개(범위) 있으면, 앞 날짜가 화덕 입고일(ovenIn)이고 뒤 날짜가 화구류 입고일(equipmentIn)입니다.
5. '초도물품 입고일 / 그랜드 오픈일' 답변에 날짜가 2개 있으면, 앞 날짜가 초도물품 입고일(initialStockIn)이고 뒤 날짜가 그랜드 오픈일(openDate)입니다.
6. 마크다운 기호 없이 오직 순수 JSON 객체 1개만 반환하세요.

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
    "notes": "특이사항"
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
            const cleanUpdates = Object.fromEntries(Object.entries(parsed.data).filter(([_, v]) => v !== ""));
            finalData = { ...existing, ...cleanUpdates };
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

  // 💡 라이브 프리뷰 (미니 캘린더) 렌더러
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
              {chatMode === 'UPDATE' ? '변경' : '신규'}
            </span>
            <span className="font-bold text-slate-900 dark:text-white truncate">{draftData.storeName || '매장명 미정'}</span>
            <span className="text-xs font-semibold text-slate-500">{draftData.storeNumber || ''}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            <p>담당 팀: {draftData.team || '미정'} {draftData.supervisor ? `/ ${draftData.supervisor}` : ''}</p>
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
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div>
           <h1 className="text-xl font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
             오픈 일정 관리
             <span className="bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-widest">자동 계산</span>
           </h1>
           <p className="text-sm font-medium text-stone-500 mt-1.5">AI 대화 또는 수동 입력을 통해 일정을 상세 관리할 수 있습니다.</p>
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <button onClick={openAiChat} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 text-sm font-bold rounded-sm hover:bg-indigo-100 transition-colors shadow-sm">
               <Bot size={15} /> AI 일정 자동 작성
            </button>
            <button onClick={() => setShowProcessMaster(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-700 border border-stone-300 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm hover:bg-stone-100 transition-colors shadow-sm">
               <Layers size={15} /> 공정 마스터
            </button>
            <button onClick={() => setShowTeamSettings(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-stone-700 border border-stone-300 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm hover:bg-stone-100 transition-colors shadow-sm">
               <Settings size={15} /> 팀/권역 설정
            </button>
            <button onClick={() => { setEditingData({}); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white text-sm font-bold rounded-sm hover:bg-stone-800 transition-colors shadow-sm">
               <Plus size={15} /> 신규 일정 등록
            </button>
         </div>
       </div>

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
         </div>

         <div className="flex items-center gap-2">
            <select className="px-3 py-1.5 text-sm font-bold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm focus:outline-none focus:border-stone-800" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">전체 팀</option>
              {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
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
              <div className={`grid grid-cols-1 ${monthsView === 2 ? 'xl:grid-cols-2' : ''} gap-6 items-start`}>
                <ScheduleCalendar
                   schedules={filteredSchedules}
                   currentMonth={currentMonth}
                   teams={teams}
                   phaseVisibility={processSettings.phaseVisibility}
                   onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                   onScheduleUpdate={async (id, data, logDetails) => { 
                     setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
                     await updateDoc(doc(db, 'franchise_schedules', id), data); 
                     const s = schedules.find(x => x.id === id);
                     await logActivity('일정 변경', logDetails || `[${s?.storeName || '매장'}] 캘린더에서 일정 드래그 이동`);
                     fetchData(true); 
                   }}
                />
                {monthsView === 2 && (
                  <ScheduleCalendar
                     schedules={filteredSchedules}
                     currentMonth={new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)}
                     teams={teams}
                     phaseVisibility={processSettings.phaseVisibility}
                     onEditStore={(id) => { const s = schedules.find(item => item.id === id); if (s) { setEditingData(s); setShowForm(true); } }}
                     onScheduleUpdate={async (id, data, logDetails) => { 
                       setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
                       await updateDoc(doc(db, 'franchise_schedules', id), data); 
                       const s = schedules.find(x => x.id === id);
                       await logActivity('일정 변경', logDetails || `[${s?.storeName || '매장'}] 캘린더에서 일정 드래그 이동`);
                       fetchData(true); 
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
                            <button onClick={() => { setEditingData(sch); setShowForm(true); }} className="text-left group flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 bg-${sch.colorCode || 'slate'}-500 shadow-sm`} />
                                <span className="font-black text-xl tracking-tight text-stone-900 dark:text-white group-hover:text-stone-600 transition-colors truncate">{sch.storeName}</span>
                                <span className="text-[10px] font-bold text-stone-500 border border-stone-300 dark:border-stone-700 px-1.5 py-0.5 rounded-sm shrink-0">{sch.storeNumber || '호수 미정'}</span>
                              </div>
                              <div className="text-xs text-stone-500 font-bold ml-5 tracking-widest">{sch.team || '팀 미정'}</div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                               <button 
                                 onClick={() => { updateDoc(doc(db, 'franchise_schedules', sch.id), { showInCalendar: sch.showInCalendar === false }); fetchData(); }}
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
                          </div>
                          
                          {/* Progress Badges */}
                          <div className="mb-4">
                            <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mb-1.5 tracking-widest">진행 상황</p>
                            <div className="flex gap-1.5 flex-wrap">
                               {BUILTIN_PROGRESS.map(p => {
                                 const label = processSettings.progressLabels[p.id] ?? p.defaultLabel;
                                 const checked = sch.progressCheck?.[p.id as keyof FranchiseSchedule['progressCheck']] || false;
                                 return (
                                   <button
                                     key={p.id}
                                     onClick={() => handleToggleProgress(sch.id, p.id as any, checked)}
                                     className={`flex items-center gap-1 px-2 py-1 rounded-sm transition-colors border ${checked ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-400 dark:bg-stone-300 dark:text-stone-900' : 'border-stone-300 bg-white text-stone-400 hover:border-stone-400'}`}
                                     title={label}
                                   >
                                     <CheckCircle2 size={12} className={checked ? '' : 'opacity-30'} />
                                     <span className="text-[10px] font-bold">{label}</span>
                                   </button>
                                 );
                               })}
                               {processSettings.customItems.map(ci => {
                                 const checked = (sch as any).customProgressCheck?.[ci.id] || false;
                                 return (
                                   <button
                                     key={ci.id}
                                     onClick={async () => {
                                       setSchedules(prev => prev.map(x => x.id === sch.id ? { ...x, customProgressCheck: { ...(x as any).customProgressCheck, [ci.id]: !checked } } : x));
                                       await updateDoc(doc(db, 'franchise_schedules', sch.id), {
                                         [`customProgressCheck.${ci.id}`]: !checked,
                                       });
                                       await logActivity('진행 체크', `[${sch.storeName}] 커스텀 진행 항목 상태 변경`);
                                       fetchData(true);
                                     }}
                                     className={`flex items-center gap-1 px-2 py-1 rounded-sm transition-colors border ${checked ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-400 dark:bg-stone-300 dark:text-stone-900' : 'border-stone-300 bg-white text-stone-400 hover:border-stone-400'}`}
                                     title={ci.label}
                                   >
                                     <CheckCircle2 size={12} className={checked ? '' : 'opacity-30'} />
                                     <span className="text-[10px] font-bold">{ci.label}</span>
                                   </button>
                                 );
                               })}
                            </div>
                          </div>

                          {/* Info Grid */}
                          <div className="mt-auto bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 p-4 space-y-3 text-xs">
                             <div className="flex justify-between items-center">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 tracking-widest">가스 구분</span>
                               <span className="font-bold text-stone-800 dark:text-stone-300">{sch.gasType || '-'}</span>
                             </div>
                             <div className="flex justify-between items-start">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mt-0.5 tracking-widest">공사/입고</span>
                               <div className="text-right font-bold text-stone-700 dark:text-stone-400">
                                 <div>S: {sch.constructionStart || '-'} / E: {sch.constructionEnd || '-'}</div>
                                 <div className="mt-0.5">🔥: {sch.ovenIn || '-'} / 📦: {sch.initialStockIn || '-'}</div>
                               </div>
                             </div>
                             <div className="flex justify-between items-start">
                               <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mt-0.5 tracking-widest">사전/본 교육</span>
                               <div className="text-right">
                                 <div className="font-bold text-stone-800 dark:text-stone-300">{sch.preTrainingStart || '-'} ({sch.preTrainingDays || 0}일)</div>
                                 <div className="text-[10px] text-stone-400 mb-0.5">📍 {sch.preTrainingLocation || '-'}</div>
                                 <div className="font-bold text-stone-700 dark:text-stone-400">본: {sch.trainingStart || '-'} ~ {sch.trainingEnd || '-'}</div>
                               </div>
                             </div>
                             <div className="flex justify-between items-center border-t border-stone-300 dark:border-stone-700 pt-3 mt-3">
                               <span className="text-[11px] text-stone-500 dark:text-stone-400 font-bold tracking-widest">오픈일</span>
                               <span className="text-base font-black text-rose-700 tracking-tighter">{sch.openDate || '-'}</span>
                             </div>
                          </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>

              {!showArchived && (
                <div className="pb-10">
                   <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3">공정 타임라인 (Gantt)</h3>
                   <ScheduleTimeline schedules={filteredSchedules} viewStartDate={timelineDates.start} viewEndDate={timelineDates.end} />
                </div>
              )}
           </div>
        )}

        {showForm && (
          <ScheduleFormModal initial={editingData || {}} teams={teams} schedules={schedules} processSettings={processSettings} onSave={handleSaveSchedule} onClose={() => { setShowForm(false); setEditingData(null); }} />
        )}

        {showTeamSettings && (
          <TeamSettingsModal brandId={brandId} onClose={() => setShowTeamSettings(false)} />
        )}

        {showProcessMaster && (
          <ProcessMasterModal
            brandId={brandId}
            onClose={() => setShowProcessMaster(false)}
            onSaved={(settings) => setProcessSettings(settings)}
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
                  <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden">
                    <X size={18} />
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
                if (chatStep === 0) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <button onClick={() => submitChat('신규 일정 등록')} className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors shadow-sm">신규 일정 등록</button>
                    <button onClick={() => submitChat('기존 일정 변경')} className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors shadow-sm">기존 일정 변경</button>
                  </div>
                );
                if (chatStep === 1 && updateStoreNotFound) return (
                  <div className="flex gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <select value={chatInput || ''} onChange={e => setChatInput(e.target.value)} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="">진행 중인 매장을 선택해 주세요</option>
                      {schedules.filter(s => !s.archived).map(s => (
                        <option key={s.id} value={s.storeName}>{s.storeName}</option>
                      ))}
                    </select>
                    <button disabled={!chatInput} onClick={() => submitChat(chatInput)} className="w-20 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">선택</button>
                  </div>
                );
                if (chatStep === 20) return (
                  <div className="flex flex-wrap gap-2 w-full p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    {['공사', '화덕/화구', '사전교육', '본사교육', '초도/오픈'].map(f => (
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
                    <select value={chatInput || `${nextStoreNumber}호`} onChange={e => setChatInput(e.target.value)} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
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
                    <select value={chatInput || '선택 안함'} onChange={e => setChatInput(e.target.value)} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option value="선택 안함">선택 안함</option>
                      {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <button onClick={() => submitChat(chatInput || '선택 안함')} className="w-20 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm">선택</button>
                  </div>
                );
                if ([5, 6, 7, 9, 10].includes(chatStep) && !pendingAiData && !isAiProcessing) return (
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
              <button onClick={() => setShowAiModal(false)} className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hidden md:block">
                <X size={18} />
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
