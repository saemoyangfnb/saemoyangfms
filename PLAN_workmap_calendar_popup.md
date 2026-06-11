# PLAN: 업무지도 캘린더 날짜 클릭 팝업

작성: 2026-06-11  
우선순위: 중간 (UX 향상)  
대상 파일: `src/components/WorkMapView.tsx`

---

## 목표

캘린더 탭에서 날짜 셀을 클릭하면 해당 날짜의 **업무 마감 목록**과 **업무보고 목록**을 팝업으로 표시.  
현재는 업무 칩 클릭 시 수정 모달만 열리고, 날짜 전체 클릭 기능이 없음.

---

## 구현 계획

### 1. 상태 추가 (`WorkMapView`)

```typescript
const [dayPopup, setDayPopup] = useState<{
  date: string;           // YYYY-MM-DD
  tasks: Task[];
  reports: DailyReport[];
} | null>(null);
```

### 2. 캘린더 셀에 클릭 핸들러 추가 (`CalendarTab`)

- 날짜 셀 전체를 클릭 가능한 버튼으로 감싸기
- `onDayClick(dateStr, dayTasks, dayReports)` 콜백으로 팝업 데이터 전달
- 기존 업무 칩 클릭(`onClickTask`)은 그대로 유지 — 셀 클릭과 별개로 동작

### 3. `DayDetailPopup` 컴포넌트 신규 작성

```
DayDetailPopup
├── 헤더: "6월 15일 (일)" + X 닫기
├── 섹션 1 — 업무보고 (있을 때만)
│   └── 아침/저녁 칩 + 이름 + 업무 항목 수
├── 섹션 2 — 업무 마감 (있을 때만)
│   └── 상태 도트 + 업무명 + 담당자 + D-day
│       클릭 시 → 업무 수정 모달 열기
└── 둘 다 없으면: "등록된 내용이 없습니다"
```

**스타일**: `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4`  
**크기**: `max-w-sm`, 스크롤 가능 (`max-h-[70vh] overflow-y-auto`)

### 4. 변경 범위

| 위치 | 변경 내용 |
|------|-----------|
| `CalendarTab` props | `onDayClick` 콜백 추가 |
| `CalendarTab` 렌더링 | 셀을 `<button>` 또는 `<div onClick>` 으로 변경 |
| `DayDetailPopup` | 신규 컴포넌트 추가 (~60줄) |
| `WorkMapView` state | `dayPopup` 상태 추가 |
| `WorkMapView` 렌더링 | `DayDetailPopup` 조건부 렌더 |

---

## 주의사항

- `useToast()` 패턴: `const toast = useToast()` (구조분해 금지)
- 업무 칩 클릭과 날짜 셀 클릭 이벤트 버블링 방지 (`e.stopPropagation()`)
- 팝업 안 업무 클릭 → 팝업 닫고 수정 모달 열기
- 업무보고는 읽기 전용 표시 (수정은 업무보고 메뉴에서)
