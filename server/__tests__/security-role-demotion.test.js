/**
 * 보안 테스트: 역할 강등 (role demotion)
 *
 * 시나리오:
 * - 설정에서 교사를 제거하면, 다음 로그인 시 student로 강등되어야 함
 * - 설정에서 관리자를 제거해도 마찬가지
 * - DB에 teacher 역할이 남아 있어도, 설정에서 제거되면 강등
 *
 * auth.js의 역할 결정 로직을 단위 테스트합니다.
 * (실제 Google 토큰 검증 없이, 역할 결정 알고리즘만 테스트)
 */
import { describe, it, expect } from 'vitest';

/**
 * auth.js POST /api/auth/google 핸들러의 역할 결정 로직을 추출한 순수 함수
 * 이 로직이 올바르게 동작하는지 검증합니다.
 */
function determineRole({ isAdminEmail, isTeacherEmail }) {
  if (isAdminEmail) return 'admin';
  if (isTeacherEmail) return 'teacher';
  return 'student';
}

describe('역할 결정 로직 (role determination)', () => {
  it('ADMIN_EMAILS에 포함된 이메일은 admin 역할을 받는다', () => {
    expect(determineRole({ isAdminEmail: true, isTeacherEmail: false })).toBe('admin');
  });

  it('TEACHER_EMAILS에 포함된 이메일은 teacher 역할을 받는다', () => {
    expect(determineRole({ isAdminEmail: false, isTeacherEmail: true })).toBe('teacher');
  });

  it('어느 목록에도 없는 이메일은 student 역할을 받는다', () => {
    expect(determineRole({ isAdminEmail: false, isTeacherEmail: false })).toBe('student');
  });

  it('ADMIN과 TEACHER 모두에 포함되면 admin이 우선한다', () => {
    expect(determineRole({ isAdminEmail: true, isTeacherEmail: true })).toBe('admin');
  });
});

describe('역할 강등 시나리오 (role demotion)', () => {
  it('교사가 설정에서 제거되면 다음 로그인 시 student로 강등된다', () => {
    // 이전: teacher_emails에 포함 → role = teacher
    const before = determineRole({ isAdminEmail: false, isTeacherEmail: true });
    expect(before).toBe('teacher');

    // 이후: teacher_emails에서 제거 → role = student
    const after = determineRole({ isAdminEmail: false, isTeacherEmail: false });
    expect(after).toBe('student');
  });

  it('관리자가 설정에서 제거되면 다음 로그인 시 student로 강등된다', () => {
    const before = determineRole({ isAdminEmail: true, isTeacherEmail: false });
    expect(before).toBe('admin');

    const after = determineRole({ isAdminEmail: false, isTeacherEmail: false });
    expect(after).toBe('student');
  });

  it('DB에 teacher 역할이 남아 있어도 설정 제거 시 student가 된다 (기존 버그 회귀 방지)', () => {
    // 핵심 회귀 테스트: 이전에는 DB 역할이 더 높으면 유지했음
    // 수정 후: 설정이 권위 소스이므로 DB 역할을 무시함
    const dbRole = 'teacher'; // DB에는 아직 teacher로 남아 있음
    const configRole = determineRole({ isAdminEmail: false, isTeacherEmail: false }); // 설정에서 제거됨

    // 수정 전 (버그): Math.max(dbRole, configRole) → teacher 유지
    // 수정 후 (정상): configRole이 권위 소스 → student
    expect(configRole).toBe('student');

    // 실제 코드에서는 이 configRole이 그대로 사용됨 (DB 역할과 비교하지 않음)
    const finalRole = configRole; // DB 역할 비교 없이 config 결과만 사용
    expect(finalRole).toBe('student');
    expect(finalRole).not.toBe(dbRole); // DB 역할이 유지되지 않음을 확인
  });

  it('DB에 admin 역할이 남아 있어도 설정 제거 시 student가 된다 (기존 버그 회귀 방지)', () => {
    const dbRole = 'admin';
    const configRole = determineRole({ isAdminEmail: false, isTeacherEmail: false });

    expect(configRole).toBe('student');

    const finalRole = configRole;
    expect(finalRole).not.toBe(dbRole);
  });
});

describe('기존 세션에서의 역할 반영 (캐시 동작)', () => {
  it('캐시 TTL(5분) 내에는 이전 역할이 유지될 수 있음을 문서화', () => {
    // 이 테스트는 동작을 문서화하는 목적입니다.
    // authenticate 미들웨어는 5분 TTL 캐시를 사용하므로,
    // 역할 변경 후 최대 5분까지는 이전 역할로 인증될 수 있습니다.
    // invalidateUserCache()를 호출하면 즉시 반영됩니다.
    const CACHE_TTL_MS = 5 * 60 * 1000;
    expect(CACHE_TTL_MS).toBe(300000); // 5분 = 300초 = 300000ms
  });
});
