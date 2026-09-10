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
    if (sql.includes('FROM face_match_log')) return [[{ matched: 1, rejected: 0, confirmedYes: 1, confirmedNo: 0 }]];
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

test('avatar links must be uploaded Cloudinary images and are stored without delivery transforms', () => {
  const { validateAvatarUrl } = studentService;
  const original = 'https://res.cloudinary.com/demo/image/upload/v1785341639/gift_20_10/abc.jpg';
  assert.equal(validateAvatarUrl(original), original);
  // Link copy từ trang quà (đã chèn f_auto,…) phải quy về đúng image_url gốc
  assert.equal(
    validateAvatarUrl('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_face,w_600,h_600/v1785341639/gift_20_10/abc.jpg'),
    original,
  );
  assert.equal(validateAvatarUrl('/logoclass.jpg'), '/logoclass.jpg');
  assert.equal(validateAvatarUrl(null), null);
  for (const bad of [
    '//scontent.fbcdn.net/photo.jpg',
    'http://res.cloudinary.com/demo/image/upload/v1/gift_20_10/a.jpg',
    'https://res.cloudinary.com.evil.test/a.jpg',
    'https://user@evil.test/res.cloudinary.com/a.jpg',
    'javascript:alert(1)',
    'không phải link',
  ]) {
    assert.throws(() => validateAvatarUrl(bad), (error) => error.statusCode === 400, bad);
  }
});

test('Cloudinary upload errors blame the photo only when Cloudinary says the photo is bad', () => {
  const { describeUploadError } = require('../config/cloudinary');
  const corrupt = describeUploadError({ http_code: 400, message: 'Invalid image file' }, 'IMG_1.jpg');
  assert.equal(corrupt.statusCode, 400);
  assert.match(corrupt.message, /IMG_1\.jpg/);
  assert.match(corrupt.message, /bỏ ảnh này/);

  const credentials = describeUploadError({ http_code: 401, message: 'Invalid Signature' }, 'IMG_2.jpg');
  assert.equal(credentials.statusCode, 502);
  assert.match(credentials.message, /CLOUDINARY_API_SECRET/);
  assert.doesNotMatch(credentials.message, /bỏ ảnh này/);

  const limited = describeUploadError({ http_code: 420, message: 'Rate Limited' }, 'IMG_3.jpg');
  assert.equal(limited.statusCode, 429);
  assert.doesNotMatch(limited.message, /bỏ ảnh này/);

  const network = describeUploadError({ message: 'socket hang up' }, 'IMG_4.jpg');
  assert.equal(network.statusCode, 502);
});
