# 작업 로그

> **양식 규칙**: 새 작업은 **맨 위에 추가**. 한 항목은 5줄 이내로 짧게. 10개 넘으면 오래된 것부터 정리.
> 작업 종료 시 반드시 업데이트. 양 AI 모두 시작 전에 이 파일을 읽음.

---

## 2026-07-02 — Claude Code

### R&D 관리대장 신규 메뉴 (제조실 다음, 인쇄 포함)

- **배경**: 엑셀 `새모양FnB_소스반찬_RnD_관리대장.xlsx`(build_rnd.py 생성)를 인트라넷으로 이식. 사이드바 '보고' 그룹 제조실 다음에 'R&D 관리대장' 추가.
- **구현**: `RndView.tsx` 신규 — 탭 4개(관리대장/일일 기록/주간 보고/월별 계획). 단계 선택→진행률 자동(6단계 10~100%), D-Day, 상단 요약 집계, 표에서 단계·상태 인라인 변경. 카톡 복사(현황·주간보고), 인쇄(`#rnd-print-area` + index.css print 블록, 탭별 표 출력).
- **데이터**: salesDb `rnd_items` / `rnd_daily` / `rnd_weekly` / `rnd_monthly` (타입 types.ts에 추가). 기준정보(카테고리/단계/우선순위/상태)는 컴포넌트 상수.
- 빌드 ✓. push는 사용자 확인 후.

---

## 2026-07-01 — Claude Code

### FC다움 QSC 80콜 → 브랜드 1회 (phase 1, ✅배포 완료) + 서버 크론(phase 2, 보류)

> **배포 확인(2026-07-01)**: 커밋 `6622ba5` saemoyangfms/main 푸시 → **saemoyangfms.vercel.app 자동 배포 Ready**(사장님 대시보드 확인). git-integration 정상. ⚠️ 이 PC의 `.vercel` 링크는 **엉뚱한 옛 프로젝트(dalbitgo-calculat/prj_IxtI)**를 가리켜, MCP로 배포 조회 시 "미배포"로 오판됨 — 실제 프로덕션은 saemoyangfms.vercel.app(MCP 조회 불가 계정). 배포 확인은 대시보드 또는 `curl saemoyangfms.vercel.app | grep index-*.js` 번들 해시로 할 것. [[project_deploy_topology_vercel]]


- **배경**: FC다움 개발팀 ①"매장 1개씩 총 80회 반복 호출 → 동일값 반복이라 외부공격 의심. storeIds 없이 1회 호출하면 브랜드 전체가 온다" ②"실시간 연동 금지, 별도 배치 스케쥴러로 주기 동기화하라".
- **✅ phase 1 (배포함/예정)**: `fetchQscReportsAll()`(storeIds 없이 조회, 서버 페이지당 cap 대비 `page`+`reportNo` 중복제거, 새 리포트 0건 시 종료) 신설. `runSweep`을 매장별 단건(약 84콜) → 1~수 콜로 전환. `failedStoreIds=[]`. `SNAP_VERSION` 4→5 강제 재스윕. 부수효과: storeId 없던 신규매장 리포트도 storeNo로 잡힘. **스냅샷 갱신은 기존처럼 브라우저(하루 1회 claim 스윕) 유지 — 호출 방식만 80→1**. 빌드 ✓. `fetchQscReportsPerStore`는 검증 대조용으로 보존.
- **⏸ phase 2 (보류 — 브랜치에 저장)**: 브라우저 대신 **서버 크론**이 하루 1회 조회·기록하는 완전판. 코드 완성됨, **브랜치 `feature/fcdaum-cron` (commit 7409603)** 에 보관. 재개 시 그 브랜치 사용.
  - 포함: `api/_fcdaumCore.js`, `api/fcdaum-sync.js`(크론 핸들러), `vercel.json`(crons 15:00 UTC=00:00 KST), `firebase-admin` 의존성, `fcdaumSnapshot.ts` 읽기전용+최신스냅샷 서빙, KST dateKey.
  - **재개 전 게이트**: (1) FC다움에 "no-storeIds 1회로 전체 오는지 / 페이징 파라미터명(`page`?)" 확인. (2) 프리뷰에서 no-storeIds 결과가 운영매장별 최신 리포트를 전부 커버하는지 per-store와 대조(통과 전 프로덕션 크론 금지 — 캡 데이터 매일 기록 위험). (3) **사용자 조치**: Firebase 서비스계정 키 발급 → Vercel env `FIREBASE_SERVICE_ACCOUNT` + `CRON_SECRET` 설정, Vercel 플랜 크론 확인, 배포 후 대시보드에서 크론 1회 수동 실행해 시드.
  - phase 2 적용 시 phase 1의 브라우저 스윕은 부트스트랩(스냅샷 전무 시 1회)으로 격하됨.

---

## 2026-06-30 — Claude Code

### 폼관리 인쇄 레이아웃 통일

- **문제**: 매장 폼관리(StoreMindmapView) 인쇄 시 권역마다 표 열 너비가 제각각이라 읽기 불편. 원인 = 각 권역이 독립 `<table>`인데 항목(form.fields) 열에 고정 너비가 없어 권역별 내용 길이에 따라 자동 폭 조정됨.
- **수정**: `PrintView` 표를 `table-fixed` + `<colgroup>`(매장명 9rem / 항목열 균등분할 / 완료 3rem / 완료일 5rem / 담당자 4.5rem)로 변경 → 모든 권역 표 열 너비 동일. 셀에 `align-top break-words whitespace-pre-wrap`로 긴 내용 줄바꿈 처리.
- 빌드 ✓.

---

## 2026-06-29 — Claude Code (3차)

### 신규매장 QSC 미수신 해결(데이터) + 진단 제거 + 계약상태 번역

- **버그 1 최종 해결**: 원인 = FC다움에서 **매장코드(storeCd)와 고객사식별정보(storeId)가 별개 값**이고 QSC는 storeId(고객사식별정보) 기준 조회인데, **신규매장은 고객사식별정보가 비어 있어** storeId=undefined → QSC 미수신·미확인. **사용자가 전 매장 고객사식별정보를 FC다움에 등록** → 우리 코드는 원래 storeId로 조회하므로 코드 변경 없이 해결. `SNAP_VERSION` 4로 강제 재스윕해 즉시 반영. **검증: 전부 정상 분류됨.**
- **임시 진단 제거**: StoreMgmtView의 관리자용 QSC 디버그(상태·runQscDebug·렌더박스) 전부 제거.
- **계약상태 번역**: `STORE_STATUS_KO`에 `general_new`→일반신규, `transfer_new`→양수신규 추가.
- **⚠️ 미완(사용자 요청)**: 가맹관리 첫 화면의 현황 박스(기한초과/임박/미확인/양호 등)가 너무 작아 빈 공간 과다 → 카드 크게/레이아웃 개선 필요. (시간상 미착수, 다음 작업)
- 빌드 ✓. push 예정.

---

## 2026-06-29 — Claude Code (2차)

### QSC 상세 회귀 복원 + 매장 식별자 분열 진단 (버그 1·2) — ⚠️ 미배포

- **복원**: 1차에서 매장 상세 QSC를 storeNo 단독 필터로 바꾸며 일부 매장(창원명곡·광명철산 등) 상세가 비던 회귀 → `loadQscForStore`를 **storeNo OR storeId** 둘 다 매칭(스냅샷, 무호출)으로 복원. 빌드 ✓.
- **버그 1 진단(QSC 오매칭)**: FC다움 `storeId`가 전역 고유가 아님(중복). `qsc/report`는 storeIds로만 질의 → 중복 storeId 질의 시 남의 매장 리포트가 섞여옴(어제 "일치 안 함"). storeNo로 거르면 정작 자기 리포트는 storeNo 어긋남/미수집으로 빔. **API 구조상 storeId 중복이 안 풀리면 in-app 완전 해결 불가** → FC다움에 ①storeNo 기반 QSC 질의 가능 여부 ②중복 storeId 정리 문의 필요.
- **버그 2 진단·수정(폼 내용 미연동)**: 매장폼관리(StoreMindmapView)는 엔트리를 `store_form_entries.storeId = Firestore stores doc id = 관리번호`로 저장. 가맹관리는 `FC다움 storeId`(매장코드)로 조회 → 매칭 0건. **사용자 실데이터 확인(광명철산점): FC다움 매장 "관리번호" = storeNo = 107471, 엑셀 관리번호와 동일**. 즉 조인키 = storeNo. → `loadFormEntries`를 `where('storeId','in',[storeId, String(storeNo)])` **두 키 union 조회**로 수정(읽기만, 추가적·무위험). 빌드 ✓. (편집 저장 경로는 미변경 — 폼은 주로 폼관리에서 입력)
- **버그 1 원인 규명+수정 시도(QSC)**: 임시 진단으로 확정 — **신규오픈 매장(storeSubStatus=GENERAL_NEW)은 store-and-user API 응답에 `storeId`(매장코드) 필드 자체가 없음**(광명철산점 원본 덤프에 storeId/storeCode/caqslbtr 전무, storeNo=107471만 존재). QSC는 storeId로만 조회 → storeId 없는 신규매장은 단건 조회 불가 → 점검 통째 누락 → 미확인. **수정**: `runSweep`에 전역 QSC 조회(`fetchQscReports(undefined,500)`) 1회 추가 병합 → storeId 없이 리포트의 storeNo로 매칭(buildStoreItems 기준). 스냅샷에 `SNAP_VERSION`(=2) 도입 — 스윕 로직 변경 시 오늘자 캐시도 무효화·재스윕. ⚠️ 전역 조회 cap이 있어 오래된 리포트는 못 잡을 수 있음 → 미해결 시 FC다움에 store-and-user의 신규매장 storeId 누락 보완 요청.
- **임시 진단 잔존**: StoreMgmtView에 관리자 전용 QSC 디버그 박스(매장 원본필드+스냅샷 매칭수). 검증 후 제거 필요.
- **다음**: 미배포 — QSC 상세 복원은 push됨(538758b). 폼 union 수정은 미push. FC다움 답 대기.

