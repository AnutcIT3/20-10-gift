const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-redesign-api';

const pool = require('../config/db');
const studentService = require('../services/studentService');
const letterService = require('../services/letterService');
const resolveService = require('../services/resolveService');
const statsService = require('../services/statsService');

// Dữ liệu bổ sung cho giao diện "Sổ lưu bút": bảng học sinh có số đếm,
// hộp thư admin tìm kiếm + lọc hẹn giờ, danh sách trùng tên có chỗ ngồi.

test('list students carries gallery, letter and view counts for the admin table', async () => {
  const original = pool.execute;
  let capturedSql = '';
  pool.execute = async (sql) => {
    capturedSql = sql;
    return [[{
      id: 1, full_name: 'Nguyễn An', access_code: 'safe-code', is_active: 1,
      view_count: 12, gallery_count: '3', letter_count: 2n, pending_letter_count: 1,
    }]];
  };
  try {
    const [student] = await studentService.listStudents();
    assert.match(capturedSql, /AS gallery_count/);
    assert.match(capturedSql, /AS letter_count/);
    assert.match(capturedSql, /AS pending_letter_count/);
    assert.match(capturedSql, /s\.view_count/);
    assert.deepEqual(
      [student.view_count, student.gallery_count, student.letter_count, student.pending_letter_count],
      [12, 3, 2, 1],
    );
    assert.equal(student.giftPath, '/gift/safe-code');
    assert.equal(Object.hasOwn(student, 'access_code'), false);
  } finally {
    pool.execute = original;
  }
});

test('get student does not invent zero counts when the row has none', async () => {
  const original = pool.execute;
  pool.execute = async () => [[{ id: 4, full_name: 'Hương', access_code: 'huong' }]];
  try {
    const student = await studentService.getStudent(4);
    assert.equal(Object.hasOwn(student, 'gallery_count'), false);
    assert.equal(Object.hasOwn(student, 'view_count'), false);
  } finally {
    pool.execute = original;
  }
});

function mockLetterQueries() {
  const queries = [];
  pool.execute = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
    return [[{ id: 7, student_name: 'An', status: 'pending' }]];
  };
  return queries;
}

test('letter list search escapes LIKE wildcards and matches sender, title, content and recipient', async () => {
  const original = pool.execute;
  const queries = mockLetterQueries();
  try {
    await letterService.listLetters({ status: 'pending', search: '  50%_off  ' });
    const term = '%50\\%\\_off%';
    assert.match(queries[0].sql, /JOIN students s/);
    assert.deepEqual(queries[0].params, ['pending', term, term, term, term]);
    assert.match(
      queries[1].sql,
      /\(l\.sender_name LIKE \? OR l\.title LIKE \? OR l\.content LIKE \? OR s\.full_name LIKE \?\)/,
    );
    assert.deepEqual(queries[1].params, ['pending', term, term, term, term]);
  } finally {
    pool.execute = original;
  }
});

test('letter list "scheduled" filter selects approved letters whose reveal time is still ahead', async () => {
  const original = pool.execute;
  const queries = mockLetterQueries();
  try {
    await letterService.listLetters({ status: 'scheduled', studentId: '3' });
    assert.match(
      queries[1].sql,
      /l\.status = 'approved' AND l\.reveal_at IS NOT NULL AND l\.reveal_at > UTC_TIMESTAMP\(\)/,
    );
    // 'scheduled' không bao giờ lọt vào params — chỉ studentId
    assert.deepEqual(queries[1].params, [3]);
  } finally {
    pool.execute = original;
  }
});

test('letter list rejects malformed search input and the virtual status elsewhere', async () => {
  const original = pool.execute;
  pool.execute = async () => { throw new Error('must not query'); };
  try {
    await assert.rejects(() => letterService.listLetters({ search: ['a', 'b'] }), /search không hợp lệ/);
    await assert.rejects(() => letterService.listLetters({ search: 'x'.repeat(101) }), /tối đa 100/);
    // Trạng thái ảo chỉ dùng để lọc, không được ghi vào lời chúc
    await assert.rejects(() => letterService.updateStatus(1, 'scheduled'), /Trạng thái không hợp lệ/);
  } finally {
    pool.execute = original;
  }
});

test('resolve returns the seat position of each duplicate-name match', async () => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    assert.match(sql, /seat_row, seat_col/);
    return [[
      { full_name: 'Nguyễn A', nickname: 'A', avatar_url: null, access_code: 'a', seat_row: 3, seat_col: 5 },
      { full_name: 'Nguyễn B', nickname: 'B', avatar_url: null, access_code: 'b', seat_row: null, seat_col: null },
    ]];
  };
  try {
    const result = await resolveService.resolve('Nguyễn');
    assert.deepEqual(
      result.matches.map((match) => [match.seatRow, match.seatCol]),
      [[3, 5], [null, null]],
    );
  } finally {
    pool.execute = original;
  }
});

test('dashboard stats count scheduled letters separately from approved ones', async () => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    if (sql.includes('FROM letters')) {
      assert.match(sql, /reveal_at > UTC_TIMESTAMP\(\)/);
      return [[{ pending: 2, approved: 9, rejected: 1, scheduled: '4' }]];
    }
    if (sql.includes('FROM students') && sql.includes('SUM(view_count)')) {
      return [[{ total: 5, active: 4, totalViews: 30 }]];
    }
    if (sql.includes('NOT EXISTS')) return [[{ count: 1 }]];
    if (sql.includes('avatar_url IS NULL')) return [[{ count: 3 }]];
    if (sql.includes('FROM gallery')) return [[{ total: 6 }]];
    if (sql.includes('ORDER BY view_count')) return [[]];
    if (sql.includes('FROM letter_reactions')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };
  try {
    const stats = await statsService.getDashboardStats();
    assert.deepEqual(stats.letters, { pending: 2, approved: 9, rejected: 1, scheduled: 4 });
  } finally {
    pool.execute = original;
  }
});
