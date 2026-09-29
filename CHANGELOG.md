# Changelog

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
