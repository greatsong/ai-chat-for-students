/**
 * 보안 테스트: 모델 허용목록 검증 로직
 *
 * chat.js의 모델 검증 알고리즘을 순수 함수로 추출하여 단위 테스트합니다.
 * - 허용목록에 있는 모델만 통과
 * - 허용목록이 비어있거나 미설정이면 모든 모델 통과
 * - model이 null/undefined면 통과 (provider 기본 모델 사용)
 */
import { describe, it, expect } from 'vitest';

/**
 * chat.js POST /api/chat 핸들러의 모델 검증 로직을 추출한 순수 함수
 * @param {string|null} model - 요청된 모델
 * @param {string} provider - AI 프로바이더 (claude, gemini 등)
 * @param {Object} enabledModels - 설정된 허용 모델 목록 { claude: ['model-a'], ... }
 * @returns {{ allowed: boolean, error?: string }}
 */
function validateModel(model, provider, enabledModels) {
  if (!model) return { allowed: true };

  const allowedModels = enabledModels?.[provider];
  if (Array.isArray(allowedModels) && allowedModels.length > 0 && !allowedModels.includes(model)) {
    return { allowed: false, error: `${model}은(는) 현재 허용되지 않은 모델입니다.` };
  }
  return { allowed: true };
}

describe('모델 허용목록 검증', () => {
  const enabledModels = {
    claude: ['claude-sonnet-4-6'],
    gemini: ['gemini-3-flash-preview'],
    openai: ['gpt-5.4'],
    solar: ['solar-pro'],
  };

  describe('허용된 모델 → 통과', () => {
    it('claude: claude-sonnet-4-6', () => {
      const result = validateModel('claude-sonnet-4-6', 'claude', enabledModels);
      expect(result.allowed).toBe(true);
    });

    it('gemini: gemini-3-flash-preview', () => {
      const result = validateModel('gemini-3-flash-preview', 'gemini', enabledModels);
      expect(result.allowed).toBe(true);
    });
  });

  describe('허용되지 않은 모델 → 차단', () => {
    it('claude에서 고비용 모델 시도', () => {
      const result = validateModel('claude-opus-4', 'claude', enabledModels);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('허용되지 않은');
    });

    it('gemini에서 미승인 모델 시도', () => {
      const result = validateModel('gemini-2.5-pro', 'gemini', enabledModels);
      expect(result.allowed).toBe(false);
    });

    it('openai에서 비활성 모델 시도', () => {
      const result = validateModel('gpt-4o', 'openai', enabledModels);
      expect(result.allowed).toBe(false);
    });
  });

  describe('model이 null/undefined → 통과 (provider 기본 모델)', () => {
    it('model이 null이면 통과', () => {
      const result = validateModel(null, 'claude', enabledModels);
      expect(result.allowed).toBe(true);
    });

    it('model이 undefined이면 통과', () => {
      const result = validateModel(undefined, 'claude', enabledModels);
      expect(result.allowed).toBe(true);
    });

    it('model이 빈 문자열이면 통과', () => {
      const result = validateModel('', 'claude', enabledModels);
      expect(result.allowed).toBe(true);
    });
  });

  describe('enabledModels 설정이 없거나 비어있으면 → 모든 모델 통과', () => {
    it('enabledModels가 null', () => {
      const result = validateModel('claude-opus-4', 'claude', null);
      expect(result.allowed).toBe(true);
    });

    it('enabledModels가 빈 객체', () => {
      const result = validateModel('claude-opus-4', 'claude', {});
      expect(result.allowed).toBe(true);
    });

    it('provider에 해당하는 모델 목록이 없으면 통과', () => {
      const result = validateModel('some-model', 'solar', { claude: ['claude-sonnet-4-6'] });
      expect(result.allowed).toBe(true);
    });

    it('provider 모델 목록이 빈 배열이면 통과', () => {
      const result = validateModel('any-model', 'claude', { claude: [] });
      expect(result.allowed).toBe(true);
    });
  });
});
