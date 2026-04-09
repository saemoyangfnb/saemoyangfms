import React, { useMemo } from 'react';
import { FranchiseSchedule } from '../../types';
import { diffDays, addDays } from '../../utils';

interface Props {
  schedules: FranchiseSchedule[];
  viewStartDate: string;
  viewEndDate: string;
}

const LABEL_WIDTH = 200; // px
const DAY_WIDTH = 32;    // px per day

const PHASES = [
  { key: 'construction', startKey: 'constructionStart', endKey: 'constructionEnd', label: '인테리어 공사', color: 'bg-amber-400 border-amber-500 text-amber-900' },
  { key: 'pretraining',  startKey: 'preTrainingStart',  endKey: 'preTrainingEnd',  label: '사전교육',    color: 'bg-emerald-400 border-emerald-500 text-emerald-900' },
  { key: 'training',     startKey: 'trainingStart',     endKey: 'trainingEnd',     label: '본교육',      color: 'bg-blue-400 border-blue-500 text-blue-900' },
] as const;

export function ScheduleTimeline({ schedules, viewStartDate, viewEndDate }: Props) {
  const totalDays = useMemo(() => Math.max(diffDays(viewStartDate, viewEndDate) + 1, 1), [viewStartDate, viewEndDate]);
  const timelineWidth = totalDays * DAY_WIDTH;

  const daysArray = useMemo(() =>
    Array.from({ length: totalDays }).map((_, i) => addDays(viewStartDate, i)),
    [viewStartDate, totalDays]
  );

  const today = new Date().toISOString().split('T')[0];
  const todayIdx = daysArray.indexOf(today);

  // ★ 핵심: 모든 행에서 동일한 공식으로 px 위치를 계산
  const dateToX = (dateStr: string): number => {
    const clamped = dateStr < viewStartDate ? viewStartDate : dateStr > viewEndDate ? viewEndDate : dateStr;
    return diffDays(viewStartDate, clamped) * DAY_WIDTH;
  };

  if (totalDays <= 0) return <div className="p-4 text-center text-slate-400">날짜 범위를 확인해 주세요.</div>;

  return (
    <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">

      {/* ──── 헤더: 날짜 레이블 ──── */}
      <div className="flex sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 select-none">
        {/* 좌측 고정 */}
        <div
          className="shrink-0 sticky left-0 z-30 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex items-center px-3 py-2 font-semibold text-xs text-slate-500"
          style={{ width: LABEL_WIDTH }}
        >
          매장명
        </div>

        {/* 날짜 셀들 */}
        <div className="flex" style={{ width: timelineWidth, flexShrink: 0 }}>
          {daysArray.map((day) => {
            const d = new Date(day + 'T00:00:00');
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isFirst = d.getDate() === 1;
            return (
              <div
                key={day}
                className={`flex-shrink-0 relative border-r border-slate-200 dark:border-slate-700 flex flex-col items-center justify-end pb-1 pt-3 text-[10px]
                  ${isWeekend ? 'bg-rose-50 dark:bg-rose-900/10 text-rose-400' : 'text-slate-400'}`}
                style={{ width: DAY_WIDTH }}
              >
                {isFirst && (
                  <span className="absolute top-1 left-0.5 font-bold text-[9px] text-slate-700 dark:text-slate-300 whitespace-nowrap leading-none">
                    {d.getMonth() + 1}월
                  </span>
                )}
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </div>

      {/* ──── 바디: 매장 행들 ──── */}
      {schedules.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">등록된 일정이 없습니다.</div>
      ) : (
        schedules.map((schedule) => (
          <div
            key={schedule.id}
            className="flex border-b border-slate-100 dark:border-slate-800 last:border-0"
          >
            {/* 좌측 고정 라벨 */}
            <div
              className="shrink-0 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-col justify-center"
              style={{ width: LABEL_WIDTH, minHeight: 64 }}
            >
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{schedule.storeName}</span>
              {(schedule.team || schedule.supervisor) && (
                <span className="text-[10px] text-slate-400 mt-0.5">
                  {schedule.team}{schedule.supervisor ? ` / ${schedule.supervisor}` : ''}
                </span>
              )}
            </div>

            {/*
              ★ 핵심 수정: 각 행이 독립된 position:relative 컨테이너를 가짐
              - 배경 격자와 공정 막대 모두 이 컨테이너 기준으로 절대 위치 계산
              - CSS Grid의 implicit placement 문제를 완전히 회피
            */}
            <div
              className="relative"
              style={{ width: timelineWidth, minHeight: 64, flexShrink: 0 }}
            >
              {/* 배경 격자 (날짜 구분선 + 주말 음영) */}
              <div className="absolute inset-0 flex pointer-events-none">
                {daysArray.map((day) => {
                  const d = new Date(day + 'T00:00:00');
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={day}
                      className={`h-full border-r border-slate-100 dark:border-slate-800 flex-shrink-0
                        ${isWeekend ? 'bg-rose-50/40 dark:bg-rose-900/5' : ''}`}
                      style={{ width: DAY_WIDTH }}
                    />
                  );
                })}
              </div>

              {/* 오늘 세로 기준선 */}
              {todayIdx >= 0 && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{
                    left: todayIdx * DAY_WIDTH + Math.floor(DAY_WIDTH / 2),
                    width: 2,
                    background: 'rgba(239,68,68,0.6)',
                  }}
                />
              )}

              {/* 공정 막대 — 동일 컨테이너 안에서 절대 위치 */}
              {PHASES.map((phase, phaseIdx) => {
                const schedAny = schedule as unknown as Record<string, string>;
                const start = schedAny[phase.startKey];
                const end   = schedAny[phase.endKey];
                if (!start || !end) return null;
                if (start > viewEndDate || end < viewStartDate) return null;

                const x  = dateToX(start);
                const x2 = dateToX(end) + DAY_WIDTH;
                const w  = x2 - x;
                if (w <= 2) return null;

                // 막대가 여러 개일 때 수직으로 겹치지 않도록 y 위치를 다르게
                const topOffset = 8 + phaseIdx * 0; // 현재는 모두 top:8, 필요시 별도 y 설정 가능

                return (
                  <div
                    key={phase.key}
                    className={`absolute h-8 rounded border text-[10px] font-bold flex items-center px-2 overflow-hidden shadow-sm ${phase.color}`}
                    style={{ left: x, width: w - 2, top: topOffset }}
                    title={`${phase.label}: ${start} ~ ${end}`}
                  >
                    {w > 44 && <span className="truncate">{phase.label}</span>}
                  </div>
                );
              })}

              {/* 커스텀 공정 막대 (장기/단기) */}
              {(schedule.customPhases || []).map((cp) => {
                 const start = cp.startDate;
                 const end = cp.endDate || cp.startDate;
                 if (!start || !end) return null;
                 if (start > viewEndDate || end < viewStartDate) return null;

                 const x  = dateToX(start);
                 const x2 = dateToX(end) + DAY_WIDTH;
                 const w  = x2 - x;
                 if (w <= 2) return null;
                 
                 const isShort = cp.type === '단기';
                 const bg = isShort ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700';
                 
                 return (
                   <div
                     key={cp.id}
                     className={`absolute h-8 rounded border text-[10px] font-bold flex items-center px-2 overflow-hidden shadow-sm ${bg} ${isShort ? 'z-20 border-2' : 'z-10'}`}
                     style={{ left: x, width: w - 2, top: 8 }}
                     title={`${cp.name}: ${start} ${isShort ? '' : '~ ' + end}\n${cp.notes ? '메모: ' + cp.notes : ''}`}
                   >
                     {w > 44 && <span className="truncate">📌 {cp.name}</span>}
                   </div>
                 );
              })}

              {/* 오픈일 핀 🎉 */}
              {schedule.openDate &&
                schedule.openDate >= viewStartDate &&
                schedule.openDate <= viewEndDate && (
                <div
                  className="absolute top-1 z-10 w-6 h-6 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-[11px] shadow-md cursor-help"
                  style={{ left: dateToX(schedule.openDate) + Math.floor(DAY_WIDTH / 2) - 12 }}
                  title={`그랜드 오픈: ${schedule.openDate}`}
                >
                  🎉
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
