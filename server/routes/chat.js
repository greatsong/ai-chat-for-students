import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActive } from '../middleware/auth.js';
import { validate, chatSchema } from '../middleware/validate.js';
import { queryOne, queryAll, run, getSetting } from '../db/database.js';
import crypto from 'crypto';
import { PROVIDERS } from '../utils/shared.js';
import { fetchUrlsFromMessage } from '../utils/fetchUrl.js';
import { trimHistoryByTokens } from '../utils/tokenEstimator.js';
import { summarizeMessages } from '../utils/summarizer.js';

// 프로바이더 모듈 임포트
import * as claude from '../providers/claude.js';
import * as gemini from '../providers/gemini.js';
import * as openai from '../providers/openai.js';
import * as solar from '../providers/solar.js';

const router = Router();

const providers = { claude, gemini, openai, solar };

const NOW = "datetime('now')";

// AI 컨텍스트에 전달할 최대 메시지 수
const MAX_HISTORY_MESSAGES = 50;

// 채팅 Rate Limiting — 인증 후 적용되므로 req.user.id 사용 가능
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// POST /api/chat
router.post(
  '/',
  authenticate,
  requireActive,
  chatLimiter,
  validate(chatSchema),
  async (req, res) => {
    const {
      conversationId,
      message,
      provider = 'claude',
      model,
      files,
      web_search = false,
      code_execution = false,
    } = req.body;
    const userId = req.user.id;

    try {
      // 1. 프로바이더 활성화 확인
      const enabledProviders = (await getSetting('enabled_providers')) || ['claude'];
      if (!enabledProviders.includes(provider)) {
        return res
          .status(400)
          .json({ error: `${provider}는 현재 비활성화된 AI 프로바이더입니다.` });
      }

      // 2. 프로바이더 모듈 확인
      const providerModule = providers[provider];
      if (!providerModule) {
        return res.status(400).json({ error: `${provider}는 지원되지 않는 AI 프로바이더입니다.` });
      }

      // 2-1. 모델 허용목록 검증 (model이 지정된 경우)
      if (model) {
        const enabledModels = (await getSetting('enabled_models')) || {};
        const allowedModels = enabledModels[provider];
        if (
          Array.isArray(allowedModels) &&
          allowedModels.length > 0 &&
          !allowedModels.includes(model)
        ) {
          return res.status(400).json({ error: `${model}은(는) 현재 허용되지 않은 모델입니다.` });
        }
      }

      // 3. 일일 사용량 확인 (atomic upsert로 race condition 방지)
      const today = new Date().toISOString().split('T')[0];
      const dailyLimit = req.user.daily_limit || 100000;

      const usage = await queryOne(
        'SELECT SUM(input_tokens + output_tokens) as total_tokens FROM usage_daily WHERE user_id = ? AND date = ?',
        [userId, today],
      );

      const totalUsed = usage?.total_tokens || 0;
      if (totalUsed >= dailyLimit) {
        return res.status(429).json({
          error: '오늘의 사용량 한도에 도달했습니다. 내일 다시 시도해주세요.',
          usage: { used: totalUsed, limit: dailyLimit },
        });
      }

      // 4. 대화 생성 또는 확인
      let convId = conversationId;
      const now = new Date().toISOString();

      if (!convId) {
        convId = crypto.randomUUID();
        const title = (message || '').slice(0, 50) || '새 대화';
        await run(
          'INSERT INTO conversations (id, user_id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [convId, userId, title, provider, model || 'claude-sonnet-4-6', now, now],
        );
      } else {
        // 대화 소유권 확인
        const conv = await queryOne('SELECT id FROM conversations WHERE id = ? AND user_id = ?', [
          convId,
          userId,
        ]);
        if (!conv) {
          return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
        }
      }

      // 5. 교사/관리자: URL 내용 자동 가져오기 (백그라운드, 응답 차단하지 않음)
      let enrichedMessage = message;
      const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
      if (isTeacherOrAdmin && message) {
        try {
          const urlContext = await fetchUrlsFromMessage(message);
          if (urlContext) {
            enrichedMessage = message + urlContext;
            console.log(`[chat] URL 내용 가져옴 (${urlContext.length}자 추가)`);
          }
        } catch (err) {
          console.error('[chat] URL 가져오기 실패:', err.message);
        }
      }

      // 6. 사용자 메시지 저장 (enrichedMessage에 URL 내용 포함)
      const userMsgId = crypto.randomUUID();
      const filesJson = JSON.stringify(files || []);
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[chat] 파일 ${files?.length || 0}개 수신:`,
          files?.map((f) => ({ name: f.name, type: f.type })),
        );
      }
      await run(
        'INSERT INTO messages (id, conversation_id, role, content, files, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userMsgId, convId, 'user', enrichedMessage, filesJson, now],
      );

      // 7. 대화 기록 조회 (최근 MAX_HISTORY_MESSAGES개만 — AI 컨텍스트 제한)
      const history = await queryAll(
        `SELECT role, content, files FROM messages WHERE conversation_id = ?
       ORDER BY created_at DESC LIMIT ?`,
        [convId, MAX_HISTORY_MESSAGES],
      );
      // DESC로 가져온 후 시간순으로 다시 정렬
      history.reverse();

      // 토큰 기반 히스토리 트리밍 — 컨텍스트 윈도우 초과 방지
      const selectedModel = model || providerModule.buildMessages.defaultModel;
      const { trimmedHistory, trimmedCount, totalEstimatedTokens, droppedMessages } =
        trimHistoryByTokens(history, provider, selectedModel);

      // 트리밍된 메시지를 AI로 요약 (맥락 유지)
      let conversationSummary = null;
      if (droppedMessages.length > 0) {
        try {
          conversationSummary = await summarizeMessages(droppedMessages, provider);
        } catch (err) {
          console.warn(`[chat] 요약 생성 실패, 기존 방식으로 진행: ${err.message}`);
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        const filesInHistory = trimmedHistory.filter((m) => {
          try {
            const f = JSON.parse(m.files);
            return f.length > 0;
          } catch {
            return false;
          }
        });
        console.log(
          `[chat] 히스토리 ${history.length}개 중 ${trimmedHistory.length}개 사용 (${trimmedCount}개 트리밍), 추정 ${totalEstimatedTokens} 토큰, 파일 포함 ${filesInHistory.length}개${conversationSummary ? ', 요약 생성됨' : ''}`,
        );
      }

      // 8. SSE 헤더 설정
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // conversationId를 클라이언트에 전달 (새 대화 생성 시 필요)
      res.write(`data: ${JSON.stringify({ type: 'conversationId', conversationId: convId })}\n\n`);

      // 트리밍된 경우 클라이언트에 경고 전송
      if (trimmedCount > 0) {
        res.write(
          `data: ${JSON.stringify({
            type: 'context_trimmed',
            trimmedCount,
            totalMessages: history.length,
            usedMessages: trimmedHistory.length,
            estimatedTokens: totalEstimatedTokens,
            hasSummary: !!conversationSummary,
          })}\n\n`,
        );
      }

      // 9. 프로바이더별 메시지 빌드 및 스트리밍 처리
      // 교사/관리자는 시스템 프롬프트 없이 자유롭게 사용
      let systemPrompt =
        req.user.role === 'teacher' || req.user.role === 'admin' || req.user.chat_mode === 'project'
          ? ''
          : (await getSetting('system_prompt')) || '';

      // 대화 요약이 있으면 시스템 프롬프트에 삽입
      if (conversationSummary) {
        const summaryBlock = `[이전 대화 요약]\n${conversationSummary}\n\n위 내용은 이전 대화를 요약한 것입니다. 이 맥락을 참고하여 현재 대화를 이어가세요.`;
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${summaryBlock}` : summaryBlock;
      }

      const providerMessages = providerModule.buildMessages(trimmedHistory);

      // 프로바이더별 기능 플래그 확인
      const providerFeatures = PROVIDERS[provider]?.features || {};
      const options = {};
      if (web_search && providerFeatures.webSearch) {
        options.webSearch = true;
      }
      if (code_execution && providerFeatures.codeExecution) {
        options.codeExecution = true;
      }

      const result = await new Promise((resolve, reject) => {
        providerModule.streamChat({
          messages: providerMessages,
          systemPrompt,
          model,
          options,
          onText: (text) => {
            res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
          },
          onDone: (result) => {
            res.write(
              `data: ${JSON.stringify({
                type: 'done',
                usage: { input: result.inputTokens, output: result.outputTokens },
              })}\n\n`,
            );
            res.end();
            resolve(result);
          },
          onError: (error) => {
            reject(error);
          },
        });
      });

      // 10. 어시스턴트 메시지 저장
      const assistantMsgId = crypto.randomUUID();
      const doneAt = new Date().toISOString();
      await run(
        'INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          assistantMsgId,
          convId,
          'assistant',
          result.fullContent,
          result.inputTokens,
          result.outputTokens,
          doneAt,
        ],
      );

      // 11. 일일 사용량 업데이트 (INSERT OR로 atomic upsert — race condition 방지)
      await run(
        `INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, date, provider) DO UPDATE SET
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         request_count = request_count + 1`,
        [crypto.randomUUID(), userId, today, provider, result.inputTokens, result.outputTokens],
      );

      // 12. 첫 번째 메시지인 경우 대화 제목 업데이트
      const messageCount = await queryOne(
        "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = 'user'",
        [convId],
      );
      if (messageCount?.cnt === 1) {
        const title = (message || '').slice(0, 50) || '새 대화';
        await run('UPDATE conversations SET title = ? WHERE id = ?', [title, convId]);
      }

      // 13. 대화 updated_at 업데이트
      await run('UPDATE conversations SET updated_at = ? WHERE id = ?', [doneAt, convId]);
    } catch (error) {
      console.error('채팅 오류:', error);

      // 프로덕션에서는 내부 에러 메시지 노출 방지
      const safeMessage =
        process.env.NODE_ENV === 'production'
          ? 'AI 응답 중 오류가 발생했습니다.'
          : error.message || 'AI 응답 중 오류가 발생했습니다.';

      // SSE 헤더가 이미 전송된 경우 에러 이벤트 전송
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: safeMessage })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: safeMessage });
      }
    }
  },
);

export default router;
