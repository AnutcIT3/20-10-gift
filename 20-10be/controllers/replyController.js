const replyService = require('../services/replyService');
const giftService = require('../services/giftService');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/gifts/:accessCode/replies — chủ trang quà hồi âm
async function create(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  return sendSuccess(res, await replyService.createReply(student, req.body), 201);
}

// GET /api/replies?to=&exact=1 — Hộp thư hồi âm công khai; exact=1 khớp trọn
// chữ trong tên (trang chúc mừng báo "có thư gửi cậu")
async function board(req, res) {
  return sendSuccess(res, await replyService.listBoard({ to: req.query.to, exact: req.query.exact === '1' }));
}

// ── Admin ───────────────────────────────────────────────────────────────────
async function list(req, res) {
  return sendSuccess(res, await replyService.listReplies(req.query));
}

async function updateStatus(req, res) {
  return sendSuccess(res, await replyService.updateStatus(req.params.id, req.body?.status));
}

async function bulkUpdateStatus(req, res) {
  return sendSuccess(res, await replyService.bulkUpdateStatus(req.body?.ids, req.body?.status));
}

async function remove(req, res) {
  return sendSuccess(res, await replyService.deleteReply(req.params.id));
}

module.exports = {
  create, board, list, updateStatus, bulkUpdateStatus, remove,
};
