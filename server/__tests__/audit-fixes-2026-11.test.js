// 2026-11-10 시스템 점검에서 찾은 오류의 회귀 테스트.
// - 사용량 날짜가 한국 시간 자정에 바뀌는가
// - 교사가 뺀 Gemini 모델이 재기동 때 다시 켜지지 않는가
// - Gemini에 빈 text 파트를 보내지 않는가
// - Gemini 생각 토큰이 출력 토큰에 들어가는가
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { kstDate, kstDateDaysAgo } from '../utils/date.js';

describe('kstDate (한국 시간 날짜)', () => {
  it('UTC 23:30은 한국 시간으로 다음 날 08:30이다', () => {
    expect(kstDate(new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-10');
  });

  it('한국 시간 자정(UTC 15:00)에 날짜가 바뀐다', () => {
    expect(kstDate(new Date('2026-11-10T14:59:59Z'))).toBe('2026-11-10');
    expect(kstDate(new Date('2026-11-10T15:00:00Z'))).toBe('2026-11-11');
  });

  it('n일 전 날짜도 한국 시간 기준이다', () => {
    expect(kstDateDaysAgo(7, new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-03');
    expect(kstDateDaysAgo(30, new Date('2026-12-01T00:00:00Z'))).toBe('2026-11-01');
  });
});

describe('Gemini 모델 활성화 마이그레이션 (1회성)', () => {
  let dir;
  let url;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-2026-11-'));
    url = `file:${path.join(dir, 'test.db')}`;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function boot() {
    process.env.TURSO_DATABASE_URL = url;
    process.env.TURSO_AUTH_TOKEN = '';
    const { initDatabase } = await import('../db/database.js');
    return initDatabase();
  }

  it('교사가 뺀 gemini-3.8-flash·gemini-3.1-pro-preview가 재기동 후에도 빠진 채로 남는다', async () => {
    const first = await boot();
    const set = (value) =>
      first.execute({
        sql: "UPDATE settings SET value = ? WHERE key = 'enabled_models'",
        args: [JSON.stringify(value)],
      });
    await set({
      claude: ['claude-sonnet-5-5'],
      gemini: ['gemini-4-argon'],
      openai: ['gpt-6.1-sol'],
      solar: ['solar-pro4'],
    });
    first.close();

    vi.resetModules();
    const second = await boot();
    const row = await second.execute("SELECT value FROM settings WHERE key = 'enabled_models'");
    const models = JSON.parse(row.rows[0].value);
    expect(models.gemini).toEqual(['gemini-4-argon']);
    second.close();
  });
});

describe('Gemini buildMessages', () => {
  it('파일만 보낸 메시지에 빈 text 파트를 넣지 않는다', async () => {
    const { buildMessages } = await import('../providers/gemini.js');
    const [msg] = buildMessages([
      {
        role: 'user',
        content: '',
        files: JSON.stringify([{ type: 'image', mimeType: 'image/png', data: 'AAAA' }]),
      },
    ]);
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0].inlineData).toBeDefined();
  });

  it('빈 답변은 공백 한 칸으로 보낸다', async () => {
    const { buildMessages } = await import('../providers/gemini.js');
    const [msg] = buildMessages([{ role: 'assistant', content: '' }]);
    expect(msg.parts).toEqual([{ text: ' ' }]);
  });
});

describe('Gemini 사용량 집계', () => {
  it('생각(thinking) 토큰을 출력 토큰에 더한다', async () => {
    vi.resetModules();
    vi.doMock('../utils/apiKeys.js', () => ({ getApiKey: async () => 'test-key' }));
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            startChat: () => ({
              sendMessageStream: async () => ({
                stream: (async function* () {
                  yield { text: () => '안녕' };
                })(),
                response: Promise.resolve({
                  usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    thoughtsTokenCount: 40,
                  },
                  candidates: [],
                }),
              }),
            }),
          };
        }
      },
    }));
    const gemini = await import('../providers/gemini.js');
    const done = await new Promise((resolve, reject) => {
      gemini.streamChat({
        messages: [{ role: 'user', parts: [{ text: '질문' }] }],
        onText: () => {},
        onDone: resolve,
        onError: reject,
      });
    });
    expect(done.inputTokens).toBe(10);
    expect(done.outputTokens).toBe(45);
    vi.doUnmock('../utils/apiKeys.js');
    vi.doUnmock('@google/generative-ai');
  });
});
