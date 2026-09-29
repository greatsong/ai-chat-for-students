import { describe, it, expect, vi, beforeEach } from 'vitest';

// Anthropic SDK를 가짜 스트림으로 바꿔 streamChat이 보내는 요청 파라미터를 검사한다.
// 신모델 ID가 구형 ID로 시작해(claude-sonnet-5-5 ⊃ claude-sonnet-5) 잘못된 thinking 설정이
// 붙는 회귀를 막는다 — 그 조합은 실제 API에서 400이 난다.
const state = vi.hoisted(() => ({ calls: [], message: null, texts: [] }));

function fakeStream() {
  const handlers = {};
  return {
    on(event, fn) {
      handlers[event] = fn;
      return this;
    },
    abort() {},
    async finalMessage() {
      for (const t of state.texts) handlers.text?.(t);
      handlers.finalMessage?.(state.message);
      return state.message;
    },
  };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params) => {
        state.calls.push({ api: 'messages', params });
        return fakeStream();
      },
    };
    beta = {
      messages: {
        stream: (params) => {
          state.calls.push({ api: 'beta', params });
          return fakeStream();
        },
      },
    };
  },
}));

vi.mock('../utils/apiKeys.js', () => ({ getApiKey: async () => 'test-key' }));

const { streamChat } = await import('../providers/claude.js');

async function run(model) {
  let result = null;
  let error = null;
  await streamChat({
    messages: [{ role: 'user', content: '안녕' }],
    systemPrompt: '',
    model,
    onText: () => {},
    onDone: (r) => {
      result = r;
    },
    onError: (e) => {
      error = e;
    },
  });
  return { result, error, call: state.calls.at(-1) };
}

beforeEach(() => {
  state.calls.length = 0;
  state.texts = ['답변'];
  state.message = {
    model: 'claude-sonnet-5-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '답변' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('claude streamChat 요청 파라미터', () => {
  it.each(['claude-sonnet-5-5', 'claude-opus-5-5'])(
    '%s: thinking 끔 대신 effort low + 서버측 거절 폴백(beta)',
    async (model) => {
      const { call, error } = await run(model);
      expect(error).toBeNull();
      expect(call.api).toBe('beta');
      expect(call.params.model).toBe(model);
      expect(call.params.thinking).toBeUndefined();
      expect(call.params.output_config).toEqual({ effort: 'low' });
      expect(call.params.fallbacks).toBe('default');
      expect(call.params.betas).toEqual(['server-side-fallback-2026-07-01']);
    },
  );

  it('모델 미지정이면 기본 Sonnet 5.5 설정을 그대로 적용', async () => {
    const { call } = await run(undefined);
    expect(call.params.model).toBe('claude-sonnet-5-5');
    expect(call.params.output_config).toEqual({ effort: 'low' });
    expect(call.params.thinking).toBeUndefined();
  });

  it.each(['claude-sonnet-5', 'claude-opus-5'])(
    '구형 %s: 기존대로 thinking disabled, 폴백 없이 일반 엔드포인트',
    async (model) => {
      const { call } = await run(model);
      expect(call.api).toBe('messages');
      expect(call.params.thinking).toEqual({ type: 'disabled' });
      expect(call.params.output_config).toBeUndefined();
      expect(call.params.fallbacks).toBeUndefined();
    },
  );

  it('폴백까지 거절(refusal)되면 부분 응답 뒤에 안내 문구를 붙인다', async () => {
    state.texts = ['부분 응답'];
    state.message = {
      ...state.message,
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'bio' },
    };
    const { result } = await run('claude-sonnet-5-5');
    expect(result.fullContent.startsWith('부분 응답\n\n')).toBe(true);
    expect(result.fullContent).toContain('안전 정책');
  });

  it('출력 전에 거절되면 안내 문구만 남는다', async () => {
    state.texts = [];
    state.message = { ...state.message, stop_reason: 'refusal', content: [] };
    const { result } = await run('claude-opus-5-5');
    expect(result.fullContent.startsWith('이 질문에는 안전 정책')).toBe(true);
  });
});
