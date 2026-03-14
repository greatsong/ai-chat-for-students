import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'chat.db');

let db;
let saveTimer;

/**
 * DB를 파일에 저장 (디바운스)
 */
function saveDatabase() {
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  }, 100);
}

/**
 * DB를 즉시 파일에 저장
 */
export function saveDatabaseSync() {
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * 데이터베이스 초기화
 */
export async function initDatabase() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // 테이블 생성
  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      teacher_id TEXT,
      join_code TEXT UNIQUE,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
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

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '{}'
    )
  `);

  // 인덱스 생성
  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date)');

  // 기본 학급 삽입 (최초 실행 시)
  const classroomCount = db.exec('SELECT COUNT(*) as count FROM classrooms');
  if (classroomCount[0]?.values[0][0] === 0) {
    db.run(
      'INSERT INTO classrooms (id, name, join_code) VALUES (?, ?, ?)',
      [crypto.randomUUID(), '기본 학급', 'DEFAULT']
    );
  }

  // 기본 설정 삽입 (최초 실행 시)
  const defaultSettings = {
    enabled_providers: ["claude", "gemini", "openai", "solar"],
    enabled_models: {
      claude: ["claude-sonnet-4-6"],
      gemini: ["gemini-3-flash-preview"],
      openai: ["gpt-5.4"],
      solar: ["solar-pro-3"],
    },
    image_generation_enabled: false,
    system_prompt: "",
    default_daily_limit: 100000,
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    db.run(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)]
    );
  }

  saveDatabase();
  console.log('데이터베이스 초기화 완료:', DB_PATH);
  return db;
}

/**
 * DB 인스턴스 반환
 */
export function getDb() {
  if (!db) {
    throw new Error('데이터베이스가 초기화되지 않았습니다. initDatabase()를 먼저 호출하세요.');
  }
  return db;
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (여러 행)
 */
export function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (한 행)
 */
export function queryOne(sql, params = []) {
  const stmt = getDb().prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

/**
 * SQL 쿼리 실행 헬퍼 — INSERT/UPDATE/DELETE
 */
export function run(sql, params = []) {
  getDb().run(sql, params);
  saveDatabase();
}

/**
 * 설정값 조회
 */
export function getSetting(key) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
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
export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]
  );
}