---

## 2026-06-29 — Claude Code

### FC다움 API "전사 하루 1회" 호출 제한 (FC다움 요청) — ⚠️ 미배포

- **배경**: FC다움 측 "API 호출량 과다, 하루 1회만 호출" 요청. 주범은 홈 위젯·가맹관리가 화면 열 때마다 운영매장(약 84개) 1개당 1콜씩 QSC 전수 조회(`fetchQscReportsPerStore`) — 사용자·마운트마다 수십 콜.
- **방식**: Firestore 공유 일일 스냅샷 도입. 신규 `src/fcdaumSnapshot.ts` — `fcdaum_cache/daily`(salesDb)에 매장+QSC 저장. `getDailyStoreData()`가 오늘자 스냅샷 있으면 FC다움 무호출 반환, 없으면 **트랜잭션 원자적 claim**(승자 1명만 스윕, building 5분 타임아웃 재선점, ready 폴링, stale 폴백)으로 전사 하루 1회만 스윕.
- **경계(확정)**: 자동 스윕만 1회화. 매장 상세 QSC는 스냅샷에서 storeNo 필터(무호출). 헬프데스크·운영정보는 사람 클릭 시 라이브 유지. 새로고침 버튼=스냅샷 재읽기(`loadData(true)`, 무스윕).
- **변경**: HomePage 위젯·StoreMgmtView `loadData`/`loadQscForStore`/새로고침 → 스냅샷 경유. firestore.rules에 `fcdaum_cache` 규칙 추가(+ 기존 미커밋 `store_meta`/`store_logs`도 포함 — pull로 들어온 코드가 실사용). 빌드 ✓.
- **doc 1MB 한도 안전성(설계로 보장)**: 스냅샷 stores는 `storeUsers` 제거, QSC는 매장별 최근 20건 캡 → 최악도 수백 KB. `runSweep`가 write 직전 크기를 `console.info`로 찍음(프리뷰 실측 확인용). 캡 안 했으면 size 초과 시 write 실패→재스윕 무한루프로 회귀할 뻔.
- **⚠️ 배포·검증**: ① firestore.rules의 salesDb(=default DB) 규칙에 `fcdaum_cache` 읽기/쓰기 허용 필요 — `firebase deploy --only firestore:rules`로 배포(salesDb에 Console 전역 규칙이 이미 있으면 자동 충족). ② 코드는 Vercel push. ③ `/api/fcdaum`은 서버리스라 vite dev에선 안 뜸 → **프리뷰 배포에서 앱 1회 열고 Firestore `fcdaum_cache/daily` 문서 생성·`status:ready`·크기 확인 후 프로덕션**.

---

## 2026-06-25 — Claude Code (3차)

### 매장 폼관리 항목 미표시 버그 수정 + 가맹관리 다수 수정 (배포 완료)

1. **매장 폼관리 항목 미표시 복구** (`StoreMindmapView.tsx`): B안(FC다움 API 전환) 후 `store.id`가 FC다움 `storeId`로 바뀌어 기존 `store_form_entries.storeId`(Excel 관리번호)와 매칭 전부 실패. Firestore `stores` 컬렉션 기반으로 롤백 + 폐점 필터 보강(`'폐점'|'C'|'close'|'closed'`)
2. **QSC 전부 미확인 수정** (`storePriority.ts`): FC다움 작성중 상태는 `r.status === 'd'` → `(status).toLowerCase() !== 'r'`로 재수정 — 완료·검토 등 유효한 점검 기록도 인정
3. **가맹관리 지도 제거** (`StoreOverviewMap.tsx` 삭제, `korea-provinces.json` 삭제): SVG 지도 + 214KB TopoJSON 로딩이 느림의 원인, 통계 카드로 대체
4. **양도양수 매장 숨김** (`storeHidden.ts` 신설, `StoreMgmtView.tsx`): Firestore `store_settings/merged_ids`로 숨길 storeId 목록 관리. 관리자만 숨김/해제 가능
5. **홈 위젯 로딩 속도 개선** (`HomePage.tsx`): QSC 조회 전 `storeStatus === 'O'` 필터로 운영 매장만 조회

---

## 2026-06-25 — Claude Code (2차)

### 신규 매장 연동 버그 3종 수정 (배포 완료)

1. **QSC 오늘 날짜 오표시 수정** (`storePriority.ts`): `buildStoreItems` 필터에 `r.status === 'd'` 추가 — FC다움이 신규 매장에 자동 생성하는 작성중(r) 초안 리포트가 완료된 점검으로 오분류되던 버그 수정
2. **홈 위젯 매장 수 즉시 반영** (`HomePage.tsx`): localStorage 캐시 키 `v7→v8` 버전업 — 신규 매장 추가 후 최대 10분간 반영 안 되던 문제 해결 (하드코딩 아님, 캐시 문제였음)
3. **매장 폼관리 FC다움 자동 연동** (`StoreMindmapView.tsx`): `getDocs(stores)` → `fetchAllStores()` 전환 — FC다움에 매장 추가 시 수동 임포트 없이 즉시 반영
- 모두 `npm run build` 성공 확인 후 배포 완료

---

## 2026-06-25 — Claude Code

### 캘린더 일정 저장 + 공지 읽음 처리 버그 수정 (배포 완료)

- **캘린더**: `saveEvent`에 try-catch 없어서 Firestore 오류 시 아무 반응 없던 문제 수정. `employeeId: undefined` → Firestore 거부 버그는 조건부 스프레드 + `clean(JSON.parse/stringify)`으로 방어.
- **공지 읽음**: `notices` write 규칙이 isAdmin 전용이라 일반 직원 `markRead`가 permission-denied로 조용히 실패. 규칙을 분리해 `isApprovedUser`는 `readBy` 필드만 update 허용. `markRead`에도 try-catch 추가.
- firestore.rules 배포 완료 (Firebase Console, saemoyangfnb@gmail.com, default DB). 코드 커밋 c4eda83, push 완료.

---

## 2026-06-17 — Claude Code

### QSC "미확인" 오분류 진짜 원인 규명 + 매장별 단건 조회로 수정

- **진단(실API 검증)**: storeNo 매칭은 정상(057199 매장·리포트 둘 다 storeNo 105324 일치). 진짜 원인은 **FC다움 `qsc/report`가 storeIds 다건 조회 시 응답을 "최신 ~10건"으로 cap하고 pageSize·page를 전부 무시**. → 청크(10개)에서도 오래된 리포트 가진 매장이 통째 누락 → 미확인 오분류. 운영84개 중 청크 미확인 35.
- **수정**: `fetchQscReportsPerStore`(매장별 단건, 동시성8 + 1회 재시도 + 실패 storeId 추적) 신설. StoreMgmtView·HomePage 위젯 모두 이 경로로 전환. `buildStoreItems`에 `failedStoreIds` 추가 → 조회 실패를 '미확인' 아닌 **level 4 '조회 실패'(보라)**로 구분(거짓 미확인 재발 방지). 필터칩·도넛 세그먼트는 실패>0일 때만 노출.
- **검증**: 단건 방식 미확인 35→30(5개 회복, 057199 포함). 남은 30 = storeId 있고 리포트 진짜 0건(totalCount=0) 20 + **storeId 자체 없는 운영매장 10**(storeId 경로로는 조회 불가, 별도 과제).
- 빌드 성공. 캐시키 v6→v7. ⚠️ 미배포 — 로컬 확인 대기. [[project_fcdaum_storeno_matching]] 갱신.

---

## 2026-06-16 — Claude Code

### 가맹관리 지도·현황 디버깅 + 홈 위젯 통합 + 조직 진단

