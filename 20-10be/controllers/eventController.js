const eventService = require('../services/eventService');
const giftService = require('../services/giftService');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/event — trang chủ hỏi: đang khoá hay đã mở, mấy giờ tự mở, bao
// nhiêu bạn đã mở quà. Không cần đăng nhập, không lộ tên ai.
async function status(req, res) {
  return sendSuccess(res, await eventService.getStatus());
}

// POST /api/gifts/:accessCode/open — body { via: 'name' | 'face' }
async function recordOpen(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  return sendSuccess(res, await eventService.recordOpen(student, req.body?.via));
}

module.exports = { status, recordOpen };
