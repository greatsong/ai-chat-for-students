import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// getSetting을 mock 처리 — DB 의존성 제거
vi.mock('../db/database.js', () => ({
  getSetting: vi.fn(),
}));

import { isCodeExecutionEnabled, isKillSwitchOn } from '../utils/codeExecutionGate.js';
import { getSetting } from '../db/database.js';

describe('codeExecutionGate', () => {
  const originalEnv = process.env.CODE_EXECUTION_KILL_SWITCH;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CODE_EXECUTION_KILL_SWITCH;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CODE_EXECUTION_KILL_SWITCH;
    else process.env.CODE_EXECUTION_KILL_SWITCH = originalEnv;
  });

  describe('isKillSwitchOn', () => {
    it('환경변수가 없으면 false', () => {
      expect(isKillSwitchOn()).toBe(false);
    });

    it('"1"이면 true', () => {
      process.env.CODE_EXECUTION_KILL_SWITCH = '1';
      expect(isKillSwitchOn()).toBe(true);
    });

    it('"true"/"on" (대소문자 무관) 모두 true', () => {
      process.env.CODE_EXECUTION_KILL_SWITCH = 'true';
      expect(isKillSwitchOn()).toBe(true);
      process.env.CODE_EXECUTION_KILL_SWITCH = 'ON';
      expect(isKillSwitchOn()).toBe(true);
      process.env.CODE_EXECUTION_KILL_SWITCH = 'True';
      expect(isKillSwitchOn()).toBe(true);
    });

    it('"0"/"false"/임의 문자열은 false', () => {
      process.env.CODE_EXECUTION_KILL_SWITCH = '0';
      expect(isKillSwitchOn()).toBe(false);
      process.env.CODE_EXECUTION_KILL_SWITCH = 'false';
      expect(isKillSwitchOn()).toBe(false);
      process.env.CODE_EXECUTION_KILL_SWITCH = 'maybe';
      expect(isKillSwitchOn()).toBe(false);
    });
  });

  describe('isCodeExecutionEnabled', () => {
    it('킬 스위치가 켜져 있으면 다른 모든 설정 무시하고 false', async () => {
      process.env.CODE_EXECUTION_KILL_SWITCH = '1';
      // DB가 모두 true라 해도
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_claude') return Promise.resolve(true);
        if (key === 'code_execution_max_role') return Promise.resolve('student');
        return Promise.resolve(null);
      });
      const result = await isCodeExecutionEnabled('claude', { role: 'admin' });
      expect(result).toBe(false);
      // 킬 스위치가 먼저 차단해서 DB 조회 자체가 없어야 함
      expect(getSetting).not.toHaveBeenCalled();
    });

    it('프로바이더 토글이 false면 차단', async () => {
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_claude') return Promise.resolve(false);
        return Promise.resolve('student');
      });
      expect(await isCodeExecutionEnabled('claude', { role: 'teacher' })).toBe(false);
    });

    it('프로바이더 토글이 누락(null)되면 차단 (안전 기본값)', async () => {
      getSetting.mockResolvedValue(null);
      expect(await isCodeExecutionEnabled('claude', { role: 'admin' })).toBe(false);
    });

    it('max_role=teacher (기본) — 학생은 차단, 교사·관리자는 허용', async () => {
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_openai') return Promise.resolve(true);
        if (key === 'code_execution_max_role') return Promise.resolve('teacher');
        return Promise.resolve(null);
      });
      expect(await isCodeExecutionEnabled('openai', { role: 'student' })).toBe(false);
      expect(await isCodeExecutionEnabled('openai', { role: 'teacher' })).toBe(true);
      expect(await isCodeExecutionEnabled('openai', { role: 'admin' })).toBe(true);
    });

    it('max_role=student — 학생도 허용', async () => {
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_claude') return Promise.resolve(true);
        if (key === 'code_execution_max_role') return Promise.resolve('student');
        return Promise.resolve(null);
      });
      expect(await isCodeExecutionEnabled('claude', { role: 'student' })).toBe(true);
    });

    it('max_role이 누락되면 안전 기본값 teacher로 동작', async () => {
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_claude') return Promise.resolve(true);
        if (key === 'code_execution_max_role') return Promise.resolve(null);
        return Promise.resolve(null);
      });
      expect(await isCodeExecutionEnabled('claude', { role: 'student' })).toBe(false);
      expect(await isCodeExecutionEnabled('claude', { role: 'teacher' })).toBe(true);
    });

    it('user가 undefined여도 안전하게 student로 처리', async () => {
      getSetting.mockImplementation((key) => {
        if (key === 'code_execution_claude') return Promise.resolve(true);
        if (key === 'code_execution_max_role') return Promise.resolve('teacher');
        return Promise.resolve(null);
      });
      expect(await isCodeExecutionEnabled('claude', undefined)).toBe(false);
      expect(await isCodeExecutionEnabled('claude', {})).toBe(false);
    });
  });
});
