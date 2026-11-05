const isProduction = process.env.NODE_ENV === 'production';

/**
 * 구조화된 로거
 * 프로덕션에서는 debug 로그를 숨기고, 민감한 데이터 로깅을 방지
 */
export const logger = {
  info: (msg, meta) => {
    console.log(JSON.stringify({ level: 'info', msg, ...meta, ts: new Date().toISOString() }));
  },
  warn: (msg, meta) => {
    console.warn(JSON.stringify({ level: 'warn', msg, ...meta, ts: new Date().toISOString() }));
  },
  error: (msg, meta) => {
    console.error(JSON.stringify({ level: 'error', msg, ...meta, ts: new Date().toISOString() }));
  },
  debug: (msg, meta) => {
    if (!isProduction) {
      console.log(JSON.stringify({ level: 'debug', msg, ...meta, ts: new Date().toISOString() }));
    }
  },
};

/**
 * 사용자에게 보낼 오류 문구. 프로덕션에서는 제공사 오류 원문을 내보내지 않는다.
 * 제공사 오류에는 키 일부나 내부 식별자가 들어 있을 수 있다.
 */
export function publicErrorMessage(error, fallback) {
  return isProduction ? fallback : error?.message || fallback;
}

/**
 * 관리자 작업 감사 로그
 * API 키 변경, 교사 역할 부여, 대화 삭제 등 민감한 작업을 기록
 */
export function auditLog(action, userId, details = {}) {
  console.log(
    JSON.stringify({
      level: 'audit',
      action,
      userId,
      ...details,
      ts: new Date().toISOString(),
    }),
  );
}
