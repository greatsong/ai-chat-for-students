import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 암호화 키 가져오기
 * ENCRYPTION_KEY 우선 → 없으면 JWT_SECRET fallback (경고 1회)
 * JWT_SECRET 회전 시 암호화된 키가 깨지지 않도록 별도 ENCRYPTION_KEY 권장
 */
let _warnedJwtFallback = false;

function getEncryptionKey() {
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey) {
    return crypto.createHash('sha256').update(encKey).digest();
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('ENCRYPTION_KEY 또는 JWT_SECRET이 설정되지 않았습니다.');
  }
  if (!_warnedJwtFallback) {
    console.warn(
      '[security] ENCRYPTION_KEY 미설정 — JWT_SECRET을 암호화 키로 사용 중. ' +
        'JWT 회전 시 저장된 API 키가 깨질 수 있으니 ENCRYPTION_KEY를 별도 설정하세요.',
    );
    _warnedJwtFallback = true;
  }
  return crypto.createHash('sha256').update(jwtSecret).digest();
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
    console.warn(
      '[security] 암호화되지 않은 평문 키가 감지되었습니다. DB에서 재암호화가 필요합니다.',
    );
    return encryptedStr;
  }

  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('[security] 잘못된 암호화 형식: 복호화 불가');
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
