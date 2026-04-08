/**
 * URL 내용 가져오기 유틸리티
 * 메시지에 URL을 포함하면 해당 페이지 내용을 추출
 * YouTube URL은 자막(transcript)을 추출
 */

import dns from 'dns/promises';
import { isYouTubeUrl, getYouTubeTranscript } from './youtube.js';

// URL 정규식 패턴
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

// SSRF 방지 — 내부 네트워크 호스트네임/IP 블랙리스트
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
  'instance-data',
];

/**
 * IP 주소가 사설/내부 대역인지 검사
 * @param {string} ip - IPv4 또는 IPv6 주소
 * @returns {boolean}
 */
export function isPrivateIP(ip) {
  // IPv4 사설 대역
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^0\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;

  // IPv6 사설 대역
  if (ip === '::1') return true;
  if (/^fe80:/i.test(ip)) return true; // 링크-로컬
  if (/^fc00:/i.test(ip)) return true; // ULA (fc00::/7)
  if (/^fd/i.test(ip)) return true; // ULA (fd00::/8)
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIP(mapped[1]);

  return false;
}

/**
 * URL이 내부 네트워크를 가리키는지 검사 (SSRF 방지 — 1차 문자열 검사)
 * @param {string} url
 * @returns {boolean} 차단해야 하면 true
 */
export function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 명시적 블랙리스트
    if (BLOCKED_HOSTNAMES.includes(hostname)) return true;

    // IP 주소 형태인 경우 사설 대역 검사
    if (isPrivateIP(hostname)) return true;

    // file:// 프로토콜 차단
    if (parsed.protocol === 'file:') return true;

    return false;
  } catch {
    return true; // 파싱 실패 시 안전하게 차단
  }
}

/**
 * DNS 해석 후 실제 IP가 사설 대역인지 검증 (DNS rebinding 방어)
 * @param {string} hostname
 * @returns {Promise<boolean>} 사설 IP로 해석되면 true
 */
export async function resolvesToPrivateIP(hostname) {
  try {
    // 이미 IP 주소 형태면 DNS 해석 불필요
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
      return isPrivateIP(hostname);
    }
    const { address } = await dns.lookup(hostname);
    return isPrivateIP(address);
  } catch {
    return true; // DNS 해석 실패 시 안전하게 차단
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
  return [...new Set(matches)].filter((url) => url.length <= 2000).slice(0, 3);
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
  // SSRF 방지: 1차 문자열 기반 검사
  if (isInternalUrl(url)) {
    return { url, error: '내부 네트워크 URL은 접근할 수 없습니다.', content: null };
  }

  // SSRF 방지: 2차 DNS 해석 후 실제 IP 검증 (DNS rebinding 방어)
  try {
    const parsed = new URL(url);
    if (await resolvesToPrivateIP(parsed.hostname)) {
      return { url, error: '내부 네트워크 URL은 접근할 수 없습니다.', content: null };
    }
  } catch {
    return { url, error: 'URL 검증 실패', content: null };
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

  // 크기 제한 텍스트 읽기 헬퍼 (Content-Length가 없는 chunked 응답 대응)
  const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 응답 본문 최대 2MB
  async function safeText(resp) {
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return new TextDecoder().decode(buf.slice(0, MAX_RESPONSE_BYTES));
    }
    return new TextDecoder().decode(buf);
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
      redirect: 'manual', // 리디���트를 직접 처리하여 SSRF 방지
    });

    // 응답 크기 사전 검사 (Content-Length 기반)
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      clearTimeout(timeout);
      return { url, error: '응답 크기가 너무 큽니다 (2MB 초과).', content: null };
    }

    // 리디렉트 응답 시 대상 URL 검증
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get('location');
      const resolvedRedirect = redirectUrl ? new URL(redirectUrl, url).href : null;
      if (!resolvedRedirect || isInternalUrl(resolvedRedirect)) {
        clearTimeout(timeout);
        return { url, error: '리디렉트 대상이 내부 네트워크입니다.', content: null };
      }
      // DNS 해석 후 2차 검증
      try {
        const redirectParsed = new URL(resolvedRedirect);
        if (await resolvesToPrivateIP(redirectParsed.hostname)) {
          clearTimeout(timeout);
          return { url, error: '리디렉트 대상이 내부 네트워크입니다.', content: null };
        }
      } catch {
        clearTimeout(timeout);
        return { url, error: '리디렉트 URL 검증 실패', content: null };
      }
      // 안전한 리디렉트면 다시 fetch (최대 1회)
      const safeRedirect = await fetch(resolvedRedirect, {
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
        const json = JSON.parse(await safeText(safeRedirect));
        return { url, content: JSON.stringify(json, null, 2).slice(0, maxLength), type: 'json' };
      }
      const html2 = await safeText(safeRedirect);
      let text2 = html2
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-zA-Z]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text2.length > maxLength)
        text2 = text2.slice(0, maxLength) + '\n\n... (내용이 잘렸습니다)';
      return { url, content: text2, type: 'html' };
    }

    clearTimeout(timeout);

    if (!response.ok) {
      return { url, error: `HTTP ${response.status}`, content: null };
    }

    const contentType = response.headers.get('content-type') || '';

    // JSON 응답
    if (contentType.includes('application/json')) {
      const json = JSON.parse(await safeText(response));
      const text = JSON.stringify(json, null, 2).slice(0, maxLength);
      return { url, content: text, type: 'json' };
    }

    // 텍스트/HTML 응답
    const html = await safeText(response);

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
