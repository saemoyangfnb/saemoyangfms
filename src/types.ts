export type Region = '지방권' | '광역권' | '수도권';

// ==========================================
// 앱 네비게이션 타입
// ==========================================

export enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete',
  LIST = 'list', GET = 'get', WRITE = 'write',
}

export type CostTabType = Region | '전체보기' | '메뉴 관리' | '변동사항';
export type SidebarSection =
  | 'home'
  // 개인 업무공간
  | 'my'
  // 새모양에프엔비
  | 'mvc' | 'brand_history' | 'company_profile'
  // 운영
  | 'okr' | 'projects'
  | 'daily' | 'calendar' | 'notice' | 'meetings' | 'reports' | 'employees' | 'sop'
  // 브랜드별
  | 'cost' | 'sales' | 'review' | 'franchise' | 'stores' | 'storeforms' | 'marketing'
  // 관리자 도구
  | 'database' | 'history' | 'admin'
  // (레거시, UI에 미노출)
  | 'agents';

export interface SidebarState {
  brandId: BrandId | null;
  section: SidebarSection;
  costTab: CostTabType;
  reviewTab?: string;
}

// 가맹점 관제 데이터가 있는 브랜드 (크롤러 연동 완료)
export const REVIEW_ENABLED_BRANDS = ['dalbitgo'];
export type Unit = 'kg' | 'g' | 'ea' | '미' | '수';
export type BrandId = string;

export interface Brand {
  id: BrandId;
  name: string;
  order: number;
  isActive: boolean;
  createdAt: string;
}

export const DEFAULT_BRANDS: Brand[] = [
  { id: 'dalbitgo', name: '달빛에구운고등어', order: 0, isActive: true, createdAt: new Date().toISOString() },
  { id: 'mansoo', name: '만수식당', order: 1, isActive: true, createdAt: new Date().toISOString() },
  { id: 'yams', name: '얌스', order: 2, isActive: true, createdAt: new Date().toISOString() },
  { id: 'bom', name: '봄초밥여름소바', order: 3, isActive: true, createdAt: new Date().toISOString() },
  { id: 'noeul', name: '노을에구운짚불쭈꾸미', order: 4, isActive: true, createdAt: new Date().toISOString() },
];

export type SectionPermission = 'edit' | 'view' | 'none';

// 섹션 키 목록 (사이드바와 동일)
export const PERMISSION_SECTIONS = [
  'home', 'my',
  'mvc', 'brand_history', 'company_profile',
  'okr', 'projects',
  'daily', 'calendar', 'notice', 'meetings', 'reports', 'employees', 'sop',
  'cost', 'sales', 'franchise', 'stores', 'storeforms', 'marketing', 'review',
  'database', 'history', 'admin',
] as const;
export type PermissionSection = typeof PERMISSION_SECTIONS[number];

export const SECTION_LABELS: Record<PermissionSection, string> = {
  home: '홈',
  my: '내 업무공간',
  mvc: 'MVC',
  brand_history: '브랜드 연혁',
  company_profile: '회사 소개서',
  okr: 'OKR & KPI',
  projects: '프로젝트',
  daily: '업무 보고',
  calendar: '캘린더',
  notice: '공지사항',
  meetings: '회의록',
  reports: '결재보고센터',
  employees: '팀/부서',
  sop: '업무규정',
  cost: '원가 계산',
  sales: '매출 현황',
  franchise: '가맹 일정',
  stores: '매장 관리',
  storeforms: '매장 폼 관리',
  marketing: '마케팅',
  review: '가맹점 관제',
  database: '식재료 데이터베이스',
  history: '변경 이력',
  admin: '관리자 패널',
};

export interface User {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isApproved: boolean;
  isActive: boolean;
  theme?: 'light' | 'dark';
  createdAt: string;
  alertThresholdType?: 'percentage' | 'absolute';
  alertThresholdValue?: number;
  menuOrder?: string[];
  departmentIds?: string[];
  departmentHeadOf?: string[];                              // 부서장인 부서 ID 목록
  sectionPermissions?: Partial<Record<PermissionSection, SectionPermission>>; // 섹션별 권한
}

export type CostCalcMethod = 'purchase_divide' | 'sales_divide' | 'manual';

