import React, { useEffect, useState } from 'react';
import { salesDb } from '../../firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import {
  FranchiseSchedule, Store, Employee, Department, DepartmentTask,
} from '../../types';
import { ProcessSettings } from '../franchise/ProcessMasterModal';
import {
  X, ChevronRight, MapPin, User, Phone, Building2,
  CheckCircle2, Clock, AlertCircle, CalendarDays, History,
  Layers, ClipboardList,
} from 'lucide-react';

interface Props {
  schedule: FranchiseSchedule;
  allSchedules: FranchiseSchedule[];
  employees: Employee[];
  departments: Department[];
  processSettings: ProcessSettings;
  isReadOnly: boolean;
  onClose: () => void;
  onOpenChecklist: () => void;
  onEdit: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  '운영중': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  '준비중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '폐점':  'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5 border-b border-stone-100 dark:border-stone-800 last:border-0">
      <span className="text-xs font-bold text-stone-400 dark:text-stone-500 shrink-0 tracking-wide">{label}</span>
      <span className="text-xs font-bold text-stone-800 dark:text-stone-200 text-right">{value}</span>
    </div>
  );
}

export function StoreDetailPanel({
  schedule, allSchedules, employees, departments,
  processSettings, isReadOnly, onClose, onOpenChecklist, onEdit,
}: Props) {
  const [store, setStore] = useState<Store | null>(null);
  const [deptTasks, setDeptTasks] = useState<DepartmentTask[]>([]);
  const [loadingStore, setLoadingStore] = useState(false);

  // 매장 마스터 + 부서 태스크 로드 (패널 열릴 때 1회)
  useEffect(() => {
    let cancelled = false;
    setLoadingStore(true);

    const loadStore = schedule.storeId
      ? getDoc(doc(salesDb, 'stores', schedule.storeId)).then(snap => {
          if (cancelled || !snap.exists()) return;
          const data = { id: snap.id, ...snap.data() } as Store;
          // 이름 불일치 안전장치: FC다움 storeId와 Excel 관리번호 충돌 시 잘못된 매장 표시 방지
          const schName = (schedule.storeName ?? '').trim();
          const stoName = (data.name ?? '').trim();
          if (schName && stoName && !schName.includes(stoName) && !stoName.includes(schName)) return;
          setStore(data);
        })
      : Promise.resolve();

    const loadTasks = getDocs(
      query(collection(salesDb, 'department_tasks'), where('scheduleId', '==', schedule.id))
    ).then(snap => {
      if (!cancelled) setDeptTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentTask)));
    });

    Promise.all([loadStore, loadTasks]).finally(() => { if (!cancelled) setLoadingStore(false); });
    return () => { cancelled = true; };
  }, [schedule.id, schedule.storeId]);

  // SV 표시
  const svEmp = schedule.supervisorId ? employees.find(e => e.id === schedule.supervisorId) : null;
  const svDept = svEmp ? departments.find(d => d.id === svEmp.departmentId) : null;
  const svLabel = svEmp
    ? `${svEmp.name}${svDept ? ` (${svDept.name})` : ''}`
    : schedule.supervisor || '미배정';

  // 체크리스트 진행률
  const checkItems = (processSettings.masterItems || []).filter(i => !i.isArchived && i.category === 'checklist');
  const totalCheck = checkItems.length;
  const doneCheck = checkItems.filter(i => ((schedule.checklistData as any)?.[i.id]?.status ?? 0) >= 3).length;
  const pct = totalCheck > 0 ? Math.round((doneCheck / totalCheck) * 100) : 0;

  // 미처리 부서 태스크
  const pendingTasks = deptTasks.filter(t => t.status === 'pending' || t.status === 'blocked');

  // 오픈 이력 (같은 storeId의 archived 스케줄)
  const history = schedule.storeId
    ? allSchedules.filter(s => s.storeId === schedule.storeId && s.id !== schedule.id && s.archived)
        .sort((a, b) => (b.openDate || '').localeCompare(a.openDate || ''))
    : [];

  // 주요 일정 (schedule_date 항목)
  const dateItems = (processSettings.masterItems || [])
    .filter(i => i.category === 'schedule_date' && !i.isArchived && i.scheduleField)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const schedAny = schedule as unknown as Record<string, string>;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* 패널 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#FDFBF7] dark:bg-stone-950 shadow-2xl z-50 flex flex-col border-l-2 border-stone-800 dark:border-stone-600 overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-900 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 bg-${schedule.colorCode || 'slate'}-500`} />
              <h2 className="text-lg font-black tracking-tight text-stone-900 dark:text-white truncate">{schedule.storeName}</h2>
              {schedule.storeNumber && (
                <span className="text-xs font-bold text-stone-500 border border-stone-300 dark:border-stone-700 px-1.5 py-0.5 rounded-sm shrink-0">
                  {schedule.storeNumber}
                </span>
              )}
              {schedule.archived && (
                <span className="text-xs font-bold text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-sm">오픈완료</span>
              )}
            </div>
            <p className="text-xs text-stone-500 font-bold mt-0.5 ml-4">{schedule.team || '팀 미정'} · {svLabel}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {!isReadOnly && (
              <button
                onClick={onEdit}
                className="text-xs px-2.5 py-1.5 font-bold border border-stone-300 dark:border-stone-700 rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-700 dark:text-stone-300"
              >
                수정
              </button>
            )}
            <button
              onClick={onOpenChecklist}
              className="text-xs px-2.5 py-1.5 font-black border border-stone-800 dark:border-stone-400 rounded-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-900 dark:text-stone-100 flex items-center gap-1"
            >
              <ClipboardList size={12} /> 체크리스트
            </button>
            <button onClick={onClose} className="p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* 체크리스트 진행률 */}
          <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-stone-700 dark:text-stone-300 tracking-widest flex items-center gap-1.5">
                <CheckCircle2 size={13} /> 체크리스트 진행률
              </span>
              <span className="text-sm font-black text-stone-900 dark:text-stone-100">{doneCheck}/{totalCheck}</span>
            </div>
            <div className="h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-stone-400 font-bold">완료 {pct}%</span>
              {pendingTasks.length > 0 && (
                <span className="text-[10px] font-bold text-rose-600 flex items-center gap-0.5">
                  <AlertCircle size={10} /> 미처리 태스크 {pendingTasks.length}건
                </span>
              )}
            </div>
          </div>

          {/* 주요 일정 */}
          <div>
            <h3 className="text-[11px] font-black text-stone-400 dark:text-stone-500 tracking-widest mb-2 flex items-center gap-1.5">
              <CalendarDays size={12} /> 주요 일정
            </h3>
            <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 px-4 py-2 divide-y divide-stone-100 dark:divide-stone-800">
              {/* 공사 기간 고정 */}
              {(schedule.constructionStart || schedule.constructionEnd) && (
                <Row label="공사 기간" value={`${schedule.constructionStart || '-'} ~ ${schedule.constructionEnd || '-'}`} />
              )}
              {dateItems.map(item => {
                const val = schedAny[item.scheduleField!];
                const endField = item.scheduleField!.replace('Start', 'End').replace('In', 'End');
                const endVal = schedAny[endField];
                if (!val && !endVal) return null;
                const display = endVal && endVal !== val ? `${val} ~ ${endVal}` : val;
                const isOpen = item.scheduleField === 'openDate';
                return (
                  <div key={item.id} className={`flex justify-between items-baseline gap-4 py-1.5 ${isOpen ? 'border-t-2 border-stone-800 dark:border-stone-500 mt-1 pt-2' : ''}`}>
                    <span className="text-xs font-bold text-stone-400 dark:text-stone-500 shrink-0 tracking-wide">{item.text}</span>
                    <span className={`font-black text-right ${isOpen ? 'text-rose-700 dark:text-rose-400 text-base' : 'text-xs text-stone-800 dark:text-stone-200'}`}>
                      {display || '-'}
                    </span>
                  </div>
                );
              })}
              {dateItems.length === 0 && !schedule.constructionStart && (
                <p className="text-xs text-stone-400 py-2">일정 정보 없음</p>
              )}
            </div>
          </div>

          {/* 미처리 부서 태스크 */}
          {pendingTasks.length > 0 && (
            <div>
              <h3 className="text-[11px] font-black text-stone-400 dark:text-stone-500 tracking-widest mb-2 flex items-center gap-1.5">
                <Clock size={12} /> 미처리 태스크
              </h3>
              <div className="space-y-1.5">
                {pendingTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 px-3 py-2">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300 truncate">{t.title}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                      t.status === 'blocked'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {t.status === 'blocked' ? '차단' : '미완료'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 오픈 이력 */}
          {(history.length > 0 || !schedule.storeId) && (
            <div>
              <h3 className="text-[11px] font-black text-stone-400 dark:text-stone-500 tracking-widest mb-2 flex items-center gap-1.5">
                <History size={12} /> 오픈 이력
              </h3>
              {!schedule.storeId ? (
                <p className="text-xs text-stone-400 font-bold bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                  매장 마스터 미연결 — 데이터 관리에서 연결하세요
                </p>
              ) : history.length === 0 ? (
                <p className="text-xs text-stone-400 font-bold bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                  이전 오픈 이력 없음
                </p>
              ) : (
                <div className="space-y-1.5">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 px-3 py-2">
                      <div>
                        <span className="text-xs font-black text-stone-700 dark:text-stone-300">{h.openDate || '-'}</span>
                        <span className="text-[10px] text-stone-400 font-bold ml-2">{h.storeNumber || ''}</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">완료</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 매장 마스터 (CRM) */}
          <div>
            <h3 className="text-[11px] font-black text-stone-400 dark:text-stone-500 tracking-widest mb-2 flex items-center gap-1.5">
              <Building2 size={12} /> 매장 정보 (CRM)
            </h3>
            {loadingStore ? (
              <div className="text-xs text-stone-400 font-bold px-3 py-2">불러오는 중...</div>
            ) : !store ? (
              <p className="text-xs text-stone-400 font-bold bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                {schedule.storeId ? '매장 마스터 데이터 없음' : '매장 마스터 미연결'}
              </p>
            ) : (
              <div className="bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 px-4 py-2">
                <Row label="운영상태" value={store.status} />
                <Row label="가맹 구분" value={store.franchiseType} />
                <Row label="계약상태" value={store.contractStatus} />
                <Row label="개점일" value={store.openDate} />
                <Row label="지역" value={store.region} />
                <Row label="주소" value={store.address} />
                <Row label="대표자" value={store.ceoName} />
                <Row label="운영자" value={store.operatorName} />
                <Row label="전화" value={store.phone || store.mobile} />
                <Row label="이메일" value={store.email} />
                <Row label="좌석수" value={store.seatCount ? `${store.seatCount}석` : null} />
                <Row label="매장코드" value={store.storeCode} />
              </div>
            )}
          </div>

          {/* 특이사항 */}
          {schedule.notes && (
            <div>
              <h3 className="text-[11px] font-black text-stone-400 dark:text-stone-500 tracking-widest mb-2">특이사항</h3>
              <p className="text-xs font-bold text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-900 rounded-sm border border-stone-200 dark:border-stone-700 px-3 py-2 whitespace-pre-wrap">
                {schedule.notes}
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
