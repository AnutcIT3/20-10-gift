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
    // Câu thứ hai lấy cả lớp kèm biệt danh / tên gọi khác
    if (sql.includes('AS search_aliases')) return [[]];
    assert.match(sql, /LIMIT 10/);
    assert.deepEqual(params, ['nguyen%', '% nguyen%', 'class', 'test']);
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
  // Hai dấu kết hợp qua được cổng độ dài nhưng normalize thành chuỗi rỗng
  assert.equal((await resolveService.resolve('́́')).status, 400);
});

test('module 0: accentKey keeps diacritics but ignores where the tone mark was typed', () => {
  const { accentKey, hasDiacritics, sameName } = require('../utils/nameKey');
  assert.notEqual(accentKey('Thúy'), accentKey('Thủy'));
  assert.notEqual(accentKey('Phương'), accentKey('Phượng'));
  assert.equal(accentKey('Thủy'), accentKey('Thuỷ'));
  assert.equal(accentKey('  Hòa  Bình '), accentKey('hoà bình'));
  // Chuỗi NFD (bàn phím macOS, dán từ nơi khác) ra cùng khoá với NFC
  assert.equal(accentKey('Thủy'.normalize('NFD')), accentKey('Thủy'));
  assert.equal(hasDiacritics('thuy'), false);
  assert.equal(hasDiacritics('Thủy'), true);
  assert.equal(hasDiacritics('Đan'), true);
  assert.equal(sameName('Thủy', 'thuy'), true);
  assert.equal(sameName('Phuong', 'Phượng'), true);
  assert.equal(sameName('Thúy', 'Thủy'), false);
});

test('module 2: resolve tells Thúy from Thủy and Phương from Phượng by the accents typed', async () => {
  const original = pool.execute;
  const classRows = [
    { full_name: 'Phương', nickname: '', avatar_url: null, access_code: 'phuong' },
    { full_name: 'Phương Anh', nickname: '', avatar_url: null, access_code: 'phuong-anh' },
    { full_name: 'Phượng', nickname: '', avatar_url: null, access_code: 'phuong2' },
    { full_name: 'Thúy', nickname: '', avatar_url: null, access_code: 'thuy-sac' },
    { full_name: 'Thủy', nickname: '', avatar_url: null, access_code: 'thuy-hoi' },
  ];
  // Giả lập SQL: lọc thô theo tên bỏ dấu, từ đầu một chữ
  pool.execute = async (sql, params) => {
    const prefix = params[0].slice(0, -1);
    return [classRows.filter((row) => ` ${normalizeName(row.full_name)}`.includes(` ${prefix}`))];
  };
  try {
    assert.deepEqual(await resolveService.resolve('Thủy'), { giftPath: '/gift/thuy-hoi' });
    assert.deepEqual(await resolveService.resolve('Thuỷ'), { giftPath: '/gift/thuy-hoi' });
    assert.deepEqual(await resolveService.resolve('thúy'), { giftPath: '/gift/thuy-sac' });
    assert.deepEqual(await resolveService.resolve('Phượng'), { giftPath: '/gift/phuong2' });
    assert.deepEqual(await resolveService.resolve('Phương'), { giftPath: '/gift/phuong' });
    // Gõ dở nhưng đã có dấu: chỉ còn tên bắt đầu đúng như vậy
    assert.deepEqual(await resolveService.resolve('Phượ'), { giftPath: '/gift/phuong2' });
    // Không dấu thì không đoán: vẫn hỏi lại giữa hai bạn
    const thuy = await resolveService.resolve('thuy');
    assert.deepEqual(thuy.matches.map((m) => m.displayName).sort(), ['Thúy', 'Thủy']);
    // Dấu không khớp ai ("Thùy") thì lùi về danh sách, không báo "không tìm thấy"
    const typo = await resolveService.resolve('Thùy');
    assert.deepEqual(typo.matches.map((m) => m.displayName).sort(), ['Thúy', 'Thủy']);
  } finally {
    pool.execute = original;
  }
});

test('module 2: tên gọi khác — "phượng", "cô phượng", "cô giáo" đều vào trang cô; "Phương" vẫn là bạn Phương', async () => {
  const original = pool.execute;
  const classRows = [
    { full_name: 'Phương', nickname: '', avatar_url: null, access_code: 'phuong' },
    { full_name: 'Phương Anh', nickname: '', avatar_url: null, access_code: 'phuong-anh' },
    { full_name: 'Phương Linh', nickname: '', avatar_url: null, access_code: 'phuong-linh' },
    { full_name: 'Cô Giáo', nickname: '', search_aliases: 'Cô Phượng, Phượng', avatar_url: null, access_code: 'co-giao' },
  ];
  pool.execute = async (sql, params) => {
    if (sql.includes('AS search_aliases')) {
      assert.deepEqual(params, ['class', 'test']);
      return [classRows];
    }
    const prefix = params[0].slice(0, -1);
    // Câu theo họ tên không trả cột tên gọi khác
    return [classRows.filter((row) => ` ${normalizeName(row.full_name)}`.includes(` ${prefix}`))
      .map(({ search_aliases: _aliases, ...row }) => row)];
  };
  try {
    for (const typed of ['phượng', 'Phượng', 'cô phượng', 'Cô Phượng', 'co phuong', 'cô giáo', 'Cô Giáo', 'co giao', ' CÔ   PHƯỢNG ']) {
      assert.deepEqual(await resolveService.resolve(typed), { giftPath: '/gift/co-giao' }, typed);
    }
    // Có dấu khác: vẫn là bạn Phương, không phải cô
    assert.deepEqual(await resolveService.resolve('Phương'), { giftPath: '/gift/phuong' });
    // Không dấu thì không đoán: hỏi lại giữa bạn Phương và cô
    const bare = await resolveService.resolve('phuong');
    assert.deepEqual(bare.matches.map((m) => m.displayName).sort(), ['Cô Giáo', 'Phương']);
    // Gõ dở "phượ" (có dấu) cũng chỉ ra cô
    assert.deepEqual(await resolveService.resolve('phượ'), { giftPath: '/gift/co-giao' });
  } finally {
    pool.execute = original;
  }
});

