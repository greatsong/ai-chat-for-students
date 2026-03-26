import { getSetting } from '../db/database.js';
import { decryptApiKeys } from './crypto.js';

// 프로바이더별 환경변수 매핑
const ENV_KEY_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openai: 'OPENAI_API_KEY',
  upstage: 'UPSTAGE_API_KEY',
};

/**
 * API 키 조회 (DB 우선, 환경변수 fallback)
 * DB에 저장된 키는 AES-256-GCM으로 암호화되어 있으며 자동 복호화됨
 * @param {'anthropic'|'google'|'openai'|'upstage'} provider
 * @returns {Promise<string|undefined>}
 */
export async function getApiKey(provider) {
  try {
    const dbKeys = await getSetting('api_keys');
    if (dbKeys && dbKeys[provider]) {
      try {
        const decrypted = decryptApiKeys({ [provider]: dbKeys[provider] });
        return decrypted[provider];
      } catch {
        // 복호화 실패 시 평문으로 반환 (마이그레이션 호환)
        return dbKeys[provider];
      }
    }
  } catch {
    // DB 조회 실패 시 환경변수로 fallback
  }
  return process.env[ENV_KEY_MAP[provider]];
}
