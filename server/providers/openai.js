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
 * Chat Completions 포맷 메시지를 Responses API input 포맷으로 변환
 *   text       → input_text
 *   image_url  → input_image (url 그대로)
 *   string     → 그대로 (Responses API도 string 허용)
 *
 * @param {Array} messages - Chat Completions 메시지
 * @returns {Array} Responses API input
 */
export function convertToResponsesInput(messages) {
  return messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    if (!Array.isArray(m.content)) {
      return { role: m.role, content: '' };
    }
    const newContent = m.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'input_text', text: part.text || '' };
      }
      if (part.type === 'image_url') {
        return { type: 'input_image', image_url: part.image_url?.url, detail: 'auto' };
      }
      return part;
    });
    return { role: m.role, content: newContent };
  });
}

/**
 * Responses API 최종 응답의 output 배열에서 code_interpreter 호출/결과를 마크다운으로 추출
 *
 * Responses API output 아이템 예시:
 *   { type: 'code_interpreter_call', code: 'print("hi")', outputs: [{ type: 'logs', logs: 'hi\n' }] }
 *   { type: 'message', content: [{ type: 'output_text', text: '...' }] }
 *
 * @param {Array} outputItems - response.output
 * @returns {string} 마크다운 (코드 펜스 + 실행 로그)
 */
export function extractCodeInterpreterOutput(outputItems) {
  const parts = [];
  for (const item of outputItems || []) {
    if (item?.type !== 'code_interpreter_call') continue;

    const code = item.code || '';
    if (code) {
      parts.push(`\n\n**실행한 코드:**\n\`\`\`python\n${code}\n\`\`\``);
    }

    for (const out of item.outputs || []) {
      if (out?.type === 'logs') {
        const logs = out.logs || '(출력 없음)';
        parts.push(`\n\n**실행 결과:**\n\`\`\`\n${logs}\n\`\`\``);
      } else if (out?.type === 'image') {
        // 이미지 결과는 파일 ID로 옴 — 우선 안내만 표시
        parts.push(`\n\n*(코드가 생성한 이미지: file_id=${out.file_id || 'unknown'})*`);
      }
    }
  }
  return parts.join('');
}

/**
 * Responses API + code_interpreter 도구로 스트리밍
 * (내부 함수 — streamChat에서 options.codeExecution=true일 때만 호출)
 */
async function streamWithCodeInterpreter({
  openai,
  messages,
  systemPrompt,
  model,
  onText,
  onDone,
  onError,
}) {
  try {
    console.log('[openai.streamChat] 코드 인터프리터 활성화 (Responses API)');
    const input = convertToResponsesInput(messages);

    const createParams = {
      model: model || 'gpt-5.5',
      input,
      max_output_tokens: 16384,
      stream: true,
      tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
    };
    if (systemPrompt) createParams.instructions = systemPrompt;

    const stream = await openai.responses.create(createParams);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          const delta = event.delta || '';
          if (delta) {
            fullContent += delta;
            onText(delta);
          }
        } else if (event.type === 'response.completed') {
          const resp = event.response || {};
          inputTokens = resp.usage?.input_tokens || 0;
          outputTokens = resp.usage?.output_tokens || 0;
          const toolOutput = extractCodeInterpreterOutput(resp.output || []);
          if (toolOutput) {
            fullContent += toolOutput;
            onText(toolOutput);
          }
        } else if (event.type === 'response.failed' || event.type === 'response.error') {
          throw new Error(event.response?.error?.message || 'OpenAI 응답 실패');
        }
      }
    } catch (streamError) {
      stream.controller?.abort?.();
      throw streamError;
    }

    onDone({ fullContent, inputTokens, outputTokens });
  } catch (error) {
    onError(error);
  }
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
 * @param {Object} params.options - { webSearch, codeExecution }
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

    // 코드 실행이 활성화된 경우 Responses API로 분기 (Chat Completions에 없음)
    if (options.codeExecution) {
      return await streamWithCodeInterpreter({
        openai,
        messages,
        systemPrompt,
        model,
        onText,
        onDone,
        onError,
      });
    }

    // 시스템 프롬프트를 메시지 배열 앞에 추가
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const createParams = {
      model: model || 'gpt-5.5',
      messages: allMessages,
      max_completion_tokens: 16384,
      stream: true,
      stream_options: { include_usage: true },
    };

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
 * OpenAI 이미지 생성 (gpt-image-2)
 * @param {Object} params
 * @param {string} params.prompt - 이미지 생성 프롬프트
 * @param {string} params.model - 모델 ID (기본: gpt-image-2)
 * @param {string} params.size - 이미지 크기 (기본: 1024x1024)
 * @param {string} params.quality - 렌더링 품질 (low|medium|high|auto, 기본: high)
 * @returns {{ imageData: string, mimeType: string }}
 *
 * 주의: gpt-image 계열은 항상 base64(b64_json)로 반환하며 response_format 파라미터를
 * 지원하지 않는다 (전달 시 "Unknown parameter" 400 에러). DALL·E와 다른 점.
 */
export async function generateImage({ prompt, model, size, quality }) {
  const openai = await getClient();

  const result = await withRetry(() =>
    openai.images.generate({
      model: model || 'gpt-image-2',
      prompt,
      n: 1,
      size: size || '1024x1024',
      quality: quality || 'high',
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
