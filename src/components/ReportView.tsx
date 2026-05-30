import React, { useRef, useEffect, useState, useCallback } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { User, Report, ApprovalStatus, ReportType } from '../types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { CheckCircle, XCircle, Clock, FileText, ExternalLink, RefreshCw } from 'lucide-react';

/* ── 타입 ────────────────────────────────────────────── */
interface SharedItem {
  id: string;
  sourceId: string;
  title: string;
  docType: string;
  authorName: string;
  authorRole: string;
  submittedAt: string;
  approvalStatus: ApprovalStatus;
  content: string;
  activeTab: string;
  rejectReason: string;
  approvedBy: string;
  approvedAt: string;
}

const genId = () => `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const APPROVAL_LABELS: Record<ApprovalStatus, { label: string; cls: string }> = {
  draft:    { label: '작성 중',   cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  pending:  { label: '검토 대기', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: '승인 완료', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: '반려',      cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  '일반': '업무', '테스트': '테스트', '제안': '제안', '회의록': '회의록',
  tab1: '업무', tab2: '테스트', tab3: '제안', tab4: '회의록',
};

/* ── 메인 컴포넌트 ──────────────────────────────────── */
interface Props { currentUser: User }

export function ReportView({ currentUser }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isAdmin = currentUser.role === 'admin';

  const [firestoreReports, setFirestoreReports] = useState<Report[]>([]);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  /* Firestore 목록 불러오기 */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(salesDb, 'reports'), orderBy('submittedAt', 'desc')));
    setFirestoreReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /* iframe → React postMessage 처리 */
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;

      /* 결재 상신 → Firestore 저장 */
      if (msg.type === 'SUBMIT_APPROVAL') {
        const item: SharedItem = msg.data;
        const now = new Date().toISOString();
        const id = genId();
        const report: Report = {
          id,
          title: item.title,
          type: (DOC_TYPE_LABELS[item.docType] as ReportType) ?? '일반',
          status: '진행',
          authorId: currentUser.uid,
          authorName: item.authorName,
          storageKey: '',        // HTML content는 Firestore 필드에 직접 저장
          approvalStatus: 'pending',
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
          // 내용은 별도 필드로 저장 (1MB 이하인 경우만)
          ...(item.content && item.content.length < 800_000
            ? { htmlContent: item.content, activeTab: item.activeTab }
            : {}),
        };
        try {
          await setDoc(doc(salesDb, 'reports', id), report);
          toast.success('결재 상신이 Firestore에 저장되었습니다');
          fetchReports();
        } catch {
          toast.error('Firestore 저장 실패');
        }
      }

      /* 승인 → Firestore 업데이트 */
      if (msg.type === 'APPROVE') {
        const rpt = firestoreReports.find(r =>
          (r as Report & { activeTab?: string; htmlContent?: string })['htmlContent'] &&
          r.approvalStatus === 'pending'
        );
        if (rpt) {
          await updateDoc(doc(salesDb, 'reports', rpt.id), {
            approvalStatus: 'approved' as ApprovalStatus,
            approverName: msg.approvedBy,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          fetchReports();
        }
      }

      /* 반려 → Firestore 업데이트 */
      if (msg.type === 'REJECT') {
        const rpt = firestoreReports.find(r => r.approvalStatus === 'pending');
        if (rpt) {
          await updateDoc(doc(salesDb, 'reports', rpt.id), {
            approvalStatus: 'rejected' as ApprovalStatus,
            approverName: msg.approvedBy,
            approverComment: msg.reason,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          fetchReports();
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [currentUser, firestoreReports, fetchReports, toast]);

  /* 결재함에서 보고서 iframe에 로드 */
  const openReportInIframe = (report: Report & { htmlContent?: string; activeTab?: string }) => {
    if (!report.htmlContent) { toast.error('저장된 내용이 없습니다'); return; }
    iframeRef.current?.contentWindow?.postMessage({
      type: 'LOAD_REPORT',
      reportId: report.id,
      content: report.htmlContent,
      activeTab: report.activeTab ?? 'tab1',
    }, '*');
    setShowApprovalPanel(false);
  };

  /* 관리자 Firestore 결재 처리 */
  const handleApprove = async (report: Report) => {
    const ok = await confirm({ title: '보고서 승인', message: `"${report.title}" 을 승인하시겠습니까?`, confirmLabel: '승인', variant: 'warning' });
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
    const ok = await confirm({ title: '보고서 반려', message: `"${report.title}" 을 반려하시겠습니까?`, confirmLabel: '반려', variant: 'danger' });
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

  /* iframe URL — 인트라넷 계정으로 자동 로그인 */
  const role = isAdmin ? 'clevel' : 'staff';
  const iframeSrc = `/report-tool.html?name=${encodeURIComponent(currentUser.name)}&role=${role}`;

  const pendingCount = firestoreReports.filter(r => r.approvalStatus === 'pending').length;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-4 sm:-mx-6 lg:-mx-8 -mt-4">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black text-stone-900 dark:text-stone-100">보고서</h2>
          <span className="text-[11px] text-stone-400">작성·결재·보관</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchReports} className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowApprovalPanel(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${showApprovalPanel ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900' : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
            >
              결재함
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{pendingCount}</span>
              )}
            </button>
          )}
          <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-200 dark:border-stone-600 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <ExternalLink size={11} /> 새 창
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 결재함 패널 (관리자) */}
        {showApprovalPanel && (
          <div className="w-80 shrink-0 border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
              <p className="text-xs font-black text-stone-800 dark:text-stone-200">Firestore 결재함</p>
              <p className="text-[10px] text-stone-400 mt-0.5">전 직원 상신 보고서 목록</p>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-3 gap-2 p-3 border-b border-stone-200 dark:border-stone-700">
              {[
                { label: '대기', count: firestoreReports.filter(r => r.approvalStatus === 'pending').length, cls: 'text-amber-600' },
                { label: '승인', count: firestoreReports.filter(r => r.approvalStatus === 'approved').length, cls: 'text-emerald-600' },
                { label: '반려', count: firestoreReports.filter(r => r.approvalStatus === 'rejected').length, cls: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-stone-900 rounded-lg p-2 text-center border border-stone-200 dark:border-stone-700">
                  <p className={`text-lg font-black ${s.cls}`}>{s.count}</p>
                  <p className="text-[10px] text-stone-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {firestoreReports.length === 0 ? (
                <p className="text-center text-stone-400 text-xs py-8">상신된 보고서가 없습니다</p>
              ) : firestoreReports.map(rpt => {
                const apv = APPROVAL_LABELS[rpt.approvalStatus];
                const r = rpt as Report & { htmlContent?: string; activeTab?: string };
                return (
                  <div key={rpt.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <p className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-snug flex-1">{rpt.title}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${apv.cls}`}>{apv.label}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 mb-2">{rpt.authorName} · {rpt.submittedAt?.slice(0, 10)}</p>
                    <div className="flex gap-1.5">
                      {r.htmlContent && (
                        <button onClick={() => openReportInIframe(r)} className="flex-1 py-1 text-[11px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg hover:opacity-80 flex items-center justify-center gap-1">
                          <FileText size={11} /> 열기
                        </button>
                      )}
                      {rpt.approvalStatus === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(rpt)} className="flex-1 py-1 text-[11px] font-bold bg-emerald-500 text-white rounded-lg hover:opacity-80 flex items-center justify-center gap-1">
                            <CheckCircle size={11} /> 승인
                          </button>
                          <button onClick={() => handleReject(rpt)} className="flex-1 py-1 text-[11px] font-bold bg-red-500 text-white rounded-lg hover:opacity-80 flex items-center justify-center gap-1">
                            <XCircle size={11} /> 반려
                          </button>
                        </>
                      )}
                    </div>
                    {rpt.approvalStatus === 'approved' && rpt.approverName && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                        <CheckCircle size={10} /> {rpt.approverName} 승인
                      </p>
                    )}
                    {rpt.approvalStatus === 'rejected' && rpt.approverComment && (
                      <p className="text-[10px] text-red-500 mt-1.5">반려: {rpt.approverComment}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* iframe — 보고서 작성 툴 */}
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
