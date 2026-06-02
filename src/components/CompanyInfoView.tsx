import React, { useState, useEffect, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { User, BrandMilestone, MVCDoc, CompanyProfileDoc } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { Plus, X, Edit2, Trash2, Check, Save, Flag, GitBranch, Building2 } from 'lucide-react';

const ts = () => new Date().toISOString();
const genId = () => `ci_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

// ── MVC 뷰 ────────────────────────────────────────────────
function MVCView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const isAdmin = currentUser.role === 'admin';
  const [data, setData] = useState<MVCDoc>({ mission: '', vision: '', values: [], updatedAt: '' });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MVCDoc>(data);
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(salesDb, 'company_info'));
        const mvcDoc = snap.docs.find(d => d.id === 'mvc');
        if (mvcDoc) setData(mvcDoc.data() as MVCDoc);
      } catch {}
    })();
  }, []);

  useEffect(() => { setForm(data); }, [data]);

  const handleSave = async () => {
    const updated = { ...form, updatedAt: ts() };
    await setDoc(doc(salesDb, 'company_info', 'mvc'), updated);
    setData(updated);
    setEditing(false);
    toast.success('저장됨');
  };

  const addValue = () => {
    if (!newValue.trim()) return;
    setForm(f => ({ ...f, values: [...f.values, newValue.trim()] }));
    setNewValue('');
  };

  const removeValue = (i: number) =>
    setForm(f => ({ ...f, values: f.values.filter((_, idx) => idx !== i) }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Flag size={20} className="text-stone-500" />
          <div>
            <h1 className="text-xl font-black text-stone-900 dark:text-white">MVC</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">Mission · Vision · Core Values</p>
          </div>
        </div>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
            <Edit2 size={12} /> 편집
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-6">
          {[
            { key: 'mission' as const, label: 'Mission', placeholder: '우리는 무엇을 하는가? 존재 이유...' },
            { key: 'vision' as const,  label: 'Vision',  placeholder: '우리가 이루고자 하는 미래의 모습...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-black text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-widest">{label}</label>
              <textarea
                value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder} rows={3}
                className="w-full px-4 py-3 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-500 resize-none"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-black text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-widest">Core Values</label>
            <div className="space-y-2 mb-2">
              {form.values.map((v, i) => (
                <div key={i} className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2">
                  <span className="flex-1 text-sm text-stone-800 dark:text-stone-200">{v}</span>
                  <button onClick={() => removeValue(i)} className="text-stone-400 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newValue} onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addValue()}
                placeholder="핵심 가치 추가..."
                className="flex-1 px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
              <button onClick={addValue} className="px-3 py-2 text-xs font-bold bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-sm hover:bg-stone-300 transition-colors">
                <Plus size={13} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setEditing(false); setForm(data); }} className="px-4 py-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
              <Save size={12} /> 저장
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {data.mission || data.vision || data.values.length > 0 ? (
            <>
              {[
                { label: 'Mission', value: data.mission },
                { label: 'Vision',  value: data.vision },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
                  <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase mb-2">{label}</p>
                  <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap">{value}</p>
                </div>
              ))}
              {data.values.length > 0 && (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
                  <p className="text-[10px] font-black text-stone-400 tracking-widest uppercase mb-3">Core Values</p>
                  <div className="flex flex-wrap gap-2">
                    {data.values.map((v, i) => (
                      <span key={i} className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-sm font-bold rounded-sm">{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Flag size={36} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm text-stone-400">아직 MVC가 등록되지 않았습니다.</p>
              {isAdmin && <button onClick={() => setEditing(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">작성 시작</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 브랜드 연혁 뷰 ─────────────────────────────────────────
function BrandHistoryView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isAdmin = currentUser.role === 'admin';
  const [milestones, setMilestones] = useState<BrandMilestone[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BrandMilestone | null>(null);
  const [form, setForm] = useState({ date: '', title: '', description: '', category: '' });

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(salesDb, 'brand_milestones'), orderBy('date', 'desc')));
    setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() } as BrandMilestone)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (m?: BrandMilestone) => {
    if (m) { setEditing(m); setForm({ date: m.date, title: m.title, description: m.description ?? '', category: m.category ?? '' }); }
    else { setEditing(null); setForm({ date: '', title: '', description: '', category: '' }); }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.title.trim()) return;
    if (editing) {
      await updateDoc(doc(salesDb, 'brand_milestones', editing.id), { ...form, title: form.title.trim() });
    } else {
      const id = genId();
      await setDoc(doc(salesDb, 'brand_milestones', id), { id, ...form, title: form.title.trim() });
    }
    toast.success(editing ? '수정됨' : '추가됨');
    await load();
    setShowForm(false);
  };

  const handleDelete = async (m: BrandMilestone) => {
    const ok = await confirm({ title: '삭제', message: `"${m.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
    if (!ok) return;
    await deleteDoc(doc(salesDb, 'brand_milestones', m.id));
    toast.success('삭제됨');
    await load();
  };

  const grouped = milestones.reduce<Record<string, BrandMilestone[]>>((acc, m) => {
    const year = m.date.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(m);
    return acc;
  }, {});
  const years = Object.keys(grouped).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GitBranch size={20} className="text-stone-500" />
          <div>
            <h1 className="text-xl font-black text-stone-900 dark:text-white">브랜드 연혁</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">새모양에프엔비의 발자취</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
            <Plus size={13} /> 추가
          </button>
        )}
      </div>

      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <GitBranch size={36} className="text-stone-300 dark:text-stone-600 mb-3" />
          <p className="text-sm text-stone-400">연혁이 없습니다.</p>
          {isAdmin && <button onClick={() => openForm()} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">첫 연혁 추가</button>}
        </div>
      ) : (
        <div className="space-y-8">
          {years.map(year => (
            <div key={year}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg font-black text-stone-800 dark:text-stone-200">{year}</span>
                <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
              </div>
              <div className="space-y-3 pl-4 border-l-2 border-stone-200 dark:border-stone-700">
                {grouped[year].map(m => (
                  <div key={m.id} className="relative group pl-4">
                    <div className="absolute -left-[1.35rem] top-1.5 w-3 h-3 rounded-full bg-white dark:bg-stone-900 border-2 border-stone-400 dark:border-stone-500" />
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-3 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-[11px] text-stone-400 tabular-nums">{m.date}</span>
                            {m.category && <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-sm">{m.category}</span>}
                          </div>
                          <p className="text-sm font-bold text-stone-800 dark:text-stone-200">{m.title}</p>
                          {m.description && <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">{m.description}</p>}
                        </div>
                        {isAdmin && (
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <button onClick={() => openForm(m)} className="p-1 text-stone-400 hover:text-blue-600 rounded-sm"><Edit2 size={12} /></button>
                            <button onClick={() => handleDelete(m)} className="p-1 text-stone-400 hover:text-red-600 rounded-sm"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-md border border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between px-5 py-3.5 border-b-[3px] border-double border-stone-800 dark:border-stone-400">
              <h2 className="text-sm font-black text-stone-900 dark:text-white">{editing ? '연혁 수정' : '연혁 추가'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone-400 hover:text-stone-700 rounded-sm"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">날짜 *</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" autoFocus />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-500 mb-1">분류</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="창업 / 오픈 / 수상 / 기타"
                    className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">제목 *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="주요 사건/성과 제목"
                  className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">상세 내용</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="자세한 설명 (선택)"
                  className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
              <button onClick={handleSave} disabled={!form.date || !form.title.trim()}
                className="px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors">
                {editing ? '저장' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 회사 소개서 뷰 ─────────────────────────────────────────
function CompanyProfileView({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const isAdmin = currentUser.role === 'admin';
  const [data, setData] = useState<CompanyProfileDoc>({ sections: [], updatedAt: '' });
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState<{ title: string; body: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(salesDb, 'company_info'));
        const doc = snap.docs.find(d => d.id === 'profile');
        if (doc) setData(doc.data() as CompanyProfileDoc);
      } catch {}
    })();
  }, []);

  useEffect(() => { setSections(data.sections); }, [data]);

  const handleSave = async () => {
    const updated: CompanyProfileDoc = { sections: sections.filter(s => s.title.trim() || s.body.trim()), updatedAt: ts() };
    await setDoc(doc(salesDb, 'company_info', 'profile'), updated);
    setData(updated);
    setEditing(false);
    toast.success('저장됨');
  };

  const updateSection = (i: number, field: 'title' | 'body', val: string) =>
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const removeSection = (i: number) => setSections(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 size={20} className="text-stone-500" />
          <div>
            <h1 className="text-xl font-black text-stone-900 dark:text-white">회사 소개서</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">새모양에프엔비 브랜드 소개</p>
          </div>
        </div>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
            <Edit2 size={12} /> 편집
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="border border-stone-200 dark:border-stone-700 rounded-sm p-4 space-y-2">
              <div className="flex items-center gap-2">
                <input value={s.title} onChange={e => updateSection(i, 'title', e.target.value)}
                  placeholder="섹션 제목"
                  className="flex-1 px-3 py-1.5 text-sm font-bold border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none" />
                <button onClick={() => removeSection(i)} className="p-1 text-stone-400 hover:text-red-500 rounded-sm"><X size={14} /></button>
              </div>
              <textarea value={s.body} onChange={e => updateSection(i, 'body', e.target.value)}
                placeholder="내용" rows={4}
                className="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none resize-none" />
            </div>
          ))}
          <button
            onClick={() => setSections(prev => [...prev, { title: '', body: '' }])}
            className="w-full py-2.5 border-2 border-dashed border-stone-300 dark:border-stone-600 text-xs text-stone-400 hover:text-stone-600 hover:border-stone-400 rounded-sm transition-colors"
          >
            <Plus size={12} className="inline mr-1" /> 섹션 추가
          </button>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setSections(data.sections); }} className="px-4 py-2 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-sm">취소</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-sm hover:bg-stone-700 transition-colors">
              <Save size={12} /> 저장
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {data.sections.length > 0 ? (
            data.sections.map((s, i) => (
              <div key={i} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
                {s.title && <h2 className="text-sm font-black text-stone-800 dark:text-stone-200 mb-2">{s.title}</h2>}
                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-wrap">{s.body}</p>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Building2 size={36} className="text-stone-300 dark:text-stone-600 mb-3" />
              <p className="text-sm text-stone-400">아직 회사 소개서가 없습니다.</p>
              {isAdmin && <button onClick={() => setEditing(true)} className="mt-3 text-xs text-stone-500 underline hover:text-stone-700">작성 시작</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 export ───────────────────────────────────────────
export function CompanyInfoView({
  section, currentUser,
}: {
  section: 'mvc' | 'brand_history' | 'company_profile';
  currentUser: User;
}) {
  if (section === 'mvc') return <MVCView currentUser={currentUser} />;
  if (section === 'brand_history') return <BrandHistoryView currentUser={currentUser} />;
  return <CompanyProfileView currentUser={currentUser} />;
}
