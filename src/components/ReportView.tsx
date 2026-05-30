import React, { useRef, useEffect, useState, useCallback } from 'react';
import { salesDb } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where,
} from 'firebase/firestore';
import { User, Report, ApprovalStatus, ReportType, ReportStatus } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  CheckCircle, XCircle, Clock, FileText, ExternalLink, RefreshCw,
  ChevronDown, Plus, Trash2,
} from 'lucide-react';

/* ── 유틸 ───────────────────────────────────────────── */
const genId = () => `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/** base64 이미지 src를 제거해 Firestore 1MB 제한 회피 */
const stripImages = (html: string): string =>
  html.replace(/src="data:[^"]+"/g, 'src="" title="이미지는 작성 기기에서만 표시됩니다"');

const DOC_TYPE_MAP: Record<string, ReportType> = {
  tab1: '일반', tab2: '테스트', tab3: '제안', tab4: '회의록',
  일반: '일반', 테스트: '테스트', 제안: '제안', 회의록: '회의록',
};

const STATUS_CLS: Record<ApprovalStatus, string> = {
  draft:    'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: '작성 중', pending: '결재 대기', approved: '승인', rejected: '반려',
};

/* ── 타입 ───────────────────────────────────────────── */
interface LocalReport {
  id: string; title: string; status: string; docType: string;
  activeTab: string; content: string; date: string;
}

/* ── 메인 컴포넌트 ──────────────────────────────────── */
interface Props { currentUser: User }

export function ReportView({ currentUser }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isAdmin = currentUser.role === 'admin';

  const [reports, setReports] = useState<Report[]>([]);
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'all'>('all');
  const [showPanel, setShowPanel] = useState(true);
  const [loading, setLoading] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  /* Firestore 보고서 조회 */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let snap;
      if (isAdmin) {
        snap = await getDocs(query(collection(salesDb, 'reports'), orderBy('updatedAt', 'desc')));
      } else {
        snap = await getDocs(query(
          collection(salesDb, 'reports'),
          where('authorId', '==', currentUser.uid),
          orderBy('updatedAt', 'desc'),
        ));
      }
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
    } catch (e) {
      console.error('fetchReports error:', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentUser.uid]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /* iframe 준비 완료 → Firestore 보고서 목록 전송 */
  const sendReportsList = useCallback((rpts: Report[]) => {
    if (!iframeRef.current?.contentWindow) return;
    const payload = rpts.map(r => ({
      id: r.id, title: r.title, status: r.status,
      docType: r.type, activeTab: r.activeTab ?? 'tab1',
      content: r.htmlContent ?? '', date: r.docDate ?? r.updatedAt.slice(0, 10),
    }));
    iframeRef.current.contentWindow.postMessage({ type: 'REPORTS_LIST', reports: payload }, '*');
  }, []);

  useEffect(() => {
    if (iframeReady && reports.length > 0) sendReportsList(reports);
  }, [iframeReady, reports, sendReportsList]);

  /* Firestore 저장 (이미지 제거) */
  const saveReport = async (local: LocalReport) => {
    const now = new Date().toISOString();
    const stripped = stripImages(local.content);
    const sizeOk = stripped.length < 900_000;
    const report: Report = {
      id: local.id,
      title: local.title,
      type: DOC_TYPE_MAP[local.docType] ?? DOC_TYPE_MAP[local.activeTab] ?? '일반',
      status: (local.status as ReportStatus) ?? '진행',
      authorId: currentUser.uid,
      authorName: currentUser.name,
      storageKey: '',
      approvalStatus: 'draft',
      createdAt: now,
      updatedAt: now,
      htmlContent: sizeOk ? stripped : undefined,
      activeTab: local.activeTab,
      docDate: local.date,
    };
    await setDoc(doc(salesDb, 'reports', local.id), report);
    if (!sizeOk) toast.success('저장됨 (이미지 포함 시 이미지는 이 기기에서만 표시)');
    fetchReports();
  };

  const updateReport = async (reportId: string, content: string, status: string, title: string, docType: string, activeTab: string, date: string) => {
    const stripped = stripImages(content);
    await updateDoc(doc(salesDb, 'reports', reportId), {
      title, status,
      type: DOC_TYPE_MAP[docType] ?? DOC_TYPE_MAP[activeTab] ?? '일반',
      htmlContent: stripped.length < 900_000 ? stripped : undefined,
      activeTab, docDate: date,
      updatedAt: new Date().toISOString(),
    });
    fetchReports();
  };

  const deleteReport = async (reportId: string) => {
    await deleteDoc(doc(salesDb, 'reports', reportId));
    fetchReports();
  };

  /* 결재 처리 */
  const handleApprove = async (report: Report) => {
    const ok = await confirm({ title: '보고서 승인', message: `"${report.title}"을 승인하시겠습니까?`, confirmLabel: '승인', variant: 'warning' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'reports', report.id), {
      approvalStatus: 'approved' as ApprovalStatus,
      approverName: currentUser.name,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    iframeRef.current?.contentWindow?.postMessage({ type: 'APPROVAL_UPDATE', approved: true }, '*');
    toast.success('승인되었습니다');
    fetchReports();
  };

  const handleReject = async (report: Report) => {
    const ok = await confirm({ title: '보고서 반려', message: `"${report.title}"을 반려하시겠습니까?`, confirmLabel: '반려', variant: 'danger' });
    if (!ok) return;
    await updateDoc(doc(salesDb, 'reports', report.id), {
      approvalStatus: 'rejected' as ApprovalStatus,
      approverName: currentUser.name,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    iframeRef.current?.contentWindow?.postMessage({ type: 'APPROVAL_UPDATE', approved: false }, '*');
    toast.success('반려되었습니다');
    fetchReports();
  };

  /* iframe에 보고서 내용 로드 */
  const openReport = (report: Report) => {
    if (!report.htmlContent) { toast.error('내용이 없습니다. 작성 기기에서 저장한 보고서만 조회 가능합니다'); return; }
    iframeRef.current?.contentWindow?.postMessage({
      type: 'LOAD_REPORT',
      reportId: report.id,
      content: report.htmlContent,
      activeTab: report.activeTab ?? 'tab1',
    }, '*');
  };

  /* postMessage 처리 */
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;

      if (msg.type === 'IFRAME_READY') {
        setIframeReady(true);
        sendReportsList(reports);
      }

      if (msg.type === 'SAVE_REPORT') {
        await saveReport(msg.report as LocalReport);
        toast.success('보고서가 저장되었습니다');
      }

      if (msg.type === 'UPDATE_REPORT') {
        await updateReport(msg.reportId, msg.content, msg.status, msg.title, msg.docType, msg.activeTab, msg.date);
      }

      if (msg.type === 'DELETE_REPORT') {
        await deleteReport(msg.reportId);
      }

      if (msg.type === 'SUBMIT_APPROVAL') {
        const item = msg.data;
        const now = new Date().toISOString();
        const id = genId();
        const stripped = stripImages(item.content ?? '');
        const report: Report = {
          id, title: item.title,
          type: DOC_TYPE_MAP[item.docType] ?? '일반',
          status: '진행',
          authorId: currentUser.uid,
          authorName: item.authorName,
          storageKey: '',
          approvalStatus: 'pending',
          submittedAt: now, createdAt: now, updatedAt: now,
          htmlContent: stripped.length < 900_000 ? stripped : undefined,
          activeTab: item.activeTab,
        };
        try {
          await setDoc(doc(salesDb, 'reports', id), report);
          toast.success('결재 상신 완료');
          fetchReports();
        } catch { toast.error('Firestore 저장 실패'); }
      }

      if (msg.type === 'APPROVE') {
        const pending = reports.find(r => r.approvalStatus === 'pending');
        if (pending) {
          await updateDoc(doc(salesDb, 'reports', pending.id), {
            approvalStatus: 'approved', approverName: msg.approvedBy,
            approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
          fetchReports();
        }
      }

      if (msg.type === 'REJECT') {
        const pending = reports.find(r => r.approvalStatus === 'pending');
        if (pending) {
          await updateDoc(doc(salesDb, 'reports', pending.id), {
            approvalStatus: 'rejected', approverName: msg.approvedBy,
            approverComment: msg.reason, approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          fetchReports();
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [currentUser, reports, fetchReports, sendReportsList, toast]);

  const filtered = reports.filter(r => filterStatus === 'all' || r.approvalStatus === filterStatus);
  const pendingCount = reports.filter(r => r.approvalStatus === 'pending').length;
  const role = isAdmin ? 'clevel' : 'staff';
  const iframeSrc = `/report-tool.html?name=${encodeURIComponent(currentUser.name)}&role=${role}`;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-4 sm:-mx-6 lg:-mx-8 -mt-4">
      {/* 상단바 */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPanel(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${showPanel ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
          >
            <FileText size={12} /> 내 보고서
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center ml-0.5">{pendingCount}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchReports} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <ExternalLink size={11} /> 새 창
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 패널: 내 보고서 목록 */}
        {showPanel && (
          <div className="w-72 shrink-0 border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 flex flex-col overflow-hidden">
            {/* 필터 */}
            <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex gap-1 flex-wrap">
              {(['all', 'draft', 'pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-full transition-colors ${filterStatus === s ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'}`}>
                  {s === 'all' ? '전체' : STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-stone-400">
                  <FileText size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">보고서가 없습니다</p>
                  <p className="text-[10px] mt-1 text-stone-300">오른쪽 에디터에서 작성 후 저장하면 여기에 나타납니다</p>
                </div>
              ) : filtered.map(rpt => (
                <div key={rpt.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
                  <div className="flex items-start gap-1.5 mb-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_CLS[rpt.approvalStatus]}`}>
                      {STATUS_LABEL[rpt.approvalStatus]}
                    </span>
                    <p className="text-[11px] font-bold text-stone-900 dark:text-stone-100 leading-snug flex-1 min-w-0 truncate">{rpt.title}</p>
                  </div>
                  <p className="text-[10px] text-stone-400 mb-2">
                    {rpt.authorName} · {(rpt.docDate ?? rpt.updatedAt ?? '').slice(0, 10)}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {rpt.htmlContent && (
                      <button onClick={() => openReport(rpt)}
                        className="flex-1 py-1 text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg hover:opacity-80">
                        열기
                      </button>
                    )}
                    {isAdmin && rpt.approvalStatus === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(rpt)} className="flex-1 py-1 text-[10px] font-bold bg-emerald-500 text-white rounded-lg hover:opacity-80">승인</button>
                        <button onClick={() => handleReject(rpt)} className="flex-1 py-1 text-[10px] font-bold bg-red-500 text-white rounded-lg hover:opacity-80">반려</button>
                      </>
                    )}
                    {(rpt.authorId === currentUser.uid || isAdmin) && rpt.approvalStatus === 'draft' && (
                      <button onClick={async () => {
                        const ok = await confirm({ title: '보고서 삭제', message: `"${rpt.title}"을 삭제할까요?`, confirmLabel: '삭제', variant: 'danger' });
                        if (ok) { await deleteDoc(doc(salesDb, 'reports', rpt.id)); fetchReports(); }
                      }} className="p-1 text-stone-300 hover:text-red-500 rounded">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {rpt.approvalStatus === 'rejected' && rpt.approverComment && (
                    <p className="text-[10px] text-red-400 mt-1.5 pt-1.5 border-t border-stone-100 dark:border-stone-800">반려: {rpt.approverComment}</p>
                  )}
                  {!rpt.htmlContent && (
                    <p className="text-[9px] text-stone-300 mt-1">이미지 포함 시 작성 기기에서만 열람 가능</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* iframe 에디터 */}
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className="flex-1 border-0"
          title="보고서 작성 툴"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
