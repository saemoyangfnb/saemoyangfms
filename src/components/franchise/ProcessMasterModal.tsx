import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { salesDb } from '../../firebase';
import { BrandId, WorkItem, WorkItemCategory, WorkItemInputType } from '../../types';
import { useToast } from '../Toast';
import { X, Plus, Trash2, Eye, EyeOff, Edit2 } from 'lucide-react';

// 캘린더에 표시되는 공정 목록 (스케줄 필드에 매핑)
export const CALENDAR_PHASES: { id: string; label: string }[] = [
  { id: 'constructionStart', label: '공사 시작일' },
  { id: 'constructionEnd', label: '공사 종료일' },
  { id: 'oven', label: '화덕 설치' },
  { id: 'burner', label: '화구 설치' },
  { id: 'equipment', label: '장비 입고' },
  { id: 'guide', label: '점주 안내' },
  { id: 'preTraining', label: '사전 교육' },
  { id: 'training', label: '본사 교육' },
  { id: 'initialStock', label: '초도 입고' },
  { id: 'open', label: '오픈일' },
];

export const DEFAULT_PHASE_VISIBILITY: Record<string, boolean> = {
  constructionStart: true,
  constructionEnd: true,
  oven: true,
  burner: true,
  equipment: true,
  guide: false,
  preTraining: true,
  training: true,
  initialStock: true,
  open: true,
};

// 💡 부서 색상 팔레트 (겹치지 않도록)
export const DEPARTMENT_COLOR_PALETTE = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
  'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-500',
  'bg-sky-500', 'bg-violet-500', 'bg-yellow-500', 'bg-red-500', 'bg-stone-500',
];

// 기본 진행 체크 항목 (progressCheck 필드 매핑)
export const BUILTIN_PROGRESS: any[] = []; // 호환성을 위해 빈 배열로 남김

export interface ChecklistMasterItem {
  id: string;
  text: string;
  type: string;
  departmentId?: string;
}

export const DEFAULT_MASTER_CHECKLIST: ChecklistMasterItem[] = [
  { id: 'item_1', text: '영업신고/사업자등록증 발급', type: 'file' },
  { id: 'item_2', text: '유선 전화번호 발급', type: 'phone' },
  { id: 'item_3', text: '하이오더 설치', type: 'hiorder' },
  { id: 'item_4', text: '애니워터 설치', type: 'normal' },
  { id: 'item_5', text: '대기실 정수기 설치', type: 'normal' },
  { id: 'item_6', text: '커피머신 설치', type: 'normal' },
  { id: 'item_7', text: '테이블링 설치', type: 'date' },
  { id: 'item_8', text: '쇼케이스 섭외', type: 'showcase' },
  { id: 'item_9', text: '세스코 설치', type: 'normal' },
  { id: 'item_10', text: '음식물 처리', type: 'food_waste' },
  { id: 'item_11', text: '지역화폐신청', type: 'normal' },
  { id: 'item_12', text: '야채 발주', type: 'file_date' },
  { id: 'item_13', text: '인원 구인', type: 'staffing' },
  { id: 'item_14', text: '네이버플레이스 권한 인수', type: 'password' },
  { id: 'item_15', text: '세금계산서 발행용 이메일', type: 'email' },
  { id: 'item_16', text: '사전교육 및 일정 조율', type: 'training_payment' },
  { id: 'item_17', text: 'FC다움 가입', type: 'normal' },
  { id: 'item_18', text: '최종 도면 업로드 (PDF)', type: 'file' },
  { id: 'item_19', text: '화덕 발주', type: 'date' },
  { id: 'item_20', text: '대소기물 발주', type: 'date' },
  { id: 'item_21', text: '인터넷 발주', type: 'date' },
  { id: 'item_22', text: '초도 물품 발주', type: 'date' },
  { id: 'item_23', text: '1차 오픈 현수막', type: 'date' },
  { id: 'item_25', text: '2차 오픈 현수막', type: 'date' },
  { id: 'item_24', text: '점주 최종 안내', type: 'date' },
];

export interface ProcessSettings {
  phaseVisibility: Record<string, boolean>;
  progressLabels: Record<string, string>;
  customItems: { id: string; label: string }[];
  masterChecklist?: ChecklistMasterItem[];
  masterItems?: WorkItem[];
  masterItemsMigrated?: boolean;
}

export const DEFAULT_PROCESS_SETTINGS: ProcessSettings = {
  phaseVisibility: DEFAULT_PHASE_VISIBILITY,
  progressLabels: {},
  customItems: [],
  masterChecklist: DEFAULT_MASTER_CHECKLIST,
};
