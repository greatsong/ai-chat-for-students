import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 암호화 키 가져오기 (JWT_SECRET 기반 파생)
 * 별도의 ENCRYPTION_KEY 환경변수가 있으면 우선 사용
 */
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('암호화 키를 사용할 수 없습니다.');
  }
  // SHA-256으로 32바이트 키 파생
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * 문자열 암호화 (AES-256-GCM)
 * @param {string} plaintext
 * @returns {string} "iv:encrypted:tag" 형식의 hex 문자열
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
}

/**
 * 문자열 복호화 (AES-256-GCM)
 * @param {string} encryptedStr - "iv:encrypted:tag" 형식
 * @returns {string} 복호화된 평문
 */
export function decrypt(encryptedStr) {
  // 암호화되지 않은 평문 키인지 확인 (마이그레이션 호환)
  if (!encryptedStr.includes(':')) {
    console.warn('[security] 암호화되지 않은 평문 키가 감지되었습니다. DB에서 재암호화가 필요합니다.');
    return encryptedStr;
  }

  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    console.warn('[security] 잘못된 암호화 형식이 감지되었습니다.');
    return encryptedStr; // 암호화 형식이 아니면 평문으로 반환
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const tag = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * API 키 객체 암호화
 * @param {Object} keys - { provider: apiKey } 형식
 * @returns {Object} 암호화된 키 객체
 */
export function encryptApiKeys(keys) {
  const encrypted = {};
  for (const [provider, key] of Object.entries(keys)) {
    if (key) {
      encrypted[provider] = encrypt(key);
    }
  }
  return encrypted;
}

/**
 * API 키 객체 복호화
 * @param {Object} encryptedKeys - 암호화된 키 객체
 * @returns {Object} 복호화된 키 객체
 */
export function decryptApiKeys(encryptedKeys) {
  const decrypted = {};
  for (const [provider, key] of Object.entries(encryptedKeys)) {
    if (key) {
      decrypted[provider] = decrypt(key);
    }
  }
  return decrypted;
}