export interface Ingredient {
  id: string;
  brandId?: BrandId;
  name: string;
  spec: string;
  boxCost: number;
  boxQuantity: number;
  unitCost: number;
  salesPrice: number;
  unitSalesPrice: number;
  unit: Unit;
  costCalcMethod?: CostCalcMethod;
  isArchived?: boolean;
  isSelectedForMenu?: boolean;
  createdAt?: string;
}

export interface IngredientChange {
  id: string;
  brandId?: BrandId;
  ingredientId: string;
  name: string;
  spec: string;
  type: 'new' | 'deleted' | 'price_change' | 'bulk_update';
  prevPurchasePrice?: number;
  currPurchasePrice?: number;
  prevSalesPrice?: number;
  currSalesPrice?: number;
  timestamp: string;
}

export type RecipeItemType = 'ingredient' | 'menu' | 'custom';

export interface RecipeItem {
  type?: RecipeItemType;
  ingredientId?: string;
  menuId?: string;
  customName?: string;
  customCost?: number;
  customUnit?: string;
  quantity: number;
  yieldRate?: number;
}

export interface MenuCategory {
  id: string;
  brandId?: BrandId;
  name: string;
  order: number;
  isVisible: boolean;
}

export interface Menu {
  id: string;
  brandId?: BrandId;
  name: string;
  categoryId?: string;
  order?: number;
  isVisible?: boolean;
  prices: Record<Region, number>;
  recipe: RecipeItem[];
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  lastAcknowledgedCost?: number;
  hasAlert?: boolean;
}

export interface SalesRecord {
  id: string;
  brandId: BrandId;
  storeName: string;
  date: string;
  totalSales: number;
  netSales: number;
  receiptCount: number;
  receiptAvg: number;
  normalAmount: number;
  takeoutAmount: number;
  deliveryAmount: number;
  createdAt: string;
}

export interface MonthlySalesRecord {
  id: string;
  yearMonth: string; // 'YYYY-MM'
  city: string;      // '도시'
  district: string;  // '시군'
  storeName: string; // '매장_요약'
  totalSales: number;// '총매출'
  createdAt: string;
}

export interface DailySalesRecord {
  id: string;
  date: string;       // 'YYYY-MM-DD'
  storeName: string;  // '매장_요약'
  totalSales: number; // '총매출'
  createdAt: string;
}

export interface MarketingSchedule {
  id: string;
  brandId?: BrandId;
  storeName: string;
  naverText: string;
  instaText: string;
  daangnText: string;
  status: '대기중' | '발행완료' | '반려';
  createdAt: string;
}

// ==========================================
// 가맹점 일정 관리 (Franchise Schedules)
// ==========================================

export interface FileAttachment {
  url: string;
  name: string;
}

export interface ChecklistItemData {
  status: number;
  note1?: string;
  note2?: string;
  note3?: string;
  note4?: string;
  note5?: string;
  note6?: string;
  note7?: string;
  note8?: string;
  files?: FileAttachment[];
  fileUrl?: string;
}
export type ScheduleStatus = '계약완료' | '공사중' | '사전교육' | '인테리어완료' | '본교육' | '가오픈' | '오픈완료' | '보류';

export interface FranchiseSchedule {
  id: string;
  brandId: BrandId;     // 어느 브랜드인지
  storeNumber: string;  // 매장 호수 (예: 120호)
  storeName: string;    // 매장명
  team: string;         // 담당 팀
  supervisor: string;   // 슈퍼바이저 이름 (표시용, 하위 호환)
  supervisorId?: string; // Employee.id 참조 (연동 시 저장)
  storeId?: string;      // stores.id 참조 (수동 매핑 후)

  // 세부 사항
  constructionType: string; // 더원, 감리, 직접입력
  signageType: string;      // 동영, 직접
  kitchenSupplier: string;  // 형제, 신광, 주원
  gasType: string;          // 도시가스, LPG 등
  notes: string;            // 특이사항

  // 자동 계산 및 관리 필드
  colorCode?: string;       // 매장 고유 색상 코드
  showInCalendar?: boolean; // 달력 노출 여부
  softOpenDate?: string;    // 가오픈일
  ownerGuideStart: string;  // 점주 안내 시작
  equipmentIn: string;      // 화구류 입고일
  progressCheck: {
    drawingUpload: boolean;
    ovenOrder: boolean;
    ownerGuide: boolean;
    equipmentOrder: boolean;
    internetOrder: boolean;
    initialEntry: boolean;
  };

