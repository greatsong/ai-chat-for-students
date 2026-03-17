import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return genAI;
}

// YouTube URL 감지 정규식
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi;

/**
 * 텍스트에서 YouTube URL 추출
 */
function extractYouTubeUrls(text) {
  if (!text) return [];
  const urls = [];
  let match;
  YOUTUBE_REGEX.lastIndex = 0;
  while ((match = YOUTUBE_REGEX.exec(text)) !== null) {
    // 전체 매칭된 URL이 http로 시작하지 않으면 https:// 추가
    const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
    urls.push(url);
  }
  return [...new Set(urls)];
}

/**
 * 대화 기록에서 Gemini 메시지 배열 생성
 * YouTube URL이 포함된 경우 fileData로 네이티브 전달
 * @param {Array} history - DB에서 조회한 메시지 배열
 * @returns {Array} Gemini contents format
 */
export function buildMessages(history) {
  return history.map((msg) => {
    const parts = [];

    if (msg.role === 'user' && msg.files) {
      let files = [];
      try {
        files = JSON.parse(msg.files);
      } catch {
        // 파싱 실패 시 빈 배열
      }

      for (const f of files) {
        if (f.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: f.mimeType,
              data: f.data,
            },
          });
        } else if (f.type === 'pdf') {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: f.data,
            },
          });
        } else if (f.type === 'text') {
          parts.push({ text: `[파일: ${f.name}]\n${f.data}` });
        }
      }
    }

    // YouTube URL → fileData로 네이티브 전달 (Gemini가 영상 직접 이해)
    if (msg.role === 'user') {
      const ytUrls = extractYouTubeUrls(msg.content);
      for (const url of ytUrls) {
        parts.push({
          fileData: {
            fileUri: url,
            mimeType: 'video/mp4',
          },
        });
      }
    }

    parts.push({ text: msg.content || '' });

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

/**
 * Gemini 스트리밍 채팅
 * @param {Object} params
 * @param {Array} params.messages - Gemini 포맷 메시지 배열
 * @param {string} params.systemPrompt - 시스템 프롬프트
 * @param {string} params.model - 모델 ID
 * @param {Function} params.onText - 텍스트 청크 콜백
 * @param {Function} params.onDone - 완료 콜백
 * @param {Function} params.onError - 에러 콜백
 * @param {Object} params.options - { webSearch, codeExecution }
 */
export async function streamChat({ messages, systemPrompt, model, onText, onDone, onError, options = {} }) {
  try {
    const client = getClient();

    // 도구 설정
    const tools = [];
    if (options.webSearch) {
      tools.push({ googleSearch: {} });
    }
    if (options.codeExecution) {
      tools.push({ codeExecution: {} });
    }

    const modelConfig = {
      model: model || 'gemini-3-flash-preview',
    };

    if (systemPrompt) {
      modelConfig.systemInstruction = systemPrompt;
    }

    if (tools.length > 0) {
      modelConfig.tools = tools;
    }

    const generativeModel = client.getGenerativeModel(modelConfig);

    // 마지막 메시지를 분리 (sendMessageStream 용)
    const lastMessage = messages[messages.length - 1];
    const chatHistory = messages.slice(0, -1);

    const chat = generativeModel.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessageStream(lastMessage.parts);

    let fullContent = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullContent += text;
        onText(text);
      }
    }

    // 최종 응답에서 사용량 메타데이터 추출
    const response = await result.response;
    const usageMetadata = response.usageMetadata || {};
    const inputTokens = usageMetadata.promptTokenCount || 0;
    const outputTokens = usageMetadata.candidatesTokenCount || 0;

    // 검색 결과 및 코드 실행 결과 확인
    let searchResults = null;
    let codeResult = null;

    const candidate = response.candidates?.[0];
    if (candidate?.groundingMetadata) {
      searchResults = candidate.groundingMetadata;
    }

    // 코드 실행 결과가 있으면 텍스트에 추가
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.executableCode) {
          const codeBlock = `\n\`\`\`${part.executableCode.language || 'python'}\n${part.executableCode.code}\n\`\`\`\n`;
          if (!fullContent.includes(part.executableCode.code)) {
            fullContent += codeBlock;
            onText(codeBlock);
          }
        }
        if (part.codeExecutionResult) {
          codeResult = part.codeExecutionResult;
          const resultBlock = `\n**실행 결과:**\n\`\`\`\n${part.codeExecutionResult.output}\n\`\`\`\n`;
          if (!fullContent.includes(part.codeExecutionResult.output)) {
            fullContent += resultBlock;
            onText(resultBlock);
          }
        }
      }
    }

    onDone({
      fullContent,
      inputTokens,
      outputTokens,
      searchResults,
      codeResult,
    });
  } catch (error) {
    onError(error);
  }
}

/**
 * Gemini 이미지 생성
 * @param {Object} params
 * @param {string} params.prompt - 이미지 생성 프롬프트
 * @param {string} params.model - 모델 ID (기본: gemini-3.1-flash-image-preview)
 * @returns {{ imageData: string, mimeType: string }}
 */
export async function generateImage({ prompt, model }) {
  const client = getClient();
  const imageModel = client.getGenerativeModel({
    model: model || 'gemini-3.1-flash-image-preview',
  });

  const result = await imageModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['image', 'text'],
    },
  });

  const response = result.response;
  const candidate = response.candidates?.[0];

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return {
          imageData: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }

  throw new Error('이미지 생성에 실패했습니다. 응답에 이미지가 포함되지 않았습니다.');
}
