import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { salesDb } from '../../firebase';
import { collection, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { Store, FranchiseSchedule } from '../../types';
import { Upload, CheckCircle2, AlertCircle, Info, Eye, RefreshCw } from 'lucide-react';
import { useToast } from '../Toast';
import { StoreMappingModal } from './StoreMappingModal';
import { fetchAllStores, mapFcdaumStore } from '../../fcdaum';
import { normalizeStoreRegion } from '../../storeRegion';

interface ParsedRow {
  id: string;
  storeCode: string;
  storeNo?: string;
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
  targetId?: string; // storeNo로 매칭된 기존 문서의 실제 id (엑셀↔FC다움 임포트 경로 간 문서ID가 다른 경우)
}

// 기존 stores 문서들을 storeNo 기준으로도 조회할 수 있게 인덱싱.
// storeNo 필드가 없는(과거) 문서는 문서 id 자체가 관리번호=storeNo인 경우를 fallback으로 사용.
function buildStoreNoMap(existingMap: Map<string, Store>): Map<string, Store> {
  const map = new Map<string, Store>();
  existingMap.forEach(store => {
    const key = store.storeNo || (/^\d+$/.test(store.id) ? store.id : '');
    if (key) map.set(key, store);
  });
  return map;
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
  return rows.map(r => {
    const id = String(r['관리번호'] || '').trim();
    return {
      id,
      storeCode: String(r['매장코드'] || '').trim(),
      storeNo: id,
      name: String(r['매장명'] || '').trim(),
      region: normalizeStoreRegion(String(r['지역'] || '').trim()),
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
    };
  }).filter(r => r.id && r.name);
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
  const [skippedNoCode, setSkippedNoCode] = useState(0);
  const [fcdaumLoading, setFcdaumLoading] = useState(false);

  const handleFcdaumSync = async () => {
    setFcdaumLoading(true);
    try {
      const fcdaumStores = await fetchAllStores();
      const allParsed = fcdaumStores.map(mapFcdaumStore);
      // 매장코드(storeId)가 아직 발급 안 된 신규매장은 문서 ID로 쓸 수 없어 여기서 제외
      // (저장 시 doc(salesDb,'stores', undefined)가 SDK 내부에서 크래시나던 원인 — 배치 전체를 막았음)
      const noCode = allParsed.filter(p => !p.id);
      setSkippedNoCode(noCode.length);
      const parsed = allParsed.filter(p => !!p.id);

      const existingSnap = await getDocs(collection(salesDb, 'stores'));
      const existingMap = new Map<string, Store>();
      existingSnap.forEach(d => existingMap.set(d.id, { id: d.id, ...d.data() } as Store));
      // 엑셀(관리번호)로 먼저 등록된 매장은 문서ID가 storeId와 달라 existingMap으로는 못 찾음 →
      // storeNo(=관리번호)로도 매칭해 같은 매장을 새 문서로 중복 생성하지 않게 함
      const existingByStoreNo = buildStoreNoMap(existingMap);

      // store_settings 규칙 미배포 시 빈 Set으로 진행
      let mergedIds = new Set<string>();
      try {
        const mergedSnap = await getDoc(doc(salesDb, 'store_settings', 'merged_ids'));
        mergedIds = new Set<string>((mergedSnap.data()?.ids as string[] | undefined) ?? []);
      } catch { /* 규칙 미설정 시 무시 */ }

      const skipped = parsed.filter(p => mergedIds.has(p.id));
      setSkippedMerged(skipped.length);

      const rows: PreviewRow[] = parsed.filter(p => !mergedIds.has(p.id)).map(p => {
        const existing = existingMap.get(p.id) ?? (p.storeNo ? existingByStoreNo.get(p.storeNo) : undefined);
        if (!existing) return { state: 'new' as const, parsed: p };
        const changed = existing.name !== p.name || existing.status !== p.status ||
          existing.address !== p.address || existing.region !== p.region;
        return { state: changed ? 'changed' as const : 'unchanged' as const, parsed: p, existing, targetId: existing.id };
      });
      setPreview(rows);
      toast.success(`FC다움에서 ${parsed.length}개 매장 불러옴${noCode.length > 0 ? ` (매장코드 미발급 ${noCode.length}개 제외)` : ''}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'FC다움 API 오류');
    } finally {
      setFcdaumLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = parseRows(ws);

    // 기존 stores + 합치기 blocklist 로드
    const existingSnap = await getDocs(collection(salesDb, 'stores'));
    const existingMap = new Map<string, Store>();
    existingSnap.forEach(d => existingMap.set(d.id, { id: d.id, ...d.data() } as Store));
    // FC다움 동기화로 먼저 생성된 매장은 문서ID가 storeId라 관리번호로는 못 찾음 → storeNo로도 매칭
    const existingByStoreNo = buildStoreNoMap(existingMap);
    let mergedIds = new Set<string>();
    try {
      const mergedSnap = await getDoc(doc(salesDb, 'store_settings', 'merged_ids'));
      mergedIds = new Set<string>((mergedSnap.data()?.ids as string[] | undefined) ?? []);
    } catch { /* 규칙 미설정 시 무시 */ }

    const skipped = parsed.filter(p => mergedIds.has(p.id));
    setSkippedMerged(skipped.length);

    const rows: PreviewRow[] = parsed.filter(p => !mergedIds.has(p.id)).map(p => {
      const existing = existingMap.get(p.id) ?? (p.storeNo ? existingByStoreNo.get(p.storeNo) : undefined);
      if (!existing) return { state: 'new' as const, parsed: p };
      const changed = existing.name !== p.name || existing.status !== p.status ||
        existing.openDate !== p.openDate || existing.address !== p.address || existing.region !== p.region;
      return { state: changed ? 'changed' as const : 'unchanged' as const, parsed: p, existing, targetId: existing.id };
    });
    setPreview(rows);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!preview) return;
    const toWrite = preview.filter(r => r.state !== 'unchanged');
    if (toWrite.length === 0) { toast.error('변경된 데이터가 없습니다.'); return; }

    // 방어: 매장코드(id) 없는 행이 섞여 있으면 doc()가 undefined로 즉시 크래시해 배치 전체가 막힘
    const writable = toWrite.filter(r => !!r.parsed.id);
    if (writable.length === 0) { toast.error('저장 가능한 매장이 없습니다 (매장코드 누락).'); return; }

    setImporting(true);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(salesDb);
      writable.forEach(r => {
        const store: Store = {
          ...r.parsed,
          scheduleId: r.existing?.scheduleId,
          importedAt: now,
        } as Store;
        // undefined 제거
        const clean = Object.fromEntries(Object.entries(store).filter(([, v]) => v !== undefined));
        // storeNo로 매칭된 기존 매장이면 그 문서에 병합 — 문서ID가 다른 새 문서를 만들지 않음
        batch.set(doc(salesDb, 'stores', r.targetId ?? r.parsed.id), clean, { merge: true });
      });
      await batch.commit();
      toast.success(`${writable.length}개 매장 저장 완료`);

      // 매핑 팝업: scheduleId 없는 신규 매장
      const newStores = writable
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
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-sm p-3 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-400 font-medium">
        <Info size={14} className="shrink-0 mt-0.5" />
        FC다움 API와 매장 코드(storeId)가 동일합니다. <strong>위의 "FC다움에서 불러오기" 버튼</strong>을 사용하면 엑셀 없이 바로 동기화할 수 있습니다.
      </div>

      {/* FC다움 동기화 */}
      <button
        onClick={handleFcdaumSync}
        disabled={fcdaumLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-sm transition-colors"
      >
        <RefreshCw size={15} className={fcdaumLoading ? 'animate-spin' : ''} />
        {fcdaumLoading ? 'FC다움에서 불러오는 중...' : 'FC다움에서 매장 목록 불러오기'}
      </button>

      <div className="flex items-center gap-2 text-xs text-stone-400">
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
        또는 엑셀 파일로 직접 업로드
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
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
          {skippedNoCode > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm px-3 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle size={13} className="shrink-0" />
              FC다움에서 매장코드가 아직 발급되지 않은 신규 매장 <span className="font-black">{skippedNoCode}개</span>는 저장할 수 없어 제외되었습니다. 매장코드 발급 후 다시 불러오거나, 엑셀 업로드(관리번호 기준)로 등록해주세요.
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
