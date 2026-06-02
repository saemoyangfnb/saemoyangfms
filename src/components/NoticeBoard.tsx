import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Notice, NoticeCategory, User, Department } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, Pin, Edit2, Trash2, X, Check, ChevronDown, Megaphone, Bell } from 'lucide-react';

/* ── 상수 ─────────────────────────────────────────────── */
const CATEGORIES: NoticeCategory[] = ['전체공지', '부서공지', '긴급', '이벤트'];

const CAT_STYLE: Record<NoticeCategory, string> = {
  '전체공지': 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  '부서공지': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '긴급':    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '이벤트':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const genId = () => `notice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ── 공지 폼 ───────────────────────────────────────────── */
interface FormState {
  title: string;
  content: string;
  category: NoticeCategory;
  isPinned: boolean;
  targetDeptIds: string[];
}
const emptyForm = (): FormState => ({
  title: '', content: '', category: '전체공지', isPinned: false, targetDeptIds: [],
});

/* ── 메인 컴포넌트 ──────────────────────────────────────── */
interface Props { currentUser: User }

export function NoticeBoard({ currentUser }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<NoticeCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [noticeSnap, deptSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'notices'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(salesDb, 'departments'), orderBy('order'))),
      ]);
      setNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
      setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    } catch (e) {
      console.error('NoticeBoard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setForm(emptyForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (n: Notice) => {
    setForm({ title: n.title, content: n.content, category: n.category, isPinned: n.isPinned, targetDeptIds: n.targetDeptIds ?? [] });
    setEditingId(n.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (!form.content.trim()) { toast.error('내용을 입력해주세요'); return; }
    const now = new Date().toISOString();
    if (editingId) {
      await updateDoc(doc(salesDb, 'notices', editingId), { ...form, updatedAt: now });
      toast.success('공지가 수정되었습니다');
    } else {
      const id = genId();
      const notice: Notice = {
        id, ...form,
        authorId: currentUser.uid,
        authorName: currentUser.name,
        attachments: [],
        createdAt: now, updatedAt: now,
      };
      await setDoc(doc(salesDb, 'notices', id), notice);
      toast.success('공지가 등록되었습니다');
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (notice: Notice) => {
    const ok = await confirm({ title: '공지 삭제', message: `"${notice.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'notices', notice.id));
    toast.success('삭제되었습니다');
    fetchData();
  };

  const togglePin = async (notice: Notice) => {
    await updateDoc(doc(salesDb, 'notices', notice.id), { isPinned: !notice.isPinned, updatedAt: new Date().toISOString() });
    fetchData();
  };

  const toggleDept = (id: string) => {
    setForm(p => ({
      ...p,
      targetDeptIds: p.targetDeptIds.includes(id) ? p.targetDeptIds.filter(x => x !== id) : [...p.targetDeptIds, id],
    }));
  };

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? id;

  /* 정렬: 핀 → 긴급 → 최신 */
  const sorted = [...notices]
    .filter(n => filterCat === 'all' || n.category === filterCat)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.category === '긴급' && b.category !== '긴급') return -1;
      if (b.category === '긴급' && a.category !== '긴급') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">공지사항</h1>
          <p className="text-sm text-stone-400 mt-0.5">전체 {notices.length}건</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
            <Plus size={15} /> 공지 작성
          </button>
        )}
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 flex-wrap mb-5">
        {(['all', ...CATEGORIES] as const).map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
              filterCat === cat
                ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100'
                : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {cat === 'all' ? '전체' : cat}
          </button>
        ))}
      </div>

      {/* 공지 목록 */}
      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">불러오는 중...</div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-stone-400">
          <Megaphone size={40} className="mb-3 opacity-20" />
          <p className="text-sm font-semibold">등록된 공지사항이 없습니다</p>
          {isAdmin && <p className="text-xs mt-1">위 버튼으로 첫 공지를 작성해보세요</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(notice => {
            const isExpanded = expandedId === notice.id;
            return (
              <div key={notice.id}
                className={`bg-white dark:bg-stone-900 border rounded-xl overflow-hidden transition-all ${
                  notice.category === '긴급' ? 'border-red-200 dark:border-red-800' :
                  notice.isPinned ? 'border-stone-400 dark:border-stone-500' :
                  'border-stone-200 dark:border-stone-700'
                }`}
              >
                {/* 제목 행 */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : notice.id)}
                >
                  {notice.isPinned && <Pin size={13} className="text-stone-500 dark:text-stone-400 shrink-0" />}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${CAT_STYLE[notice.category]}`}>
                    {notice.category}
                  </span>
                  <span className="flex-1 text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                    {notice.title}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    {(notice.targetDeptIds ?? []).length > 0 && (
                      <span className="text-[10px] text-blue-500 hidden sm:block">
                        {notice.targetDeptIds!.map(getDeptName).join(', ')}
                      </span>
                    )}
                    <span className="text-[11px] text-stone-400 hidden sm:block">{notice.authorName}</span>
                    <span className="text-[11px] text-stone-400">{fmtDate(notice.createdAt)}</span>
                    <ChevronDown size={14} className={`text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* 본문 */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-stone-100 dark:border-stone-800">
                    <pre className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed font-sans pt-4">
                      {notice.content}
                    </pre>
                    {(notice.targetDeptIds ?? []).length > 0 && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                        <Bell size={12} className="text-stone-400" />
                        <span className="text-[11px] text-stone-400">대상: {notice.targetDeptIds!.map(getDeptName).join(', ')}</span>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                        <button onClick={() => togglePin(notice)} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${notice.isPinned ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                          <Pin size={11} /> {notice.isPinned ? '고정 해제' : '상단 고정'}
                        </button>
                        <button onClick={() => openEdit(notice)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
                          <Edit2 size={11} /> 수정
                        </button>
                        <button onClick={() => handleDelete(notice)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border border-red-200 dark:border-red-800 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={11} /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 공지 작성/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-sm font-black text-stone-900 dark:text-stone-100">
                {editingId ? '공지 수정' : '새 공지 작성'}
              </h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-stone-400" /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 카테고리 */}
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-2">카테고리</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setForm(p => ({ ...p, category: cat }))}
                      className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
                        form.category === cat
                          ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900'
                          : 'border-stone-200 dark:border-stone-600 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 제목 */}
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">제목 *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="공지 제목을 입력하세요"
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500" />
              </div>

              {/* 내용 */}
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">내용 *</label>
                <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                  rows={6} placeholder="공지 내용을 입력하세요"
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500 resize-none" />
              </div>

              {/* 대상 부서 (부서공지일 때만) */}
              {form.category === '부서공지' && departments.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-2">대상 부서 (미선택 시 전체)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {departments.map(dept => (
                      <button key={dept.id} onClick={() => toggleDept(dept.id)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
                          form.targetDeptIds.includes(dept.id)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-stone-200 dark:border-stone-600 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                        }`}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 상단 고정 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPinned} onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))}
                  className="accent-stone-700 w-4 h-4" />
                <span className="text-sm text-stone-600 dark:text-stone-400 font-semibold flex items-center gap-1">
                  <Pin size={13} /> 상단 고정
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold">취소</button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg font-bold hover:opacity-80">
                <Check size={13} /> {editingId ? '수정 저장' : '공지 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
