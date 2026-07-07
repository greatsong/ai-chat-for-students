import crypto from 'crypto';
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
      privacy_agreed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 기존 테이블에 privacy_agreed_at 컬럼 추가 (이미 존재하면 무시)
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN privacy_agreed_at TEXT`);
  } catch {
    // 이미 컬럼이 존재하면 무시
  }

  // 기존 테이블에 chat_mode 컬럼 추가 (학습 모드/프로젝트 모드 구분)
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN chat_mode TEXT DEFAULT 'learning'`);
  } catch {
    // 이미 컬럼이 존재하면 무시
  }

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

  // 공유 토큰: 학생이 대화를 외부 평가 앱으로 넘길 때 발급하는 일회용 토큰.
  // 원문 토큰은 저장하지 않고 sha256 해시(token_hash)만 보관한다.
  // used_at 이 채워지면 사용 완료(1회용), expires_at 이 지나면 만료.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      used_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  // TTS/STT 사용량 컬럼 추가 (마이그레이션)
  for (const col of ['tts_count', 'stt_count']) {
    try {
      await client.execute(`ALTER TABLE usage_daily ADD COLUMN ${col} INTEGER DEFAULT 0`);
    } catch {
      // 이미 존재하면 무시
    }
  }

  // 인덱스 생성
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date_provider ON usage_daily(user_id, date, provider)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_share_tokens_hash ON share_tokens(token_hash)',
  );

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
    enabled_providers: ['claude', 'gemini', 'openai', 'solar'],
    enabled_models: {
      claude: ['claude-sonnet-4-6', 'claude-sonnet-5', 'claude-opus-4-8'],
      gemini: ['gemini-3.5-flash', 'gemini-3.1-pro-preview'],
      openai: ['gpt-5.5'],
      solar: ['solar-pro3'],
    },
    image_generation_enabled: false,
    tts_enabled: false,
    stt_enabled: false,
    tts_default_voice: 'nova',
    tts_default_model: 'tts-1',
    system_prompt:
      '당신은 당곡고등학교 학생들의 학습을 돕는 AI 도우미입니다. 오직 수업 및 학습과 관련된 내용에 대해서만 답변해주세요. 상담, 개인적인 고민, 학습과 무관한 잡담 등에는 정중히 거절하고 학습 관련 질문을 하도록 안내해주세요. 학생들이 스스로 생각하고 탐구할 수 있도록 도와주되, 답을 바로 알려주기보다는 사고 과정을 안내해주세요.',
    default_daily_limit: 100000,
    teacher_emails: [],
    // 코드 실행 도구 — 모두 기본 OFF로 시작 (점진적 활성화)
    code_execution_claude: false,
    code_execution_openai: false,
    // 'teacher' = 교사/관리자만 사용 가능 (기본), 'student' = 모든 사용자
    code_execution_max_role: 'teacher',
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
  }

  // 마이그레이션: 기존 enabled_models에 프로 모델 추가
  try {
    const row = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'enabled_models'",
      args: [],
    });
    if (row.rows.length > 0) {
      const models = JSON.parse(row.rows[0].value);
      // 주의: openai 'pro' 추론 모델(gpt-5.4-pro 등)은 미노출 정책 — 추가하지 않는다.
      const additions = {
        claude: 'claude-opus-4-8',
        gemini: 'gemini-3.1-pro-preview',
      };
      let changed = false;
      for (const [provider, modelId] of Object.entries(additions)) {
        if (!models[provider]) models[provider] = [];
        if (!models[provider].includes(modelId)) {
          models[provider].push(modelId);
          changed = true;
        }
      }
      if (changed) {
        await client.execute({
          sql: "UPDATE settings SET value = ? WHERE key = 'enabled_models'",
          args: [JSON.stringify(models)],
        });
        console.log('마이그레이션: 프로 모델 활성화 완료 (opus, gemini pro, gpt pro)');
      }
    }
  } catch (e) {
    console.warn('enabled_models 마이그레이션 스킵:', e.message);
  }

  // 마이그레이션 (2026-05): GPT-5.5 / GPT-5.5 Pro 활성화
  try {
    const row = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'enabled_models'",
      args: [],
    });
    if (row.rows.length > 0) {
      const models = JSON.parse(row.rows[0].value);
      const newModels = { openai: ['gpt-5.5'] };
      let changed = false;
      for (const [provider, modelIds] of Object.entries(newModels)) {
        if (!models[provider]) models[provider] = [];
        for (const modelId of modelIds) {
          if (!models[provider].includes(modelId)) {
            models[provider].push(modelId);
            changed = true;
          }
        }
      }
      if (changed) {
        await client.execute({
          sql: "UPDATE settings SET value = ? WHERE key = 'enabled_models'",
          args: [JSON.stringify(models)],
        });
        console.log('마이그레이션: GPT-5.5 / GPT-5.5 Pro 활성화 완료');
      }
    }
  } catch (e) {
    console.warn('GPT-5.5 마이그레이션 스킵:', e.message);
  }

  // 마이그레이션 (2026-06): OpenAI 'pro' 추론 모델 미노출.
  // gpt-5.5-pro / gpt-5.4-pro는 첫 토큰까지 ~3분간 무출력이라 SSE 연결이 끊겨
  // 학생에게 "응답 없음"으로 보인다. enabled_models에서 제거한다.
  try {
    const row = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'enabled_models'",
      args: [],
    });
    if (row.rows.length > 0) {
      const models = JSON.parse(row.rows[0].value);
      const removeOpenai = ['gpt-5.5-pro', 'gpt-5.4-pro'];
      if (Array.isArray(models.openai)) {
        const before = models.openai.length;
        models.openai = models.openai.filter((id) => !removeOpenai.includes(id));
        if (models.openai.length !== before) {
          await client.execute({
            sql: "UPDATE settings SET value = ? WHERE key = 'enabled_models'",
            args: [JSON.stringify(models)],
          });
          console.log('마이그레이션: OpenAI pro 추론 모델 미노출 처리 완료');
        }
      }
    }
  } catch (e) {
    console.warn('OpenAI pro 미노출 마이그레이션 스킵:', e.message);
  }

  // 마이그레이션 (2026-07): Claude Sonnet 5 활성화 (기존 4.6과 함께 선택 가능)
  try {
    const row = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'enabled_models'",
      args: [],
    });
    if (row.rows.length > 0) {
      const models = JSON.parse(row.rows[0].value);
      if (!models.claude) models.claude = [];
      if (!models.claude.includes('claude-sonnet-5')) {
        models.claude.push('claude-sonnet-5');
        await client.execute({
          sql: "UPDATE settings SET value = ? WHERE key = 'enabled_models'",
          args: [JSON.stringify(models)],
        });
        console.log('마이그레이션: Claude Sonnet 5 활성화 완료');
      }
    }
  } catch (e) {
    console.warn('Sonnet 5 마이그레이션 스킵:', e.message);
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

// 쿼리 타임아웃 기본값 (10초)
const DEFAULT_QUERY_TIMEOUT = 10_000;

/**
 * 쿼리에 타임아웃을 적용하는 래퍼
 */
function withTimeout(promise, timeoutMs = DEFAULT_QUERY_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`쿼리 타임아웃 (${timeoutMs}ms)`)), timeoutMs),
    ),
  ]);
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (여러 행)
 */
export async function queryAll(sql, params = []) {
  const result = await withTimeout(getDb().execute({ sql, args: params }));
  return result.rows;
}

/**
 * SQL 쿼리 실행 헬퍼 — SELECT (한 행)
 */
export async function queryOne(sql, params = []) {
  const result = await withTimeout(getDb().execute({ sql, args: params }));
  return result.rows[0] || null;
}

/**
 * SQL 쿼리 실행 헬퍼 — INSERT/UPDATE/DELETE
 */
export async function run(sql, params = []) {
  await withTimeout(getDb().execute({ sql, args: params }));
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
    [key, JSON.stringify(value)],
  );
}
