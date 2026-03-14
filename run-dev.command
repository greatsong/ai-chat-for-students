#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 AI Chat for Students 개발 서버 시작..."
echo ""
echo "클라이언트: http://localhost:4021"
echo "서버: http://localhost:4022"
echo ""

# .env 파일 존재 확인
if [ ! -f server/.env ]; then
  echo "⚠️  server/.env 파일이 없습니다."
  echo "server/.env.example을 복사하여 API 키를 설정하세요."
  echo ""
  echo "cp server/.env.example server/.env"
  echo ""
fi

npm run dev
