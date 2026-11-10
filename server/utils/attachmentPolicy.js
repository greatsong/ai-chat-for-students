// 첨부 수명 정책. 설계: docs/DESIGN-attachment-tokens.md 3-1
//
// 첨부 원본(이미지·PDF base64, 텍스트 전문)을 대화 내내 매 턴 다시 보내면 첨부 하나가 이후 평균 11턴 동안
// 과금된다(2026-11 운영 측정: 첨부 대화가 입력 토큰의 78%). 원본은 첨부한 턴과 바로 다음 턴까지만 보내고,
// 그보다 오래된 첨부는 업로드 때 만든 짧은 요약으로 바꾼다. 학생이 그 파일을 다시 언급하면 원본을 되살린다.

// 원본을 유지할 최근 사용자 턴 수 (현재 턴 + 바로 앞 턴)
export const KEEP_RECENT_USER_TURNS = 2;

const SUMMARY_MAX_CHARS = 600;
const CAPTION_MAX_CHARS = 300;

// "아까 올린 사진", "첨부한 파일", "위 PDF"처럼 이름 없이 앞선 첨부를 가리키는 표현
const GENERIC_REFERENCE =
  /(첨부|올린|올렸던|보낸|보냈던|업로드|업로드한)\s*(한|했던)?\s*(파일|사진|이미지|그림|pdf|문서|자료|표|데이터)|(아까|앞의|앞에|위의|위)\s*(그|의)?\s*(파일|사진|이미지|그림|pdf|문서|자료|표|데이터)/i;

function parseFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  try {
    const parsed = JSON.parse(files);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collapse(text, max) {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 업로드 시점에 만드는 첨부 요약. 이후 턴에서 원본 대신 AI에게 전달된다.
 * @param {{ type: string, name: string, data?: string, pages?: number }} file
 * @returns {string}
 */
export function buildAttachmentSummary(file) {
  if (file.type === 'text') {
    const text = String(file.data || '');
    const lines = text.split(/\r?\n/).length;
    const pageInfo = file.pages ? `${file.pages}쪽, ` : '';
    return `${pageInfo}${lines.toLocaleString()}줄 ${text.length.toLocaleString()}자. 앞부분: ${collapse(text, SUMMARY_MAX_CHARS)}`;
  }
  if (file.type === 'pdf') {
    return file.pages ? `PDF ${file.pages}쪽 (글자가 거의 없는 스캔·그림 위주 문서)` : 'PDF 문서';
  }
  // 이미지는 업로드 시점에 내용을 알 수 없다. 첨부한 턴의 AI 답변을 캡션으로 쓴다(applyAttachmentPolicy).
  return '';
}

function baseName(name) {
  const n = String(name || '');
  const dot = n.lastIndexOf('.');
  return (dot > 0 ? n.slice(0, dot) : n).trim().toLowerCase();
}

function mentionsFile(text, file) {
  const lower = String(text || '').toLowerCase();
  const full = String(file.name || '').toLowerCase();
  const base = baseName(file.name);
  if (full && lower.includes(full)) return true;
  return base.length >= 2 && lower.includes(base);
}

function standIn(file, caption) {
  let summary = file.summary || '';
  if (!summary && file.type === 'image') {
    summary = caption ? `앞선 답변의 설명: ${caption}` : '이미지';
  }
  if (!summary && file.type === 'text') summary = buildAttachmentSummary(file);
  if (!summary) summary = '요약 없음';
  return {
    type: 'text',
    name: file.name,
    mimeType: 'text/plain',
    data: `[앞서 첨부한 파일: ${file.name}] 원본은 앞선 대화에서 이미 제공했습니다. 요약: ${summary}`,
    summarized: true,
  };
}

/**
 * 오래된 첨부를 요약으로 바꾼 히스토리를 돌려준다. DB의 원본은 바꾸지 않는다.
 * @param {Array<{ role: string, content: string, files?: string }>} history - 시간순, 마지막이 현재 사용자 메시지
 * @param {{ keepRecentUserTurns?: number }} [options]
 * @returns {{ history: Array, summarizedCount: number, restoredCount: number }}
 */
export function applyAttachmentPolicy(
  history,
  { keepRecentUserTurns = KEEP_RECENT_USER_TURNS } = {},
) {
  if (!Array.isArray(history) || history.length === 0) {
    return { history: history || [], summarizedCount: 0, restoredCount: 0 };
  }

  const userIndexes = [];
  history.forEach((m, i) => {
    if (m.role === 'user') userIndexes.push(i);
  });
  const recent = new Set(userIndexes.slice(-keepRecentUserTurns));
  const current = history[history.length - 1];
  const currentText = current?.role === 'user' ? current.content : '';

  // 이름 없이 "아까 올린 사진"처럼 말하면 가장 최근의 오래된 첨부 메시지를 되살린다
  let genericRestoreIndex = -1;
  if (GENERIC_REFERENCE.test(currentText || '')) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (recent.has(i) || history[i].role !== 'user') continue;
      if (parseFiles(history[i].files).length > 0) {
        genericRestoreIndex = i;
        break;
      }
    }
  }

  let summarizedCount = 0;
  let restoredCount = 0;
  const next = history.map((msg, i) => {
    if (msg.role !== 'user' || recent.has(i)) return msg;
    const files = parseFiles(msg.files);
    if (files.length === 0) return msg;

    // 이미지 캡션: 첨부한 턴 바로 뒤의 AI 답변 첫머리
    const answer = history[i + 1]?.role === 'assistant' ? history[i + 1].content : '';
    const caption = answer ? collapse(answer, CAPTION_MAX_CHARS) : '';

    const replaced = files.map((f) => {
      if (f.summarized) return f;
      if (i === genericRestoreIndex || mentionsFile(currentText, f)) {
        restoredCount++;
        return f;
      }
      summarizedCount++;
      return standIn(f, caption);
    });
    return { ...msg, files: JSON.stringify(replaced) };
  });

  return { history: next, summarizedCount, restoredCount };
}
