# Changelog

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
