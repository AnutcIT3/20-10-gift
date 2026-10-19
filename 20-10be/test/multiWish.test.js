const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-multi-wish';

const pool = require('../config/db');
const multiWishService = require('../services/multiWishService');
const app = require('../server');

// Một lời chúc gửi cho nhiều bạn cùng lúc (form gửi lời chúc ở trang chủ).

const photo = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/m${n}.jpg`, publicId: `gift_20_10/m${n}` });

function fakeDatabase(t, { students = [{ id: 1, access_code: 'thuy' }, { id: 2, access_code: 'ngoc' }], friends = [] } = {}) {
  const db = { letters: [], images: [], friends: [...friends], nextFriend: 100, committed: false, rolledBack: false };
  const execute = async (sql, params = []) => {
    if (sql.includes('FROM students WHERE is_active = TRUE AND access_code IN')) {
      return [students.filter((s) => params.includes(s.access_code))];
    }
    if (sql.includes("member_type = 'friend'") && sql.includes('normalized_name = ?')) {
      return [db.friends.filter((f) => f.normalized === params[0]).map((f) => ({ id: f.id, full_name: f.full_name }))];
    }
    if (sql.startsWith('INSERT INTO students')) {
      const id = db.nextFriend++;
      db.friends.push({ id, full_name: params[0], normalized: params[1] });
      return [{ insertId: id }];
    }
    if (sql.startsWith('INSERT INTO letters')) {
      db.letters.push({ id: 500 + db.letters.length, sql, params });
      return [{ insertId: 500 + db.letters.length - 1 }];
    }
    if (sql.startsWith('INSERT INTO letter_images')) {
      db.images.push(params);
      return [{ affectedRows: params.length / 4 }];
    }
    if (sql.includes('FROM letters l JOIN students s')) return [[{ total: 7, last_at: null }]];
    return [[]];
  };
  const originalGetConnection = pool.getConnection;
  const originalExecute = pool.execute;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute,
    commit: async () => { db.committed = true; },
    rollback: async () => { db.rolledBack = true; },
    release: () => {},
  });
  pool.execute = execute;
  t.after(() => { pool.getConnection = originalGetConnection; pool.execute = originalExecute; });
  return db;
}

test('một lời chúc gửi cho 2 bạn trong lớp + 1 khách đã có: mỗi người một lá, ảnh dùng chung', async (t) => {
  const db = fakeDatabase(t, { friends: [{ id: 100, full_name: 'Minh Thư', normalized: 'minh thu' }] });
  const result = await multiWishService.createWishes({
    recipients: [{ code: 'thuy' }, { code: 'ngoc' }, { friend: 'Minh Thư' }],
    sender_name: 'Tuấn', content: 'Chúc mừng 20/10!', is_anonymous: false,
    status: 'approved', sender_kind: 'classmate',
  }, [photo(1), photo(2)]);
  assert.equal(result.status, 'pending');
  assert.equal(result.created, 3);
  assert.equal(result.friends_created, 0);
  assert.equal(result.wish_number, 27);
  assert.ok(db.committed);
  // Trạng thái luôn chờ duyệt, nhóm người gửi luôn là khách, dù payload khai khác
  assert.deepEqual(db.letters.map((l) => l.params[0]), [1, 2, 100]);
  assert.ok(db.letters.every((l) => /'guest'/.test(l.sql) && l.params.includes('pending')));
  // Mỗi lá kèm đủ 2 ảnh; cột cũ = ảnh đầu
  assert.equal(db.images.length, 3);
  assert.ok(db.letters.every((l) => l.params.slice(-2)[0] === photo(1).url));
});

test('trùng người nhận thì gộp; bạn ngoài lớp đã có hồ sơ thì dùng lại', async (t) => {
  const db = fakeDatabase(t, { friends: [{ id: 40, full_name: 'Minh Thư', normalized: 'minh thu' }] });
  const result = await multiWishService.createWishes({
    recipients: JSON.stringify([{ code: 'thuy' }, { code: 'thuy' }, { friend: 'Minh Thư' }, { friend: 'minh thư' }]),
    content: 'Chúc nhé', is_anonymous: true,
  });
  assert.equal(result.created, 2);
  assert.equal(result.friends_created, 0);
  assert.deepEqual(db.letters.map((l) => l.params[0]), [1, 40]);
});

test('không người nhận, sai dạng, hay mã không tồn tại → báo lỗi, không ghi gì', async (t) => {
  const db = fakeDatabase(t);
  const base = { content: 'Chúc', is_anonymous: true };
  await assert.rejects(() => multiWishService.createWishes({ ...base, recipients: [] }), { statusCode: 400 });
  await assert.rejects(() => multiWishService.createWishes({ ...base, recipients: 'không phải json' }), { statusCode: 400 });
  await assert.rejects(() => multiWishService.createWishes({ ...base, recipients: [{ name: 'x' }] }), { statusCode: 400 });
  await assert.rejects(() => multiWishService.createWishes({ ...base, recipients: [{ friend: 'A' }] }), { statusCode: 400 });
  await assert.rejects(() => multiWishService.createWishes({ ...base, recipients: [{ code: 'thuy' }, { code: 'khong-co' }] }), { statusCode: 404 });
  assert.ok(db.rolledBack);
  assert.equal(db.letters.length, 0);
  await assert.rejects(() => multiWishService.createWishes({ recipients: [{ code: 'thuy' }], content: '   ', is_anonymous: true }), { statusCode: 400 });
});

test('POST /api/wishes: gửi được khi chưa đăng nhập, bẫy bot trả 201 giả', async (t) => {
  const db = fakeDatabase(t);
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/wishes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await post({ recipients: [{ code: 'thuy' }, { code: 'ngoc' }], content: 'Chúc mừng 20/10!', is_anonymous: true });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.created, 2);
  res = await post({ recipients: [{ code: 'thuy' }], content: 'spam', is_anonymous: true, _website: 'bot' });
  assert.equal(res.status, 201);
  assert.equal(db.letters.length, 2);
});

test('danh sách tích chọn: các bạn lớp và cô (cô đứng đầu), kèm biệt danh, không có mã quà', async (t) => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    assert.match(sql, /member_type = 'class' AND is_active = TRUE/);
    return [[
      { id: 3, full_name: 'Thủy', nickname: 'Thủy Phin', access_code: 'bi-mat' },
      { id: 17, full_name: 'Cô Giáo', nickname: null },
      { id: 5, full_name: 'Diệu Linh', nickname: 'Diệu Linh' },
    ]];
  };
  t.after(() => { pool.execute = original; });
  const list = await multiWishService.listRecipients();
  assert.deepEqual(list, [
    { id: 17, name: 'Cô Giáo', nickname: '' },
    { id: 5, name: 'Diệu Linh', nickname: '' },
    { id: 3, name: 'Thủy', nickname: 'Thủy Phin' },
  ]);
  assert.equal(JSON.stringify(list).includes('bi-mat'), false);
});

test('gửi theo id từ danh sách: chỉ bạn lớp đang hoạt động; id lạ → 404', async (t) => {
  const db = fakeDatabase(t);
  const original = pool.getConnection;
  const inner = await pool.getConnection();
  pool.getConnection = async () => ({
    ...inner,
    execute: async (sql, params) => {
      if (sql.includes("member_type IN ('class', 'test', 'friend')")) return [[1, 2, 17].filter((id) => params.includes(id)).map((id) => ({ id }))];
      return inner.execute(sql, params);
    },
  });
  t.after(() => { pool.getConnection = original; });
  const result = await multiWishService.createWishes({ recipients: [{ id: 1 }, { id: 17 }, { id: '17' }], content: 'Chúc cả lớp', is_anonymous: true });
  assert.equal(result.created, 2);
  assert.deepEqual(db.letters.map((l) => l.params[0]), [1, 17]);
  await assert.rejects(() => multiWishService.createWishes({ recipients: [{ id: 1 }, { id: 999 }], content: 'Chúc', is_anonymous: true }), { statusCode: 404 });
});

test('GET /api/wishes/recipients mở công khai (cả lúc khoá)', async (t) => {
  const original = pool.execute;
  pool.execute = async (sql) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: '1' }]];
    return [[{ id: 17, full_name: 'Cô Giáo', nickname: null }]];
  };
  const server = app.listen(0);
  t.after(() => { server.close(); pool.execute = original; });
  await new Promise((resolve) => server.once('listening', resolve));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/wishes/recipients`);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data, [{ id: 17, name: 'Cô Giáo', nickname: '' }]);
});

