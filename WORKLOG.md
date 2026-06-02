# 작업 로그

> **양식 규칙**: 새 작업은 **맨 위에 추가**. 한 항목은 5줄 이내로 짧게. 10개 넘으면 오래된 것부터 정리.
> 작업 종료 시 반드시 업데이트. 양 AI 모두 시작 전에 이 파일을 읽음.

---

## 양식 (복붙용)

```
## YYYY-MM-DD HH시 — Claude Code | Gemini

### 완료
- 한 줄 요약
- 한 줄 요약

### 미완 / 진행 중
- (없으면 "없음")

### 다음에 이어할 것
- 구체적 작업 (파일 경로 포함)

### 주의 / 메모
- (선택, 다음 사람이 모르면 사고날 만한 것만)
```

---

## 2026-06-02 (2) — Claude Code

### 완료
- 사이드바 전면 개편 P1: 3그룹 구조로 재편
  - 새모양에프엔비 (MVC / 브랜드 연혁 / 회사 소개서)
  - 운영 (OKR & KPI / 프로젝트 / 업무보고 / 캘린더 / 공지사항 / 회의록 / 업무규정 / 팀·부서 / 결재보고센터)
  - 브랜드 / 관리자 도구
- types.ts: SidebarSection·PERMISSION_SECTIONS·SECTION_LABELS 3곳 모두 신규 섹션 추가
- App.tsx: 로컬 SidebarSection 확장, 아이콘 5개 추가(Flag·GitBranch·Building2·Target·FolderKanban)
- 신규 섹션 플레이스홀더(mvc/brand_history/company_profile/okr/projects) 추가
- 기획 문서 PROJECTS_PLAN.md 작성·완성 (결정사항 전부 확정)

### 다음에 이어할 것
- P2: 프로젝트 기능 구현 (ProjectsView, ProjectDetailView, 칸반 보드)
- P3: OKR, 새모양에프엔비 섹션 콘텐츠 구현

### 주의
- "더보기/접기" 토글 제거 — showAllIntranet 상태는 선언만 남아있음(unused), 향후 정리 가능
- 신규 섹션은 모두 기본 'edit' 권한 (BRAND_RESTRICTED 아님) — 관리자 패널에서 개별 제한 가능

---

## 2026-06-02 — Claude Code

### 완료
- 카카오톡 공유: Kakao SDK → 클립보드 복사 방식으로 전환
  - 💬 버튼 클릭 → 보고 내용 텍스트 포맷 복사 → "카톡에 붙여넣기" 토스트
  - 출근/퇴근/주간보고/보고서결재/업무요청 전 항목 지원
  - 보고 카드 + 보고서 상세 상단에 💬 상시 버튼 (팝업 사라져도 재사용 가능)
- 보고서 승인/반려: confirm() → 인라인 확인으로 교체 (z-index 미작동 해결)
- PWA 앱 설치 개선: 사이드바 하단 상시 버튼 + iOS 단계별 안내 모달
- SaaS 프로젝트 방향 결정 (별도 WORKLOG: C:\Users\yjjo\MALANG-FNB-WORKLOG.md)

### 주의
- 카카오 SDK 완전 제거 (index.html, kakao.ts)
- iOS는 Safari에서만 홈 화면 추가 가능 — Chrome에서 안내 제공

### 다음에 이어할 것
1. AI 어시스턴트 (Gemini API: 회의록·업무·SOP 질의)
2. 캘린더 ↔ 오픈일정 동기화
3. 사내 메신저 (채널 + DM + 알림)
4. 정보 통합 홈 대시보드 (임원용 한눈보기)
5. SaaS 프로젝트 (malang-fnb) — Supabase 생성 후 시작

---

## 2026-06-01 (3) — Claude Code

### 완료
- 팀 보고 탭 전직원 오픈: "팀 현황(관리자 전용)" → "팀 보고(전직원)" 탭으로 변경
  - 직원 카드: 이름 크게, 출근+퇴근 묶음, 업무목록 + 완료/미완료 상태 표시
  - 미제출자는 흐리게 표시, 관리자 확인 버튼 유지
