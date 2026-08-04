const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-modules-0-2';

const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');
const { signToken, verifyToken } = require('../utils/jwt');
const authMiddleware = require('../middleware/auth');
const honeypot = require('../middleware/honeypot');
const giftService = require('../services/giftService');
const resolveService = require('../services/resolveService');
const authService = require('../services/authService');
const studentService = require('../services/studentService');
const galleryService = require('../services/galleryService');
const letterService = require('../services/letterService');
const galleryController = require('../controllers/galleryController');
const { cloudinary } = require('../config/cloudinary');
const greetingService = require('../services/greetingService');
const reactionService = require('../services/reactionService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('module 0: normalize Vietnamese name and JWT round-trip', () => {
  assert.equal(normalizeName('  Nguyễn  Thúy Vy  '), 'nguyen thuy vy');
  const token = signToken({ sub: 7 });
  assert.equal(verifyToken(token).sub, 7);
});

test('module 0: auth rejects a missing token', () => {
  const res = mockResponse();
  authMiddleware({ headers: {} }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { success: false, message: 'Unauthorized' });
});

test('module 0: auth rejects expired and incorrectly signed tokens', () => {
  for (const token of [
    jwt.sign({ sub: 1 }, process.env.JWT_SECRET, { expiresIn: -1 }),
    jwt.sign({ sub: 1 }, 'different-secret'),
  ]) {
    const res = mockResponse();
    authMiddleware({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('next must not run'));
    assert.equal(res.statusCode, 401);
  }
});

test('module 2: resolve normalizes input, returns at most 10 active matches', async () => {
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    assert.match(sql, /is_active = TRUE/);
    assert.match(sql, /LIMIT 10/);
    assert.deepEqual(params, ['%nguyen%']);
    return [[
      { full_name: 'Nguyễn A', nickname: 'A', avatar_url: null, access_code: 'code-a' },
      { full_name: 'Nguyễn B', nickname: 'B', avatar_url: null, access_code: 'code-b' },
    ]];
  };
  try {
    const result = await resolveService.resolve(' Nguyễn ');
    assert.equal(result.matches.length, 2);
    assert.equal(result.matches[0].giftPath, '/gift/code-a');
  } finally {
    pool.execute = original;
  }
});

test('module 2: resolve rejects empty and one-character input', async () => {
  assert.equal((await resolveService.resolve(' ')).status, 400);
  assert.equal((await resolveService.resolve('a')).status, 400);
});

test('module 2: createLetter validates content and forces trusted fields', async () => {
  await assert.rejects(() => giftService.createLetter(1, { content: 123 }), { statusCode: 400 });
  await assert.rejects(() => giftService.createLetter(1, { content: '   ' }), { statusCode: 400 });
  await assert.rejects(() => giftService.createLetter(1, { content: 'x'.repeat(5001) }), { statusCode: 400 });

  const original = pool.execute;
  let inserted;
  pool.execute = async (sql, params) => {
    inserted = { sql, params };
    return [{ insertId: 99 }];
  };
  try {
    const result = await giftService.createLetter(7, {
      student_id: 999,
      status: 'approved',
      sender_name: ' Hidden sender ',
      content: ' Hello ',
      is_anonymous: true,
    });
    assert.deepEqual(result, { status: 'pending' });
    assert.deepEqual(inserted.params, [7, null, null, 'Hello', true, 'pending', null]);
  } finally {
    pool.execute = original;
  }
});

test('module 2: public letters query only approved records', async () => {
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    assert.match(sql, /status = 'approved'/);
    assert.match(sql, /reveal_at <= NOW\(\)/);
    assert.deepEqual(params, [3]);
    return [[{ id: 1, sender_name: null, content: 'Safe' }]];
  };
  try {
    const rows = await giftService.getApprovedLetters(3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sender_name, null);
  } finally {
    pool.execute = original;
  }
});

test('module 2: honeypot returns fake 201 without calling next', () => {
  const res = mockResponse();
  honeypot({ body: { _website: 'bot.example' } }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { success: true, data: { status: 'pending' } });
});

