import OpenAI from 'openai';

let client;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.UPSTAGE_API_KEY,
      baseURL: 'https://api.upstage.ai/v1',
    });
  }
  return client;
}

/**
 * 대화 기록에서 Solar 메시지 배열 생성 (텍스트 전용)
 * @param {Array} history - DB에서 조회한 메시지 배열
 * @returns {Array} OpenAI-compatible messages format
 */
export function buildMessages(history) {
  return history.map((msg) => {
    // Solar는 텍스트 전용이므로 파일 첨부 시 텍스트 파일만 포함
    if (msg.role === 'user' && msg.files) {
      let files = [];
      try {
        files = JSON.parse(msg.files);
      } catch {
        // 파싱 실패 시 빈 배열
      }

      if (files.length > 0) {
        const textParts = files
          .filter((f) => f.type === 'text')
          .map((f) => `[파일: ${f.name}]\n${f.data}`)
          .join('\n\n');

        const content = textParts
          ? `${textParts}\n\n${msg.content || ''}`
          : msg.content || '';

        return { role: 'user', content };
      }
    }

    return { role: msg.role, content: msg.content || '' };
  });
}

/**
 * Solar 스트리밍 채팅
 * @param {Object} params
 * @param {Array} params.messages - OpenAI-compatible 메시지 배열
 * @param {string} params.systemPrompt - 시스템 프롬프트
 * @param {string} params.model - 모델 ID
 * @param {Function} params.onText - 텍스트 청크 콜백
 * @param {Function} params.onDone - 완료 콜백
 * @param {Function} params.onError - 에러 콜백
 */
export async function streamChat({ messages, systemPrompt, model, onText, onDone, onError }) {
  try {
    const solar = getClient();

    // 시스템 프롬프트를 메시지 배열 앞에 추가
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const stream = await solar.chat.completions.create({
      model: model || 'solar-pro-3',
      messages: allMessages,
      stream: true,
    });

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      // 사용량 정보
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

    onDone({ fullContent, inputTokens, outputTokens });
  } catch (error) {
    onError(error);
  }
}