test('không giới hạn số thư: một lần gửi cho 60 người, rồi gửi liên tiếp 200 lần vẫn không bị chặn', async (t) => {
  const guests = Array.from({ length: 60 }, (_, i) => ({ id: 1000 + i, full_name: `Bạn số ${i + 1}`, normalized: `ban so ${i + 1}` }));
  const db = fakeDatabase(t, { friends: guests });
  const sixty = guests.map((g) => ({ friend: g.full_name }));
  assert.equal((await multiWishService.createWishes({ recipients: sixty, content: 'Chúc cả trường', is_anonymous: true })).created, 60);

  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((res) => res.status);
  const statuses = [];
  for (let i = 0; i < 200; i += 1) {
    statuses.push(await post('/api/wishes', { recipients: [{ code: 'thuy' }], content: `Lời chúc thứ ${i + 1}`, is_anonymous: true }));
  }
  assert.ok(statuses.every((status) => status === 201), `có lần bị chặn: ${statuses.filter((s) => s !== 201)}`);
  assert.equal(db.letters.length, 60 + 200);
});

test('khách chưa có trong danh sách: báo nhập lại tên, KHÔNG tự tạo hồ sơ, không gửi lá nào', async (t) => {
  const db = fakeDatabase(t);
  await assert.rejects(
    () => multiWishService.createWishes({ recipients: [{ code: 'thuy' }, { friend: 'phương anh' }], content: 'Chúc', is_anonymous: true }),
    { statusCode: 404, message: /Không có khách tên "phương anh".*nhập lại/ },
  );
  assert.equal(db.friends.length, 0);
  assert.equal(db.letters.length, 0);
  assert.ok(db.rolledBack);
});

