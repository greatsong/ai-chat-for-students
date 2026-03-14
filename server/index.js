import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import uploadRoutes from './routes/upload.js';
import imageRoutes from './routes/image.js';
import teacherRoutes from './routes/teacher.js';

const app = express();
const PORT = process.env.PORT || 4022;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4021';

// CORS 설정
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));

// JSON 파싱 (파일 업로드를 위해 50MB 제한)
app.use(express.json({ limit: '50mb' }));

// 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 서버 시작 (async — DB 초기화 후)
async function start() {
  await initDatabase();

  // 라우트 마운트
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/image', imageRoutes);
  app.use('/api/teacher', teacherRoutes);

  app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`클라이언트 허용 URL: ${CLIENT_URL}`);
  });
}

start().catch(err => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
