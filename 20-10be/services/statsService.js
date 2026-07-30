const pool = require('../config/db');

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

/**
 * Ghi nhận lượt xem — dedup theo (student_id, session_id).
 * Nếu session đã xem student này rồi → bỏ qua.
 * Được gọi bất đồng bộ (fire-and-forget), lỗi chỉ log không throw.
 */
async function recordView(studentId, sessionId) {
  if (!studentId || !sessionId || !SESSION_ID_RE.test(sessionId)) return;
  try {
    // INSERT IGNORE: nếu (student_id, session_id) đã tồn tại → không làm gì
    const [result] = await pool.execute(
      'INSERT IGNORE INTO student_views (student_id, session_id) VALUES (?, ?)',
      [studentId, sessionId],
    );
    // Chỉ tăng view_count nếu thực sự insert được (affectedRows = 1)
    if (result.affectedRows > 0) {
      await pool.execute(
        'UPDATE students SET view_count = view_count + 1 WHERE id = ?',
        [studentId],
      );
    }
  } catch (err) {
    console.error('[statsService.recordView]', err.message);
  }
}

/**
 * Tổng hợp toàn bộ thống kê cho admin dashboard.
 */
async function getDashboardStats() {
  const [[studentRow]] = await pool.execute(
    `SELECT
       COUNT(*)                          AS total,
       SUM(is_active = TRUE)             AS active,
       SUM(view_count)                   AS totalViews
     FROM students`,
  );

  const [[letterRow]] = await pool.execute(
    `SELECT
       SUM(status = 'pending')           AS pending,
       SUM(status = 'approved')          AS approved,
       SUM(status = 'rejected')          AS rejected
     FROM letters`,
  );

  const [[imageRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM gallery`,
  );

  const [[noImageRow]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM students s
     WHERE is_active = TRUE
       AND NOT EXISTS (SELECT 1 FROM gallery g WHERE g.student_id = s.id)`,
  );

  // Top 5 học sinh được xem nhiều nhất
  const [topViewed] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, view_count
     FROM students
     WHERE is_active = TRUE
     ORDER BY view_count DESC
     LIMIT 5`,
  );

  // Tổng reactions theo emoji
  const [reactionRows] = await pool.execute(
    `SELECT emoji_key, COUNT(*) AS cnt
     FROM letter_reactions
     GROUP BY emoji_key
     ORDER BY cnt DESC`,
  );
  const reactions = Object.fromEntries(reactionRows.map((r) => [r.emoji_key, Number(r.cnt)]));
  const totalReactions = reactionRows.reduce((s, r) => s + Number(r.cnt), 0);

  return {
    students: {
      total: Number(studentRow.total),
      active: Number(studentRow.active),
      totalViews: Number(studentRow.totalViews || 0),
    },
    letters: {
      pending: Number(letterRow.pending || 0),
      approved: Number(letterRow.approved || 0),
      rejected: Number(letterRow.rejected || 0),
    },
    gallery: {
      total: Number(imageRow.total),
      studentsWithoutImages: Number(noImageRow.count),
    },
    reactions: {
      byEmoji: reactions,
      total: totalReactions,
    },
    topViewed,
  };
}

module.exports = { recordView, getDashboardStats };
