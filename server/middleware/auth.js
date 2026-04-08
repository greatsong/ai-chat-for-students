import jwt from 'jsonwebtoken';
import { queryOne } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
  process.exit(1);
}

// 사용자 캐시: DB 조회를 줄이기 위해 5분 TTL로 캐싱
const userCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5분

// 30분마다 만료된 캐시 엔트리 정리
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (now - entry.cachedAt > USER_CACHE_TTL) {
        userCache.delete(key);
      }
    }
  },
  30 * 60 * 1000,
);

/**
 * 캐시에서 사용자 조회, 없으면 DB에서 조회 후 캐시에 저장
 */
async function getCachedUser(userId) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL) {
    return cached.user;
  }

  const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (user) {
    userCache.set(userId, { user, cachedAt: Date.now() });
  } else {
    userCache.delete(userId);
  }
  return user;
}

/**
 * 캐시 무효화 (사용자 정보 변경 시 호출)
 */
export function invalidateUserCache(userId) {
  userCache.delete(userId);
}

/**
 * JWT 인증 미들웨어
 * Authorization 헤더에서 Bearer 토큰을 추출하고 검증
 * - 만료/잘못된 토큰은 401 반환
 * - 비활성 사용자도 req.user에 할당 (라우트에서 is_active 체크 가능)
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getCachedUser(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '토큰이 만료되었습니다. 다시 로그인해주세요.' });
    }
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

/**
 * 활성 사용자 확인 미들웨어
 * authenticate 미들웨어 이후에 사용해야 함
 * 비활성 학생(is_active=0)의 API 접근을 차단
 * 교사/관리자는 항상 통과
 */
export function requireActive(req, res, next) {
  if (req.user.role === 'student' && !req.user.is_active) {
    return res.status(403).json({ error: '교사 승인 후 사용할 수 있습니다.' });
  }
  next();
}

/**
 * 교사 권한 확인 미들웨어
 * authenticate 미들웨어 이후에 사용해야 함
 * admin도 교사 권한을 포함함
 */
export function requireTeacher(req, res, next) {
  if (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: '교사 권한이 필요합니다.' });
  }
  next();
}

/**
 * 관리자 권한 확인 미들웨어
 * authenticate 미들웨어 이후에 사용해야 함
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}
