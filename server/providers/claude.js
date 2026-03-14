import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
        files = JSON.parse(msg.files);
      } catch {
        // 파싱 실패 시 빈 배열
      }

      if (files.length > 0) {
        const contentBlocks = filesToContentBlocks(files);
        contentBlocks.push({ type: 'text', text: msg.content || '' });
        return { role: 'user', content: contentBlocks };
      }
    }

    return { role: msg.role, content: msg.content || '' };
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
    const streamParams = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages,
    };

    if (systemPrompt) {
      streamParams.system = systemPrompt;
    }

    const stream = anthropic.messages.stream(streamParams);

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
      onError(error);
    });

    // 스트림 완료 대기
    await stream.finalMessage();
  } catch (error) {
    onError(error);
  }
}
