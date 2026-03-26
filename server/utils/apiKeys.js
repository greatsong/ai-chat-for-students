import { getSetting } from '../db/database.js';
import { decryptApiKeys } from './crypto.js';

// 프로바이더별 환경변수 매핑
const ENV_KEY_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openai: 'OPENAI_API_KEY',
  upstage: 'UPSTAGE_API_KEY',
};

// API 키 캐시 (5분 TTL)
const KEY_CACHE_TTL = 5 * 60 * 1000;
const keyCache = new Map(); // Map<provider, { key, timestamp }>

/**
 * API 키 조회 (캐시 우선, DB, 환경변수 fallback)
 * DB에 저장된 키는 AES-256-GCM으로 암호화되어 있으며 자동 복호화됨
 * @param {'anthropic'|'google'|'openai'|'upstage'} provider
 * @returns {Promise<string|undefined>}
 */
export async function getApiKey(provider) {
  // 캐시 확인
  const cached = keyCache.get(provider);
  if (cached && Date.now() - cached.timestamp < KEY_CACHE_TTL) {
    return cached.key;
  }

  let key;
  try {
    const dbKeys = await getSetting('api_keys');
    if (dbKeys && dbKeys[provider]) {
      try {
        const decrypted = decryptApiKeys({ [provider]: dbKeys[provider] });
        key = decrypted[provider];
      } catch {
        // 복호화 실패 시 평문으로 반환 (마이그레이션 호환)
        key = dbKeys[provider];
      }
    }
  } catch {
    // DB 조회 실패 시 환경변수로 fallback
  }

  if (!key) {
    key = process.env[ENV_KEY_MAP[provider]];
  }

  // 캐시에 저장
  if (key) {
    keyCache.set(provider, { key, timestamp: Date.now() });
  }

  return key;
}

/**
 * API 키 캐시 초기화 (설정 변경 시 호출)
 * @param {string} [provider] - 특정 프로바이더만 초기화. 생략 시 전체 초기화
 */
export function clearKeyCache(provider) {
  if (provider) {
    keyCache.delete(provider);
  } else {
    keyCache.clear();
  }
}
