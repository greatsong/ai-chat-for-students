/**
 * 대화 요약 모듈
 * 트리밍으로 버려지는 메시지를 AI로 요약하여 컨텍스트 유지
 */

import * as claude from '../providers/claude.js';
import * as gemini from '../providers/gemini.js';
import * as openai from '../providers/openai.js';
import * as solar from '../providers/solar.js';

const providers = { claude, gemini, openai, solar };

// 요약에 사용할 경량 모델 (빠르고 저렴)
const SUMMARY_MODELS = {
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  solar: 'solar-pro3',
};

const SUMMARY_PROMPT = `당신은 대화 요약 전문가입니다.
아래 대화 내용을 핵심만 3~5문장으로 요약해주세요.
- 사용자가 물어본 주요 질문과 AI의 핵심 답변을 포함
- 파일 첨부나 코드가 있었다면 간략히 언급
- 대화의 맥락과 흐름이 유지되도록 요약
- 한국어로 작성`;

/**
 * 메시지 배열을 요약용 텍스트로 변환
 * @param {Array} messages - DB 메시지 행 배열
 * @returns {string} 요약할 대화 텍스트
 */
function messagesToText(messages) {
  return messages
    .map((msg) => {
      const role = msg.role === 'user' ? '사용자' : 'AI';
      let content = msg.content || '';

      // 파일 첨부는 이름만 표시
      if (msg.files) {
        let files = [];
        try {
          files = typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
        } catch {
          // 무시
        }
        if (files.length > 0) {
          const fileNames = files.map((f) => f.name || f.type).join(', ');
          content = `[첨부: ${fileNames}] ${content}`;
        }
      }

      // 너무 긴 메시지는 잘라서 요약 토큰 절약
      if (content.length > 500) {
        content = content.slice(0, 500) + '...';
      }

      return `${role}: ${content}`;
    })
    .join('\n');
}

/**
 * 버려지는 메시지들을 AI로 요약
 * @param {Array} droppedMessages - 트리밍으로 버려진 메시지 배열
 * @param {string} provider - 현재 프로바이더 (claude, openai, gemini, solar)
 * @returns {Promise<string|null>} 요약 텍스트 또는 실패 시 null
 */
export async function summarizeMessages(droppedMessages, provider) {
  if (!droppedMessages || droppedMessages.length === 0) return null;

  const providerModule = providers[provider];
  if (!providerModule) return null;

  const summaryModel = SUMMARY_MODELS[provider];
  const conversationText = messagesToText(droppedMessages);

  // 요약할 내용이 너무 짧으면 스킵
  if (conversationText.length < 100) return null;

  try {
    const userMessage = `다음 대화 내용을 요약해주세요:\n\n${conversationText}`;

    // 프로바이더별 메시지 포맷 구성
    let messages;
    if (provider === 'gemini') {
      messages = [{ role: 'user', parts: [{ text: userMessage }] }];
    } else {
      messages = [{ role: 'user', content: userMessage }];
    }

    // 비스트리밍으로 요약 생성
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('요약 생성 타임아웃')), 15000);

      providerModule.streamChat({
        messages,
        systemPrompt: SUMMARY_PROMPT,
        model: summaryModel,
        onText: () => {}, // 스트리밍 텍스트는 무시
        onDone: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    const summary = result.fullContent?.trim();
    if (!summary) return null;

    console.log(
      `[summarizer] ${provider}/${summaryModel} 요약 생성 완료 (${droppedMessages.length}개 메시지 → ${summary.length}자, ${result.inputTokens}+${result.outputTokens} 토큰)`,
    );

    return summary;
  } catch (error) {
    console.warn(`[summarizer] 요약 생성 실패 (${provider}): ${error.message}`);
    return null;
  }
}
