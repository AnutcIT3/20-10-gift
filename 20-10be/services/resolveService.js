const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');
const { accentKey, hasDiacritics, sameName } = require('../utils/nameKey');

// Một người có thể được gõ bằng nhiều tên: họ tên trong danh sách, biệt danh
// ("Thủy Phin", "Vanh") và tên gọi khác (cột search_aliases, cách nhau bằng dấu
// phẩy — cô giáo tên "Cô Giáo" nhưng các bạn gõ "Phượng" hay "Cô Phượng"). Mọi
// tên đều được đối xử như họ tên, kể cả phần giữ dấu bên dưới.
function splitAliases(value) {
  return String(value || '').split(',').map((alias) => alias.trim()).filter(Boolean);
}

const namesOf = (row) => [row.full_name, row.nickname, ...splitAliases(row.search_aliases)].filter(Boolean);

// Khớp từ đầu một chữ trong tên, như mẫu LIKE của câu SQL
const startsWord = (name, normalized) => ` ${normalizeName(name)}`.includes(` ${normalized}`);

// Tên này có phải đúng là chữ người gõ không (cả tên, không phải một phần)
const isWholeName = (name, typed, normalized) => accentKey(name) === accentKey(typed)
  || (normalizeName(name) === normalized && sameName(name, typed));

// SQL chỉ lọc thô trên tên bỏ dấu ("thuy" ra cả Thúy lẫn Thủy). Dấu người gõ
// là thông tin: gõ "Thủy" thì vào thẳng trang Thủy, không bắt chọn giữa hai
// bạn. Gõ không dấu ("thuy") thì vẫn hỏi lại. Dấu không khớp ai (gõ nhầm
// "Thùy") thì lùi về danh sách thô như cũ, không bao giờ trả về rỗng.
function narrowByAccents(rows, typed, normalized) {
  const key = accentKey(typed);
  // Đúng họ tên trước, rồi mới tới đúng biệt danh / tên gọi khác: gõ "Hùng" là
  // bạn tên Hùng, không phải bạn "Nguyễn Mạnh Hùng" có biệt danh Hùng
  const exactName = rows.filter((row) => accentKey(row.full_name) === key);
  if (exactName.length) return exactName;
  const exact = rows.filter((row) => namesOf(row).some((name) => accentKey(name) === key));
  if (exact.length) return exact;
  const sameLetters = rows.filter((row) => namesOf(row).some((name) => normalizeName(name) === normalized
    && sameName(name, typed)));
  if (sameLetters.length && !hasDiacritics(typed)) {
    // "Anh" vừa có thể là "Ánh" gõ thiếu dấu, vừa đúng là chữ "Anh" của Hải Anh,
    // Vân Anh: còn người có ĐÚNG chữ đó trong tên thì hỏi lại, không đoán là Ánh
    const wordExact = rows.filter((row) => !sameLetters.includes(row)
      && namesOf(row).some((name) => ` ${accentKey(name)} `.includes(` ${key} `)));
    if (wordExact.length) return [...sameLetters, ...wordExact];
  }
  if (sameLetters.length) return sameLetters;
  if (hasDiacritics(typed)) {
    // Gõ dở một chữ có dấu ("Thủ", "Phượ"): giữ tên có một chữ bắt đầu đúng
    // như vậy, kể cả dấu
    const prefixed = rows.filter((row) => namesOf(row).some((name) => ` ${accentKey(name)}`.includes(` ${key}`)));
    if (prefixed.length) return prefixed;
    // Dấu gõ không khớp ai: có thể gõ nhầm dấu, nhưng "Phượng" và "Phương" là
    // hai tên thật khác nhau — KHÔNG mở thẳng trang nào, hỏi lại "có phải…"
    // (dù chỉ có một người). Ưu tiên người trùng chữ cả tên ("Thùy" ↔ Thúy, Thủy)
    const typo = rows.filter((row) => namesOf(row).some((name) => normalizeName(name) === normalized));
    return Object.assign(typo.length ? typo : [...rows], { unsure: true });
  }
  return rows;
}

