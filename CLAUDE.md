# AI Chat for Students

## 프로젝트 개요

수업용 AI 채팅 도구. 학생들이 프리미엄 AI 모델(Claude, Gemini, ChatGPT, Solar)을 활용하고, 교사가 채팅 기록을 모니터링.

## 기술 스택

- 프론트엔드: React 19 + Vite + Tailwind CSS 4 (포트 4021)
- 백엔드: Express 5 + SQLite (포트 4022)
- AI: Claude, Gemini, ChatGPT, Solar 4종
- 인증: Google OAuth 2.0 + JWT
- 배포: Vercel (프론트) + Railway (백엔드)

## 실행 방법

```bash
npm install
npm run dev
```

## 배포 방법

### Vercel (프론트엔드)

```bash
npx vercel --prod --force   # 강제 재배포 (캐시 무시)
```

- 프로젝트명: `danggok-ai`
- URL: https://danggok-ai.vercel.app
- GitHub push 시 자동 배포되지만, 캐시로 인해 반영 안 될 수 있음 → `--force` 필수

### Railway (백엔드)

```bash
cd server && railway up      # 반드시 server/ 디렉토리에서 실행!
```

- 프로젝트명: `talented-compassion`
- URL: https://talented-compassion-production.up.railway.app
- **주의**: 프로젝트 루트가 아닌 `server/` 디렉토리에서 `railway up` 실행해야 함
- GitHub 자동 배포 아님 — 수동 `railway up` 필요
- 서비스 링크 안 되어 있으면: `railway link --project talented-compassion` → `railway service talented-compassion`

## 코딩 컨벤션

- UI 텍스트: 한국어
- 코드: 영어
- 모듈: ES Modules (import/export)
- 상태관리: Zustand
- 스타일: Tailwind CSS
- 린팅: ESLint (flat config) — `npm run lint`
- 포매팅: Prettier — `npm run format`
- 테스트: Vitest — `npm test`

## CI/CD

### 자동화 파이프라인

- **pre-commit**: Husky + lint-staged (커밋 시 자동 린트/포맷)
- **GitHub Actions**: push/PR to master → Lint → Build → Test → Security Audit
- **배포**: Vercel (자동) + Railway (수동)
- 상세: [docs/CI-CD.md](docs/CI-CD.md)

### 주요 명령어

```bash
npm run lint          # ESLint 검사
npm run lint:fix      # ESLint 자동 수정
npm run format:check  # Prettier 검사
npm run format        # Prettier 자동 수정
npm test              # 전체 테스트
npm run test:client   # 클라이언트 테스트만
npm run test:server   # 서버 테스트만
node scripts/check-env.js  # 환경변수 검증
```