- **지도 안 보임(다단계 추적)**: 진짜 원인은 레이아웃 — StoreMgmtView `h-full`이 부모 auto 높이라 미해소, 지도가 화면 밖으로 밀림. `h-[calc(100vh-6rem)]`로 수정. (지도 색/이름 매칭도 함께 정리)
- **관리 알림 4단계 재정의**(미확인/기한 초과/기한 임박/양호) + 상태 한국어화(REQUESTED·EMPTY 등) + 매장 상세→지도 복귀 버튼.
- **홈 위젯↔가맹관리 기준 통합**: 공통 모듈 `storePriority.ts` 신설, 홈 위젯 도넛 차트화, 범례 시인성 개선.
- **미확인 오분류 해결**: QSC 매칭을 storeId→storeNo로, `fetchQscReports`에 storeIds 청크(10개) 분할 호출 추가(대량 ID 시 API 누락 회피). 프록시 직접 조회로 검증.
- **조직 구조·병목 진단** 메모화([[project_org_structure_and_pains]]): 비동기 조직인데 동기 도구 의존, 카톡 이중보고가 채택 실패 핵심.
- **PLAN_test_record_form.md 등록**: 신메뉴 테스트 기록폼(=프로젝트와 거의 동일, 공들였으나 미사용) 채택 개선 플랜. 구현 전 플랜만. 미착수.

---

## 2026-06-13 (3) — Claude Code

### WorkMapView 프로젝트/업무 생성·수정 Firestore 저장 실패 수정

- **근본 원인**: `handleSaveProject` / `handleSaveTask` 에서 `undefined` 필드(description, startDate, endDate 등)를 Firestore에 직접 전달 → Firestore가 `undefined` 거부, `catch`에서 "저장 실패" toast만 표시
- **수정**: `clean = JSON.parse(JSON.stringify(...))` 헬퍼 추가 후 두 save 핸들러의 Firestore 쓰기 호출에 적용
- 빌드 성공

---

## 2026-06-13 (2) — Claude Code

### DailyReportView 추가 버그 수정 6건

- **myW.items undefined**: `setWeeklyForm` 에서 `myW.items` 직접 접근 → `(myW.items ?? [])` 방어
- **prev.items undefined**: 지난주 이월 항목 `prev.items.filter` → `(prev.items ?? []).filter`
- **Task.createdAt undefined**: sort 시 `b.createdAt.localeCompare` → `?? ''` 방어
- **myMorning?.items[idx]**: optional chaining 미완 → `myMorning?.items?.[idx]?.progress` 수정 (2곳)
- **myMorning.items.map** / **myEvening.items.map**: 공유 시 `items` 직접 접근 → `(items ?? []).map` 방어
- 빌드 성공, TypeScript 에러 0개

---

## 2026-06-13 — Claude Code

### 전수 버그 수정 — 런타임 크래시 방어 처리 9건

- **SopView.tsx**: `height`/`preview` prop 미존재 → `rows={7}` 교체 (TypeScript 에러 제거)
- **IngredientManager.tsx**: `alert()` 3건 → `toast.success/error` 교체 + `useToast` 추가
- **SalesDataImporter.tsx**: Firestore 진단 `alert()` → `toast.info` 교체
- **utils.ts**: `calculateTotalCost` / `doesMenuContainIngredient` / `hasMissingIngredients` — `recipe` undefined 허용 (`?? []` 방어)
- **OverviewTable.tsx**: `menu.recipe ?? []` 초기화 + `menu.prices?.[r]` 옵셔널 체이닝 3곳 + `makeFreshSimPrices` 방어
- **MenuTable.tsx** / **RecipeModal.tsx**: `menu.recipe ?? []` 초기화
- **App.tsx**: `handleDuplicateMenu` — `lastAcknowledgedCost: undefined` Firestore 저장 버그 수정 (JSON.parse 클린), `m.recipe?.forEach`, `menu.recipe?.length`
- **DailyReportView.tsx** / **FeedView.tsx**: `submittedAt ?? ''` undefined sort 크래시 방어, `items ?? []` 방어 4곳
- **WorkMapView.tsx**: `displayReport.items ?? []` 방어 2곳
- 빌드 성공, TypeScript 에러 0개

---

## 2026-06-12 (8) — Claude Code

### 원가 계산기 개선 — 표 뷰 재설계 + 시뮬레이션 기능

- **표 뷰 기본값으로 변경** + 검색바 + 카테고리 탭 필터 추가
- **원가율 진행바**: 표 뷰 + 카드 뷰 권역 블록 모두 적용 (60% 기준 스케일, 초록/주황/빨강)
- **메뉴 복사**: 카드·표 모두 Copy 아이콘, `handleDuplicateMenu` Firestore 저장
- **레시피 편집**: 표 뷰에서 BookOpen 아이콘 → 중앙 모달로 분리
- **가격 시뮬레이션 뷰 신설**: 전체 메뉴 판매가 입력 → 원가율 실시간 계산, 수정 셀 주황 하이라이트, 초기화. DB 저장 없음(위험하여 제거)
- 빌드 성공, 배포 완료 (8fee685)

---

## 2026-06-12 (7) — Claude Code

### SOP 마크다운 편집기 도입

- `@uiw/react-md-editor` 설치 (v4.1.1)
- `src/components/ui/MarkdownEditor.tsx` — lazy 로딩 래퍼 (MarkdownEditor, MarkdownView)
- `SopEditor`: 참고 메모 textarea → 마크다운 live split 에디터
- `SopDetail`: 참고 메모 + 스텝 note → MarkdownView 렌더링
- `index.css`: wmde 스타일 통합 및 prose 오버라이드
- 빌드 성공, 배포 완료 (9b588e2)

---

## 2026-06-12 (6) — Claude Code

### 매장관리 폼 완료 현황 연결 (StoreListView — 올바른 파일)

- 이전 작업은 미사용 `StoreManagement.tsx`에 잘못 적용, 이번에 `StoreListView.tsx`에 올바르게 적용
- `StoreListView`: `activeForms` + `allEntries` 상태 추가, 초기 로드에 form 컬렉션 포함
- `formStatsByStore`: storeId 기준 `Map<storeId, {done, total}>` 계산
- 목록 아이템: "폼 N/M" 뱃지 (전체완료=초록, 일부=노랑, 미입력=없음)
- 상세 패널: "매장 폼 현황" 섹션 추가 — 활성 폼별 완료/입력중/미입력 현황
- 빌드 성공

---

## 2026-06-12 (5) — Claude Code

### 매장 폼관리 캘린더 hover 팝업 + 매장관리 폼 완료 현황 뱃지

- `CalendarTab`: `+N개` 텍스트 → hover 버튼으로 교체, `showTooltip/scheduleHide/cancelHide` 로직 추가
- 툴팁 패널 (`fixed` 포지션): 해당 날짜 전체 매장 목록, 완료/진행 상태 색상 구분, 클릭 시 EntryModal 오픈
- `StoreManagement`: `salesDb` + `StoreFormEntry` import, `formStats` 상태 추가
- `salesDb.store_forms`(활성만) + `store_form_entries` 로드 후 storeName 기준 매칭
- 테이블/모바일 카드에 `FormBadge` 추가 (완료 초록 / 진행중 노랑 / 미입력 회색)
- 빌드 성공

---

## 2026-06-12 (4) — Claude Code

### 업무보고 — 회의 실행항목 패널: 최근 5개 회의록 중 선택

- `MeetingRecord` 인터페이스 추가 (id, title, date, actions)
- `meetingsList`, `selectedMeetingId` 상태 추가
- `loadMeetingActions`: 최근 10개 flat 목록 → 최근 5개 회의록 단위 로드, 첫 번째 자동 선택
- `selectMeeting()` 핸들러: 회의록 선택 시 해당 미완료 실행항목으로 `meetingActions` 교체
- 패널 내 회의록 탭 칩 UI 추가 (가로 스크롤, 선택 강조)
- 빌드 성공

---

## 2026-06-12 (3) — Claude Code

### Firestore undefined 버그 수정 + TypeScript 타입 에러 전수 해소

- `DailyReportView`: `clean()` 헬퍼(JSON.parse/stringify) 적용 → `submitMorning`/`submitEvening` setDoc/updateDoc 모두 undefined 제거 처리 (commit: 07743ef)
- `types.ts`: `ChecklistItemData`에 `fixedDate/fixedEndDate` 추가, `LeaveRequest`에 `employeeName` 추가, `TaskTemplate`/`TaskInputType`/`MenuSalesRecord` 신규 정의
- `tsconfig.json`: `영수증관리/` 서브프로젝트 exclude 추가
- 15개 파일 타입 불일치 수정 (AdminPanel, DatabaseView, IngredientManager, ProjectsView, FranchiseScheduleView, MarketingScheduleView, MenuSalesUploadView, ProfitabilityView, App.tsx 등)
- `npx tsc --noEmit` 에러 0개, 빌드 성공, 배포 완료 (commit: ec06c58)

---

## 2026-06-12 (2) — Claude Code

### WorkMapView 탭 통합 + 업무 칸반 + 업무보고 패널 우측 이동

