// 공유 토큰 redeem SQL 의 보안 속성을 실제 libSQL(in-memory)로 검증한다.
// - 일회용: 원자적 UPDATE ... RETURNING 이 두 번째 조회에서 null 을 돌려주는가
// - 만료: expires_at 이 지난 토큰은 claim 되지 않는가 (ISO 문자열 사전식 비교)
// - 오라클 차단: 없음/사용됨/만료가 모두 "claim 실패(null)" 로 구분 불가한가
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { createClient } from '@libsql/client';
import { hashToken } from '../utils/crypto.js';

let db;

// share.js 의 redeem 원자적 claim 과 동일한 쿼리
async function claim(tokenHash, nowIso) {
  const res = await db.execute({
    sql: `UPDATE share_tokens SET used_at = ?
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
          RETURNING conversation_id`,
    args: [nowIso, tokenHash, nowIso],
  });
  return res.rows[0] || null;
}

async function insertToken({ tokenHash, conversationId = 'conv-1', expiresAt }) {
  await db.execute({
    sql: `INSERT INTO share_tokens (id, token_hash, conversation_id, created_by, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      tokenHash,
      conversationId,
      'user-1',
      expiresAt,
      new Date().toISOString(),
    ],
  });
}

beforeEach(async () => {
  db = createClient({ url: ':memory:' });
  await db.execute(`
    CREATE TABLE share_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      used_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
});

describe('redeem 원자적 claim', () => {
  it('유효한 토큰은 첫 조회에서 conversation_id 를 돌려준다', async () => {
    const raw = 'a'.repeat(64);
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await insertToken({ tokenHash: hashToken(raw), expiresAt: future });

    const first = await claim(hashToken(raw), new Date().toISOString());
    expect(first).not.toBeNull();
    expect(first.conversation_id).toBe('conv-1');
  });

  it('일회용: 두 번째 조회는 null (이미 used_at 채워짐)', async () => {
    const raw = 'b'.repeat(64);
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await insertToken({ tokenHash: hashToken(raw), expiresAt: future });

    const first = await claim(hashToken(raw), new Date().toISOString());
    const second = await claim(hashToken(raw), new Date().toISOString());
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('만료된 토큰은 claim 되지 않는다 (null)', async () => {
    const raw = 'c'.repeat(64);
    const past = new Date(Date.now() - 1000).toISOString();
    await insertToken({ tokenHash: hashToken(raw), expiresAt: past });

    const result = await claim(hashToken(raw), new Date().toISOString());
    expect(result).toBeNull();
  });

  it('존재하지 않는 토큰도 null (없음/사용됨/만료가 모두 동일 결과 → 오라클 없음)', async () => {
    const nonexistent = await claim(hashToken('d'.repeat(64)), new Date().toISOString());
    expect(nonexistent).toBeNull();
  });

  it('동시 조회를 순차로 재현: 정확히 한 번만 성공', async () => {
    const raw = 'e'.repeat(64);
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await insertToken({ tokenHash: hashToken(raw), expiresAt: future });

    const now = new Date().toISOString();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await claim(hashToken(raw), now));
    }
    const successes = results.filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });
});
