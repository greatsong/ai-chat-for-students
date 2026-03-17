import { Router } from 'express';
import { authenticate, requireTeacher, requireAdmin } from '../middleware/auth.js';
import { queryAll, queryOne, run, getSetting, setSetting } from '../db/database.js';

const router = Router();

// 환경변수 교사 이메일 목록 (삭제 불가)
const ENV_TEACHER_EMAILS = (process.env.TEACHER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// ──────────────────────────────────────────
// GET /api/teacher/my-usage
// 현재 사용자 본인의 사용량 (교사 + 관리자)
// ──────────────────────────────────────────
router.get('/my-usage', requireTeacher, async (req, res) => {
  try {
    const userId = req.user.id;

    // 요약 (전체 기간)
    const summary = await queryOne(`
      SELECT
        COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
        COALESCE(SUM(output_tokens), 0) AS totalOutputTokens,
        COALESCE(SUM(request_count), 0) AS totalRequests,
        COALESCE(SUM(image_count), 0) AS totalImages
      FROM usage_daily
      WHERE user_id = ?
    `, [userId]);

    // 일별 사용량 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const daily = await queryAll(`
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
    `, [userId, thirtyDaysAgoStr]);

    res.json({
      summary: summary || { totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0, totalImages: 0 },
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

    const users = await queryAll(`
      SELECT
        u.id, u.name, u.email, u.avatar, u.role, u.is_active, u.daily_limit,
        u.classroom_id, u.created_at,
        COALESCE(SUM(ud.input_tokens), 0)  AS today_input_tokens,
        COALESCE(SUM(ud.output_tokens), 0) AS today_output_tokens,
        COALESCE(SUM(ud.request_count), 0) AS today_requests,
        (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) AS total_conversations
      FROM users u
      LEFT JOIN usage_daily ud ON ud.user_id = u.id AND ud.date = ?
      GROUP BY u.id
      ORDER BY u.role ASC, u.created_at DESC
    `, [today]);

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
router.patch('/students/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, daily_limit } = req.body;

    const student = await queryOne('SELECT * FROM users WHERE id = ? AND role = ?', [id, 'student']);
    if (!student) {
      return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });
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

    if (updates.length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    params.push(id);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

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
router.post('/students/bulk-activate', requireAdmin, async (req, res) => {
  try {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '학생 ID 목록이 필요합니다.' });
    }

    const placeholders = studentIds.map(() => '?').join(', ');
    await run(
      `UPDATE users SET is_active = 1 WHERE id IN (${placeholders}) AND role = 'student'`,
      studentIds
    );

    res.json({ message: `${studentIds.length}명의 학생이 활성화되었습니다.`, count: studentIds.length });
  } catch (error) {
    console.error('일괄 활성화 오류:', error);
    res.status(500).json({ error: '학생을 활성화하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/conversations
// 전체 학생 대화 목록 (필터링 + 페이지네이션) (관리자 전용)
// ──────────────────────────────────────────
router.get('/conversations', requireAdmin, async (req, res) => {
  try {
    const { userId, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ["u.role = 'student'"];  // 교사/관리자 채팅은 수집하지 않음
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
      params
    );
    const total = countRow?.total || 0;

    // 대화 목록
    const conversations = await queryAll(
      `SELECT
        c.id, c.user_id, c.title, c.provider, c.model, c.created_at, c.updated_at,
        u.name AS student_name, u.email AS student_email,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
      FROM conversations c
      JOIN users u ON u.id = c.user_id
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
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
});

// ──────────────────────────────────────────
// GET /api/teacher/conversations/:conversationId/messages
// 특정 대화의 전체 메시지 조회 (관리자 전용)
// ──────────────────────────────────────────
router.get('/conversations/:conversationId/messages', requireAdmin, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [conversationId]);
    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const messages = await queryAll(
      `SELECT id, role, content, files, image_url, code_result, input_tokens, output_tokens, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId]
    );

    // files JSON 파싱
    const parsedMessages = messages.map((msg) => {
      let files = [];
      try {
        files = msg.files ? JSON.parse(msg.files) : [];
      } catch { /* 무시 */ }
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
});

// ──────────────────────────────────────────
// GET /api/teacher/usage
// 사용량 통계 (기간별) (관리자 전용)
// ──────────────────────────────────────────
router.get('/usage', requireAdmin, async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    // 기간 계산
    let dateFilter;
    const today = new Date().toISOString().slice(0, 10);

    if (period === 'today') {
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
    const summary = await queryOne(`
      SELECT
        COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
        COALESCE(SUM(output_tokens), 0) AS totalOutputTokens,
        COALESCE(SUM(request_count), 0) AS totalRequests,
        COALESCE(SUM(image_count), 0) AS totalImages,
        COUNT(DISTINCT user_id) AS activeStudents
      FROM usage_daily
      WHERE date >= ?
    `, [dateFilter]);

    // 학생별 사용량
    const byStudent = await queryAll(`
      SELECT
        ud.user_id AS userId,
        u.name, u.email,
        COALESCE(SUM(ud.input_tokens), 0) AS inputTokens,
        COALESCE(SUM(ud.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(ud.request_count), 0) AS requests
      FROM usage_daily ud
      JOIN users u ON u.id = ud.user_id
      WHERE ud.date >= ?
      GROUP BY ud.user_id
      ORDER BY (COALESCE(SUM(ud.input_tokens), 0) + COALESCE(SUM(ud.output_tokens), 0)) DESC
    `, [dateFilter]);

    // 프로바이더별 사용량
    const byProvider = await queryAll(`
      SELECT
        provider,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(request_count), 0) AS requests
      FROM usage_daily
      WHERE date >= ?
      GROUP BY provider
      ORDER BY (COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0)) DESC
    `, [dateFilter]);

    // 일별 사용량 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const daily = await queryAll(`
      SELECT
        date,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(request_count), 0) AS requests
      FROM usage_daily
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
    `, [thirtyDaysAgoStr]);

    res.json({
      summary: summary || { totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0, totalImages: 0, activeStudents: 0 },
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
router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const { key, value, settings } = req.body;

    const validKeys = [
      'enabled_providers',
      'enabled_models',
      'image_generation_enabled',
      'system_prompt',
      'default_daily_limit',
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
router.delete('/conversations/:conversationId', requireAdmin, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await queryOne('SELECT * FROM conversations WHERE id = ?', [conversationId]);
    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    // 메시지 먼저 삭제 (외래 키 제약)
    await run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    await run('DELETE FROM conversations WHERE id = ?', [conversationId]);

    res.json({ message: '대화가 삭제되었습니다.' });
  } catch (error) {
    console.error('대화 삭제 오류:', error);
    res.status(500).json({ error: '대화를 삭제하는 중 오류가 발생했습니다.' });
  }
});

// ──────────────────────────────────────────
// GET /api/teacher/teachers
// 교사 이메일 목록 조회 (관리자 전용)
// ──────────────────────────────────────────
router.get('/teachers', requireAdmin, async (req, res) => {
  try {
    const dbEmails = (await getSetting('teacher_emails')) || [];
    res.json({
      dbEmails: Array.isArray(dbEmails) ? dbEmails : [],
      envEmails: ENV_TEACHER_EMAILS,
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
router.post('/teachers', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: '이메일 주소가 필요합니다.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // DB 교사 이메일 목록에 추가
    const dbEmails = (await getSetting('teacher_emails')) || [];
    const emailList = Array.isArray(dbEmails) ? dbEmails : [];

    if (emailList.includes(trimmedEmail)) {
      return res.status(400).json({ error: '이미 등록된 교사 이메일입니다.' });
    }

    emailList.push(trimmedEmail);
    await setSetting('teacher_emails', emailList);

    // 해당 이메일의 기존 사용자가 있으면 역할을 teacher로 업데이트 + 자동 활성화
    const existingUser = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [trimmedEmail]);
    if (existingUser && existingUser.role !== 'admin') {
      await run('UPDATE users SET role = ?, is_active = 1 WHERE id = ?', ['teacher', existingUser.id]);
    }

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
router.delete('/teachers', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: '이메일 주소가 필요합니다.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 환경변수 교사는 삭제 불가
    if (ENV_TEACHER_EMAILS.includes(trimmedEmail)) {
      return res.status(400).json({ error: '환경변수로 등록된 교사는 삭제할 수 없습니다. 서버 설정에서 변경해주세요.' });
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
    const existingUser = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [trimmedEmail]);
    if (existingUser && existingUser.role === 'teacher') {
      await run('UPDATE users SET role = ? WHERE id = ?', ['student', existingUser.id]);
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

export default router;