- WorkMapView: `viewMode` 토글 제거, 단일 탭바(목록/칸반/마인드맵/캘린더) 통합
- `TaskKanbanView` 신규: pending/in_progress/done 컬럼, DnD로 상태 변경 (목록↔칸반 동일 task 데이터 공유)
- 마인드맵 탭: `ProjectMindMap` export 추가 후 직접 렌더 (ProjectDetail 내 tab bar 중첩 회피)
- DailyReportView: 회의 실행항목 패널 → 오른쪽 사이드 패널로 이동 (`lg:w-72 sticky`)
- 빌드 성공, commit: aa3c9a5

---

## 2026-06-12 (1) — Claude Code

### DailyReportView — 회의 실행항목 → 업무보고 DnD 연동 + 항목별 메모

- `DailyReportItem`에 `memo?: string` 필드 추가 (퇴근 보고 시 출근 메모 컨텍스트로 표시)
- 오전 보고 각 항목 아래 "메모 — 어떻게 진행할지" 입력칸 추가
- 회의 실행항목 패널: 최근 회의록 `actionItems` (미완료) 불러오기, `DraggableMeetingItem` → `DroppableMorningZone` DnD 추가
- 기존 task inbox DnD 인프라 확장 — `draggingMeetingItem` state, `onDragStart/End` 분기 처리
- 빌드 성공

---

## 2026-06-11 (8) — Claude Code

### WorkMapView — B안 프로젝트 보드 모드 + 주간 현황 탭 완성

- `viewMode` 토글(업무/칸반·맵): 프로젝트 선택 시 헤더에 버튼 표시
- `board` 모드: `ProjectDetail`이 우측 패널 전체 점유 → 중복 헤더·스크롤 중첩 해소
- `CalendarTab` 제거 → `ProjectWeekTab`(프로젝트 멤버×요일 주간 매트릭스)로 교체
- 깨진 `monthReports`, `calMonth`, `activeTab === 'detail'` 참조 모두 제거
- 빌드 성공 + 푸시 완료 (commit: 45bcf11)

---

## 2026-06-11 (7) — Claude Code

### DailyReportView — 주간 현황 탭 구현 완료

- `tab === 'week'` 분기에 주간 매트릭스 렌더 추가 (직원 × 요일 표)
- 주 네비게이션(◀/▶ + "이번 주" 버튼), 스크롤 가능한 sticky 좌측 열
- 셀: ☀/🌙 뱃지 + 업무 항목(✓/●/✗) 최대 4개, 초과 시 "+N개"
- 셀 클릭 → `DayDetailPopup` 팝업 (이미 Edit 1에서 구현된 컴포넌트 재활용)
- 범례(완료/진행중/미완료/출근/퇴근) 하단 표시. 빌드 성공 확인.

---

## 2026-06-11 (6) — Claude Code

### 플랜 등록 — 업무지도 캘린더 날짜 클릭 팝업

- `PLAN_workmap_calendar_popup.md` 생성
- 날짜 셀 클릭 → 해당 일자 업무 마감 + 업무보고 팝업 표시
- 신규 `DayDetailPopup` 컴포넌트 + `CalendarTab`에 `onDayClick` 콜백 추가 예정
- 이벤트 버블링 주의: 업무 칩 클릭과 날짜 셀 클릭 별개 처리

---

## 2026-06-11 (5) — Claude Code

### 완료 — 업무 지도 (WorkMapView) 완전 재구성

- `types.ts`: `Task`에 `projectId?: string` 추가 + `WorkProject` 인터페이스 신규 추가
- `WorkMapView.tsx` 완전 재구성: 좌측 프로젝트 사이드바 + 우측 3탭 구조
  - **좌측 사이드바**: 프로젝트 목록 (활성/보관함 탭, +신규, 호버 수정/보관/삭제)
  - **목록 탭**: 담당자별 그룹, 검색/상태/담당자 필터
  - **캘린더 탭**: 월간 그리드 — 업무보고(아침☀/저녁🌙) + 업무 마감일 칩
  - **타임라인 탭**: 기존 Gantt 차트 (유지)
- `firestore.rules`: `task_projects` 컬렉션 규칙 추가 (`isApprovedUser`)
- **⚠️ Firestore rules 배포 필요**: `npx firebase deploy --only firestore:rules`

---

## 2026-06-11 (4) — Claude Code

### 완료 — 매장 폼 관리 (StoreMindmapView) 신규 구현

- `types.ts`: `StoreFormField`, `StoreForm`, `StoreFormEntry` 인터페이스 추가 + `storeforms` 섹션 등록
- `StoreMindmapView.tsx` 신규: 왼쪽 폼 목록 + 오른쪽 맵/목록 양방향 탭
  - **마인드맵 탭**: 권역 노드 클릭 → 목록 탭으로 전환 + 해당 권역 하이라이트·스크롤
  - **목록 탭**: 검색(매장명/지역/대표자) + 권역별 아코디언 + 완료율 진행바
  - 폼 에디터(기존 폼에서 항목 불러오기 지원) + 매장별 입력 모달
- `firestore.rules`: `store_forms`(admin write), `store_form_entries`(인증 read/write) 추가
- **⚠️ Firestore rules 배포 필요**: `npx firebase deploy --only firestore:rules`

### 주의
- 폼 생성/삭제는 admin만 가능, 항목 입력은 승인 직원 전체 가능
- 매장 데이터는 기존 `salesDb.stores` 컬렉션 사용 (새 데이터 없음)

---

## 2026-06-11 (3) — Claude Code

### 완료 — 캘린더 개선: 일일/주간보고 표시 + 공사일정 제거 + 셀 확대

- `CalendarEventType`에 `daily_report`, `weekly_report` 추가 (`types.ts`)
- 캘린더에 일일보고(teal), 주간보고(violet) 가상 이벤트 표시 — 날짜/주차별 그룹카운트 ("📝 일일보고 3명")
- `FRANCHISE_PHASES`에서 `construction` 제거 → 공사 일정 캘린더에서 완전 제거
- `franchiseEvents` useMemo에서 `fco_` (공사) 이벤트 생성 라인 삭제
- 셀 높이: `min-h-14 sm:min-h-24` → `min-h-20 sm:min-h-36`, 셀당 이벤트 표시 2→3개, overflow 기준 4→5

---

## 2026-06-11 (2) — Claude Code

### 완료 — 제조실 데이터 로드 복구

**원인**: `5425efb`에서 catch-all 제거 시 `factory_settings` 컬렉션 규칙 누락 → `loadAll()` Promise.all 전체 실패 → 빈 화면
- `firestore.rules`에 `factory_settings` 규칙 추가 + Firestore rules 재배포
- `loadAll()` 에서 `factory_settings` 로드 `.catch(() => null)` 방어 처리 + `settingsDoc?.data()` optional chaining

**데이터는 Firestore에 보존됨** — 삭제된 것 없음, 표시 실패였음

---

## 2026-06-10 — Claude Code (컨텍스트 이어받기)

### 완료 — 캘린더 ↔ 오픈일정 싱크 수정 + TickTick 업무 오버레이

**캘린더-프랜차이즈 일정 싱크 (CompanyCalendar.tsx)**
- `getDocs` → `onSnapshot` 교체: 오픈일정 변경 시 캘린더 실시간 반영
- `process_settings/{brandId}` 로드 후 `computeWorkItemDates` 적용 — 드래그앤드롭 오버라이드 정확 반영
- 레거시 필드 폴백 유지 (processSettings 없는 경우)
- 기존 공정 필터 phaseKey 추출 로직 수정 (id prefix 기반)

**TickTick 업무 오버레이 (CompanyCalendar.tsx)**
- `tasks` 컬렉션 로드 (현재 월 dueDate 필터)
- 내 업무 / 팀 업무 토글 (같은 부서 기준)
- 달력 셀 업무 바 표시 (상태별 색상: 회색/파랑/초록)
- 드래그앤드롭으로 dueDate 변경
- 업무 클릭 → 상태 변경 팝업
- 날짜 + 버튼 → 빠른 업무 추가 모달

**ScheduleCalendar.tsx**: 로컬 중복 `computeWorkItemDates` 제거, utils.ts에서 import로 통일

---

## 2026-06-10 — Claude Code

### 완료 — 보안 강화: user_status 미러 컬렉션 + Firestore rules 배포

- `salesDb.user_status/{uid}` 미러 컬렉션 도입 — 로그인/승인/정지/삭제 시 자동 동기화
- `isApprovedUser()` 함수를 salesDb-native로 교체 (크로스 DB 조회 제거)
- `meetings`, `tasks`, `daily_reports` → `isApprovedUser()` 적용 (해고 직원 즉시 차단)
- catch-all 제거 → 미열거 컬렉션 기본 DENY. Vercel 배포 + Firebase rules 배포 완료.

---

## 2026-06-11 — Claude Code

### 완료 — 회의록 시스템 구조 개선 3단계

