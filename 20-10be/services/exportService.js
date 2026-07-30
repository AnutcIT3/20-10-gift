const pool = require('../config/db');

/**
 * Tạo file CSV danh sách học sinh kèm thống kê.
 * Trả về Buffer với BOM UTF-8 để Excel mở đúng tiếng Việt.
 */
async function exportStudentsCsv() {
  const [rows] = await pool.execute(
    `SELECT
       s.id,
       s.full_name,
       s.nickname,
       s.class_name,
       IF(s.is_active, 'Hoạt động', 'Đã tắt')     AS status,
       s.view_count,
       COUNT(DISTINCT l.id)                         AS total_letters,
       COUNT(DISTINCT CASE WHEN l.status = 'approved' THEN l.id END)
                                                     AS approved_letters,
       COUNT(DISTINCT CASE WHEN l.status = 'pending' THEN l.id END)
                                                     AS pending_letters,
       COUNT(DISTINCT g.id)                         AS total_images,
       COUNT(DISTINCT r.id)                         AS total_reactions,
       DATE_FORMAT(s.created_at, '%d/%m/%Y %H:%i') AS created_at
     FROM students s
     LEFT JOIN letters l ON l.student_id = s.id
     LEFT JOIN gallery g ON g.student_id = s.id
     LEFT JOIN letter_reactions r ON r.letter_id = l.id
     GROUP BY s.id
     ORDER BY s.full_name ASC`,
  );

  const headers = [
    'ID', 'Họ và tên', 'Biệt danh', 'Lớp', 'Trạng thái',
    'Lượt xem', 'Tổng lời chúc', 'Đã duyệt', 'Chờ duyệt',
    'Tổng ảnh', 'Tổng reactions', 'Ngày tạo',
  ];

  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    // Bọc trong ngoặc kép nếu có dấu phẩy, ngoặc hoặc xuống dòng
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.id, r.full_name, r.nickname, r.class_name, r.status,
      r.view_count, r.total_letters, r.approved_letters, r.pending_letters,
      r.total_images, r.total_reactions, r.created_at,
    ].map(escape).join(',')),
  ];

  // BOM UTF-8 giúp Excel nhận diện encoding
  const bom = Buffer.from('\uFEFF', 'utf8');
  const content = Buffer.from(lines.join('\r\n'), 'utf8');
  return Buffer.concat([bom, content]);
}

module.exports = { exportStudentsCsv };
