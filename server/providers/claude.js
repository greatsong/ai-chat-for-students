import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from '../utils/apiKeys.js';
import { withRetry } from '../utils/retry.js';

let cachedKey = null;
let anthropic = null;

async function getClient() {
  const key = await getApiKey('anthropic');
  if (!anthropic || key !== cachedKey) {
    cachedKey = key;
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

/**
 * 파일을 Anthropic 콘텐츠 블록으로 변환
 * @param {Array} files - [{type, data, mimeType, name}]
 * @returns {Array} Anthropic content blocks
 */
function filesToContentBlocks(files) {
  if (!files || files.length === 0) return [];

  const blocks = [];

  for (const f of files) {
    if (f.type === 'image') {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: f.mimeType,
          data: f.data,
        },
      });
    } else if (f.type === 'pdf') {
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: f.data,
        },
      });
    } else if (f.type === 'text') {
      blocks.push({
        type: 'text',
        text: `[파일: ${f.name}]\n${f.data}`,
      });
    }
  }

  return blocks;
}

/**
 * 대화 기록에서 Anthropic 메시지 배열 생성
 * @param {Array} history - DB에서 조회한 메시지 배열
 * @returns {Array} Anthropic messages format
 */
export function buildMessages(history) {
  return history.map((msg) => {
    if (msg.role === 'user' && msg.files) {
      let files = [];
      try {
        files = typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
      } catch {
        // 파싱 실패 시 빈 배열
      }

      if (files.length > 0) {
        console.log(
          `[claude.buildMessages] 파일 ${files.length}개:`,
          files.map((f) => ({
            type: f.type,
            mimeType: f.mimeType,
            name: f.name,
            dataLen: f.data?.length || 0,
          })),
        );
        const contentBlocks = filesToContentBlocks(files);
        console.log(`[claude.buildMessages] 콘텐츠 블록 ${contentBlocks.length}개 생성`);
        // 빈 텍스트 블록은 Claude API가 거부하므로, 내용이 있을 때만 추가
        if (msg.content && msg.content.trim()) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        return { role: 'user', content: contentBlocks };
      }
    }

    // 빈 content는 Claude API가 거부하므로 기본값 제공
    return { role: msg.role, content: msg.content || ' ' };
  });
}

/**
 * Claude 스트리밍 채팅
 * @param {Object} params
 * @param {Array} params.messages - Anthropic 포맷 메시지 배열
 * @param {string} params.systemPrompt - 시스템 프롬프트
 * @param {string} params.model - 모델 ID
 * @param {Function} params.onText - 텍스트 청크 콜백
 * @param {Function} params.onDone - 완료 콜백 ({ fullContent, inputTokens, outputTokens })
 * @param {Function} params.onError - 에러 콜백
 */
export async function streamChat({ messages, systemPrompt, model, onText, onDone, onError }) {
  try {
    // 디버그: 메시지 구조 확인 (base64 데이터는 길이만 표시)
    const debugMessages = messages.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((block) => {
            if (block.type === 'image') {
              return {
                type: 'image',
                media_type: block.source?.media_type,
                dataLen: block.source?.data?.length || 0,
              };
            }
            if (block.type === 'document') {
              return {
                type: 'document',
                media_type: block.source?.media_type,
                dataLen: block.source?.data?.length || 0,
              };
            }
            return { type: block.type, textLen: block.text?.length || 0 };
          }),
        };
      }
      return { role: m.role, contentLen: (m.content || '').length };
    });
    console.log('[claude.streamChat] 메시지 구조:', JSON.stringify(debugMessages));

    const streamParams = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages,
    };

    if (systemPrompt) {
      streamParams.system = systemPrompt;
    }

    const client = await getClient();
    const stream = client.messages.stream(streamParams);

    let fullContent = '';

    stream.on('text', (text) => {
      fullContent += text;
      onText(text);
    });

    stream.on('finalMessage', (message) => {
      const inputTokens = message.usage?.input_tokens || 0;
      const outputTokens = message.usage?.output_tokens || 0;
      onDone({ fullContent, inputTokens, outputTokens });
    });

    stream.on('error', (error) => {
      stream.abort();
      onError(error);
    });

    // 스트림 완료 대기
    await stream.finalMessage();
  } catch (error) {
    onError(error);
  }
}