test('module 2: gõ cả họ tên, biệt danh, hay "Anh" giữa Ánh và Hải Anh — không mở nhầm ai', async () => {
  const original = pool.execute;
  const rowsOf = (list) => list.map(([full_name, nickname, access_code]) => ({ full_name, nickname, avatar_url: null, access_code }));
  const classRows = rowsOf([
    ['Phương', 'Phương', 'phuong'], ['Phương Anh', 'Phanh', 'phuong-anh'], ['Thủy', 'Thủy Phin', 'thuy'],
    ['Vũ Huyền', 'Vũ Huyền', 'vu-huyen'], ['Mai Huyền', 'Mai Huyền', 'mai-huyen'], ['Diệu Linh', 'Linh Tần', 'dieu-linh'],
  ]);
  const friendRows = rowsOf([['Ánh', null, 'anh'], ['Hải Anh', null, 'hai-anh'], ['Vân Anh', null, 'van-anh']]);
  pool.execute = async (sql, params) => {
    const list = params.includes('friend') ? friendRows : classRows;
    if (sql.includes('AS search_aliases')) return [list.map((row) => ({ ...row, search_aliases: null }))];
    const prefix = params[0].slice(0, -1);
    return [list.filter((row) => ` ${normalizeName(row.full_name)}`.includes(` ${prefix}`))];
  };
  const path = async (typed, scope) => (await resolveService.resolve(typed, scope)).giftPath;
  try {
    // Cả họ tên: chỉ còn tên trong danh sách
    assert.equal(await path('Nguyễn Thị Phương'), '/gift/phuong');
    assert.equal(await path('nguyen thi phuong anh'), '/gift/phuong-anh');
    assert.equal(await path('Trần Thị Thủy'), '/gift/thuy');
    assert.equal(await path('Lê Thị Diệu Linh'), '/gift/dieu-linh');
    // Danh sách ghi họ + tên ("Vũ Huyền"), bạn gõ thêm tên đệm
    assert.equal(await path('Vũ Thị Huyền'), '/gift/vu-huyen');
    // Chỉ trùng một chữ thì không mở: "Nguyễn Thị Mai" không phải Mai Huyền
    assert.equal((await resolveService.resolve('Nguyễn Thị Mai')).status, 404);
    // Biệt danh
    assert.equal(await path('Thủy Phin'), '/gift/thuy');
    assert.equal(await path('phanh'), '/gift/phuong-anh');
    assert.equal(await path('linh tan'), '/gift/dieu-linh');
    // "Anh" không dấu: có thể là Ánh, cũng đúng là chữ của Hải Anh, Vân Anh → hỏi lại
    const anh = await resolveService.resolve('Anh', 'friend');
    assert.deepEqual(anh.matches.map((m) => m.displayName), ['Ánh', 'Hải Anh', 'Vân Anh']);
    assert.equal(await path('Ánh', 'friend'), '/gift/anh');
    assert.equal(await path('Hải Anh', 'friend'), '/gift/hai-anh');
    // Dấu không khớp ai ("Phượng" khi lớp chỉ có Phương): hỏi lại, không mở thẳng
    const guess = await resolveService.resolve('Phượng');
    assert.equal(guess.giftPath, undefined);
    assert.deepEqual(guess.matches.map((m) => m.displayName), ['Phương']);
    const single = await resolveService.resolve('Thùy Phìn');
    assert.deepEqual(single.matches.map((m) => m.displayName), ['Thủy']);
    assert.equal(single.unsure, true);
    assert.match(single.message, /Không thấy ai tên đúng như vậy/);
  } finally {
    pool.execute = original;
  }
});

test('module 2: resolve endpoint stays public despite sharing /api/students with admin routes', async (t) => {
  const original = pool.execute;
  pool.execute = async () => [[{
    full_name: 'Nguyễn A', nickname: 'A', avatar_url: null, access_code: 'code-a',
  }]];
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  // Không gửi token: nếu thứ tự mount trong server.js bị đảo, request này sẽ 401
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/students/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nguyễn A' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.giftPath, '/gift/code-a');
});

