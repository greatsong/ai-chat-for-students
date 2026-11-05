// 2026-11 모델 교체 마이그레이션을 실제 initDatabase()로 검증한다(임시 파일 DB).
// - 프로덕션과 같은 구형 설정이 후속 모델로 같은 자리에서 바뀌는가
// - Gemini 4 Argon이 한 번만 추가·잠금되고, 교사가 뺀 뒤 재기동해도 다시 들어오지 않는가
// - 지원 종료된 구형 모델을 다시 넣던 활성화 마이그레이션이 사라졌는가
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient } from '@libsql/client';

let dir;
let url;

async function seedSettings(settings) {
  const db = createClient({ url });
  await db.execute(
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '{}')`,
  );
  for (const [key, value] of Object.entries(settings)) {
    await db.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
  }
  db.close();
}

async function boot() {
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = '';
  const { initDatabase } = await import('../db/database.js');
  const client = await initDatabase();
  const read = async (key) => {
    const r = await client.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: [key],
    });
    return r.rows[0] ? JSON.parse(r.rows[0].value) : null;
  };
  return { client, read };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-2026-11-'));
  url = `file:${path.join(dir, 'test.db')}`;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('2026-11 모델 교체 마이그레이션', () => {
  it('프로덕션 구형 설정을 후속 모델로 바꾸고 Argon을 학생 잠금으로 추가한다', async () => {
    await seedSettings({
      enabled_models: {
        claude: ['claude-sonnet-5-5', 'claude-opus-5-5'],
        gemini: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview'],
        openai: ['gpt-6.1-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
        solar: ['solar-pro4', 'solar-open2'],
      },
      student_restricted_models: ['claude-opus-5-5'],
    });

    const { client, read } = await boot();
    const models = await read('enabled_models');
    expect(models.gemini).toEqual(['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-pro-preview']);
    expect(models.openai).toEqual(['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna']);
    expect(models.solar).toEqual(['solar-pro4', 'solar-mini4']);
    expect(models.claude).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(await read('student_restricted_models')).toEqual(['claude-opus-5-5', 'gemini-4-argon']);
    expect(await read('gemini_argon_added')).toBe(true);
    client.close();
  });

  it('교사가 Argon을 빼고 잠금을 풀면 재기동 후에도 유지된다', async () => {
    await seedSettings({
      enabled_models: {
        gemini: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
        solar: ['solar-pro4'],
      },
      student_restricted_models: [],
      gemini_argon_added: true,
    });

    const { client, read } = await boot();
    const models = await read('enabled_models');
    expect(models.gemini).toEqual(['gemini-3.8-flash', 'gemini-3.1-pro-preview']);
    // 예전 'Solar Open2 활성화'·'Gemini 3.7 Flash 활성화'가 구형을 다시 넣지 않는다
    expect(models.solar).toEqual(['solar-pro4']);
    expect(await read('student_restricted_models')).toEqual([]);
    client.close();
  });
});
