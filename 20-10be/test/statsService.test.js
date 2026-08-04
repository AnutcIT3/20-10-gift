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
    [[{ id: 20, full_name: 'Hùng', view_count: 10 }]],
    [[{ emoji_key: 'love', cnt: '3' }, { emoji_key: 'think', cnt: '1' }]],
  ];
  pool.execute = async () => results.shift();
  try {
    const result = await statsService.getDashboardStats();
    assert.deepEqual(result.students, { total: 22, active: 21, totalViews: 24 });
    assert.deepEqual(result.letters, { pending: 1, approved: 4, rejected: 0 });
    assert.deepEqual(result.reactions, { byEmoji: { love: 3, think: 1 }, total: 4 });
    assert.equal(result.gallery.studentsWithoutImages, 19);
  } finally {
    pool.execute = original;
  }
});
