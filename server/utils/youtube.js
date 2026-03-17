// YouTube URL 정규식 (다양한 형식 지원)
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';

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
 * HTML 엔티티 디코딩
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/**
 * 자막 XML 파싱 (두 가지 형식 지원)
 * 새 형식: <p t="ms" d="ms"><s>text</s></p>
 * 구 형식: <text start="s" dur="s">text</text>
 */
function parseTranscriptXml(xml) {
  const items = [];

  // 새 형식: <p t="..." d="..."><s>text</s></p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const offset = parseInt(match[1], 10);
    const inner = match[3];
    // <s> 태그에서 텍스트 추출
    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) text = inner.replace(/<[^>]+>/g, '');
    text = decodeEntities(text).trim();
    if (text) items.push({ offset, text });
  }

  if (items.length > 0) return items;

  // 구 형식: <text start="..." dur="...">text</text>
  const textRegex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const offset = Math.floor(parseFloat(match[1]) * 1000);
    const text = decodeEntities(match[3].replace(/<[^>]+>/g, '')).trim();
    if (text) items.push({ offset, text });
  }

  return items;
}

/**
 * 방법 1: InnerTube API (Android 클라이언트) — 클라우드 서버에서도 작동
 */
async function fetchViaInnerTube(videoId) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ANDROID_UA,
    },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
      videoId,
    }),
  });

  if (!res.ok) throw new Error(`InnerTube API ${res.status}`);

  const data = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('InnerTube: 자막 트랙 없음');
  }

  return fetchFromTracks(tracks, videoId);
}

/**
 * 방법 2: YouTube 웹 페이지 파싱
 */
async function fetchViaWebPage(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': WEB_UA },
  });

  if (!res.ok) throw new Error(`웹 페이지 ${res.status}`);
  const html = await res.text();

  if (html.includes('class="g-recaptcha"')) {
    throw new Error('YouTube CAPTCHA 요구 (IP 차단)');
  }

  // ytInitialPlayerResponse 파싱 (중괄호 매칭)
  const marker = 'var ytInitialPlayerResponse = ';
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error('플레이어 응답 없음');

  const start = idx + marker.length;
  let depth = 0;
  let end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  const playerResponse = JSON.parse(html.slice(start, end));
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('웹 페이지: 자막 트랙 없음');
  }

  return fetchFromTracks(tracks, videoId);
}

/**
 * 자막 트랙 배열에서 최적 트랙 선택 후 XML 다운로드 및 파싱
 */
async function fetchFromTracks(tracks, videoId) {
  // 한국어 → 영어 → 첫 번째
  const track =
    tracks.find((t) => t.languageCode === 'ko') ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks[0];

  const captionUrl = track.baseUrl;

  // 보안 검증
  try {
    if (!new URL(captionUrl).hostname.endsWith('.youtube.com')) {
      throw new Error('유효하지 않은 자막 URL');
    }
  } catch (e) {
    if (e.message === '유효하지 않은 자막 URL') throw e;
    throw new Error('자막 URL 파싱 실패');
  }

  console.log(`[youtube] 트랙: ${track.languageCode} (${track.name?.simpleText || 'auto'})`);

  const res = await fetch(captionUrl, {
    headers: { 'User-Agent': WEB_UA },
  });

  if (!res.ok) throw new Error(`자막 다운로드 ${res.status}`);
  const xml = await res.text();

  if (!xml || xml.length === 0) {
    throw new Error('자막 XML 비어있음');
  }

  const items = parseTranscriptXml(xml);
  if (items.length === 0) throw new Error('자막 파싱 결과 없음');

  return items;
}

/**
 * YouTube oEmbed API로 영상 메타데이터 가져오기
 */
async function getVideoMeta(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      return { title: data.title, author: data.author_name };
    }
  } catch (e) {
    console.log(`[youtube] oEmbed 실패: ${e.message}`);
  }
  return null;
}

/**
 * YouTube 영상의 자막(transcript) 추출
 * 방법 1: InnerTube API (Android) — 클라우드 서버 호환
 * 방법 2: 웹 페이지 파싱 — 폴백
 * 방법 3: oEmbed 메타데이터 — 자막 실패 시 최소 정보
 */
export async function getYouTubeTranscript(url, maxLength = 15000) {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  console.log(`[youtube] 자막 추출 시작: ${videoId}`);

  let transcript = null;

  // 방법 1: InnerTube API (Android)
  try {
    transcript = await fetchViaInnerTube(videoId);
    console.log(`[youtube] InnerTube 성공: ${transcript.length}개 항목`);
  } catch (err) {
    console.log(`[youtube] InnerTube 실패: ${err.message}`);
  }

  // 방법 2: 웹 페이지 파싱
  if (!transcript || transcript.length === 0) {
    try {
      transcript = await fetchViaWebPage(videoId);
      console.log(`[youtube] 웹 파싱 성공: ${transcript.length}개 항목`);
    } catch (err) {
      console.log(`[youtube] 웹 파싱 실패: ${err.message}`);
    }
  }

  // 자막 추출 성공
  if (transcript && transcript.length > 0) {
    const lines = transcript.map((item) => {
      const totalSeconds = Math.floor(item.offset / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      return `[${timestamp}] ${item.text}`;
    });

    let result = lines.join('\n');
    if (result.length > maxLength) {
      result = result.slice(0, maxLength) + '\n... (자막이 잘렸습니다)';
    }
    console.log(`[youtube] 자막 추출 성공: ${result.length}자`);
    return result;
  }

  // 방법 3: 메타데이터 폴백
  console.log('[youtube] 자막 추출 실패, 메타데이터 시도');
  const meta = await getVideoMeta(videoId);
  if (meta) {
    const fallback = `[YouTube 영상 정보]\n제목: ${meta.title}\n채널: ${meta.author}\nURL: https://www.youtube.com/watch?v=${videoId}\n\n(자막을 가져올 수 없어 영상 정보만 제공합니다. 영상 내용에 대한 질문에는 제목과 채널 정보를 바탕으로 답변해주세요.)`;
    console.log(`[youtube] 메타데이터 폴백: ${meta.title}`);
    return fallback;
  }

  console.log('[youtube] 모든 방법 실패');
  return null;
}
