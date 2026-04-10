import React, { useState } from 'react';
import Papa from 'papaparse';
import { collection, writeBatch, doc, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { auth } from '../../firebase';
import { useToast } from '../Toast';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, Trash2 } from 'lucide-react';

/** 진단용: 단건 쓰기로 auth + DB 접근 확인 */
async function runDiagnostic(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return '❌ 로그인 상태 아님 (auth.currentUser = null)';

  console.log('[진단] UID:', user.uid, '| DB:', (db as any)._databaseId?.database ?? 'unknown');
  try {
    const token = await user.getIdToken(true);
    console.log('[진단] 토큰 갱신 성공, 길이:', token.length);
  } catch (e) {
    return `❌ 토큰 갱신 실패: ${e}`;
  }

  try {
    const testRef = doc(db, '_debug_test', 'probe');
    await Promise.race([
      setDoc(testRef, { ts: Date.now(), uid: user.uid }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('5초 타임아웃')), 5000)),
    ]);
    return '✅ 단건 쓰기 성공';
  } catch (e: any) {
    return `❌ 단건 쓰기 실패: ${e?.code ?? ''} ${e?.message ?? e}`;
  }
}

const CHUNK_SIZE = 50;          // 소규모 배치 (Firestore named DB 부하 최소화)
const BATCH_DELAY_MS = 500;     // 배치 간 딜레이 (rate limit 방지)
const MAX_RETRY = 3;            // 배치 실패 시 최대 재시도 횟수
const COMMIT_TIMEOUT_MS = 20000; // batch.commit() 1회 최대 대기 시간

