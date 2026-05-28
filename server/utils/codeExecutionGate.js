import { getSetting } from '../db/database.js';

/**
 * 코드 실행 도구 활성화 결정 — 3중 게이트
 *
 *   1. KILL SWITCH (환경변수)       — 1순위, 즉시 전체 차단
 *      CODE_EXECUTION_KILL_SWITCH=1 이면 무조건 비활성
 *   2. PROVIDER 토글 (DB settings)  — 프로바이더별 ON/OFF
 *   3. ROLE 게이트 (DB settings)    — 'teacher'면 교사·관리자만, 'student'면 전체
 *
 * 세 조건 모두 통과해야 활성화. 하나라도 실패하면 false.
 *
 * @param {string} provider - 'claude' | 'openai' | 'gemini' | 'solar'
 * @param {{ role?: string }} user - 인증 사용자 (role: 'student'|'teacher'|'admin')
 * @returns {Promise<boolean>}
 */
export async function isCodeExecutionEnabled(provider, user) {
  // 1. 킬 스위치 — 환경변수에 truthy 값이면 즉시 차단
  if (isKillSwitchOn()) return false;

  // 2. 프로바이더 토글
  const settingKey = `code_execution_${provider}`;
  const providerEnabled = await getSetting(settingKey);
  if (providerEnabled !== true) return false;

  // 3. role 게이트
  const maxRole = (await getSetting('code_execution_max_role')) || 'teacher';
  const userRole = user?.role || 'student';

  if (maxRole === 'student') return true; // 모든 사용자 허용
  // 'teacher' (기본) — teacher/admin만 허용
  return userRole === 'teacher' || userRole === 'admin';
}

/**
 * 킬 스위치 상태 확인 (환경변수 단독 판정)
 * 테스트·로깅용 분리
 */
export function isKillSwitchOn() {
  const v = process.env.CODE_EXECUTION_KILL_SWITCH;
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on';
}
