// PDF 텍스트 우선 처리. 설계: docs/DESIGN-attachment-tokens.md 3-4
//
// Claude는 PDF 한 쪽마다 텍스트와 페이지 이미지를 함께 넣어 쪽당 대략 1,500~3,000토큰을 쓴다.
// 글자 위주 PDF는 추출한 텍스트만 보내도 충분하고 훨씬 싸다. OpenAI에는 PDF 원본을 보내지 않으므로
// 텍스트로 바꾸면 OpenAI에서도 PDF 내용을 읽을 수 있다. 스캔본처럼 글자가 거의 없으면 원본을 보낸다.
import { extractText, getDocumentProxy } from 'unpdf';

// 쪽당 공백을 뺀 글자 수가 이 값 이상이면 글자 위주 문서로 본다
export const TEXT_RICH_CHARS_PER_PAGE = 200;

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{ pages: number, text: string }>}
 */
export async function extractPdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return { pages: totalPages, text: String(text || '').trim() };
  } finally {
    await pdf.destroy?.();
  }
}

/**
 * @param {{ pages: number, text: string }} extracted
 * @returns {boolean}
 */
export function isTextRichPdf({ pages, text }) {
  if (!pages) return false;
  const chars = String(text || '').replace(/\s+/g, '').length;
  return chars / pages >= TEXT_RICH_CHARS_PER_PAGE;
}
