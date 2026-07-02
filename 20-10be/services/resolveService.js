const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');

async function resolve(name) {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Vui lòng nhập tên cần tìm', status: 400 };
  if (trimmed.length < 2) return { error: 'Tên tìm kiếm phải có ít nhất 2 ký tự', status: 400 };

  const normalized = normalizeName(trimmed);
  const likeTerm = `%${normalized}%`;

  const [rows] = await pool.execute(
    'SELECT full_name, nickname, avatar_url, access_code FROM students WHERE normalized_name LIKE ? AND is_active = TRUE ORDER BY full_name ASC LIMIT 10',
    [likeTerm],
  );

  if (rows.length === 0) {
    return { error: 'Không tìm thấy', status: 404 };
  }

  if (rows.length === 1) {
    return { giftPath: `/gift/${rows[0].access_code}` };
  }

  const matches = rows.slice(0, 10).map((r) => ({
    displayName: r.full_name,
    nickname: r.nickname || '',
    avatarUrl: r.avatar_url || '',
    giftPath: `/gift/${r.access_code}`,
  }));

  return {
    matches,
    message: `Có ${rows.length} bạn trùng tên. Chọn bạn cần tìm?`,
  };
}

module.exports = { resolve };