  // 일정 관련 (YYYY-MM-DD 형식 권장)
  constructionStart: string;
  constructionEnd: string;
  ovenIn: string;
  ovenEnd: string;
  burnerIn: string;
  initialStockIn: string;
  initialStockEnd: string;
  preTrainingStart: string;
  preTrainingEnd: string;
  preTrainingLocation?: string; // 사전교육 장소 (남원, 예당마을, 청주율량, 직접입력)
  preTrainingDays?: number;     // 사전교육 일수
  preTrainingParticipants?: number; // 참여 인원
  preTrainingMemo: string; // 사전교육 내용
  trainingStart: string;
  trainingEnd: string;
  openDate: string;
  
  teamMembersSnapshot?: TeamMember[]; // 등록/수정 당시의 팀원 목록 스냅샷

  finalDrawingPdfUrl?: string; // 💡 최종 도면 PDF 다운로드 URL (첫 번째 도면 URL, 하위 호환)
  finalDrawingPdfs?: FileAttachment[]; // 💡 다중 도면 파일 목록

  // 💡 오픈 체크리스트 연동 데이터
  checklistData?: Record<string, ChecklistItemData>; 

  customPhases?: { id: string; name: string; startDate: string; endDate?: string; type?: string }[];

  archived?: boolean;

  createdAt?: string;
  updatedAt?: string;
}

export interface TeamMember {
  id: string;
  name: string;
}

export interface TeamSetting {
  id: string;      // 팀 ID
  brandId: BrandId;
  name: string;    // 팀 명 (예: 1팀)
  members: TeamMember[]; // 소속 SV들
  color?: string;  // 팀별 고유 색상 (Tailwind bg class 등)
  createdAt?: string;
}

export type DepartmentTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface DepartmentTask {
  id: string;
  scheduleId: string;   // 매장(FranchiseSchedule) ID
  brandId: string;
  departmentId: string; // 담당 부서 ID
  title: string;        // 업무명 (템플릿에서 복제)
  status: DepartmentTaskStatus;
  dueDate: string;      // 오픈일 기준 D-Day 계산된 날짜
  dDayOffset: number;   // D-Day (예: -7, 0, 14)
  note?: string;
  completedBy?: string; // 완료 처리자 이름
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  brandId: string;
  name: string;
  color: string; // Tailwind 색상 클래스 (예: bg-blue-500)
}

// ==========================================
// 오픈 체크리스트 전용 데이터 타입
// ==========================================

export type WorkItemCategory = 'checklist' | 'schedule_date' | 'task';

export type WorkItemInputType = 
  | 'date' 
  | 'date_range' 
  | 'location_select' 
  | 'participant_count' 
  | 'color_picker' 
  | 'file' 
  | 'phone' 
  | 'hiorder' 
  | 'showcase' 
  | 'food_waste' 
  | 'file_date' 
  | 'staffing' 
  | 'password' 
  | 'email' 
  | 'training_payment' 
  | 'normal';

export type SystemActionType = 
  | 'drawing_upload'      // 도면 PDF 연동
  | 'pre_training_pay'    // 사전교육비 입금 체크
  | 'owner_guide_sync';   // 점주 안내 날짜 동기화

export interface WorkItem {
  id: string;
  text: string;
  category: WorkItemCategory;
  inputType: WorkItemInputType;
  departmentId?: string;
  departmentIds?: string[];
  scheduleField?: keyof FranchiseSchedule;
  dDayOffset?: number;
  dDayEndOffset?: number;      // 종료일 오프셋 (미설정시 단일 날짜)
  skipWeekends?: boolean;      // 주말 제외하여 날짜 계산
  // 'constructionStart' | 'constructionEnd' 또는 다른 태스크의 id (동적 기준일 체인)
  anchorField?: string;
  calendarVisible?: boolean;
  syncToField?: keyof FranchiseSchedule;
  systemAction?: SystemActionType; // 💡 코드 내 하드코딩된 ID 의존성을 제거하기 위한 필드
  description?: string;            // 업무 처리 매뉴얼 (? 아이콘 호버/더블클릭으로 확인)
  anchorLocked?: boolean;          // true = 기준일자 연동 고정 (fixedDate 드래그 불가)
  isSystem?: boolean;              // true = 시스템 필수 항목 (삭제·이름 변경 불가)
  showOnCard?: boolean;            // true = 매장 카드에 완료 상태 표시
  order: number;
  isArchived: boolean;
}

