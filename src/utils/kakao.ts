/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { Kakao: any } }

const KAKAO_JS_KEY = '2abb1de0d254e2019650aebb84380fb9';
const APP_URL = 'https://dalbitgo-calculator.vercel.app';

/* SDK가 완전히 로드될 때까지 대기 (최대 5초) */
function waitForKakao(timeout = 5000): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Kakao) { resolve(true); return; }
    const start = Date.now();
    const check = () => {
      if (window.Kakao) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

async function init(): Promise<boolean> {
  const loaded = await waitForKakao();
  if (!loaded) return false;
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(KAKAO_JS_KEY);
  }
  return true;
}

interface ShareOptions {
  title: string;
  body: string;
  buttonLabel?: string;
}

export async function shareKakao({ title, body, buttonLabel = '인트라넷에서 확인' }: ShareOptions) {
  const ready = await init();
  if (!ready || !window.Kakao?.Share) {
    // SDK 미로드 시 네이티브 공유로 fallback
    if (navigator.share) {
      await navigator.share({ title, text: `[새모양 인트라넷]\n${title}\n\n${body}`, url: APP_URL });
    } else {
      alert(`카카오 SDK 로드 실패.\n\n수동으로 공유하려면:\n${APP_URL}`);
    }
    return;
  }
  try {
    window.Kakao.Share.sendDefault({
      objectType: 'text',
      text: `[새모양 인트라넷]\n${title}\n\n${body}`,
      link: { mobileWebUrl: APP_URL, webUrl: APP_URL },
      buttons: [{ title: buttonLabel, link: { mobileWebUrl: APP_URL, webUrl: APP_URL } }],
    });
  } catch (e: any) {
    console.error('Kakao share error:', e);
    // Kakao 오류 시 클립보드 복사로 대체
    const text = `[새모양 인트라넷]\n${title}\n\n${body}\n\n${APP_URL}`;
    navigator.clipboard?.writeText(text).then(() => {
      alert('카카오톡 공유 오류가 발생했습니다.\n내용을 클립보드에 복사했습니다. 카톡에 직접 붙여넣기 하세요.');
    }).catch(() => alert('카카오톡 공유에 실패했습니다. 인터넷 연결을 확인해주세요.'));
  }
}

/** 결재 상신 알림 */
export function shareApprovalRequest(opts: {
  submitterName: string;
  reportTitle: string;
  approverName: string;
}) {
  shareKakao({
    title: `결재 요청 — ${opts.submitterName}`,
    body: `"${opts.reportTitle}" 결재를 요청드립니다.\n검토 후 승인/반려 부탁드립니다.\n→ ${opts.approverName}님께 전달`,
    buttonLabel: '결재하러 가기',
  });
}

/** 일일 보고 공유 */
export function shareDailyReport(opts: {
  name: string;
  date: string;
  type: 'morning' | 'evening';
  items: string[];
}) {
  const label = opts.type === 'morning' ? '출근' : '퇴근';
  const itemText = opts.items.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n');
  shareKakao({
    title: `${label} 보고 — ${opts.name} (${opts.date})`,
    body: itemText + (opts.items.length > 5 ? `\n외 ${opts.items.length - 5}건` : ''),
    buttonLabel: '보고 확인하기',
  });
}

/** 주간 보고 공유 */
export function shareWeeklyReport(opts: {
  name: string;
  weekStart: string;
  weekEnd: string;
  items: { title: string; status: string }[];
}) {
  const STATUS_LABEL: Record<string, string> = { planned: '예정', in_progress: '진행 중', done: '완료' };
  const itemText = opts.items.slice(0, 4)
    .map((it, i) => `${i + 1}. [${STATUS_LABEL[it.status] ?? it.status}] ${it.title}`)
    .join('\n');
  shareKakao({
    title: `주간 보고 — ${opts.name} (${opts.weekStart} ~ ${opts.weekEnd})`,
    body: itemText + (opts.items.length > 4 ? `\n외 ${opts.items.length - 4}건` : ''),
    buttonLabel: '주간 보고 확인하기',
  });
}

/** 업무 요청 알림 */
export function shareTaskRequest(opts: {
  requesterName: string;
  assigneeName: string;
  taskTitle: string;
  dueDate?: string;
}) {
  shareKakao({
    title: `업무 요청 — ${opts.requesterName} → ${opts.assigneeName}`,
    body: `"${opts.taskTitle}"${opts.dueDate ? `\n기한: ${opts.dueDate}` : ''}`,
    buttonLabel: '업무 확인하기',
  });
}
