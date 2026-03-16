import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne, queryAll, run } from '../db/database.js';
import crypto from 'crypto';

const router = Router();

// GET /api/conversations - 사용자의 대화 목록 조회 (최신순, 최대 50개)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await queryAll(
      `SELECT
        c.id, c.title, c.provider, c.model, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
      LIMIT 50`,
      [userId]
    );

    // last_message를 미리보기용으로 잘라서 반환
    const result = conversations.map((conv) => ({
      ...conv,
      last_message: conv.last_message ? conv.last_message.slice(0, 100) : null,
    }));

    res.json(result);
  } catch (error) {
    console.error('대화 목록 조회 오류:', error);
    res.status(500).json({ error: '대화 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

// GET /api/conversations/:id - 특정 대화의 메시지 목록 조회
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const convId = req.params.id;

    // 대화 조회 (소유자 또는 교사)
    let conversation;
    if (req.user.role === 'teacher') {
      conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [convId]);
    } else {
      conversation = await queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [convId, userId]);
    }

    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    // 메시지 조회
    const messages = await queryAll(
      'SELECT id, role, content, files, input_tokens, output_tokens, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId]
    );

    // files 필드 파싱
    const parsedMessages = messages.map((msg) => {
      let files = [];
      try {
        files = msg.files ? JSON.parse(msg.files) : [];
      } catch {
        // 파싱 실패 시 빈 배열
      }
      return {
        ...msg,
        files,
      };
    });

    res.json({
      conversation,
      messages: parsedMessages,
    });
  } catch (error) {
    console.error('대화 조회 오류:', error);
    res.status(500).json({ error: '대화를 불러오는 중 오류가 발생했습니다.' });
  }
});

// POST /api/conversations - 새 대화 생성
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, provider = 'claude', model = 'claude-sonnet-4-6' } = req.body;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run(
      'INSERT INTO conversations (id, user_id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, title || '새 대화', provider, model, now, now]
    );

    const conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('대화 생성 오류:', error);
    res.status(500).json({ error: '대화를 생성하는 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/conversations/:id - 대화 제목 수정
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const convId = req.params.id;
    const { title } = req.body;

    const conversation = await queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [convId, userId]);
    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const now = new Date().toISOString();
    await run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [title, now, convId]);

    const updated = await queryOne('SELECT * FROM conversations WHERE id = ?', [convId]);
    res.json(updated);
  } catch (error) {
    console.error('대화 수정 오류:', error);
    res.status(500).json({ error: '대화를 수정하는 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/conversations/:id - 대화 삭제 (소유자 또는 교사만 가능)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const convId = req.params.id;

    // 소유자 또는 교사 확인
    let conversation;
    if (req.user.role === 'teacher') {
      conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [convId]);
    } else {
      conversation = await queryOne('SELECT * FROM conversations WHERE id = ? AND user_id = ?', [convId, userId]);
    }

    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    // 메시지 먼저 삭제 (외래 키 제약)
    await run('DELETE FROM messages WHERE conversation_id = ?', [convId]);
    await run('DELETE FROM conversations WHERE id = ?', [convId]);

    res.json({ message: '대화가 삭제되었습니다.' });
  } catch (error) {
    console.error('대화 삭제 오류:', error);
    res.status(500).json({ error: '대화를 삭제하는 중 오류가 발생했습니다.' });
  }
});

export default router;
