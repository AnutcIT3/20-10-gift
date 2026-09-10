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
       SUM(status = 'rejected')          AS rejected,
       SUM(status = 'approved' AND reveal_at IS NOT NULL AND reveal_at > UTC_TIMESTAMP()) AS scheduled
     FROM letters`,
  );

  const [[imageRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM gallery`,
  );

  // Chỉ đếm thành viên lớp: hồ sơ bạn ngoài lớp (member_type = 'friend') tự
  // sinh khi có lời chúc và theo thiết kế không bao giờ có ảnh, đếm cả họ thì
  // con số này không bao giờ về 0 và lệch với bộ lọc ở trang Học sinh
  const [[noImageRow]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM students s
     WHERE is_active = TRUE
       AND member_type = 'class'
       AND NOT EXISTS (SELECT 1 FROM gallery g WHERE g.student_id = s.id)`,
  );

  const [[noAvatarRow]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM students
     WHERE is_active = TRUE
       AND member_type = 'class'
       AND (avatar_url IS NULL OR avatar_url = '')`,
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

  // Face ID: đếm theo lượt quét (một lần mở camera) — nhận đúng, nhầm người,
  // còn lại là chưa thành. Bảng chỉ có kết quả và con số, không ảnh hay vector.
  // Máy chưa chạy migration 018 thì bảng chưa có: trả null thay vì làm sập cả
  // trang Tổng quan.
  let faceRow = null;
  try {
    [[faceRow]] = await pool.execute(
      `SELECT
         COUNT(*)                   AS scans,
         SUM(outcome = 'confirmed') AS confirmed,
         SUM(outcome = 'denied')    AS denied
       FROM face_scans`,
    );
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  const faceScans = Number(faceRow?.scans || 0);
  const faceConfirmed = Number(faceRow?.confirmed || 0);
  const faceDenied = Number(faceRow?.denied || 0);

  return {
    students: {
      total: Number(studentRow.total),
      active: Number(studentRow.active),
      totalViews: Number(studentRow.totalViews || 0),
      // Thành viên lớp chưa có ảnh đại diện — mục tiêu riêng trong ROADMAP
      withoutAvatar: Number(noAvatarRow.count),
    },
    letters: {
      pending: Number(letterRow.pending || 0),
      approved: Number(letterRow.approved || 0),
      rejected: Number(letterRow.rejected || 0),
      // Đã duyệt nhưng hẹn giờ chưa tới — tab "Hẹn giờ" ở hộp thư admin
      scheduled: Number(letterRow.scheduled || 0),
    },
    gallery: {
      total: Number(imageRow.total),
      studentsWithoutImages: Number(noImageRow.count),
    },
    reactions: {
      byEmoji: reactions,
      total: totalReactions,
    },
    face: faceRow ? {
      scans: faceScans,
      confirmed: faceConfirmed,
      denied: faceDenied,
      failed: faceScans - faceConfirmed - faceDenied,
    } : null,
    topViewed,
  };
}

module.exports = { recordView, getDashboardStats };
