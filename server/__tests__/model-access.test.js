/**
 * 학생 제한 모델 게이트 테스트 (server/utils/modelAccess.js)
 *
 * - 교사·관리자는 제한 모델도 사용 가능
 * - 학생은 제한 모델 차단, premium_models = 1이면 허용
 * - 제한 목록이 비어 있으면 전원 허용
 */
import { describe, it, expect } from 'vitest';
import {
  canUsePremiumModels,
  getRestrictedModelsForUser,
  checkModelAccess,
  DEFAULT_STUDENT_RESTRICTED_MODELS,
} from '../utils/modelAccess.js';

const restricted = ['claude-opus-5'];
const student = { role: 'student', premium_models: 0 };
const premiumStudent = { role: 'student', premium_models: 1 };
const teacher = { role: 'teacher' };
const admin = { role: 'admin' };

describe('canUsePremiumModels', () => {
  it('교사·관리자는 항상 허용', () => {
    expect(canUsePremiumModels(teacher)).toBe(true);
    expect(canUsePremiumModels(admin)).toBe(true);
  });
  it('일반 학생은 불허, 개별 예외 학생은 허용', () => {
    expect(canUsePremiumModels(student)).toBe(false);
    expect(canUsePremiumModels(premiumStudent)).toBe(true);
    expect(canUsePremiumModels({ role: 'student', premium_models: true })).toBe(true);
  });
  it('role 누락 시 학생으로 간주', () => {
    expect(canUsePremiumModels({})).toBe(false);
    expect(canUsePremiumModels(null)).toBe(false);
  });
});

describe('getRestrictedModelsForUser', () => {
  it('학생에게는 제한 목록 그대로', () => {
    expect(getRestrictedModelsForUser(student, restricted)).toEqual(['claude-opus-5']);
  });
  it('교사·예외 학생에게는 빈 목록', () => {
    expect(getRestrictedModelsForUser(teacher, restricted)).toEqual([]);
    expect(getRestrictedModelsForUser(premiumStudent, restricted)).toEqual([]);
  });
  it('설정이 비어 있거나 잘못된 형식이면 빈 목록', () => {
    expect(getRestrictedModelsForUser(student, [])).toEqual([]);
    expect(getRestrictedModelsForUser(student, null)).toEqual([]);
    expect(getRestrictedModelsForUser(student, undefined)).toEqual([]);
    expect(getRestrictedModelsForUser(student, 'claude-opus-5')).toEqual([]);
  });
});

describe('checkModelAccess', () => {
  it('학생이 Opus 요청 → 차단 + 안내 메시지', () => {
    const r = checkModelAccess('claude-opus-5', student, restricted);
    expect(r.allowed).toBe(false);
    expect(r.error).toContain('교사 승인');
  });
  it('학생이 Sonnet 요청 → 통과', () => {
    expect(checkModelAccess('claude-sonnet-5', student, restricted).allowed).toBe(true);
  });
  it('교사가 Opus 요청 → 통과', () => {
    expect(checkModelAccess('claude-opus-5', teacher, restricted).allowed).toBe(true);
  });
  it('예외 학생이 Opus 요청 → 통과', () => {
    expect(checkModelAccess('claude-opus-5', premiumStudent, restricted).allowed).toBe(true);
  });
  it('제한 목록이 비어 있으면 학생도 Opus 통과 (전체 오픈 상황)', () => {
    expect(checkModelAccess('claude-opus-5', student, []).allowed).toBe(true);
  });
  it('model 미지정은 통과', () => {
    expect(checkModelAccess(undefined, student, restricted).allowed).toBe(true);
  });
  it('기본 제한 목록에 Opus 5가 포함된다', () => {
    expect(DEFAULT_STUDENT_RESTRICTED_MODELS).toContain('claude-opus-5');
  });
});
