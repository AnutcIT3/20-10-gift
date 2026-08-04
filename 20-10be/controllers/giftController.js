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

async function enrichLetters(letters, sessionId) {
  if (!letters.length) return letters;
  const letterIds = letters.map((letter) => letter.id);
  const [counts, sessionReactions] = await Promise.all([
    reactionService.getReactionCounts(letterIds),
    reactionService.getSessionReactions(letterIds, sessionId),
  ]);
  return letters.map((letter) => ({
    ...letter,
    reactions: counts[letter.id] || {},
    myReaction: sessionReactions[letter.id] || null,
  }));
}

async function getContent(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);

  const sessionId = extractSessionId(req);
  const [gallery, letters] = await Promise.all([
    giftService.getGallery(student.id),
    giftService.getApprovedLetters(student.id),
  ]);
  const enrichedLetters = await enrichLetters(letters, sessionId);
  statsService.recordView(student.id, sessionId);

  return sendSuccess(res, { student, gallery, letters: enrichedLetters });
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

  return sendSuccess(res, await enrichLetters(letters, extractSessionId(req)));
}

async function createLetter(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  const result = await giftService.createLetter(student.id, req.body);
  return sendSuccess(res, result, 201);
}

module.exports = { getStudent, getContent, getGallery, getLetters, createLetter };
