import jwt from 'jsonwebtoken';
import { queryOne } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

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
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [decoded.userId]);

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
