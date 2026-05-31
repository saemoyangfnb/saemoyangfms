import React, { useState, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, updateDoc, addDoc, query,
  orderBy, arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { DailyReport, DailyReportItem, DailyItemStatus, DailyComment, User } from '../types';
import { useToast } from './Toast';
import { ThumbsUp, MessageCircle, Send, ChevronLeft, ChevronRight, X, CheckCircle, XCircle, Clock } from 'lucide-react';

/* ── 상수 ─────────────────────────────────────────────── */
const STATUS_ICON: Record<DailyItemStatus, React.ReactNode> = {
  pending:    <Clock size={12} className="text-amber-400 shrink-0" />,
  done:       <CheckCircle size={12} className="text-emerald-500 shrink-0" />,
  incomplete: <XCircle size={12} className="text-red-400 shrink-0" />,
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

/* ── 이미지 라이트박스 ────────────────────────────────── */
function Lightbox({ urls, initial, onClose }: { urls: string[]; initial: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initial);
  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={24} /></button>
      <button onClick={e => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }} disabled={idx === 0}
        className="absolute left-4 text-white/70 hover:text-white disabled:opacity-20 p-2">
        <ChevronLeft size={28} />
      </button>
      <img src={urls[idx]} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
      <button onClick={e => { e.stopPropagation(); setIdx(i => Math.min(urls.length - 1, i + 1)); }} disabled={idx === urls.length - 1}
        className="absolute right-4 text-white/70 hover:text-white disabled:opacity-20 p-2">
        <ChevronRight size={28} />
      </button>
      {urls.length > 1 && (
        <div className="absolute bottom-6 flex gap-1.5">
          {urls.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white' : 'bg-white/30'}`} />)}
        </div>
      )}
    </div>
  );
}

/* ── 사진 캐러셀 ─────────────────────────────────────── */
function PhotoCarousel({ urls }: { urls: string[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (!urls.length) return null;
  return (
    <>
      <div className="relative -mx-5 mb-3 overflow-hidden">
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
          {urls.map((url, i) => (
            <div key={i} className="snap-start flex-shrink-0 w-full">
              <img
                src={url} alt=""
                className="w-full aspect-[4/3] object-cover cursor-zoom-in"
                onClick={() => setLightbox(i)}
              />
            </div>
          ))}
        </div>
        {urls.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {urls.map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/70" />
            ))}
          </div>
        )}
      </div>
      {lightbox !== null && <Lightbox urls={urls} initial={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/* ── 댓글 섹션 (지연 로딩) ───────────────────────────── */
function CommentSection({ reportId, commentCount, myId, myName }: {
  reportId: string;
  commentCount: number;
  myId: string;
  myName: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<DailyComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (loaded) { setOpen(true); return; }
    try {
      const snap = await getDocs(
        query(collection(salesDb, 'daily_reports', reportId, 'comments'), orderBy('createdAt'))
      );
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyComment)));
      setLoaded(true);
      setOpen(true);
    } catch { toast.error('댓글 로드 실패'); }
  };

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const comment: Omit<DailyComment, 'id'> = { reportId, authorId: myId, authorName: myName, text: text.trim(), createdAt: now };
      const ref = await addDoc(collection(salesDb, 'daily_reports', reportId, 'comments'), comment);
      setComments(p => [...p, { id: ref.id, ...comment }]);
      // 댓글 수 캐시 증가
      await updateDoc(doc(salesDb, 'daily_reports', reportId), { commentCount: increment(1) });
      setText('');
    } catch { toast.error('댓글 저장 실패'); }
    finally { setSubmitting(false); }
  };

  const count = loaded ? comments.length : commentCount;

  return (
    <div>
      <button onClick={() => open ? setOpen(false) : load()}
        className="flex items-center gap-1 text-[11px] font-bold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors">
        <MessageCircle size={13} />
        댓글 {count > 0 ? count : '달기'}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-black text-stone-600 dark:text-stone-300 shrink-0">
                {c.authorName.slice(0, 1)}
              </div>
              <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 mb-0.5">{c.authorName}</p>
                <p className="text-xs text-stone-800 dark:text-stone-200">{c.text}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-black text-stone-600 dark:text-stone-300 shrink-0">
              {myName.slice(0, 1)}
            </div>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
              placeholder="댓글 입력... (Enter로 전송)"
              className="flex-1 px-3 py-1.5 text-xs bg-stone-100 dark:bg-stone-800 rounded-full outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 dark:text-stone-100"
            />
            <button onClick={submit} disabled={!text.trim() || submitting}
              className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-30 transition-colors">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 피드 카드 ────────────────────────────────────────── */
function FeedCard({ report, myId, myName }: { report: DailyReport; myId: string; myName: string }) {
  const toast = useToast();
  const hasReacted = (report.reactions ?? []).includes(myId);
  const reactionCount = (report.reactions ?? []).length;

  const toggleReaction = async () => {
    try {
      await updateDoc(doc(salesDb, 'daily_reports', report.id), {
        reactions: hasReacted ? arrayRemove(myId) : arrayUnion(myId),
      });
    } catch { toast.error('처리 실패'); }
  };

  const typeLabel = report.type === 'morning' ? '오전 보고' : '퇴근 보고';
  const typeCls = report.type === 'morning'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400';

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="w-9 h-9 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-sm font-black text-stone-700 dark:text-stone-300 shrink-0">
          {report.employeeName.slice(0, 1)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-black text-stone-900 dark:text-stone-100">{report.employeeName}</p>
          <p className="text-[10px] text-stone-400">{fmtTime(report.submittedAt)}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeCls}`}>{typeLabel}</span>
      </div>

      {/* 사진 캐러셀 */}
      {(report.photoUrls ?? []).length > 0 && (
        <div className="px-5">
          <PhotoCarousel urls={report.photoUrls!} />
        </div>
      )}

      {/* 업무 목록 */}
      <div className="px-5 pb-3 space-y-1.5">
        {report.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-stone-400 font-bold w-4 shrink-0 text-right">{i + 1}.</span>
            {STATUS_ICON[it.status]}
            <span className={`text-sm flex-1 ${it.status === 'done' ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'} font-semibold`}>
              {it.text}
            </span>
          </div>
        ))}
      </div>

      {/* 리액션 + 댓글 */}
      <div className="px-5 py-3 border-t border-stone-100 dark:border-stone-800 flex items-center gap-4">
        <button
          onClick={toggleReaction}
          className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${hasReacted ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'}`}
        >
          <ThumbsUp size={13} className={hasReacted ? 'fill-current' : ''} />
          확인{reactionCount > 0 && ` ${reactionCount}`}
        </button>
        <CommentSection
          reportId={report.id}
          commentCount={report.commentCount ?? 0}
          myId={myId}
          myName={myName}
        />
      </div>
    </div>
  );
}

/* ── 피드 메인 ────────────────────────────────────────── */
interface Props {
  reports: DailyReport[];
  myId: string;
  myName: string;
  onRefresh: () => void;
}

export function FeedView({ reports, myId, myName, onRefresh }: Props) {
  // 최신 순 정렬 (morning/evening 통합)
  const sorted = [...reports].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <MessageCircle size={40} className="mb-3 opacity-20" />
        <p className="text-sm font-semibold">오늘 제출된 보고가 없습니다</p>
        <p className="text-xs mt-1">아침에 오전 업무보고를 제출해보세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {sorted.map(report => (
        <FeedCard key={report.id} report={report} myId={myId} myName={myName} />
      ))}
    </div>
  );
}