- 업무 인박스 UX 개선: 추가/취소(반려) 클릭 즉시 인박스에서 사라짐
- 업무 규정(SOP) 섹션 신규: 카테고리 탭+검색+단계별 절차+인쇄 (salesDb: sop_documents)
- 보고서 상세 사진 중앙 정렬 + 280px (이전 1/3 너비→더 크게)
- 보고서 삭제: 인라인 확인 방식(z-index 팝업 미작동 해결), toast+목록갱신 복구
- 보고서 결재자 선택 모달: 상신 시 직원 목록에서 결재자 직접 선택(타부서 포함)
- 회의록 인쇄 하얀 화면 수정: #meeting-print-area CSS 규칙 추가
- 업무 인박스 반려: 클릭 즉시 rejected 처리

### 다음 세션 — SaaS 프로젝트 (별도 WORKLOG)
- 폴더명: `malang-fnb` (소문자, C:\Users\yjjo\ 아래)
- 스택: Next.js 14 App Router + Supabase + Tailwind
- MVP: 오픈일정 + 원가계산
- 테넌트 구조: 본사 1 org → brands → stores (하위 rows)
- Supabase 프로젝트: 아직 미생성 — 사용자가 먼저 supabase.com 에서 생성 필요
- 진행 순서: 스캐폴드 → RLS 뼈대 검증 → 오픈일정 포팅 → 원가계산 포팅

### 다음 세션 — 인트라넷 잔여 과제
1. AI 어시스턴트 (Gemini API: 회의록·업무·SOP 질의)
2. 캘린더 ↔ 오픈일정 동기화
3. 사내 메신저 (채널 + DM + 알림)

---

## 2026-06-01 (2) — Claude Code

### 완료
- 업무보고 명칭 변경: 오전 보고 → 출근 보고, 사이드바 "일일 업무보고" → "업무 보고"
- 관리자 확인 버튼: 클릭 시 confirmedAt Firestore 저장, 이후 수정 완전 차단, "✓ 확인됨" 뱃지
- 관리자 보고 팝업 알림: onSnapshot으로 오늘 출근/퇴근 보고 실시간 감지
  - 모달 형태, [지금 확인 / 나중에 보기], 버튼 누를 때까지 유지, 다건 순차 표시
- 업무보고 UX 개선: "폼에 추가" 방식(Firestore 저장 없이 폼에만 추가), 오전/퇴근 수정 버튼
- 주간보고 지난주 미완료 이월 배너 + "이번 주로 가져오기"
- toISOString() UTC 날짜 버그 전면 수정 (6개 파일, 한국 오전 9시 이전 날짜 오류)
- 보고서 목록 max-w-xl 너비 제한
- App.tsx useRef import 누락 수정
- 번들 lazy import: 메인 2,330KB → 828KB (64% 감소)
- CompanyCalendar window.prompt → 인라인 반려 사유 모달

### 미완 / 진행 중
- salesDb Firestore 보안 규칙 업데이트 (tasks 등 신규 컬렉션 쓰기 허용)

### 다음에 이어할 것
1. salesDb 보안 규칙: tasks, notices, daily_reports, leave_requests, calendar_events 컬렉션 쓰기 명시
2. ScheduleCalendar.tsx — 사용자가 열어둔 파일 (작업 의도 미확인)

### 주의
- 관리자 알림 onSnapshot: salesDb daily_reports 오늘 날짜 필터, admin만 구독
- DailyReport.confirmedAt 새 필드 — 기존 Firestore 문서에는 없음 (undefined = 미확인 처리)

---

## 2026-06-01 — Claude Code

### 완료
- CompanyCalendar.tsx window.prompt(반려 사유) → 인라인 모달 교체 (pendingReject state + 반려 사유 textarea)
- App.tsx 번들 lazy import 적용: 15개 섹션 컴포넌트 React.lazy() 전환 + Suspense 래퍼
  - 메인 번들 2,330 KB → 828 KB (64% 감소), gzip 626 KB → 242 KB
