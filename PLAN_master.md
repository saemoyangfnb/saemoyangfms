# 마스터 플랜 — 매장 중심 인트라넷 재편

> 작성: 2026-06-09  
> 핵심 원칙: **매장이 모든 정보의 중심. 역할에 맞는 화면. 기능보다 구조.**

---

## 전체 로드맵

```
1단계 (구조)  → 매장 중심 재편 + 역할별 홈
2단계 (정리)  → 사이드바 슬림화 + UI 통일
3단계 (확장)  → 전사 검색 · AI · @ 태그 (1·2단계 완료 후)
```

---

## 1단계 — 구조 재편 (지금 시작)

### [1-A] 매장 상세 패널 (StoreDetailPanel)

**목적**: 매장 하나를 클릭하면 모든 정보가 한 화면에

**파일**: `src/components/store/StoreDetailPanel.tsx` (신규)

**표시 내용** (추가 Firestore 읽기 없음 — 전부 이미 메모리에 있음):
```
매장명 · 개점일 · 운영상태 · 담당 SV + 부서
├── 현재 오픈 스케줄 (scheduleId로 연결)
│     체크리스트 완료율, D-Day, 주요 일정
├── 오픈 이력 (archived schedules, storeId로 필터)
│     1차 오픈 2024-03 / 리뉴얼 예정 등
├── 매출 요약 (salesDb.daily_reports 연결, 있을 경우)
└── 미처리 항목 (department_tasks where status != done)
```

**진입점**: FranchiseScheduleView 매장 카드 우측 "상세 ›" 버튼

**상태**: ⬜

---

### [1-B] 역할별 홈 화면 분기

**목적**: 로그인하면 자기 역할에 맞는 대시보드가 바로 표시

**파일**: `src/components/HomePage.tsx` 수정 + 서브 컴포넌트 3개 신규

| 역할 판별 | 조건 |
|---------|------|
| 바이저(SV) | `employee.position === '슈퍼바이저'` |
| 경영진 | `user.role === 'admin'` 또는 경영진 프리셋 권한 |
| 실무자 | 그 외 |

**SV 홈** (`HomeSV.tsx`):
- 내 담당 매장 (supervisorId === 내 employee ID)
- 오늘 마감 체크리스트 항목
- 미처리 department_tasks

**실무자 홈** (`HomeStaff.tsx`):
- 오늘 업무보고 작성 여부
- 내 진행중 프로젝트
- 읽지 않은 공지

**경영진 홈** (`HomeExec.tsx`):
- 전체 매장 운영 현황 (운영중 N · 오픈준비 N · 보류 N)
- 이번달 매출 합산 (있는 경우)
- 이번주 오픈 예정 매장

**상태**: ⬜

---

### [1-C] SV 담당 매장 자동 연결

**목적**: SV가 로그인하면 자기 매장만 자동 필터링

**파일**: `src/components/franchise/FranchiseScheduleView.tsx`

**변경**:
- `currentEmployee` (로그인한 사용자의 Employee 문서) 를 App.tsx에서 주입
- SV라면 기본 필터를 `supervisorId === currentEmployee.id`로 설정
- "전체 보기" 토글로 해제 가능 (관리자용)

**전제**: `Employee.linkedUid`와 `auth.uid`가 연결되어 있어야 함 (현재 일부 미연결)

**상태**: ⬜

---

## 2단계 — 정리 (1단계 완료 후)

### [2-A] 사이드바 6개로 슬림화

**현재 22개 → 목표 6개**

| 새 섹션 | 포함 항목 |
|--------|---------|
| 🏪 매장 | 매장 목록 (stores) + 오픈 일정 통합 |
| 📅 일정 | 캘린더 + 오픈일정 레이어 |
| 💼 업무 | 프로젝트 + OKR + 업무지도 + SOP |
| 📋 소통 | 공지 + 회의록 + 업무보고 |
| 📊 경영 | 원가 계산 + 매출 현황 + 가맹점 관제 |
| ⚙️ 설정 | 관리자 패널 + 데이터 관리 |

**파일**: `src/App.tsx` 사이드바 전면 개편

**상태**: ⬜

---

### [2-B] 공통 탭 컴포넌트

**목적**: 현재 화면마다 다른 탭 스타일 통일

**파일**: `src/components/ui/Tabs.tsx` (신규)

```tsx
<TabBar tabs={[{id, label, icon?}]} active={x} onChange={fn} />
// → border-b-2 border-stone-800 스타일로 통일
```

적용 대상: FranchiseScheduleView / CompanyCalendar / AdminPanel / SopView / ProjectsView

**상태**: ⬜

---

### [2-C] AdminPanel 3탭 개편

**(PLAN_admin_reorganize.md 흡수)**

- 인원 관리: 직원 + 계정 연결 상태 통합 뷰
- 시스템 설정: 공통 코드 · 보안 · DB 유지보수
- 데이터 관리: 매장/직원 임포트 (현재 그대로)

**파일**: `src/components/AdminPanel.tsx`

**상태**: ⬜

---

### [2-D] 캘린더 + 오픈일정 통합

**파일**: `src/components/CompanyCalendar.tsx`

- 기존 탭: 캘린더 / 연차 / 정기일정
- 추가 탭: 오픈일정 (ScheduleCalendar를 레이어로 embed)
- 사이드바에서 `franchise` 항목 제거

**상태**: ⬜

---

## 3단계 — 확장 (2단계 완료 후)

### [3-A] 전사 검색
- 상단 고정 돋보기 → 드롭다운 (매장 / 직원 / 회의록 / 공지)
- 앞글자 일치 검색 (Firestore prefix query)
- Enter → 통합 검색 결과 화면

### [3-B] @ 태그 매장 연동
- 회의록 · 업무보고 텍스트에서 @매장명 입력
- 매장 히스토리에 자동 기록 (출처 링크 포함)

### [3-C] AI 기능
- 회의록 자동 요약 (Gemini API, 이미 연동됨)
- 원가 이상 감지 코멘트
- 이후 확장

---

## 진행 현황

| 단계 | 항목 | 상태 |
|------|------|------|
| 1-A | 매장 상세 패널 | ⬜ |
| 1-B | 역할별 홈 화면 | ⬜ |
| 1-C | SV 담당 매장 자동 연결 | ⬜ |
| 2-A | 사이드바 슬림화 | ⬜ |
| 2-B | 공통 탭 컴포넌트 | ⬜ |
| 2-C | AdminPanel 3탭 개편 | ⬜ |
| 2-D | 캘린더 통합 | ⬜ |
| 3-A | 전사 검색 | ⬜ |
| 3-B | @ 태그 | ⬜ |
| 3-C | AI 기능 | ⬜ |

---

## 기존 플랜 처리

| 파일 | 처리 |
|------|------|
| PLAN_code_consistency.md | Phase 3만 잔여 → 낮은 우선순위, 보류 |
| PLAN_store_master_import.md | ✅ 완료 |
| PLAN_admin_reorganize.md | 2-C로 흡수 |
| PLAN_ui_consolidation.md | 2단계 전체로 흡수 |
