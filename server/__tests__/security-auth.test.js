/**
 * 보안 테스트: 인증/권한 미들웨어
 * - requireActive: 비활성 학생 차단, 교사/관리자 통과
 * - requireTeacher: 교사/관리자만 통과
 * - requireAdmin: 관리자만 통과
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// auth.js는 import 시점에 JWT_SECRET을 체크하므로 동적 import 전에 설정
process.env.JWT_SECRET = 'test-secret-for-unit-tests';

let requireActive, requireTeacher, requireAdmin;

beforeAll(async () => {
  const mod = await import('../middleware/auth.js');
  requireActive = mod.requireActive;
  requireTeacher = mod.requireTeacher;
  requireAdmin = mod.requireAdmin;
});

// Express req/res/next mock
function mockReqResNext(user) {
  const req = { user };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

// ── requireActive ──

describe('requireActive 미들웨어', () => {
  it('비활성 학생(is_active=0)은 403으로 차단된다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'student-1',
      role: 'student',
      is_active: 0,
    });

    requireActive(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('승인');
    expect(next).not.toHaveBeenCalled();
  });

  it('활성 학생(is_active=1)은 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'student-2',
      role: 'student',
      is_active: 1,
    });

    requireActive(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
  });

  it('교사는 is_active 값과 무관하게 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'teacher-1',
      role: 'teacher',
      is_active: 0,
    });

    requireActive(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
  });

  it('관리자는 is_active 값과 무관하게 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'admin-1',
      role: 'admin',
      is_active: 0,
    });

    requireActive(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
  });
});

// ── requireTeacher ──

describe('requireTeacher 미들웨어', () => {
  it('학생은 403으로 차단된다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'student-1',
      role: 'student',
      is_active: 1,
    });

    requireTeacher(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('교사는 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'teacher-1',
      role: 'teacher',
      is_active: 1,
    });

    requireTeacher(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('관리자는 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'admin-1',
      role: 'admin',
      is_active: 1,
    });

    requireTeacher(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ── requireAdmin ──

describe('requireAdmin 미들웨어', () => {
  it('학생은 403으로 차단된다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'student-1',
      role: 'student',
    });

    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('교사는 403으로 차단된다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'teacher-1',
      role: 'teacher',
    });

    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('관리자만 통과한다', () => {
    const { req, res, next } = mockReqResNext({
      id: 'admin-1',
      role: 'admin',
    });

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
