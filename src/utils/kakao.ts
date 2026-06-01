/** 클립보드 복사 후 토스트 표시 */
async function copyText(text: string, onSuccess: () => void, onFail: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess();
  } catch {
    // clipboard API 실패 시 — textarea 트릭
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;top:-999px;left:-999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      onSuccess();
    } catch {
      onFail();
    }
  }
}

/** 보고 내용을 포맷팅해서 클립보드에 복사 */
export async function shareKakao({
  title,
  body,
  onCopied,     // 복사 성공 시 호출할 토스트 함수
}: {
  title: string;
  body: string;
  buttonLabel?: string;
  onCopied?: (msg: string) => void;
}) {
  const text = `[새모양 인트라넷]\n${title}\n${'─'.repeat(20)}\n${body}`;
  await copyText(
    text,
    () => onCopied?.('📋 복사됐습니다 — 카톡에 붙여넣기 하세요'),
    () => onCopied?.('복사 실패. 직접 선택해서 복사해주세요.'),
  );
}

export function shareApprovalRequest(opts: {
  submitterName: string;
  reportTitle: string;
  approverName: string;
  onCopied?: (msg: string) => void;
}) {
  shareKakao({
    title: `결재 요청 — ${opts.submitterName}`,
    body: `"${opts.reportTitle}" 결재를 요청드립니다.\n검토 후 승인/반려 부탁드립니다.\n→ ${opts.approverName}님께 전달`,
    onCopied: opts.onCopied,
  });
}

export function shareDailyReport(opts: {
  name: string;
  date: string;
  type: 'morning' | 'evening';
  items: string[];
  onCopied?: (msg: string) => void;
}) {
  const label = opts.type === 'morning' ? '출근' : '퇴근';
  const itemText = opts.items.map((t, i) => `${i + 1}. ${t}`).join('\n');
  shareKakao({
    title: `${label} 보고 — ${opts.name} (${opts.date})`,
    body: itemText,
    onCopied: opts.onCopied,
  });
}

export function shareWeeklyReport(opts: {
  name: string;
  weekStart: string;
  weekEnd: string;
  items: { title: string; status: string }[];
  onCopied?: (msg: string) => void;
}) {
  const STATUS_LABEL: Record<string, string> = { planned: '예정', in_progress: '진행중', done: '완료' };
  const itemText = opts.items
    .map((it, i) => `${i + 1}. [${STATUS_LABEL[it.status] ?? it.status}] ${it.title}`)
    .join('\n');
  shareKakao({
    title: `주간 보고 — ${opts.name} (${opts.weekStart}~${opts.weekEnd})`,
    body: itemText,
    onCopied: opts.onCopied,
  });
}

export function shareTaskRequest(opts: {
  requesterName: string;
  assigneeName: string;
  taskTitle: string;
  dueDate?: string;
  onCopied?: (msg: string) => void;
}) {
  shareKakao({
    title: `업무 요청 — ${opts.requesterName} → ${opts.assigneeName}`,
    body: `"${opts.taskTitle}"${opts.dueDate ? `\n기한: ${opts.dueDate}` : ''}`,
    onCopied: opts.onCopied,
  });
}