- vite.config.ts manualChunks: vendor-firebase(508 KB), vendor-dnd(58 KB) 분리
- 미사용 import StoreManagement 제거

### 미완 / 진행 중
- salesDb Firestore 보안 규칙 업데이트 (신규 컬렉션 명시) — 여전히 미완

### 주의
- FranchiseScheduleView, MarketingDashboard는 별도 chunk 미분리 (franchise 배럴 import 특성상 main 포함됨, 추후 개선 가능)

---

## 2026-05-31 (9) — Claude Code

### 완료
- 보고서 사진 크기 축소: 카드뷰 `aspect-video` → `h-28`, 상세뷰 → `max-h-52`
- 회의록 내 업무 추가 try/catch 추가 — 실패 시 toast.error로 원인 노출 (Firestore 권한 오류 여부 확인 가능)

### 주의
- 내 업무 등록 실패 원인이 `permission-denied`로 뜨면 → Firebase Console > salesDb > Rules에서 `tasks` 컬렉션 쓰기 허용 필요
- WORKLOG 기존 미완 사항: salesDb Firestore 보안 규칙 업데이트 (신규 컬렉션 명시) 여전히 미완

---

## 2026-05-31 (8) — Claude Code

### 완료
- OpenChecklistView 태스크 날짜 계산을 utils.ts `computeWorkItemDates`로 교체 (캘린더와 동일 로직)
- 기존 인라인 `addBusinessDays` / `snapToWeekday` 로컬 함수 제거

### 주의
- WORKLOG 2026-04-30 🔴 "computeWorkItemDates 중복 구현" 이슈 중 OpenChecklistView 부분 해결
- ScheduleTimeline.tsx 로컬 복사본은 아직 미교체 (캘린더에서는 사용 안 함, 우선순위 낮음)

---

## 2026-05-31 (7) — Claude Code

### 완료
- 보고서: 회의록 타입 제거, 사진 크기 16:9 축소, 라이트박스 캐러셀 버그 수정
- 회의록: 체크리스트 항목 개별 업무 추가 (모바일/데스크탑), "안건 전체" 버튼 레이블 명확화

### 다음에 이어할 것
1. `CompanyCalendar.tsx:581` window.prompt → useConfirm 교체
2. salesDb Firestore 보안 규칙 업데이트 (신규 컬렉션 명시)
3. 번들 lazy import 적용 (2.3MB → 1MB 이하)

---

## 2026-05-31 (6) — Claude Code

### 완료
- **보고서 전면 재작성** — iframe/HTML 방식 제거, 순수 React + 모바일 우선
  - 인스타그램형 카드 피드 (사진 캐러셀, 작성자 아바타, 상태 뱃지)
  - 전체화면 에디터: 제목 + 유형 선택 + 섹션 추가형 + 사진 첨부 (최대 5장, 압축 후 Storage 업로드)
  - 전체화면 상세 뷰: 사진 캐러셀, 섹션 표시, 승인/반려 버튼
  - 결재 흐름: 임시저장 → 결재 상신 → 승인/반려
  - 구버전(htmlContent) 하위 호환 유지
  - getDocs 사용 (onSnapshot 아님, Firestore 읽기 절약)
  - types.ts: ReportType 업데이트, ReportSection 타입 추가

### 다음에 이어할 것 (우선순위 순)
1. 회의록 모바일 UI 개선 (MeetingView.tsx)
2. 일일업무보고 모바일 UI 개선 (DailyReportView.tsx)
3. 캘린더 모바일 UI 개선 (CompanyCalendar.tsx)
4. CompanyCalendar.tsx:581 window.prompt → useConfirm
5. 회의록 안건 → 업무 카드 연결
6. salesDb Firestore 보안 규칙 업데이트

---

## 2026-05-31 (5) — Claude Code

### 완료
- Firebase 읽기 최적화: menus/ingredients/categories/changes onSnapshot을 cost·sales·database·admin·history 섹션 진입 시에만 구독 (홈·인트라넷 사용 시 읽기 0)
- 홈화면 원가 알림 카드 — cost 권한 없는 사용자에게는 미표시

