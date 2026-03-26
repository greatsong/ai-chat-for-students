/**
 * 재시도 가능한 에러인지 확인
 * @param {Error} error
 * @returns {boolean}
 */
function isRetriable(error) {
  // HTTP 상태 코드 기반 판단
  const status = error.status || error.statusCode || error.httpStatus;
  if (status) {
    // 클라이언트 에러는 재시도 안 함 (429 제외)
    if (status >= 400 && status < 500 && status !== 429) return false;
    // 429, 500, 502, 503, 504는 재시도
    if ([429, 500, 502, 503, 504].includes(status)) return true;
  }

  // 네트워크 에러
  const networkCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN'];
  if (error.code && networkCodes.includes(error.code)) return true;

  // 에러 메시지에 rate limit 관련 문구가 있는 경우
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
  if (msg.includes('overloaded') || msg.includes('service unavailable')) return true;

  // 기본: 재시도하지 않음
  return false;
}

/**
 * 지수 백오프 재시도 래퍼
 * @param {Function} fn - 실행할 비동기 함수
 * @param {Object} options
 * @param {number} options.maxAttempts - 최대 시도 횟수 (기본 3)
 * @param {number} options.baseDelay - 기본 대기 시간 ms (기본 1000)
 * @param {number} options.maxDelay - 최대 대기 시간 ms (기본 10000)
 * @returns {Promise<*>}
 */
export async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetriable(error)) {
        throw error;
      }

      // 지수 백오프 + 약간의 지터
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      console.log(
        `[retry] 시도 ${attempt}/${maxAttempts} 실패, ${Math.round(delay + jitter)}ms 후 재시도:`,
        error.message || error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError;
}
