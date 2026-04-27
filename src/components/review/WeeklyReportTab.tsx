import React, { useState, useEffect } from 'react';
import { reviewDb as db, db as mainDb, auth } from '../../firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, FileText, Star, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { WeeklyReport } from './types';
import { KpiCard, EmptyState } from './SharedComponents';

export function WeeklyReportTab() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const logActivity = async (action: string, details: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(mainDb, 'activity_logs'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || '관리자',
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  useEffect(() => {
    getDocs(collection(db, 'weekly_reports')).then(snap => {
      const data: WeeklyReport[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReport));
      data.sort((a, b) => b.기간_시작.localeCompare(a.기간_시작));
      setReports(data);
      if (data.length > 0) setSelectedReport(data[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleExportExcel = () => {
    if (!selectedReport) return;
    const r = selectedReport;
    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['항목', '내용'],
      ['분석 기간', `${r.기간_시작} ~ ${r.기간_종료}`],
      ['신규 리뷰 수', r.리뷰_요약.총_신규리뷰],
      ['전주 리뷰 수', r.리뷰_요약.전주_리뷰수],
      ['전주 대비 증감', r.리뷰_요약.증감],
      ['긍정 리뷰 수', r.리뷰_요약.긍정수],
      ['부정 리뷰 수', r.리뷰_요약.부정수],
      ['긍정률', r.리뷰_요약.긍정률],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), '리뷰 요약');

    if (r.리뷰_요약.매장별_집계?.length > 0) {
      const storeRows = r.리뷰_요약.매장별_집계.map(s => [s.매장명, s.이번주_리뷰수, s.지난주_리뷰수, s.증감, s.긍정, s.부정, s.긍정률]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['매장명', '이번주', '지난주', '증감', '긍정', '부정', '긍정률'], ...storeRows]), '매장별 집계');
    }

    if (r.리뷰_요약.부정_리뷰_목록?.length > 0) {
      const negRows = r.리뷰_요약.부정_리뷰_목록.map(n => [n.매장명, n.작성일, n.리뷰내용]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['매장명', '작성일', '리뷰내용'], ...negRows]), '부정 리뷰 목록');
    }

    if (r.키워드_분석?.length > 0) {
      const kwRows = r.키워드_분석.map((k: any) => [k.매장명, k.긍정_핵심키워드, k.부정_핵심키워드]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['매장명', '긍정 키워드', '부정 키워드'], ...kwRows]), '키워드 분석');
    }

    if (r.경쟁사_변동?.length > 0) {
      const compRows = r.경쟁사_변동.map(c => [c.브랜드, c.변동, c.이번주_최저가, c.지난주_최저가]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['브랜드', '변동', '이번주 최저가', '지난주 최저가'], ...compRows]), '경쟁사 가격 변동');
    }

    if (r.순위_변동) {
      const rankData: any[][] = [['구분', '매장명', '타겟 키워드', '현재 순위', '등락폭']];
      r.순위_변동.상승_매장?.forEach((m: any) => rankData.push(['상승', m.매장명, m.타겟키워드, m.현재순위, m.등락폭]));
      r.순위_변동.하락_매장?.forEach((m: any) => rankData.push(['하락', m.매장명, m.타겟키워드, m.현재순위, m.등락폭]));
      r.순위_변동.노출실패?.forEach((m: any) => rankData.push(['노출 실패', m.매장명, m.타겟키워드, '999', '-']));
      if (rankData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rankData), '순위 변동');
    }

    XLSX.writeFile(wb, `주간리포트_${r.기간_시작}_${r.기간_종료}.xlsx`);
    logActivity('엑셀 다운로드', `[주간리포트] ${r.기간_시작} ~ ${r.기간_종료} 데이터 다운로드`);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw size={20} className="text-slate-400 animate-spin mr-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400">리포트를 불러오는 중...</p>
    </div>
  );

  if (reports.length === 0) return (
    <EmptyState icon={<FileText size={20} className="text-slate-400" />} message="아직 생성된 주간 리포트가 없습니다. 서버에서 weekly_report.py를 실행해 주세요." />
  );

  const r = selectedReport;
  if (!r) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select value={selectedReport?.id || ''} onChange={e => setSelectedReport(reports.find(r => r.id === e.target.value) || null)}
          className="flex-1 max-w-xs py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none text-slate-900 dark:text-white">
          {reports.map(rep => <option key={rep.id} value={rep.id}>{rep.기간_시작} ~ {rep.기간_종료}</option>)}
        </select>
        <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Download size={14} /> 엑셀 내보내기
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="신규 리뷰" value={`${r.리뷰_요약.총_신규리뷰}건`} sub={`전주 대비 ${r.리뷰_요약.증감}건`} icon={<Activity size={16} />} />
        <KpiCard label="긍정 리뷰" value={`${r.리뷰_요약.긍정수}건`} icon={<Star size={16} />} color="text-emerald-600 dark:text-emerald-400" />
        <KpiCard label="부정 리뷰" value={`${r.리뷰_요약.부정수}건`} icon={<AlertTriangle size={16} />} color={Number(r.리뷰_요약.부정수) > 0 ? 'text-rose-600 dark:text-rose-400' : undefined} />
        <KpiCard label="긍정률" value={r.리뷰_요약.긍정률} icon={<TrendingUp size={16} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">매장별 리뷰 집계</h3>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['매장명', '이번주', '전주', '증감', '긍정률'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.리뷰_요약.매장별_집계?.sort((a, b) => Number(b.이번주_리뷰수) - Number(a.이번주_리뷰수)).map(s => (
                  <tr key={s.매장명} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200">{s.매장명}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{s.이번주_리뷰수}건</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{s.지난주_리뷰수}건</td>
                    <td className="px-3 py-2 text-xs font-semibold">
                      <span className={String(s.증감).startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : String(s.증감).startsWith('-') ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}>{s.증감}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{s.긍정률}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">네이버 순위 변동</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {r.순위_변동?.상승_매장?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800 shrink-0">상승</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">{m.등락폭}</span>
              </div>
            ))}
            {r.순위_변동?.하락_매장?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-800 shrink-0">하락</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
                <span className="text-xs text-rose-600 dark:text-rose-400 shrink-0">{m.등락폭}</span>
              </div>
            ))}
            {r.순위_변동?.노출실패?.map((m, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">실패</span>
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{m.매장명} · {m.타겟키워드}</span>
              </div>
            ))}
            {!r.순위_변동?.상승_매장?.length && !r.순위_변동?.하락_매장?.length && !r.순위_변동?.노출실패?.length && (
              <div className="px-5 py-8 text-center text-xs text-slate-400">순위 변동 데이터 없음</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">경쟁사 가격 변동</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {r.경쟁사_변동?.length > 0 ? r.경쟁사_변동.map((c, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{c.브랜드}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.지난주_최저가} → {c.이번주_최저가}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${c.변동.includes('인상') ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'}`}>
                  {c.변동}
                </span>
              </div>
            )) : <div className="px-5 py-8 text-center text-xs text-slate-400">이번 주 가격 변동 없음</div>}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">이번 주 부정 리뷰</h3>
            <span className="ml-auto text-xs text-slate-400">{r.리뷰_요약.부정_리뷰_목록?.length || 0}건</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
            {r.리뷰_요약.부정_리뷰_목록?.length > 0 ? r.리뷰_요약.부정_리뷰_목록.map((n, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{n.매장명}</span>
                  <span className="text-xs text-slate-400">{n.작성일}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{n.리뷰내용}</p>
              </div>
            )) : <div className="px-5 py-8 text-center text-xs text-slate-400">이번 주 부정 리뷰 없음</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
