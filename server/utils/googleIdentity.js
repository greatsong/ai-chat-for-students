// Google ID 토큰(tokeninfo 응답) 검증 규칙

export const SCHOOL_DOMAIN = 'danggok.hs.kr';

/**
 * aud와 이메일 검증 여부를 확인한다.
 * GOOGLE_CLIENT_ID가 없으면 검증을 건너뛰지 않고 거부한다.
 * @param {object} payload - tokeninfo 응답
 * @param {string|undefined} expectedClientId
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function checkGoogleClaims(payload, expectedClientId) {
  if (!expectedClientId) {
    console.error('[security] GOOGLE_CLIENT_ID가 설정되지 않아 로그인을 거부합니다.');
    return { ok: false, status: 500, error: '로그인 설정 오류입니다. 관리자에게 문의해주세요.' };
  }
  if (payload.aud !== expectedClientId) {
    return { ok: false, status: 401, error: '유효하지 않은 토큰 대상(audience)입니다.' };
  }
  // tokeninfo는 문자열 'true'로 돌려준다
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    return { ok: false, status: 403, error: '이메일이 검증된 Google 계정만 사용할 수 있습니다.' };
  }
  return { ok: true };
}

/**
 * 학교 Workspace 계정인가. 메일 주소 끝만 보지 않고 hd(호스팅 도메인) 값도 확인한다.
 * 같은 주소로 만든 일반 Google 계정에는 hd가 없다.
 */
export function isSchoolAccount(payload) {
  const email = String(payload.email || '').toLowerCase();
  return email.endsWith(`@${SCHOOL_DOMAIN}`) && payload.hd === SCHOOL_DOMAIN;
}
