import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActive } from './middleware/auth.js';
import { apiErrorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import uploadRoutes from './routes/upload.js';
import imageRoutes from './routes/image.js';
import teacherRoutes from './routes/teacher.js';
import shareRoutes from './routes/share.js';

/**
 * Express 앱 구성. DB 초기화와 listen은 index.js가 맡는다.
 * 권한 회귀 테스트가 운영과 같은 미들웨어 순서를 사용하도록 분리했다.
 */
export function createApp() {
  const app = express();
  // Railway 등 리버스 프록시 뒤에서 실행 시 필요 (express-rate-limit이 IP를 올바르게 인식)
  app.set('trust proxy', 1);
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4021';
  const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000;
  // 이미지 생성(gpt-image-2.5 등)은 모델 추론에 수십 초~분 단위가 걸려 기본 30초로는 부족.
  const IMAGE_TIMEOUT_MS = parseInt(process.env.IMAGE_TIMEOUT_MS, 10) || 180000;

  // 보안 HTTP 헤더 (helmet + CSP)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
          connectSrc: ["'self'", CLIENT_URL],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS 설정
  // /api/share 는 제외 — 해당 라우터가 자체 CORS(redeemCors: 평가 앱 오리진 허용, credentials 미사용)를
  // 적용하므로, 단일 오리진+credentials:true 인 전역 CORS 가 덧씌워지면 안 된다.
  const globalCors = cors({
    origin: CLIENT_URL,
    credentials: true,
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/share')) return next();
    return globalCors(req, res, next);
  });

  // 요청 타임아웃 미들웨어 (기본 30초, 이미지 생성은 180초)
  app.use((req, res, next) => {
    const timeoutMs = req.path.startsWith('/api/image') ? IMAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({ error: '요청 시간이 초과되었습니다. 다시 시도해주세요.' });
      }
    });
    next();
  });

  // JSON 파싱 — 채팅 파일 첨부(base64)가 원본 대비 33% 부풀어 5MB 기본값으론 부족했음.
  // 단일 파일 10MB 한도 × 다중 첨부 + 오버헤드를 고려해 20MB.
  // 인증되지 않은 라우트(/api/auth, /api/health)는 본문이 작으므로 limit만 클 뿐 실제 부하 없음.
  app.use(express.json({ limit: '20mb' }));

  // 헬스 체크 엔드포인트 (rate limiting 전에 선언 — 모니터링 제외)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 전역 Rate Limiting — 학교 NAT 환경(동일 IP에서 100명 동시 접속)을 고려해 분당 3000회 허용
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  });
  app.use('/api/', globalLimiter);

  // 인증 엔드포인트 Rate Limiting — 학교 NAT 환경(동일 IP에서 다수 학생 로그인)을 고려해 분당 100회 허용
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    // 로그아웃과 내 정보 조회(/me)는 토큰이 있어야 동작한다. 학교 NAT에서는 모든 학생이 IP 하나를
    // 같이 쓰므로, 여기에 IP 한도를 걸면 수업 시작 때 /me가 429를 받아 학생들이 한꺼번에 로그아웃된다.
    skip: (req) => req.path === '/logout' || req.path === '/me',
    message: { error: '로그인 시도가 너무 많습니다. 1분 후 다시 시도해주세요.' },
  });

  // 업로드 엔드포인트 Rate Limiting (사용자별 분당 15회)
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { error: '파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  });

  // 업로드·이미지 라우트용 추가 파서 — 전역(20MB)으로 충분하지만 명시성을 위해 유지
  const largeBodyParser = express.json({ limit: '20mb' });

  // 라우트 마운트 (Rate Limiter + requireActive 적용)
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/chat', chatRoutes); // rate limit은 chat.js 내부에서 인증 후 적용
  app.use('/api/conversations', authenticate, requireActive, conversationRoutes);
  app.use('/api/upload', authenticate, requireActive, largeBodyParser, uploadLimiter, uploadRoutes);
  app.use('/api/image', authenticate, requireActive, largeBodyParser, uploadLimiter, imageRoutes);
  app.use('/api/teacher', teacherRoutes);
  // 공유: 발급(POST)은 라우트 내부에서 authenticate, 조회(GET)는 공개.
  // 따라서 여기서는 전역 authenticate 를 걸지 않는다.
  app.use('/api/share', shareRoutes);

  // 마지막 오류 처리기. Express 기본 처리기는 NODE_ENV가 production이 아니면 스택을 응답에 싣고,
  // JSON 파싱 오류는 메시지에 요청 본문 일부가 들어 있어 그대로 로그에 남기지 않는다.
  app.use(apiErrorHandler);

  return app;
}
