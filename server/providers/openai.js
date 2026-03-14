import OpenAI from 'openai';

let client;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
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
export async function streamChat({ messages, systemPrompt, model, onText, onDone, onError, options = {} }) {
  try {
    const openai = getClient();

    // 시스템 프롬프트를 메시지 배열 앞에 추가
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const createParams = {
      model: model || 'gpt-5.4',
      messages: allMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    // 웹 검색 도구 설정
    if (options.webSearch) {
      createParams.tools = [{ type: 'web_search_preview' }];
    }

    const stream = await openai.chat.completions.create(createParams);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

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
  const openai = getClient();

  const result = await openai.images.generate({
    model: model || 'gpt-image-1.5',
    prompt,
    n: 1,
    size: size || '1024x1024',
    response_format: 'b64_json',
  });

  const imageData = result.data?.[0]?.b64_json;
  if (!imageData) {
    throw new Error('이미지 생성에 실패했습니다. 응답에 이미지가 포함되지 않았습니다.');
  }

  return {
    imageData,
    mimeType: 'image/png',
  };
}