**1. Firestore rules 강화**
- 회의록 delete → isAdmin 전용 (이메일 기반), 직원/공지 write → isAdmin 전용
- 전체 컬렉션 명시적 열거 (meetings, employees, notices, projects, tasks, daily_reports 등)
- catch-all 유지 (WORKLOG 2026-06-10(2) 사건 방지)

**2. 회의록 단일화 (안건형식 정식)**
- QuickMeetingForm(3+1 items 형식) 완전 제거
- MeetingForm에 회의 종류 선택 추가 (주간업무/정기경영/브랜드별/임시)
- MeetingForm에 AI 정리 버튼 추가 (Gemini 2.5 Flash — 안건/결정/실행항목 기반)
- 구형식(items) 작성 회의록은 상세보기 호환 유지 (데이터 보존)

**3. 업무-회의록 연동 (3순위)**
- MeetingDetail에 "연결된 업무" 패널 추가
- `sourceMeetingId` 기반으로 tasks 역추적, 상태 뱃지(대기/진행중/완료) 표시

---

## 2026-06-10 (4) — Claude Code

### 완료 — B안 통합: QuickMeetingForm ↔ 구 형식 이원화 완성
- **MeetingItem 타입** `assignee / deadline / done` 필드 추가
- **이전 회의 이월 패널**: 신 형식(items 미결) + 구 형식(agendas/decisions/actionItems) 모두 이월 버튼 지원
- **항목별 담당자/기한** 인라인 확장 (마우스 오버 시 +담당 버튼 노출)
- **완료 체크박스**: 폼 내 진행/결정 항목 즉시 done 토글. 상세 뷰도 동일 동작, Firestore 즉시 반영
- **폼 라우팅 이원화**: 구 형식(agendas) → 기존 MeetingForm(구 형식 배지 표시), 신 형식 → QuickForm
- **요약 바 분기**: 신 형식은 "진행·결정 완료율" 프로그레스, 구 형식은 기존 평균 진행율 유지
- **saveMentions**: items 내용에서도 @매장 멘션 추출
- **totalIncomplete**: 신 형식 미완료 items도 집계
- **formatMeetingShare**: 신 형식 items 카카오 공유 포함

---

## 2026-06-10 (3) — Claude Code

### 완료
- **회의록 3+1 빠른 입력**: `QuickMeetingForm` — Enter 입력 후 ←공지 / ↓진행 / →결정 방향키로 분류, 저장 시 Gemini AI 요약 자동 생성
- **회의록 종류 필터 탭**: 주간업무/정기경영/브랜드별/임시 탭 + 회의 수 배지
- **회의록 월별 아코디언**: 월 헤더 접기/펼치기, 항목 카드에 공지/진행/결정 건수 배지 표시
- 이전 형식(agendas/decisions/actionItems)과 신규 형식(items) 하위호환 유지
- 빌드 확인 후 push → Vercel 자동 배포

### 환경변수 필요
- AI 요약 사용 시 `.env`에 `VITE_GEMINI_API_KEY=` 추가 필요 (Vercel 환경변수에도 설정)

---

## 2026-06-10 (2) — Claude Code

### 완료
- **카톡 복사 버그 수정**: `kakao.ts` `onCopied` 단일콜백 → `onSuccess`/`onError` 분리. 실패 시 초록 토스트 뜨던 버그 해결. DailyReport·Factory·Meeting·Report 호출부 전체 수정.
- **회의록 이월 확장**: 기존 안건만 이월 → **결정사항·미완료 실행항목도 개별 이월 버튼** 추가. 왼쪽 패널에 섹션 분리 표시.
- **매장 태그 확대**: `AtMentionTextarea` 컴포넌트 신규. `ReportView` 보고서 본문에 @매장명 태그 지원 + 저장 시 `store_mentions` 자동 기록.
- **Firestore rules 긴급 수정**: 이전 배포로 `sop_project_templates`, `reports`, `project_items`, `factory_items` 등 미열거 컬렉션이 DENY된 문제. `match /{document=**}` catch-all 추가 후 재배포 → 복구 완료.

### 원인 기록 (재발 방지)
- `firebase deploy --only firestore:rules` 는 salesDb(default DB) 규칙을 **Firebase Console 설정까지 덮어씀**. 명시 안 한 컬렉션은 DENY 기본값. 규칙 배포 후 반드시 전체 컬렉션 접근 검증 필요.

---

## 2026-06-10 — Claude Code

### 완료
- **내 업무공간 (`my` 섹션)**: `MyWorkspaceView.tsx` 신규 생성
  - 개인 메모 (salesDb `user_memos` 컬렉션 — 신규), 내 담당 업무 집계, 오늘 일정, 바로가기 카드
  - `types.ts` SidebarSection / PERMISSION_SECTIONS / SECTION_LABELS에 'my' 추가
  - App.tsx 사이드바 상단 '내 업무공간' 버튼 + renderContent 케이스 추가
- **빠른 입력 팔레트 (`QuickInputPalette.tsx`)**: Ctrl+N 전역 단축키
  - 메뉴: 빠른 메모 / 업무보고 / 회의록 / 내 업무공간 — 화살표키+Enter 탐색
  - 메모 모드: 텍스트 입력 후 즉시 `user_memos`에 저장
- **홈 대시보드**: quickNavItems에 '내 업무공간' 추가 (첫 번째 항목)
- **빌드**: `npm run build` 통과 ✓

### 추가 완료 (보완)
- **런타임 버그 3건 수정**: `useToast()` 구조분해 오류, `useConfirm()` 구조분해 오류, 복합 Firestore 쿼리(인덱스 의존) → JS 필터로 대체
- **`alert()` 위반 제거**: App.tsx 587번 줄 `alert()` → `toast.error()` 교체
- **Firestore 규칙 배포**: `firestore.rules`에 salesDb 전체 컬렉션 + `user_memos` 본인만 읽쓰 규칙 추가
  - `npx firebase deploy --only firestore:rules` 완료 (gen-lang-client-0562618804)

---

## 2026-06-09 (6) — Claude Code

### 완료
- **AtMentionInput flex 버그 수정**: `wrapperClassName` prop 추가, 기본값 `w-full`
  - wrapper `div`에 flex-1 적용 안 되는 문제 해결 (className은 inner `<input>`에만 적용됨)
  - DailyReportView MorningForm: `wrapperClassName="flex-1 min-w-0"` + `className="w-full ..."`
  - 업무 항목 2개 이상 추가 시 삭제 버튼 나타나며 input이 찌그러지던 버그 수정
- **CalendarFilter 칩 UI, OnboardingTour** (이전 세션 계속): 빌드 확인 완료

---

## 2026-06-09 (5) — Claude Code

### 완료 & 배포
- **[3-A] 전사 검색 (GlobalSearch)**: Ctrl+K 단축키 + 사이드바/모바일 헤더 버튼
  - salesDb: stores, employees, notices, meetings 통합 검색 (클라이언트 사이드)
  - 결과 타입별 그룹핑, 클릭 시 해당 섹션으로 이동
- **[3-B] @ 태그 + store_mentions**: AtMentionInput 컴포넌트 신규
  - DailyReportView 출근 항목 / MeetingView 안건 제목에 적용
  - 저장 시 salesDb.store_mentions 기록 → StoreListView 우측 패널에 "언급 이력" 섹션
- **배포**: git push → Vercel 자동 배포 (a236476)

### 마스터 플랜 현황
- 1-A, 1-B, 1-C, 2-A~D, 3-A, 3-B 완료. 3-C(AI) 제외 전체 완료.

---

## 2026-06-09 (4) — Claude Code

### 완료
- **[2-D] CompanyCalendar 멀티뷰 구현** (이전 세션 이어받아 완성)
  - TabBar: `달력` 단일 탭 → `전체 / 개인 / 오픈 일정 / 연차 내역 / 루틴` 5탭으로 확장
  - `eventsForDate(ymd, view)`: view별 필터 — open=가맹점 오픈 이벤트만, personal=내 개인 일정만, all=전체+연차+오픈
  - 연차 내역 탭: `else` 블록에서 `activeTab === 'leave'` 명시적 조건으로 분리
  - 오픈 탭 범례: 가맹 오픈 이벤트 색상만 표시, 개인 탭 범례: 개인 이벤트 타입만 표시
  - `franchiseEvents` 로드: `franchise_schedules`의 openDate → CalendarEvent type='franchise' 변환

### 다음 작업
- **[1-A] 매장 상세 패널** — 가맹 스케줄 카드 클릭 시 상세 패널 진입 (미완)

---

## 2026-06-09 (3) — Claude Code

### 완료
- **가독성 모드 구현**: `useReadabilityMode` 훅 + CSS 오버라이드 + 사이드바 하단 `T` 토글 버튼
  - text-stone/slate-400 계열 선명하게, text-[10px]/text-xs 등 확대, localStorage 개인 설정 저장
- **마스터 플랜 수립** (`PLAN_master.md`): 매장 중심 3단계 로드맵
  - 기존 PLAN 4개 흡수/정리. 1단계: 매장상세패널 + 역할별홈 + SV연결
  - 2단계: 사이드바 슬림화 + UI통일. 3단계: 검색·AI 확장