test('khoá chờ 20/10: tra tên vẫn chạy cho form gửi lời chúc nhưng không lộ ảnh đại diện hay chỗ ngồi', async (t) => {
  const original = pool.execute;
  let locked = '1';
  pool.execute = async (sql, params) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: params?.[0] === 'face_only' ? '0' : locked }]];
    return [[
      { full_name: 'Diệu Linh', nickname: 'Linh Tần', avatar_url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg', access_code: 'linh-a', seat_row: 2, seat_col: 3 },
      { full_name: 'Phương Linh', nickname: null, avatar_url: 'https://res.cloudinary.com/demo/image/upload/v1/b.jpg', access_code: 'linh-b', seat_row: 4, seat_col: 1 },
    ]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const lookup = async () => (await (await fetch(`http://127.0.0.1:${server.address().port}/api/students/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'linh' }),
  })).json()).data;

  const hidden = await lookup();
  // Họ tên + biệt danh đủ để chọn đúng người nhận lời chúc
  assert.deepEqual(hidden.matches.map((match) => [match.displayName, match.nickname]), [['Diệu Linh', 'Linh Tần'], ['Phương Linh', '']]);
  assert.ok(hidden.matches.every((match) => match.avatarUrl === '' && match.seatRow === null && match.seatCol === null));
  assert.equal(JSON.stringify(hidden).includes('cloudinary'), false);

  // Quà mở: danh sách trùng tên có lại ảnh và chỗ ngồi
  locked = '0';
  const shown = await lookup();
  assert.equal(shown.matches[0].avatarUrl, 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg');
  assert.deepEqual([shown.matches[0].seatRow, shown.matches[0].seatCol], [2, 3]);
});

test('module 0: ipKey collapses IPv6 to /64 and keeps IPv4 intact', () => {
  const ipKey = require('../utils/ipKey');
  assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
  assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(
    ipKey('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd'),
    ipKey('2001:db8:abcd:12:1111:2222:3333:4444'),
  );
  assert.notEqual(
    ipKey('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd'),
    ipKey('2001:db8:abcd:13:aaaa:bbbb:cccc:dddd'),
  );
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
});

test('module 2: resolve escapes LIKE wildcards so input cannot match everything', async () => {
  const original = pool.execute;
  let captured;
  pool.execute = async (sql, params) => {
    if (sql.includes('AS search_aliases')) return [[]];
    captured = params;
    return [[{ full_name: 'Nguyễn A', nickname: 'A', avatar_url: null, access_code: 'code-a' }]];
  };
  try {
    await resolveService.resolve('%_');
    assert.deepEqual(captured, ['\\%\\_%', '% \\%\\_%', 'class', 'test']);

    await resolveService.resolve('minh thư', 'friend');
    assert.deepEqual(captured, ['minh thu%', '% minh thu%', 'friend']);
  } finally {
    pool.execute = original;
  }
});

test('module 2: createLetter validates content and forces trusted fields', async () => {
  await assert.rejects(() => giftService.createLetter(1, { content: 123 }), { statusCode: 400 });
  await assert.rejects(() => giftService.createLetter(1, { content: '   ' }), { statusCode: 400 });
  await assert.rejects(() => giftService.createLetter(1, { content: 'x'.repeat(5001) }), { statusCode: 400 });

  const original = pool.getConnection;
  const inserted = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params) => {
      inserted.push({ sql, params });
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => assert.fail('must not rollback'),
    release: () => {},
  });
  try {
    const result = await giftService.createLetter(7, {
      student_id: 999,
      status: 'approved',
      sender_name: ' Hidden sender ',
      content: ' Hello ',
      is_anonymous: true,
    });
    assert.equal(result.status, 'pending');
    assert.deepEqual(inserted[0].params, [7, null, null, 'Hello', true, 'pending', null, null, null]);
    // Không kèm ảnh thì không ghi gì vào letter_images
    assert.equal(inserted.length, 1);

    // Bốn ảnh: cột cũ giữ ảnh đầu, đủ bốn ảnh vào letter_images đúng thứ tự
    inserted.length = 0;
    const images = [1, 2, 3, 4].map((n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/${n}.jpg`, publicId: `gift_20_10/${n}` }));
    await giftService.createLetter(7, { content: 'Bốn ảnh', is_anonymous: true }, images);
    assert.deepEqual(inserted[0].params.slice(-2), [images[0].url, images[0].publicId]);
    assert.match(inserted[1].sql, /INSERT INTO letter_images/);
    assert.deepEqual(inserted[1].params, images.flatMap((image, index) => [99, image.url, image.publicId, index]));
  } finally {
    pool.getConnection = original;
  }
});

test('module 2: public letters query only approved records', async () => {
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    if (sql.includes('FROM letter_images')) {
      return [[{ id: 5, letter_id: 1, image_url: 'a.jpg' }, { id: 6, letter_id: 1, image_url: 'b.jpg' }]];
    }
    assert.match(sql, /status = 'approved'/);
    assert.match(sql, /reveal_at <= UTC_TIMESTAMP\(\)/);
    assert.deepEqual(params, [3]);
    return [[{ id: 1, sender_name: null, content: 'Safe', image_url: 'a.jpg' }, { id: 2, content: 'Cũ', image_url: 'old.jpg' }]];
  };
  try {
    const rows = await giftService.getApprovedLetters(3);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].sender_name, null);
    assert.deepEqual(rows[0].images, [{ id: 5, url: 'a.jpg' }, { id: 6, url: 'b.jpg' }]);
    // Thư chưa có dòng ở bảng mới thì lấy ảnh ở cột cũ
    assert.deepEqual(rows[1].images, [{ id: null, url: 'old.jpg' }]);
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

