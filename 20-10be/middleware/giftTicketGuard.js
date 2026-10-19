const pool = require('../config/db');
const settingsService = require('../services/settingsService');
const { verifyGiftTicket, verifyToken } = require('../utils/jwt');

// Admin bật "Chỉ mở bằng Face ID": trang quà của bạn TRONG LỚP chỉ mở cho máy
// có vé mở quà (máy chủ cấp khi Face ID nhận ra đúng người, kèm quay đầu nếu
// bật chống giơ ảnh) — mở thẳng link /gift/<mã> không có vé thì 403. Trang của
// khách ngoài lớp không bị chặn (khách vẫn gõ tên). Admin xem trước bằng token
// admin. Công tắc tắt thì như cũ: ai có link cũng xem được.
async function isAdmin(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  try {
    const decoded = verifyToken(header.slice(7));
    if (!decoded?.sub) return false;
    const [rows] = await pool.execute('SELECT id FROM admins WHERE id = ? LIMIT 1', [decoded.sub]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function giftTicketGuard(req, res, next) {
  try {
    if (!(await settingsService.isFaceOnly())) return next();
    const { accessCode } = req.params;
    const [rows] = await pool.execute(
      'SELECT member_type FROM students WHERE access_code = ? AND is_active = TRUE LIMIT 1',
      [accessCode],
    );
    // Không có ai (để route trả 404 như cũ) hay khách ngoài lớp: cho qua
    if (!rows[0] || rows[0].member_type === 'friend') return next();
    if (verifyGiftTicket(req.get('x-gift-ticket') || '', accessCode)) return next();
    if (await isAdmin(req)) return next();
    return res.status(403).json({
      success: false,
      code: 'face_only',
      message: 'Trang quà này chỉ mở bằng Face ID — về trang chủ, chọn "thành viên trong lớp" và quét Face ID nhé ✨',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = giftTicketGuard;
