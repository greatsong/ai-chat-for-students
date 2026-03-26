/**
 * URL 내용 가져오기 유틸리티
 * 메시지에 URL을 포함하면 해당 페이지 내용을 추출
 * YouTube URL은 자막(transcript)을 추출
 */

import { isYouTubeUrl, getYouTubeTranscript } from './youtube.js';

// URL 정규식 패턴
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

// SSRF 방지 — 내부 네트워크 호스트네임/IP 블랙리스트
const BLOCKED_HOSTNAMES = [
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
  'metadata.google.internal',
  'instance-data',
];

/**
 * URL이 내부 네트워크를 가리키는지 검사 (SSRF 방지)
 * @param {string} url
 * @returns {boolean} 차단해야 하면 true
 */
function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 명시적 블랙리스트
    if (BLOCKED_HOSTNAMES.includes(hostname)) return true;

    // 사설 IP 대역 검사
    // 10.x.x.x
    if (/^10\./.test(hostname)) return true;
    // 172.16-31.x.x
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    // 192.168.x.x
    if (/^192\.168\./.test(hostname)) return true;
    // 169.254.x.x (링크-로컬, AWS 메타데이터 등)
    if (/^169\.254\./.test(hostname)) return true;
    // 0.x.x.x
    if (/^0\./.test(hostname)) return true;

    // file:// 프로토콜 차단
    if (parsed.protocol === 'file:') return true;

    return false;
  } catch {
    return true; // 파싱 실패 시 안전하게 차단
  }
}

/**
 * 메시지에서 URL 추출
 */
export function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // URL 길이 제한 (2000자), 중복 제거, 최대 3개
  return [...new Set(matches)].filter(url => url.length <= 2000).slice(0, 3);
}

/**
 * 메시지에서 YouTube URL만 추출
 */
export function extractYouTubeUrlsFromMessage(text) {
  const urls = extractUrls(text);
  return urls.filter((url) => isYouTubeUrl(url));
}

/**
 * 메시지에 YouTube URL이 포함되어 있는지 확인
 */
export function hasYouTubeUrl(text) {
  const urls = extractUrls(text);
  return urls.some((url) => isYouTubeUrl(url));
}

/**
 * URL에서 텍스트 콘텐츠 가져오기
 * YouTube URL → 자막 추출, 일반 URL → HTML 텍스트 추출
 */
export async function fetchUrlContent(url, maxLength = 8000) {
  // SSRF 방지: 내부 네트워크 URL 차단
  if (isInternalUrl(url)) {
    return { url, error: '내부 네트워크 URL은 접근할 수 없습니다.', content: null };
  }

  // YouTube URL인 경우 자막 추출
  if (isYouTubeUrl(url)) {
    try {
      const transcript = await getYouTubeTranscript(url, maxLength);
      if (transcript) {
        return { url, content: transcript, type: 'youtube' };
      }
      return { url, error: '자막을 가져올 수 없는 영상입니다.', content: null };
    } catch (error) {
      return { url, error: `YouTube 자막 추출 실패: ${error.message}`, content: null };
    }
  }

  // 일반 URL
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DanggokAI/1.0)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
      },
      redirect: 'manual', // 리디렉트를 직접 처리하여 SSRF 방지
    });

    // 리디렉트 응답 시 대상 URL 검증
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get('location');
      if (redirectUrl && isInternalUrl(new URL(redirectUrl, url).href)) {
        clearTimeout(timeout);
        return { url, error: '리디렉트 대상이 내부 네트워크입니다.', content: null };
      }
      // 안전한 리디렉트면 다시 fetch (최대 1회)
      const safeRedirect = await fetch(new URL(redirectUrl, url).href, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DanggokAI/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
        },
        redirect: 'manual',
      });
      clearTimeout(timeout);

      if (!safeRedirect.ok) {
        return { url, error: `HTTP ${safeRedirect.status}`, content: null };
      }

      const contentType2 = safeRedirect.headers.get('content-type') || '';
      if (contentType2.includes('application/json')) {
        const json = await safeRedirect.json();
        return { url, content: JSON.stringify(json, null, 2).slice(0, maxLength), type: 'json' };
      }
      const html2 = await safeRedirect.text();
      let text2 = html2
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&[a-zA-Z]+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (text2.length > maxLength) text2 = text2.slice(0, maxLength) + '\n\n... (내용이 잘렸습니다)';
      return { url, content: text2, type: 'html' };
    }

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
 * @param {string} message - 사용자 메시지
 * @param {Object} options - { skipYouTube: true } Gemini는 YouTube를 네이티브 처리하므로 스킵
 */
export async function fetchUrlsFromMessage(message, options = {}) {
  let urls = extractUrls(message);
  if (urls.length === 0) return null;

  // Gemini 프로바이더인 경우 YouTube URL은 스킵 (네이티브 fileData로 처리)
  if (options.skipYouTube) {
    urls = urls.filter((url) => !isYouTubeUrl(url));
    if (urls.length === 0) return null;
  }

  const results = await Promise.all(urls.map((url) => fetchUrlContent(url)));

  const successResults = results.filter((r) => r.content);
  if (successResults.length === 0) return null;

  let context = '\n\n---\n[URL 내용 참조]\n';
  for (const result of successResults) {
    if (result.type === 'youtube') {
      context += `\n### YouTube 영상 자막: ${result.url}\n${result.content}\n`;
    } else {
      context += `\n### ${result.url}\n${result.content}\n`;
    }
  }
  context += '\n---\n';

  return context;
}