export interface SystemConfig {
  constTypes: string[];
  signTypes: string[];
  kitchenVendors: string[];
  preTrainingLocations: string[];
  gasTypes: string[];
}

// ==========================================
// 직원 명부 (salesDb: employees)
// ==========================================
export type EmployeePosition =
  | '대표' | '전무' | '이사'
  | '부장' | '차장' | '과장' | '대리' | '사원' | '인턴'
  | '슈퍼바이저' | '기타';

export interface Employee {
  id: string;
  name: string;
  position: EmployeePosition;
  departmentId: string;
  managerId?: string;       // 결재 1차 상급자 employee ID
  phone?: string;
  email?: string;
  hireDate?: string;        // YYYY-MM-DD
  annualLeaveBalance: number; // 잔여 연차 (일)
  linkedUid?: string;       // Firebase Auth UID (없으면 계정 미연결)
  crmId?: number;           // CRM 관리번호 (엑셀 임포트 연동)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 매장 마스터 (salesDb: stores)
// ==========================================
export interface Store {
  id: string;              // 관리번호 → string 변환 (doc ID)
  storeCode: string;       // 매장코드 8자리
  name: string;            // 매장명
  region: string;          // 지역
  address: string;         // 주소
  status: string;          // 운영상태 (운영중 / 준비중 / 폐점 등)
  franchiseType: string;   // 가맹 / 직영
  contractStatus: string;  // 계약상태
  ceoName: string;         // 대표자명
  operatorName: string;    // 운영자명
  phone: string;
  mobile: string;
  email: string;
  openDate: string;        // 개점일 YYYY-MM-DD
  seatCount?: number;      // 좌석수
  registeredAt: string;    // CRM 등록일
  scheduleId?: string;     // franchise_schedules.id 참조 (수동 매핑 후)
  importedAt: string;      // 최종 엑셀 임포트 일시
}

// ==========================================
// 매장 폼 관리 (salesDb: store_forms, store_form_entries)
// ==========================================

export interface StoreFormField {
  id: string;
  label: string;
  type: 'text' | 'date' | 'checkbox' | 'select';
  options?: string[];
}

export interface StoreForm {
  id: string;
  title: string;
  description?: string;
  fields: StoreFormField[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  isArchived?: boolean;
}

export interface StoreFormEntry {
  id: string;
  formId: string;
  storeId: string;
  storeName: string;
  storeRegion: string;
  data: Record<string, string | boolean>;
  isDone: boolean;
  completedAt?: string;
  updatedAt: string;
  updatedBy?: string;
}

// ==========================================
// 캘린더 이벤트 (salesDb: calendar_events)
// ==========================================
export type CalendarEventType = 'personal' | 'company' | 'holiday' | 'leave' | 'meeting' | 'franchise' | 'daily_report' | 'weekly_report';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  allDay: boolean;
  startTime?: string;  // HH:MM
  endTime?: string;
  color?: string;
  employeeId?: string; // 작성자/소유자 employee ID (company/holiday는 없어도 됨)
  visibility: 'private' | 'team' | 'all';
  linkedId?: string;   // 연결된 meeting/task/franchise ID
  linkedType?: 'meeting' | 'task' | 'franchise';
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 연차 신청 (salesDb: leave_requests)
// ==========================================
export type LeaveType = 'annual' | 'half_am' | 'half_pm' | 'sick' | 'special';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  days: number;
  reason?: string;
  status: LeaveStatus;
  approverId?: string; // 결재자 employee ID
  approverComment?: string;
  submittedAt: string;
  approvedAt?: string;
}

// ==========================================
// 주간 업무보고 (salesDb: weekly_reports)
// 매주 월/화 작성, 굵직한 업무 4건
// ==========================================
export interface WeeklyReportItem {
  title: string;       // 업무 제목
  detail?: string;     // 상세 내용
  status: 'planned' | 'in_progress' | 'done';
}

export interface WeeklyReport {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  weekStart: string;   // 월요일 YYYY-MM-DD
  weekEnd: string;     // 금요일 YYYY-MM-DD
  items: WeeklyReportItem[];
  submittedAt: string;
  updatedAt: string;
}

// ==========================================
// 공지사항 (salesDb: notices)
// ==========================================
export type NoticeCategory = '전체공지' | '부서공지' | '긴급' | '이벤트';

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: NoticeCategory;
  authorId: string;    // employee ID
  authorName: string;
  isPinned: boolean;
  targetDeptIds?: string[]; // 비어있으면 전체
  attachments?: { name: string; url: string }[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 보고서 메타 (salesDb: reports)
// ※ 실제 내용(HTML)은 Firebase Storage에 저장
// ==========================================
export type ReportType = '일반' | '제안' | '보고' | '회의록' | '기타';
export interface ReportSection { title: string; body: string; }
export type ReportStatus = '진행' | '긴급' | '완료' | '초안';
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

// ==========================================
// 업무 태스크 (salesDb: tasks)
// 회의 안건 → 개인/협업 업무로 전환
// ==========================================
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'rejected';
export type TaskSourceType = 'meeting' | 'request' | 'manual';

export interface Task {
  id: string;
  title: string;
  note?: string;
  sourceType: TaskSourceType;
  sourceMeetingId?: string;
  sourceAgendaTitle?: string;   // 원본 회의 안건 제목
  assigneeId: string;           // 담당자 employee ID
  assigneeName: string;
  requesterId?: string;         // 요청자 employee ID
  requesterName?: string;
  collaboratorIds?: string[];   // @태그된 협업자 IDs
  collaboratorNames?: string[];
  startDate?: string;           // YYYY-MM-DD, 업무 시작일
  dueDate?: string;             // YYYY-MM-DD
  progress?: number;            // 0~100, 10단위 수동 설정
  status: TaskStatus;
  rejectionNote?: string;       // 반려 사유
  addedToDailyDate?: string;    // 일일 보고에 추가된 날짜
  projectId?: string;            // WorkProject ID (task_projects)
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 업무지도 프로젝트 (salesDb: task_projects)
// ==========================================
export interface WorkProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  isArchived?: boolean;
}

// ==========================================
// 일일 업무보고 (salesDb: daily_reports)
// ==========================================
export type DailyItemStatus = 'pending' | 'done' | 'incomplete';

export interface DailyReportItem {
  text: string;
  status: DailyItemStatus;
  note?: string;     // 미완료 사유
  progress?: number; // 0~100, 10단위 수동 설정
}

export interface DailyReport {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: string;           // YYYY-MM-DD
  type: 'morning' | 'evening';
  items: DailyReportItem[];
  photoUrls?: string[];
  reactions?: string[];
  commentCount?: number;
  confirmedAt?: string;     // 관리자 확인 시각 — 이 이후는 수정 불가
  confirmedBy?: string;     // 확인한 관리자 uid
  confirmedByName?: string;
  submittedAt: string;
  updatedAt: string;
}

export interface DailyComment {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  status: ReportStatus;
  authorId: string;
  authorName: string;
  storageKey: string;
  approvalStatus: ApprovalStatus;
  pendingApproverId?: string;   // 결재 요청 대상 uid
  pendingApproverName?: string; // 결재 요청 대상 이름 (표시용)
  approverId?: string;
  approverName?: string;
  approverComment?: string;
  approvedAt?: string;
  submittedAt?: string;
  linkedMeetingId?: string;
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
  sections?: ReportSection[];  // 새 구조화 본문
  photoUrls?: string[];        // Storage URLs (압축 후 저장)
  htmlContent?: string;        // 구 버전 호환용
  activeTab?: string;
  docDate?: string;
  projectId?: string;          // 프로젝트 연동
  projectTitle?: string;       // 표시용 프로젝트명
  kanbanColumn?: string; // 프로젝트 칸반 컬럼 (동적 컬럼 ID)
  parentReportId?: string;     // 도식화 상위 보고서
}

// ==========================================
// 업무 규정 / SOP (salesDb: sop_documents)
// ==========================================
export interface SopStep {
  text: string;
  note?: string;
}

export interface SopDocument {
  id: string;
  title: string;
  category: string;
  departmentName?: string;
  ownerName?: string;
  deadlineDays?: number;
  requiredPersonnel?: number;
  steps: SopStep[];
  note?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 프로젝트 SOP 뼈대 (salesDb: sop_project_templates)
// ==========================================
export interface SopTemplateNode {
  id: string;
  text: string;
  parentId: string | null;
  order: number;
  sopId?: string;  // sop_documents 참조
}

export interface ProjectSopTemplate {
  id: string;
  title: string;
  description?: string;
  nodes: SopTemplateNode[];
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 프로젝트 (salesDb: projects / project_items)
// ==========================================
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type KanbanColumn = 'todo' | 'doing' | 'done'; // ProjectItem 하위 호환용
export type ProjectItemPriority = 'urgent' | 'high' | 'normal' | 'low';

export type KanbanColumnColor = 'stone' | 'amber' | 'emerald' | 'blue' | 'purple' | 'rose';
export interface KanbanColumnDef {
  id: string;
  label: string;
  color: KanbanColumnColor;
}
export const DEFAULT_KANBAN_COLUMNS: KanbanColumnDef[] = [
  { id: 'todo',  label: '계획 수립', color: 'stone' },
  { id: 'doing', label: '진행중',   color: 'amber' },
  { id: 'done',  label: '완료',     color: 'emerald' },
];

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export interface ProjectFolder {
  id: string;
  name: string;
  description?: string;
  color: KanbanColumnColor;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  progress?: number;           // 0~100, 10 단위 수동 설정
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  memberNames: string[];
  brandTags?: string[];
  startDate?: string;
  endDate?: string;
  milestones?: ProjectMilestone[];
  kanbanColumns?: KanbanColumnDef[];
  folderId?: string;
  folderOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectItem {
  id: string;
  projectId: string;
  title: string;
  column: KanbanColumn;
  order: number;
  priority: ProjectItemPriority;
  kind: 'task' | 'link';
  parentId?: string;              // 도식화 트리 부모
  // kind='link'
  linkedType?: 'report' | 'meeting' | 'daily' | 'weekly' | 'task';
  linkedId?: string;
  linkedTitle?: string;
  linkedDate?: string;
  // 담당자/확인자/요청자
  assigneeId?: string;
  assigneeName?: string;
  assigneeDept?: string;          // 도식화 표시용 부서명
  accountableId?: string;
  accountableName?: string;
  requesterId?: string;
  requesterName?: string;
  requesterNote?: string;
  dueDate?: string;
  done?: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// OKR & KPI (salesDb: okr_quarters)
// ==========================================
export interface OKRKeyResult {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  unit: string;
}

export interface OKRObjective {
  id: string;
  title: string;
  ownerName?: string;
  keyResults: OKRKeyResult[];
}

export interface OKRQuarter {
  id: string;
  year: number;
  quarter: number;
  isActive: boolean;
  objectives: OKRObjective[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 새모양에프엔비 (salesDb: company_info, brand_milestones)
// ==========================================
export interface BrandMilestone {
  id: string;
  date: string;
  title: string;
  description?: string;
  category?: string;
}

export interface MVCDoc {
  mission: string;
  vision: string;
  values: string[];
  updatedAt: string;
}

export interface CompanyProfileSection { title: string; body: string; }

export interface CompanyProfileDoc {
  sections: CompanyProfileSection[];
  updatedAt: string;
}

// ==========================================
// 캘린더 루틴 (salesDb: calendar_routines)
// ==========================================
export interface CalendarRoutine {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  recurrence: 'daily' | 'weekly' | 'monthly';
  weekdays?: number[];        // 0=일 ~ 6=토. daily에서도 특정 요일만 가능
  monthDay?: number;
  timeSlot: 'morning' | 'afternoon' | 'allday';
  durationMinutes?: number;  // 소요 시간 (15/30/60/90/120)
  priority?: 'high' | 'medium' | 'low';
  color?: string;             // 'stone' | 'red' | 'orange' | 'amber' | 'emerald' | 'blue' | 'purple'
  description?: string;       // 메모
  visibility: 'personal' | 'team';  // 이전 isTeamRoutine 대체
  isTeamRoutine: boolean;     // 하위호환
  isActive: boolean;
  createdAt: string;
}

// ==========================================
// 제조실 (salesDb: factory_items / factory_daily / factory_settings)
// ==========================================
export interface FactoryItem {
  id: string;
  name: string;
  unit: string;                   // 'kg' | 'L' | '개' | 기타
  safetyDays: number;             // 안전재고 기준 일수 (default: 10)
  estimatedMonthlyUsage?: number; // 초기 월 소비량 추정치 (실적 없을 때 사용)
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface FactoryDailyRecord {
  id: string;               // `${itemId}_${date}`
  itemId: string;
  date: string;             // YYYY-MM-DD
  closingStock: number;     // 마감 실사재고
  produced: number;         // 금일 제조량
  storeCount: number;       // 당일 매장수
  note?: string;
  createdAt: string;
  updatedAt: string;
}
