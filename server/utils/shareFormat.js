// 공유용 대화 포맷 변환
//
// DB 메시지 행 배열을 평가 앱으로 넘길 최소 정보의 턴 배열로 변환한다.
// 데이터 최소화 원칙:
//  - role/content/created_at 만 노출 (내부 id·토큰 수·code_result·원본 image_url 제외)
//  - 생성된 이미지는 "[생성된 이미지]" 마커로만 표기 (URL 미노출)
//  - 첨부 파일은 파일명만 표기 (base64 원본 미노출)

/**
 * 메시지 한 개(DB 행)를 공유 턴으로 변환
 * @param {object} msg - { role, content, files, image_url, created_at }
 * @returns {{ role: 'user'|'ai', content: string, created_at: string }}
 */
export function buildSharedTurn(msg) {
  const role = msg.role === 'user' ? 'user' : 'ai';

  // 첨부 파일명 파싱 (files 는 JSON 문자열)
  let files = [];
  try {
    files = msg.files ? JSON.parse(msg.files) : [];
  } catch {
    files = [];
  }

  // 본문: 이미지 생성 메시지는 마커로 대체
  let body;
  if (msg.role === 'assistant' && msg.image_url) {
    const caption = (msg.content || '').trim();
    body = caption ? `[생성된 이미지] ${caption}` : '[생성된 이미지]';
  } else {
    body = (msg.content || '').trim();
  }

  // 첨부 파일명 라인 추가 (파일명만)
  const fileNames = (Array.isArray(files) ? files : [])
    .map((f) => f.original_name || f.name)
    .filter(Boolean);
  if (fileNames.length) {
    const attachLines = fileNames.map((n) => `📎 첨부: ${n}`).join('\n');
    body = body ? `${body}\n${attachLines}` : attachLines;
  }

  return { role, content: body, created_at: msg.created_at };
}

/**
 * 메시지 배열 → 공유 턴 배열
 * user/assistant 역할만 포함하고 system 등은 제외한다.
 * @param {Array} messages - DB 메시지 행 배열 (created_at ASC 정렬 가정)
 * @returns {Array<{ role: 'user'|'ai', content: string, created_at: string }>}
 */
export function buildSharedTurns(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(buildSharedTurn);
}
