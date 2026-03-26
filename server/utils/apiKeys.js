import { getSetting } from '../db/database.js';

// 프로바이더별 환경변수 매핑
const ENV_KEY_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openai: 'OPENAI_API_KEY',
  upstage: 'UPSTAGE_API_KEY',
};

/**
 * API 키 조회 (DB 우선, 환경변수 fallback)
 * @param {'anthropic'|'google'|'openai'|'upstage'} provider
 * @returns {Promise<string|undefined>}
 */
export async function getApiKey(provider) {
  try {
    const dbKeys = await getSetting('api_keys');
    if (dbKeys && dbKeys[provider]) {
      return dbKeys[provider];
    }
  } catch {
    // DB 조회 실패 시 환경변수로 fallback
  }
  return process.env[ENV_KEY_MAP[provider]];
}
