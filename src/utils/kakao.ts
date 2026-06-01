/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { Kakao: any } }

const KAKAO_JS_KEY = '2abb1de0d254e2019650aebb84380fb9';
const APP_URL = 'https://dalbitgo-calculator.vercel.app';

function init() {
  if (window.Kakao && !window.Kakao.isInitialized()) {
    window.Kakao.init(KAKAO_JS_KEY);
  }
}

interface ShareOptions {
  title: string;    // 굵은 제목 줄
  body: string;     // 본문 요약 (최대 200자 권장)
  buttonLabel?: string;
}

/** KakaoTalk 공유 팝업 열기 — 사용자가 직접 받을 사람을 선택 */
export function shareKakao({ title, body, buttonLabel = '인트라넷에서 확인' }: ShareOptions) {
  try {
    init();
    if (!window.Kakao?.Share) {
      alert('카카오톡 SDK를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    window.Kakao.Share.sendDefault({
      objectType: 'text',
      text: `[새모양 인트라넷]\n${title}\n\n${body}`,
      link: { mobileWebUrl: APP_URL, webUrl: APP_URL },
      buttons: [{ title: buttonLabel, link: { mobileWebUrl: APP_URL, webUrl: APP_URL } }],
    });
  } catch (e) {
    console.error('Kakao share error:', e);
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
