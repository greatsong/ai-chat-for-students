import { createClient } from '@libsql/client';

let client;

/**
 * 데이터베이스 초기화 (Turso libSQL)
 */
export async function initDatabase() {
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // 테이블 생성
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT,
      name TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'student',
      classroom_id TEXT,
      daily_limit INTEGER DEFAULT 100000,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      teacher_id TEXT,
      join_code TEXT UNIQUE,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      provider TEXT,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      files TEXT DEFAULT '[]',
      image_url TEXT,
      code_result TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      provider TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0,
      image_count INTEGER DEFAULT 0,
      UNIQUE(user_id, date, provider),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '{}'
    )
  `);

  // 인덱스 생성
  await client.execute('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date)');

  // 기본 학급 삽입 (최초 실행 시)
  const classroomCount = await client.execute('SELECT COUNT(*) as count FROM classrooms');
  if (classroomCount.rows[0]?.count === 0) {
    await client.execute({
      sql: 'INSERT INTO classrooms (id, name, join_code) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), '기본 학급', 'DEFAULT'],
    });
  }

  // 기본 설정 삽입 (최초 실행 시)
  const defaultSettings = {
    enabled_providers: ["claude", "gemini", "openai", "solar"],
    enabled_models: {
      claude: ["claude-sonnet-4-6"],
      gemini: ["gemini-3-flash-preview"],
      openai: ["gpt-5.4"],
      solar: ["solar-pro3"],
    },
    image_generation_enabled: false,
    system_prompt: "당신은 당곡고등학교 학생들의 학습을 돕는 AI 도우미입니다. 오직 수업 및 학습과 관련된 내용에 대해서만 답변해주세요. 상담, 개인적인 고민, 학습과 무관한 잡담 등에는 정중히 거절하고 학습 관련 질문을 하도록 안내해주세요. 학생들이 스스로 생각하고 탐구할 수 있도록 도와주되, 답을 바로 알려주기보다는 사고 과정을 안내해주세요.",
    default_daily_limit: 100000,
    teacher_emails: [],
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
  }

  console.log('Turso 데이터베이스 초기화 완료');
  return client;
}

/**
 * DB 클라이언트 반환
 */
export function getDb() {
  if (!client) {
    throw new Error('데이터베이스가 초기화되지 않았습니다. initDatabase()를 먼저 호출하세요.');
  }
  return client;
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (여러 행)
 */
export async function queryAll(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  return result.rows;
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (한 행)
 */
export async function queryOne(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  return result.rows[0] || null;
}

/**
 * SQL 쿼리 실행 헬퍼 — INSERT/UPDATE/DELETE
 */
export async function run(sql, params = []) {
  await getDb().execute({ sql, args: params });
}

/**
 * 설정값 조회
 */
export async function getSetting(key) {
  const row = await queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * 설정값 저장
 */
export async function setSetting(key, value) {
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]
  );
}
