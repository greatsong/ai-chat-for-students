// youtube-transcript ESM export 경로 직접 지정
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

// YouTube URL 정규식 (다양한 형식 지원)
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

/**
 * YouTube URL인지 판별
 */
export function isYouTubeUrl(url) {
  return YOUTUBE_REGEX.test(url);
}

/**
 * YouTube URL에서 비디오 ID 추출
 */
export function extractVideoId(url) {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

/**
 * YouTube 영상의 자막(transcript) 추출
 * @param {string} url - YouTube URL
 * @param {number} maxLength - 최대 문자 수 (기본 15000)
 * @returns {string|null} 타임스탬프 포함 자막 텍스트
 */
export async function getYouTubeTranscript(url, maxLength = 15000) {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  try {
    let transcript;

    // 한국어 자막 우선 시도, 실패 시 기본 자막
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    } catch {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      } catch {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      }
    }

    if (!transcript || transcript.length === 0) return null;

    // 타임스탬프 포함 포맷
    const lines = transcript.map((item) => {
      const totalSeconds = Math.floor(item.offset / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      return `[${timestamp}] ${item.text}`;
    });

    let result = lines.join('\n');

    // 길이 제한
    if (result.length > maxLength) {
      result = result.slice(0, maxLength) + '\n... (자막이 잘렸습니다)';
    }

    return result;
  } catch (error) {
    console.error(`[youtube] 자막 추출 실패 (${videoId}):`, error.message);
    return null;
  }
}
