const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const giftController = require('../controllers/giftController');
const giftService = require('../services/giftService');
const reactionService = require('../services/reactionService');
const statsService = require('../services/statsService');

test('gift content resolves the student once and returns the complete initial payload', async () => {
  const originals = {
    getStudentByCode: giftService.getStudentByCode,
    getGallery: giftService.getGallery,
    getApprovedLetters: giftService.getApprovedLetters,
    getReactionCounts: reactionService.getReactionCounts,
    getSessionReactions: reactionService.getSessionReactions,
    recordView: statsService.recordView,
  };
  let studentLookups = 0;
  const recorded = [];
  giftService.getStudentByCode = async () => {
    studentLookups += 1;
    return { id: 7, full_name: 'Hương' };
  };
  giftService.getGallery = async () => [{ id: 2, image_url: 'image.jpg' }];
  giftService.getApprovedLetters = async () => [{ id: 5, content: 'Chúc vui vẻ' }];
  reactionService.getReactionCounts = async () => ({ 5: { love: 2 } });
  reactionService.getSessionReactions = async () => ({ 5: 'love' });
  statsService.recordView = (studentId, sessionId) => recorded.push({ studentId, sessionId });

  const req = {
    params: { accessCode: '12a1-huong' },
    headers: { 'x-session-id': 'session_identifier_1234' },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    await giftController.getContent(req, res);
    assert.equal(studentLookups, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.student.full_name, 'Hương');
    assert.equal(res.body.data.gallery.length, 1);
    assert.deepEqual(res.body.data.letters[0].reactions, { love: 2 });
    assert.equal(res.body.data.letters[0].myReaction, 'love');
    assert.deepEqual(recorded, [{ studentId: 7, sessionId: 'session_identifier_1234' }]);
  } finally {
    Object.assign(giftService, {
      getStudentByCode: originals.getStudentByCode,
      getGallery: originals.getGallery,
      getApprovedLetters: originals.getApprovedLetters,
    });
    Object.assign(reactionService, {
      getReactionCounts: originals.getReactionCounts,
      getSessionReactions: originals.getSessionReactions,
    });
    statsService.recordView = originals.recordView;
  }
});
