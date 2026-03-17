// youtube-transcript 동적 로드 (import 경로 호환성 확보)
let YoutubeTranscript;
try {
  const mod = await import('youtube-transcript/dist/youtube-transcript.esm.js');
  YoutubeTranscript = mod.YoutubeTranscript;
  console.log('[youtube] youtube-transcript 모듈 로드 성공 (ESM)');
} catch (e1) {
  try {
    const mod = await import('youtube-transcript');
    YoutubeTranscript = mod.YoutubeTranscript || mod.default?.YoutubeTranscript;
    console.log('[youtube] youtube-transcript 모듈 로드 성공 (기본)');
  } catch (e2) {
    console.error('[youtube] youtube-transcript 모듈 로드 실패:', e2.message);
  }
}

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
  if (!YoutubeTranscript) {
    console.error('[youtube] YoutubeTranscript 모듈이 로드되지 않았습니다.');
    return null;
  }

  const videoId = extractVideoId(url);
  if (!videoId) return null;

  console.log(`[youtube] 자막 추출 시작: ${videoId}`);

  try {
    let transcript;

    // 한국어 자막 우선 시도, 실패 시 기본 자막
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
      console.log(`[youtube] 한국어 자막 ${transcript?.length || 0}개 항목`);
    } catch (koErr) {
      console.log(`[youtube] 한국어 자막 없음, 영어 시도: ${koErr.message}`);
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        console.log(`[youtube] 영어 자막 ${transcript?.length || 0}개 항목`);
      } catch (enErr) {
        console.log(`[youtube] 영어 자막 없음, 기본 시도: ${enErr.message}`);
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log(`[youtube] 기본 자막 ${transcript?.length || 0}개 항목`);
      }
    }

    if (!transcript || transcript.length === 0) {
      console.log('[youtube] 자막 데이터 비어있음');
      return null;
    }

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

    console.log(`[youtube] 자막 추출 성공: ${result.length}자`);
    return result;
  } catch (error) {
    console.error(`[youtube] 자막 추출 실패 (${videoId}):`, error.message);
    return null;
  }
}
