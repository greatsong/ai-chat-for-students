import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne, run, getSetting } from '../db/database.js';
import { transcribeAudio } from '../providers/openai.js';
import crypto from 'crypto';

const router = Router();

// POST /api/stt/transcribe
router.post('/transcribe', authenticate, async (req, res) => {
  const { audio, mimeType } = req.body;
  const userId = req.user.id;

  try {
    // 1. STT 활성화 확인 (교사/관리자는 항상 사용 가능)
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'admin';
    if (!isTeacher) {
      const sttEnabled = await getSetting('stt_enabled');
      if (!sttEnabled) {
        return res.status(403).json({ error: 'STT 기능이 비활성화되어 있습니다.' });
      }
    }

    // 2. 오디오 데이터 확인
    if (!audio) {
      return res.status(400).json({ error: '오디오 데이터가 필요합니다.' });
    }

    // 3. base64 → Buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // 4. 음성 인식
    const result = await transcribeAudio({
      audioBuffer,
      mimeType: mimeType || 'audio/webm',
    });

    // 5. 사용량 추적
    const today = new Date().toISOString().split('T')[0];
    const existingUsage = await queryOne(
      'SELECT id FROM usage_daily WHERE user_id = ? AND date = ? AND provider = ?',
      [userId, today, 'openai']
    );

    if (existingUsage) {
      await run(
        'UPDATE usage_daily SET stt_count = stt_count + 1, request_count = request_count + 1 WHERE user_id = ? AND date = ? AND provider = ?',
        [userId, today, 'openai']
      );
    } else {
      await run(
        'INSERT INTO usage_daily (id, user_id, date, provider, input_tokens, output_tokens, request_count, stt_count) VALUES (?, ?, ?, ?, 0, 0, 1, 1)',
        [crypto.randomUUID(), userId, today, 'openai']
      );
    }

    res.json({ text: result.text });
  } catch (error) {
    console.error('STT 변환 오류:', error);
    res.status(500).json({ error: error.message || '음성 인식 중 오류가 발생했습니다.' });
  }
});

export default router;
