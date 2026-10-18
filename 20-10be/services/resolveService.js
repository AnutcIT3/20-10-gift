const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');
const { accentKey, hasDiacritics, sameName } = require('../utils/nameKey');

// SQL chỉ lọc thô trên tên bỏ dấu ("thuy" ra cả Thúy lẫn Thủy). Dấu người gõ
// là thông tin: gõ "Thủy" thì vào thẳng trang Thủy, không bắt chọn giữa hai
// bạn. Gõ không dấu ("thuy") thì vẫn hỏi lại. Dấu không khớp ai (gõ nhầm
// "Thùy") thì lùi về danh sách thô như cũ, không bao giờ trả về rỗng.
function narrowByAccents(rows, typed, normalized) {
  const key = accentKey(typed);
  const exact = rows.filter((row) => accentKey(row.full_name) === key);
  if (exact.length) return exact;
  const sameLetters = rows.filter((row) => normalizeName(row.full_name) === normalized
    && sameName(row.full_name, typed));
  if (sameLetters.length) return sameLetters;
  if (hasDiacritics(typed)) {
    // Gõ dở một chữ có dấu ("Thủ", "Phượ"): giữ tên có một chữ bắt đầu đúng
    // như vậy, kể cả dấu
    const prefixed = rows.filter((row) => ` ${accentKey(row.full_name)}`.includes(` ${key}`));
    if (prefixed.length) return prefixed;
  }
  return rows;
}

// locked: trang quà đang khoá chờ 20/10. Tra tên lúc đó chỉ để form gửi lời
// chúc chọn đúng người nhận — trả họ tên + biệt danh, KHÔNG kèm ảnh đại diện
// hay chỗ ngồi (ảnh của các bạn chỉ lộ ra khi quà đã mở)
async function resolve(name, scope = 'class', { locked = false } = {}) {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Vui lòng nhập tên cần tìm', status: 400 };
  if (trimmed.length < 2) return { error: 'Tên tìm kiếm phải có ít nhất 2 ký tự', status: 400 };

  // scope tách hẳn hai không gian tên: 'class' cho thành viên lớp, 'friend'
  // cho hồ sơ bạn bè ngoài lớp — khách trùng tên với thành viên không bao giờ
  // mở nhầm trang của bạn ấy. Tài khoản thử nằm chung không gian với lớp.
  const memberTypes = scope === 'friend' ? ['friend'] : ['class', 'test'];

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
    `SELECT full_name, nickname, avatar_url, access_code, seat_row, seat_col FROM students WHERE (normalized_name LIKE ? OR normalized_name LIKE ?) AND is_active = TRUE AND member_type IN (${memberTypes.map(() => '?').join(', ')}) ORDER BY full_name ASC LIMIT 10`,
    [`${escaped}%`, `% ${escaped}%`, ...memberTypes],
  );

  if (rows.length === 0) {
    return { error: 'Không tìm thấy', status: 404 };
  }

  const resultRows = narrowByAccents(rows, trimmed, normalized);

  if (resultRows.length === 1) {
    return { giftPath: `/gift/${resultRows[0].access_code}` };
  }

  // Kèm chỗ ngồi để danh sách trùng tên gợi ý "bàn 3 · dãy phải" — người dùng
  // nhận ra mình nhanh hơn là chỉ nhìn tên
  const matches = resultRows.slice(0, 10).map((r) => ({
    displayName: r.full_name,
    nickname: r.nickname || '',
    avatarUrl: locked ? '' : r.avatar_url || '',
    giftPath: `/gift/${r.access_code}`,
    seatRow: locked ? null : r.seat_row ?? null,
    seatCol: locked ? null : r.seat_col ?? null,
  }));

  return {
    matches,
    message: `Có ${resultRows.length} bạn trùng tên. Chọn bạn cần tìm?`,
  };
}

module.exports = { resolve };
