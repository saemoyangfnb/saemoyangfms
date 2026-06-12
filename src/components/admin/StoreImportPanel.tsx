import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { salesDb } from '../../firebase';
import { collection, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { Store, FranchiseSchedule } from '../../types';
import { Upload, CheckCircle2, AlertCircle, Info, Eye } from 'lucide-react';
import { useToast } from '../Toast';
import { StoreMappingModal } from './StoreMappingModal';

interface ParsedRow {
  id: string;
  storeCode: string;
  name: string;
  region: string;
  address: string;
  status: string;
  franchiseType: string;
  contractStatus: string;
  ceoName: string;
  operatorName: string;
  phone: string;
  mobile: string;
  email: string;
  openDate: string;
  seatCount?: number;
  registeredAt: string;
}

type RowState = 'new' | 'changed' | 'unchanged';

interface PreviewRow {
  state: RowState;
  parsed: ParsedRow;
  existing?: Store;
}

function parseDate(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-');
  // Excel serial date
  const n = Number(val);
  if (!isNaN(n) && n > 40000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return s.slice(0, 10);
}

function parseRows(sheet: XLSX.WorkSheet): ParsedRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map(r => ({
    id: String(r['관리번호'] || '').trim(),
    storeCode: String(r['매장코드'] || '').trim(),
    name: String(r['매장명'] || '').trim(),
    region: String(r['지역'] || '').trim(),
    address: String(r['주소'] || '').trim(),
    status: String(r['운영상태'] || '').trim(),
    franchiseType: String(r['가맹/직영'] || '').trim(),
    contractStatus: String(r['계약상태'] || '').trim(),
    ceoName: String(r['대표자명'] || '').trim(),
    operatorName: String(r['운영자명'] || '').trim(),
    phone: String(r['전화번호'] || '').trim(),
    mobile: String(r['휴대전화'] || '').trim(),
    email: String(r['이메일'] || '').trim(),
    openDate: parseDate(r['개점일']),
    seatCount: Number(r['좌석수']) || undefined,
    registeredAt: parseDate(r['등록일']),
  })).filter(r => r.id && r.name);
}

export function StoreImportPanel() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [unmappedStores, setUnmappedStores] = useState<Store[]>([]);
  const [schedules, setSchedules] = useState<FranchiseSchedule[]>([]);
  const [skippedMerged, setSkippedMerged] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = parseRows(ws);

    // 기존 stores + 합치기 blocklist 로드
    const [existingSnap, mergedSnap] = await Promise.all([
      getDocs(collection(salesDb, 'stores')),
      getDoc(doc(salesDb, 'store_settings', 'merged_ids')),
    ]);
    const existingMap = new Map<string, Store>();
    existingSnap.forEach(d => existingMap.set(d.id, { id: d.id, ...d.data() } as Store));
    const mergedIds = new Set<string>((mergedSnap.data()?.ids as string[] | undefined) ?? []);

    const skipped = parsed.filter(p => mergedIds.has(p.id));
    setSkippedMerged(skipped.length);

    const rows: PreviewRow[] = parsed.filter(p => !mergedIds.has(p.id)).map(p => {
      const existing = existingMap.get(p.id);
      if (!existing) return { state: 'new' as const, parsed: p };
      const changed = existing.name !== p.name || existing.status !== p.status ||
        existing.openDate !== p.openDate || existing.address !== p.address;
      return { state: changed ? 'changed' as const : 'unchanged' as const, parsed: p, existing };
    });
    setPreview(rows);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!preview) return;
    const toWrite = preview.filter(r => r.state !== 'unchanged');
    if (toWrite.length === 0) { toast.error('변경된 데이터가 없습니다.'); return; }

    setImporting(true);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(salesDb);
      toWrite.forEach(r => {
        const store: Store = {
          ...r.parsed,
          scheduleId: r.existing?.scheduleId,
          importedAt: now,
        } as Store;
        // undefined 제거
        const clean = Object.fromEntries(Object.entries(store).filter(([, v]) => v !== undefined));
        batch.set(doc(salesDb, 'stores', r.parsed.id), clean, { merge: true });
      });
      await batch.commit();
      toast.success(`${toWrite.length}개 매장 저장 완료`);

      // 매핑 팝업: scheduleId 없는 신규 매장
      const newStores = toWrite
        .filter(r => r.state === 'new')
        .map(r => ({ ...r.parsed, importedAt: now } as Store));
      if (newStores.length > 0) {
        const schSnap = await getDocs(collection(salesDb, 'franchise_schedules'));
        setSchedules(schSnap.docs.map(d => ({ id: d.id, ...d.data() } as FranchiseSchedule)));
        setUnmappedStores(newStores);
        setShowMapping(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const stateCounts = preview ? {
    new: preview.filter(r => r.state === 'new').length,
    changed: preview.filter(r => r.state === 'changed').length,
    unchanged: preview.filter(r => r.state === 'unchanged').length,
  } : null;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm p-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400 font-medium">
        <Info size={14} className="shrink-0 mt-0.5" />
        임포트 전 Firestore 콘솔에서 stores 컬렉션을 내보내기(백업)하는 것을 권장합니다. 저장 버튼 클릭 전까지 실제 데이터에 영향을 주지 않습니다.
      </div>

      {/* 파일 드롭존 */}
      <div
        className="border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-sm p-8 text-center cursor-pointer hover:border-stone-500 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={24} className="mx-auto text-stone-400 mb-2" />
        <p className="text-sm font-bold text-stone-600 dark:text-stone-400">매장 엑셀 파일을 클릭하여 선택</p>
        <p className="text-xs text-stone-400 mt-1">지원 형식: .xlsx — 매장_YYYYMMDD_HHMMSS.xlsx</p>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
      </div>

      {/* 미리보기 */}
      {preview && stateCounts && (
        <div className="space-y-3">
          {skippedMerged > 0 && (
            <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <Info size={13} className="shrink-0" />
              합치기로 삭제된 매장 <span className="font-black text-stone-700 dark:text-stone-200">{skippedMerged}개</span>가 엑셀에 있지만 임포트에서 자동 제외되었습니다.
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <CheckCircle2 size={13} /> 신규 {stateCounts.new}개
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
              <AlertCircle size={13} /> 변경 {stateCounts.changed}개
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-stone-50 border border-stone-200 text-stone-500 text-xs font-bold">
              <Eye size={13} /> 변경없음 {stateCounts.unchanged}개
            </span>
            <span className="ml-auto text-xs text-stone-400">총 {preview.length}건</span>
          </div>

          <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-sm max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-stone-100 dark:bg-stone-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">상태</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">관리번호</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">매장명</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">운영상태</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">지역</th>
                  <th className="px-3 py-2 text-left font-bold text-stone-500 tracking-widest">개점일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {preview.map(r => (
                  <tr key={r.parsed.id} className={
                    r.state === 'new' ? 'bg-emerald-50/60 dark:bg-emerald-900/10' :
                    r.state === 'changed' ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''
                  }>
                    <td className="px-3 py-1.5 font-bold">
                      {r.state === 'new' && <span className="text-emerald-600">신규</span>}
                      {r.state === 'changed' && <span className="text-blue-600">변경</span>}
                      {r.state === 'unchanged' && <span className="text-stone-400">동일</span>}
                    </td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-400">{r.parsed.id}</td>
                    <td className="px-3 py-1.5 font-bold text-stone-800 dark:text-stone-200">{r.parsed.name}</td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-400">{r.parsed.status}</td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-400">{r.parsed.region}</td>
                    <td className="px-3 py-1.5 text-stone-600 dark:text-stone-400">{r.parsed.openDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={importing || stateCounts.new + stateCounts.changed === 0}
              className="px-6 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-black rounded-sm hover:bg-stone-800 transition-all disabled:opacity-40 shadow-sm"
            >
              {importing ? '저장 중...' : `${stateCounts.new + stateCounts.changed}개 저장`}
            </button>
          </div>
        </div>
      )}

      {showMapping && (
        <StoreMappingModal
          newStores={unmappedStores}
          schedules={schedules}
          onClose={() => setShowMapping(false)}
        />
      )}
    </div>
  );
}