### 다음 작업
- **[1-A] 매장 상세 패널** — `StoreDetailPanel.tsx` 신규, FranchiseScheduleView 카드에서 진입

---

## 2026-06-09 (2) — Claude Code

### 완료
- **PLAN_code_consistency.md Phase 2 완료**
  - [P2-A] FranchiseScheduleView에서 employees 로드 → supervisorId 있으면 이름 표시 (매장 카드 + ScheduleTimeline)
  - [P2-B] TeamSettingsModal 팀원 추가 UI: 자유 텍스트 → employees 드롭다운으로 교체, member.id = Employee.id
- **PLAN_store_master_import.md 전체 구현 완료**
  - `types.ts`: `Store` 인터페이스 추가, `FranchiseSchedule.storeId`, `Employee.crmId` 추가
  - `admin/StoreImportPanel.tsx` 신규: xlsx 파싱 → 미리보기(신규/변경/동일) → 수동 [저장] 버튼 클릭 시 배치 upsert
  - `admin/StoreMappingModal.tsx` 신규: 신규 매장 ↔ 오픈 스케줄 수동 매핑 팝업
  - `admin/EmployeeImportPanel.tsx` 신규: 직원 phone/email/crmId 보강 + supervisorId 자동 연결
  - `AdminPanel.tsx`: [일반 관리] / [데이터 관리] 탭 추가

### 미완
- `PLAN_code_consistency.md` Phase 3 (CalendarEvent linkedId, preTrainingMemo UI) — 우선순위 낮음, 추후

### 주의
- 실제 Firestore 배치 저장은 반드시 미리보기 확인 후 수동 [저장] 버튼 클릭 — 자동 실행 없음
- `MEETING_VIEW_PROPOSAL.md`는 malang-fnb SaaS 설계 문서 (이 레포 구현 아님) — 방치 가능

---

## 2026-06-09 — Claude Code

### 완료
- **제조실 카톡 붙여넣기 버튼 추가** (`FactoryView.tsx`)
  - 헤더에 `MessageCircle` 아이콘 + "카톡 복사" 버튼 추가
  - 형식: `품목명-현재고량` 또는 `품목명-현재고량+생산량` (최근 기록 기준, 생산량>0 시 표시)
  - 미입력 품목은 `품목명-미입력`으로 표시
  - 클립보드 복사 성공 시 "📋 복사됐습니다 — 카톡에 붙여넣기 하세요" 토스트

---

## 2026-06-08 — Claude Code

### 완료
- **제조실 과거 날짜 입력 수정** (`FactoryView.tsx`)
  - `DailyInputModal`: 날짜 변경 시 기존 기록 로드(기존 기록 있으면 덮어쓰기 배너 표시), 없으면 직전 기록 마감재고를 기초재고로 자동 설정
  - `prev` 컨텍스트 힌트·소비량 미리보기를 선택한 날짜 기준으로 수정 (기존엔 현재 최신재고 기준으로 표시되어 오해 유발)
  - **과거 날짜 입력 시 전역 storeCount 덮어쓰기 버그 수정**: `date >= todayYMD()` 조건 추가
  - 추이 탭 각 행에 `Edit2` 수정 버튼 추가 → 클릭 시 해당 날짜로 입력 모달 바로 열림

---

## 2026-06-06 (2차) — Claude Code

### 완료
- **바이저(SV) Employee 연동**: `FranchiseSchedule.supervisorId?: string` 추가. `ScheduleFormModal`·`StoreRegistrationModal`에서 SV 선택 시 `employees` 컬렉션(position=슈퍼바이저) 드롭다운으로 전환. 부서명 표시 + 연동 확인 뱃지. `supervisor: string`(이름)은 하위 호환 유지.
- **권한 경영진 프리셋**: `UserPermissionManager`에 "경영진 프리셋"(전 섹션 view, admin/history/database는 none) + "실무자 초기화"(sectionPermissions 초기화) 버튼 추가.

### 미완/다음
- **나머지 섹션 readOnly 강제**: projects, workmap, employees, sop 등에 `readOnly` prop 추가 미진행 (franchise/sales는 이미 구현됨)
- **바이저 타임라인 표시**: supervisorId 기반 부서 정보를 ScheduleTimeline에서 표시 미진행

---

## 2026-06-06 — Claude Code

### 완료
- **3티어 SOP 아키텍처 구현**
  - `types.ts`: `SopTemplateNode`, `ProjectSopTemplate` 타입 추가 (`salesDb.sop_project_templates` 컬렉션용)
  - `SopView.tsx` 전면 재작성: 상단 탭 "업무 규정 | 프로젝트 SOP" 추가, `TplTreeNode`/`ProjectSopTemplateEditor`/`ProjectSopPanel` 컴포넌트 신규 구현
  - `ProjectsView.tsx`: `MindMapNode`에 `sopId?` 추가, `saveNodes` 화이트리스트 업데이트, 피커를 `sop_project_templates` 기반으로 교체, `handleLoadTemplate` ID 재매핑 로직 포함
- **SopView.tsx 정리**: 이전 세션의 미완 `tab`/`ArrowDown` 잔여물 제거

### 주의
- **Firestore 권한 추가 필요**: `salesDb`에 `sop_project_templates` 컬렉션 규칙 미등록 시 `permission-denied`. 앱에서 저장 실패 시 사용자에게 Firestore 규칙 추가 요청 필요.

---

## 플랜 — 미착수 (우선순위 순)

1. **칸반 도움말 모달** — `?` 버튼 + 기능 시각화 팝업 (칸반 탭 내)

---

## 2026-06-05 (3) — Claude Code

### 완료
- **프로젝트 도식화 → 마인드맵 교체** (`ProjectsView.tsx`)
  - 기존 `ReportTreeDiagram` 기반 도식화 탭을 EdrawMind 스타일 마인드맵으로 전면 교체
  - `MindMapTreeNode` (재귀 CSS 트리) + `ProjectMindMap` 컴포넌트 신규 구현
  - 키보드: Enter=형제 추가, Tab=하위 추가, Del=노드 삭제, F2/더블클릭=편집, Esc=편집 종료
  - 보고서 연결: 선택된 노드에 🔗 버튼 → 프로젝트 보고서 연결·해제 드롭다운
  - 마인드맵 데이터: `salesDb.project_mindmaps/{projectId}` Firestore 저장 (800ms 디바운스)
  - `nodeAction` state + `handleNodeClick` 제거, blur 레이스컨디션 방지 (`skipBlurRef`)

---

## 2026-06-05 (2) — Claude Code

### 완료
- **ProjectsView undefined 방어 처리** (`ProjectsView.tsx`)
  - `project.memberNames`가 구 Firestore 문서에서 `undefined`일 때 크래시 방지
  - `?? []` guard 추가: 상세뷰 멤버 표시(line 1426), 카드 멤버 표시(line 1666), 검색(line 1967)
  - Vercel 최신 배포 확인: `4bc0e1f` (폴더 fix) 이미 프로덕션 반영됨

---

## 2026-06-05 (1) — Claude Code

### 완료
- **회의록 대규모 기능 확장** (`MeetingView.tsx` 전면 재작성)
  - 결정사항 섹션 (중요/보통/참고 중요도 태그), 실행항목 섹션 (체크+담당자+기한), 회의 결론/요약 필드 추가
  - 목록 전문 검색 (제목·안건·결정·요약·참석자), 카카오 공유 (클립보드 복사), 안건 드래그 재정렬 (dnd-kit)
  - 참석자·실행항목 담당자: 직원 목록(`salesDb.employees`) 드롭다운 연동
  - 회의 템플릿 DB 관리 (`salesDb.meeting_templates`), admin 전용 관리 모달
  - `scrub()` 유틸로 undefined 필드 제거 후 Firestore 저장, 체크박스 낙관적 UI 업데이트

### 주의
- `meeting_templates` 컬렉션은 자동 생성됨 (Firestore 규칙에 읽기/쓰기 권한 추가 필요할 수 있음)
- 기존 meetings 데이터와 하위 호환 유지 (decisions/actionItems/summary 없으면 빈 배열로 처리)

---

## 2026-06-04 (4) — Claude Code

### 완료
- **업무 지도 신규 구현** (`WorkMapView.tsx`, `App.tsx`, `types.ts`)
  - 기존 `tasks` 컬렉션 기반 (새 컬렉션 없음), `meetings`(db) 조인으로 회의 출처 표시
  - `Task` 타입에 `progress?: number`, `startDate?: string` 추가
  - 목록 뷰: 담당자별 그룹, 상태 색상(🔴지연/🟠임박/🟢진행/⚫완료), 특이사항 펼침, 인라인 진행률 피커
  - 타임라인 뷰: 주간/월간 전환, 담당자 레인별 Gantt 바, 클릭 편집
  - 업무 등록/수정 모달: 담당자·출처(직접/회의)·기간·진행률·특이사항·상태
  - 완료 토글: 상태 도트 클릭으로 done ↔ in_progress 즉시 전환
  - 필터: 전체/지연/임박/진행중/완료 탭 + 담당자 드롭다운 + 전문 검색
  - 사이드바 운영 섹션 최상단에 "업무 지도" 메뉴 추가

