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
  departmentId?: string; // 소속 부서 ID
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

export interface MenuSalesRecord {
  id: string;
  brandId: BrandId;
  yearMonth: string;       // 'YYYY-MM'
  storeName: string;       // 원본 매장명 (달빛에구운고등어송천점)
  storeShortName: string;  // 축약 매장명 (송천점)
  category1: string;       // 대분류
  menuName: string;        // 상품명
  quantity: number;
  totalSales: number;      // 총매출액
  discount: number;        // 할인액
  netSales: number;        // 실매출액
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
  gasType?: string;         // 가스 구분
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
  checklist?: ChecklistItem[]; 
  checklistData?: Record<string, ChecklistItemData>; 

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

// ==========================================
// 오픈 체크리스트 전용 데이터 타입
// ==========================================

export interface FileAttachment {
  url: string;
  name: string;
}

export type ChecklistItemType = 'normal' | 'staffing' | 'email' | 'training' | 'pdf' | 'date' | 'showcase' | 'food_waste' | 'secure_account';

export interface ChecklistItem {
  id: string;
  text: string;
  type: ChecklistItemType;
}

export interface ChecklistItemData {
  status: number; // 0: 미진행, 1: 안내완료, 2: 진행중, 3: 완료
  files?: FileAttachment[]; // 다중 파일 첨부
  note1?: string; // 일반 메모, 이메일, 홀 직원수, 교육 장소
  note2?: string; // 홀 파트수, 교육 장소(직접입력)
  note3?: string; // 주방 직원수, 교육 시작일
  note4?: string; // 주방 파트수, 교육 종료일
  note5?: string; // 교육 시작시간
  note6?: string; // 교육 종료시간
  note7?: string; // 교육 인원
  note8?: string; // 담당자
  note9?: string; // 교육비 입금 상태 (사전교육) 등 추가 용도
}

// ==========================================
// 부서별 태스크 관리 시스템
// ==========================================

/** 부서 정의 */
export interface Department {
  id: string;
  brandId: BrandId;
  name: string;    // 예: 마케팅팀, 가맹관리부, 경영지원부, 물류팀
  color: string;   // Tailwind bg 색상 (예: bg-blue-500)
  order: number;
  createdAt?: string;
}

/** 태스크 입력 타입 */
export type TaskInputType = 'check' | 'text' | 'number' | 'date';

/** 태스크 템플릿 (관리자가 설정) */
export interface TaskTemplate {
  id: string;
  brandId: BrandId;
  departmentId: string;
  title: string;         // 예: 플레이스 생성, 냉동탑차 배차
  description?: string;  // 상세 설명
  dDayOffset: number;    // 오픈일 기준 (음수: 이전, 0: 당일, 양수: 이후)
  inputType: TaskInputType;
  order: number;
  isActive: boolean;
  createdAt?: string;
}

/** 태스크 상태 */
export type DepartmentTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

/** 태스크 인스턴스 (오픈 일정별 자동 생성) */
export interface DepartmentTask {
  id: string;
  scheduleId: string;      // FranchiseSchedule.id
  templateId: string;      // TaskTemplate.id
  departmentId: string;
  brandId: BrandId;
  title: string;
  dDayOffset: number;
  dueDate: string;         // YYYY-MM-DD (openDate + dDayOffset)
  status: DepartmentTaskStatus;
  value?: string;          // text/number/date 입력값
  note?: string;
  completedAt?: string;
  completedBy?: string;    // 완료 처리한 사용자 이름
  createdAt?: string;
  updatedAt?: string;
}