test('module 0: health and robots endpoints satisfy the contract', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  assert.equal(health.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.match(health.headers.get('content-security-policy'), /https:\/\/res\.cloudinary\.com/);

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
});

test('module 0: CORS accepts dynamic same-origin tunnel hosts and rejects foreign origins', () => {
  assert.equal(
    app.isCorsOriginAllowed(
      'https://gift-demo.trycloudflare.com',
      'gift-demo.trycloudflare.com',
      'https',
    ),
    true,
  );
  assert.equal(
    app.isCorsOriginAllowed('http://localhost:5173', 'localhost:5001', 'http'),
    true,
  );
  assert.equal(
    app.isCorsOriginAllowed('https://evil.example', 'gift-demo.trycloudflare.com', 'https'),
    false,
  );
});

test('module 2: reactions only update approved letters owned by the requested student', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM letters')) return [[{ id: 11 }]];
    if (sql.includes('SELECT id, emoji_key')) return [[]];
    if (sql.startsWith('INSERT INTO letter_reactions')) return [{ insertId: 1 }];
    if (sql.includes('COUNT(*) AS cnt')) {
      return [[{ letter_id: 11, emoji_key: 'love', cnt: 1 }]];
    }
    return [[]];
  };
  try {
    const result = await reactionService.toggleReaction(3, 11, 'love', 'session_123456789');
    assert.deepEqual(result, { active: 'love', counts: { love: 1 } });
    assert.match(calls[0].sql, /student_id = \?/);
    assert.match(calls[0].sql, /status = 'approved'/);
    assert.deepEqual(calls[0].params, [11, 3]);
  } finally {
    pool.execute = original;
  }

  pool.execute = async () => [[]];
  try {
    await assert.rejects(
      () => reactionService.toggleReaction(4, 11, 'love', 'session_123456789'),
      { statusCode: 404 },
    );
  } finally {
    pool.execute = original;
  }
});

test('module 3: login returns a minimal JWT and rejects a wrong password', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const original = pool.execute;
  pool.execute = async () => [[{ id: 42, password_hash: passwordHash }]];
  try {
    const result = await authService.login('admin', 'correct-password');
    assert.equal(verifyToken(result.token).sub, 42);
    assert.equal(await authService.login('admin', 'wrong-password'), null);
  } finally {
    pool.execute = original;
  }
});

test('module 3: login API validates fields and returns token for valid credentials', async (t) => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const original = pool.execute;
  pool.execute = async () => [[{ id: 5, password_hash: passwordHash }]];
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/admin/login`;

  const missing = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(missing.status, 400);

  const wrong = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.equal(wrong.status, 401);

  const valid = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'correct-password' }),
  });
  const body = await valid.json();
  assert.equal(valid.status, 200);
  assert.equal(verifyToken(body.data.token).sub, 5);
});

test('module 3: admin student endpoint requires a token', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/students`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, message: 'Unauthorized' });
});

