import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne, run, getSetting } from '../db/database.js';
import { generateSpeech } from '../providers/openai.js';
import crypto from 'crypto';

const router = Router();

// POST /api/tts/generate
router.post('/generate', authenticate, async (req, res) => {
  const { text, voice, model } = req.body;
  const userId = req.user.id;

  try {
    // 1. TTS 활성화 확인
    const ttsEnabled = await getSetting('tts_enabled');
    if (!ttsEnabled) {
      return res.status(403).json({ error: 'TTS 기능이 비활성화되어 있습니다.' });
    }

    // 2. 텍스트 확인
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: '읽을 텍스트가 필요합니다.' });
    }

    if (text.length > 4096) {
      return res.status(400).json({ error: '텍스트는 4096자 이하여야 합니다.' });
    }

    // 3. 음성 합성
    const result = await generateSpeech({
      text: text.trim(),
      voice: voice || 'alloy',
      model: model || 'tts-1',
    });

    const audioUrl = `data:${result.mimeType};base64,${result.audioData}`;

    // 4. 사용량 추적
    const today = new Date().toISOString().split('T')[0];
    const existingUsage = await queryOne(
      'SELECT id FROM usage_daily WHERE user_id = ? AND date = ? AND provider = ?',
      [userId, today, 'openai']
    );

    if (existingUsage) {
      await run(
        'UPDATE usage_daily SET tts_count = tts_count + 1, request_count = request_count + 1 WHERE user_id = ? AND date = ? AND provider = ?',
        [userId, today, 'openai']
      );
    } else {
      await run(
        'INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count, tts_count) VALUES (?, ?, ?, ?, 0, 0, 1, 1)',
        [crypto.randomUUID(), userId, today, 'openai']
      );
    }

    res.json({ audioUrl });
  } catch (error) {
    console.error('TTS 생성 오류:', error);
    res.status(500).json({ error: error.message || 'TTS 생성 중 오류가 발생했습니다.' });
  }
});

export default router;
