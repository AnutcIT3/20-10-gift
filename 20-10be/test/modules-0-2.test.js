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
    assert.deepEqual(inserted.params, [7, null, null, 'Hello', true, 'pending']);
  } finally {
    pool.execute = original;
  }
});

test('module 2: public letters query only approved records', async () => {
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    assert.match(sql, /status = \?/);
    assert.deepEqual(params, [3, 'approved']);
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

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
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

test('module 3: deactivate and rotate-code return the contracted shapes', async () => {
  const original = pool.execute;
  pool.execute = async () => [{ affectedRows: 1 }];
  try {
    assert.deepEqual(await studentService.deactivateStudent(2), { is_active: false });
    const rotated = await studentService.rotateCode(2);
    assert.match(rotated.giftPath, /^\/gift\/[A-Za-z0-9_-]{12}$/);
  } finally {
    pool.execute = original;
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
      file: { path: 'https://image.test/a.jpg', filename: 'gift/a' },
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
    assert.deepEqual(queries[1].params, ['pending', 2, 10, 10]);
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

test('Gemini greeting uses a safe static fallback when API key is unavailable', async () => {
  const original = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await greetingService.generateGreeting('Lan');
    assert.equal(result.source, 'fallback');
    assert.match(result.greeting, /Lan/);
  } finally {
    if (original !== undefined) process.env.GEMINI_API_KEY = original;
  }
});
