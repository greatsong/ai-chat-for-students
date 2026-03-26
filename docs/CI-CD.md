# CI/CD 파이프라인 가이드

## 아키텍처 개요

```
개발자 로컬        GitHub           배포 플랫폼
─────────────    ───────────────   ──────────────
commit            push/PR
  ↓                 ↓
pre-commit       CI 파이프라인
(Husky)           ├─ Lint
  ├─ ESLint        ├─ Build        → Vercel (프론트)
  └─ Prettier      ├─ Test         → Railway (백엔드)
                   └─ Security
```

## 로컬 개발 워크플로우

### 1. 커밋 시 자동 검사 (pre-commit hook)

Husky + lint-staged가 커밋되는 파일만 자동으로 검사합니다:

```bash
git commit -m "기능 추가"
# → lint-staged 실행
#   → *.{js,jsx}: ESLint --fix + Prettier --write
```

### 2. 수동 검사 명령어

```bash
# 린트 검사
npm run lint              # ESLint 전체 검사
npm run lint:fix          # ESLint 자동 수정

# 포매팅 검사
npm run format:check      # Prettier 검사만 (수정 없음)
npm run format            # Prettier 자동 수정

# 테스트
npm run test:client       # 클라이언트 테스트
npm run test:server       # 서버 테스트
npm test                  # 전체 테스트

# 빌드
npm run build             # 프로덕션 빌드

# 환경변수 검증
node scripts/check-env.js # 로컬 .env 검증
```

## GitHub Actions CI 파이프라인

### 트리거 조건

- `master` 브랜치에 push
- `master` 브랜치로의 Pull Request

### 잡 구성

| 잡           | 실행 조건    | 설명                                 |
| ------------ | ------------ | ------------------------------------ |
| **lint**     | 항상         | ESLint + Prettier 검사               |
| **build**    | lint 통과 후 | Vite 빌드 + 환경변수 템플릿 검증     |
| **test**     | lint 통과 후 | Vitest 단위 테스트 (client + server) |
| **security** | 항상         | npm audit (high 이상 경고)           |

### 파이프라인 흐름

```
push/PR to master
  │
  ├─→ [lint] ──→ [build] ──→ 빌드 아티팩트 업로드
  │
  ├─→ [lint] ──→ [test]
  │
  └─→ [security] (독립 실행)
```

## 배포 프로세스

### 프론트엔드 (Vercel)

| 항목          | 값                                 |
| ------------- | ---------------------------------- |
| 플랫폼        | Vercel                             |
| 프로젝트      | `danggok-ai`                       |
| URL           | https://danggok-ai.vercel.app      |
| 빌드 명령     | `npm run build --workspace=client` |
| 출력 디렉토리 | `client/dist`                      |
| 배포 트리거   | GitHub push (자동)                 |

```bash
# 수동 강제 배포 (캐시 무시)
npx vercel --prod --force
```

### 백엔드 (Railway)

| 항목        | 값                                                    |
| ----------- | ----------------------------------------------------- |
| 플랫폼      | Railway                                               |
| 프로젝트    | `talented-compassion`                                 |
| URL         | https://talented-compassion-production.up.railway.app |
| 시작 명령   | `node index.js`                                       |
| 배포 트리거 | 수동 (`railway up`)                                   |

```bash
# 반드시 server/ 디렉토리에서 실행
cd server && railway up
```

## 환경변수 관리

### 필수 환경변수

| 변수                   | 용도             | 위치                 |
| ---------------------- | ---------------- | -------------------- |
| `PORT`                 | 서버 포트        | server/.env          |
| `CLIENT_URL`           | CORS 허용 오리진 | server/.env          |
| `ANTHROPIC_API_KEY`    | Claude API       | server/.env, Railway |
| `GOOGLE_AI_API_KEY`    | Gemini API       | server/.env, Railway |
| `OPENAI_API_KEY`       | ChatGPT API      | server/.env, Railway |
| `UPSTAGE_API_KEY`      | Solar API        | server/.env, Railway |
| `GOOGLE_CLIENT_ID`     | OAuth 로그인     | server/.env, Railway |
| `GOOGLE_CLIENT_SECRET` | OAuth 로그인     | server/.env, Railway |
| `JWT_SECRET`           | 토큰 서명        | server/.env, Railway |
| `TEACHER_EMAILS`       | 교사 권한 이메일 | server/.env, Railway |

### 검증

```bash
# 로컬 환경변수 검증
node scripts/check-env.js

# CI에서 .env.example 템플릿 검증
node scripts/check-env.js --ci
```

## 도구 설정

### ESLint (eslint.config.js)

- Flat config 형식 (ESLint 9+)
- 서버: Node.js globals
- 클라이언트: React Hooks + React Refresh 플러그인
- 미사용 변수: `_` 접두사 허용

### Prettier (.prettierrc)

- 세미콜론: 사용
- 따옴표: 작은따옴표
- 들여쓰기: 2칸
- 줄 폭: 100자

### Vitest

- 클라이언트: jsdom 환경, @testing-library/jest-dom
- 서버: Node.js 환경
- 커버리지: text + lcov

## 트러블슈팅

### Husky hook이 실행되지 않을 때

```bash
npx husky
chmod +x .husky/pre-commit
```

### ESLint 오류가 너무 많을 때

```bash
# 자동 수정 가능한 것만 먼저 처리
npm run lint:fix
```

### Vercel 배포가 반영되지 않을 때

```bash
npx vercel --prod --force
```

### Railway 서비스 연결이 끊겼을 때

```bash
cd server
railway link --project talented-compassion
railway service talented-compassion
railway up
```
