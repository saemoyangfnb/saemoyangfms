import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface TourStep {
  targetId?: string;
  title: string;
  description: string;
  placement?: 'right' | 'bottom' | 'center';
}

const STEPS: TourStep[] = [
  {
    title: '새모양 가맹관리시스템',
    description: '처음 사용하시나요? 주요 기능을 하나씩 안내해드릴게요. 언제든지 건너뛸 수 있습니다.',
    placement: 'center',
  },
  {
    targetId: 'tour-home-btn',
    title: '홈',
    description: '오늘의 주요 현황, 알림, 빠른 바로가기를 한눈에 확인합니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-search-btn',
    title: '전사 검색 (Ctrl+K)',
    description: '매장명, 직원명, 공지사항, 회의록을 한 번에 통합 검색합니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-group-comm',
    title: '소통',
    description: '공지사항, 회의록, 업무보고, 결재보고센터를 관리합니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-group-work',
    title: '업무',
    description: '프로젝트, OKR, 업무지도, 업무규정(SOP), 제조실이 모여있습니다. 모르는 업무가 있으면 업무규정에서 확인하세요.',
    placement: 'right',
  },
  {
    targetId: 'tour-group-sch',
    title: '일정 & 인원',
    description: '개인·팀 일정을 캘린더로 관리하고, 팀원 명부와 매장 현황을 확인합니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-brands',
    title: '브랜드별 원가 계산',
    description: '브랜드를 선택하면 원가 계산기, 매출 현황, 가맹점 관제 기능을 사용할 수 있습니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-theme-btn',
    title: '테마 · 설정',
    description: '다크/라이트 모드 전환, 비밀번호 변경, 로그아웃 버튼이 있습니다.',
    placement: 'right',
  },
  {
    targetId: 'tour-guide-btn',
    title: '기능 가이드',
    description: '이 버튼을 누르면 언제든지 이 가이드를 다시 볼 수 있습니다.',
    placement: 'right',
  },
];

const PAD = 8;

interface Props {
  onClose: () => void;
}

export function OnboardingTour({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const current = STEPS[step];

  useEffect(() => {
    if (!current.targetId) { setRect(null); return; }
    const timer = setTimeout(() => {
      const el = document.getElementById(current.targetId!);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [step]);

  const isLast = step === STEPS.length - 1;

  const tooltipStyle = (): React.CSSProperties => {
    if (!rect || current.placement === 'center') {
      return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (current.placement === 'right') {
      const left = rect.right + 16;
      const top = Math.max(8, Math.min(rect.top + rect.height / 2 - 90, window.innerHeight - 240));
      if (left + 295 > window.innerWidth) {
        return { position: 'fixed', top, right: window.innerWidth - rect.left + 16 };
      }
      return { position: 'fixed', top, left };
    }
    return {
      position: 'fixed',
      top: rect.bottom + 12,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
    };
  };

  const finish = () => {
    localStorage.setItem('dalbitgo_tour_seen', '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200]" style={{ pointerEvents: 'none' }}>
      {rect ? (
        /* 스포트라이트 */
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            borderRadius: 8,
            border: '2px solid rgba(255,255,255,0.45)',
            zIndex: 201,
            pointerEvents: 'none',
            transition: 'all 0.25s ease',
          }}
        />
      ) : (
        /* 전체 어두운 배경 */
        <div
          className="fixed inset-0 bg-black/65"
          style={{ zIndex: 201, pointerEvents: 'all' }}
          onClick={finish}
        />
      )}

      {/* 툴팁 */}
      <div
        className="absolute w-72 bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 p-5"
        style={{ ...tooltipStyle(), zIndex: 202, pointerEvents: 'all' }}
      >
        {/* 진행 점 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full bg-stone-800 dark:bg-stone-200 transition-all duration-300 ${i === step ? 'w-4' : 'w-1.5 opacity-25'}`}
              />
            ))}
          </div>
          <button onClick={finish} className="p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-sm transition-colors">
            <X size={14} />
          </button>
        </div>

        <h3 className="text-sm font-black text-stone-900 dark:text-stone-100 mb-1.5">{current.title}</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mb-4">{current.description}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-0 flex items-center gap-0.5 transition-opacity"
          >
            <ChevronLeft size={13} /> 이전
          </button>
          <button
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
            className="flex items-center gap-1 px-4 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold rounded-lg hover:opacity-80 transition-opacity"
          >
            {isLast ? '완료' : '다음'}{!isLast && <ChevronRight size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
