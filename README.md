# 다목적 멀티 AI 채팅 시스템

> 한 화면에서 **Claude · Gemini · ChatGPT · Solar** 4종 AI를 함께 쓰고, 관리자가 대화 기록을 모니터링할 수 있는 셀프호스팅 채팅 도구입니다. Google 로그인으로 인증하고, 허용한 사람만 들어올 수 있습니다.

이 문서는 **개발 경험이 적은 사람도 그대로 따라 하면 자기만의 인스턴스를 띄울 수 있도록** 만들었습니다. 외부 계정 4개(무료로 시작 가능)만 준비하면 됩니다.

---

## 1. 무엇을 만들 수 있나

- 5~10명 규모의 소모임/팀/스터디용 **프라이빗 AI 채팅** (인원은 코드 수정 없이 늘릴 수 있음)
- 허용된 이메일만 로그인 → 외부인 차단
- 관리자(나)가 모든 대화 기록 조회/내보내기
- AI 모델별 사용 한도, 사용자 활성/비활성 관리
- 이미지 생성(Gemini), 음성 입력(STT)/출력(TTS), 파일 업로드

### 기술 스택

| 영역         | 사용 기술                                                  |
| ------------ | ---------------------------------------------------------- |
| 프론트엔드   | React 19 + Vite + Tailwind CSS 4                           |
| 백엔드       | Express 5                                                  |
| 데이터베이스 | Turso (libSQL) — **테이블 자동 생성, 마이그레이션 불필요** |
| 인증         | Google OAuth 2.0 + JWT                                     |
| AI           | Claude / Gemini / ChatGPT / Solar (원하는 것만 켜도 됨)    |
| 배포         | Vercel(프론트) + Railway(백엔드)                           |

---

## 2. 준비물 (계정 4종)

시작 전에 아래 계정을 만들어 두세요. 모두 무료 티어로 시작할 수 있습니다.

