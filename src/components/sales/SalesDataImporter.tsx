import React, { useState } from 'react';
import Papa from 'papaparse';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../Toast';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';

const CHUNK_SIZE = 499; // Firestore max batch write: 500

/**
 * 일별 CSV의 영업매장명 → 표준 매장 요약명 변환
 * 규칙: '달빛에구운고등어' 접두어 제거 → 괄호 제거 → 공백 제거
 * 단, 브랜드명 자체가 다른 경우(맛있는그림, 주식회사 등)는 그대로 유지
 */
function normalizeDailyStoreName(raw: string): string {
  let s = String(raw).trim();

  // 소계/합계 행의 매장명 → 건너뜀 (빈 문자열 반환)
  if (s.startsWith('소계') || s.startsWith('합계') || /^\d+개$/.test(s)) return '';

  // '달빛에구운고등어' 제거 (앞뒤 공백, 괄호 포함)
  s = s.replace('달빛에구운고등어', '').trim();
  // 남은 괄호 제거
  s = s.replace(/[()]/g, '').trim();

  return s;
}

/**
 * 일별 CSV 날짜 유효성 검사
 * YYYY-MM-DD 형태이고, '소계:' 로 시작하지 않아야 함
 */
function isValidDate(raw: any): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.startsWith('소계') || s.startsWith('합계') || s === '일자') return false;
  // 날짜 형식: 2026-04-07
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function SalesDataImporter({ activeBrand }: { activeBrand: string | null }) {
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'monthly' | 'daily'>('monthly');
  const [lastCount, setLastCount] = useState<number | null>(null);

  // ── 월별 처리 ──────────────────────────────────────────────
  const handleMonthlyFile = (file: File) => {
    setIsUploading(true);
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

            // 결정론적 ID: 같은 기간+매장 재업로드 시 자동 덮어쓰기
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
          await commitInChunks(records, 'monthly_sales');
          setLastCount(records.length);
          if (records.length > 0) {
            toast.success(`${records.length}건의 월별 데이터가 저장되었습니다!`);
          } else {
            toast.error('유효한 월별 데이터가 없습니다. 파일 형식을 확인하세요.');
          }
        } catch (err: any) {
          console.error(err);
          toast.error(`저장 오류: ${err?.message ?? '알 수 없는 오류'}`);
        } finally {
          setIsUploading(false);
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
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawText = e.target?.result as string;
        const lines = rawText.split(/\r?\n/);

        /**
         * 실제 헤더 행 찾기:
         * - '일자'와 '영업매장'과 '총매출'을 모두 포함하는 첫 행
         * - myExcel(71).csv 는 3번째 줄(index 2)이 실제 컬럼 헤더
         */
        const headerIndex = lines.findIndex(
          (l) => l.includes('일자') && l.includes('영업매장') && l.includes('총매출')
        );

        if (headerIndex < 0) {
          toast.error('헤더 행(일자, 영업매장, 총매출)을 찾을 수 없습니다. 파일을 확인하세요.');
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

                // ① 날짜 유효성 검사 (소계, 합계 행 제외)
                if (!isValidDate(dateRaw)) continue;

                // ② 매장명 정규화
                const storeName = normalizeDailyStoreName(storeRaw);
                if (!storeName) continue; // 소계/합계 행인 경우

                // ③ 매출 파싱
                const totalSales = Number(String(salesRaw ?? '0').replace(/,/g, '').trim()) || 0;

                // 결정론적 ID: 같은 날짜+매장 재업로드 시 자동 덮어쓰기
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

              await commitInChunks(records, 'daily_sales');
              setLastCount(records.length);
              if (records.length > 0) {
                toast.success(`${records.length}건의 일별 데이터가 저장되었습니다!`);
              } else {
                toast.error('유효한 일별 데이터가 없습니다. 헤더 형식을 확인하세요.');
              }
            } catch (err: any) {
              console.error(err);
              toast.error(`저장 오류: ${err?.message ?? '알 수 없는 오류'}`);
            } finally {
              setIsUploading(false);
            }
          },
          error: (err) => {
            toast.error(`CSV 파싱 오류: ${err.message}`);
            setIsUploading(false);
          },
        });
      } catch (err: any) {
        console.error(err);
        toast.error(`파일 읽기 오류: ${err?.message}`);
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error('파일을 읽을 수 없습니다.');
      setIsUploading(false);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // ── Firestore 청크 쓰기 (결정론적 ID → 재업로드 시 덮어쓰기) ──────
  const commitInChunks = async (records: any[], collName: string) => {
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      records.slice(i, i + CHUNK_SIZE).forEach((r) => {
        const { docId, ...data } = r;
        // docId를 문서 ID로 사용 → 동일 기간+매장 재업로드 시 덮어쓰기
        const ref = doc(db, collName, docId);
        batch.set(ref, { ...data, id: docId });
      });
      await batch.commit();
    }
  };

  // ── 파일 선택 핸들러 ─────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 동일 파일 재선택 허용
    if (!file) return;
    setLastCount(null);
    if (uploadType === 'daily') {
      handleDailyFile(file);
    } else {
      handleMonthlyFile(file);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
      <div className="max-w-md mx-auto space-y-6">
        <Upload className="h-12 w-12 mx-auto text-blue-500 mb-4" />

        <h3 className="text-lg font-bold text-slate-800 dark:text-white">매출 데이터 업로드</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          CSV 파일을 업로드하면 DB에 저장되어 실시간 공유됩니다.
        </p>

        <div className="flex gap-4 justify-center mt-6">
          <label
            className={`flex-1 cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
              uploadType === 'monthly'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="uploadType"
              className="sr-only"
              checked={uploadType === 'monthly'}
              onChange={() => { setUploadType('monthly'); setLastCount(null); }}
            />
            <FileSpreadsheet size={24} />
            <span className="font-medium text-sm">월별 데이터</span>
            <span className="text-xs opacity-60">sales_YYYYMM.csv</span>
          </label>
          <label
            className={`flex-1 cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
              uploadType === 'daily'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="uploadType"
              className="sr-only"
              checked={uploadType === 'daily'}
              onChange={() => { setUploadType('daily'); setLastCount(null); }}
            />
            <FileSpreadsheet size={24} />
            <span className="font-medium text-sm">일별 데이터</span>
            <span className="text-xs opacity-60">myExcel (N).csv</span>
          </label>
        </div>

        <div className="relative mt-6">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <button
            disabled={isUploading}
            className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
            {isUploading ? '업로드 중...' : 'CSV 파일 선택 및 업로드'}
          </button>
        </div>

        {lastCount !== null && lastCount > 0 && (
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <CheckCircle2 size={16} />
            마지막 업로드: {lastCount.toLocaleString()}건 완료
          </div>
        )}

        <div className="text-left bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">📋 파일 형식 안내</p>
          <p>• <strong>월별:</strong> 헤더 — 년-월, 총매출, 매장_요약, 도시, 시군</p>
          <p>• <strong>일별:</strong> 헤더 — 일자, 영업매장, 총매출 (멀티 헤더 행 자동 감지)</p>
          <p>• 소계/합계 행은 자동으로 제외됩니다.</p>
          <p>• 인코딩: UTF-8 (한글 깨짐 시 Excel에서 UTF-8로 저장 후 재시도)</p>
        </div>
      </div>
    </div>
  );
}
