import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDatabase } from './db/database.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import uploadRoutes from './routes/upload.js';
import imageRoutes from './routes/image.js';
import ttsRoutes from './routes/tts.js';
import sttRoutes from './routes/stt.js';
import teacherRoutes from './routes/teacher.js';

const app = express();
const PORT = process.env.PORT || 4022;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4021';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000;

// 보안 HTTP 헤더 (helmet)
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP는 프론트엔드에서 관리
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS 설정
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);

// 요청 타임아웃 미들웨어 (기본 30초)
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: '요청 시간이 초과되었습니다. 다시 시도해주세요.' });
    }
  });
  next();
});

// JSON 파싱 — 기본 5MB (채팅/일반 라우트용)
app.use(express.json({ limit: '5mb' }));

// 헬스 체크 엔드포인트 (rate limiting 전에 선언 — 모니터링 제외)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 전역 Rate Limiting (분당 500회 — 100명 동시 접속 지원)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api/', globalLimiter);

// 인증 엔드포인트 Rate Limiting (분당 10회 — 브루트포스 방지)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '로그인 시도가 너무 많습니다. 1분 후 다시 시도해주세요.' },
});

// 채팅 엔드포인트 Rate Limiting (사용자별 분당 30회)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 업로드 엔드포인트 Rate Limiting (사용자별 분당 15회)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 업로드/TTS/STT 라우트용 10MB body parser
const largeBodyParser = express.json({ limit: '10mb' });

// 서버 시작 (async — DB 초기화 후)
async function start() {
  await initDatabase();

  // 라우트 마운트 (Rate Limiter 적용)
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/chat', chatLimiter, chatRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/upload', largeBodyParser, uploadLimiter, uploadRoutes);
  app.use('/api/image', largeBodyParser, uploadLimiter, imageRoutes);
  app.use('/api/tts', largeBodyParser, uploadLimiter, ttsRoutes);
  app.use('/api/stt', largeBodyParser, uploadLimiter, sttRoutes);
  app.use('/api/teacher', teacherRoutes);

  app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  });
}

start().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
