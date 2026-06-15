import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { salesDb as db, db as mainDb } from '../../firebase';
import { collection, getDocs, addDoc, query, where, writeBatch, doc } from 'firebase/firestore';
import { BrandId, Brand, DEFAULT_BRANDS, TeamSetting, Employee, Department } from '../../types';
import { FcdaumStore } from '../../fcdaum';
import { addDays } from '../../utils';
import { useToast } from '../Toast';

interface Props {
  store: FcdaumStore;
  onClose: () => void;
  onCreated: () => void;
}

export function FcdaumScheduleCreateModal({ store, onClose, onCreated }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [teams, setTeams] = useState<TeamSetting[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [form, setForm] = useState({
    brandId: '' as BrandId | '',
    storeNumber: '',
    team: '',
    supervisor: '',
    supervisorId: '',
    openDate: '',
    constructionStart: '',
    constructionEnd: '',
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      getDocs(collection(mainDb, 'brands')),
      getDocs(collection(db, 'team_settings')),
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'departments')),
    ]).then(([brandSnap, teamSnap, empSnap, deptSnap]) => {
      const loadedBrands = brandSnap.docs.map(d => ({ id: d.id, ...d.data() } as Brand));
      setBrands(loadedBrands.length > 0 ? loadedBrands : DEFAULT_BRANDS);
      setTeams(teamSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeamSetting)));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.isActive && e.position === '슈퍼바이저'));
      setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    });
  }, []);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.brandId) { toast.error('브랜드를 선택해주세요.'); return; }
    if (!form.storeNumber.trim()) { toast.error('매장 호수를 입력해주세요.'); return; }
    const brandId = form.brandId as BrandId;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'franchise_schedules'), {
        brandId,
        storeId: store.storeId,
        storeName: store.storeNm,
        storeNumber: form.storeNumber.trim(),
        team: form.team,
        supervisor: form.supervisor,
        ...(form.supervisorId ? { supervisorId: form.supervisorId } : {}),
        openDate: form.openDate,
        constructionStart: form.constructionStart,
        constructionEnd: form.constructionEnd,
        notes: form.notes,
        showInCalendar: true,
        archived: false,
        checklistData: {},
        progressCheck: { drawingUpload: false, ovenOrder: false, ownerGuide: false, equipmentOrder: false, internetOrder: false, initialEntry: false },
        ovenIn: '', ovenEnd: '', burnerIn: '', initialStockIn: '', initialStockEnd: '',
        preTrainingStart: '', preTrainingEnd: '', trainingStart: '', trainingEnd: '',
        softOpenDate: '', ownerGuideStart: '', equipmentIn: '',
        preTrainingLocation: '', preTrainingDays: 0, preTrainingParticipants: 0, preTrainingPayment: '',
        finalDrawingPdfUrl: '', finalDrawingPdfs: [],
        createdAt: now, updatedAt: now,
      });

      // 오픈일이 있으면 task_templates → department_tasks 자동 생성
      if (form.openDate) {
        const templateSnap = await getDocs(
          query(collection(mainDb, 'task_templates'), where('brandId', '==', brandId))
        );
        if (!templateSnap.empty) {
          const batch = writeBatch(db);
          templateSnap.forEach(tDoc => {
            const template = tDoc.data();
            batch.set(doc(collection(db, 'department_tasks')), {
              scheduleId: docRef.id,
              brandId,
              departmentId: template.departmentId,
              title: template.title,
              status: 'pending',
              dueDate: addDays(form.openDate, template.dDayOffset || 0),
              dDayOffset: template.dDayOffset || 0,
              createdAt: now,
              updatedAt: now,
            });
          });
          await batch.commit();
          toast.success(`${store.storeNm} 가맹 일정 등록 + 부서 업무 ${templateSnap.size}건 자동 생성`);
        } else {
          toast.success(`${store.storeNm} 가맹 일정이 등록되었습니다.`);
        }
      } else {
        toast.success(`${store.storeNm} 가맹 일정이 등록되었습니다. (오픈일 입력 시 업무 자동 생성)`);
      }

      onCreated();
    } catch (e) {
      console.error(e);
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">가맹 일정 생성</h2>
            <p className="text-xs text-slate-400 mt-0.5">FC다움 연동 · {store.storeNm}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* FC다움 데이터 미리보기 */}
        <div className="mx-5 mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-xs space-y-1">
          <p className="font-bold text-blue-700 dark:text-blue-400 mb-1.5">FC다움 정보 (자동 연결)</p>
          <div className="flex gap-2 text-slate-600 dark:text-slate-400">
            <span className="text-slate-400 w-16">매장코드</span><span className="font-bold">{store.storeId}</span>
          </div>
          <div className="flex gap-2 text-slate-600 dark:text-slate-400">
            <span className="text-slate-400 w-16">대표자</span><span>{store.storeCeo}</span>
          </div>
          <div className="flex gap-2 text-slate-600 dark:text-slate-400">
            <span className="text-slate-400 w-16">주소</span><span className="truncate">{store.address}</span>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">브랜드 <span className="text-rose-500">*</span></label>
            <select
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500"
              value={form.brandId}
              onChange={e => set('brandId', e.target.value)}
            >
              <option value="">브랜드 선택</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">매장 호수 <span className="text-rose-500">*</span></label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                placeholder="예: 125호"
                value={form.storeNumber}
                onChange={e => set('storeNumber', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">오픈 예정일</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                value={form.openDate}
                onChange={e => set('openDate', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">담당 팀</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                value={form.team}
                onChange={e => set('team', e.target.value)}
              >
                <option value="">팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">담당 SV</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                value={form.supervisorId}
                onChange={e => {
                  const emp = employees.find(sv => sv.id === e.target.value);
                  setForm(prev => ({ ...prev, supervisorId: e.target.value, supervisor: emp?.name || '' }));
                }}
              >
                <option value="">SV 선택</option>
                {employees.map(emp => {
                  const dept = departments.find(d => d.id === emp.departmentId);
                  return <option key={emp.id} value={emp.id}>{emp.name}{dept ? ` (${dept.name})` : ''}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">공사 시작일</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.constructionStart} onChange={e => set('constructionStart', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">공사 종료일</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500" value={form.constructionEnd} onChange={e => set('constructionEnd', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">특이사항</label>
            <textarea rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-bold focus:outline-none focus:border-indigo-500 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {form.openDate && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              ✓ 오픈일 기준으로 부서별 업무가 자동 생성됩니다.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <Plus size={15} /> {saving ? '생성 중...' : '가맹 일정 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
