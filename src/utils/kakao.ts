const APP_URL = 'https://dalbitgo-calculator.vercel.app';

/**
 * 모바일: 네이티브 공유 시트(카톡·문자·메일 등) 열기
 * 데스크탑: 클립보드 복사 + 안내
 */
export async function shareKakao({ title, body }: { title: string; body: string; buttonLabel?: string }) {
  const text = `[새모양 인트라넷]\n${title}\n\n${body}\n\n▶ 확인하기: ${APP_URL}`;

  // 모바일 네이티브 공유 (iOS Safari, Android Chrome 등 — 카톡 포함)
  if (navigator.share) {
    try {
      await navigator.share({ title: `[새모양] ${title}`, text, url: APP_URL });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // 사용자가 직접 닫은 경우 — 정상
    }
  }

  // 데스크탑 fallback: 클립보드 복사
  try {
    await navigator.clipboard.writeText(text);
    alert('내용을 클립보드에 복사했습니다.\n카카오톡에 붙여넣기 하세요.');
  } catch {
    alert(`공유할 내용:\n\n${text}`);
  }
}

export function shareApprovalRequest(opts: {
  submitterName: string;
  reportTitle: string;
  approverName: string;
}) {
  shareKakao({
    title: `결재 요청 — ${opts.submitterName}`,
    body: `"${opts.reportTitle}" 결재를 요청드립니다.\n검토 후 승인/반려 부탁드립니다.\n→ ${opts.approverName}님께 전달`,
  });
}

export function shareDailyReport(opts: {
  name: string;
  date: string;
  type: 'morning' | 'evening';
  items: string[];
}) {
  const label = opts.type === 'morning' ? '출근' : '퇴근';
  const itemText = opts.items.slice(0, 7).map((t, i) => `${i + 1}. ${t}`).join('\n');
  shareKakao({
    title: `${label} 보고 — ${opts.name} (${opts.date})`,
    body: itemText + (opts.items.length > 7 ? `\n외 ${opts.items.length - 7}건` : ''),
  });
}

export function shareWeeklyReport(opts: {
  name: string;
  weekStart: string;
  weekEnd: string;
  items: { title: string; status: string }[];
}) {
  const STATUS_LABEL: Record<string, string> = { planned: '예정', in_progress: '진행 중', done: '완료' };
  const itemText = opts.items.slice(0, 5)
    .map((it, i) => `${i + 1}. [${STATUS_LABEL[it.status] ?? it.status}] ${it.title}`)
    .join('\n');
  shareKakao({
    title: `주간 보고 — ${opts.name} (${opts.weekStart}~${opts.weekEnd})`,
    body: itemText + (opts.items.length > 5 ? `\n외 ${opts.items.length - 5}건` : ''),
  });
}

export function shareTaskRequest(opts: {
  requesterName: string;
  assigneeName: string;
  taskTitle: string;
  dueDate?: string;
}) {
  shareKakao({
    title: `업무 요청 — ${opts.requesterName} → ${opts.assigneeName}`,
    body: `"${opts.taskTitle}"${opts.dueDate ? `\n기한: ${opts.dueDate}` : ''}`,
  });
}
