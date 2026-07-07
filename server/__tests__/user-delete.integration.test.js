// 사용자 완전 삭제 시 cascade 삭제와 다른 사용자 데이터 격리를 실제 libSQL(in-memory)로 검증한다.
// teacher.js 의 DELETE /students/:id 와 동일한 삭제 순서(SQL)를 그대로 재현한다.
// - 대상 사용자의 대화/메시지/공유토큰/사용량/계정이 모두 사라지는가
// - 다른 사용자의 데이터는 절대 건드리지 않는가 (격리)
// - 대화가 없는 사용자도 에러 없이 삭제되는가
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';

let db;

// teacher.js DELETE /students/:id 와 동일한 원자적 cascade 삭제 (batch 트랜잭션)
async function deleteUserCascade(userId) {
  await db.batch(
    [
      {
        sql: 'DELETE FROM share_tokens WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)',
        args: [userId],
      },
      {
        sql: 'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)',
        args: [userId],
      },
      { sql: 'DELETE FROM conversations WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM usage_daily WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
    ],
    'write',
  );
}

beforeEach(async () => {
  db = createClient({ url: ':memory:' });
  await db.execute(
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT DEFAULT 'student', daily_limit INTEGER, is_active INTEGER)`,
  );
  await db.execute(
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT)`,
  );
  await db.execute(
    `CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT, content TEXT)`,
  );
  await db.execute(
    `CREATE TABLE usage_daily (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT, provider TEXT, input_tokens INTEGER)`,
  );
  await db.execute(
    `CREATE TABLE share_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL, created_by TEXT, expires_at TEXT)`,
  );
});

async function seedUser(userId, { convIds = [], usageProviders = [] } = {}) {
  await db.execute({
    sql: `INSERT INTO users (id, email, name, role, daily_limit, is_active) VALUES (?, ?, ?, 'student', 100000, 1)`,
    args: [userId, `${userId}@t.kr`, userId],
  });
  for (const convId of convIds) {
    await db.execute({
      sql: `INSERT INTO conversations (id, user_id, title) VALUES (?, ?, 'c')`,
      args: [convId, userId],
    });
    await db.execute({
      sql: `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', 'hi')`,
      args: [`${convId}-m1`, convId],
    });
    await db.execute({
      sql: `INSERT INTO share_tokens (id, token_hash, conversation_id, created_by, expires_at) VALUES (?, ?, ?, ?, '2099-01-01')`,
      args: [`${convId}-tok`, `${convId}-hash`, convId, userId],
    });
  }
  for (const p of usageProviders) {
    await db.execute({
      sql: `INSERT INTO usage_daily (id, user_id, date, provider, input_tokens) VALUES (?, ?, '2026-07-08', ?, 100)`,
      args: [`${userId}-${p}`, userId, p],
    });
  }
}

const rowCount = async (sql, args = []) => {
  const r = await db.execute({ sql, args });
  return r.rows.length;
};

describe('사용자 완전 삭제 cascade', () => {
  it('대상 사용자의 대화·메시지·공유토큰·사용량·계정이 모두 삭제된다', async () => {
    await seedUser('u1', { convIds: ['c1', 'c2'], usageProviders: ['claude', 'openai'] });

    await deleteUserCascade('u1');

    expect(await rowCount('SELECT id FROM users WHERE id = ?', ['u1'])).toBe(0);
    expect(await rowCount('SELECT id FROM conversations WHERE user_id = ?', ['u1'])).toBe(0);
    expect(await rowCount(`SELECT id FROM messages WHERE conversation_id IN ('c1', 'c2')`)).toBe(0);
    expect(
      await rowCount(`SELECT id FROM share_tokens WHERE conversation_id IN ('c1', 'c2')`),
    ).toBe(0);
    expect(await rowCount('SELECT id FROM usage_daily WHERE user_id = ?', ['u1'])).toBe(0);
  });

  it('다른 사용자의 데이터는 보존된다 (격리)', async () => {
    await seedUser('u1', { convIds: ['c1'], usageProviders: ['claude'] });
    await seedUser('u2', { convIds: ['c2'], usageProviders: ['claude'] });

    await deleteUserCascade('u1');

    expect(await rowCount('SELECT id FROM users WHERE id = ?', ['u2'])).toBe(1);
    expect(await rowCount('SELECT id FROM conversations WHERE user_id = ?', ['u2'])).toBe(1);
    expect(await rowCount(`SELECT id FROM messages WHERE conversation_id = 'c2'`)).toBe(1);
    expect(await rowCount(`SELECT id FROM share_tokens WHERE conversation_id = 'c2'`)).toBe(1);
    expect(await rowCount('SELECT id FROM usage_daily WHERE user_id = ?', ['u2'])).toBe(1);
  });

  it('대화가 없는 사용자도 에러 없이 삭제된다', async () => {
    await seedUser('u1', { convIds: [], usageProviders: [] });

    await deleteUserCascade('u1');

    expect(await rowCount('SELECT id FROM users WHERE id = ?', ['u1'])).toBe(0);
  });
});
