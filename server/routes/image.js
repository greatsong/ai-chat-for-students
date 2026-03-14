import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne, run, getSetting } from '../db/database.js';
import { generateImage as geminiGenerateImage } from '../providers/gemini.js';
import { generateImage as openaiGenerateImage } from '../providers/openai.js';
import crypto from 'crypto';

const router = Router();

// POST /api/image/generate
router.post('/generate', authenticate, async (req, res) => {
  const { prompt, provider = 'gemini', conversationId } = req.body;
  const userId = req.user.id;

  try {
    // 1. 이미지 생성 기능 활성화 확인
    const imageEnabled = getSetting('image_generation_enabled');
    if (!imageEnabled) {
      return res.status(403).json({ error: '이미지 생성 기능이 비활성화되어 있습니다.' });
    }

    // 2. 프롬프트 확인
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: '이미지 생성 프롬프트가 필요합니다.' });
    }

    // 3. 지원 프로바이더 확인
    if (!['gemini', 'openai'].includes(provider)) {
      return res.status(400).json({ error: '이미지 생성은 Gemini 또는 OpenAI만 지원됩니다.' });
    }

    // 4. 이미지 생성
    let result;
    if (provider === 'gemini') {
      result = await geminiGenerateImage({ prompt });
    } else {
      result = await openaiGenerateImage({ prompt });
    }

    const imageUrl = `data:${result.mimeType};base64,${result.imageData}`;

    // 5. 대화에 메시지 저장 (conversationId가 있는 경우)
    if (conversationId) {
      // 대화 소유권 확인
      const conv = queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
      if (conv) {
        // 사용자 요청 메시지 저장
        const userMsgId = crypto.randomUUID();
        run(
          'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
          [userMsgId, conversationId, 'user', `[이미지 생성 요청] ${prompt}`]
        );

        // AI 응답 메시지 저장 (이미지 URL 포함)
        const assistantMsgId = crypto.randomUUID();
        run(
          'INSERT INTO messages (id, conversation_id, role, content, image_url, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
          [assistantMsgId, conversationId, 'assistant', '이미지가 생성되었습니다.', imageUrl]
        );

        // 대화 updated_at 업데이트
        run('UPDATE conversations SET updated_at = datetime("now") WHERE id = ?', [conversationId]);
      }
    }

    // 6. 일일 사용량 업데이트 (image_count)
    const today = new Date().toISOString().split('T')[0];
    const existingUsage = queryOne(
      'SELECT id FROM usage_daily WHERE user_id = ? AND date = ? AND provider = ?',
      [userId, today, provider]
    );

    if (existingUsage) {
      run(
        'UPDATE usage_daily SET image_count = image_count + 1, request_count = request_count + 1 WHERE user_id = ? AND date = ? AND provider = ?',
        [userId, today, provider]
      );
    } else {
      run(
        'INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count, image_count) VALUES (?, ?, ?, ?, 0, 0, 1, 1)',
        [crypto.randomUUID(), userId, today, provider]
      );
    }

    res.json({ imageUrl });
  } catch (error) {
    console.error('이미지 생성 오류:', error);
    res.status(500).json({ error: error.message || '이미지 생성 중 오류가 발생했습니다.' });
  }
});

export default router;
