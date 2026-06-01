import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, orderBy, query } from 'firebase/firestore';
import { SopDocument, SopStep, User } from '../types';
import { useToast } from './Toast';
import {
  Plus, X, ChevronDown, ChevronUp, Search, Edit2, Trash2,
  Clock, Users, Building2, BookOpen, ChevronRight, Printer,
} from 'lucide-react';

const genId = () => `sop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const DEFAULT_CATEGORIES = ['오픈 준비', '원가 관리', '식재료 발주', '직원 교육', '위생 관리', '고객 응대', '가맹 관리', '인사·채용'];

/* ── 상세 뷰 (풀스크린) ──────────────────────────────────── */
function SopDetail({
  doc: sop, isAdmin, onClose, onEdit, onDelete,
}: {
  doc: SopDocument; isAdmin: boolean;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [deletePending, setDeletePending] = useState(false);

  return (
    <div id="sop-print-area" className="fixed inset-0 z-50 bg-[#FDFBF7] dark:bg-stone-950 flex flex-col overflow-hidden">
      {/* 상단바 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0 print:hidden">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
          <ChevronRight size={20} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-stone-900 dark:text-stone-100 truncate">{sop.title}</p>
          <p className="text-[10px] text-stone-400">{sop.category} · {sop.authorName}</p>
        </div>
        <button onClick={() => window.print()} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300">
          <Printer size={16} />
        </button>
        {isAdmin && (
          <>
            <button onClick={onEdit} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300">
              <Edit2 size={16} />
            </button>
            {deletePending ? (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] font-bold text-red-500">삭제?</span>
                <button onClick={() => { setDeletePending(false); onDelete(); }}
                  className="text-[11px] font-black bg-red-500 text-white px-2 py-1 rounded-lg">확인</button>
                <button onClick={() => setDeletePending(false)}
                  className="text-[11px] text-stone-400 px-2 py-1">취소</button>
              </div>
            ) : (
              <button onClick={() => setDeletePending(true)} className="p-1.5 text-red-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
        {/* 제목 */}
        <h1 className="text-xl font-black text-stone-900 dark:text-stone-100 mb-1">{sop.title}</h1>
        <p className="text-xs text-stone-400 mb-5">{sop.category} · 최종 수정 {sop.updatedAt.slice(0, 10)}</p>

        {/* 메타 정보 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {sop.departmentName && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-stone-400 mb-1"><Building2 size={12} /><span className="text-[10px] font-bold uppercase tracking-wide">담당 부서</span></div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{sop.departmentName}</p>
            </div>
          )}
          {sop.ownerName && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-stone-400 mb-1"><Users size={12} /><span className="text-[10px] font-bold uppercase tracking-wide">담당자</span></div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{sop.ownerName}</p>
            </div>
          )}
          {sop.deadlineDays != null && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-stone-400 mb-1"><Clock size={12} /><span className="text-[10px] font-bold uppercase tracking-wide">처리 기한</span></div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{sop.deadlineDays}일</p>
            </div>
          )}
          {sop.requiredPersonnel != null && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-stone-400 mb-1"><Users size={12} /><span className="text-[10px] font-bold uppercase tracking-wide">필요 인원</span></div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{sop.requiredPersonnel}명</p>
            </div>
          )}
        </div>

        {/* 단계별 절차 */}
        {sop.steps.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-3">처리 절차</h2>
            <div className="space-y-2">
              {sop.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-stone-800 dark:text-stone-200 leading-snug">{step.text}</p>
                    {step.note && <p className="text-xs text-stone-400 mt-0.5 pl-0.5">{step.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 참고 메모 */}
        {sop.note && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">참고 메모</p>
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">{sop.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 편집 폼 (풀스크린) ─────────────────────────────────── */
function SopEditor({
  initial, onSave, onClose, saving,
}: {
  initial: Partial<SopDocument>;
  onSave: (data: Omit<SopDocument, 'id' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [category, setCategory] = useState(initial.category ?? '');
  const [departmentName, setDepartmentName] = useState(initial.departmentName ?? '');
  const [ownerName, setOwnerName] = useState(initial.ownerName ?? '');
  const [deadlineDays, setDeadlineDays] = useState<string>(initial.deadlineDays != null ? String(initial.deadlineDays) : '');
  const [requiredPersonnel, setRequiredPersonnel] = useState<string>(initial.requiredPersonnel != null ? String(initial.requiredPersonnel) : '');
  const [steps, setSteps] = useState<SopStep[]>(initial.steps?.length ? initial.steps : [{ text: '' }]);
  const [note, setNote] = useState(initial.note ?? '');
  const [showCatSuggest, setShowCatSuggest] = useState(false);

  const addStep = () => setSteps(p => [...p, { text: '' }]);
  const removeStep = (i: number) => setSteps(p => p.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof SopStep, val: string) =>
    setSteps(p => p.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const arr = [...steps];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setSteps(arr);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      category: category.trim() || '기타',
      departmentName: departmentName.trim() || undefined,
      ownerName: ownerName.trim() || undefined,
      deadlineDays: deadlineDays ? parseInt(deadlineDays) : undefined,
      requiredPersonnel: requiredPersonnel ? parseInt(requiredPersonnel) : undefined,
      steps: steps.filter(s => s.text.trim()),
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FDFBF7] dark:bg-stone-950 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b-[3px] border-double border-stone-800 dark:border-stone-400 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
          <X size={18} />
        </button>
        <p className="text-sm font-black text-stone-900 dark:text-stone-100 flex-1">
          {initial.id ? '규정 수정' : '새 업무 규정'}
        </p>
        <button onClick={handleSave} disabled={!title.trim() || saving}
          className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-black disabled:opacity-40 hover:opacity-80">
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 max-w-2xl mx-auto w-full">
        {/* 기본 정보 */}
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="규정 제목 *"
            className="w-full text-lg font-black bg-transparent outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-300 border-b-2 border-stone-200 dark:border-stone-700 pb-2 focus:border-stone-800 dark:focus:border-stone-300" />

          {/* 카테고리 */}
          <div className="relative">
            <input value={category} onChange={e => setCategory(e.target.value)}
              onFocus={() => setShowCatSuggest(true)} onBlur={() => setTimeout(() => setShowCatSuggest(false), 150)}
              placeholder="카테고리 (예: 오픈 준비)"
              className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
            {showCatSuggest && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg z-10 overflow-hidden">
                {DEFAULT_CATEGORIES.filter(c => !category || c.includes(category)).map(c => (
                  <button key={c} onMouseDown={() => setCategory(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300">
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 메타 */}
        <div className="grid grid-cols-2 gap-3">
          <input value={departmentName} onChange={e => setDepartmentName(e.target.value)}
            placeholder="담당 부서"
            className="px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
          <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
            placeholder="담당자"
            className="px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
          <input value={deadlineDays} onChange={e => setDeadlineDays(e.target.value.replace(/\D/g, ''))}
            placeholder="처리 기한 (일)"
            inputMode="numeric"
            className="px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
          <input value={requiredPersonnel} onChange={e => setRequiredPersonnel(e.target.value.replace(/\D/g, ''))}
            placeholder="필요 인원 (명)"
            inputMode="numeric"
            className="px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
        </div>

        {/* 단계별 절차 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest">처리 절차</p>
            <button onClick={addStep} className="flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
              <Plus size={13} /> 단계 추가
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[11px] font-black text-stone-600 dark:text-stone-300 shrink-0 mt-2">
                  {i + 1}
                </div>
                <div className="flex-1 space-y-1">
                  <input value={step.text} onChange={e => updateStep(i, 'text', e.target.value)}
                    placeholder={`${i + 1}단계 내용`}
                    className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
                  <input value={step.note ?? ''} onChange={e => updateStep(i, 'note', e.target.value)}
                    placeholder="보충 설명 (선택)"
                    className="w-full px-3 py-1.5 text-xs border border-stone-100 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 outline-none focus:border-stone-400" />
                </div>
                <div className="flex flex-col gap-0.5 shrink-0 mt-1.5">
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-0.5 text-stone-300 hover:text-stone-600 disabled:opacity-20">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-0.5 text-stone-300 hover:text-stone-600 disabled:opacity-20">
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => removeStep(i)} disabled={steps.length === 1} className="p-0.5 text-stone-300 hover:text-red-500 disabled:opacity-20">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 참고 메모 */}
        <div>
          <p className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-2">참고 메모 (선택)</p>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="주의사항, 예외 케이스, 관련 담당자 등 자유롭게 작성"
            rows={4}
            className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 outline-none focus:border-stone-500 resize-none leading-relaxed" />
        </div>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ─────────────────────────────────────────── */
interface Props { currentUser: User }

export function SopView({ currentUser }: Props) {
  const toast = useToast();
  const isAdmin = currentUser.role === 'admin';

  const [docs, setDocs] = useState<SopDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('전체');
  const [detail, setDetail] = useState<SopDocument | null>(null);
  const [editing, setEditing] = useState<Partial<SopDocument> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(salesDb, 'sop_documents'), orderBy('category'), orderBy('createdAt')));
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SopDocument)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const categories = ['전체', ...Array.from(new Set(docs.map(d => d.category).filter(Boolean))).sort()];

  const filtered = docs.filter(d =>
    (selectedCat === '전체' || d.category === selectedCat) &&
    (!search || d.title.includes(search) || d.steps.some(s => s.text.includes(search)) || (d.note ?? '').includes(search))
  );

  const grouped = filtered.reduce<Record<string, SopDocument[]>>((acc, d) => {
    (acc[d.category] = acc[d.category] ?? []).push(d);
    return acc;
  }, {});

  const handleSave = async (data: Omit<SopDocument, 'id' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt'>) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editing?.id) {
        await updateDoc(doc(salesDb, 'sop_documents', editing.id), { ...data, updatedAt: now });
        toast.success('수정되었습니다');
      } else {
        const id = genId();
        await setDoc(doc(salesDb, 'sop_documents', id), {
          id, ...data,
          authorId: currentUser.uid, authorName: currentUser.name,
          createdAt: now, updatedAt: now,
        });
        toast.success('등록되었습니다');
      }
      setEditing(null);
      fetchDocs();
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.code === 'permission-denied' ? 'Firestore 권한 오류' : e?.message ?? '오류'}`);
    } finally { setSaving(false); }
  };

  const handleDelete = async (sop: SopDocument) => {
    try {
      await deleteDoc(doc(salesDb, 'sop_documents', sop.id));
      toast.success('삭제되었습니다');
      setDetail(null);
      fetchDocs();
    } catch (e: any) {
      toast.error(`삭제 실패: ${e?.message ?? '오류'}`);
    }
  };

  return (
    <div className="relative min-h-[70vh]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <BookOpen size={18} className="text-stone-600 dark:text-stone-400 shrink-0" />
        <h1 className="text-xl font-black text-stone-900 dark:text-stone-100 flex-1">업무 규정</h1>
        {isAdmin && (
          <button onClick={() => setEditing({})}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-black hover:opacity-80">
            <Plus size={13} /> 새 규정
          </button>
        )}
      </div>

      {/* 검색 */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="제목, 절차 내용 검색"
          className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCat(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedCat === cat ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-300 dark:text-stone-700">
          <BookOpen size={40} className="mb-3" />
          <p className="text-sm font-semibold">{search ? '검색 결과가 없습니다' : '등록된 업무 규정이 없습니다'}</p>
          {isAdmin && !search && <p className="text-xs mt-1">위 "+ 새 규정" 버튼으로 첫 규정을 작성해보세요</p>}
        </div>
      ) : (
        <div className="space-y-6 pb-10">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-[11px] font-black text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="flex-1 border-b border-stone-200 dark:border-stone-700" />
                {cat}
                <span className="flex-1 border-b border-stone-200 dark:border-stone-700" />
              </h2>
              <div className="space-y-2">
                {items.map(sop => (
                  <button key={sop.id} onClick={() => setDetail(sop)}
                    className="w-full text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 hover:border-stone-400 dark:hover:border-stone-500 transition-colors active:scale-[0.99]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{sop.title}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {sop.departmentName && (
                            <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                              <Building2 size={9} /> {sop.departmentName}
                            </span>
                          )}
                          {sop.deadlineDays != null && (
                            <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                              <Clock size={9} /> {sop.deadlineDays}일
                            </span>
                          )}
                          {sop.requiredPersonnel != null && (
                            <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                              <Users size={9} /> {sop.requiredPersonnel}명
                            </span>
                          )}
                          <span className="text-[10px] text-stone-300 dark:text-stone-600">{sop.steps.length}단계</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-stone-300 dark:text-stone-600 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 뷰 */}
      {detail && (
        <SopDetail
          doc={detail}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing({ ...detail }); setDetail(null); }}
          onDelete={() => handleDelete(detail)}
        />
      )}

      {/* 편집 폼 */}
      {editing !== null && (
        <SopEditor
          initial={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