test('ô "Ngoài lớp": chỉ thêm thẳng khi gõ đúng cả tên khách; gần giống thì hỏi; tên bạn trong lớp thì chỉ sang tab lớp', async (t) => {
  const normalizeName = require('../utils/normalizeName');
  const guests = [
    { id: 32, full_name: 'Bùi Phương Anh', nickname: 'Bó tần', access_code: 'bpa' },
    { id: 39, full_name: 'Hải Anh', nickname: null, access_code: 'ha' },
    { id: 34, full_name: 'Ánh', nickname: null, access_code: 'anh' },
    { id: 33, full_name: 'Linh', nickname: null, access_code: 'linh' },
    { id: 31, full_name: 'Vân Anh', nickname: null, access_code: 'va' },
  ];
  const classmates = [
    { id: 3, full_name: 'Phương Anh', nickname: 'Phanh' }, { id: 8, full_name: 'Diệu Linh', nickname: 'Linh Tần' },
    { id: 16, full_name: 'Vân Anh', nickname: 'Vanh' },
  ];
  const original = pool.execute;
  pool.execute = async (sql, params) => {
    if (sql.includes('access_code IN')) return [guests.filter((g) => params.includes(g.access_code))];
    const list = params.includes('friend') ? guests : classmates;
    // Câu lấy cả nhóm kèm biệt danh (tra tên) hay để so cả tên
    if (sql.includes('search_aliases')) return [list.map((row) => ({ ...row, search_aliases: null }))];
    const prefix = params[0].slice(0, -1);
    return [list.filter((g) => ` ${normalizeName(g.full_name)}`.includes(` ${prefix}`))];
  };
  t.after(() => { pool.execute = original; });
  const ids = (r) => r.matches.map((m) => m.id);

  // Đúng cả tên / biệt danh của một khách → thêm thẳng
  assert.deepEqual(await multiWishService.findGuests('Bùi Phương Anh'), { matches: [{ id: 32, name: 'Bùi Phương Anh', nickname: 'Bó tần' }], unsure: false });
  assert.deepEqual(ids(await multiWishService.findGuests('bó tần')), [32]);
  assert.equal((await multiWishService.findGuests('hai anh')).unsure, false);
  // Gõ thiếu ("Bùi Phương") → chỉ gợi ý
  const partial = await multiWishService.findGuests('Bùi Phương');
  assert.deepEqual([ids(partial), partial.unsure], [[32], true]);
  // Nhiều khách → hỏi
  const anh = await multiWishService.findGuests('Anh');
  assert.equal(anh.unsure, true);
  assert.deepEqual(anh.matches.map((m) => m.name), ['Ánh', 'Bùi Phương Anh', 'Hải Anh', 'Vân Anh']);
  // Tên bạn trong lớp: không đổ sang khách trùng một chữ
  await assert.rejects(() => multiWishService.findGuests('Diệu Linh'), { statusCode: 404, message: /là bạn trong lớp.*Trong lớp/ });
  await assert.rejects(() => multiWishService.findGuests('Linh Tần'), { statusCode: 404, message: /"Diệu Linh" là bạn trong lớp/ });
  // Gõ phần tên của khách (không kèm họ) thì thêm luôn, chỉ nhắc trong lớp cũng có tên đó
  const pa = await multiWishService.findGuests('Phương Anh');
  assert.deepEqual([ids(pa), pa.unsure, pa.alsoInClass], [[32], false, 'Phương Anh']);
  assert.equal((await multiWishService.findGuests('phuong anh')).unsure, false);
  // Chỉ một chữ đầu của tên ("Phương") thì vẫn hỏi
  assert.equal((await multiWishService.findGuests('Phương')).unsure, true);
  // Trùng y tên một khách và một bạn trong lớp: thêm khách, nhắc tab lớp
  const va = await multiWishService.findGuests('Vân Anh');
  assert.deepEqual([ids(va), va.unsure, va.alsoInClass], [[31], false, 'Vân Anh']);
  // Không có ai
  await assert.rejects(() => multiWishService.findGuests('Minh Thư'), { statusCode: 404, message: /Không có khách tên "Minh Thư".*nhập lại/ });
  await assert.rejects(() => multiWishService.findGuests('x'), { statusCode: 400 });
  // Không lộ mã mở quà
  assert.equal(JSON.stringify(anh).includes('bpa'), false);
});
