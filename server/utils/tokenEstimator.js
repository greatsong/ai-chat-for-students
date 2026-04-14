/**
 * 간단한 토큰 수 추정기
 * 정확한 토크나이저 대신 경험적 규칙 사용 (의존성 없음, 빠름)
 *
 * 추정 규칙:
 * - 영문: ~4자 = 1토큰 (GPT/Claude 평균)
 * - 한글: ~2자 = 1토큰 (CJK 문자는 토큰당 1-2자)
 * - base64 이미지/PDF: 별도 계산 (Claude: ~750토큰/이미지, OpenAI: 유사)
 */

// 프로바이더·모델별 컨텍스트 윈도우 (토큰)
// 출처:
//   Claude — https://platform.claude.com/docs/en/about-claude/models/overview
//   OpenAI — https://developers.openai.com/api/docs/models/gpt-5.4, https://openai.com/index/gpt-4-1/
//   Gemini — https://ai.google.dev/gemini-api/docs/long-context, https://thinkpeak.ai/gemini-3-context-window-size-1-2m-tokens/
//   Solar  — https://developer.puter.com/ai/upstage/solar-pro-3/
const CONTEXT_LIMITS = {
  claude: {
    default: 1_000_000, // 2026-03 GA: 모든 4.6 모델 1M
    'claude-sonnet-4-6': 1_000_000,
    'claude-haiku-4-5-20251001': 200_000,
    'claude-opus-4-6': 1_000_000,
  },
  openai: {
    default: 128_000,
    'gpt-5.4': 272_000, // 기본 272K (1M은 명시적 설정 필요)
    'gpt-4.1': 1_000_000,
    'gpt-4.1-mini': 1_000_000,
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
  },
  gemini: {
    default: 1_000_000,
    'gemini-3-flash-preview': 200_000, // Gemini 3 Flash: 200K
    'gemini-3-pro': 1_000_000, // Gemini 3 Pro: 1M~2M
    'gemini-2.5-flash': 1_000_000,
    'gemini-2.0-flash': 1_000_000,
  },
  solar: {
    default: 128_000, // Solar Pro 3: 128K (2026-01 출시)
    'solar-pro3': 128_000,
    'solar-pro': 32_000,
  },
};

// 출력용 예약 토큰 (max_tokens와 별개로, 입력 한도 계산 시 차감)
const OUTPUT_RESERVE = 16_384;

// 시스템 프롬프트 여유분
const SYSTEM_PROMPT_RESERVE = 2_000;

/**
 * 텍스트의 토큰 수를 추정
 * @param {string} text
 * @returns {number} 추정 토큰 수
 */
export function estimateTokens(text) {
  if (!text) return 0;

  let tokens = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    // CJK 문자 (한글, 한자, 일본어): 약 1.5토큰/자
    if (
      (code >= 0xac00 && code <= 0xd7af) || // 한글 음절
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 통합 한자
      (code >= 0x3040 && code <= 0x30ff) // 히라가나/가타카나
    ) {
      tokens += 1.5;
    } else {
      // 영문/숫자/기호: 약 0.25토큰/자
      tokens += 0.25;
    }
  }

  return Math.ceil(tokens);
}

/**
 * 메시지(파일 포함)의 토큰 수를 추정
 * @param {{ role: string, content: string, files?: string }} msg - DB 메시지 행
 * @returns {number} 추정 토큰 수
 */
export function estimateMessageTokens(msg) {
  let tokens = estimateTokens(msg.content || '');

  // 파일 첨부 토큰 추정
  if (msg.files) {
    let files = [];
    try {
      files = typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
    } catch {
      // 무시
    }

    for (const f of files) {
      if (f.type === 'image') {
        // 이미지: 해상도에 따라 다르지만 평균 ~1000 토큰
        tokens += 1000;
      } else if (f.type === 'pdf') {
        // PDF: base64 길이 기준 추정 (원본 바이트 * 0.5 토큰/바이트)
        const originalBytes = (f.data?.length || 0) * 0.75; // base64 → 원본 크기
        tokens += Math.ceil(originalBytes * 0.5);
      } else if (f.type === 'text') {
        tokens += estimateTokens(f.data || '');
      }
    }
  }

  // 메시지 오버헤드 (role, 구분자 등) ~4 토큰
  tokens += 4;

  return tokens;
}

/**
 * 프로바이더·모델의 입력 토큰 한도 반환
 * (컨텍스트 윈도우 - 출력 예약 - 시스템 프롬프트 여유)
 * @param {string} provider
 * @param {string} model
 * @returns {number} 입력 가능 최대 토큰 수
 */
export function getInputTokenLimit(provider, model) {
  const providerLimits = CONTEXT_LIMITS[provider] || CONTEXT_LIMITS.claude;
  const contextWindow = providerLimits[model] || providerLimits.default;
  return contextWindow - OUTPUT_RESERVE - SYSTEM_PROMPT_RESERVE;
}

/**
 * 히스토리를 토큰 한도 내에서 트리밍
 * 최신 메시지부터 역순으로 포함, 한도 초과 시 오래된 메시지 제거
 *
 * @param {Array} history - 시간순 메시지 배열
 * @param {string} provider
 * @param {string} model
 * @returns {{ trimmedHistory: Array, trimmedCount: number, totalEstimatedTokens: number }}
 */
export function trimHistoryByTokens(history, provider, model) {
  const inputLimit = getInputTokenLimit(provider, model);

  // 마지막 메시지(현재 사용자 입력)는 반드시 포함
  if (history.length === 0) {
    return { trimmedHistory: [], trimmedCount: 0, totalEstimatedTokens: 0 };
  }

  // 역순으로 토큰 누적하며 포함할 메시지 결정
  let totalTokens = 0;
  let includeFrom = history.length; // 포함 시작 인덱스

  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(history[i]);

    if (totalTokens + msgTokens > inputLimit) {
      // 이 메시지를 포함하면 한도 초과 → 여기서 멈춤
      // 단, 마지막 메시지(현재 입력)는 반드시 포함
      if (i === history.length - 1) {
        includeFrom = i;
        totalTokens += msgTokens;
      }
      break;
    }

    totalTokens += msgTokens;
    includeFrom = i;
  }

  let trimmedHistory = history.slice(includeFrom);

  // 트리밍 후 첫 메시지가 assistant이면 제거 (Gemini 등에서 에러 방지)
  // AI API는 대화가 user 메시지로 시작해야 함
  while (trimmedHistory.length > 1 && trimmedHistory[0].role === 'assistant') {
    trimmedHistory = trimmedHistory.slice(1);
  }

  const trimmedCount = history.length - trimmedHistory.length;

  return {
    trimmedHistory,
    trimmedCount,
    totalEstimatedTokens: totalTokens,
  };
}
