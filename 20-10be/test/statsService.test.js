const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const pool = require('../config/db');
const statsService = require('../services/statsService');

test('recordView ignores invalid sessions and deduplicated inserts', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return [{ affectedRows: 0 }];
  };
  try {
    await statsService.recordView(3, 'short');
    assert.equal(calls.length, 0);

    await statsService.recordView(3, 'session_identifier_1234');
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /INSERT IGNORE INTO student_views/);
  } finally {
    pool.execute = original;
  }
});

test('recordView increments the counter only for a new session view', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return [{ affectedRows: 1 }];
  };
  try {
    await statsService.recordView(7, 'new_session_identifier_1234');
    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /view_count = view_count \+ 1/);
    assert.deepEqual(calls[1].params, [7]);
  } finally {
    pool.execute = original;
  }
});

test('dashboard stats normalizes aggregate values and reaction totals', async () => {
  const original = pool.execute;
  const results = [
    [[{ total: '22', active: '21', totalViews: '24' }]],
    [[{ pending: '1', approved: '4', rejected: null }]],
    [[{ total: '2' }]],
    [[{ count: '19' }]],
    [[{ count: '5' }]],
    [[{ id: 20, full_name: 'Hùng', view_count: 10 }]],
    [[{ emoji_key: 'love', cnt: '3' }, { emoji_key: 'think', cnt: '1' }]],
    [[{ scans: '9', confirmed: '5', denied: null }]],
  ];
  const seen = [];
  pool.execute = async (sql) => { seen.push(sql); return results.shift(); };
  try {
    const result = await statsService.getDashboardStats();
    assert.deepEqual(result.students, { total: 22, active: 21, totalViews: 24, withoutAvatar: 5 });
    // Cả hai bộ đếm "chưa có" chỉ tính thành viên lớp, không tính bạn ngoài lớp
    assert.match(seen[3], /member_type = 'class'/);
    assert.match(seen[4], /member_type = 'class'/);
    assert.match(seen[4], /avatar_url IS NULL/);
    assert.deepEqual(result.letters, { pending: 1, approved: 4, rejected: 0, scheduled: 0 });
    assert.deepEqual(result.reactions, { byEmoji: { love: 3, think: 1 }, total: 4 });
    assert.equal(result.gallery.studentsWithoutImages, 19);
    // Đếm theo lượt quét: 9 lượt, 5 nhận đúng, 0 nhầm → 4 chưa thành
    assert.deepEqual(result.face, { scans: 9, confirmed: 5, denied: 0, failed: 4 });
    assert.match(seen[7], /FROM face_scans/);
  } finally {
    pool.execute = original;
  }
});

test('dashboard stats still load before migration 018 created face_scans', async () => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    if (sql.includes('FROM face_scans')) {
      throw Object.assign(new Error("Table 'gift.face_scans' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    }
    if (sql.includes('FROM letter_reactions')) return [[]];
    if (sql.includes('ORDER BY view_count')) return [[]];
    return [[{}]];
  };
  try {
    const result = await statsService.getDashboardStats();
    assert.equal(result.face, null);
    // Phần còn lại của trang Tổng quan vẫn được trả về bình thường
    assert.deepEqual(result.reactions, { byEmoji: {}, total: 0 });
    assert.ok(result.letters && result.gallery && result.students);
  } finally {
    pool.execute = original;
  }
});

test('dashboard stats do not hide real database failures behind the Face ID fallback', async () => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    if (sql.includes('FROM face_scans')) {
      throw Object.assign(new Error('Lost connection'), { code: 'PROTOCOL_CONNECTION_LOST' });
    }
    if (sql.includes('FROM letter_reactions')) return [[]];
    if (sql.includes('ORDER BY view_count')) return [[]];
    return [[{}]];
  };
  try {
    await assert.rejects(() => statsService.getDashboardStats(), /Lost connection/);
  } finally {
    pool.execute = original;
  }
});