### 주의
- meetings는 `db` (메인DB), tasks/employees는 `salesDb` — 두 DB 동시 쿼리
- Task.assigneeId 는 employee.id 기준 (uid 아님)

---

## 2026-06-04 (3) — Claude Code

### 완료
- **출근 보고 항목별 진행률 설정** (`DailyReportView.tsx`, `types.ts`)
  - `DailyReportItem.progress?: number` 추가
  - `MiniProgressPicker` 컴포넌트: 10칸 세그먼트, 마우스오버 미리보기, 같은 값 클릭 → 0% 리셋
  - 출근 보고 폼: 각 업무 항목 아래에 진행률 피커 표시
  - 수정 모드에서 기존 진행률 복원
  - `ReportCard` 상세 펼침: `[30%]` 뱃지로 진행률 표시
  - 카카오 공유 텍스트: 진행률 있는 항목은 `업무명 [30%]` 형식으로 포함

---

## 2026-06-04 (2) — Claude Code

### 완료
- **프로젝트 진행률 수동 설정** (`ProjectsView.tsx`, `types.ts`)
  - `Project.progress?: number` 추가 (0~100, 10단위)
  - `ProgressPicker` 컴포넌트: 10칸 세그먼트 바, 마우스 오버 미리보기, 클릭으로 설정 (같은 값 클릭 → 0% 리셋)
  - 카드(목록)와 상세 헤더 모두에 표시·설정 가능, 낙관적 UI 업데이트
  - 자동계산(보고서 완료 수) 방식 및 `docStats` 완전 제거

---

## 2026-06-04 — Claude Code

### 완료
- **프로젝트 폴더 계층 구조** 전면 도입 (`ProjectsView.tsx`)
  - 3단계 네비게이션: 폴더목록 → 폴더 내 프로젝트 → 프로젝트 상세(도식화/칸반/간트)
  - 폴더 CRUD (Firestore `salesDb/project_folders`), 색상 6가지, 설명 입력
  - 폴더 순서 변경 (ChevronUp/Down), 프로젝트 순서 변경 (folderOrder 기준)
  - 미분류 버킷 — `folderId` 없는 기존 프로젝트 자동 수용 (마이그레이션 없음)
  - 브레드크럼 네비게이션, 폴더 내 상태 탭 (진행중/전체/보관함), 회의록 패널 유지
  - `types.ts`: `ProjectFolder` 인터페이스, `Project`에 `folderId/folderOrder` 추가
- **보고서 제목 양식 헬퍼** (`ReportView.tsx`)
  - placeholder: `YYYY-MM-DD-보고서명-v1` 형식 안내
  - "날짜 자동입력" 버튼: 오늘 날짜 + `-` 자동 삽입

### 주의
- `project_folders` 컬렉션 신규 (Firestore 규칙 확인 필요)
- 기존 프로젝트 `folderId` 없음 → 미분류로 정상 표시됨

---

## 2026-06-03 — Claude Code

### 완료
- **`useConfirm()` 전면 수정** — 9개 파일 `const confirm` → `const { confirm }` (TypeError 무음 실패 복구)
  - 복구된 기능: 캘린더 삭제, MVC·연혁·OKR·회의록·공지·보고서·프로젝트 항목 삭제
- **MVC Core Values 미표시 버그** — Firestore 문서에 `values` 필드 없을 때 undefined 방어 처리
- **보고서를 팝업 모달로 전환** — 칸반/도식화/간트에서 보고서 열면 fixed 오버레이 모달로 표시
  - 저장·취소·닫기 → `onDismiss` → 자동 원래 뷰 복귀
  - `view='docs'` 탭 전환 방식 완전 제거, `setFocusReportId` 잔여 참조 핫픽스

### 다음에 이어할 것
- **SaaS 프로젝트 (malang-fnb)** 전환
- 인트라넷 잔여: 칸반 도움말 모달 (`?` 버튼)

### 주의
- `useConfirm()`은 `{ confirm }` 객체 반환 — 반드시 비구조화 할당 사용
- Vite는 TypeScript 타입 에러가 있어도 빌드 통과 (esbuild 사용)

---

## 2026-06-02 (14) — Claude Code

### 완료
- **보고서 공유 버튼 2개 제거** — 텍스트 복사(💬), 캡처(📸) 버튼 모두 삭제 (작동 불량)
- **칸반보드 재구성**: 동적 컬럼 시스템 도입
  - 각 카드에 상태 드롭다운(계획 수립/진행중/완료) 추가
  - 컬럼 헤더: 이름 클릭 인라인 편집, 색상 도트 클릭 색상 변경(6색), ← → 순서 이동, × 삭제
  - "+ 컬럼 추가" 버튼으로 자유 추가, 삭제 시 고아 카드는 첫 컬럼으로 이동
  - 기본 컬럼 ID(todo/doing/done) 유지 → 기존 데이터 호환
  - 진행률 = 마지막 컬럼 기준으로 계산

### 미완 / 진행 중
- 없음

### 다음에 이어할 것
- 배포 (git add src/ → commit → push)
- **홈 대시보드 개편** (위젯 선택형) — 최우선 미완 과제

### 주의
- `KanbanColumn` union type은 ProjectItem 하위 호환을 위해 유지, Report는 `string` 타입으로 변경됨
- `docStats`(목록 뷰 진행률)는 여전히 `kanbanColumn === 'done'` 기준 → 기본 컬럼 사용자는 정상 동작

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

## 2026-06-02 (13) — Claude Code

### 완료
- 이번 세션 전체 작업 내역 정리 (아래 11~12 참조)

### 미완 / 진행 중
- salesDb Firestore 보안 규칙 업데이트 — 여전히 미완 (permission-denied 발생 시 우선 처리)

### 다음에 이어할 것
- **홈 대시보드 개편** (위젯 선택형) — 세션 (2)(5)(9)(13) 계속 밀림, 최우선 과제

### 주의
- html2canvas 📸 캡처: CORS 정책상 Firebase Storage 이미지가 캡처에서 빠질 수 있음 (useCORS: true 설정했으나 Storage CORS 헤더 미설정 시 이미지 누락)

---

## 2026-06-02 (12) — Claude Code

### 완료
- **ProjectsView 버그 5종 수정** (커밋 18b02d6에 포함)
  - 헤더·칸반·도식화 "새 보고서" 버튼이 폼을 열지 않던 문제 → openNewReport()로 통일
  - docs 탭에서 focusReportId stale 유지 버그 수정
  - DocLinkPickerModal: 연결 클릭 즉시 로컬 목록에서 제거 (중복 클릭 방지)
  - handleUpdateProject: updateDoc에 id/createdAt 중복 저장 제거
  - 회의록→프로젝트 onSave async/await 누락 수정
- **보고서 양식 통일**: QuickReportModal 제거, 모든 "새 보고서" 진입점을 ReportView로 통일
  - ProjectDetail 헤더/칸반/도식화 버튼 → `openNewReport()` → ReportView 에디터 자동 오픈
  - 도식화 노드 "추가 보고서(형제)" / "다음 보고서(자식)" → parentReportId 전달해 ReportView 에디터 오픈
  - ReportView에 `openNew`, `initialParentReportId`, `onNewOpened` props 추가
- **사진 제한 5장 → 10장** (ReportView.tsx)
- **보고서 캡처 복사**: ReportDetail 상단 📸 버튼 → html2canvas로 전체 뷰 캡처 → 클립보드 이미지 복사
  - 클립보드 쓰기 실패 시 PNG 파일로 자동 저장 (fallback)
- html2canvas 패키지 설치

### 다음에 이어할 것
- git commit + push → Vercel 배포 확인

---

## 2026-06-02 (11) — Claude Code

### 완료
- **프로젝트 화면 개편 1단계 + 2단계** (ProjectsView.tsx)
  - 검색바 추가 (제목·설명·멤버 동시 필터)
  - 탭 구조: [진행중] [전체] [보관함] [시각화] — 보관함 = completed | archived
  - 프로젝트 카드에 [종료] 빠른 액션 (완료 / 아카이브 드롭다운)
  - 보관함 탭 카드에 "진행중으로 복구" 버튼
  - 회의록 통합 패널: 우상단 [회의록] 토글 → 좌측 최근 회의록 카드 리스트
  - 회의록 카드에 [프로젝트로] 버튼 → 회의 제목·안건 자동 채워진 프로젝트 생성 폼

### 다음에 이어할 것
- git commit + push → Vercel 배포 확인
- 홈 대시보드 개편 (위젯 선택형)

---

## 2026-06-02 (10) — Claude Code