### 다음에 이어할 것 (우선순위 순)
1. `CompanyCalendar.tsx:581` — window.prompt → useConfirm 교체 (5분)
2. 회의록 안건 → 업무 카드 연결 (MeetingView.tsx, sourceAgendaTitle 필드 이미 있음)
3. 보고서 툴 연동 방향 결정 — iframe(A안) vs React 포팅(B안)
4. salesDb Firestore 보안 규칙 업데이트 (신규 컬렉션 명시)
5. 번들 lazy import 적용 (2.3MB → 1MB 이하)
6. iOS 앱 — 동료 맥북 확보 후 React Native(Expo) 전환

### 커밋 안 된 변경 파일 (아직 push 전)
- src/App.tsx
- src/components/HomePage.tsx
- src/components/admin/UserPermissionManager.tsx
- src/components/FeedView.tsx
- src/components/PwaInstallBanner.tsx
- src/components/DailyReportView.tsx
- public/icon.svg
- index.html
- vite.config.ts
- package.json / package-lock.json

---

## 2026-05-31 (4) — Claude Code

### 완료
- **브랜드 탭 접근 제한**: cost/sales/review/marketing 기본값 'none' → 관리자가 명시 허용 시만 접근
  - franchise(오픈일정)는 기본 'edit' 유지 (전체 허용)
  - UserPermissionManager에 기본 제한 섹션 자물쇠 아이콘 표시
  - HomePage 브랜드 카드 서브메뉴도 권한 기반 필터링
- **사이드바 단순화**: 인트라넷 4개 핵심 항목만 기본 표시, 보고서/직원명부는 "더보기" 토글
  - 브랜드 접근 가능 서브메뉴 1개면 아코디언 없이 바로 이동
  - "운영 브랜드" 섹션 헤더 제거 (구분선만 유지)
- **홈화면 전면 재설계**: 다크 배너 헤더, 상태 스트립, 리스트형 빠른 이동, 공지사항 우측 배치

### 주의
- 기존 sectionPermissions 없는 직원들은 cost/sales/review/marketing 접근 불가 — 관리자 패널 → 권한 관리에서 부여 필요

### 다음에 이어할 것
- WORKLOG 미완 사항: 연차 반려 window.prompt → useConfirm 교체, 보고서 툴 연동, 회의록 → 업무카드 연결

---

## 2026-05-31 (3) — Claude Code

### 완료
- PWA 설정 완료 (vite-plugin-pwa 설치, manifest, service worker, 오프라인 캐싱)
- 아이콘 — public/icon.svg (SAEMOYANG F&B 텍스트형)
- PwaInstallBanner.tsx — Android 설치 버튼 / iOS 홈 화면 추가 안내 / 세션 닫기
- App.tsx에 PwaInstallBanner 연결

### 주의
- 번들 2.3MB → workbox maximumFileSizeToCacheInBytes 4MB로 상향 설정 (임시)
- 나중에 code-split(lazy import) 적용 시 3MB 이하로 줄어들면 다시 낮출 것

### 다음에 이어할 것
- (iOS 앱) 동료 맥북으로 React Native/Expo 전환 시 작업 예정

---

## 2026-05-31 (2) — Claude Code

### 완료
- FeedView.tsx — DailyReportView '팀 피드' 탭으로 연결 (좋아요/댓글 포함 인스타형 피드)
- 일일보고 탭 구성: 일일 보고 / 주간 보고 / 팀 피드 / 팀 현황(관리자)

### 다음에 이어할 것
- 앱 개발 (PWA 우선, 이후 iOS 대응)

---

## 2026-05-31 — Claude Code

### 작업 순서 (데이터 보존 최우선)
- 기존 컬렉션 변경/삭제 없음, 신규 컬렉션 추가만
- 각 단계 빌드 통과 확인 후 커밋

### 완료
- 1단계: 공지사항 (NoticeBoard) 구현
- 2단계: 일일보고 미완료 항목 자동 이월
- (직원 명부 세팅 가이드는 UI 안내로 처리)

