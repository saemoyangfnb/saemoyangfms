import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { salesDb } from '../../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Employee, FranchiseSchedule } from '../../types';
import { Upload, CheckCircle2, AlertCircle, Eye, Info, Link } from 'lucide-react';
import { useToast } from '../Toast';

interface ParsedEmp {
  crmId: number;
  email: string;
  name: string;
  position: string;
  phone: string;
}

type RowState = 'matched' | 'unmatched';

interface PreviewRow {
  state: RowState;
  parsed: ParsedEmp;
  existing?: Employee;
  changes: string[];
}

function parseEmpRows(sheet: XLSX.WorkSheet): ParsedEmp[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map(r => ({
    crmId: Number(r['관리번호']) || 0,
    email: String(r['아이디(이메일)'] || '').trim(),
    name: String(r['이름'] || '').trim(),
    position: String(r['권한'] || '').trim(),
    phone: String(r['휴대전화번호'] || '').trim(),
  })).filter(r => r.name);
}

export function EmployeeImportPanel() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [doSupervisorLink, setDoSupervisorLink] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = parseEmpRows(ws);

    const existingSnap = await getDocs(collection(salesDb, 'employees'));
    const existingList = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));

    const rows: PreviewRow[] = parsed.map(p => {
      const existing = existingList.find(e => e.name === p.name);
      if (!existing) return { state: 'unmatched' as const, parsed: p, changes: ['신규 (자동 추가 안 됨 — 직원 명부에서 수동 추가)'] };
      const changes: string[] = [];
      if (p.phone && existing.phone !== p.phone) changes.push(`전화: ${existing.phone || '-'} → ${p.phone}`);
      if (p.email && existing.email !== p.email) changes.push(`이메일: ${existing.email || '-'} → ${p.email}`);
      if (existing.crmId !== p.crmId) changes.push(`CRM ID: ${existing.crmId || '-'} → ${p.crmId}`);
      return { state: 'matched' as const, parsed: p, existing, changes };
    });
    setPreview(rows);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!preview) return;
    const toUpdate = preview.filter(r => r.state === 'matched' && r.changes.length > 0);
    if (toUpdate.length === 0 && !doSupervisorLink) {
      toast.error('업데이트할 데이터가 없습니다.');
      return;
    }

    setImporting(true);
    try {
      if (toUpdate.length > 0) {
        const batch = writeBatch(salesDb);
        toUpdate.forEach(r => {
          if (!r.existing) return;
          const updates: Partial<Employee> = { crmId: r.parsed.crmId };
          if (r.parsed.phone) updates.phone = r.parsed.phone;
          if (r.parsed.email) updates.email = r.parsed.email;
          batch.update(doc(salesDb, 'employees', r.existing.id), updates);
        });
        await batch.commit();
        toast.success(`${toUpdate.length}명 직원 정보 업데이트 완료`);
      }

      if (doSupervisorLink) {
        const [empSnap, schSnap] = await Promise.all([
          getDocs(collection(salesDb, 'employees')),
          getDocs(collection(salesDb, 'franchise_schedules')),
        ]);
        const empList = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
        const schList = schSnap.docs.map(d => ({ id: d.id, ...d.data() } as FranchiseSchedule));
        const unlinked = schList.filter(s => s.supervisor && !s.supervisorId);

        if (unlinked.length > 0) {
          const batch2 = writeBatch(salesDb);
          let linked = 0;
          unlinked.forEach(sch => {
            const emp = empList.find(e => e.name === sch.supervisor);
            if (emp) {
              batch2.update(doc(salesDb, 'franchise_schedules', sch.id), { supervisorId: emp.id });
              linked++;
            }
          });
          await batch2.commit();
          toast.success(`supervisorId 자동 연결 ${linked}건 완료 (미매칭 ${unlinked.length - linked}건)`);
        } else {
          toast.success('연결할 오픈 스케줄이 없거나 이미 모두 연결되어 있습니다.');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const matched = preview?.filter(r => r.state === 'matched') ?? [];
  const hasChanges = matched.filter(r => r.changes.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm p-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400 font-medium">
        <Info size={14} className="shrink-0 mt-0.5" />
        이름으로 기존 직원과 매칭합니다. linkedUid(Firebase 계정)는 건드리지 않습니다. 신규 직원은 직원 명부에서 수동 추가하세요.
      </div>

      <div
        className="border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-sm p-8 text-center cursor-pointer hover:border-stone-500 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={24} className="mx-auto text-stone-400 mb-2" />
        <p className="text-sm font-bold text-stone-600 dark:text-stone-400">사용자 엑셀 파일을 클릭하여 선택</p>
        <p className="text-xs text-stone-400 mt-1">지원 형식: .xlsx — 사용자_YYYYMMDD_HHMMSS.xlsx</p>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <CheckCircle2 size={13} /> 매칭 {matched.length}명
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-stone-50 border border-stone-200 text-stone-500 text-xs font-bold">
              <AlertCircle size={13} /> 미매칭 {(preview.length - matched.length)}명
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
              <Eye size={13} /> 업데이트 대상 {hasChanges}명
            </span>
          </div>

          <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-sm max-h-60">
            <table className="w-full text-xs">
              <thead className="bg-stone-100 dark:bg-stone-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">이름</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">권한</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">상태</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">변경 내용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {preview.map((r, i) => (
                  <tr key={i} className={r.state === 'unmatched' ? 'opacity-50' : r.changes.length > 0 ? 'bg-blue-50/40' : ''}>
                    <td className="px-3 py-1.5 font-bold text-stone-800 dark:text-stone-200">{r.parsed.name}</td>
                    <td className="px-3 py-1.5 text-stone-500">{r.parsed.position}</td>
                    <td className="px-3 py-1.5">
                      {r.state === 'matched' ? (
                        r.changes.length > 0
                          ? <span className="text-blue-600 font-bold">업데이트</span>
                          : <span className="text-stone-400">동일</span>
                      ) : (
                        <span className="text-stone-400">미매칭</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-stone-500">{r.changes.join(' / ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={doSupervisorLink}
              onChange={e => setDoSupervisorLink(e.target.checked)}
              className="rounded border-stone-300"
            />
            <Link size={13} className="text-stone-500" />
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
              저장 후 오픈 스케줄 supervisor 이름 → supervisorId 자동 연결
            </span>
          </label>

          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={importing || (hasChanges === 0 && !doSupervisorLink)}
              className="px-6 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-black rounded-sm hover:bg-stone-800 transition-all disabled:opacity-40 shadow-sm"
            >
              {importing ? '처리 중...' : '적용'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
