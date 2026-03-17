/**
 * URL 내용 가져오기 유틸리티
 * 교사/관리자가 메시지에 URL을 포함하면 해당 페이지 내용을 추출
 */

// URL 정규식 패턴
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * 메시지에서 URL 추출
 */
export function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // 중복 제거, 최대 3개
  return [...new Set(matches)].slice(0, 3);
}

/**
 * URL에서 텍스트 콘텐츠 가져오기
 * HTML 태그 제거, 스크립트/스타일 제거, 텍스트만 추출
 */
export async function fetchUrlContent(url, maxLength = 8000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DanggokAI/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { url, error: `HTTP ${response.status}`, content: null };
    }

    const contentType = response.headers.get('content-type') || '';

    // JSON 응답
    if (contentType.includes('application/json')) {
      const json = await response.json();
      const text = JSON.stringify(json, null, 2).slice(0, maxLength);
      return { url, content: text, type: 'json' };
    }

    // 텍스트/HTML 응답
    const html = await response.text();

    // HTML에서 텍스트 추출
    let text = html
      // script, style, noscript 태그와 내용 제거
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // HTML 태그 제거
      .replace(/<[^>]+>/g, ' ')
      // HTML 엔티티 디코딩
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-zA-Z]+;/g, ' ')
      // 연속 공백/줄바꿈 정리
      .replace(/\s+/g, ' ')
      .trim();

    // 길이 제한
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + '\n\n... (내용이 잘렸습니다)';
    }

    return { url, content: text, type: 'html' };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { url, error: '요청 시간 초과 (10초)', content: null };
    }
    return { url, error: error.message, content: null };
  }
}

/**
 * 메시지에 포함된 URL들의 내용을 가져와서 컨텍스트 텍스트로 변환
 */
export async function fetchUrlsFromMessage(message) {
  const urls = extractUrls(message);
  if (urls.length === 0) return null;

  const results = await Promise.all(urls.map(url => fetchUrlContent(url)));

  const successResults = results.filter(r => r.content);
  if (successResults.length === 0) return null;

  let context = '\n\n---\n[URL 내용 참조]\n';
  for (const result of successResults) {
    context += `\n### ${result.url}\n${result.content}\n`;
  }
  context += '\n---\n';

  return context;
}
