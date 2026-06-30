// 채팅 기록을 Markdown / 텍스트 파일로 내보내는 유틸
//
// - 파일명에 성명(= 학번+이름)과 작업 기간을 포함
// - 파일 내부에도 성명/기간/메시지 수 등 메타 정보를 헤더로 기록
// - 이미지 생성 메시지는 본문에 "[생성된 이미지]"로 표기

const PROVIDER_LABELS = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'ChatGPT',
  solar: 'Solar',
};

/** 파일명에 쓸 수 없는 문자를 제거하고 공백을 정리 */
function sanitizeForFilename(text) {
  return String(text || '')
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Date → "YYMMDD" */
function yymmdd(date) {
  return (
    String(date.getFullYear()).slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  );
}

/** Date → "YYYY-MM-DD HH:mm" (한국 시간 표기) */
function formatDateTime(date) {
  return date
    .toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/\. /g, '-')
    .replace(/\.$/, '')
    .replace(/-(\d{2}:\d{2})/, ' $1');
}

/**
 * 메시지 배열에서 유효한 created_at의 최소/최대 시각을 구한다.
 * @returns {{ start: Date|null, end: Date|null }}
 */
function getDateRange(messages) {
  const times = messages
    .map((m) => (m.created_at ? new Date(m.created_at) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (times.length === 0) return { start: null, end: null };
  return { start: times[0], end: times[times.length - 1] };
}

/**
 * 다운로드용 파일명 생성
 * 예) "2301홍길동_AI채팅기록_250630.md"
 *     "2301홍길동_AI채팅기록_250628-250630.txt"
 */
export function buildExportFilename(userName, messages, format) {
  const ext = format === 'txt' ? 'txt' : 'md';
  const safeName = sanitizeForFilename(userName) || '학생';
  const { start, end } = getDateRange(messages);

  let datePart = '';
  if (start && end) {
    const s = yymmdd(start);
    const e = yymmdd(end);
    datePart = s === e ? `_${s}` : `_${s}-${e}`;
  }

  return `${safeName}_AI채팅기록${datePart}.${ext}`;
}

/**
 * 메시지 한 개를 텍스트 블록으로 변환
 */
function renderMessage(message, { markdown, providerLabel }) {
  const isUser = message.role === 'user';
  const speaker = isUser ? '🙋 나' : `🤖 AI (${providerLabel})`;

  // 본문 결정: 이미지 메시지는 별도 표기
  let body;
  if (!isUser && message.image_url) {
    const caption = message.content?.trim();
    body = caption ? `[생성된 이미지] ${caption}` : '[생성된 이미지]';
  } else {
    body = (message.content || '').trim();
  }

  // 첨부 파일 표기
  const files = Array.isArray(message.files) ? message.files : [];
  const fileLines = files
    .map((f) => f.original_name || f.name)
    .filter(Boolean)
    .map((n) => `📎 첨부: ${n}`);

  const time = message.created_at ? formatDateTime(new Date(message.created_at)) : '';

  if (markdown) {
    const header = time ? `### ${speaker}  \`${time}\`` : `### ${speaker}`;
    const parts = [header, '', body];
    if (fileLines.length) parts.push('', fileLines.join('  \n'));
    return parts.join('\n');
  }

  // 평문(txt)
  const header = time ? `[${speaker}] ${time}` : `[${speaker}]`;
  const parts = [header, body];
  if (fileLines.length) parts.push(fileLines.join('\n'));
  return parts.join('\n');
}

/**
 * 메시지 배열 → 파일 본문 문자열
 * @param {Array} messages
 * @param {object} opts
 * @param {string} opts.userName - 성명(학번+이름)
 * @param {string} [opts.title] - 대화 제목
 * @param {string} [opts.provider] - 대화 프로바이더 키
 * @param {'md'|'txt'} [opts.format]
 */
export function formatChatExport(messages, { userName, title, provider, format } = {}) {
  const markdown = format !== 'txt';
  const providerLabel = PROVIDER_LABELS[provider] || 'AI';
  const exported = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const { start, end } = getDateRange(exported);

  const periodStr =
    start && end
      ? start.getTime() === end.getTime()
        ? formatDateTime(start)
        : `${formatDateTime(start)} ~ ${formatDateTime(end)}`
      : '기록 없음';
  const nowStr = formatDateTime(new Date());

  const blocks = exported.map((m) => renderMessage(m, { markdown, providerLabel }));

  if (markdown) {
    const head = [
      `# ${userName || '학생'} 님의 AI 채팅 기록`,
      '',
      title ? `- **대화 제목**: ${title}` : null,
      `- **작업 기간**: ${periodStr}`,
      `- **메시지 수**: ${exported.length}개`,
      `- **내보낸 시각**: ${nowStr}`,
      '',
      '---',
      '',
    ].filter((l) => l !== null);
    return head.join('\n') + '\n' + blocks.join('\n\n---\n\n') + '\n';
  }

  // 평문(txt)
  const sep = '='.repeat(50);
  const head = [
    sep,
    `${userName || '학생'} 님의 AI 채팅 기록`,
    sep,
    title ? `대화 제목: ${title}` : null,
    `작업 기간: ${periodStr}`,
    `메시지 수: ${exported.length}개`,
    `내보낸 시각: ${nowStr}`,
    sep,
    '',
  ].filter((l) => l !== null);
  return head.join('\n') + blocks.join('\n\n' + '-'.repeat(50) + '\n\n') + '\n';
}

/**
 * 채팅 기록을 파일로 다운로드
 * @param {Array} messages
 * @param {object} opts - formatChatExport와 동일 (userName, title, provider, format)
 */
export function downloadChatHistory(messages, opts = {}) {
  const format = opts.format === 'txt' ? 'txt' : 'md';
  const content = formatChatExport(messages, { ...opts, format });
  const mime = format === 'md' ? 'text/markdown' : 'text/plain';
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = buildExportFilename(opts.userName, messages, format);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
