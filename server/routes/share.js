// 공유 라우트 — 채팅 대화를 외부 평가 앱(proof-of-process)으로 안전하게 넘긴다.
//
// 보안 설계:
//  - 토큰: crypto.randomBytes(32) → 64자리 hex (256비트, 사실상 추측 불가)
//  - 저장: 원문이 아닌 sha256 해시만 DB에 보관 (DB 유출 시에도 유효 토큰 복원 불가)
//  - 일회용: 첫 조회 성공 시 used_at 기록, 이후 무효 (원자적 UPDATE로 경쟁 조건 차단)
//  - 만료: 기본 10분 TTL
//  - 오라클 차단: 없음/사용됨/만료를 모두 동일한 404로 응답
//  - 발급은 대화 소유자 본인만 (인증 필요), 조회는 공개(토큰이 유일한 자격증명)
//  - 조회는 POST /redeem (토큰을 URL 경로가 아닌 본문으로 — 접근 로그에 원문 미노출)
//  - 조회 엔드포인트는 평가 앱 오리진만 CORS 허용 + 토큰별 rate limit + no-store
//  - 응답 데이터 최소화 (utils/shareFormat.js)

import { Router } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActive } from '../middleware/auth.js';
import { queryOne, queryAll, run } from '../db/database.js';
import { hashToken } from '../utils/crypto.js';
import { buildSharedTurns } from '../utils/shareFormat.js';
import { validate, shareCreateSchema, shareRedeemSchema } from '../middleware/validate.js';

const router = Router();

// 토큰 유효기간 (분). 짧게 유지 — 재발급은 버튼 한 번이면 되므로 엄격해도 불편 없음.
const TTL_MINUTES = parseInt(process.env.SHARE_TOKEN_TTL_MINUTES, 10) || 10;

// 조회 엔드포인트가 CORS 허용할 오리진 (평가 앱). 콤마 구분 env, 기본은 프로덕션+로컬.
const ALLOWED_ORIGINS = (
  process.env.SHARE_ALLOWED_ORIGINS || 'https://pro-of-ai.vercel.app,http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 공개 조회 전용 CORS — 허용 목록의 브라우저 오리진만 응답을 읽을 수 있다.
// 자격증명(쿠키) 미사용 read-only 이므로 credentials:false.
// index.js 에서 /api/share 는 전역 CORS(단일 오리진+credentials:true)에서 제외되므로,
// 이 redeemCors 가 /api/share 의 유일한 CORS 결정 주체다. (POST redeem 은 프리플라이트 발생 → OPTIONS 도 처리)
const redeemCors = cors({
  origin(origin, cb) {
    // origin 없음 = 서버-서버/직접 호출(브라우저 아님) → 허용
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
  methods: ['POST'],
});

// 발급: 사용자별 분당 20회 (토큰 남발 방지)
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '공유 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 조회: 토큰별 분당 10회. IP 대신 토큰(해시)으로 키를 잡아 학교 NAT(동일 IP 100명)에서
// 학생들이 서로의 한도를 잠식하지 않게 한다. 각 공유 링크는 독립 한도를 가지며,
// 로그에서 탈취된 토큰의 재사용 레이스도 토큰 단위로 억제된다.
// (토큰 자체는 256비트라 무차별 대입은 엔트로피로 이미 차단; 전역 3000/분이 IP 폭주 백스톱)
const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req.body?.token ? hashToken(req.body.token) : req.ip),
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// POST /api/share — 소유자가 대화 공유 토큰 발급
router.post(
  '/',
  authenticate,
  requireActive,
  createLimiter,
  validate(shareCreateSchema),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.body;

      // 소유권 확인 (본인 대화만 공유 가능) — 없으면 404 (존재 여부 노출 방지)
      const conversation = await queryOne(
        'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
        [conversationId, userId],
      );
      if (!conversation) {
        return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      }

      // 256비트 원문 토큰 → 해시만 저장
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const id = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

      await run(
        `INSERT INTO share_tokens (id, token_hash, conversation_id, created_by, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, tokenHash, conversationId, userId, expiresAt.toISOString(), now.toISOString()],
      );

      // 토큰 원문은 로그에 남기지 않는다
      console.log(`[share] 토큰 발급 user=${userId} conv=${conversationId}`);

      // 원문 토큰은 이 응답에서 딱 한 번만 반환
      res.status(201).json({ token: rawToken, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error('공유 토큰 발급 오류:', error);
      res.status(500).json({ error: '공유 링크를 만드는 중 오류가 발생했습니다.' });
    }
  },
);

// /redeem 경로의 CORS(프리플라이트 OPTIONS 포함)는 redeemCors 가 전담.
// 전역 CORS 는 index.js 에서 /api/share 제외됨.
router.use('/redeem', redeemCors);

// POST /api/share/redeem — 공개. body 의 토큰으로 대화를 1회 조회 (자동 소비)
router.post('/redeem', redeemLimiter, validate(shareRedeemSchema), async (req, res) => {
  // 응답은 항상 캐시 금지 (성공/실패 무관) — 일회용 데이터가 중간 캐시에 남지 않도록
  res.set('Cache-Control', 'no-store');
  try {
    const tokenHash = hashToken(req.body.token);
    const nowIso = new Date().toISOString();

    // 원자적 소비: 미사용 + 미만료인 토큰만 used_at 을 채우며 claim.
    // 동시 요청이 와도 UPDATE 는 단일 writer 이므로 하나만 성공한다.
    const claimed = await queryOne(
      `UPDATE share_tokens SET used_at = ?
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
         RETURNING conversation_id`,
      [nowIso, tokenHash, nowIso],
    );

    // 없음/사용됨/만료 — 모두 동일한 404 (상태를 알려주는 오라클 제거)
    if (!claimed) {
      console.warn(`[share] 유효하지 않은 토큰 조회 ip=${req.ip}`);
      return res.status(404).json({ error: '유효하지 않거나 만료된 공유 링크입니다.' });
    }

    const conversationId = claimed.conversation_id;

    // 대화 + 공유자 표시 이름 (users.name = 구글 표시 이름, 예 "10305 홍길동")
    const conversation = await queryOne(
      `SELECT c.title, c.provider, u.name AS student_name
         FROM conversations c JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`,
      [conversationId],
    );
    if (!conversation) {
      // 토큰은 유효했으나 대화가 삭제된 경우
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const messages = await queryAll(
      `SELECT role, content, files, image_url, created_at
         FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [conversationId],
    );

    const turns = buildSharedTurns(messages);
    const period =
      turns.length > 0
        ? { start: turns[0].created_at, end: turns[turns.length - 1].created_at }
        : { start: null, end: null };

    console.log(`[share] 토큰 사용 conv=${conversationId} turns=${turns.length}`);

    res.json({
      conversation: {
        title: conversation.title || '',
        provider: conversation.provider || '',
        studentName: conversation.student_name || '',
        messageCount: turns.length,
        period,
      },
      turns,
    });
  } catch (error) {
    console.error('공유 대화 조회 오류:', error);
    res.status(500).json({ error: '공유된 대화를 불러오는 중 오류가 발생했습니다.' });
  }
});

export default router;