### Firestore 현황 (salesDb 컬렉션)
- meetings ← 기존, 데이터 있음
- departments ← 기존, 데이터 있음
- employees ← 신규, 비어있을 수 있음
- calendar_events ← 신규
- leave_requests ← 신규
- daily_reports ← 신규
- weekly_reports ← 신규
- tasks ← 신규
- notices ← 이번에 추가 (신규, 안전)

### 다음에 이어할 것
- 공지사항 작성/수정/삭제
- 미완료 이월 UX 개선

---

## 2026-05-30 오후 — Claude Code

### 완료
- 사이드바 3구역 재편: 인트라넷(캘린더/공지/회의록/보고서/직원 명부) / 브랜드 업무 / 운영도구
- 에이전트 팀 메뉴 제거, 식재료 DB 운영도구로 이동
- types.ts: Employee, CalendarEvent, LeaveRequest, Notice, Report 타입 추가
- SidebarSection에 calendar/notice/reports/employees 추가
- EmployeeDirectory.tsx 구현: 부서 필터, 직원 카드, 계정 연결 (salesDb: employees)
- CompanyCalendar.tsx 구현: 월 달력, 개인/회사/공휴일/연차 이벤트, 연차 신청/결재 (salesDb: calendar_events, leave_requests)

### 미완 / 진행 중
- 공지사항 (notice) — 준비 중 플레이스홀더
- 보고서 (reports) — 준비 중 플레이스홀더 (HTML 파일 통합 필요)
- 연차 결재 반려 모달에서 window.prompt 사용 중 → useConfirm으로 교체 필요

### 다음에 이어할 것
- 공지사항(NoticeBoard) 컴포넌트 구현
- 보고서 툴 연동 (HTML → React 포팅 or Firebase Storage 방식 결정)
- 회의록 안건 → 업무 카드 연결

### 주의 / 메모
- salesDb Firestore 규칙에 employees, calendar_events, leave_requests 컬렉션 추가 필요
- 직원 명부 첫 사용 전: 관리자가 각 직원 등록 + linkedUid 연결 작업 필요

---

## 2026-05-30 — Claude Code

### 완료
- MeetingView.tsx 버그 3종 수정: salesDb → db(메인 DB), alert/confirm → useToast/useConfirm, onSnapshot → getDocs
- 저장/삭제 후 목록 자동 갱신(fetchMeetings 호출) 추가

### 다음에 이어할 것
- 없음

---

## 2026-05-05 — Claude Code

### 완료
- 캘린더 매장 바 팝오버 위치 버그 수정 (fixed 포지셔닝에 scrollY 제거, 뷰포트 하단 넘침 시 위로 반전)
- A3 인쇄 일정 짤림 수정 (주 단위 break-inside avoid, print-color-adjust 추가)
- 부서별 권한 시스템 구현 (수정/열람/접근제한), 부서장 지정 UI — 관리자 패널 → 권한 관리 탭
- 변경 이력 전용 페이지 신규 구현 (30건 페이지네이션, 유형/사용자 필터, before/after 값 시각화)
- 일정 수정 로그 상세화 (변경 항목명, 변경 전/후 날짜 값 기록)

### 미완 / 진행 중
- 5번(SOP 등록), 6번(노션형 생산성) 피드백 미구현 — 장기 과제
- 2번(리뷰 탭 외부 링크) 미구현 — 외부 URL 결정 후 진행

### 다음에 이어할 것
- 5번: SOP/매뉴얼 등록 기능 (Firebase Storage + 카테고리 관리)
- 2번: 가맹점 관제 리뷰 탭 외부 링크 분리 (어느 URL로 연결할지 확인 필요)
- 부서장 필터링 개선: 현재 본인 수행 이력만 보임 → storeName 기준 부서 연동 고려

### 주의 / 메모
- 깃푸시는 사용자 권한 (명시적 요청 시에만 수행)
- activity_logs 컬렉션에 section, storeName, before, after 필드 추가됨 (신규 로그부터 적용)

---

## 2026-04-30 새벽3 — Claude Code

