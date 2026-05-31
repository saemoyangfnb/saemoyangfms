import React, { useState, useEffect, useCallback, useRef } from 'react';
import { salesDb, storage } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { User, Report, ReportSection, ReportType, ApprovalStatus } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, X, ChevronLeft, ChevronRight, Camera, Trash2,
  CheckCircle, XCircle, Clock, Send, Edit2, RefreshCw,
  FileText, AlignLeft, Image as ImageIcon,
} from 'lucide-react';

/* ── 상수 ─────────────────────────────────────────────── */
const TYPES: ReportType[] = ['일반', '제안', '보고', '기타'];

const TYPE_CLS: Record<ReportType, string> = {
  '일반':  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  '제안':  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '보고':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  '회의록':'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '기타':  'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
};

const APPROVAL_CONFIG: Record<ApprovalStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  draft:    { label: '임시저장', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400', icon: <Clock size={10} /> },
  pending:  { label: '결재 대기', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <Clock size={10} /> },
  approved: { label: '승인',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle size={10} /> },
  rejected: { label: '반려',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle size={10} /> },
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const genId = () => `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/* ── 이미지 압축 ────────────────────────────────────────── */
async function compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => resolve(b!), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

/* ── 사진 캐러셀 ────────────────────────────────────────── */
function PhotoCarousel({ urls, small }: { urls: string[]; small?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  if (!urls.length) return null;

  const prev = (e?: React.MouseEvent) => { e?.stopPropagation(); setIdx(i => Math.max(0, i - 1)); };
  const next = (e?: React.MouseEvent) => { e?.stopPropagation(); setIdx(i => Math.min(urls.length - 1, i + 1)); };

  const imgCls = small
    ? 'w-full h-28 object-cover'
    : 'w-full max-h-52 object-cover';

  return (
    <>
      <div className="relative overflow-hidden bg-stone-100 dark:bg-stone-800">
        <img
          src={urls[idx]}
          alt=""
          onClick={() => !small && setLightbox(true)}
          className={`${imgCls} ${!small ? 'cursor-zoom-in' : ''}`}
        />
        {urls.length > 1 && (
          <>
            <button onClick={prev} disabled={idx === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-opacity">
              <ChevronLeft size={18} />
            </button>
            <button onClick={next} disabled={idx === urls.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white disabled:opacity-0 transition-opacity">
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {urls.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white scale-125' : 'bg-white/50'}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 라이트박스 — 현재 인덱스 이미지만 표시, 좌우 버튼으로 이동 */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center" onClick={() => setLightbox(false)}>
          <img
            src={urls[idx]}
            alt=""
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {urls.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); prev(); }} disabled={idx === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white disabled:opacity-20">
                <ChevronLeft size={22} />
              </button>
              <button onClick={e => { e.stopPropagation(); next(); }} disabled={idx === urls.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white disabled:opacity-20">
                <ChevronRight size={22} />
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm font-semibold">
                {idx + 1} / {urls.length}
              </div>
            </>
          )}
          <button onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white">
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}

/* ── 보고서 카드 ─────────────────────────────────────────── */
function ReportCard({ report, onTap, isMe }: { report: Report; onTap: () => void; isMe: boolean }) {
  const ap = APPROVAL_CONFIG[report.approvalStatus];
  const preview = report.sections?.[0]?.body ?? '';
  return (
    <div onClick={onTap} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.99] transition-transform">
      {/* 사진 */}
      {(report.photoUrls ?? []).length > 0 && (
        <PhotoCarousel urls={report.photoUrls!} small />
      )}
      {/* 본문 */}
      <div className="px-4 py-3">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[11px] font-black text-stone-600 dark:text-stone-300 shrink-0">
            {report.authorName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-black text-stone-900 dark:text-stone-100">{report.authorName}</span>
            <span className="text-[10px] text-stone-400 ml-1.5">{fmtDate(report.updatedAt)}</span>
          </div>
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_CLS[report.type]}`}>{report.type}</span>
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ap.cls}`}>{ap.icon}{ap.label}</span>
        </div>
        {/* 제목 */}
        <p className="text-sm font-black text-stone-900 dark:text-stone-100 mb-1">{report.title || '(제목 없음)'}</p>
        {/* 내용 미리보기 */}
        {preview && (
          <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">{preview}</p>
        )}
        {/* 구버전 */}
        {!preview && report.htmlContent && (
          <p className="text-[11px] text-stone-400 italic">구버전 보고서 — 탭하여 확인</p>
        )}
      </div>
    </div>
  );
}

/* ── 보고서 상세 (풀스크린 모달) ─────────────────────────── */
function ReportDetail({
  report, isAdmin, isMe, onClose, onEdit, onApprove, onReject,
}: {
  report: Report; isAdmin: boolean; isMe: boolean;
  onClose: () => void; onEdit: () => void;
  onApprove: () => void; onReject: () => void;
}) {
  const ap = APPROVAL_CONFIG[report.approvalStatus];
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-stone-950 flex flex-col overflow-hidden">
      {/* 상단바 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{report.title || '(제목 없음)'}</p>
          <p className="text-[10px] text-stone-400">{report.authorName} · {fmtDate(report.updatedAt)}</p>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${ap.cls}`}>{ap.icon}{ap.label}</span>
        {isMe && report.approvalStatus === 'draft' && (
          <button onClick={onEdit} className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
            <Edit2 size={16} />
          </button>
        )}
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {/* 사진 */}
        {(report.photoUrls ?? []).length > 0 && <PhotoCarousel urls={report.photoUrls!} />}

        <div className="px-5 py-5 space-y-5 max-w-2xl mx-auto">
          {/* 메타 */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${TYPE_CLS[report.type]}`}>{report.type}</span>
            {report.docDate && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">{report.docDate}</span>}
          </div>

          {/* 새 구조화 섹션 */}
          {(report.sections ?? []).map((sec, i) => (
            <div key={i}>
              {sec.title && <p className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">{sec.title}</p>}
              <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap">{sec.body}</p>
            </div>
          ))}

          {/* 구버전 HTML */}
          {!report.sections?.length && report.htmlContent && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-stone-800 dark:text-stone-200"
              dangerouslySetInnerHTML={{ __html: report.htmlContent }} />
          )}

          {report.approverName && (
            <div className={`p-3 rounded-xl text-xs ${report.approvalStatus === 'approved' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
              <span className="font-black">{report.approvalStatus === 'approved' ? '✓ 승인' : '✗ 반려'}</span>
              {' '}— {report.approverName}
              {report.approverComment && <p className="mt-1 opacity-80">{report.approverComment}</p>}
            </div>
          )}
        </div>
      </div>

      {/* 결재 버튼 (관리자 + 대기 중) */}
      {isAdmin && report.approvalStatus === 'pending' && (
        <div className="flex gap-3 px-4 py-3 border-t border-stone-200 dark:border-stone-800 shrink-0">
          <button onClick={onReject}
            className="flex-1 py-3 rounded-xl border-2 border-red-400 text-red-600 dark:text-red-400 font-black text-sm hover:bg-red-50 dark:hover:bg-red-900/20">
            반려
          </button>
          <button onClick={onApprove}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700">
            승인
          </button>
        </div>
      )}

      {/* 결재 상신 버튼 (본인 + 임시저장) */}
      {isMe && report.approvalStatus === 'draft' && (
        <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800 shrink-0">
          <button onClick={onApprove}
            className="w-full py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-sm flex items-center justify-center gap-2">
            <Send size={14} /> 결재 상신
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 보고서 에디터 (바텀시트) ────────────────────────────── */
interface EditorState {
  title: string;
  type: ReportType;
  docDate: string;
  sections: ReportSection[];
  photos: File[];         // 새로 추가할 사진
  existingUrls: string[]; // 기존 사진 URL
}

function ReportEditor({
  initial, onSave, onClose, saving,
}: {
  initial?: Partial<EditorState & { id: string }>;
  onSave: (state: EditorState & { id?: string }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [state, setState] = useState<EditorState>({
    title: initial?.title ?? '',
    type: initial?.type ?? '일반',
    docDate: initial?.docDate ?? new Date().toISOString().slice(0, 10),
    sections: initial?.sections?.length ? initial.sections : [{ title: '', body: '' }],
    photos: [],
    existingUrls: initial?.existingUrls ?? [],
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<EditorState>) => setState(p => ({ ...p, ...patch }));

  const addSection = () => update({ sections: [...state.sections, { title: '', body: '' }] });
  const removeSection = (i: number) => update({ sections: state.sections.filter((_, idx) => idx !== i) });
  const updateSection = (i: number, patch: Partial<ReportSection>) =>
    update({ sections: state.sections.map((s, idx) => idx === i ? { ...s, ...patch } : s) });

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = 5 - state.existingUrls.length - state.photos.length;
    update({ photos: [...state.photos, ...files.slice(0, remaining)] });
    e.target.value = '';
  };

  const removeNewPhoto = (i: number) => update({ photos: state.photos.filter((_, idx) => idx !== i) });
  const removeExistingUrl = (url: string) => update({ existingUrls: state.existingUrls.filter(u => u !== url) });

  const totalPhotos = state.existingUrls.length + state.photos.length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-950">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-stone-500"><X size={20} /></button>
        <p className="flex-1 text-sm font-black text-stone-900 dark:text-stone-100">
          {initial?.id ? '보고서 수정' : '새 보고서'}
        </p>
        <button onClick={() => onSave({ ...state, id: initial?.id })} disabled={saving || !state.title.trim()}
          className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-black rounded-xl disabled:opacity-40">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 제목 */}
        <input
          value={state.title}
          onChange={e => update({ title: e.target.value })}
          placeholder="제목을 입력하세요"
          className="w-full text-lg font-black bg-transparent outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:placeholder:text-stone-600 border-b-2 border-stone-200 dark:border-stone-700 pb-2 focus:border-stone-800 dark:focus:border-stone-300 transition-colors"
        />

        {/* 유형 + 날짜 */}
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button key={t} onClick={() => update({ type: t })}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${state.type === t ? TYPE_CLS[t] + ' ring-2 ring-current ring-offset-1' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}`}>
              {t}
            </button>
          ))}
          <input type="date" value={state.docDate} onChange={e => update({ docDate: e.target.value })}
            className="ml-auto px-2 py-1 text-xs border border-stone-200 dark:border-stone-700 rounded-lg bg-transparent text-stone-600 dark:text-stone-400 outline-none" />
        </div>

        {/* 사진 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon size={14} className="text-stone-400" />
            <span className="text-xs font-bold text-stone-500">사진 ({totalPhotos}/5)</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* 기존 사진 */}
            {state.existingUrls.map(url => (
              <div key={url} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeExistingUrl(url)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white">
                  <X size={10} />
                </button>
              </div>
            ))}
            {/* 새 사진 미리보기 */}
            {state.photos.map((file, i) => (
              <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden">
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeNewPhoto(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white">
                  <X size={10} />
                </button>
              </div>
            ))}
            {/* 추가 버튼 */}
            {totalPhotos < 5 && (
              <button onClick={() => fileRef.current?.click()}
                className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-600 flex flex-col items-center justify-center gap-1 text-stone-400 hover:border-stone-500 transition-colors">
                <Camera size={18} />
                <span className="text-[10px] font-bold">추가</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPhotoChange} />
        </div>

        {/* 섹션들 */}
        <div className="space-y-4">
          {state.sections.map((sec, i) => (
            <div key={i} className="bg-stone-50 dark:bg-stone-900 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlignLeft size={13} className="text-stone-400 shrink-0" />
                <input
                  value={sec.title}
                  onChange={e => updateSection(i, { title: e.target.value })}
                  placeholder={`섹션 제목 ${i + 1} (선택)`}
                  className="flex-1 text-xs font-bold bg-transparent outline-none text-stone-600 dark:text-stone-400 placeholder:text-stone-300"
                />
                {state.sections.length > 1 && (
                  <button onClick={() => removeSection(i)} className="text-stone-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <textarea
                value={sec.body}
                onChange={e => updateSection(i, { body: e.target.value })}
                placeholder="내용을 입력하세요..."
                rows={4}
                className="w-full bg-transparent outline-none text-sm text-stone-800 dark:text-stone-200 placeholder:text-stone-300 dark:placeholder:text-stone-600 resize-none leading-relaxed"
              />
            </div>
          ))}
        </div>

        {/* 섹션 추가 */}
        <button onClick={addSection}
          className="w-full py-3 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-bold text-stone-400 hover:border-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors flex items-center justify-center gap-2">
          <Plus size={14} /> 섹션 추가
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ─────────────────────────────────────── */
interface Props { currentUser: User }

export function ReportView({ currentUser }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'all'>('all');
  const [detail, setDetail] = useState<Report | null>(null);
  const [editing, setEditing] = useState<(Partial<EditorState & { id: string }> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const snap = isAdmin
        ? await getDocs(query(collection(salesDb, 'reports'), orderBy('updatedAt', 'desc')))
        : await getDocs(query(collection(salesDb, 'reports'), where('authorId', '==', currentUser.uid), orderBy('updatedAt', 'desc')));
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [isAdmin, currentUser.uid]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /* 사진 업로드 (압축 후) */
  const uploadPhotos = async (photos: File[], reportId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of photos) {
      const compressed = await compressImage(file);
      const fileRef = ref(storage, `reports/${reportId}_${Date.now()}.jpg`);
      await uploadBytes(fileRef, compressed);
      urls.push(await getDownloadURL(fileRef));
    }
    return urls;
  };

  /* 저장 (신규/수정) */
  const handleSave = async (state: EditorState & { id?: string }, asDraft = true) => {
    if (!state.title.trim()) { toast.error('제목을 입력해주세요'); return; }
    setSaving(true);
    try {
      const id = state.id ?? genId();
      const newUrls = await uploadPhotos(state.photos, id);
      const photoUrls = [...state.existingUrls, ...newUrls];
      const now = new Date().toISOString();
      const report: Report = {
        id,
        title: state.title.trim(),
        type: state.type,
        status: '진행',
        authorId: currentUser.uid,
        authorName: currentUser.name,
        storageKey: '',
        approvalStatus: state.id ? (detail?.approvalStatus ?? 'draft') : 'draft',
        sections: state.sections.filter(s => s.body.trim()),
        photoUrls,
        docDate: state.docDate,
        createdAt: state.id ? (detail?.createdAt ?? now) : now,
        updatedAt: now,
      };
      await setDoc(doc(salesDb, 'reports', id), report);
      toast.success(state.id ? '수정되었습니다' : '저장되었습니다');
      setEditing(null);
      setDetail(null);
      fetchReports();
    } catch (e) { toast.error('저장 실패'); console.error(e); }
    finally { setSaving(false); }
  };

  /* 결재 상신 */
  const handleSubmit = async (report: Report) => {
    const ok = await confirm({ title: '결재 상신', message: `"${report.title}"을 결재 상신하시겠습니까?`, confirmLabel: '상신' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'reports', report.id), { approvalStatus: 'pending', submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast.success('결재 상신 완료');
    fetchReports();
    setDetail(null);
  };

  /* 승인 */
  const handleApprove = async (report: Report) => {
    if (report.approvalStatus === 'draft') { handleSubmit(report); return; }
    const ok = await confirm({ title: '승인', message: `"${report.title}"을 승인하시겠습니까?`, confirmLabel: '승인' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'reports', report.id), { approvalStatus: 'approved', approverName: currentUser.name, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast.success('승인되었습니다');
    fetchReports();
    setDetail(null);
  };

  /* 반려 */
  const handleReject = async (report: Report) => {
    const ok = await confirm({ title: '반려', message: `"${report.title}"을 반려하시겠습니까?`, confirmLabel: '반려', variant: 'danger' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'reports', report.id), { approvalStatus: 'rejected', approverName: currentUser.name, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast.success('반려되었습니다');
    fetchReports();
    setDetail(null);
  };

  /* 삭제 */
  const handleDelete = async (report: Report) => {
    const ok = await confirm({ title: '삭제', message: `"${report.title}"을 삭제하시겠습니까?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    for (const url of report.photoUrls ?? []) {
      try { await deleteObject(ref(storage, url)); } catch {}
    }
    await deleteDoc(doc(salesDb, 'reports', report.id));
    toast.success('삭제되었습니다');
    fetchReports();
    setDetail(null);
  };

  const filtered = reports.filter(r => filterStatus === 'all' || r.approvalStatus === filterStatus);
  const pendingCount = reports.filter(r => r.approvalStatus === 'pending').length;

  return (
    <div className="relative min-h-[70vh]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-black text-stone-900 dark:text-stone-100 flex-1">보고서</h1>
        {pendingCount > 0 && (
          <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-1 rounded-full">결재 대기 {pendingCount}</span>
        )}
        <button onClick={fetchReports} className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {([['all', '전체'], ['draft', '임시저장'], ['pending', '결재 대기'], ['approved', '승인'], ['rejected', '반려']] as [ApprovalStatus | 'all', string][]).map(([v, l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filterStatus === v ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* 피드 */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-300 dark:text-stone-700">
          <FileText size={40} className="mb-3" />
          <p className="text-sm font-semibold">보고서가 없습니다</p>
          <p className="text-xs mt-1">아래 + 버튼으로 첫 보고서를 작성해보세요</p>
        </div>
      ) : (
        <div className="space-y-3 pb-24">
          {filtered.map(r => (
            <ReportCard key={r.id}
              report={r}
              isMe={r.authorId === currentUser.uid}
              onTap={() => setDetail(r)}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setEditing({})}
        className="fixed bottom-6 right-6 w-14 h-14 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40">
        <Plus size={24} />
      </button>

      {/* 상세 모달 */}
      {detail && (
        <ReportDetail
          report={detail}
          isAdmin={isAdmin}
          isMe={detail.authorId === currentUser.uid}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing({
              id: detail.id,
              title: detail.title,
              type: detail.type,
              docDate: detail.docDate ?? new Date().toISOString().slice(0, 10),
              sections: detail.sections ?? [],
              existingUrls: detail.photoUrls ?? [],
            });
            setDetail(null);
          }}
          onApprove={() => handleApprove(detail)}
          onReject={() => handleReject(detail)}
        />
      )}

      {/* 에디터 */}
      {editing !== null && (
        <ReportEditor
          initial={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