test('module 3: list students exposes giftPath but not raw access_code', async (t) => {
  const original = pool.execute;
  pool.execute = async () => [[{
    id: 1, full_name: 'Nguyễn An', nickname: 'An', access_code: 'safe-code', is_active: 1,
  }]];
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const token = signToken({ sub: 1 });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/students`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data[0].giftPath, '/gift/safe-code');
  assert.equal(Object.hasOwn(body.data[0], 'access_code'), false);
});

test('module 3: create student normalizes name and retries duplicate access codes', async () => {
  const original = pool.execute;
  let inserts = 0;
  pool.execute = async (sql, params) => {
    if (sql.includes('SELECT id, full_name FROM students')) {
      assert.deepEqual(params, ['nguyen thi an']);
      return [[]];
    }
    if (sql.includes('INSERT INTO students')) {
      inserts += 1;
      assert.equal(params[1], 'nguyen thi an');
      assert.equal(params[6].length, 12);
      if (inserts < 3) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return [{ insertId: 8 }];
    }
    return [[{
      id: 8, full_name: 'Nguyễn Thị An', normalized_name: 'nguyen thi an',
      access_code: 'new-code-123', class_name: 'A1', is_active: 1,
    }]];
  };
  try {
    const student = await studentService.createStudent({ full_name: ' Nguyễn Thị An ' });
    assert.equal(inserts, 3);
    assert.equal(student.giftPath, '/gift/new-code-123');
    assert.equal(Object.hasOwn(student, 'normalized_name'), false);
  } finally {
    pool.execute = original;
  }
});

test('module 3: updating a name also updates normalized_name', async () => {
  const original = pool.execute;
  let updateParams;
  pool.execute = async (sql, params) => {
    if (sql.includes('SELECT id, full_name FROM students')) {
      assert.deepEqual(params, ['do my linh', 3]);
      return [[]];
    }
    if (sql.startsWith('UPDATE')) {
      updateParams = params;
      return [{ affectedRows: 1 }];
    }
    return [[{ id: 3, full_name: 'Đỗ Mỹ Linh', access_code: 'code' }]];
  };
  try {
    await studentService.updateStudent(3, { full_name: 'Đỗ Mỹ Linh' });
    assert.deepEqual(updateParams, ['Đỗ Mỹ Linh', 'do my linh', 3]);
  } finally {
    pool.execute = original;
  }
});

test('module 3: deactivate and manual access-code update return the contracted shapes', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return [{ affectedRows: 1 }];
  };
  try {
    assert.deepEqual(await studentService.deactivateStudent(2), { is_active: false });
    assert.deepEqual(await studentService.updateAccessCode(2, ' Mai-Anh_20 '), {
      giftPath: '/gift/mai-anh_20',
    });
    assert.deepEqual(calls[1].params, ['mai-anh_20', 2]);
    await assert.rejects(() => studentService.updateAccessCode(2, 'mã có dấu'), { statusCode: 400 });
    await assert.rejects(() => studentService.updateAccessCode(2, 'ab'), { statusCode: 400 });
  } finally {
    pool.execute = original;
  }
});

test('module 3: activating a student restores access and rejects an active duplicate name', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('WHERE id = ? LIMIT 1')) return [[{ id: 2, full_name: 'Mai Anh' }]];
    if (sql.includes('normalized_name = ?')) return [[]];
    return [{ affectedRows: 1 }];
  };
  try {
    assert.deepEqual(await studentService.activateStudent(2), { is_active: true });
    assert.ok(calls.some(({ sql }) => sql.includes('SET is_active = TRUE')));

    pool.execute = async (sql) => {
      if (sql.includes('WHERE id = ? LIMIT 1')) return [[{ id: 2, full_name: 'Mai Anh' }]];
      if (sql.includes('normalized_name = ?')) return [[{ id: 3, full_name: 'Mai Anh' }]];
      return [{ affectedRows: 1 }];
    };
    await assert.rejects(() => studentService.activateStudent(2), { statusCode: 409 });
  } finally {
    pool.execute = original;
  }
});

test('module 3: manual access-code update reports duplicate links', async () => {
  const original = pool.execute;
  pool.execute = async () => {
    throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
  };
  try {
    await assert.rejects(
      () => studentService.updateAccessCode(2, 'mai-anh'),
      { statusCode: 409, message: 'Mã link này đã được sử dụng' },
    );
  } finally {
    pool.execute = original;
  }
});

test('module 3: seating update swaps two occupied positions transactionally', async () => {
  const originalGetConnection = pool.getConnection;
  const originalExecute = pool.execute;
  const calls = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) {
        return [[
          { id: 2, seat_row: 1, seat_col: 1 },
          { id: 3, seat_row: 1, seat_col: 2 },
        ]];
      }
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => assert.fail('must not rollback'),
    release: () => calls.push('release'),
  });
  pool.execute = async (sql, params) => [[{
    id: params[0],
    full_name: params[0] === 2 ? 'Mai Anh' : 'Thanh Huyền',
    access_code: `code-${params[0]}`,
  }]];

  try {
    const result = await studentService.updateSeat(2, { seat_row: 1, seat_col: 2 });
    assert.equal(result.action, 'swapped');
    assert.equal(result.student.id, 2);
    assert.equal(result.affectedStudent.id, 3);
    assert.deepEqual(
      calls.filter((call) => typeof call === 'object' && call.sql.startsWith('UPDATE')).map((call) => call.params),
      [[2], [1, 1, 3], [1, 2, 2]],
    );
    assert.ok(calls.includes('commit'));
    assert.ok(calls.includes('release'));
  } finally {
    pool.getConnection = originalGetConnection;
    pool.execute = originalExecute;
  }
});

test('module 3: seating update can clear a position and validates classroom bounds', async () => {
  const originalGetConnection = pool.getConnection;
  const originalExecute = pool.execute;
  const calls = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) return [[{ id: 2, seat_row: 4, seat_col: 3 }]];
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => assert.fail('must not rollback'),
    release: () => calls.push('release'),
  });
  pool.execute = async (sql, params) => [[{
    id: params[0], full_name: 'Mai Anh', access_code: 'mai-anh', seat_row: null, seat_col: null,
  }]];

  try {
    const result = await studentService.updateSeat(2, { seat_row: null, seat_col: null });
    assert.equal(result.action, 'cleared');
    assert.equal(result.affectedStudent, null);
    assert.ok(calls.some((call) => typeof call === 'object'
      && call.sql.startsWith('UPDATE') && call.params[0] === null && call.params[1] === null));
    await assert.rejects(
      () => studentService.updateSeat(2, { seat_row: 7, seat_col: 1 }),
      { statusCode: 400, message: 'Vị trí hàng ghế không hợp lệ' },
    );
    await assert.rejects(
      () => studentService.updateSeat(2, { seat_row: 1, seat_col: null }),
      { statusCode: 400, message: 'Hàng và cột phải được cập nhật cùng nhau' },
    );

    const specialSeat = await studentService.updateSeat(2, { seat_row: 0, seat_col: 9 });
    assert.equal(specialSeat.action, 'moved');
    assert.ok(calls.some((call) => typeof call === 'object'
      && call.sql.startsWith('UPDATE') && call.params[0] === 0 && call.params[1] === 9));
  } finally {
    pool.getConnection = originalGetConnection;
    pool.execute = originalExecute;
  }
});

test('module 3: deleting a student cascades database data and cleans Cloudinary assets', async () => {
  const originalGetConnection = pool.getConnection;
  const originalDestroy = cloudinary.uploader.destroy;
  const calls = [];
  const destroyed = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM gallery')) {
        return [[
          { public_id: 'gift/photo-1', resource_type: 'image' },
          { public_id: 'gift/video-1', resource_type: 'video' },
        ]];
      }
      if (sql.startsWith('DELETE FROM students')) return [{ affectedRows: 1 }];
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => assert.fail('must not rollback'),
    release: () => calls.push('release'),
  });
  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyed.push({ publicId, options });
  };
  try {
    assert.deepEqual(await studentService.deleteStudent(7), {
      deleted: true,
      assetsDeleted: 2,
      assetCleanupFailed: 0,
    });
    assert.deepEqual(destroyed, [
      { publicId: 'gift/photo-1', options: { resource_type: 'image' } },
      { publicId: 'gift/video-1', options: { resource_type: 'video' } },
    ]);
    assert.ok(calls.includes('commit'));
    assert.ok(calls.includes('release'));
  } finally {
    pool.getConnection = originalGetConnection;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('module 4: gallery and letter admin endpoints require a token', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/admin/students/1/gallery`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/letters`)).status, 401);
});

test('module 4: gallery reorder commits only IDs from one student', async () => {
  const original = pool.getConnection;
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return [[{ id: 1, student_id: 9 }, { id: 2, student_id: 9 }]];
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  };
  pool.getConnection = async () => connection;
  try {
    assert.deepEqual(await galleryService.reorder([
      { id: 1, display_order: 1 }, { id: 2, display_order: 0 },
    ]), {});
    assert.ok(calls.includes('commit'));
    assert.equal(calls.includes('rollback'), false);
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: gallery reorder rolls back mixed-student items and rejects duplicates', async () => {
  assert.throws(() => galleryService.validateReorderItems([
    { id: 1, display_order: 0 }, { id: 1, display_order: 1 },
  ]), { statusCode: 400 });

  const original = pool.getConnection;
  let rolledBack = false;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async () => [[{ id: 1, student_id: 9 }, { id: 2, student_id: 10 }]],
    commit: async () => assert.fail('must not commit'),
    rollback: async () => { rolledBack = true; },
    release: () => {},
  });
  try {
    await assert.rejects(() => galleryService.reorder([
      { id: 1, display_order: 0 }, { id: 2, display_order: 1 },
    ]), { statusCode: 400 });
    assert.equal(rolledBack, true);
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: failed DB insert cleans up the uploaded Cloudinary image', async () => {
  const originalCreate = galleryService.createImage;
  const originalDestroy = cloudinary.uploader.destroy;
  let destroyed;
  galleryService.createImage = async () => { throw new Error('db failed'); };
  cloudinary.uploader.destroy = async (publicId) => { destroyed = publicId; };
  try {
    await assert.rejects(() => galleryController.upload({
      body: { student_id: '1' },
      files: { image: [{ path: 'https://image.test/a.jpg', filename: 'gift/a' }] },
    }, mockResponse()), /db failed/);
    assert.equal(destroyed, 'gift/a');
  } finally {
    galleryService.createImage = originalCreate;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('module 4: letter list is filtered and paginated', async () => {
  const original = pool.execute;
  const queries = [];
  pool.execute = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*)')) return [[{ total: 21 }]];
    return [[{ id: 3, student_name: 'An', status: 'pending' }]];
  };
  try {
    const result = await letterService.listLetters({ status: 'pending', studentId: '2', page: '2', pageSize: '10' });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.pagination, { page: 2, pageSize: 10, total: 21, totalPages: 3 });
    assert.match(queries[1].sql, /LIMIT 10 OFFSET 10/);
    assert.deepEqual(queries[1].params, ['pending', 2]);
  } finally {
    pool.execute = original;
  }
});

test('module 4: letter status only accepts approved or rejected', async () => {
  await assert.rejects(() => letterService.updateStatus(1, 'pending'), { statusCode: 400 });
  const original = pool.execute;
  pool.execute = async () => [{ affectedRows: 1 }];
  try {
    assert.deepEqual(await letterService.updateStatus(1, 'approved'), {});
    assert.deepEqual(await letterService.deleteLetter(1), {});
  } finally {
    pool.execute = original;
  }
});

test('module 4: admin can create one letter for multiple students', async () => {
  const original = pool.getConnection;
  const inserts = [];
  const calls = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM students')) return [[{ id: 1 }, { id: 2 }]];
      if (sql.includes('INSERT INTO letters')) {
        inserts.push(params);
        return [{ insertId: inserts.length }];
      }
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  });
  try {
    const result = await letterService.createLetters({
      student_ids: [1, 2],
      sender_name: 'Admin',
      title: '20/10',
      content: 'Chúc bạn thật vui.',
      is_anonymous: false,
      status: 'approved',
    });
    assert.deepEqual(result, { created: 2 });
    assert.equal(inserts.length, 2);
    assert.deepEqual(inserts[0], [1, 'Admin', '20/10', 'Chúc bạn thật vui.', false, 'approved', null]);
    assert.ok(calls.includes('commit'));
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: admin update letter can change recipient and full content', async () => {
  const original = pool.getConnection;
  let updateParams;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params) => {
      if (sql.includes('FROM students')) return [[{ id: 4 }]];
      if (sql.startsWith('UPDATE letters')) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
    commit: async () => {},
    rollback: async () => assert.fail('must not rollback'),
    release: () => {},
  });
  try {
    assert.deepEqual(await letterService.updateLetter(9, {
      student_id: 4,
      sender_name: 'Lớp A1',
      title: 'Mới',
      content: 'Nội dung đã sửa',
      is_anonymous: false,
      status: 'pending',
    }), {});
    assert.deepEqual(updateParams, [4, 'Lớp A1', 'Mới', 'Nội dung đã sửa', false, 'pending', null, 9]);
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: bulk letter actions validate ids and report affected rows', async () => {
  await assert.rejects(() => letterService.bulkUpdateStatus([1, 1], 'approved'), { statusCode: 400 });
  await assert.rejects(() => letterService.bulkDelete([]), { statusCode: 400 });

  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return [{ affectedRows: params.length - (params[0] === 'approved' ? 1 : 0) }];
  };
  try {
    assert.deepEqual(await letterService.bulkUpdateStatus([1, 2, 3], 'approved'), { updated: 3 });
    assert.deepEqual(await letterService.bulkDelete([2, 3]), { deleted: 2 });
    assert.deepEqual(calls[0].params, ['approved', 1, 2, 3]);
    assert.deepEqual(calls[1].params, [2, 3]);
  } finally {
    pool.execute = original;
  }
});

test('module 3: create and update reject exact duplicate visible names', async () => {
  const original = pool.execute;
  pool.execute = async () => [[{ id: 2, full_name: 'Hùng' }]];
  try {
    await assert.rejects(() => studentService.createStudent({ full_name: ' hùng ' }), { statusCode: 409 });
    await assert.rejects(() => studentService.updateStudent(3, { full_name: ' hùng ' }), { statusCode: 409 });
  } finally {
    pool.execute = original;
  }
});

test('module 2: resolve prefers a single exact normalized name over broader matches', async () => {
  const original = pool.execute;
  pool.execute = async () => [[
    { full_name: 'Hùng', nickname: 'Hùng', avatar_url: null, access_code: 'code-hung' },
    { full_name: 'Nguyễn Mạnh Hùng', nickname: 'Hùng', avatar_url: null, access_code: 'code-nguyen-hung' },
  ]];
  try {
    assert.deepEqual(await resolveService.resolve('hùng'), { giftPath: '/gift/code-hung' });
  } finally {
    pool.execute = original;
  }
});

test('module 3: admin me endpoint verifies a token', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/api/auth/admin/me`)).status, 401);

  const token = signToken({ sub: 9 });
  const response = await fetch(`${base}/api/auth/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.adminId, 9);
});

test('module 4: gallery caption can be updated with validation', async () => {
  await assert.rejects(() => galleryService.updateCaption(1, 'x'.repeat(501)), { statusCode: 400 });
  const original = pool.execute;
  let updateParams;
  pool.execute = async (sql, params) => {
    updateParams = params;
    return [{ affectedRows: 1 }];
  };
  try {
    assert.deepEqual(await galleryService.updateCaption(5, '  Ảnh kỷ niệm  '), {});
    assert.deepEqual(updateParams, ['Ảnh kỷ niệm', 5]);
  } finally {
    pool.execute = original;
  }
});

test('Gemini greeting uses safe static fallbacks by audience type when API key is unavailable', async () => {
  const original = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const student = await greetingService.generateGreeting('Lan', 'student');
    const visitor = await greetingService.generateGreeting('Minh Anh', 'visitor');
    assert.equal(Object.hasOwn(student, 'source'), false);
    assert.match(student.greeting, /Lan/);
    assert.match(visitor.greeting, /Minh Anh/);
    assert.match(visitor.greeting, /chưa từng học cùng nhau/);
  } finally {
    if (original !== undefined) process.env.GEMINI_API_KEY = original;
  }
});

test('Gemini greeting rejects invalid audienceType', async () => {
  await assert.rejects(() => greetingService.generateGreeting('Lan', 'unknown'), { statusCode: 400 });
});
