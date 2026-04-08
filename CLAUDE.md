# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

새모양 F&B 그룹 **가맹관리시스템 인트라넷** — 달빛에구운고등어, 만수식당, 얌스 등 5개 외식 프랜차이즈 브랜드의 원가 계산, 식재료 관리, 가맹점 리뷰 관제를 통합 운영하는 내부 도구.

## 개발 명령어

```bash
npm run dev      # 로컬 개발 서버 (localhost:3000)
npm run build    # Vite 프로덕션 빌드 → dist/
npm run lint     # ESLint 검사
```

배포는 GitHub push → Vercel 자동 배포 (`Joyj9331/dalbitgo_calculator` → `dalbitgo-calculator.vercel.app`)

## 기술 스택

- **프론트엔드**: React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **백엔드**: Firebase Auth + Firestore (2개 데이터베이스)
- **아이콘**: lucide-react
- **드래그앤드롭**: @dnd-kit/core, @dnd-kit/sortable
- **알림 시스템**: 커스텀 Toast (`useToast()`) + ConfirmModal (`useConfirm()`) — `alert()`/`confirm()` 절대 사용 금지

## 아키텍처

### Firebase 이중 데이터베이스 구조 (`src/firebase.ts`)

```
db        → gen-lang-client-0562618804  (메인 DB)
reviewDb  → ai-studio-c39e3d19-73bc-45c0-9f8d-2f6888c29da3  (리뷰 전용 DB)
```

| DB | 컬렉션 | 용도 |
|----|--------|------|
| `db` | brands, menus, ingredients, menu_categories, ingredient_changes, users | 원가·메뉴 관리 |
| `reviewDb` | reviews, keywords, rank_tracking, roi_analysis, competitor_menu, weekly_reports, review_states | 가맹점 관제 봇 데이터 |

### 멀티 브랜드 + 멀티 섹션 라우팅 (`src/App.tsx`)

상태는 단일 `SidebarState` 객체로 관리:
```typescript
type SidebarSection = 'home' | 'cost' | 'sales' | 'database' | 'admin' | 'review';
interface SidebarState { brandId: BrandId | null; section: SidebarSection; costTab: CostTabType; }
```

`navigateTo(brandId, section, costTab?)` 로 화면 전환. 모바일에서는 `navigateAndCloseMobile()` 사용.

브랜드 선택 → 브랜드별 서브메뉴(원가 계산기 / 매출 현황 / 가맹점 관제) 표시.  
`REVIEW_ENABLED_BRANDS = ['dalbitgo']` — 현재 달빛에구운고등어만 리뷰 연동 활성화.

### 원가 계산 핵심 로직 (`src/utils.ts`)

- `calculateTotalCost(recipe, ingredients, menus)` — 레시피의 재귀적 원가 합산 (메뉴가 다른 메뉴를 포함할 수 있음, 순환 참조 방지 포함)
- `checkMenuAlert(menu, ingredients, menus)` — 식재료 단가 변동 시 원가 경보 트리거
- 메뉴 가격은 `prices: Record<Region, number>` — 지방권/광역권/수도권 3단계

### 데이터 타입 핵심 (`src/types.ts`)

- `Ingredient`: `boxCost / boxQuantity → unitCost`, `salesPrice / salesQuantity → unitSalesPrice` (2가지 원가 계산 방식)
- `RecipeItem.type`: `'ingredient' | 'menu' | 'custom'` — 레시피에 원재료, 다른 메뉴, 직접 입력 비용 혼합 가능
- `Menu.hasAlert`: 원가 변동 알림 플래그 (관리자만 해결 가능)

### Python 봇 팀 (`dalbitgo-review/`)

별도 Git 서브모듈. Firestore `reviewDb`에 데이터 적재.

| 봇 | 파일 |
|----|------|
| 리뷰 수집 | `naver_review_crawler.py` |
| 키워드 분석 | `naver_keyword_crawler.py` |
| 순위 추적 | `naver_rank_tracker.py` |
| ROI 분석 | `keyword_roi_analyzer.py` |
| 경쟁사 모니터링 | `competitor_brand_crawler.py` |
| 데이터 정제 | `clean_data.py` |

봇 공통 유틸: `firestore_client.py` — `Collections` 상수, `save_batch_to_firestore()`, `get_db()`

## UI 패턴

- **다크모드**: `dark:` 접두사 Tailwind 클래스 필수. `dark:bg-slate-900`, `dark:text-white` 기본 패턴.
- **사이드바 활성**: `bg-blue-50 dark:bg-blue-900/30 text-blue-700 border-l-2 border-blue-500`
- **모달 배경**: `fixed inset-0 bg-black/50 flex items-center justify-center z-50`
- **알림**: `toast.success()` / `toast.error()` — `useToast()` 훅 사용
- **확인 모달**: `await confirm({ title, message, confirmLabel, variant: 'danger'|'warning' })` — `useConfirm()` 훅

## 에이전트 팀

이 프로젝트에는 3명의 전문 에이전트가 배정되어 있습니다. (`@` 멘션으로 호출)

| 에이전트 | 역할 | 호출 |
|---------|------|------|
| web-designer | UI/UX 개선, 컴포넌트 디자인 | `@web-designer` |
| crawling-expert | Python 봇 개발 및 최적화 | `@crawling-expert` |
| franchise-expert | 외식업 도메인 판단 및 기능 기획 | `@franchise-expert` |