### 완료
- 전체 리뷰 완료 (데스크탑/모바일 UI, 기능, 연동) — 치명 3, 중간 9, 개선 6개 이슈 식별
- 배포 완료 (git push origin main → Vercel 자동 배포)

### 다음에 수정할 것 (우선순위 순)
1. 🔴 Tailwind 동적 클래스 퍼지 — `bg-${colorCode}-500` 형태 → 정적 맵으로 교체 (ScheduleTimeline, OpenChecklistView, DepartmentTaskView)
2. 🔴 OpenChecklistView 훅 규칙 위반 — 조기 return 이전으로 useState/useToast 이동
3. 🔴 computeWorkItemDates 중복 구현 — utils.ts 단일 소스 통일 (ScheduleTimeline, OpenChecklistView 아직 각자 구현)
4. 🟡 팝오버 좌표 오계산 (fixed 요소에 scrollY 더하는 버그)
5. 🟡 Gemini API 키 클라이언트 노출, 관리자 패스워드 평문 저장

---

## 2026-04-30 새벽2 — Claude Code

### 완료
- 인쇄: window.print() + @media print CSS로 변경 (현재 표시 중인 캘린더 그대로 출력, 필터 반영됨)
  - `#calendar-print-area`만 출력되도록 CSS 격리
- 매장 카드 showOnCard 항목: 이름 + 날짜/일정(시작~종료) + 상태 배지 표시로 개선 (줄긋기 제거)
  - task: computeWorkItemDates, schedule_date: scheduleField, checklist: fixedDate 기준
- computeWorkItemDates를 utils.ts로 이동 (캘린더·타임라인·카드 공통 사용)

### 주의 / 메모
- 인쇄 시 브라우저 기본 인쇄 다이얼로그 사용 → A4/A3 용지·방향은 브라우저 설정에서 선택
- PrintCalendar.tsx 파일은 미사용 상태로 남아있음 (삭제 가능)

---

## 2026-04-30 새벽 — Claude Code

### 완료
- WorkItem `showOnCard` 필드 추가 — WorkMasterManager에서 클립보드 아이콘으로 토글 (체크리스트/태스크 모두 지원)
- FranchiseScheduleView 매장 카드에 showOnCard 항목 완료 상태 표시 (미진행/안내완료/진행중/완료 색상 뱃지)
- PrintCalendar 컴포넌트 신규 — A4/A3 가로 인쇄, 2개월 연속 출력 지원
- 캘린더 컨트롤바에 용지선택(A4/A3) + 🖨️ 인쇄 버튼 추가

### 주의 / 메모
- 인쇄: 브라우저 팝업 차단 해제 필요 (window.open 사용)
- showOnCard 토글은 WorkMasterManager → 해당 항목 눈 아이콘 옆 클립보드 아이콘

---

## 2026-04-29 심야3 — Claude Code

### 완료
- ScheduleTimeline: 하드코딩된 PHASES 배열 제거 → schedule_date masterItems(Firebase) 기반 동적 페이즈 바 렌더링
- FranchiseScheduleView 매장 카드 info grid: ovenIn/trainingStart 등 하드코딩 제거 → masterItems.scheduleField 기반 동적 렌더링
- 공사시작/종료는 시스템 항목으로 고정 유지, 오픈일은 openDate scheduleField로 탐색

### 주의 / 메모
- Option 1 적용 (읽기 방식 통일, 데이터 변경 없음). 기존 Firestore 필드(ovenIn 등) 그대로 유지
- Option 2 (저장 방식 통일 → checklistData 기반) 는 추후 별도 작업

---

## 2026-04-29 심야2 — Claude Code

### 완료
- 공사일정 하드코딩 위치 전수 조사 및 정리 (코드 변경 없음, 분석만)

### 주의 / 메모
- `schedule.constructionStart` / `schedule.constructionEnd` 필드명이 7개 파일에 분산 하드코딩됨
- 변경 필요 시: ScheduleCalendar, OpenChecklistView, ScheduleTimeline, FranchiseScheduleView, App.tsx, HomePage, WorkMasterManager 전부 수정 필요