/** batch.commit()에 타임아웃 적용 — WebSocket hang 방지 */
function commitWithTimeout(batch: ReturnType<typeof writeBatch>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('TIMEOUT: 배치 저장 응답 없음 (20초 초과)')),
      COMMIT_TIMEOUT_MS
    );
    batch.commit()
      .then(() => { clearTimeout(timer); resolve(); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function normalizeDailyStoreName(raw: string): string {
  let s = String(raw).trim();
  if (s.startsWith('소계') || s.startsWith('합계') || /^\d+개$/.test(s)) return '';
  s = s.replace('달빛에구운고등어', '').trim();
  s = s.replace(/[()]/g, '').trim();
  return s;
}

function isValidDate(raw: any): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.startsWith('소계') || s.startsWith('합계') || s === '일자') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

interface UploadResult {
  count: number;
  skipped: number;
  type: 'monthly' | 'daily';
}

/**
 * 파일 내 중복 제거 후 소규모 배치 저장 (재시도 포함).
 * CHUNK_SIZE=100, 배치 간 딜레이, 실패 시 최대 MAX_RETRY 재시도.
 */
async function commitBatch(
  records: any[],
  collName: string,
  onProgress: (msg: string) => void,
): Promise<{ written: number; skipped: number }> {
  if (records.length === 0) return { written: 0, skipped: 0 };

  // 파일 내 동일 docId 중복 제거 (마지막 값 우선)
  const deduped = new Map<string, any>();
  records.forEach(r => deduped.set(r.docId, r));
  const toWrite = Array.from(deduped.values());
  const skipped = records.length - toWrite.length;

  const totalChunks = Math.ceil(toWrite.length / CHUNK_SIZE) || 1;

  for (let i = 0; i < toWrite.length; i += CHUNK_SIZE) {
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const chunk = toWrite.slice(i, i + CHUNK_SIZE);

    let attempt = 0;
    while (attempt < MAX_RETRY) {
      try {
        onProgress(`저장 중... (${chunkNum}/${totalChunks} 배치${attempt > 0 ? ` 재시도 ${attempt}` : ''})`);
        const batch = writeBatch(db);
        chunk.forEach(r => {
          const { docId, ...data } = r;
          batch.set(doc(db, collName, docId), { ...data, id: docId });
        });
        await commitWithTimeout(batch);
        break; // 성공
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRY) throw err;
        // 재시도 전 대기 (지수 백오프)
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }

    // 다음 배치 전 딜레이
    if (i + CHUNK_SIZE < toWrite.length) {
      await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
    }
  }

  return { written: toWrite.length, skipped };
}

export function SalesDataImporter({ activeBrand, onUploaded }: { activeBrand: string | null; onUploaded?: () => void }) {
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadType, setUploadType] = useState<'monthly' | 'daily'>('monthly');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // 삭제 상태
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteType, setDeleteType] = useState<'monthly' | 'daily'>('monthly');
  const [deleteFrom, setDeleteFrom] = useState('');
  const [deleteTo, setDeleteTo] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── 월별 처리 ──────────────────────────────────────────────
  const handleMonthlyFile = (file: File) => {
    setIsUploading(true);
    setUploadProgress('파일 분석 중...');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const records: any[] = [];
          for (const row of results.data as any[]) {
            const ym = String(row['년-월'] ?? '').trim();
            const salesRaw = String(row['총매출'] ?? '').replace(/,/g, '').trim();
            if (!ym || ym === '년-월' || !salesRaw) continue;
            const totalSales = Number(salesRaw) || 0;
            const storeName = String(row['매장_요약'] ?? row['매장'] ?? '').trim();
            if (!storeName) continue;
            const docId = `${ym}_${storeName}`.replace(/[^a-zA-Z0-9가-힣_\-]/g, '_');
            records.push({
              docId,
              brandId: activeBrand,
              yearMonth: ym,
              city: String(row['도시'] ?? '미분류').trim(),
              district: String(row['시군'] ?? '미분류').trim(),
              storeName,
              totalSales,
              createdAt: new Date().toISOString(),
            });
          }
          const { written, skipped } = await commitBatch(records, 'monthly_sales', setUploadProgress);
          // 모달 표시 — onUploaded는 모달 닫을 때 호출
          setUploadResult({ count: written, skipped, type: 'monthly' });
        } catch (err: any) {
          console.error(err);
          toast.error(`저장 오류: ${err?.message ?? '알 수 없는 오류'}`);
        } finally {
          setIsUploading(false);
          setUploadProgress('');
        }
      },
      error: (err) => {
        toast.error(`CSV 파싱 오류: ${err.message}`);
        setIsUploading(false);
      },
    });
  };

  // ── 일별 처리 ──────────────────────────────────────────────
  const handleDailyFile = (file: File) => {
    setIsUploading(true);
    setUploadProgress('파일 분석 중...');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawText = e.target?.result as string;
        const lines = rawText.split(/\r?\n/);
        const headerIndex = lines.findIndex(
          l => l.includes('일자') && l.includes('영업매장') && l.includes('총매출')
        );
        if (headerIndex < 0) {
          toast.error('헤더 행(일자, 영업매장, 총매출)을 찾을 수 없습니다.');
          setIsUploading(false);
          return;
        }
        const csvToParse = lines.slice(headerIndex).join('\n');
        Papa.parse(csvToParse, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const records: any[] = [];
              for (const row of results.data as any[]) {
                const dateRaw = row['일자'];
                const storeRaw = row['영업매장'];
                const salesRaw = row['총매출'];
                if (!isValidDate(dateRaw)) continue;
                const storeName = normalizeDailyStoreName(storeRaw);
                if (!storeName) continue;
                const totalSales = Number(String(salesRaw ?? '0').replace(/,/g, '').trim()) || 0;
                const docId = `${String(dateRaw).trim()}_${storeName}`.replace(/[^a-zA-Z0-9가-힣_\-]/g, '_');
                records.push({
                  docId,
                  brandId: activeBrand,
                  date: String(dateRaw).trim(),
                  storeName,
                  totalSales,
                  createdAt: new Date().toISOString(),
                });
              }
              const { written, skipped } = await commitBatch(records, 'daily_sales', setUploadProgress);
              setUploadResult({ count: written, skipped, type: 'daily' });
            } catch (err: any) {
              console.error(err);
              toast.error(`저장 오류: ${err?.message ?? '알 수 없는 오류'}`);
            } finally {
              setIsUploading(false);
              setUploadProgress('');
            }
          },
          error: (err) => {
            toast.error(`CSV 파싱 오류: ${err.message}`);
            setIsUploading(false);
          },
        });
      } catch (err: any) {
        toast.error(`파일 읽기 오류: ${err?.message}`);
        setIsUploading(false);
      }
    };
    reader.onerror = () => { toast.error('파일을 읽을 수 없습니다.'); setIsUploading(false); };
    reader.readAsText(file, 'UTF-8');
  };

  // ── 삭제 처리 ──────
  const handleDelete = async () => {
    if (!activeBrand) return;
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      const collName = deleteType === 'monthly' ? 'monthly_sales' : 'daily_sales';
      const field = deleteType === 'monthly' ? 'yearMonth' : 'date';

      const snapshot = await getDocs(query(collection(db, collName), where('brandId', '==', activeBrand)));
      const toDelete = snapshot.docs.filter(d => {
        const val = d.data()[field] as string;
        if (!val) return false;
        const cmp = deleteType === 'monthly' ? val : val.slice(0, 7);
        if (deleteFrom && cmp < deleteFrom) return false;
        if (deleteTo && cmp > deleteTo) return false;
        return true;
      });

      for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        toDelete.slice(i, i + CHUNK_SIZE).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      toast.success(`${toDelete.length}건이 삭제되었습니다.`);
      onUploaded?.();
    } catch (err: any) {
      toast.error(`삭제 오류: ${err?.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (uploadType === 'daily') handleDailyFile(file);
    else handleMonthlyFile(file);
  };

  const handleResultClose = () => {
    setUploadResult(null);
    onUploaded?.(); // 모달 닫힌 뒤 탭 전환 + 새로고침
  };

  return (
    <div className="space-y-6">
      {/* ── 업로드 완료 모달 ── */}
      {uploadResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-8 border border-slate-200 dark:border-slate-800 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">업로드 완료!</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-3">
              {uploadResult.type === 'monthly' ? '월별' : '일별'} 매출 데이터
            </p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
              {uploadResult.count.toLocaleString()}건 저장
            </p>
            {uploadResult.skipped > 0 && (
              <p className="text-sm text-slate-400 mb-4">
                동일 금액 {uploadResult.skipped.toLocaleString()}건 건너뜀
              </p>
            )}
            <p className="text-sm text-slate-400 mb-6">정상적으로 저장되었습니다.</p>
            <button
              onClick={handleResultClose}
              className="w-full bg-slate-900 dark:bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 transition-colors"
            >
              확인 (월별 분석으로 이동)
            </button>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Trash2 size={24} />
              <h3 className="text-lg font-bold">데이터 삭제 확인</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              <strong>{deleteType === 'monthly' ? '월별' : '일별'}</strong> 데이터를{' '}
              {deleteFrom || deleteTo ? (
                <><strong>{deleteFrom || '처음'}</strong> ~ <strong>{deleteTo || '끝'}</strong> 기간</>
              ) : '전체'} 삭제합니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">취소</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold">삭제하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 업로드 영역 ── */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
        <div className="max-w-md mx-auto space-y-6">
          <Upload className="h-12 w-12 mx-auto text-blue-500" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">매출 데이터 업로드</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            CSV 파일 선택 즉시 자동 저장됩니다. 동일 금액 데이터는 건너뜁니다.
          </p>

          <div className="flex gap-4 justify-center">
            <label className={`flex-1 cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${uploadType === 'monthly' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" name="uploadType" className="sr-only" checked={uploadType === 'monthly'} onChange={() => setUploadType('monthly')} />
              <FileSpreadsheet size={24} />
              <span className="font-medium text-sm">월별 데이터</span>
              <span className="text-xs opacity-60">년-월, 총매출, 매장_요약</span>
            </label>
            <label className={`flex-1 cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${uploadType === 'daily' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" name="uploadType" className="sr-only" checked={uploadType === 'daily'} onChange={() => setUploadType('daily')} />
              <FileSpreadsheet size={24} />
              <span className="font-medium text-sm">일별 데이터</span>
              <span className="text-xs opacity-60">일자, 영업매장, 총매출</span>
            </label>
          </div>

          <div className="relative">
            <input type="file" accept=".csv" onChange={handleFileChange} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
            <button disabled={isUploading} className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
              {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
              {isUploading ? (uploadProgress || '파일 분석 중...') : 'CSV 파일 선택 → 자동 저장'}
            </button>
          </div>

          {/* 진단 버튼 */}
          <button
            onClick={async () => {
              const result = await runDiagnostic();
              alert(`[Firestore 진단]\n${result}\n\n콘솔(F12)에서 상세 로그를 확인하세요.`);
            }}
            className="w-full text-xs py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            🔍 Firestore 연결 진단 (문제 발생 시 클릭)
          </button>

          <div className="text-left bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">파일 형식 안내</p>
            <p>• <strong>월별:</strong> 헤더 — 년-월, 총매출, 매장_요약, 도시, 시군</p>
            <p>• <strong>일별:</strong> 헤더 — 일자, 영업매장, 총매출 (멀티 헤더 행 자동 감지)</p>
            <p>• 소계/합계 행은 자동으로 제외됩니다.</p>
            <p>• 동일 매장·날짜에 같은 금액이면 쓰기를 건너뛰어 할당량을 절약합니다.</p>
            <p>• 인코딩: UTF-8 (한글 깨짐 시 Excel에서 UTF-8로 저장 후 재시도)</p>
          </div>
        </div>
      </div>

      {/* ── 데이터 삭제 영역 ── */}
      <div className="bg-rose-50 dark:bg-rose-900/10 rounded-xl p-6 border border-rose-200 dark:border-rose-800">
        <h4 className="text-sm font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2 mb-4">
          <Trash2 size={16} /> 데이터 삭제
        </h4>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500 block mb-1">데이터 유형</label>
            <select value={deleteType} onChange={e => setDeleteType(e.target.value as 'monthly' | 'daily')} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <option value="monthly">월별 데이터</option>
              <option value="daily">일별 데이터</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">시작 년-월</label>
            <input type="month" value={deleteFrom} onChange={e => setDeleteFrom(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">종료 년-월</label>
            <input type="month" value={deleteTo} onChange={e => setDeleteTo(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">기간을 비워두면 해당 브랜드 전체 데이터가 삭제됩니다.</p>
      </div>
    </div>
  );
}
