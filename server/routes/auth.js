import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne, run } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const TEACHER_EMAILS = (process.env.TEACHER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

/**
 * POST /api/auth/google
 * Google One Tap / Sign-In 로그인 처리
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Google credential이 필요합니다.' });
  }

  try {
    // 1. Google ID 토큰 검증
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!response.ok) {
      return res.status(401).json({ error: '유효하지 않은 Google 토큰입니다.' });
    }

    const payload = await response.json();
    const { sub: googleId, email, name, picture } = payload;

    if (!googleId || !email) {
      return res.status(401).json({ error: 'Google 토큰에서 사용자 정보를 추출할 수 없습니다.' });
    }

    // 이메일 도메인 제한: @danggok.hs.kr 또는 교사 이메일만 허용
    const isAllowedDomain = email.endsWith('@danggok.hs.kr');
    const isTeacherEmail = TEACHER_EMAILS.includes(email);
    if (!isAllowedDomain && !isTeacherEmail) {
      return res.status(403).json({ error: '@danggok.hs.kr 이메일만 사용할 수 있습니다.' });
    }

    // 2. 기존 사용자 확인
    let user = await queryOne('SELECT * FROM users WHERE google_id = ?', [googleId]);

    if (user) {
      // 3. 기존 사용자 — 이름/아바타 변경 시 업데이트
      if (user.name !== name || user.avatar !== picture) {
        await run('UPDATE users SET name = ?, avatar = ? WHERE id = ?', [name, picture, user.id]);
        user.name = name;
        user.avatar = picture;
      }
    } else {
      // 4. 신규 사용자 생성
      const role = TEACHER_EMAILS.includes(email) ? 'teacher' : 'student';
      const isActive = role === 'teacher' ? 1 : 0;

      // 첫 번째 학급 배정
      const firstClassroom = await queryOne('SELECT id FROM classrooms ORDER BY created_at ASC LIMIT 1');
      const classroomId = firstClassroom ? firstClassroom.id : null;

      const userId = crypto.randomUUID();
      await run(
        'INSERT INTO users (id, google_id, email, name, avatar, role, classroom_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, googleId, email, name, picture, role, classroomId, isActive]
      );

      user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    }

    // 5. JWT 발급
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 6. 응답
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    console.error('Google 로그인 오류:', err);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

/**
 * GET /api/auth/me
 * 현재 로그인한 사용자 정보 조회
 */
router.get('/me', authenticate, (req, res) => {
  const user = req.user;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      is_active: user.is_active,
    },
  });
});

export default router;