---

## 2026-04-29 심야 — Claude Code

### 완료
- ScheduleFormModal: 상단에 "공사 기간 (필수)" 파란 박스 하드코딩 (constructionStart/End 날짜 입력)
- ScheduleFormModal: 하단 체크리스트 → 부서별 태스크 상태 뷰로 교체 (부서 색상 뱃지 + 완료율 + 상태 사이클 버튼)
- 캘린더 애니메이션 조건 강화: 미완료이면서 일정 초과(오늘 > 종료일)일 때만 pulse 애니메이션
- FranchiseScheduleView: 매장 카드 사이드바에서 태스크 미완료 뱃지 제거
- Vercel 배포 완료 (git push origin main)

### 주의 / 메모
- todayStr을 ScheduleCalendar 컴포넌트 스코프 최상단에 선언 (렌더 내부 이동 시 getEventsForDate 접근 불가)
- isSystem 항목은 ScheduleFormModal 동적 masterDates 렌더에서 필터링됨 (공사시작/종료는 하드코딩 섹션으로만 표시)

---

## 2026-04-29 야간 — Claude Code

### 완료
- 체크리스트 부서탭 옆 미완료 카운트 뱃지 (빨간 원형) 추가 — 전체탭 포함
- 캘린더 미완료 태스크 강조: 부서 필터 선택 시 미완료 이벤트 바에 pulse 애니메이션 + rose 링 테두리
- 공사시작/종료 시스템 항목 보호 구조 구축:
  - `WorkItem.isSystem` 타입 추가
  - FranchiseScheduleView 로드 시 2차 마이그레이션 자동 실행 (sch_constructionStart, sch_constructionEnd → isSystem:true, 명칭 고정)
  - WorkMasterManager에서 isSystem 항목 = 이름 수정 불가, 드래그 불가, 삭제 불가 (황색 "보호됨" 뱃지)

### 주의 / 메모
- 마이그레이션은 자동 실행됨 (brandId 변경될 때마다 점검) — 이미 완료된 경우 재실행 안 함
- `animate-pulse`는 Tailwind 기본 클래스 (별도 CSS 불필요)
- 공사시작/종료를 Firebase masterItems에서 중복 관리하던 구조가 버그 원인이었음 → isSystem으로 잠가 해결

---

## 2026-04-29 저녁 — Claude Code

### 완료
- 태스크 미완료 알림을 부서별로 분리 표시 (OpenChecklistView 사이드바 + FranchiseScheduleView 매장 카드 양쪽)
- WorkMasterManager의 anchorLocked 레이블 수정: "고정/자유" → "연동/독립" (동작이 명확히 구분됨)

### anchorLocked 동작 정리 (중요)
- `anchorLocked=연동`: fixedDate 무시, 항상 D-day 재계산 → **기준일(constructionStart 등) 변경 시 태스크 날짜도 함께 이동**
- `anchorLocked=독립`: 드래그한 fixedDate 우선 사용 → 기준일이 바뀌어도 태스크 날짜 불변 (수동 고정)

### 다음에 이어할 것
- (동일)

---

## 2026-04-29 오후 — Claude Code

### 완료
- Issue 1: StoreRegistrationModal 제거 → ScheduleFormModal로 통일 (신규/수정 동일 팝업)
- Issue 2: skipWeekends 로직 변경 — 영업일 누적 계산 → "날짜 계산 후 토·일이면 직전 금요일로 스냅" (단일·다일 이벤트 모두 적용)
- Issue 3 리뷰: anchorLocked 항목 드래그 차단 (캘린더에서 cursor-not-allowed + draggable=false + handleDrop 차단), 이벤트 객체에 isLocked 전파

### 미완 / 진행 중
- 없음

### 다음에 이어할 것
- task 상태 이중화 문제: `checklistData[id].status`(0~3) vs `department_tasks.status`(pending/done 등)가 별도 관리됨. 장기적으로 단일 소스로 통합 검토 필요
- `franchise_schedules`는 onSnapshot 구독 중 → 신규 등록 후 자동 목록 반영, 등록 후 해당 매장 체크리스트로 자동 이동하는 UX는 미구현 (사용자 요청 시 추가)

