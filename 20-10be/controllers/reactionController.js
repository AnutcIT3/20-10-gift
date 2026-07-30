const reactionService = require('../services/reactionService');
const giftService = require('../services/giftService');
const { sendSuccess, sendError } = require('../utils/response');

const SESSION_HEADER = 'x-session-id';
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

function extractSessionId(req) {
  const sid = req.headers[SESSION_HEADER];
  if (sid && SESSION_ID_RE.test(sid)) return sid;
  return null;
}

/**
 * POST /api/gifts/:accessCode/letters/:letterId/react
 * Body: { emojiKey: 'smile' }
 * Header: x-session-id: <uuid>
 */
async function react(req, res) {
  const { accessCode, letterId } = req.params;
  const { emojiKey } = req.body || {};
  const sessionId = extractSessionId(req);

  if (!sessionId) return sendError(res, 'x-session-id header bắt buộc (16–64 ký tự alphanumeric)', 400);
  if (!emojiKey || typeof emojiKey !== 'string') return sendError(res, 'emojiKey bắt buộc', 400);

  const student = await giftService.getStudentByCode(accessCode);
  if (!student) return sendError(res, 'Không tìm thấy trang quà', 404);

  const id = Number(letterId);
  if (!Number.isInteger(id) || id <= 0) return sendError(res, 'letterId không hợp lệ', 400);

  const result = await reactionService.toggleReaction(student.id, id, emojiKey, sessionId);
  return sendSuccess(res, result);
}

module.exports = { react };
