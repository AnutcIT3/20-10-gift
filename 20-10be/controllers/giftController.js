const { sendSuccess, sendError } = require('../utils/response');
const giftService = require('../services/giftService');
const reactionService = require('../services/reactionService');
const statsService = require('../services/statsService');

const SESSION_HEADER = 'x-session-id';
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

function extractSessionId(req) {
  const sid = req.headers[SESSION_HEADER];
  return sid && SESSION_ID_RE.test(sid) ? sid : null;
}

async function getStudent(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  // Ghi nhận lượt xem bất đồng bộ (không block response)
  const sessionId = extractSessionId(req);
  statsService.recordView(student.id, sessionId);
  return sendSuccess(res, student);
}

async function getGallery(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  const gallery = await giftService.getGallery(student.id);
  return sendSuccess(res, gallery);
}

async function getLetters(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);

  const letters = await giftService.getApprovedLetters(student.id);

  // Embed reaction counts + session's active reaction
  if (letters.length) {
    const letterIds = letters.map((l) => l.id);
    const sessionId = extractSessionId(req);
    const [counts, sessionReactions] = await Promise.all([
      reactionService.getReactionCounts(letterIds),
      reactionService.getSessionReactions(letterIds, sessionId),
    ]);

    const enriched = letters.map((letter) => ({
      ...letter,
      reactions: counts[letter.id] || {},
      myReaction: sessionReactions[letter.id] || null,
    }));
    return sendSuccess(res, enriched);
  }

  return sendSuccess(res, letters);
}

async function createLetter(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  const result = await giftService.createLetter(student.id, req.body);
  return sendSuccess(res, result, 201);
}

module.exports = { getStudent, getGallery, getLetters, createLetter };