### 완료
- 프로젝트 보고서 삭제 버그 수정 (onDataChange 콜백)
- 도식화 마인드맵 인터랙션 (노드 클릭 팝업, 추가 보고서/다음 보고서)
- 문서 연결 피커: 이미 프로젝트 연동된 보고서 제외
- 캘린더 매장오픈 연동 해제 + 일정 수정/삭제 기능
- 퇴근 보고 카톡 공유: 완료/미완료 상태 표시 (`- 완료`, `- 미완료[사유]`)

### 다음 세션 — 프로젝트 화면 개편 (PLAN-PROJECT-UX.md 참고)

---

## PLAN: 프로젝트 화면 개편

### 1. 프로젝트 목록 검색 + 보관함
- 상단 검색바 추가 (제목·설명·멤버 필터)
- 탭 구조 변경: [진행중] [전체] [보관함] [시각화]
  - 보관함 = status: 'completed' | 'archived' 모아서 표시
  - 보관함에서 "다시 진행중으로" 복구 버튼
- 프로젝트 카드에 [종료] 빠른 액션 버튼 추가
  → 클릭 시 완료/아카이브 선택 → 보관함으로 이동

### 2. 회의록 + 프로젝트 통합 뷰
- 프로젝트 화면 상단에 토글: [회의록 + 프로젝트 함께 보기] / [프로젝트만]
- 함께 보기 시 좌우 분할 (모바일: 탭 토글)
  - 좌측: 최근 회의록 카드 리스트
  - 우측: 프로젝트 목록 (기존)
- 회의 카드에 [프로젝트로 만들기] 버튼
  → 회의 제목·내용 자동 채워진 프로젝트 생성 폼
  → 선택 안건을 초기 업무로 가져오기 옵션

### 구현 순서 (권장)
- 1단계: 검색 + 보관함 탭 + 종료 버튼 (ProjectsView.tsx)
- 2단계: 회의록 통합 뷰 + 프로젝트로 만들기 (ProjectsView.tsx + MeetingView 연동)

---

## 2026-06-02 (9) — Claude Code

### 완료
- 프로젝트 보고서 삭제 버그 수정 (커밋 7a09067)
  - **버그 원인**: ReportView 내 삭제/저장이 부모 ProjectDetail의 docs 목록을 갱신하지 않음 (stale state)
  - **수정**: ReportView에 `onDataChange?()` 콜백 추가, handleSave/handleDelete 후 호출
  - **추가**: handleUnlink에 `parentReportId: deleteField()` 누락분 추가
- 도식화 마인드맵 인터랙션 구현
  - 노드 클릭 → NodeActionPopup [보고서 확인 / 보고서 추가]
  - 보고서 추가 → [↔ 추가 보고서(형제) / ↓ 다음 보고서(자식)] 선택
  - QuickReportModal: 도식화 화면 유지한 채 즉시 보고서 작성
  - 노드 디자인: 상태 뱃지 + 내용 미리보기, X버튼 hover 시만 표시

### 다음에 이어할 것
- 홈 대시보드 개편 (위젯 선택형)

---

## 2026-06-02 (8) — Claude Code

### 완료
- 프로젝트 문서탭 보고서 칸반 보드로 전면 재설계 (커밋 ad29e01)
  - ProjectsView: 문서탭을 ProjectItem 링크 방식 → Report 직접 칸반 보드로 전환
  - 칸반 컬럼(할일/진행중/완료) 드래그앤드롭으로 보고서 이동 → kanbanColumn 필드 저장
  - 도식화: parentReportId 기반 트리 (보고서 작성 시 상위 보고서 지정 가능)
  - ReportView: focusReportId prop 추가, 에디터에 '상위 보고서 선택' UI
  - types.ts: Report에 kanbanColumn, parentReportId 필드 추가

### 다음에 이어할 것
- push 후 Vercel 배포 확인
- 홈 대시보드 개편 (위젯 선택형)

---

## 2026-06-02 (7) — Claude Code

### 완료
- 프로젝트 ↔ 보고서 양방향 연동
  - Report 타입에 projectId, projectTitle 추가
  - ReportView: projectId prop 추가 → 해당 프로젝트 보고서만 필터링
  - 프로젝트 내 보고서 작성 시 자동으로 projectId 태깅
  - 결재보고센터 목록/상세에 "📁 프로젝트명" 뱃지 표시
- 프로젝트 상세에 '문서' 탭 추가 (칸반 | 문서 | 도식화)
  - 문서 탭: 프로젝트 전용 ReportView 임베드
  - 기존 보고서 작성 에디터 그대로 사용 (결재 워크플로 포함)
- 업무(Tasks) 문서 연결 탭 추가
- 도식화 트리: 부모항목 + 부서명 + 담당자 표시
- ProjectItem: parentId, assigneeDept 필드 추가

---

## 2026-06-02 (6) — Claude Code

### 완료
- 프로젝트 업무(Tasks) 연결: DocPickerModal에 '업무' 탭 추가 (salesDb > tasks)
- 프로젝트 도식화(마인드맵) 뷰:
  - 칸반 ↔ 도식화 탭 토글
  - ProjectItem에 parentId(부모항목), assigneeDept(부서명) 필드 추가
  - 부모-자식 관계 기반 트리 다이어그램 렌더링
  - 각 노드: 제목 / 부서 / 담당자명 / 진행상태 색상 표시
  - 클릭 시 항목 편집 모달 오픈
- ItemFormModal: 담당자 선택 시 부서 자동입력 + 부모항목 선택 드롭다운
- 부서 목록(salesDb > departments) 자동 로드

### 주의
- 도식화는 parentId가 없는 항목을 루트로 인식 — 기존 항목은 전부 루트로 표시됨
- 부모-자식 관계는 항목 편집에서 수동으로 설정

---

## 2026-06-02 (5) — Claude Code

### 완료
- OKRView.tsx: 분기별 OKR 관리 (목표/KR 추가·수정·삭제, 진행률 자동계산, 이전 분기 이력)
- CompanyInfoView.tsx: 새모양에프엔비 3개 섹션
  - MVC (Mission·Vision·Core Values 편집)
  - 브랜드 연혁 (타임라인 CRUD, 연도별 그룹)
  - 회사 소개서 (섹션별 자유 문서)
- CompanyCalendar에 루틴 탭 추가
  - 매일/매주(요일)/매월(날짜) 반복 루틴 등록·수정·삭제
  - 오늘 해야 할 루틴 체크 기능 (Firestore 완료 기록)
- types.ts: OKRQuarter/OKRObjective/OKRKeyResult, BrandMilestone, MVCDoc, CompanyProfileDoc, CalendarRoutine 추가
- App.tsx: OKRView, CompanyInfoView lazy import + 라우팅 연결

### 다음에 이어할 것
- PROJECTS_PLAN.md 기준 모든 섹션 구현 완료
- 남은 TODO: 홈 대시보드 개편 (위젯 선택형)

---

## 2026-06-02 (4) — Claude Code

### 완료
- 프로젝트 카드 ↔ 기존 문서 연결 기능 (kind='link')
  - 각 칸반 컬럼 하단 "문서 연결" 버튼
  - DocPickerModal: 보고서/회의록/일일보고/주간보고 탭 + 검색
  - 링크 카드: 인디고 좌측 보더 + 문서 유형 뱃지 + 날짜 표시
  - 이미 연결된 문서 중복 방지 (existingLinkedIds 필터)
  - types.ts ProjectItem에 linkedDate 추가

### 다음에 이어할 것
- OKR & KPI 섹션 구현
- 새모양에프엔비 섹션 (MVC, 브랜드 연혁, 회사 소개서)
- 캘린더 루틴 등록 기능

---

## 2026-06-02 (3) — Claude Code

### 완료
- 프로젝트 기능 P2 구현 (ProjectsView.tsx, 약 450줄)
  - 프로젝트 목록: 진행중/전체/시각화 탭, 카드 그리드
  - 프로젝트 생성/수정/삭제 + 멤버 선택, 기간 설정
  - 칸반 보드: 할일/진행중/완료 3컬럼 + dnd-kit 드래그앤드롭
  - 카드: 담당자/요청자/요청맥락/마감일/우선순위 + 편집/삭제
  - types.ts: Project, ProjectItem, KanbanColumn, ProjectItemPriority 등 추가
  - salesDb: projects / project_items 컬렉션 사용

### 다음에 이어할 것
- P3: OKR & KPI 섹션 구현
- P3: 새모양에프엔비 섹션 (MVC, 브랜드 연혁, 회사 소개서) 콘텐츠
- P3: 칸반 카드 ↔ 기존 보고서/회의록 링크 연결 기능 (kind='link')
- 루틴: 캘린더 내 반복 등록 기능 추가

### 주의
- project_items: getDocs + 명시적 리프레시 방식 (onSnapshot 미사용 — b815 방지)
- Firestore 저장 시 scrub() 필수 (undefined 필드 제거)
- 드래그: GripVertical 핸들에만 listeners 적용 (카드 클릭과 충돌 방지)

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
