// 학년도 종료 후 파기. 개인정보 처리방침 제3조 "해당 학년도 종료 후 파기"를 실행하는 도구다.
// 학생이 학생일 때 만든 대화만 대상으로 하고 교사·관리자 대화는 건드리지 않는다.

// 판정 기준은 고칠 수 없는 메시지 작성일이다. 제목을 고치거나 새 학년도에 이어 써도 이전 메시지는 파기된다.
const OLD_STUDENT_CONVS = `SELECT c.id FROM conversations c
  JOIN users u ON u.id = c.user_id
  WHERE u.role = 'student' AND c.owner_role = 'student' AND c.created_at < ?`;

const HAS_RECENT_MESSAGE = `EXISTS (
  SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.created_at >= ?
)`;

// 기준일 이전에 가입했고 기준일 이후 활동이 없는 학생.
// 음성 기능은 대화 없이 사용량만 남기므로 usage_daily도 본다. 교사 시절 대화가 남은 계정은 제외한다.
const STALE_STUDENTS = `SELECT u.id FROM users u
  WHERE u.role = 'student' AND u.created_at < ?
    AND NOT EXISTS (
      SELECT 1 FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.created_at >= ?
      WHERE c.user_id = u.id
        AND (c.created_at >= ? OR m.id IS NOT NULL OR c.owner_role IS NOT 'student')
    )
    AND NOT EXISTS (SELECT 1 FROM usage_daily d WHERE d.user_id = u.id AND d.date >= ?)`;

function assertCutoff(cutoff) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff))) {
    throw new Error('기준일은 YYYY-MM-DD 형식이어야 합니다.');
  }
}

async function count(db, sql, args) {
  const result = await db.execute({ sql, args });
  return Number(result.rows[0].c);
}

/**
 * 파기 대상 건수만 센다. 데이터를 바꾸지 않고 내용도 읽지 않는다.
 * @param {import('@libsql/client').Client} db
 * @param {string} cutoff - 이 날짜보다 오래된 자료가 대상 (YYYY-MM-DD)
 * @param {{ deleteStudents?: boolean }} options
 * @returns conversations: 통째로 지울 대화, trimmedConversations: 이전 메시지만 지울 대화
 */
export async function planPurge(db, cutoff, { deleteStudents = false } = {}) {
  assertCutoff(cutoff);
  return {
    conversations: await count(
      db,
      `SELECT COUNT(*) c FROM conversations
       WHERE id IN (${OLD_STUDENT_CONVS}) AND NOT ${HAS_RECENT_MESSAGE}`,
      [cutoff, cutoff],
    ),
    trimmedConversations: await count(
      db,
      `SELECT COUNT(*) c FROM conversations
       WHERE id IN (${OLD_STUDENT_CONVS}) AND ${HAS_RECENT_MESSAGE}`,
      [cutoff, cutoff],
    ),
    messages: await count(
      db,
      `SELECT COUNT(*) c FROM messages
       WHERE created_at < ? AND conversation_id IN (${OLD_STUDENT_CONVS})`,
      [cutoff, cutoff],
    ),
    shareTokens: await count(
      db,
      `SELECT COUNT(*) c FROM share_tokens WHERE conversation_id IN (${OLD_STUDENT_CONVS})`,
      [cutoff],
    ),
    usageDaily: await count(
      db,
      `SELECT COUNT(*) c FROM usage_daily
       WHERE date < ? AND user_id IN (SELECT id FROM users WHERE role = 'student')`,
      [cutoff],
    ),
    students: deleteStudents
      ? await count(db, `SELECT COUNT(*) c FROM (${STALE_STUDENTS})`, [
          cutoff,
          cutoff,
          cutoff,
          cutoff,
        ])
      : 0,
  };
}

/**
 * 파기 실행. 한 트랜잭션으로 처리해 일부만 지워지지 않게 한다.
 * - 기준일 이전 메시지를 지운다. 이어 쓴 대화는 이후 메시지만 남기고 제목(첫 메시지 일부)을 바꾼다.
 * - deleteStudents는 기준일 이전에 가입했고 이후 활동이 없는 학생 계정까지 지운다.
 *   재학생도 새 학년도에 아직 사용하지 않았다면 대상이 되므로 실행 시기를 정해서 사용한다.
 */
export async function executePurge(db, cutoff, { deleteStudents = false } = {}) {
  assertCutoff(cutoff);
  const statements = [
    {
      sql: `DELETE FROM share_tokens WHERE conversation_id IN (${OLD_STUDENT_CONVS})`,
      args: [cutoff],
    },
    {
      sql: `UPDATE conversations SET title = '이전 학년도에서 이어진 대화'
            WHERE id IN (${OLD_STUDENT_CONVS}) AND ${HAS_RECENT_MESSAGE}`,
      args: [cutoff, cutoff],
    },
    {
      sql: `DELETE FROM messages
            WHERE created_at < ? AND conversation_id IN (${OLD_STUDENT_CONVS})`,
      args: [cutoff, cutoff],
    },
    {
      sql: `DELETE FROM conversations
            WHERE id IN (${OLD_STUDENT_CONVS}) AND NOT ${HAS_RECENT_MESSAGE}`,
      args: [cutoff, cutoff],
    },
    {
      sql: `DELETE FROM usage_daily
            WHERE date < ? AND user_id IN (SELECT id FROM users WHERE role = 'student')`,
      args: [cutoff],
    },
  ];
  if (deleteStudents) {
    statements.push({
      sql: `DELETE FROM users WHERE id IN (${STALE_STUDENTS})`,
      args: [cutoff, cutoff, cutoff, cutoff],
    });
  }
  await db.batch(statements, 'write');
}
