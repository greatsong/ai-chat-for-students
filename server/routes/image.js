import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, imageGenerateSchema } from '../middleware/validate.js';
import { queryOne, run, getSetting } from '../db/database.js';
import { generateImage as geminiGenerateImage } from '../providers/gemini.js';
import crypto from 'crypto';

const router = Router();

// POST /api/image/generate
router.post('/generate', authenticate, validate(imageGenerateSchema), async (req, res) => {
  const { prompt, conversationId } = req.body;
  const provider = 'gemini';
  const userId = req.user.id;

  try {
    // 1. 교사/관리자 권한 확인 (이미지 생성은 교사/관리자만 가능)
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '이미지 생성은 교사/관리자만 사용할 수 있습니다.' });
    }

    // 2. 이미지 생성 (Gemini만 지원)
    const result = await geminiGenerateImage({ prompt });

    const imageUrl = `data:${result.mimeType};base64,${result.imageData}`;

    // 5. 대화에 메시지 저장 (conversationId가 있는 경우)
    if (conversationId) {
      // 대화 소유권 확인
      const conv = await queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [
        conversationId,
        userId,
      ]);
      if (conv) {
        // 사용자 요청 메시지 저장
        const now = new Date().toISOString();
        const userMsgId = crypto.randomUUID();
        await run(
          'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [userMsgId, conversationId, 'user', `[이미지 생성 요청] ${prompt}`, now],
        );

        // AI 응답 메시지 저장 (이미지 URL 포함)
        const assistantMsgId = crypto.randomUUID();
        await run(
          'INSERT INTO messages (id, conversation_id, role, content, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [assistantMsgId, conversationId, 'assistant', '이미지가 생성되었습니다.', imageUrl, now],
        );

        // 대화 updated_at 업데이트
        await run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
      }
    }

    // 6. 일일 사용량 업데이트 (image_count)
    const today = new Date().toISOString().split('T')[0];
    const existingUsage = await queryOne(
      'SELECT id FROM usage_daily WHERE user_id = ? AND date = ? AND provider = ?',
      [userId, today, provider],
    );

    if (existingUsage) {
      await run(
        'UPDATE usage_daily SET image_count = image_count + 1, request_count = request_count + 1 WHERE user_id = ? AND date = ? AND provider = ?',
        [userId, today, provider],
      );
    } else {
      await run(
        'INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count, image_count) VALUES (?, ?, ?, ?, 0, 0, 1, 1)',
        [crypto.randomUUID(), userId, today, provider],
      );
    }

    res.json({ imageUrl });
  } catch (error) {
    console.error('이미지 생성 오류:', error);
    res.status(500).json({ error: error.message || '이미지 생성 중 오류가 발생했습니다.' });
  }
});

export default router;
