# Changelog

## [Unreleased] - 2026-11-05 — 개인정보 보호 보강

상세 분석은 [docs/SECURITY-PII-2026-11.md](docs/SECURITY-PII-2026-11.md)에 있다.

- **프런트 보안 헤더 추가.** `vercel.json`에 CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`를 넣었다. 기존 CSP는 API 응답에만 있어 화면에는 적용되지 않았다. 외부 이미지 요청을 막아 대화 내용이 이미지 주소로 빠져나가는 경로를 닫는다
- **공유한 대화 삭제 수정.** 운영 DB는 외래 키를 강제해 공유 이력이 있는 대화를 지우면 메시지만 지워지고 500이 났다. 공유 토큰·메시지·대화를 한 트랜잭션으로 지운다
- **로그아웃 시 메모리 비우기.** 로그아웃하면 전체 새로고침으로 이전 사용자의 대화가 화면에 남지 않게 했다. 로그아웃은 IP 공용 로그인 한도에서 제외했다
- **교사 시절 대화 보호.** `conversations.owner_role`에 작성 당시 역할을 저장한다. 교사를 해제해도 그때 대화는 관리자 열람 대상이 되지 않는다
- **마크다운 이미지를 링크로 표시.** 외부 이미지를 불러오지 않는다
- **세션 폐기.** `users.token_version`과 `POST /api/auth/logout`을 추가했다. 로그아웃과 교사 해제 시 이전 토큰이 즉시 무효가 된다. 기존 토큰은 그대로 유효하다
- **Google 로그인 검증 강화.** `GOOGLE_CLIENT_ID`가 없으면 거부하고, `email_verified`와 학교 계정의 `hd`를 확인한다. JWT 알고리즘을 HS256으로 고정했다
- **비활성 교사 차단.** `requireActive`가 학생뿐 아니라 교사도 막는다. 관리자는 잠금 사고를 막기 위해 통과한다
- **관리자 열람 기록.** 학생 대화 열람과 CSV 내보내기를 내용 없이 감사 로그로 남긴다
- **CSV 수식 무력화와 쿼리 검증.** 학생이 정한 제목이 엑셀에서 수식으로 실행되지 않게 했다
- **응답·로그 최소화.** 설정 응답의 `api_keys`, 학생 수정 응답의 `google_id`, Claude 로그의 첨부 파일명, 삭제 로그의 이메일을 뺐다. STT·TTS·이미지 오류는 프로덕션에서 제공사 원문을 내보내지 않는다. 마지막 오류 처리기를 추가해 스택과 요청 본문이 응답·로그에 남지 않게 했다
- **SSRF 차단 보완.** 대괄호 IPv6(`[::ffff:7f00:1]`, `[fd12::1]` 등)와 CGNAT 대역이 빠져 있던 문제를 `net.BlockList`로 고쳤다
- **API 키 복호화.** `ENCRYPTION_KEY` 도입 전 값을 읽을 수 있게 했고, 복호화 실패 시 암호문을 키로 사용하지 않고 환경변수로 넘어간다
- **OpenAI 코드 실행 저장 끔.** Responses API 호출에 `store: false`를 넣었다
- **학년도 파기 도구.** `server/scripts/purge-school-year.mjs`를 추가했다. 기본은 건수만 출력한다
- **앱 구성 분리.** `server/app.js`로 미들웨어·라우트 구성을 옮겨 권한 테스트가 운영과 같은 순서로 동작한다. `server/__tests__/security-routes.integration.test.js`에서 라우트 권한을 HTTP로 검사한다

## [Unreleased] - 2026-11-05 — Gemini 4 Argon · GPT-6.1 Terra · GPT-6 Luna · Solar Mini 4

- **Gemini 4 Argon(`gemini-4-argon`) 추가.** 2026-10-13 GA. 유료 티어 전용이며 단가는 11월 30일까지 $2/$10, 12월 1일부터 $4/$20(100만 토큰당)이다. Opus 5.5처럼 학생 제한 모델에 넣어 교사와 개별 허용 학생만 사용한다. 실측(2026-11-05, 스트리밍) 결과 기본 설정의 첫 토큰이 2.0초였고 `thinkingLevel: 'low'`는 8.9초로 오히려 느려 기본값을 사용한다
- **Gemini 3.7 Flash 제거.** Google이 2026-10-08부터 3.7 Flash 요청을 3.8 Flash로 자동 라우팅한다
- **Gemini 이미지 모델을 `gemini-nano-banana-2.1`로 교체.** `gemini-3.1-flash-image`는 2026-10-06에 지원 중단이 예고되었다
- **Solar Open2를 `solar-mini4`로 교체.** Upstage API가 `solar-open2` 요청을 '더 이상 지원하지 않는 모델'로 거부한다
- **GPT-5.6 Terra·Luna를 `gpt-6.1-terra`($1/$5)·`gpt-6-luna`($0.10/$0.50)로 교체.** 두 모델 모두 컨텍스트는 1.05M이다. `reasoning_effort`는 `minimal`을 지원하지 않아(400) 기존과 같은 `low`를 사용한다
- **DB 마이그레이션.** `enabled_models`와 `student_restricted_models`의 구형 모델을 같은 자리에서 후속 모델로 바꾼다. 후속 모델이 이미 있으면 구형만 뺀다. Argon 추가와 학생 잠금은 `gemini_argon_added` 플래그로 한 번만 수행해 교사가 이후 바꾼 설정을 유지한다. 매 기동마다 구형을 다시 넣던 'Gemini 3.7 Flash 활성화'·'Solar Open2 활성화' 마이그레이션은 삭제했다
- **회귀 테스트.** `server/__tests__/model-migration-2026-11.test.js`에서 임시 파일 DB로 `initDatabase()`를 실행해 교체 결과와 재기동 시 유지 여부를 검사한다
- **참고: 프로덕션 Gemini 장애.** 2026-10-01 이후 프로덕션 Gemini 응답이 0건이다. 같은 코드에 로컬 `GOOGLE_API_KEY`를 넣거나 Vertex AI로 호출하면 정상이고 Google의 호출 방식 변경도 없어, Railway에 설정된 키 문제로 판단했다. 이 변경과 별개로 교사 설정 화면에서 유효한 Google API 키를 입력해야 한다

## [Unreleased] - 2026-09-30 — Claude Sonnet 5.5 · GPT-6.1 Sol

- **Claude Sonnet 5를 `claude-sonnet-5-5`로 교체하고 Claude 기본 모델로 지정.** 가격($2/$10), 컨텍스트(1M), 토크나이저는 Sonnet 5와 같다
- **Sonnet 5.5 생각(thinking) 설정.** Sonnet 5.5에 `thinking: disabled`를 보내면 400 오류가 난다. 기존 `startsWith('claude-sonnet-5')` 조건이 5.5에도 걸려 그대로 두면 모든 요청이 실패하므로, Opus 5.5와 같이 `output_config.effort: 'low'`를 보내고 모델 ID를 정확히 비교하도록 고쳤다
- **실측(2026-09-30, 3차 방정식 풀이, 스트리밍).** effort low는 첫 토큰 0.7초·전체 9.1초, 생각을 끄는 `between_tools`는 0.9초·11.1초, 기본 high는 5.5초·14.4초였다. 가장 빠른 low를 사용한다
- **GPT-5.6 Sol을 `gpt-6.1-sol`로 교체하고 ChatGPT 기본 모델로 지정.** 가격은 $2/$10(100만 토큰당)으로 5.6 Sol($4/$20)의 절반이고 기존 기본 모델 Terra($2/$12)보다도 낮다. Terra와 Luna는 선택지로 남긴다
- **GPT-6.1 Sol 추론 강도.** 6.1 Sol은 `reasoning_effort`로 `none`과 `minimal`을 지원하지 않아 최솟값 `low`를 사용한다. 모델을 지정하지 않은 요청에도 기본 모델의 추론 강도가 적용되도록 조회 기준을 실제 사용 모델 ID로 바꿨다
- **Claude 거절 폴백.** Sonnet 5.5와 Opus 5.5 요청에 서버측 폴백(`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`)을 켰다. 안전 분류기가 거절하면 Anthropic이 거절 유형별 권장 모델로 같은 스트림에서 이어 답한다. Sonnet 5.5는 cyber·frontier_llm 거절만 재시도된다. 폴백까지 거절되면 응답 끝에 안내 문구를 붙여 빈 답변으로 끝나지 않게 했다
- **DB 마이그레이션.** `enabled_models`에서 Sonnet 5를 Sonnet 5.5로, GPT-5.6 Sol을 GPT-6.1 Sol로 바꿔 각 프로바이더의 1순위에 둔다. `student_restricted_models`도 함께 바꿔 교사의 학생 잠금 설정을 유지한다. 매 기동마다 1순위를 강제하던 'Sonnet 5 기본화'·'GPT-5.6 Terra 기본화' 마이그레이션은 삭제했다. 이제 교사가 순서를 바꿔도 재기동 후 유지된다. 은퇴한 `claude-sonnet-4-6`과 `gpt-5.5`는 구형 모델 정리 목록으로 옮겼다
- **회귀 테스트.** `server/__tests__/claude-stream-params.test.js`에서 모델별 thinking·effort·폴백 파라미터와 거절 안내 문구를 검사한다

## [Unreleased] - 2026-09-23 — Claude Opus 5.5

- **Claude Opus 5를 `claude-opus-5-5`로 교체.** 컨텍스트(1M)와 토크나이저는 같고 가격은 입력 $5→$4, 출력 $25→$20(100만 토큰당)으로 20% 낮다
- **생각(thinking) 설정 변경.** Opus 5.5는 thinking을 끌 수 없어 `disabled`를 보내면 400 오류가 난다. 대신 `output_config.effort: 'low'`로 생각을 짧게 제한한다. 기존 `startsWith('claude-opus-5')` 조건은 `claude-opus-5-5`에도 걸리므로 정확히 비교하도록 고쳤다
- **실측(2026-09-23, 같은 프롬프트, 스트리밍).** Opus 5(thinking 끔)는 첫 토큰 1.1초·전체 9.0초·출력 551토큰, Opus 5.5(effort low)는 첫 토큰 2.1~3.1초·전체 5.3~6.3초·출력 420~444토큰. 첫 토큰은 1~2초 늦지만 전체 응답은 짧고 출력 토큰도 적다. Vercel 120초 한도와는 거리가 멀다
- **DB 마이그레이션.** `enabled_models`와 `student_restricted_models`의 `claude-opus-5`를 `claude-opus-5-5`로 바꿔 교사 설정(노출 여부·학생 잠금)을 유지한다. 잠금 목록을 함께 바꾸지 않으면 Opus 5.5가 학생에게 잠금 없이 열린다. 재실행해도 변경이 없다(멱등)

## [Unreleased] - 2026-09-09 — GPT Image 2.5 (교사 전용 이미지 생성)

- **OpenAI 이미지 모델을 `gpt-image-2.5-flare`로 교체** (2026-09-08 공개). 이미지 생성은 기존과 동일하게 교사·관리자 전용 (`server/routes/image.js` 403 게이트, 학생에게는 UI 미노출)
- **조직 미인증 자동 폴백** — GPT Image 2.5 계열은 OpenAI 조직 인증(organization verification)을 마친 계정에서만 호출된다. 미인증 403이면 구형 `gpt-image-2`로 폴백해 교사 기능이 멈추지 않게 하고, 인증 완료 후에는 자동으로 2.5를 사용
- 채팅에 표시되는 모델 캡션이 **실제 사용된 모델**을 반영 (폴백 시 `ChatGPT · gpt-image-2`로 정직하게 표기)
- 폴백 시 `gpt-image-2`가 지원하지 않는 `xhigh`/`max` 품질은 `high`로 자동 하향 (2.5에서 추가된 값)
- 품질은 `medium` 유지 — Vercel 프록시 120초 한도 제약. 조직 인증 완료 후 실측해 상향 여부 재검토

## [Unreleased] - 2026-09-04 — 학생 제한 모델(Opus 잠금) + 개별 허용

- **학생 제한 모델 설정** `student_restricted_models` (기본 `['claude-opus-5']`) — `enabled_models`에 켜져 있어도 학생에게는 숨김·차단. 교사·관리자는 항상 사용 가능
- **학생 개별 허용** `users.premium_models` (0/1) — 사용자 관리 페이지에서 학생마다 "고급 모델" 토글. 상황에 따라 전체 학생에게 열 때는 설정 페이지에서 해당 모델의 🔒 잠금 해제
- 서버 게이트 `server/utils/modelAccess.js` — `POST /api/chat`에서 허용목록 검사 뒤 역할·개별 예외 검사(403)
- `GET /api/teacher/public-settings`에 `student_restricted_models` 추가, `GET/PATCH /api/teacher/students`에 `premium_models` 추가, `/api/auth/me` 응답에 `premium_models` 포함
- 버그 수정: 채팅 화면이 모델 허용목록을 존재하지 않는 `authStore.settings`에서 읽어 학생에게 카탈로그 전체가 노출되던 문제 → `public-settings` 기준으로 필터. 선택 모델이 목록에서 사라지면 첫 허용 모델로 자동 전환

## [1.2.0] - 2026-03-26 — 500명 스케일링 리팩토링

500명 사용자 / 100명 동시 접속 대비 전면 리팩토링. 53개 파일, +6,177 / -1,198 줄 변경.

---

### 🏗️ 서버 성능 최적화

#### 인증 캐싱 (`server/middleware/auth.js`)

- **인메모리 사용자 캐시** (5분 TTL) — 매 API 요청마다 DB 조회하던 것을 캐시에서 반환
- 30분 간격 만료 엔트리 자동 정리
- 사용자 정보 변경 시 `invalidateUserCache()`로 즉시 무효화

#### DB 쿼리 최적화

- **복합 인덱스 3개 추가** (`server/db/database.js`)
  - `idx_conversations_user_updated` — 대화 목록 정렬
  - `idx_messages_conv_created` — 메시지 히스토리 조회
  - `idx_usage_daily_user_date_provider` — 사용량 upsert
- **DB 타임아웃** — 모든 쿼리에 10초 타임아웃 래퍼 적용
- **N+1 쿼리 제거** (`server/routes/conversations.js`) — 대화 목록의 상관 서브쿼리를 `LEFT JOIN + GROUP BY`로 변경
- **atomic upsert** (`server/routes/chat.js`) — `SELECT` → `INSERT/UPDATE` 2단계를 `INSERT ... ON CONFLICT DO UPDATE` 단일 쿼리로 변경, race condition 방지
- **메시지 히스토리 제한** — `LIMIT 50`으로 최근 50개만 조회 (DESC → reverse)
- **교사 쿼리 LIMIT** — students(1000), usage(500/50/90), messages(1000)

#### Rate Limiting 재설계 (`server/index.js`)

- 글로벌: 100/min → **500/min** (100명 동시 접속 지원)
- 채팅/업로드: 글로벌 → **사용자별** (`req.user?.id || req.ip`)
- `trust proxy` 설정 — Railway 프록시 환경 호환
- `validate: false` — 프록시 환경 검증 에러 방지

#### 미들웨어 추가

- **요청 타임아웃** — 기본 30초, `REQUEST_TIMEOUT_MS` 환경변수로 설정 가능
- **Body size 분리** — 기본 JSON 5MB, 업로드/TTS/STT만 10MB

#### 파일 업로드 최적화 (`server/routes/upload.js`)

- `readFileSync`/`unlinkSync` → **비동기** `readFile`/`unlink`로 이벤트 루프 블로킹 제거
- 서버 시작 시 24시간+ 고아 파일 자동 정리

#### AI 프로바이더 안정성

- **지수 백오프 재시도** (`server/utils/retry.js`) — 429, 5xx, 네트워크 에러 시 최대 3회 재시도 (지터 포함)
- **API 키 캐싱** (`server/utils/apiKeys.js`) — DB 조회 + 복호화를 5분 TTL 캐시로
- **스트리밍 에러 정리** — 모든 프로바이더(Claude, OpenAI, Gemini, Solar)에서 에러 시 `stream.abort()` 호출

---

### ⚡ 클라이언트 성능 최적화

#### 렌더링 최적화 (`client/src/components/chat/MessageList.jsx`)

- `Math.random()` 키 → **인덱스 기반 키**로 교체 (불필요한 리마운트 방지)
- `MemoizedMarkdown` — `React.memo` 래핑, content 변경 시만 재렌더링
- `MessageBubble` — `React.memo` + 커스텀 비교 함수 (id, content, role만 비교)
- **Blob URL 메모리 누수 수정** — TTS 오디오 URL을 useEffect cleanup으로 해제

#### 코드 스플리팅 (`client/src/App.jsx`, `client/vite.config.js`)

- 교사 페이지 7개 → **`React.lazy()`** 지연 로드 (학생은 교사 코드 다운로드 안 함)
- **manualChunks** — react-markdown + syntax-highlighter 별도 청크 분리
- 학생 초기 번들 크기 대폭 감소

#### SSE 스트림 안정성 (`client/src/lib/api.js`)

- **AbortController** + 30초 타임아웃
- 에러 시 `reader.cancel()` 정리
- `parseSSELines()` 헬퍼로 중복 제거
- `\n\n` 경계 기반 완전한 이벤트 블록만 파싱

#### Store 최적화

- **chatStore** — `Date.now()` 임시 ID → 단조 카운터 (밀리초 충돌 방지)
- **loadConversations 중복 요청 방지** — 동일 요청 공유 promise
- 메시지 전송 후 전체 목록 리페치 → **로컬 상태 업데이트**
- **teacherStore** — 대화 메시지 500개 제한, `clearConversationState()` 추가

#### 메모리 누수 수정 (`client/src/components/chat/MessageInput.jsx`)

- 언마운트 시 MediaRecorder 정지, stream tracks 정지, blob URL 해제, timeout 정리

---

### 🎨 UI/UX 개선

- **교사 대시보드 레이아웃** — `min-h-screen` → `h-screen`으로 짤림 수정, 데스크톱 헤더 표시
- **교사 목록에 이름 표시** — 이메일 옆에 사용자명 표시, API에 name 필드 추가
- **OpenAI 이미지 생성 제거** — 이미지는 Gemini 전용, ChatGPT 뱃지에서 이미지 아이콘 제거
- **ChatGPT 채팅은 유지** — 텍스트/비전 기능은 정상 사용 (4종 AI 체제 유지)

---

### 🔧 인프라 & 배포

- **Zod 입력 검증** (`server/middleware/validate.js`) — 채팅/이미지/업로드 요청 스키마 검증
- **Railway 프록시 호환** — `trust proxy`, `validate: false`, Zod optional 처리
- **CI/CD 파이프라인** — GitHub Actions (Lint → Build → Test → Security Audit)
- **pre-commit hook** — Husky + lint-staged (ESLint + Prettier)
- **테스트 인프라** — Vitest + @testing-library

---

### 📁 변경 파일 요약

| 영역                | 변경 파일 수 | 주요 파일                                                  |
| ------------------- | ------------ | ---------------------------------------------------------- |
| 서버 미들웨어       | 4            | auth.js, validate.js, index.js                             |
| 서버 라우트         | 5            | chat.js, conversations.js, teacher.js, upload.js, image.js |
| 서버 프로바이더     | 4            | claude.js, openai.js, gemini.js, solar.js                  |
| 서버 유틸           | 3            | retry.js (신규), apiKeys.js, shared.js                     |
| DB                  | 1            | database.js                                                |
| 클라이언트 컴포넌트 | 6            | MessageList.jsx, MessageInput.jsx, ProviderSelector.jsx 등 |
| 클라이언트 Store    | 2            | chatStore.js, teacherStore.js                              |
| 클라이언트 설정     | 3            | App.jsx, vite.config.js, api.js                            |
| 인프라              | 8            | CI yml, ESLint, Prettier, Vitest, Husky 등                 |
| **합계**            | **53**       | **+6,177 / -1,198 줄**                                     |

---

### 스케일링 전후 비교

| 항목            | Before                      | After                     |
| --------------- | --------------------------- | ------------------------- |
| 인증 DB 조회    | 매 요청마다                 | 5분 캐시 (≈95% 히트)      |
| Rate Limit      | 글로벌 100/min              | 사용자별 500/min          |
| 대화 목록 쿼리  | N+1 서브쿼리                | LEFT JOIN + GROUP BY      |
| 사용량 업데이트 | SELECT+INSERT/UPDATE (race) | atomic upsert             |
| 파일 I/O        | 동기 (블로킹)               | 비동기 (논블로킹)         |
| 메시지 리렌더링 | 전체 (Math.random 키)       | 변경분만 (React.memo)     |
| 교사 코드 로딩  | 학생도 다운로드             | lazy load (학생 미포함)   |
| AI 호출 실패    | 즉시 에러                   | 지수 백오프 3회 재시도    |
| API 키 조회     | 매번 DB + 복호화            | 5분 캐시                  |
| SSE 에러        | 리소스 누수                 | AbortController + cleanup |

## [1.1.0] - 2026-03-25 — TTS + CI/CD

- TTS (음성 읽기) 기능 추가
- CI/CD 파이프라인 구축 (GitHub Actions + Husky)
- ESLint + Prettier + Vitest 설정

## [1.0.0] - 2026-03-24 — 초기 출시

- Claude, Gemini, ChatGPT, Solar 4종 AI 채팅
- Google OAuth 인증
- 교사 대시보드 (채팅 모니터링, 사용량 관리)
- 파일 첨부 + 이미지 생성
- Vercel + Railway 배포