// Mọi người trong cùng không gian tên, kèm biệt danh và tên gọi khác — cỡ một
// lớp (vài chục dòng) nên lọc trong JS. Máy chưa chạy migration 027 thì đọc
// như không ai có tên gọi khác
async function scopeRows(memberTypes) {
  const placeholders = memberTypes.map(() => '?').join(', ');
  const sql = (aliases) => `SELECT full_name, nickname, ${aliases} AS search_aliases, avatar_url, access_code, seat_row, seat_col FROM students WHERE is_active = TRUE AND member_type IN (${placeholders})`;
  try {
    const [rows] = await pool.execute(sql('search_aliases'), memberTypes);
    return rows;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await pool.execute(sql('NULL'), memberTypes);
    return rows;
  }
}

// Gõ cả họ tên ("Nguyễn Thị Phương") trong khi danh sách chỉ ghi "Phương":
// thử phần cuối của tên ("Thị Phương", "Phương") và họ + tên ("Nguyễn Phương"
// khi danh sách ghi "Vũ Huyền" mà bạn gõ "Vũ Thị Huyền"). Chỉ nhận khi phần đó
// đúng là CẢ tên của một người — "Nguyễn Thị Mai" không được mở trang "Mai
// Huyền" chỉ vì có chữ Mai.
function surnameFallback(rows, typed) {
  const words = typed.split(/\s+/);
  if (words.length < 2) return [];
  const tries = [];
  for (let start = 1; start < words.length; start += 1) tries.push(words.slice(start).join(' '));
  if (words.length > 2) {
    tries.push(`${words[0]} ${words[words.length - 1]}`);
    tries.push(`${words[0]} ${words.slice(-2).join(' ')}`);
  }
  for (const attempt of tries) {
    const normalized = normalizeName(attempt);
    const found = rows.filter((row) => namesOf(row).some((name) => isWholeName(name, attempt, normalized)));
    if (found.length) return narrowByAccents(found, attempt, normalized);
  }
  return [];
}

// locked: trang quà đang khoá chờ 20/10. Tra tên lúc đó chỉ để form gửi lời
// chúc chọn đúng người nhận — trả họ tên + biệt danh, KHÔNG kèm ảnh đại diện
// hay chỗ ngồi (ảnh của các bạn chỉ lộ ra khi quà đã mở)
async function resolve(name, scope = 'class', { locked = false } = {}) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
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
  const [byName] = await pool.execute(
    `SELECT full_name, nickname, avatar_url, access_code, seat_row, seat_col FROM students WHERE (normalized_name LIKE ? OR normalized_name LIKE ?) AND is_active = TRUE AND member_type IN (${memberTypes.map(() => '?').join(', ')}) ORDER BY full_name ASC LIMIT 10`,
    [`${escaped}%`, `% ${escaped}%`, ...memberTypes],
  );
  // Gộp người khớp theo biệt danh / tên gọi khác (cùng luật từ đầu một chữ)
  const everyone = await scopeRows(memberTypes);
  const rows = byName.map((row) => everyone.find((item) => item.access_code === row.access_code) || row);
  for (const row of everyone) {
    if (rows.some((item) => item.access_code === row.access_code)) continue;
    if ([row.nickname, ...splitAliases(row.search_aliases)].some((alias) => alias && startsWord(alias, normalized))) rows.push(row);
  }

  const resultRows = rows.length ? narrowByAccents(rows, trimmed, normalized) : surnameFallback(everyone, trimmed);
  if (resultRows.length === 0) {
    return { error: 'Không tìm thấy', status: 404 };
  }

  if (resultRows.length === 1 && !resultRows.unsure) {
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
    // Không ai tên đúng như vậy, đây chỉ là gợi ý: trang chủ hỏi "có phải…"
    ...(resultRows.unsure ? { unsure: true } : {}),
    message: resultRows.unsure
      ? 'Không thấy ai tên đúng như vậy — đúng là cậu thì chọn nhé.'
      : `Có ${resultRows.length} bạn trùng tên. Chọn bạn cần tìm?`,
  };
}

module.exports = { resolve };