### 주의 / 메모
- skipWeekends가 적용된 기존 항목들은 이전 로직(영업일 계산)과 날짜가 달라질 수 있음. 실제 운영 중인 항목 날짜 검토 권장
- StoreRegistrationModal 파일(`src/components/franchise/StoreRegistrationModal.tsx`)은 아직 디스크에 존재하나 미사용 상태

---

## 2026-04-29 — Claude Code

### 완료
- Issue 4: 2개월 캘린더 두 번째 `ScheduleCalendar`에 `selectedDeptFilter` prop 누락 → 추가
- Issue 1: 캘린더 이벤트 클릭 시 해당 체크리스트 항목으로 자동 스크롤 (2초 하이라이트 포함) — `initialScrollToItemId` prop 체인으로 구현
- Issue 2: 매장 사이드바에 태스크 미완료 뱃지 표시 (`태스크 N미완` — rose색 뱃지)
- Issue 3: `WorkItem.anchorLocked` 타입 추가, WorkMasterManager에 고정/자유 토글 버튼, `computeWorkItemDates`(캘린더)·`unifiedList`(체크리스트) 양쪽에 `anchorLocked` 시 fixedDate override 무시 처리

### 미완 / 진행 중
- 없음

### 다음에 이어할 것
- `src/App.tsx` 분리 (1644줄 → 라우터/사이드바/홈 별도 파일)
- slate → stone 색상 통일 (AdminPanel, Auth, 일부 모달)
- 라우트별 lazy import (번들 2.1MB 분할)

### 주의 / 메모
- `anchorLocked=true` 항목은 드래그해도 Firestore에 fixedDate는 저장되지만 표시는 D-day 계산값 사용. 필요시 `handleTaskOffsetUpdate`에서 anchorLocked 체크 추가 검토 가능
- task 미완료 집계는 `checklistData[id].status === 3` 기준 (DepartmentTask 별도 onSnapshot과 다를 수 있음 — 허용 범위)

---

## 2026-04-28 저녁 — Claude Code

### 완료
- 중복 파일 3개 삭제 (`src/AdminPanel.tsx`, `src/ScheduleFormModal.tsx`, `src/components/franchise/types.ts`)
- `.gitignore` 강화 + Firebase 버전 `^11.6.0` → `11.6.0` 고정
- `src/components/ErrorBoundary.tsx` 추가 + main.tsx 최상위에 적용
- onSnapshot → getDoc/getDocs 4곳 전환 (`OpenChecklistView`, `FranchiseScheduleView` 2개, `ScheduleFormModal`, `StoreRegistrationModal`)
- `FranchiseScheduleView`의 `process_settings` 마이그레이션 로직: onSnapshot → getDoc (b815 assertion 원인 제거)
- `HANDOFF.md`, `WORKLOG.md` 신규 작성

### 미완 / 진행 중
- 없음

### 다음에 이어할 것
- `src/App.tsx` 분리 (1644줄 → 라우터/사이드바/홈을 별도 파일로)
- `src/components/review/` 폴더 처리 결정 (현재 미사용, 옛 `ReviewDashboard.tsx`가 활성 중)
- slate → stone 색상 통일 (AdminPanel, Auth, 일부 모달)
- 라우트별 lazy import (번들 2.1MB 분할)

### 주의 / 메모
- Firebase b815 assertion은 SDK 12.x + 듀얼 Firestore 인스턴스 환경 버그. 11.6.0 고정 유지 필수
- `src/components/ReviewDashboard.tsx` (1400줄, 옛 버전)이 App.tsx에서 사용 중. `src/components/review/` 폴더(신규)는 미연결 상태
- Task 매칭이 `title` 문자열 기반이라 fragile — 데이터 마이그레이션 없이 건드리면 깨짐
- 사용자가 오늘 오전 일정 등록 작업을 마쳤음. 데이터 영향 작업은 매우 신중히
