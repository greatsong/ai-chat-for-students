/**
 * 학생 제한 모델 게이트
 *
 * enabled_models(전역 허용목록)를 통과한 모델이라도, student_restricted_models에 든 모델은
 * 학생에게 차단한다. 교사·관리자는 항상 사용 가능하고, 학생은 users.premium_models = 1로
 * 개별 예외를 받은 경우에만 사용 가능하다.
 *
 * 상황에 따라 전체 학생에게 열어야 할 때는 설정 페이지에서 해당 모델의 잠금을 해제하면 된다.
 */

export const DEFAULT_STUDENT_RESTRICTED_MODELS = ['claude-opus-5'];

/**
 * 이 사용자가 제한 모델을 사용할 수 있는가 (역할 또는 개별 예외)
 * @param {{ role?: string, premium_models?: number|boolean }} user
 */
export function canUsePremiumModels(user) {
  const role = user?.role || 'student';
  if (role === 'teacher' || role === 'admin') return true;
  return user?.premium_models === 1 || user?.premium_models === true;
}

/**
 * 이 사용자에게 실제로 차단되는 모델 ID 목록
 * @param {object} user
 * @param {string[]|null|undefined} restrictedModels - student_restricted_models 설정값
 * @returns {string[]}
 */
export function getRestrictedModelsForUser(user, restrictedModels) {
  if (!Array.isArray(restrictedModels) || restrictedModels.length === 0) return [];
  if (canUsePremiumModels(user)) return [];
  return restrictedModels;
}

/**
 * 모델 사용 가능 여부 판정 (chat.js 라우트에서 사용)
 * @returns {{ allowed: boolean, error?: string }}
 */
export function checkModelAccess(model, user, restrictedModels) {
  if (!model) return { allowed: true };
  const blocked = getRestrictedModelsForUser(user, restrictedModels);
  if (blocked.includes(model)) {
    return {
      allowed: false,
      error: `${model}은(는) 교사 승인이 필요한 모델입니다. 다른 모델을 선택해주세요.`,
    };
  }
  return { allowed: true };
}
