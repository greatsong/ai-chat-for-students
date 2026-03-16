import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne, queryAll, run, getSetting } from '../db/database.js';
import crypto from 'crypto';
import { PROVIDERS } from '../../shared/index.js';

// 프로바이더 모듈 임포트
import * as claude from '../providers/claude.js';
import * as gemini from '../providers/gemini.js';
import * as openai from '../providers/openai.js';
import * as solar from '../providers/solar.js';

const router = Router();

const providers = { claude, gemini, openai, solar };

const NOW = "datetime('now')";

// POST /api/chat
router.post('/', authenticate, async (req, res) => {
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
      return res.status(400).json({ error: `${provider}는 현재 비활성화된 AI 프로바이더입니다.` });
    }

    // 2. 프로바이더 모듈 확인
    const providerModule = providers[provider];
    if (!providerModule) {
      return res.status(400).json({ error: `${provider}는 지원되지 않는 AI 프로바이더입니다.` });
    }

    // 3. 일일 사용량 확인
    const today = new Date().toISOString().split('T')[0];
    const dailyLimit = req.user.daily_limit || 100000;

    const usage = await queryOne(
      'SELECT SUM(input_tokens + output_tokens) as total_tokens FROM usage_daily WHERE user_id = ? AND date = ?',
      [userId, today]
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
        [convId, userId, title, provider, model || 'claude-sonnet-4-6', now, now]
      );
    } else {
      // 대화 소유권 확인
      const conv = await queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [convId, userId]);
      if (!conv) {
        return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      }
    }

    // 5. 사용자 메시지 저장
    const userMsgId = crypto.randomUUID();
    await run(
      'INSERT INTO messages (id, conversation_id, role, content, files, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userMsgId, convId, 'user', message, JSON.stringify(files || []), now]
    );

    // 6. 대화 기록 조회 (메시지 배열 구성)
    const history = await queryAll(
      'SELECT role, content, files FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId]
    );

    // 7. SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // conversationId를 클라이언트에 전달 (새 대화 생성 시 필요)
    res.write(`data: ${JSON.stringify({ type: 'conversationId', conversationId: convId })}\n\n`);

    // 8. 프로바이더별 메시지 빌드 및 스트리밍 처리
    const systemPrompt = (await getSetting('system_prompt')) || '';
    const providerMessages = providerModule.buildMessages(history);

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
            })}\n\n`
          );
          res.end();
          resolve(result);
        },
        onError: (error) => {
          reject(error);
        },
      });
    });

    // 9. 어시스턴트 메시지 저장
    const assistantMsgId = crypto.randomUUID();
    const doneAt = new Date().toISOString();
    await run(
      'INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [assistantMsgId, convId, 'assistant', result.fullContent, result.inputTokens, result.outputTokens, doneAt]
    );

    // 10. 일일 사용량 업데이트
    const existingUsage = await queryOne(
      'SELECT id FROM usage_daily WHERE user_id = ? AND date = ? AND provider = ?',
      [userId, today, provider]
    );

    if (existingUsage) {
      await run(
        'UPDATE usage_daily SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, request_count = request_count + 1 WHERE user_id = ? AND date = ? AND provider = ?',
        [result.inputTokens, result.outputTokens, userId, today, provider]
      );
    } else {
      await run(
        'INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), userId, today, provider, result.inputTokens, result.outputTokens]
      );
    }

    // 11. 첫 번째 메시지인 경우 대화 제목 업데이트
    const messageCount = await queryOne(
      "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = 'user'",
      [convId]
    );
    if (messageCount?.cnt === 1) {
      const title = (message || '').slice(0, 50) || '새 대화';
      await run('UPDATE conversations SET title = ? WHERE id = ?', [title, convId]);
    }

    // 12. 대화 updated_at 업데이트
    await run('UPDATE conversations SET updated_at = ? WHERE id = ?', [doneAt, convId]);
  } catch (error) {
    console.error('채팅 오류:', error);

    // SSE 헤더가 이미 전송된 경우 에러 이벤트 전송
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: error.message || 'AI 응답 중 오류가 발생했습니다.' })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ error: error.message || 'AI 응답 중 오류가 발생했습니다.' });
    }
  }
});

export default router;
