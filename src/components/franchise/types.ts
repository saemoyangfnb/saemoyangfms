export type Region = '지방권' | '광역권' | '수도권';

// ==========================================
// 앱 네비게이션 타입
// ==========================================

export enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete',
  LIST = 'list', GET = 'get', WRITE = 'write',
}

export type CostTabType = Region | '전체보기' | '메뉴 관리' | '변동사항';
export type SidebarSection = 'cost' | 'sales' | 'database' | 'admin' | 'review' | 'home' | 'agents' | 'stores' | 'marketing' | 'franchise';

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
  departmentIds?: string[]; // 다중 부서 지원
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
  dDayOffset?: number; // 💡 해당 매장 전용 D-Day 오프셋 (마스터 설정 덮어쓰기)
  fixedDate?: string;    // 💡 드래그앤드롭 등으로 확정된 고정 시작 날짜
  fixedEndDate?: string; // 💡 확정된 고정 종료 날짜
}
export type ScheduleStatus = '계약완료' | '공사중' | '사전교육' | '인테리어완료' | '본교육' | '가오픈' | '오픈완료' | '보류';

export interface FranchiseSchedule {
  id: string;
  brandId: BrandId;     // 어느 브랜드인지
  storeNumber: string;  // 매장 호수 (예: 120호)
  storeName: string;    // 매장명
  team: string;         // 담당 팀
  supervisor: string;   // 슈퍼바이저

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