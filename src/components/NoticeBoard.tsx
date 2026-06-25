import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore';
import { Notice, NoticeCategory, User, Department, Employee } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  Plus, Pin, Edit2, Trash2, X, Check, ChevronDown, Megaphone, Bell,
  Archive, BookMarked, CheckCheck, Users,
} from 'lucide-react';

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
const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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

type ViewTab = 'active' | 'archive';

export function NoticeBoard({ currentUser }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [filterCat, setFilterCat] = useState<NoticeCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [readersOpen, setReadersOpen] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [noticeSnap, deptSnap, empSnap] = await Promise.all([
        getDocs(query(collection(salesDb, 'notices'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(salesDb, 'departments'), orderBy('order'))),
        getDocs(collection(salesDb, 'employees')),
      ]);
      setNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
      setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    } catch (e) {
      console.error('NoticeBoard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* 읽음 처리 — 공지 열 때 자동으로 읽음 기록 */
  const markRead = useCallback(async (notice: Notice) => {
    if (notice.readBy?.[currentUser.uid]) return; // 이미 읽음
    const readAt = new Date().toISOString();
    try {
      await updateDoc(doc(salesDb, 'notices', notice.id), {
        [`readBy.${currentUser.uid}`]: { name: currentUser.name, readAt },
      });
      setNotices(prev => prev.map(n =>
        n.id === notice.id
          ? { ...n, readBy: { ...n.readBy, [currentUser.uid]: { name: currentUser.name, readAt } } }
          : n
      ));
    } catch (e) {
      console.error('markRead error:', e);
    }
  }, [currentUser.uid, currentUser.name]);

  const handleExpand = useCallback((notice: Notice) => {
    const nextId = expandedId === notice.id ? null : notice.id;
    setExpandedId(nextId);
    setReadersOpen(null);
    if (nextId && !notice.isArchived) markRead(notice);
  }, [expandedId, markRead]);

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
        isArchived: false,
        readBy: { [currentUser.uid]: { name: currentUser.name, readAt: now } }, // 작성자 자동 읽음
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

  const handleArchive = async (notice: Notice, archive: boolean) => {
    await updateDoc(doc(salesDb, 'notices', notice.id), { isArchived: archive, updatedAt: new Date().toISOString() });
    toast.success(archive ? '보관함으로 이동했습니다' : '복원했습니다');
    setExpandedId(null);
    fetchData();
  };

  const toggleDept = (id: string) => {
    setForm(p => ({
      ...p,
      targetDeptIds: p.targetDeptIds.includes(id) ? p.targetDeptIds.filter(x => x !== id) : [...p.targetDeptIds, id],
    }));
  };

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name ?? id;

  /* 전원 읽음 여부 */
  const allRead = (notice: Notice) => {
    const readBy = notice.readBy ?? {};
    const activeLinked = employees.filter(e => e.isActive && e.linkedUid);
    if (activeLinked.length === 0) return false;
    return activeLinked.every(e => !!readBy[e.linkedUid!]);
  };

  /* 읽은 / 안 읽은 목록 */
  const getReaderLists = (notice: Notice) => {
    const readBy = notice.readBy ?? {};
    const readers = Object.entries(readBy).map(([uid, info]) => ({ uid, ...info }));
    const activeLinked = employees.filter(e => e.isActive && e.linkedUid);
    const nonReaders = activeLinked.filter(e => !readBy[e.linkedUid!]).map(e => e.name);
    return { readers, nonReaders };
  };

  /* 정렬: 핀 → 긴급 → 최신 */
  const filtered = notices
    .filter(n => (viewTab === 'active' ? !n.isArchived : n.isArchived === true))
    .filter(n => filterCat === 'all' || n.category === filterCat)
    .sort((a, b) => {
      if (viewTab === 'active') {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.category === '긴급' && b.category !== '긴급') return -1;
        if (b.category === '긴급' && a.category !== '긴급') return 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const activeCount = notices.filter(n => !n.isArchived).length;
  const archiveCount = notices.filter(n => n.isArchived).length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">공지사항</h1>
          <p className="text-sm text-stone-400 mt-0.5">전체 {activeCount}건</p>
        </div>
        {isAdmin && viewTab === 'active' && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-bold hover:opacity-80">
            <Plus size={15} /> 공지 작성
          </button>
        )}
      </div>

      {/* 탭: 활성 / 보관함 */}
      <div className="flex gap-1 mb-4 border-b border-stone-200 dark:border-stone-700">
        <button
          onClick={() => { setViewTab('active'); setExpandedId(null); setFilterCat('all'); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
            viewTab === 'active'
              ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
              : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          <Megaphone size={12} /> 공지 {activeCount > 0 && <span className="ml-0.5">{activeCount}</span>}
        </button>
        <button
          onClick={() => { setViewTab('archive'); setExpandedId(null); setFilterCat('all'); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
            viewTab === 'archive'
              ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
              : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          <BookMarked size={12} /> 보관함 {archiveCount > 0 && <span className="ml-0.5">{archiveCount}</span>}
        </button>
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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-stone-400">
          {viewTab === 'archive' ? <BookMarked size={40} className="mb-3 opacity-20" /> : <Megaphone size={40} className="mb-3 opacity-20" />}
          <p className="text-sm font-semibold">
            {viewTab === 'archive' ? '보관된 공지가 없습니다' : '등록된 공지사항이 없습니다'}
          </p>
          {isAdmin && viewTab === 'active' && <p className="text-xs mt-1">위 버튼으로 첫 공지를 작성해보세요</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(notice => {
            const isExpanded = expandedId === notice.id;
            const isRead = !!notice.readBy?.[currentUser.uid];
            const isAllRead = allRead(notice);
            const { readers, nonReaders } = getReaderLists(notice);

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
                  onClick={() => handleExpand(notice)}
                >
                  {notice.isPinned && <Pin size={13} className="text-stone-500 dark:text-stone-400 shrink-0" />}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${CAT_STYLE[notice.category]}`}>
                    {notice.category}
                  </span>
                  <span className={`flex-1 text-sm font-bold truncate ${isRead ? 'text-stone-500 dark:text-stone-400' : 'text-stone-900 dark:text-stone-100'}`}>
                    {!isRead && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 mb-0.5 align-middle" />}
                    {notice.title}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    {isAllRead && viewTab === 'active' && (
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                        <CheckCheck size={11} /> 전원 확인
                      </span>
                    )}
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

                    {/* 읽은 사람 / 안 읽은 사람 */}
                    <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                      <button
                        onClick={() => setReadersOpen(readersOpen === notice.id ? null : notice.id)}
                        className="flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 font-bold transition-colors"
                      >
                        <Users size={11} />
                        읽음 {readers.length}명
                        {nonReaders.length > 0 && <span className="text-stone-400">· 미확인 {nonReaders.length}명</span>}
                        <ChevronDown size={11} className={`transition-transform ${readersOpen === notice.id ? 'rotate-180' : ''}`} />
                      </button>

                      {readersOpen === notice.id && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {readers.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 mb-1 tracking-wider">확인</p>
                              <div className="space-y-1">
                                {readers.map(r => (
                                  <div key={r.uid} className="flex items-center gap-1.5">
                                    <Check size={10} className="text-emerald-500 shrink-0" />
                                    <span className="text-[11px] text-stone-600 dark:text-stone-400">{r.name}</span>
                                    <span className="text-[10px] text-stone-400 ml-auto">{fmtDate(r.readAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {nonReaders.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black text-stone-400 mb-1 tracking-wider">미확인</p>
                              <div className="space-y-1">
                                {nonReaders.map(name => (
                                  <div key={name} className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full border border-stone-300 dark:border-stone-600 shrink-0" />
                                    <span className="text-[11px] text-stone-400">{name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 관리자 액션 */}
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex-wrap">
                        {viewTab === 'active' && (
                          <>
                            <button onClick={() => togglePin(notice)} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${notice.isPinned ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                              <Pin size={11} /> {notice.isPinned ? '고정 해제' : '상단 고정'}
                            </button>
                            <button onClick={() => openEdit(notice)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
                              <Edit2 size={11} /> 수정
                            </button>
                            <button
                              onClick={() => handleArchive(notice, true)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border rounded-lg transition-colors ${
                                isAllRead
                                  ? 'border-stone-700 dark:border-stone-300 text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700'
                                  : 'border-stone-200 dark:border-stone-600 text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                              }`}
                            >
                              <Archive size={11} />
                              {isAllRead ? '전원 확인 — 보관함으로' : '보관함으로'}
                            </button>
                          </>
                        )}
                        {viewTab === 'archive' && (
                          <button onClick={() => handleArchive(notice, false)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border border-stone-200 dark:border-stone-600 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
                            <Megaphone size={11} /> 복원
                          </button>
                        )}
                        <button onClick={() => handleDelete(notice)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border border-red-200 dark:border-red-800 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto">
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
