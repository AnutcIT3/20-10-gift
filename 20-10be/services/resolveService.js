const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');

async function resolve(name, scope = 'class') {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Vui lòng nhập tên cần tìm', status: 400 };
  if (trimmed.length < 2) return { error: 'Tên tìm kiếm phải có ít nhất 2 ký tự', status: 400 };

  // scope tách hẳn hai không gian tên: 'class' cho thành viên lớp, 'friend'
  // cho hồ sơ bạn bè ngoài lớp — khách trùng tên với thành viên không bao giờ
  // mở nhầm trang của bạn ấy
  const memberType = scope === 'friend' ? 'friend' : 'class';

  const normalized = normalizeName(trimmed);
  // Chặn input chỉ gồm dấu kết hợp (normalize xong thành rỗng/1 ký tự):
  // nếu không, mẫu LIKE trở thành '%' và khớp toàn bộ danh sách
  if (normalized.length < 2) return { error: 'Tên tìm kiếm phải có ít nhất 2 ký tự', status: 400 };
  // Escape wildcard để input chứa % hoặc _ không thể khớp tràn lan
  const escaped = normalized.replace(/[\\%_]/g, '\\$&');

  // Chỉ khớp từ đầu của một từ trong tên (không khớp giữa từ): vừa đúng cách
  // người dùng tìm ("vy", "thuy vy"), vừa chặn dò quét access code bằng cặp
  // ký tự bất kỳ qua LIKE '%..%'.
  const [rows] = await pool.execute(
    'SELECT full_name, nickname, avatar_url, access_code, seat_row, seat_col FROM students WHERE (normalized_name LIKE ? OR normalized_name LIKE ?) AND is_active = TRUE AND member_type = ? ORDER BY full_name ASC LIMIT 10',
    [`${escaped}%`, `% ${escaped}%`, memberType],
  );

  if (rows.length === 0) {
    return { error: 'Không tìm thấy', status: 404 };
  }

  const exactMatches = rows.filter((row) => normalizeName(row.full_name) === normalized);
  const resultRows = exactMatches.length > 0 ? exactMatches : rows;

  if (resultRows.length === 1) {
    return { giftPath: `/gift/${resultRows[0].access_code}` };
  }

  // Kèm chỗ ngồi để danh sách trùng tên gợi ý "bàn 3 · dãy phải" — người dùng
  // nhận ra mình nhanh hơn là chỉ nhìn tên
  const matches = resultRows.slice(0, 10).map((r) => ({
    displayName: r.full_name,
    nickname: r.nickname || '',
    avatarUrl: r.avatar_url || '',
    giftPath: `/gift/${r.access_code}`,
    seatRow: r.seat_row ?? null,
    seatCol: r.seat_col ?? null,
  }));

  return {
    matches,
    message: `Có ${resultRows.length} bạn trùng tên. Chọn bạn cần tìm?`,
  };
}

module.exports = { resolve };
