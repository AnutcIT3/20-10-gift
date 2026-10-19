const pool = require('../config/db');
const { WISH_COUNT_BASE } = require('../config/constants');

// Số lời chúc trên trang chủ (đống thư, số to mờ, "Bạn là người gửi lời chúc
// thứ N"). Hiển thị = WISH_COUNT_BASE + số thật để trang không trống trơn lúc
// đầu; số thật đếm mọi lời chúc trừ lời bị từ chối và thư gửi tài khoản thử
// (thư admin gửi nhiều bạn tính mỗi bạn một lời). Trang Tổng quan admin vẫn
// dùng số thật của nó. Không lộ tên hay người nhận — chỉ một con số và giờ
// của lời gần nhất cho dòng "Ai đó vừa gửi một lời chúc".

// Cả lớp cùng hỏi trang chủ 15 giây một lần: đệm vài giây, gửi lời chúc thì
// xoá đệm để người gửi thấy số mới ngay
const TTL_MS = 5000;
let cache = null;

async function readSummary() {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total, MAX(l.created_at) AS last_at
     FROM letters l JOIN students s ON s.id = l.student_id
     WHERE l.status <> 'rejected' AND s.member_type <> 'test'`,
  );
  const real = Number(row?.total || 0);
  const lastAt = row?.last_at ? new Date(row.last_at) : null;
  return {
    shown: WISH_COUNT_BASE + real,
    lastAt: lastAt && !Number.isNaN(lastAt.getTime()) ? lastAt.toISOString() : null,
  };
}

async function getSummary(now = Date.now()) {
  if (cache && now - cache.at < TTL_MS) return cache.value;
  const value = await readSummary();
  cache = { at: now, value };
  return value;
}

// Vừa có lời chúc mới: số hiển thị sau lời đó, chính là "người gửi thứ N"
async function numberAfterSend() {
  cache = null;
  try {
    return (await getSummary()).shown;
  } catch (error) {
    // Đếm hỏng thì lời chúc vẫn đã gửi xong — chỉ thiếu con số
    console.error('[wishCountService]', error.message);
    return null;
  }
}

function clearCache() {
  cache = null;
}

module.exports = { getSummary, numberAfterSend, clearCache };
