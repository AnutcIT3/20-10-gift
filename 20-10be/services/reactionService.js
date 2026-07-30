const pool = require('../config/db');

const VALID_EMOJI_KEYS = new Set(['smile', 'laugh', 'angry', 'kiss', 'love', 'sad', 'thumbsup', 'think']);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Toggle reaction: nếu session đã react cùng emoji → xóa (un-react)
 *                  nếu chưa react hoặc khác emoji → cập nhật
 * Trả về { emoji_key | null, counts }
 */
async function toggleReaction(studentId, letterId, emojiKey, sessionId) {
  if (!VALID_EMOJI_KEYS.has(emojiKey)) {
    throw httpError('Emoji không hợp lệ', 400);
  }

  const [[letter]] = await pool.execute(
    `SELECT id
     FROM letters
     WHERE id = ? AND student_id = ? AND status = 'approved'
       AND (reveal_at IS NULL OR reveal_at <= NOW())
     LIMIT 1`,
    [letterId, studentId],
  );
  if (!letter) throw httpError('Không tìm thấy lời chúc', 404);

  // Kiểm tra reaction hiện tại của session
  const [[existing]] = await pool.execute(
    'SELECT id, emoji_key FROM letter_reactions WHERE letter_id = ? AND session_id = ?',
    [letterId, sessionId],
  );

  if (existing) {
    if (existing.emoji_key === emojiKey) {
      // Cùng emoji → un-react
      await pool.execute('DELETE FROM letter_reactions WHERE id = ?', [existing.id]);
    } else {
      // Khác emoji → đổi
      await pool.execute(
        'UPDATE letter_reactions SET emoji_key = ? WHERE id = ?',
        [emojiKey, existing.id],
      );
    }
  } else {
    // Chưa có → insert
    await pool.execute(
      'INSERT INTO letter_reactions (letter_id, emoji_key, session_id) VALUES (?, ?, ?)',
      [letterId, emojiKey, sessionId],
    );
  }

  const counts = await getReactionCounts([letterId]);
  const active = existing && existing.emoji_key === emojiKey ? null : emojiKey;
  return { active, counts: counts[letterId] || {} };
}

/**
 * Lấy reaction counts cho nhiều letter_id cùng lúc.
 * Trả về map: { [letterId]: { smile: 3, heart: 1, ... } }
 */
async function getReactionCounts(letterIds) {
  if (!letterIds.length) return {};
  const placeholders = letterIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT letter_id, emoji_key, COUNT(*) AS cnt
     FROM letter_reactions
     WHERE letter_id IN (${placeholders})
     GROUP BY letter_id, emoji_key`,
    letterIds,
  );

  const result = {};
  for (const row of rows) {
    if (!result[row.letter_id]) result[row.letter_id] = {};
    result[row.letter_id][row.emoji_key] = Number(row.cnt);
  }
  return result;
}

/**
 * Lấy emoji mà một session đã chọn cho nhiều letter.
 * Trả về map: { [letterId]: emojiKey }
 */
async function getSessionReactions(letterIds, sessionId) {
  if (!letterIds.length || !sessionId) return {};
  const placeholders = letterIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT letter_id, emoji_key FROM letter_reactions
     WHERE letter_id IN (${placeholders}) AND session_id = ?`,
    [...letterIds, sessionId],
  );
  return Object.fromEntries(rows.map((r) => [r.letter_id, r.emoji_key]));
}

module.exports = { toggleReaction, getReactionCounts, getSessionReactions };
