/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { salesDb } from '../firebase';
import { User } from '../types';
import { useToast } from './Toast';
import { ONBOARDING_DOCS, ONBOARDING_CHECKLIST_GROUPS, OnboardingChecklistGroup } from '../data/onboardingContent';
import { OnboardingChecklistEditor } from './OnboardingChecklistEditor';
import { GraduationCap, CheckCircle2, Circle, BookOpen, ChevronRight, UploadCloud, Users, Pencil } from 'lucide-react';

interface Props {
  currentUser: User;
  onOpenSop: () => void;
}

const ROLE_LABEL: Record<string, string> = { supervisor: '슈퍼바이저', cook: '조리바이저' };
const CHECKLIST_CONFIG_DOC = 'checklist';

export function OnboardingView({ currentUser, onOpenSop }: Props) {
  const toast = useToast();
  const isAdmin = currentUser.role === 'admin';
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<OnboardingChecklistGroup[]>(ONBOARDING_CHECKLIST_GROUPS);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(salesDb, 'onboarding_progress', currentUser.uid));
        if (!cancelled && snap.exists()) {
          setProgress((snap.data().items as Record<string, boolean>) || {});
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser.uid]);

  // 체크리스트 항목 구성은 Firestore(onboarding_config/checklist)가 정본.
  // 문서가 없으면 seed로 화면에 보여주고, 관리자라면 최초 1회 그대로 Firestore에 생성한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(salesDb, 'onboarding_config', CHECKLIST_CONFIG_DOC));
        if (cancelled) return;
        if (snap.exists() && Array.isArray(snap.data().groups)) {
          setGroups(snap.data().groups as OnboardingChecklistGroup[]);
        } else if (isAdmin) {
          await setDoc(doc(salesDb, 'onboarding_config', CHECKLIST_CONFIG_DOC), {
            groups: ONBOARDING_CHECKLIST_GROUPS,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.name,
          });
        }
      } catch (e) {
        console.error('온보딩 체크리스트 설정 로드 실패', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const allItems = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const checkedCount = allItems.filter(i => progress[i.id]).length;
  const percent = allItems.length > 0 ? Math.round((checkedCount / allItems.length) * 100) : 0;

  const saveChecklistConfig = async (nextGroups: OnboardingChecklistGroup[]) => {
    setSavingChecklist(true);
    try {
      await setDoc(doc(salesDb, 'onboarding_config', CHECKLIST_CONFIG_DOC), {
        groups: nextGroups,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.name,
      });
      setGroups(nextGroups);
      setEditingChecklist(false);
      toast.success('체크리스트가 저장되었습니다.');
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.code === 'permission-denied' ? 'Firestore 권한 오류' : e?.message ?? '오류'}`);
    } finally {
      setSavingChecklist(false);
    }
  };

  const toggleItem = useCallback(async (id: string) => {
    const next = { ...progress, [id]: !progress[id] };
    setProgress(next);
    try {
      await setDoc(doc(salesDb, 'onboarding_progress', currentUser.uid), {
        items: next,
        userName: currentUser.name,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.code === 'permission-denied' ? 'Firestore 권한 오류 (규칙 추가 필요)' : e?.message ?? '오류'}`);
      setProgress(progress); // 롤백
    }
  }, [progress, currentUser.uid, currentUser.name, toast]);

  const handleImportToSop = useCallback(async (silent = false) => {
    setImporting(true);
    try {
      const existingSnap = await getDocs(collection(salesDb, 'sop_documents'));
      const existingIds = new Set(existingSnap.docs.map(d => d.id));
      const now = new Date().toISOString();
      let created = 0;
      for (const d of ONBOARDING_DOCS) {
        if (existingIds.has(d.id)) continue;
        const payload: Record<string, unknown> = {
          id: d.id,
          title: d.title,
          category: '온보딩',
          steps: [],
          content: d.content,
          authorId: currentUser.uid,
          authorName: currentUser.name,
          createdAt: now,
          updatedAt: now,
        };
        // Firestore는 undefined 필드를 거부하므로, 값이 있을 때만 키를 넣는다
        if (d.role !== 'both') payload.note = `대상: ${ROLE_LABEL[d.role]}`;
        await setDoc(doc(salesDb, 'sop_documents', d.id), payload);
        created++;
      }
      if (!silent || created > 0) {
        toast.success(created > 0 ? `${created}개 문서를 SOP에 가져왔습니다.` : '이미 모두 가져와져 있습니다.');
      }
    } catch (e: any) {
      if (!silent) toast.error(`가져오기 실패: ${e?.code === 'permission-denied' ? 'Firestore 권한 오류' : e?.message ?? '오류'}`);
      else console.error('온보딩 SOP 자동 가져오기 실패', e);
    } finally {
      setImporting(false);
    }
  }, [currentUser.uid, currentUser.name, toast]);

  // 관리자가 온보딩 화면에 처음 진입하면 자동으로 1회 시도 (버튼을 못 찾아도 카테고리가 뜨도록)
  useEffect(() => {
    if (isAdmin) handleImportToSop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  return (
    <div className="min-h-[70vh]">
      <div className="flex items-center gap-3 mb-1">
        <GraduationCap size={20} className="text-stone-600 dark:text-stone-400 shrink-0" />
        <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">온보딩</h1>
      </div>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">가맹관리본부 신규 입사자용 첫 주 체크리스트와 업무 매뉴얼입니다.</p>

      {/* 첫 주 체크리스트 위젯 */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-stone-900 dark:text-stone-100">입사 첫 주 체크리스트</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400">{checkedCount} / {allItems.length} 완료</span>
            {isAdmin && (
              <button onClick={() => setEditingChecklist(true)} className="flex items-center gap-1 text-xs font-bold text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
                <Pencil size={12} /> 편집
              </button>
            )}
          </div>
        </div>
        <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>

        {loading ? (
          <div className="text-center py-8 text-stone-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.id}>
                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest mb-2">{group.day}</p>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const done = !!progress[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`w-full flex items-start gap-2.5 text-left px-2.5 py-1.5 rounded-lg transition-colors ${done ? 'text-stone-400 dark:text-stone-600' : 'text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'}`}
                      >
                        {done ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle size={16} className="text-stone-300 dark:text-stone-600 shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm leading-snug ${done ? 'line-through' : ''}`}>{item.text}</span>
                        {item.role && (
                          <span className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                            {ROLE_LABEL[item.role]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={onOpenSop} className="mt-5 flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
          <BookOpen size={13} /> Week 1 마무리 질문(정답 포함)은 업무규정 &gt; 온보딩 &gt; 「입사 첫 주 체크리스트」 문서에서 확인 <ChevronRight size={13} />
        </button>
      </div>

      {/* 매뉴얼 목록 */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-stone-900 dark:text-stone-100">업무 매뉴얼</h2>
          {isAdmin && (
            <button onClick={() => handleImportToSop(false)} disabled={importing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-black hover:opacity-80 disabled:opacity-40">
              <UploadCloud size={13} /> {importing ? '가져오는 중...' : 'SOP로 가져오기'}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {ONBOARDING_DOCS.map(d => (
            <button key={d.id} onClick={onOpenSop}
              className="w-full text-left bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 hover:border-stone-400 dark:hover:border-stone-500 transition-colors flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{d.title}</p>
                  {d.role !== 'both' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <Users size={9} /> {ROLE_LABEL[d.role]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{d.summary}</p>
              </div>
              <ChevronRight size={14} className="text-stone-300 dark:text-stone-600 shrink-0" />
            </button>
          ))}
        </div>
        <p className="text-[11px] text-stone-400 mt-3">문서는 업무규정(SOP) &gt; 온보딩 카테고리에서 전체 내용을 볼 수 있습니다.</p>
      </div>

      {editingChecklist && (
        <OnboardingChecklistEditor
          initial={groups}
          onSave={saveChecklistConfig}
          onClose={() => setEditingChecklist(false)}
          saving={savingChecklist}
        />
      )}
    </div>
  );
}
