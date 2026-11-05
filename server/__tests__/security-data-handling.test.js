// CSV 수식 무력화, API 키 복호화 전환, 학년도 파기 동작 검증
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@libsql/client';
import { csvCell } from '../utils/csv.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { planPurge, executePurge } from '../utils/retention.js';

describe('csvCell', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('%j 앞에 따옴표를 붙인다', (v) => {
    expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('쉼표·따옴표·줄바꿈을 감싼다', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('일반 값과 빈 값을 유지한다', () => {
    expect(csvCell('홍길동')).toBe('홍길동');
    expect(csvCell(null)).toBe('');
  });
});

describe('ENCRYPTION_KEY 전환', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('JWT_SECRET으로 암호화한 값을 ENCRYPTION_KEY 도입 뒤에도 읽는다', () => {
    process.env.JWT_SECRET = 'jwt-secret';
    delete process.env.ENCRYPTION_KEY;
    const old = encrypt('sk-test');
    process.env.ENCRYPTION_KEY = 'new-key';
    expect(decrypt(old)).toBe('sk-test');
  });

  it('두 키 모두 맞지 않으면 실패한다', () => {
    process.env.JWT_SECRET = 'a';
    delete process.env.ENCRYPTION_KEY;
    const old = encrypt('sk-test');
    process.env.JWT_SECRET = 'b';
    process.env.ENCRYPTION_KEY = 'c';
    expect(() => decrypt(old)).toThrow();
  });

  it('복호화에 실패하면 암호문을 키로 쓰지 않고 환경변수로 넘어간다', async () => {
    vi.resetModules();
    vi.doMock('../db/database.js', () => ({
      getSetting: async () => ({ openai: 'aa:bb:cc' }),
    }));
    process.env.OPENAI_API_KEY = 'env-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getApiKey } = await import('../utils/apiKeys.js');
    expect(await getApiKey('openai')).toBe('env-key');
    vi.doUnmock('../db/database.js');
    vi.restoreAllMocks();
  });
});

describe('학년도 파기', () => {
  let db;

  beforeEach(async () => {
    db = createClient({ url: ':memory:' });
    await db.execute('PRAGMA foreign_keys = ON');
    await db.batch(
      [
        `CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, created_at TEXT)`,
        `CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT, created_at TEXT, updated_at TEXT, owner_role TEXT DEFAULT 'student')`,
        `CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), created_at TEXT)`,
        `CREATE TABLE share_tokens (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id))`,
        `CREATE TABLE usage_daily (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), date TEXT)`,
        `INSERT INTO users VALUES ('old', 'student', '2026-03-02 00:00:00')`,
        `INSERT INTO users VALUES ('active', 'student', '2026-03-02 00:00:00')`,
        `INSERT INTO users VALUES ('new', 'student', '2027-03-05 00:00:00')`,
        `INSERT INTO users VALUES ('t', 'teacher', '2026-03-02 00:00:00')`,
        // 이전 학년도 대화
        `INSERT INTO users VALUES ('former', 'student', '2026-03-02 00:00:00')`,
        `INSERT INTO users VALUES ('voice', 'student', '2026-03-02 00:00:00')`,
        `INSERT INTO conversations VALUES ('c-former', 'former', '교사 시절', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 'teacher')`,
        `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-old', 'old', '첫 메시지', '2026-05-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')`,
        // 제목만 새 학년도에 고친 대화: updated_at이 기준일 이후여도 파기 대상
        `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-renamed', 'old', '제목', '2026-05-01T00:00:00.000Z', '2027-03-10T00:00:00.000Z')`,
        // 새 학년도에 이어 쓴 대화: 이전 메시지만 지운다
        `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-continued', 'active', '이전 메시지 일부', '2026-05-01T00:00:00.000Z', '2027-03-10T00:00:00.000Z')`,
        `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-new', 'new', '새 대화', '2027-03-10T00:00:00.000Z', '2027-03-10T00:00:00.000Z')`,
        `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-teacher', 't', '교사 대화', '2026-05-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m7', 'c-former', '2026-05-01T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m1', 'c-old', '2026-05-01T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m2', 'c-renamed', '2026-05-01T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m3', 'c-continued', '2026-05-01T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m4', 'c-continued', '2027-03-10T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m5', 'c-new', '2027-03-10T00:00:00.000Z')`,
        `INSERT INTO messages VALUES ('m6', 'c-teacher', '2026-05-01T00:00:00.000Z')`,
        `INSERT INTO share_tokens VALUES ('s1', 'c-old')`,
        `INSERT INTO usage_daily VALUES ('u4', 'voice', '2027-03-10')`,
        `INSERT INTO usage_daily VALUES ('u1', 'old', '2026-12-01')`,
        `INSERT INTO usage_daily VALUES ('u2', 'active', '2027-03-10')`,
        `INSERT INTO usage_daily VALUES ('u3', 't', '2026-12-01')`,
      ],
      'write',
    );
  });

  const ids = async (t) =>
    (await db.execute(`SELECT id FROM ${t} ORDER BY id`)).rows.map((r) => r.id);

  it('계획은 건수만 세고 아무것도 지우지 않는다', async () => {
    const plan = await planPurge(db, '2027-03-01');
    expect(plan).toEqual({
      conversations: 2,
      trimmedConversations: 1,
      messages: 3,
      shareTokens: 1,
      usageDaily: 1,
      students: 0,
    });
    expect((await ids('conversations')).length).toBe(6);
  });

  it('제목만 고친 대화도 지우고, 이어 쓴 대화는 이전 메시지만 지운다', async () => {
    await executePurge(db, '2027-03-01');
    expect(await ids('conversations')).toEqual(['c-continued', 'c-former', 'c-new', 'c-teacher']);
    expect(await ids('messages')).toEqual(['m4', 'm5', 'm6', 'm7']);
    expect(await ids('share_tokens')).toEqual([]);
    expect(await ids('usage_daily')).toEqual(['u2', 'u3', 'u4']);
    expect((await ids('users')).length).toBe(6);
    const row = await db.execute(`SELECT title FROM conversations WHERE id = 'c-continued'`);
    expect(row.rows[0].title).not.toContain('이전 메시지 일부');
  });

  it('학생 계정 삭제를 선택하면 이후 활동이 없는 학생만 지운다', async () => {
    const plan = await planPurge(db, '2027-03-01', { deleteStudents: true });
    expect(plan.students).toBe(1);
    await executePurge(db, '2027-03-01', { deleteStudents: true });
    // 교사 시절 대화가 남은 계정과 음성만 사용한 계정은 유지된다
    expect(await ids('users')).toEqual(['active', 'former', 'new', 't', 'voice']);
  });

  it('기준일 형식이 틀리면 거부한다', async () => {
    await expect(planPurge(db, '내년')).rejects.toThrow();
    await expect(executePurge(db, '2027')).rejects.toThrow();
  });
});
