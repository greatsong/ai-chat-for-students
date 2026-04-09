import OpenAI from 'openai';
import { getApiKey } from '../utils/apiKeys.js';
import { withRetry } from '../utils/retry.js';

let cachedKey = null;
let client = null;

async function getClient() {
  const key = await getApiKey('openai');
  if (!client || key !== cachedKey) {
    cachedKey = key;
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

/**
 * 대화 기록에서 OpenAI 메시지 배열 생성
 * @param {Array} history - DB에서 조회한 메시지 배열
 * @returns {Array} OpenAI messages format
 */
export function buildMessages(history) {
  return history.map((msg) => {
    if (msg.role === 'user' && msg.files) {
      let files = [];
      try {
        files = JSON.parse(msg.files);
      } catch {
        // 파싱 실패 시 빈 배열
      }

      if (files.length > 0) {
        const content = [];

        for (const f of files) {
          if (f.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${f.mimeType};base64,${f.data}`,
              },
            });
          } else if (f.type === 'text') {
            content.push({
              type: 'text',
              text: `[파일: ${f.name}]\n${f.data}`,
            });
          } else if (f.type === 'pdf') {
            // OpenAI는 PDF를 직접 지원하지 않으므로 텍스트로 전달
            content.push({
              type: 'text',
              text: `[PDF 파일: ${f.name}] (base64 데이터는 지원되지 않습니다)`,
            });
          }
        }

        content.push({ type: 'text', text: msg.content || '' });
        return { role: 'user', content };
      }
    }

    return { role: msg.role, content: msg.content || '' };
  });
}

/**
 * OpenAI 스트리밍 채팅
 * @param {Object} params
 * @param {Array} params.messages - OpenAI 포맷 메시지 배열
 * @param {string} params.systemPrompt - 시스템 프롬프트
 * @param {string} params.model - 모델 ID
 * @param {Function} params.onText - 텍스트 청크 콜백
 * @param {Function} params.onDone - 완료 콜백
 * @param {Function} params.onError - 에러 콜백
 * @param {Object} params.options - { webSearch }
 */
export async function streamChat({
  messages,
  systemPrompt,
  model,
  onText,
  onDone,
  onError,
  options = {},
}) {
  try {
    const openai = await getClient();

    // 시스템 프롬프트를 메시지 배열 앞에 추가
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const createParams = {
      model: model || 'gpt-5.4',
      messages: allMessages,
      max_completion_tokens: 16384,
      stream: true,
      stream_options: { include_usage: true },
    };

    // 웹 검색: OpenAI Chat Completions API에서는 미지원 (Responses API 전용)
    // if (options.webSearch) {
    //   createParams.tools = [{ type: 'web_search_preview' }];
    // }

    const stream = await openai.chat.completions.create(createParams);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const chunk of stream) {
        // 사용량 정보 (스트림 마지막 청크에 포함)
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          onText(delta.content);
        }
      }
    } catch (streamError) {
      // 스트림 도중 에러 발생 시 컨트롤러 정리
      stream.controller?.abort();
      throw streamError;
    }

    onDone({ fullContent, inputTokens, outputTokens });
  } catch (error) {
    onError(error);
  }
}

/**
 * OpenAI 이미지 생성
 * @param {Object} params
 * @param {string} params.prompt - 이미지 생성 프롬프트
 * @param {string} params.model - 모델 ID (기본: gpt-image-1.5)
 * @param {string} params.size - 이미지 크기 (기본: 1024x1024)
 * @returns {{ imageData: string, mimeType: string }}
 */
export async function generateImage({ prompt, model, size }) {
  const openai = await getClient();

  const result = await withRetry(() =>
    openai.images.generate({
      model: model || 'gpt-image-1.5',
      prompt,
      n: 1,
      size: size || '1024x1024',
      response_format: 'b64_json',
    }),
  );

  const imageData = result.data?.[0]?.b64_json;
  if (!imageData) {
    throw new Error('이미지 생성에 실패했습니다. 응답에 이미지가 포함되지 않았습니다.');
  }

  return {
    imageData,
    mimeType: 'image/png',
  };
}

/**
 * OpenAI TTS (텍스트 → 음성)
 * @param {Object} params
 * @param {string} params.text - 읽을 텍스트
 * @param {string} params.voice - 음성 (alloy, echo, fable, onyx, nova, shimmer)
 * @param {string} params.model - 모델 (tts-1, tts-1-hd)
 * @returns {{ audioData: string, mimeType: string }}
 */
export async function generateSpeech({ text, voice, model }) {
  const openai = await getClient();

  const response = await withRetry(() =>
    openai.audio.speech.create({
      model: model || 'tts-1',
      voice: voice || 'alloy',
      input: text.slice(0, 4096),
      response_format: 'mp3',
    }),
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    audioData: buffer.toString('base64'),
    mimeType: 'audio/mpeg',
  };
}

/**
 * OpenAI STT (음성 → 텍스트)
 * @param {Object} params
 * @param {Buffer} params.audioBuffer - 오디오 바이너리
 * @param {string} params.mimeType - MIME 타입
 * @returns {{ text: string }}
 */
export async function transcribeAudio({ audioBuffer, mimeType }) {
  const openai = await getClient();

  const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
  // OpenAI SDK는 name 속성이 있는 Blob을 File처럼 인식
  blob.name = `recording.${ext}`;

  const transcription = await withRetry(() =>
    openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: blob,
    }),
  );

  return { text: transcription.text };
}