1. **[Turso](https://turso.tech)** — 데이터베이스 (대화/사용자 저장)
2. **[Google Cloud Console](https://console.cloud.google.com)** — 구글 로그인용 OAuth 클라이언트
3. **AI 제공사 API 키** — 아래 중 **최소 1개**
   - [Anthropic (Claude)](https://console.anthropic.com)
   - [Google AI Studio (Gemini)](https://aistudio.google.com/apikey)
   - [OpenAI (ChatGPT)](https://platform.openai.com/api-keys)
   - [Upstage (Solar)](https://console.upstage.ai)
4. **배포용** (로컬 실행만 할 거면 생략 가능): [Vercel](https://vercel.com) + [Railway](https://railway.app)

> 💡 **로컬에서 먼저 돌려보고** 잘 되면 배포하는 순서를 권장합니다. (3~5단계)

---

## 3. 내려받기 & 설치

> Node.js 20 이상이 필요합니다. ([nodejs.org](https://nodejs.org)에서 LTS 버전 설치)

```bash
git clone <이-레포-주소>
cd ai-chat-for-students
npm install
```

---

## 4. 외부 서비스 준비

### 4-1. Turso 데이터베이스 만들기

[Turso CLI](https://docs.turso.tech/cli/installation)를 설치하거나, [웹 대시보드](https://app.turso.tech)에서 만들 수 있습니다. CLI 기준:

```bash
turso db create my-ai-chat        # DB 생성
turso db show my-ai-chat --url    # → TURSO_DATABASE_URL 에 넣을 값
turso db tokens create my-ai-chat # → TURSO_AUTH_TOKEN 에 넣을 값
```

> 테이블은 서버가 처음 켜질 때 자동으로 만들어집니다. 빈 DB만 준비하면 됩니다.

### 4-2. Google 로그인(OAuth) 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. **API 및 서비스 → OAuth 동의 화면**
   - User Type: **외부(External)**, 게시 상태는 **테스트(Testing)**로 두기
   - **테스트 사용자(Test users)**에 로그인할 사람들의 Gmail 주소를 추가
   - → 5~10명 규모면 테스트 모드로 충분하며, 까다로운 앱 검증을 받을 필요가 없습니다.
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 JavaScript 원본(Authorized JavaScript origins)** 에 아래를 추가:
     - `http://localhost:4021` (로컬 개발용)
     - `https://내-프론트-도메인.vercel.app` (배포 후 추가)
   - 생성하면 나오는 **클라이언트 ID**와 **클라이언트 보안 비밀**을 메모

> 이 방식은 토큰 기반이라 **리다이렉트 URI는 필요 없습니다.** "승인된 JavaScript 원본"만 정확히 넣으면 됩니다.

### 4-3. AI API 키 발급

위 2번 목록에서 쓸 제공사의 콘솔에 들어가 키를 발급받습니다. 4개 다 필요하지 않고, **쓰고 싶은 것만** 준비하면 됩니다. (키 입력은 배포 후 관리자 설정 화면에서도 가능합니다.)

---

## 5. 환경변수 설정

### 5-1. 서버 환경변수

루트의 `.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

```ini
# 서버 설정
PORT=4022
CLIENT_URL=http://localhost:4021      # 배포 시 프론트 도메인으로 변경

# AI API 키 (쓰는 것만 실제 값, 안 쓰는 건 아무 문자열이라도 채워두기)
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
OPENAI_API_KEY=...
UPSTAGE_API_KEY=...

# Google OAuth (4-2에서 발급)
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# 보안 키 (아래 명령으로 무작위 생성)
JWT_SECRET=...

# 권한 부여 (쉼표로 구분)
ADMIN_EMAILS=나@gmail.com               # 관리자 = 전체 모니터링/설정 권한
TEACHER_EMAILS=운영도우미@gmail.com      # (선택) 모니터링 권한자

# Turso DB (4-1에서 발급)
TURSO_DATABASE_URL=libsql://...turso.io
TURSO_AUTH_TOKEN=...
```

`JWT_SECRET` 같은 무작위 키는 이렇게 생성하세요:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5-2. 클라이언트 환경변수

```bash
cp client/.env.example client/.env
```

```ini
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com   # 서버 GOOGLE_CLIENT_ID와 동일
```

### 5-3. 설정 검증

```bash
node scripts/check-env.js   # 필수 환경변수가 다 채워졌는지 확인
```

---

## 6. 로컬 실행

```bash
npm run dev
```

- 프론트엔드: http://localhost:4021
- 백엔드: http://localhost:4022 (Vite가 `/api`를 자동 연결)

브라우저로 http://localhost:4021 에 접속해 **Google 로그인** 하세요.

> ⚠️ **첫 로그인 후 "승인 대기" 화면이 뜨는 게 정상입니다.** 신규 사용자는 기본적으로 비활성(`is_active=0`) 상태로 가입됩니다.
>
> - `ADMIN_EMAILS`에 넣은 본인 계정은 관리자로 들어갈 수 있습니다.
> - 다른 사용자는 **관리자 화면에서 활성화(승인)** 해줘야 채팅을 쓸 수 있습니다. → 이게 "허용한 사람만 입장"의 핵심 장치입니다.

---

## 7. 배포 (Vercel + Railway)

프론트와 백엔드를 **각각 배포**합니다. 코드 수정은 `vercel.json` 한 줄뿐입니다.

### 7-1. 백엔드 → Railway

```bash
cd server
railway init           # 새 프로젝트 생성 (또는 railway link 로 기존 연결)
railway up             # 반드시 server/ 디렉터리에서 실행!
```

- Railway 대시보드 → **Variables** 에 5-1의 서버 환경변수를 모두 등록
- 배포되면 나오는 도메인을 메모 (예: `https://내백엔드.up.railway.app`)

### 7-2. 프론트엔드 연결 설정

`vercel.json`을 열어 `/api` 요청이 **내 Railway 백엔드**로 가도록 주소를 바꿉니다.

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://내백엔드.up.railway.app/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 7-3. 프론트엔드 → Vercel

```bash
npx vercel --prod --force
```

- Vercel 대시보드 → **Settings → Environment Variables** 에 `VITE_GOOGLE_CLIENT_ID` 등록
- 배포된 프론트 도메인을 확인한 뒤:
  - **4-2의 "승인된 JavaScript 원본"** 에 그 도메인 추가
  - 백엔드(Railway)의 `CLIENT_URL` 을 그 도메인으로 변경 후 다시 `railway up`

> `--force`는 Vercel 캐시를 무시하고 새 번들을 배포합니다. 변경이 반영 안 될 때 사용하세요.

---

## 8. 자주 막히는 곳 (트러블슈팅)

| 증상                                  | 원인 / 해결                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| 로그인 버튼이 안 뜸                   | `VITE_GOOGLE_CLIENT_ID` 누락 → `client/.env` 확인 후 재시작        |
| 로그인은 되는데 "승인 대기"           | 정상. 관리자 화면에서 해당 사용자를 활성화                         |
| `redirect_uri_mismatch` / origin 오류 | Google "승인된 JavaScript 원본"에 현재 도메인이 없음               |
| 배포 후 `/api` 호출이 404/CORS        | `vercel.json`의 Railway 주소, 백엔드 `CLIENT_URL` 확인             |
| AI 응답이 안 옴                       | 해당 제공사 API 키가 비었거나 잘못됨 (관리자 설정에서 재입력 가능) |
| 특정 사내/학교망에서 접속 불가        | 일부 네트워크가 Railway 도메인을 차단할 수 있음 → 다른 망에서 확인 |

---

## 9. 명령어 모음

```bash
npm run dev            # 로컬 개발(프론트+백 동시)
npm run build          # 프론트 프로덕션 빌드
npm run lint           # 린트 검사
npm run format         # 코드 포맷
npm test               # 전체 테스트
node scripts/check-env.js   # 환경변수 검증
```

---

## 10. 인원/권한 늘리기

- **사용자 추가**: 새 사람이 Google 로그인 → 관리자 화면에서 활성화. (이메일을 `ADMIN_EMAILS`/`TEACHER_EMAILS`에 넣지 않으면 일반 사용자)
- **동시 접속**: 기본 구조가 수백 명까지 견디도록 설계됨(Rate Limiting·캐싱·재시도 내장). 5~10명은 무료 티어로 충분.
- **AI 모델 켜고/끄기**: 관리자 설정 화면에서 제공사별 키 입력/삭제로 제어.

---

## 라이선스

ISC. 자유롭게 포크해서 본인 인스턴스를 만드세요.
