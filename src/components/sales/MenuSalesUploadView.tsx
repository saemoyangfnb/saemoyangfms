import React, { useState, useRef } from 'react';
import { BrandId, MenuSalesRecord } from '../../types';
import { salesDb } from '../../firebase';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';
import { UploadCloud, FileText, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';

// ==========================================
// CSV 파싱 유틸
// ==========================================

const SKIP_CATEGORIES = ['000', '티오더전용', '하이오더전용', '안쓰는 메뉴', '테이블오더x'];

/** firstpos CSV의 숫자 문자열 → number (따옴표·쉼표 제거) */
const parseNumber = (s: string): number => {
  const cleaned = s.replace(/[",]/g, '').trim();
  return cleaned === '' ? 0 : Number(cleaned) || 0;
};

/** 매장명에서 브랜드 접두사 제거 → 축약명 */
const toShortName = (storeName: string): string => {
  return storeName
    .replace('달빛에구운고등어', '')
    .replace('만수식당', '')
    .replace('얌스', '')
    .replace('봄초밥여름소바', '')
    .replace('노을에구운짚불쭈꾸미', '')
    .trim()
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .trim();
};

/** firstpos CSV 텍스트 파싱 → MenuSalesRecord 배열 */
const parseFirstposCsv = (text: string, brandId: BrandId, yearMonth: string): MenuSalesRecord[] => {
  // 줄 분리 (CRLF 대응)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1행: 제목(매장순위) → 스킵, 2행: 헤더 → 인덱스 파악
  // 실제 데이터는 3행~
  if (lines.length < 3) return [];

  // Papa처럼 따옴표 포함 CSV를 직접 파싱
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  const headerRow = parseLine(lines[1]);
  const idx = {
    store:    headerRow.indexOf('매장'),
    cat1:     headerRow.indexOf('대분류'),
    cat2:     headerRow.indexOf('중분류'),
    menuName: headerRow.indexOf('상품명'),
    quantity: headerRow.indexOf('수량'),
    total:    headerRow.indexOf('총매출액'),
    discount: headerRow.indexOf('할인액'),
    net:      headerRow.indexOf('실매출액'),
  };

  const records: MenuSalesRecord[] = [];
  const now = new Date().toISOString();

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    // 소계/합계 행 스킵
    if (line.startsWith('소계:') || line.startsWith('합계')) continue;

    const cols = parseLine(line);
    if (cols.length < 8) continue;

    const storeName = cols[idx.store]?.trim() || '';
    const cat1 = cols[idx.cat1]?.trim() || '';
    const menuName = cols[idx.menuName]?.trim() || '';

    if (!storeName || !menuName) continue;

    // 제외 카테고리
    if (SKIP_CATEGORIES.includes(cat1)) continue;

    // 옵션 카테고리: 공기밥만 포함
    if (cat1 === '옵션' && menuName !== '공기밥') continue;

    const quantity = parseNumber(cols[idx.quantity] || '0');
    const totalSales = parseNumber(cols[idx.total] || '0');
    const discount = parseNumber(cols[idx.discount] || '0');
    const netSales = parseNumber(cols[idx.net] || '0');

    // 실매출 0이고 수량도 0인 행 스킵 (직원호출, 물컵 등)
    if (netSales === 0 && quantity === 0) continue;

    records.push({
      id: '',
      brandId,
      yearMonth,
      storeName,
      storeShortName: toShortName(storeName),
      category1: cat1,
      menuName,
      quantity,
      totalSales,
      discount,
      netSales,
      createdAt: now,
    });
  }

  return records;
};

// ==========================================
// 컴포넌트
// ==========================================

interface Props {
  activeBrand: BrandId | null;
  onUploaded?: () => void;
}

export function MenuSalesUploadView({ activeBrand, onUploaded }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [parsed, setParsed] = useState<MenuSalesRecord[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBrand) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const records = parseFirstposCsv(text, activeBrand, yearMonth);
      setParsed(records);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSave = async () => {
    if (!parsed || parsed.length === 0 || !activeBrand) return;

    // 기존 데이터 확인
    const q = query(
      collection(salesDb, 'menu_sales'),
      where('brandId', '==', activeBrand),
      where('yearMonth', '==', yearMonth)
    );
    const existing = await getDocs(q);

    if (!existing.empty) {
      const ok = await confirm({
        title: '기존 데이터 덮어쓰기',
        message: `${yearMonth} 데이터가 이미 ${existing.size}건 존재합니다. 삭제 후 새로 저장할까요?`,
        confirmLabel: '덮어쓰기',
        variant: 'warning',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      // 기존 삭제
      if (!existing.empty) {
        const delBatch = writeBatch(salesDb);
        existing.docs.forEach(d => delBatch.delete(d.ref));
        await delBatch.commit();
      }

      // 새 데이터 저장 (500건 배치 제한)
      const BATCH_SIZE = 400;
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        const batch = writeBatch(salesDb);
        parsed.slice(i, i + BATCH_SIZE).forEach(record => {
          const ref = doc(collection(salesDb, 'menu_sales'));
          const { id: _id, ...data } = record;
          batch.set(ref, data);
        });
        await batch.commit();
      }

      toast.success(`${parsed.length}건 저장 완료`);
      setParsed(null);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded?.();
    } catch (err) {
      toast.error('저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setSaving(false);
    }
  };

  // 미리보기용 매장별 집계
  const storeStats = parsed
    ? Object.values(
        parsed.reduce<Record<string, { store: string; rows: number; netSales: number }>>((acc, r) => {
          if (!acc[r.storeShortName]) acc[r.storeShortName] = { store: r.storeShortName, rows: 0, netSales: 0 };
          acc[r.storeShortName].rows += 1;
          acc[r.storeShortName].netSales += r.netSales;
          return acc;
        }, {})
      ).sort((a, b) => b.netSales - a.netSales)
    : [];

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
        <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 mb-4 uppercase tracking-widest">
          1. 업로드 기간 선택
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setParsed(null); }}
            className="border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-white rounded px-3 py-2 text-sm font-bold"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={e => { setMonth(Number(e.target.value)); setParsed(null); }}
            className="border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-white rounded px-3 py-2 text-sm font-bold"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            → <span className="font-bold text-stone-800 dark:text-white">{yearMonth}</span> 데이터로 저장됩니다
          </span>
        </div>
      </div>

      {/* 파일 업로드 */}
      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
        <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 mb-4 uppercase tracking-widest">
          2. firstpos CSV 파일 선택
        </h3>
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-sm p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
          <UploadCloud size={32} className="text-stone-400" />
          <div className="text-center">
            <p className="text-sm font-bold text-stone-700 dark:text-stone-300">
              {fileName || 'CSV 파일을 클릭하여 선택'}
            </p>
            <p className="text-xs text-stone-400 mt-1">매장순위(상품) 형식의 firstpos CSV</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {/* 파싱 미리보기 */}
      {parsed !== null && (
        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-widest">
              3. 파싱 결과 확인
            </h3>
            <div className="flex items-center gap-2">
              {parsed.length > 0
                ? <CheckCircle size={16} className="text-green-500" />
                : <AlertCircle size={16} className="text-red-500" />}
              <span className="text-sm font-bold text-stone-700 dark:text-stone-300">
                총 {parsed.length}건 파싱됨
              </span>
            </div>
          </div>

          {parsed.length === 0 ? (
            <p className="text-sm text-red-500">파싱된 데이터가 없습니다. CSV 형식을 확인해주세요.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="text-left py-2 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">매장</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">항목수</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-stone-500 uppercase tracking-wider">실매출 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeStats.map(s => (
                      <tr key={s.store} className="border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700/30">
                        <td className="py-2 px-3 font-bold text-stone-800 dark:text-white">{s.store}</td>
                        <td className="py-2 px-3 text-right text-stone-600 dark:text-stone-400">{s.rows}건</td>
                        <td className="py-2 px-3 text-right font-bold text-stone-800 dark:text-white">
                          {s.netSales.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-300 dark:border-stone-600">
                      <td className="py-2 px-3 font-black text-stone-900 dark:text-white">합계</td>
                      <td className="py-2 px-3 text-right font-bold text-stone-700 dark:text-stone-300">
                        {parsed.length}건
                      </td>
                      <td className="py-2 px-3 text-right font-black text-stone-900 dark:text-white">
                        {parsed.reduce((s, r) => s + r.netSales, 0).toLocaleString()}원
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  onClick={() => { setParsed(null); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-stone-600 dark:text-stone-400 border border-stone-300 dark:border-stone-600 rounded hover:bg-stone-100 dark:hover:bg-stone-700"
                >
                  <Trash2 size={14} /> 취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                >
                  <FileText size={14} />
                  {saving ? '저장 중...' : `${yearMonth} 데이터 저장`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
