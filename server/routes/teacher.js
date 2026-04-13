import { Router } from 'express';
import {
  authenticate,
  requireTeacher,
  requireAdmin,
  invalidateUserCache,
} from '../middleware/auth.js';
import { queryAll, queryOne, run, getSetting, setSetting } from '../db/database.js';
import { encrypt, decrypt, encryptApiKeys, decryptApiKeys } from '../utils/crypto.js';
import {
  validate,
  studentUpdateSchema,
  apiKeyUpdateSchema,
  teacherEmailSchema,
  conversationsQuerySchema,
  bulkActivateSchema,
  usageQuerySchema,
  settingsPutSchema,
  conversationIdParamSchema,
} from '../middleware/validate.js';
import { auditLog } from '../utils/logger.js';
import { clearKeyCache } from '../utils/apiKeys.js';

const router = Router();

// 환경변수 교사 이메일 목록 (삭제 불가)
const ENV_TEACHER_EMAILS = (process.env.TEACHER_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// ──────────────────────────────────────────
// GET /api/teacher/public-settings
// 모든 인증된 사용자가 접근 가능한 공개 설정 (TTS/STT 활성화 상태 등)
// ──────────────────────────────────────────
router.get('/public-settings', async (req, res) => {
  try {
    const publicKeys = [
      'tts_enabled',
      'stt_enabled',
      'tts_default_voice',
      'tts_default_model',
      'enabled_providers',
      'enabled_models',
      'available_models',
    ];
    const result = {};
    for (const key of publicKeys) {
      result[key] = await getSetting(key);
    }
    res.json(result);
  } catch (error) {
    console.error('공개 설정 조회 오류:', error);
    res.status(500).json({ error: '설정을 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/my-usage
// 현재 사용자 본인의 사용량 (교사 + 관리자)
// ──────────────────────────────────────────
router.get('/my-usage', requireTeacher, async (req, res) => {
  try {
    const userId = req.user.id;

    // 요약 (전체 기간)
    const summary = await queryOne(
      `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
        COALESCE(SUM(output_tokens), 0) AS totalOutputTokens,
        COALESCE(SUM(request_count), 0) AS totalRequests,
        COALESCE(SUM(image_count), 0) AS totalImages,
        COALESCE(SUM(tts_count), 0) AS totalTts,
        COALESCE(SUM(stt_count), 0) AS totalStt
      FROM usage_daily
      WHERE user_id = ?
    `,
      [userId],
    );

    // 일별 사용량 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const daily = await queryAll(
      `
      SELECT
        date,
        provider,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(request_count), 0) AS requests,
        COALESCE(SUM(image_count), 0) AS images
      FROM usage_daily
      WHERE user_id = ? AND date >= ?
      GROUP BY date, provider
      ORDER BY date ASC
    `,
      [userId, thirtyDaysAgoStr],
    );

    res.json({
      summary: summary || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        totalImages: 0,
        totalTts: 0,
        totalStt: 0,
      },
      daily,
    });
  } catch (error) {
    console.error('내 사용량 조회 오류:', error);
    res.status(500).json({ error: '사용량을 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/students
// 학생 목록 + 오늘의 사용량 통계 (관리자 전용)
// ──────────────────────────────────────────
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const users = await queryAll(
      `
      SELECT
        u.id, u.name, u.email, u.avatar, u.role, u.is_active, u.daily_limit,
        u.chat_mode, u.classroom_id, u.created_at,
        COALESCE(SUM(ud.input_tokens), 0)  AS today_input_tokens,
        COALESCE(SUM(ud.output_tokens), 0) AS today_output_tokens,
        COALESCE(SUM(ud.request_count), 0) AS today_requests,
        COALESCE(conv_stats.conv_count, 0) AS total_conversations,
        COALESCE(usage_stats.total_tokens, 0) AS total_tokens
      FROM users u
      LEFT JOIN usage_daily ud ON ud.user_id = u.id AND ud.date = ?
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS conv_count
        FROM conversations
        GROUP BY user_id
      ) conv_stats ON conv_stats.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(input_tokens) + SUM(output_tokens) AS total_tokens
        FROM usage_daily
        GROUP BY user_id
      ) usage_stats ON usage_stats.user_id = u.id
      GROUP BY u.id
      ORDER BY u.role ASC, u.created_at DESC
      LIMIT 1000
    `,
      [today],
    );

    res.json(users);
  } catch (error) {
    console.error('학생 목록 조회 오류:', error);
    res.status(500).json({ error: '학생 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// PATCH /api/teacher/students/:id
// 학생 정보 수정 (활성화 상태, 일일 한도) (관리자 전용)
// ──────────────────────────────────────────
router.patch('/students/:id', requireAdmin, validate(studentUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, daily_limit, chat_mode } = req.body;

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const updates = [];
    const params = [];

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (daily_limit !== undefined) {
      updates.push('daily_limit = ?');
      params.push(daily_limit);
    }
    if (chat_mode !== undefined) {
      updates.push('chat_mode = ?');
      params.push(chat_mode);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    params.push(id);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    invalidateUserCache(id);

    const updated = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('학생 정보 수정 오류:', error);
    res.status(500).json({ error: '학생 정보를 수정하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// POST /api/teacher/students/bulk-activate
// 여러 학생 일괄 활성화 (관리자 전용)
// ──────────────────────────────────────────
router.post(
  '/students/bulk-activate',
  requireAdmin,
  validate(bulkActivateSchema),
  async (req, res) => {
    try {
      const { studentIds } = req.body;

      const placeholders = studentIds.map(() => '?').join(', ');
      await run(
        `UPDATE users SET is_active = 1 WHERE id IN (${placeholders}) AND role = 'student'`,
        studentIds,
      );
      studentIds.forEach((id) => invalidateUserCache(id));

      res.json({
        message: `${studentIds.length}명의 학생이 활성화되었습니다.`,
        count: studentIds.length,
      });
    } catch (error) {
      console.error('일괄 활성화 오류:', error);
      res.status(500).json({ error: '학생을 활성화하는 중 오류가 발생했습니다.' });
    }
  },
);

// ──────────────────────────────────────────
// GET /api/teacher/conversations
// 전체 학생 대화 목록 (필터링 + 페이지네이션) (관리자 전용)
// ──────────────────────────────────────────
router.get(
  '/conversations',
  requireAdmin,
  validate(conversationsQuerySchema, 'query'),
  async (req, res) => {
    try {
      const { userId, search, page = 1, limit = 20 } = req.validatedQuery || req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let where = ["u.role = 'student'"]; // 교사/관리자 채팅은 수집하지 않음
      let params = [];

      if (userId) {
        where.push('c.user_id = ?');
        params.push(userId);
      }

      if (search) {
        where.push('(c.title LIKE ? OR u.name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = `WHERE ${where.join(' AND ')}`;

      // 전체 개수
      const countRow = await queryOne(
        `SELECT COUNT(*) AS total FROM conversations c
       JOIN users u ON u.id = c.user_id
       ${whereClause}`,
        params,
      );
      const total = countRow?.total || 0;

      // 대화 목록
      const conversations = await queryAll(
        `SELECT
        c.id, c.user_id, c.title, c.provider, c.model, c.created_at, c.updated_at,
        u.name AS student_name, u.email AS student_email, u.chat_mode AS student_mode,
        COALESCE(msg_stats.msg_count, 0) AS message_count,
        msg_stats.last_content AS last_message
      FROM conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN (
        SELECT
          conversation_id,
          COUNT(*) AS msg_count,
          (SELECT content FROM messages m2 WHERE m2.conversation_id = messages.conversation_id ORDER BY m2.created_at DESC LIMIT 1) AS last_content
        FROM messages
        GROUP BY conversation_id
      ) msg_stats ON msg_stats.conversation_id = c.id
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset],
      );

      const result = conversations.map((conv) => ({
        ...conv,
        last_message: conv.last_message ? conv.last_message.slice(0, 150) : null,
      }));

      res.json({
        conversations: result,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('대화 목록 조회 오류:', error);
      res.status(500).json({ error: '대화 목록을 불러오는 중 오류가 발생했습니다.' });
    }
  },
);

// ──────────────────────────────────────────
// GET /api/teacher/conversations/export
// 대화 목록 CSV 내보내기 (관리자 전용)
// ──────────────────────────────────────────
router.get('/conversations/export', requireAdmin, async (req, res) => {
  try {
    const { userId, search } = req.query;

    let where = ["u.role = 'student'"];
    let params = [];

    if (userId) {
      where.push('c.user_id = ?');
      params.push(userId);
    }
    if (search) {
      where.push('(c.title LIKE ? OR u.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const conversations = await queryAll(
      `SELECT
        u.name AS student_name, u.email AS student_email, u.chat_mode AS student_mode,
        c.title, c.provider, c.model, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
      FROM conversations c
      JOIN users u ON u.id = c.user_id
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT 5000`,
      params,
    );

    // CSV 생성 (한글 BOM 포함)
    const BOM = '\uFEFF';
    const header = '학생이름,학생이메일,대화제목,AI모델,프로바이더,메시지수,생성일,마지막활동';
    const escCsv = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const rows = conversations.map((c) =>
      [
        escCsv(c.student_name),
        escCsv(c.student_email),
        escCsv(c.title),
        escCsv(c.model),
        escCsv(c.provider),
        c.message_count,
        escCsv(c.created_at),
        escCsv(c.updated_at),
      ].join(','),
    );

    const csv = BOM + header + '\n' + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"');
    res.send(csv);
  } catch (error) {
    console.error('대화 CSV 내보내기 오류:', error);
    res.status(500).json({ error: 'CSV 내보내기 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/conversations/:conversationId/messages
// 특정 대화의 전체 메시지 조회 (관리자 전용)
// ──────────────────────────────────────────
router.get(
  '/conversations/:conversationId/messages',
  requireAdmin,
  validate(conversationIdParamSchema, 'params'),
  async (req, res) => {
    try {
      const { conversationId } = req.params;

      const conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [
        conversationId,
      ]);
      if (!conversation) {
        return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      }

      // 교사/관리자의 대화는 본인만 열람 가능
      const owner = await queryOne('SELECT role FROM users WHERE id = ?', [conversation.user_id]);
      if (!owner) {
        return res.status(404).json({ error: '대화 소유자를 찾을 수 없습니다.' });
      }
      if (
        (owner.role === 'teacher' || owner.role === 'admin') &&
        conversation.user_id !== req.user.id
      ) {
        return res.status(403).json({ error: '교사의 채팅 기록은 본인만 열람할 수 있습니다.' });
      }

      const messages = await queryAll(
        `SELECT id, role, content, files, image_url, code_result, input_tokens, output_tokens, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 1000`,
        [conversationId],
      );

      // files JSON 파싱
      const parsedMessages = messages.map((msg) => {
        let files = [];
        try {
          files = msg.files ? JSON.parse(msg.files) : [];
        } catch {
          /* 무시 */
        }
        return { ...msg, files };
      });

      res.json({
        conversation,
        messages: parsedMessages,
      });
    } catch (error) {
      console.error('메시지 조회 오류:', error);
      res.status(500).json({ error: '메시지를 불러오는 중 오류가 발생했습니다.' });
    }
  },
);

// ──────────────────────────────────────────
// GET /api/teacher/usage
// 사용량 통계 (기간별) (관리자 전용)
// ──────────────────────────────────────────
router.get('/usage', requireAdmin, validate(usageQuerySchema, 'query'), async (req, res) => {
  try {
    const { period = 'today' } = req.validatedQuery || req.query;

    // 기간 계산
    let dateFilter;
    const isAll = period === 'all';
    const today = new Date().toISOString().slice(0, 10);

    if (isAll) {
      dateFilter = '2000-01-01'; // 사실상 전체 기간
    } else if (period === 'today') {
      dateFilter = today;
    } else if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      dateFilter = d.toISOString().slice(0, 10);
    } else if (period === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      dateFilter = d.toISOString().slice(0, 10);
    } else {
      dateFilter = today;
    }

    // 요약 (전체 사용자)
    const summary = await queryOne(
      `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
        COALESCE(SUM(output_tokens), 0) AS totalOutputTokens,
        COALESCE(SUM(request_count), 0) AS totalRequests,
        COALESCE(SUM(image_count), 0) AS totalImages,
        COALESCE(SUM(tts_count), 0) AS totalTts,
        COALESCE(SUM(stt_count), 0) AS totalStt,
        COUNT(DISTINCT user_id) AS activeStudents
      FROM usage_daily
      WHERE date >= ?
    `,
      [dateFilter],
    );

    // 사용자별 사용량 (교사 포함 — 채팅 내용만 비공개, 사용량은 관리자 열람 가능)
    const byStudent = await queryAll(
      `
      SELECT
        u.id AS userId,
        u.name, u.email,
        COALESCE(SUM(ud.input_tokens), 0) AS inputTokens,
        COALESCE(SUM(ud.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(ud.request_count), 0) AS requests
      FROM users u
      INNER JOIN usage_daily ud ON ud.user_id = u.id AND ud.date >= ?
      GROUP BY u.id, u.name, u.email
      ORDER BY (COALESCE(SUM(ud.input_tokens), 0) + COALESCE(SUM(ud.output_tokens), 0)) DESC
      LIMIT 500
    `,
      [dateFilter],
    );

    // 프로바이더별 사용량
    const byProvider = await queryAll(
      `
      SELECT
        provider,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(request_count), 0) AS requests
      FROM usage_daily
      WHERE date >= ?
      GROUP BY provider
      ORDER BY (COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0)) DESC
      LIMIT 50
    `,
      [dateFilter],
    );

    // 일별 사용량 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const daily = await queryAll(
      `
      SELECT
        date,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(request_count), 0) AS requests
      FROM usage_daily
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
      LIMIT 90
    `,
      [thirtyDaysAgoStr],
    );

    res.json({
      summary: summary || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        totalImages: 0,
        totalTts: 0,
        totalStt: 0,
        activeStudents: 0,
      },
      byStudent,
      byProvider,
      daily,
    });
  } catch (error) {
    console.error('사용량 조회 오류:', error);
    res.status(500).json({ error: '사용량 통계를 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/settings
// 전체 설정 조회 (관리자 전용)
// ──────────────────────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const rows = await queryAll('SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    res.json(settings);
  } catch (error) {
    console.error('설정 조회 오류:', error);
    res.status(500).json({ error: '설정을 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// PUT /api/teacher/settings
// 설정 변경 (단일 또는 복수) (관리자 전용)
// ──────────────────────────────────────────
router.put('/settings', requireAdmin, validate(settingsPutSchema), async (req, res) => {
  try {
    const { key, value, settings } = req.body;

    const validKeys = [
      'enabled_providers',
      'enabled_models',
      'available_models',
      'image_generation_enabled',
      'image_models',
      'system_prompt',
      'default_daily_limit',
      'tts_enabled',
      'stt_enabled',
      'tts_default_voice',
      'tts_default_model',
    ];

    if (settings && typeof settings === 'object') {
      // 복수 설정 변경
      for (const [k, v] of Object.entries(settings)) {
        if (!validKeys.includes(k)) {
          return res.status(400).json({ error: `유효하지 않은 설정 키: ${k}` });
        }
        await setSetting(k, v);
      }
    } else if (key !== undefined) {
      // 단일 설정 변경
      if (!validKeys.includes(key)) {
        return res.status(400).json({ error: `유효하지 않은 설정 키: ${key}` });
      }
      await setSetting(key, value);
    } else {
      return res.status(400).json({ error: '설정 키/값이 필요합니다.' });
    }

    // 변경 후 전체 설정 반환
    const rows = await queryAll('SELECT key, value FROM settings');
    const allSettings = {};
    for (const row of rows) {
      try {
        allSettings[row.key] = JSON.parse(row.value);
      } catch {
        allSettings[row.key] = row.value;
      }
    }
    res.json(allSettings);
  } catch (error) {
    console.error('설정 변경 오류:', error);
    res.status(500).json({ error: '설정을 변경하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// DELETE /api/teacher/conversations/:conversationId
// 대화 삭제 (관리자 전용)
// ──────────────────────────────────────────
router.delete(
  '/conversations/:conversationId',
  requireAdmin,
  validate(conversationIdParamSchema, 'params'),
  async (req, res) => {
    try {
      const { conversationId } = req.params;

      const conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [
        conversationId,
      ]);
      if (!conversation) {
        return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      }

      // 교사/관리자의 대화는 본인만 삭제 가능
      const owner = await queryOne('SELECT role FROM users WHERE id = ?', [conversation.user_id]);
      if (
        owner &&
        (owner.role === 'teacher' || owner.role === 'admin') &&
        conversation.user_id !== req.user.id
      ) {
        return res.status(403).json({ error: '교사의 채팅 기록은 본인만 관리할 수 있습니다.' });
      }

      // 메시지 먼저 삭제 (외래 키 제약)
      await run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
      await run('DELETE FROM conversations WHERE id = ?', [conversationId]);

      auditLog('CONVERSATION_DELETE', req.user.id, {
        conversationId,
        ownerId: conversation.user_id,
      });
      res.json({ message: '대화가 삭제되었습니다.' });
    } catch (error) {
      console.error('대화 삭제 오류:', error);
      res.status(500).json({ error: '대화를 삭제하는 중 오류가 발생했습니다.' });
    }
  },
);

// ──────────────────────────────────────────
// GET /api/teacher/teachers
// 교사 이메일 목록 조회 (관리자 전용)
// ──────────────────────────────────────────
router.get('/teachers', requireAdmin, async (req, res) => {
  try {
    const dbEmails = (await getSetting('teacher_emails')) || [];
    const allEmails = [...ENV_TEACHER_EMAILS, ...(Array.isArray(dbEmails) ? dbEmails : [])];
    // 이메일에 해당하는 사용자 이름 조회
    const nameMap = {};
    if (allEmails.length > 0) {
      const placeholders = allEmails.map(() => '?').join(',');
      const users = await queryAll(
        `SELECT email, name FROM users WHERE email IN (${placeholders})`,
        allEmails,
      );
      users.forEach((u) => {
        nameMap[u.email] = u.name;
      });
    }
    res.json({
      dbEmails: Array.isArray(dbEmails) ? dbEmails : [],
      envEmails: ENV_TEACHER_EMAILS,
      nameMap,
    });
  } catch (error) {
    console.error('교사 목록 조회 오류:', error);
    res.status(500).json({ error: '교사 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// POST /api/teacher/teachers
// 교사 이메일 추가 (관리자 전용)
// ──────────────────────────────────────────
router.post('/teachers', requireAdmin, validate(teacherEmailSchema), async (req, res) => {
  try {
    const trimmedEmail = req.body.email.trim().toLowerCase();

    // DB 교사 이메일 목록에 추가
    const dbEmails = (await getSetting('teacher_emails')) || [];
    const emailList = Array.isArray(dbEmails) ? dbEmails : [];

    if (emailList.includes(trimmedEmail)) {
      return res.status(400).json({ error: '이미 등록된 교사 이메일입니다.' });
    }

    emailList.push(trimmedEmail);
    await setSetting('teacher_emails', emailList);

    // 해당 이메일의 기존 사용자가 있으면 역할을 teacher로 업데이트 + 자동 활성화
    const existingUser = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [
      trimmedEmail,
    ]);
    if (existingUser && existingUser.role !== 'admin') {
      await run('UPDATE users SET role = ?, is_active = 1 WHERE id = ?', [
        'teacher',
        existingUser.id,
      ]);
      invalidateUserCache(existingUser.id);
    }

    auditLog('TEACHER_ADD', req.user.id, { email: trimmedEmail });
    res.json({
      message: `${trimmedEmail} 교사로 등록되었습니다.`,
      dbEmails: emailList,
      envEmails: ENV_TEACHER_EMAILS,
    });
  } catch (error) {
    console.error('교사 추가 오류:', error);
    res.status(500).json({ error: '교사를 추가하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// DELETE /api/teacher/teachers
// 교사 이메일 삭제 (관리자 전용)
// 환경변수 교사는 삭제 불가
// ──────────────────────────────────────────
router.delete('/teachers', requireAdmin, validate(teacherEmailSchema), async (req, res) => {
  try {
    const trimmedEmail = req.body.email.trim().toLowerCase();

    // 환경변수 교사는 삭제 불가
    if (ENV_TEACHER_EMAILS.includes(trimmedEmail)) {
      return res.status(400).json({
        error: '환경변수로 등록된 교사는 삭제할 수 없습니다. 서버 설정에서 변경해주세요.',
      });
    }

    // DB 교사 이메일 목록에서 제거
    const dbEmails = (await getSetting('teacher_emails')) || [];
    const emailList = Array.isArray(dbEmails) ? dbEmails : [];
    const index = emailList.indexOf(trimmedEmail);

    if (index === -1) {
      return res.status(404).json({ error: '등록되지 않은 교사 이메일입니다.' });
    }

    emailList.splice(index, 1);
    await setSetting('teacher_emails', emailList);

    // 해당 이메일의 기존 사용자가 있으면 역할을 student로 변경
    const existingUser = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [
      trimmedEmail,
    ]);
    if (existingUser && existingUser.role === 'teacher') {
      await run('UPDATE users SET role = ? WHERE id = ?', ['student', existingUser.id]);
      invalidateUserCache(existingUser.id);
    }

    res.json({
      message: `${trimmedEmail} 교사 권한이 해제되었습니다.`,
      dbEmails: emailList,
      envEmails: ENV_TEACHER_EMAILS,
    });
  } catch (error) {
    console.error('교사 삭제 오류:', error);
    res.status(500).json({ error: '교사를 삭제하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/api-keys
// API 키 설정 조회 (관리자 전용, 마스킹된 형태)
// ──────────────────────────────────────────
router.get('/api-keys', requireAdmin, async (req, res) => {
  try {
    const dbKeys = (await getSetting('api_keys')) || {};

    // 암호화된 키를 복호화 후 마스킹하여 반환 (앞 8자만 표시)
    const masked = {};
    for (const [provider, key] of Object.entries(dbKeys)) {
      try {
        const decryptedKey = decrypt(key);
        if (decryptedKey && decryptedKey.length > 8) {
          masked[provider] =
            decryptedKey.slice(0, 8) + '•'.repeat(Math.min(decryptedKey.length - 8, 20));
        } else {
          masked[provider] = decryptedKey ? '••••••••' : '';
        }
      } catch {
        masked[provider] = key ? '••••••••' : '';
      }
    }

    // 환경변수 키도 마스킹하여 보여줌 (어떤 키가 설정되어 있는지 확인용)
    const envStatus = {
      anthropic: process.env.ANTHROPIC_API_KEY ? '환경변수 설정됨' : '미설정',
      google: process.env.GOOGLE_API_KEY ? '환경변수 설정됨' : '미설정',
      openai: process.env.OPENAI_API_KEY ? '환경변수 설정됨' : '미설정',
      upstage: process.env.UPSTAGE_API_KEY ? '환경변수 설정됨' : '미설정',
    };

    res.json({ dbKeys: masked, envStatus });
  } catch (error) {
    console.error('API 키 조회 오류:', error);
    res.status(500).json({ error: 'API 키를 조회하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// PUT /api/teacher/api-keys
// API 키 설정 변경 (관리자 전용)
// ──────────────────────────────────────────
router.put('/api-keys', requireAdmin, validate(apiKeyUpdateSchema), async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    const dbKeys = (await getSetting('api_keys')) || {};

    if (apiKey && apiKey.trim()) {
      // API 키를 AES-256-GCM으로 암호화하여 저장
      dbKeys[provider] = encrypt(apiKey.trim());
    } else {
      // 빈 값이면 해당 키 삭제 → 환경변수로 fallback
      delete dbKeys[provider];
    }

    await setSetting('api_keys', dbKeys);
    clearKeyCache(provider);

    auditLog('API_KEY_UPDATE', req.user.id, { provider, action: apiKey ? 'set' : 'delete' });
    res.json({ message: `${provider} API 키가 업데이트되었습니다.` });
  } catch (error) {
    console.error('API 키 변경 오류:', error);
    res.status(500).json({ error: 'API 키를 변경하는 중 오류가 발생했습니다.' });
  }
});

export default router;