test('module 2: concurrent duplicate reactions upsert instead of raising 500', async () => {
  const original = pool.execute;
  let insertSql;
  pool.execute = async (sql) => {
    if (sql.includes('FROM letters')) return [[{ id: 11 }]];
    if (sql.includes('SELECT id, emoji_key')) return [[]];
    if (sql.startsWith('INSERT INTO letter_reactions')) {
      insertSql = sql;
      return [{ affectedRows: 2 }];
    }
    if (sql.includes('COUNT(*) AS cnt')) return [[{ letter_id: 11, emoji_key: 'love', cnt: 1 }]];
    return [[]];
  };
  try {
    const result = await reactionService.toggleReaction(3, 11, 'love', 'session_123456789');
    assert.equal(result.active, 'love');
    assert.match(insertSql, /ON DUPLICATE KEY UPDATE/);
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
      assert.equal(params[8].length, 12);
      assert.equal(params[9], 0);
      assert.equal(params[10], 9);
      if (inserts < 3) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return [{ insertId: 8 }];
    }
    return [[{
      id: 8, full_name: 'Nguyễn Thị An', normalized_name: 'nguyen thi an',
      access_code: 'new-code-123', class_name: 'A1', is_active: 1,
    }]];
  };
  try {
    const student = await studentService.createStudent({
      full_name: ' Nguyễn Thị An ', seat_row: 0, seat_col: 9,
    });
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

test('module 3: create and update validate seat coordinates as a pair', async () => {
  await assert.rejects(
    () => studentService.createStudent({ full_name: 'Mai Anh', seat_row: 7, seat_col: 1 }),
    { statusCode: 400, message: 'Vị trí hàng ghế không hợp lệ' },
  );
  await assert.rejects(
    () => studentService.updateStudent(3, { seat_row: 1 }),
    { statusCode: 400, message: 'Hàng và cột phải được cập nhật cùng nhau' },
  );
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
  const originalCreate = galleryService.createImages;
  const originalDestroy = cloudinary.uploader.destroy;
  let destroyed;
  galleryService.createImages = async () => { throw new Error('db failed'); };
  cloudinary.uploader.destroy = async (publicId) => { destroyed = publicId; };
  try {
    await assert.rejects(() => galleryController.upload({
      body: { student_id: '1' },
      files: { image: [{ path: 'https://image.test/a.jpg', filename: 'gift/a' }] },
    }, mockResponse()), /db failed/);
    assert.equal(destroyed, 'gift/a');
  } finally {
    galleryService.createImages = originalCreate;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('module 4: gallery upload inserts every image in one transaction', async () => {
  const original = pool.getConnection;
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM students')) return [[{ id: 9 }]];
      if (sql.includes('MAX(display_order)')) return [[{ next_order: 4 }]];
      return [{ insertId: calls.length }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  };
  pool.getConnection = async () => connection;
  try {
    const images = await galleryService.createImages({
      studentId: 9,
      files: [
        { imageUrl: 'https://image.test/a.jpg', publicId: 'gift/a' },
        { imageUrl: 'https://image.test/b.jpg', publicId: 'gift/b' },
      ],
      caption: 'hi',
    });
    assert.equal(images.length, 2);
    assert.deepEqual(images.map((image) => image.public_id), ['gift/a', 'gift/b']);
    const inserts = calls.filter((call) => call.sql?.startsWith('INSERT INTO gallery'));
    assert.deepEqual(inserts.map((call) => call.params[4]), [4, 5]);
    assert.ok(calls.includes('commit'));
    assert.equal(calls.includes('rollback'), false);
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: gallery upload rolls back every insert when one fails', async () => {
  const original = pool.getConnection;
  let rolledBack = false;
  let inserts = 0;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql) => {
      if (sql.includes('FROM students')) return [[{ id: 9 }]];
      if (sql.includes('MAX(display_order)')) return [[{ next_order: 0 }]];
      inserts += 1;
      if (inserts === 2) throw new Error('db failed');
      return [{ insertId: inserts }];
    },
    commit: async () => assert.fail('must not commit'),
    rollback: async () => { rolledBack = true; },
    release: () => {},
  });
  try {
    await assert.rejects(() => galleryService.createImages({
      studentId: 9,
      files: [
        { imageUrl: 'https://image.test/a.jpg', publicId: 'gift/a' },
        { imageUrl: 'https://image.test/b.jpg', publicId: 'gift/b' },
      ],
      caption: null,
    }), /db failed/);
    assert.equal(rolledBack, true);
  } finally {
    pool.getConnection = original;
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
  pool.execute = async (sql) => {
    if (sql.includes('SELECT image_public_id FROM letters WHERE id = ? LIMIT 1')) return [[{ image_public_id: null }]];
    if (sql.startsWith('SELECT')) return [[]];
    return [{ affectedRows: 1 }];
  };
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
    assert.deepEqual(inserts[0], [1, 'Admin', 'guest', '20/10', 'Chúc bạn thật vui.', false, 'approved', null, null, null]);
    assert.ok(calls.includes('commit'));
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: an admin letter with a photo gives every recipient the same uploaded photo', async () => {
  const original = pool.getConnection;
  const inserts = [];
  const imageRows = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params) => {
      if (sql.includes('FROM students')) return [[{ id: 1 }, { id: 2 }]];
      if (sql.includes('INSERT INTO letters')) {
        inserts.push(params);
        return [{ insertId: 100 + inserts.length }];
      }
      if (sql.includes('INSERT INTO letter_images')) imageRows.push(params);
      return [[]];
    },
    commit: async () => {},
    rollback: async () => assert.fail('must not rollback'),
    release: () => {},
  });
  try {
    const images = ['a', 'b'].map((name) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/${name}.jpg`, publicId: `gift_20_10/${name}` }));
    assert.deepEqual(await letterService.createLetters({
      student_ids: [1, 2], sender_name: 'Admin', sender_kind: 'classmate', content: 'Chúc mừng 20/10!',
    }, images), { created: 2 });
    // Cột cũ = ảnh đầu; mỗi người nhận có đủ hai ảnh (dùng chung một bản upload)
    assert.deepEqual(inserts.map((params) => params.slice(-2)), [[images[0].url, images[0].publicId], [images[0].url, images[0].publicId]]);
    assert.deepEqual(imageRows, [101, 102].map((letterId) => images.flatMap((image, index) => [letterId, image.url, image.publicId, index])));
  } finally {
    pool.getConnection = original;
  }
});

test('module 4: deleting one copy of a shared admin photo keeps it for the other recipients', async () => {
  const original = pool.execute;
  const originalDestroy = cloudinary.uploader.destroy;
  const destroyed = [];
  // Hai thư (1, 2) dùng chung ảnh 'shared' (+ ảnh thứ hai 'shared-2' ở
  // letter_images); thư 3 có ảnh riêng 'own'
  let letters = [
    { id: 1, image_public_id: 'shared' },
    { id: 2, image_public_id: 'shared' },
    { id: 3, image_public_id: 'own' },
  ];
  let letterImages = [
    { letter_id: 1, public_id: 'shared' }, { letter_id: 1, public_id: 'shared-2' },
    { letter_id: 2, public_id: 'shared' }, { letter_id: 2, public_id: 'shared-2' },
    { letter_id: 3, public_id: 'own' },
  ];
  pool.execute = async (sql, params) => {
    if (sql.startsWith('SELECT image_public_id FROM letters WHERE id = ?')) {
      return [letters.filter((row) => row.id === params[0])];
    }
    if (sql.startsWith('SELECT image_public_id AS public_id FROM letters WHERE id IN')) {
      return [letters.filter((row) => params.includes(row.id)).map((row) => ({ public_id: row.image_public_id }))];
    }
    if (sql.startsWith('SELECT public_id FROM letter_images WHERE letter_id IN')) {
      return [letterImages.filter((row) => params.includes(row.letter_id))];
    }
    if (sql.startsWith('DELETE FROM letters WHERE id = ?')) {
      const before = letters.length;
      letters = letters.filter((row) => row.id !== params[0]);
      letterImages = letterImages.filter((row) => row.letter_id !== params[0]);
      return [{ affectedRows: before - letters.length }];
    }
    if (sql.startsWith('SELECT DISTINCT image_public_id AS public_id FROM letters')) {
      return [letters.filter((row) => params.includes(row.image_public_id)).map((row) => ({ public_id: row.image_public_id }))];
    }
    if (sql.startsWith('SELECT DISTINCT public_id AS public_id FROM letter_images')) {
      return [letterImages.filter((row) => params.includes(row.public_id))];
    }
    if (sql.startsWith('SELECT DISTINCT')) return [[]];
    return assert.fail(`unexpected SQL: ${sql}`);
  };
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  try {
    await letterService.deleteLetter(1);
    assert.deepEqual(destroyed, [], 'thư 2 vẫn dùng ảnh — chưa được xoá');
    await letterService.deleteLetter(2);
    assert.deepEqual(destroyed, ['shared', 'shared-2'], 'thư cuối cùng dùng ảnh đã xoá — giờ mới dọn');
    await letterService.deleteLetter(3);
    assert.deepEqual(destroyed, ['shared', 'shared-2', 'own']);
  } finally {
    pool.execute = original;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('module 4: deleting a student keeps a shared admin photo another letter still uses', async () => {
  const originalGetConnection = pool.getConnection;
  const originalExecute = pool.execute;
  const originalDestroy = cloudinary.uploader.destroy;
  const destroyed = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql) => {
      if (sql.includes('FROM gallery')) {
        return [[
          { public_id: 'gift/photo-1', resource_type: 'image', from_letter: 0 },
          { public_id: 'shared', resource_type: 'image', from_letter: 1 },
          { public_id: 'own', resource_type: 'image', from_letter: 1 },
        ]];
      }
      // Ảnh thứ hai của thư, và ảnh lời chúc riêng (trùng với ảnh đã có → dọn một lần)
      if (sql.includes('FROM letter_images')) return [[{ public_id: 'own-2' }]];
      if (sql.includes('FROM wish_images')) return [[{ public_id: 'own' }]];
      if (sql.startsWith('DELETE FROM students')) return [{ affectedRows: 1 }];
      return [[]];
    },
    commit: async () => {},
    rollback: async () => assert.fail('must not rollback'),
    release: () => {},
  });
  // Sau khi xoá học sinh, 'shared' vẫn nằm trong thư của một bạn khác
  pool.execute = async (sql) => {
    assert.match(sql, /SELECT DISTINCT/);
    if (sql.includes('FROM letters ')) return [[{ public_id: 'shared' }]];
    return [[]];
  };
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  try {
    const result = await studentService.deleteStudent(7);
    assert.deepEqual(destroyed.sort(), ['gift/photo-1', 'own', 'own-2']);
    assert.equal(result.assetsDeleted, 3);
  } finally {
    pool.getConnection = originalGetConnection;
    pool.execute = originalExecute;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('module 4: a multipart admin letter with one recipient still reads student_ids as a list', () => {
  const { normalizeMultipartLetterBody } = require('../utils/letterUpload');
  const multipart = (body) => ({ is: (type) => type === 'multipart/form-data', body });
  assert.deepEqual(normalizeMultipartLetterBody(multipart({ student_ids: '5', is_anonymous: 'false' })).student_ids, ['5']);
  assert.deepEqual(normalizeMultipartLetterBody(multipart({ student_ids: ['5', '6'] })).student_ids, ['5', '6']);
  // JSON thì giữ nguyên: chuỗi vẫn bị sanitize từ chối như trước
  const json = { is: () => false, body: { student_ids: '5' } };
  assert.equal(normalizeMultipartLetterBody(json).student_ids, '5');
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
    assert.deepEqual(updateParams, [4, 'Lớp A1', 'guest', 'Mới', 'Nội dung đã sửa', false, 'pending', null, 9]);
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
    if (sql.startsWith('SELECT')) return [[]];
    return [{ affectedRows: params.length - (params[0] === 'approved' ? 1 : 0) }];
  };
  try {
    assert.deepEqual(await letterService.bulkUpdateStatus([1, 2, 3], 'approved'), { updated: 3 });
    assert.deepEqual(await letterService.bulkDelete([2, 3]), { deleted: 2 });
    assert.deepEqual(calls[0].params, ['approved', 1, 2, 3]);
    // bulkDelete: SELECT ảnh trước rồi mới DELETE
    assert.match(calls[1].sql, /SELECT image_public_id/);
    assert.match(calls[2].sql, /FROM letter_images/);
    assert.match(calls[3].sql, /^DELETE FROM letters/);
    assert.deepEqual(calls[3].params, [2, 3]);
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

test('module 3: admin thêm được khách ngoài lớp (không chỗ ngồi, lớp "Bạn bè"), nhưng không biến hồ sơ lớp thành khách', async () => {
  const original = pool.execute;
  const inserts = [];
  const friends = [{ id: 40, full_name: 'Minh Thư' }];
  pool.execute = async (sql, params) => {
    // Khách trùng tên khách thì chặn; trùng tên bạn trong lớp ("Hùng") thì không
    if (sql.includes("member_type = 'friend' AND normalized_name = ?")) {
      return [friends.filter((row) => normalizeName(row.full_name) === params[0])];
    }
    if (sql.includes("member_type IN ('class', 'test')")) return [[{ id: 2, full_name: 'Hùng' }]];
    if (sql.startsWith('INSERT INTO students')) { inserts.push(params); return [{ insertId: 41 }]; }
    if (sql.includes('FROM students') && sql.includes('WHERE id = ?')) return [[{ id: 41, full_name: 'Hùng', member_type: 'friend' }]];
    return [[]];
  };
  try {
    await studentService.createStudent({ full_name: 'Hùng', member_type: 'friend', seat_row: 1, seat_col: 2 });
    const [row] = inserts;
    // full_name, …, class_name (vị trí 7), access_code, seat_row, seat_col, member_type
    assert.equal(row[7], 'Bạn bè');
    assert.deepEqual(row.slice(9), [null, null, 'friend']);
    await assert.rejects(() => studentService.createStudent({ full_name: 'minh thư', member_type: 'friend' }), { statusCode: 409 });
    // Đã tạo rồi thì không sửa thành khách được
    await assert.rejects(() => studentService.updateStudent(3, { member_type: 'friend' }), { statusCode: 400 });
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

test('module 3: admin me endpoint verifies a token and admin existence', async (t) => {
  const original = pool.execute;
  let adminRows = [{ id: 9 }];
  pool.execute = async (sql) => {
    if (sql.includes('FROM admins')) return [adminRows];
    return [[]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
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

  // Admin đã bị xóa → token còn hạn vẫn phải bị từ chối
  adminRows = [];
  const revoked = await fetch(`${base}/api/auth/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(revoked.status, 401);

  // Lỗi DB tạm thời phải là 500, KHÔNG phải 401 — 401 khiến frontend xóa phiên
  pool.execute = async () => { throw new Error('connection refused'); };
  const dbDown = await fetch(`${base}/api/auth/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(dbDown.status, 500);
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
    const classmate = await greetingService.generateGreeting('Tuấn', 'classmate');
    assert.equal(Object.hasOwn(student, 'source'), false);
    assert.match(student.greeting, /Lan/);
    assert.match(visitor.greeting, /Minh Anh/);
    assert.match(visitor.greeting, /chưa từng học cùng nhau/);
    assert.match(classmate.greeting, /Tuấn/);
    assert.match(classmate.greeting, /một phần của lớp mình/);
    // Người đọc trang này thường là chính các bạn nam làm quà: không xưng "tụi tớ"
    assert.equal(/tụi tớ/i.test(classmate.greeting), false);
  } finally {
    if (original !== undefined) process.env.GEMINI_API_KEY = original;
  }
});

test('khách có Face ID là bạn thân: lời chúc dự phòng thân mật, không nhắc chuyện khác lớp', async () => {
  const original = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { greeting } = await greetingService.generateGreeting('quyeniuu', 'close_friend');
    assert.match(greeting, /quyeniuu/);
    assert.match(greeting, /bạn thân của tụi tớ/);
    assert.equal(/chưa từng học cùng|không học cùng|dù không/i.test(greeting), false);
  } finally {
    if (original !== undefined) process.env.GEMINI_API_KEY = original;
  }
});

test('trang quà của khách báo có phải bạn thân (có Face ID) không; bạn trong lớp không cần hỏi thêm', async () => {
  const original = pool.execute;
  const queries = [];
  pool.execute = async (sql, params) => {
    queries.push(sql);
    if (sql.includes('WHERE access_code = ?')) {
      const rows = {
        quyen: [{ id: 29, full_name: 'Trần Hoàng Quyên', member_type: 'friend' }],
        thu: [{ id: 40, full_name: 'Minh Thư', member_type: 'friend' }],
        vy: [{ id: 3, full_name: 'Vy', member_type: 'class' }],
      };
      return [rows[params[0]] || []];
    }
    if (sql.includes('FROM face_profiles')) return [params[0] === 29 ? [{ found: 1 }] : []];
    return [[]];
  };
  try {
    assert.equal((await giftService.getStudentByCode('quyen')).close_friend, true);
    assert.equal((await giftService.getStudentByCode('thu')).close_friend, false);
    const classmate = await giftService.getStudentByCode('vy');
    assert.equal(Object.hasOwn(classmate, 'close_friend'), false);
    assert.equal(queries.filter((sql) => sql.includes('face_profiles')).length, 2);
  } finally {
    pool.execute = original;
  }
});

test('Gemini greeting rejects invalid audienceType', async () => {
  await assert.rejects(() => greetingService.generateGreeting('Lan', 'unknown'), { statusCode: 400 });
});

test('gift lock: locked blocks viewing with 423 but letter submission still works', async (t) => {
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: '1' }]];
    if (sql.includes('FROM students') && sql.includes('access_code')) {
      return [[{ id: 3, full_name: 'Nguyễn A', is_active: 1 }]];
    }
    if (sql.includes('revision = revision + 1')) return [{ affectedRows: 1 }];
    return [[]];
  };
  // Gửi lời chúc ghi trong một transaction (thư + ảnh kèm)
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async () => [{ insertId: 50 }],
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
    pool.getConnection = originalGetConnection;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Route XEM bị khóa
  const viewResponse = await fetch(`${base}/api/gifts/some-code`);
  assert.equal(viewResponse.status, 423);
  const viewBody = await viewResponse.json();
  assert.match(viewBody.message, /20\/10/);

  // Gửi lời chúc vẫn hoạt động — mục đích của tính năng
  const letterResponse = await fetch(`${base}/api/gifts/some-code/letters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Chúc mừng 20/10!', is_anonymous: true }),
  });
  assert.equal(letterResponse.status, 201);
});

test('gift lock: admin settings endpoint requires auth, toggles and validates input', async (t) => {
  const original = pool.execute;
  let storedValue = '0';
  pool.execute = async (sql, params) => {
    if (sql.includes('FROM admins')) return [[{ id: 1 }]];
    if (sql.includes('FROM app_settings')) return [[{ setting_value: storedValue }]];
    if (sql.startsWith('INSERT INTO app_settings')) {
      // Đổi khoá còn xoá giờ tự mở (gift_unlock_at) — chỉ theo dõi công tắc khoá
      if (params[0] === 'gift_pages_locked') storedValue = params[1];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('revision = revision + 1')) return [{ affectedRows: 1 }];
    return [[]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/api/admin/settings`)).status, 401);

  const token = signToken({ sub: 1 });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const toggled = await fetch(`${base}/api/admin/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ gift_pages_locked: true }),
  });
  assert.equal(toggled.status, 200);
  assert.equal(storedValue, '1');
  assert.deepEqual((await toggled.json()).data, { gift_pages_locked: true });

  const invalid = await fetch(`${base}/api/admin/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ gift_pages_locked: 'yes' }),
  });
  assert.equal(invalid.status, 400);
});

test('gift lock: locked also blocks the celebrate greeting endpoint', async (t) => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: '1' }]];
    return [[]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/greetings/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Thư', audienceType: 'visitor' }),
  });
  assert.equal(response.status, 423);
});

test('admin xem thử được lời chúc tự động cả khi trang quà đang khoá; người ngoài thì không', async (t) => {
  const original = pool.execute;
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  pool.execute = async (sql) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: '1' }]];
    if (sql.includes('FROM admins')) return [[{ id: 1 }]];
    return [[]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const preview = (headers) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/greetings/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'Bó tần', audienceType: 'close_friend' }),
  });

  assert.equal((await preview({})).status, 401);
  const response = await preview({ Authorization: `Bearer ${signToken({ sub: 1 })}` });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.match(data.greeting, /Bó tần/);
});

test('endpoint lời chúc nhận kiểu "bạn thân" — controller và service dùng chung một danh sách', async (t) => {
  const original = pool.execute;
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  pool.execute = async (sql) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: '0' }]];
    return [[]];
  };
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = original;
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/greetings/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const ok = await post({ name: 'quyeniuu', audienceType: 'close_friend' });
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).data.greeting, /bạn thân của tụi tớ/);
  assert.equal((await post({ name: 'quyeniuu', audienceType: 'bestie' })).status, 400);
});

test('friend letters: chỉ gửi được cho khách đã có — không có thì 404, không tự tạo hồ sơ', async () => {
  const friendService = require('../services/friendService');
  const original = pool.getConnection;
  const calls = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT') && sql.includes("member_type = 'friend'")) {
        return [params[0] === 'minh thu' ? [{ id: 77, full_name: 'Minh Thư' }] : []];
      }
      if (sql.includes('INSERT INTO letters')) return [{ insertId: 500 }];
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  });
  try {
    const sent = await friendService.createFriendLetter({
      receiver_name: ' minh thư ', content: 'Chúc mừng 20/10!', is_anonymous: true,
    });
    assert.deepEqual([sent.status, sent.friend_created], ['pending', false]);
    const letterInsert = calls.find((call) => call.sql?.includes('INSERT INTO letters'));
    assert.equal(letterInsert.params[0], 77);
    assert.equal(letterInsert.params[5], 'pending');

    await assert.rejects(
      () => friendService.createFriendLetter({ receiver_name: 'phương anh', content: 'Chúc', is_anonymous: true }),
      { statusCode: 404, message: /Không có khách tên "phương anh"/ },
    );
    assert.equal(calls.some((call) => call.sql?.includes('INSERT INTO students')), false);
    assert.equal(calls.filter((call) => call.sql?.includes('INSERT INTO letters')).length, 1);
  } finally {
    pool.getConnection = original;
  }
});

test('friend letters: a letter to "Phượng" never lands in the profile of "Phương"', async () => {
  const friendService = require('../services/friendService');
  const original = pool.getConnection;
  const friends = [{ id: 40, full_name: 'Phương' }, { id: 41, full_name: 'Phượng' }];
  const letterTargets = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, params) => {
      if (sql.startsWith('SELECT') && sql.includes("member_type = 'friend'")) {
        return [friends.filter((row) => normalizeName(row.full_name) === params[0])];
      }
      if (sql.includes('INSERT INTO letters')) { letterTargets.push(params[0]); return [{ insertId: 1 }]; }
      return [[]];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });
  try {
    for (const name of ['Phượng', 'phuong', 'PHƯỢNG', 'Phương']) {
      await friendService.createFriendLetter({ receiver_name: name, content: 'Chúc 20/10!', is_anonymous: true });
    }
    // Đúng dấu thì về đúng hồ sơ; không dấu thì về hồ sơ đầu tiên cùng chữ
    assert.deepEqual(letterTargets, [41, 40, 41, 40]);
  } finally {
    pool.getConnection = original;
  }
});

test('ảnh kèm lời chúc riêng: thêm tối đa 4 ảnh, cột cũ luôn là ảnh đầu, bỏ ảnh thì dọn trên Cloudinary', async () => {
  const originalGetConnection = pool.getConnection;
  const originalExecute = pool.execute;
  const originalDestroy = cloudinary.uploader.destroy;
  const destroyed = [];
  let rows = [];
  let nextId = 1;
  let mirror = { url: null, publicId: null };
  const execute = async (sql, params) => {
    if (sql.startsWith('SELECT id FROM students WHERE id = ? FOR UPDATE')) return [params[0] === 10 ? [{ id: 10 }] : []];
    if (sql.startsWith('SELECT COUNT(*) AS total')) {
      const mine = rows.filter((row) => row.kind === params[1]);
      return [[{ total: mine.length, last: mine.length ? Math.max(...mine.map((row) => row.position)) : null }]];
    }
    // Ảnh chỉ nằm ở cột cũ (gắn bằng bản chưa cập nhật) được đưa vào bảng trước
    if (sql.includes('NOT EXISTS (SELECT 1 FROM wish_images')) {
      if (mirror.url && !rows.some((row) => row.kind === params[0])) {
        rows.push({ id: nextId++, kind: params[0], image_url: mirror.url, public_id: mirror.publicId, position: 0 });
      }
      return [{ affectedRows: 0 }];
    }
    if (sql.startsWith('INSERT INTO wish_images')) {
      for (let i = 0; i < params.length; i += 5) {
        rows.push({ id: nextId++, kind: params[i + 1], image_url: params[i + 2], public_id: params[i + 3], position: params[i + 4] });
      }
      return [{ affectedRows: params.length / 5 }];
    }
    if (sql.startsWith('SELECT image_url, public_id FROM wish_images')) {
      return [rows.filter((row) => row.kind === params[1]).sort((a, b) => a.position - b.position).slice(0, 1)];
    }
    if (sql.startsWith('UPDATE students SET greeting_image_url')) {
      mirror = { url: params[0], publicId: params[1] };
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT id, public_id FROM wish_images WHERE id = ?')) {
      return [rows.filter((row) => row.id === params[0] && row.kind === params[2])];
    }
    if (sql.startsWith('SELECT id, public_id FROM wish_images')) return [rows.filter((row) => row.kind === params[1])];
    if (sql.startsWith('SELECT greeting_image_public_id AS public_id')) return [[{ public_id: mirror.publicId }]];
    if (sql.startsWith('DELETE FROM wish_images')) {
      rows = rows.filter((row) => !params.includes(row.id));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT DISTINCT')) return [[]];
    if (sql.includes('FROM wish_images')) {
      return [rows.map((row) => ({ ...row, student_id: 10 })).sort((a, b) => a.position - b.position)];
    }
    if (sql.includes('FROM students WHERE id = ?')) return [[{ id: 10, full_name: 'Thủy', greeting_image_url: mirror.url }]];
    return [[]];
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => {}, execute, commit: async () => {}, rollback: async () => {}, release: () => {},
  });
  pool.execute = execute;
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  const photo = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/${n}.jpg`, publicId: `gift_20_10/${n}` });
  try {
    let student = await studentService.addWishImages(10, 'greeting', [photo(1), photo(2), photo(3)]);
    assert.deepEqual(student.greeting_images.map((image) => image.url), [photo(1).url, photo(2).url, photo(3).url]);
    assert.deepEqual(mirror, photo(1));
    // Đã có 3 ảnh: thêm 2 nữa là quá 4 → từ chối, không ghi gì
    await assert.rejects(() => studentService.addWishImages(10, 'greeting', [photo(4), photo(5)]), { statusCode: 400, message: /chỉ thêm được 1 ảnh nữa/ });
    student = await studentService.addWishImages(10, 'greeting', [photo(4)]);
    assert.equal(student.greeting_images.length, 4);
    await assert.rejects(() => studentService.addWishImages(10, 'greeting', [photo(5)]), { statusCode: 400, message: /đã đủ 4 ảnh/ });

    // Bỏ ảnh đầu: cột cũ chuyển sang ảnh kế tiếp, ảnh bị bỏ được dọn
    student = await studentService.removeWishImages(10, 'greeting', 1);
    assert.deepEqual(student.greeting_images.map((image) => image.id), [2, 3, 4]);
    assert.deepEqual(mirror, photo(2));
    assert.deepEqual(destroyed, ['gift_20_10/1']);
    await assert.rejects(() => studentService.removeWishImages(10, 'greeting', 99), { statusCode: 404 });

    // Bỏ hết: cột cũ về NULL, mọi ảnh còn lại được dọn
    student = await studentService.removeWishImages(10, 'greeting');
    assert.deepEqual(student.greeting_images, []);
    assert.deepEqual(mirror, { url: null, publicId: null });
    assert.deepEqual(destroyed.sort(), ['gift_20_10/1', 'gift_20_10/2', 'gift_20_10/3', 'gift_20_10/4']);

    // Tên cột chỉ lấy từ danh sách cố định, không bao giờ từ dữ liệu gửi lên
    await assert.rejects(() => studentService.addWishImages(10, 'avatar_url = NULL, x', [photo(6)]), { statusCode: 400 });
    await assert.rejects(() => studentService.addWishImages(11, 'greeting', [photo(6)]), { statusCode: 404 });

    // Ảnh gắn bằng bản cũ (chỉ có ở cột cũ) được giữ làm ảnh đầu khi thêm ảnh mới
    mirror = photo(9);
    student = await studentService.addWishImages(10, 'greeting', [photo(7)]);
    assert.deepEqual(student.greeting_images.map((image) => image.url), [photo(9).url, photo(7).url]);
    assert.deepEqual(mirror, photo(9));
  } finally {
    pool.getConnection = originalGetConnection;
    pool.execute = originalExecute;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('tải ảnh lời chúc riêng cần đăng nhập admin', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const form = new FormData();
  form.append('image', new Blob([Buffer.from('x')], { type: 'image/jpeg' }), 'a.jpg');
  assert.equal((await fetch(`${base}/api/students/10/wish-images/greeting`, { method: 'POST', body: form })).status, 401);
  assert.equal((await fetch(`${base}/api/students/10/wish-images/greeting`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${base}/api/students/10/wish-images/greeting/3`, { method: 'DELETE' })).status, 401);
});

test('trang quà vẫn mở được trên máy chưa chạy migration 023 (chưa có cột ảnh lời chúc)', async () => {
  const original = pool.execute;
  const seen = [];
  pool.execute = async (sql) => {
    seen.push(sql);
    if (sql.includes('WHERE access_code = ?')) {
      if (sql.includes('intro_image_url')) {
        throw Object.assign(new Error("Unknown column 'intro_image_url' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' });
      }
      return [[{ id: 3, full_name: 'Vy', member_type: 'class' }]];
    }
    return [[]];
  };
  try {
    const student = await giftService.getStudentByCode('vy');
    assert.equal(student.full_name, 'Vy');
    assert.equal(seen.filter((sql) => sql.includes('WHERE access_code = ?')).length, 2);
  } finally {
    pool.execute = original;
  }
});

test('admin lưu được lời chúc ✨ tự viết (tối đa 2000 ký tự); để trống là trả lại cho máy viết', async () => {
  const original = pool.execute;
  const updates = [];
  pool.execute = async (sql, params) => {
    if (sql.startsWith('UPDATE students SET')) { updates.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM students WHERE id = ?')) return [[{ id: 10, full_name: 'Thủy' }]];
    return [[]];
  };
  try {
    await studentService.updateStudent(10, { greeting_custom: '  Chúc Thủy rực rỡ  ' });
    assert.match(updates[0].sql, /greeting_custom = \?/);
    assert.equal(updates[0].params[0], 'Chúc Thủy rực rỡ');
    await studentService.updateStudent(10, { greeting_custom: null });
    assert.equal(updates[1].params[0], null);
    await assert.rejects(() => studentService.updateStudent(10, { greeting_custom: 'x'.repeat(2001) }), { statusCode: 400 });
  } finally {
    pool.execute = original;
  }
});
