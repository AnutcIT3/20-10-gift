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
const replyService = require('../services/replyService');
const statsService = require('../services/statsService');

test('gift content resolves the student once and returns the complete initial payload', async () => {
  const originals = {
    getStudentByCode: giftService.getStudentByCode,
    getGallery: giftService.getGallery,
    getApprovedLetters: giftService.getApprovedLetters,
    getReactionCounts: reactionService.getReactionCounts,
    getSessionReactions: reactionService.getSessionReactions,
    listStudentReplies: replyService.listStudentReplies,
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
  replyService.listStudentReplies = async () => [{ id: 3, target: 'letter', letter_id: 5, status: 'pending' }];
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
    // Hồi âm của chính trang quà đi kèm để hiện "cậu đã hồi âm" dưới lá thư
    assert.deepEqual(res.body.data.replies, [{ id: 3, target: 'letter', letter_id: 5, status: 'pending' }]);
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
    replyService.listStudentReplies = originals.listStudentReplies;
    statsService.recordView = originals.recordView;
  }
});

// ── Ba loại lời chúc ─────────────────────────────────────────────────────────
// Trang quà tách lời chúc của các bạn nam 12A1 (admin nhập sẵn) khỏi lời chúc
// của khách gửi qua form. Nhóm là dữ liệu tin cậy nên form công khai không được
// quyền tự nhận mình là bạn cùng lớp.
test('lời chúc gửi qua form công khai luôn vào nhóm khách, dù payload khai là bạn cùng lớp', async () => {
  const pool = require('../config/db');
  const original = pool.execute;
  let insertSql;
  let insertParams;
  pool.execute = async (sql, params) => {
    insertSql = sql;
    insertParams = params;
    return [{ insertId: 1 }];
  };
  try {
    const result = await giftService.createLetter(7, {
      sender_name: 'Người lạ',
      content: 'Chúc mừng 20/10',
      is_anonymous: false,
      sender_kind: 'classmate',
      status: 'approved',
    });
    assert.deepEqual(result, { status: 'pending' });
    assert.match(insertSql, /VALUES \(\?, \?, 'guest',/);
    // status bị ép về 'pending' và sender_kind không nằm trong tham số
    assert.deepEqual(insertParams, [7, 'Người lạ', null, 'Chúc mừng 20/10', false, 'pending', null, null, null]);
  } finally {
    pool.execute = original;
  }
});

test('admin nhập được lời chúc của các bạn nam 12A1 và bị chặn nhóm lạ', async () => {
  const letterService = require('../services/letterService');
  const pool = require('../config/db');
  const original = pool.getConnection;
  const inserts = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params) => {
      if (sql.includes('FROM students')) return [[{ id: 1 }]];
      if (sql.includes('INSERT INTO letters')) inserts.push(params);
      return [[]];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });
  try {
    await letterService.createLetters({
      student_ids: [1],
      sender_name: 'Tuấn',
      content: 'Chúc cậu 20/10 vui vẻ',
      sender_kind: 'classmate',
      status: 'approved',
    });
    assert.equal(inserts[0][2], 'classmate');

    await assert.rejects(() => letterService.createLetters({
      student_ids: [1],
      sender_name: 'Tuấn',
      content: 'Chúc cậu 20/10 vui vẻ',
      sender_kind: 'giao_vien',
    }), { statusCode: 400 });
  } finally {
    pool.getConnection = original;
  }
});
