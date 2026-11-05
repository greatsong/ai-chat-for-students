import 'dotenv/config';
import { initDatabase } from './db/database.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 4022;

// 서버 시작 (async — DB 초기화 후)
async function start() {
  await initDatabase();

  createApp().listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  });
}

start().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
