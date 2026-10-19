const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-wish-notes';

const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const wishNoteService = require('../services/wishNoteService');
const keepsakeService = require('../services/keepsakeService');
const app = require('../server');

// Lời chúc riêng và 💌: tối đa 4 lời mỗi loại (lời đầu ở cột cũ, 3 lời thêm ở
// wish_notes), mỗi lời kèm tối đa 4 ảnh.

const photo = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/n${n}.jpg`, publicId: `gift_20_10/n${n}` });

// Một "database" nhỏ trong bộ nhớ đủ cho các câu SQL của wishNoteService
function fakeDatabase(t) {
  const db = { notes: [], images: [], nextNote: 1, nextImage: 1, students: new Set([10, 11]) };
  const execute = async (sql, params = []) => {
    if (sql.startsWith('SELECT id FROM students WHERE id = ? FOR UPDATE')) return [db.students.has(params[0]) ? [{ id: params[0] }] : []];
    if (sql.startsWith('SELECT COUNT(*) AS total, MAX(position) AS last FROM wish_notes')) {
      const mine = db.notes.filter((n) => n.student_id === params[0] && n.kind === params[1]);
      return [[{ total: mine.length, last: mine.length ? Math.max(...mine.map((n) => n.position)) : null }]];
    }
    if (sql.startsWith('INSERT INTO wish_notes')) {
      const [student_id, kind, content, position] = params;
      db.notes.push({ id: db.nextNote, student_id, kind, content, position });
      return [{ insertId: db.nextNote++ }];
    }
    if (sql.startsWith('SELECT id, kind FROM wish_notes WHERE id = ? AND student_id = ? FOR UPDATE')) {
      return [db.notes.filter((n) => n.id === params[0] && n.student_id === params[1])];
    }
    if (sql.startsWith('UPDATE wish_notes SET content')) {
      db.notes.find((n) => n.id === params[1]).content = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT public_id FROM wish_note_images WHERE note_id = ?')) {
      return [db.images.filter((i) => i.note_id === params[0])];
    }
    if (sql.startsWith('DELETE FROM wish_notes WHERE id = ?')) {
      db.notes = db.notes.filter((n) => n.id !== params[0]);
      db.images = db.images.filter((i) => i.note_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT COUNT(*) AS total, MAX(position) AS last FROM wish_note_images')) {
      const mine = db.images.filter((i) => i.note_id === params[0]);
      return [[{ total: mine.length, last: mine.length ? Math.max(...mine.map((i) => i.position)) : null }]];
    }
    if (sql.startsWith('INSERT INTO wish_note_images')) {
      for (let i = 0; i < params.length; i += 4) {
        db.images.push({ id: db.nextImage++, note_id: params[i], image_url: params[i + 1], public_id: params[i + 2], position: params[i + 3] });
      }
      return [{ affectedRows: params.length / 4 }];
    }
    if (sql.startsWith('SELECT id, public_id FROM wish_note_images WHERE id = ? AND note_id = ?')) {
      return [db.images.filter((i) => i.id === params[0] && i.note_id === params[1])];
    }
    if (sql.startsWith('DELETE FROM wish_note_images WHERE id = ?')) {
      db.images = db.images.filter((i) => i.id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM wish_notes') && sql.includes('student_id IN')) {
      return [db.notes.filter((n) => params.includes(n.student_id)).sort((a, b) => a.position - b.position)];
    }
    if (sql.includes('FROM wish_note_images') && sql.includes('note_id IN')) {
      return [db.images.filter((i) => params.includes(i.note_id)).sort((a, b) => a.position - b.position)];
    }
    if (sql.startsWith('SELECT DISTINCT public_id AS public_id FROM wish_note_images')) {
      return [db.images.filter((i) => params.includes(i.public_id))];
    }
    if (sql.startsWith('SELECT DISTINCT')) return [[]];
    return assert.fail(`unexpected SQL: ${sql}`);
  };
  const originalExecute = pool.execute;
  const originalGetConnection = pool.getConnection;
  const originalDestroy = cloudinary.uploader.destroy;
  const destroyed = [];
  pool.execute = execute;
  pool.getConnection = async () => ({
    beginTransaction: async () => {}, execute, commit: async () => {}, rollback: async () => {}, release: () => {},
  });
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  t.after(() => {
    pool.execute = originalExecute;
    pool.getConnection = originalGetConnection;
    cloudinary.uploader.destroy = originalDestroy;
  });
  return { db, destroyed };
}

test('thêm tối đa 3 lời nhắn mỗi loại (cùng lời đầu là 4), sửa, đọc theo thứ tự', async (t) => {
  fakeDatabase(t);
  const a = await wishNoteService.addNote(10, 'admin_wish', '  Lời thứ hai  ');
  await wishNoteService.addNote(10, 'admin_wish', 'Lời thứ ba');
  await wishNoteService.addNote(10, 'admin_wish', 'Lời thứ tư');
  await assert.rejects(() => wishNoteService.addNote(10, 'admin_wish', 'Lời thứ năm'), { statusCode: 400, message: /tối đa 4 lời nhắn/ });
  // Loại khác vẫn còn chỗ riêng
  await wishNoteService.addNote(10, 'intro', 'Lời riêng thứ hai');

  await wishNoteService.updateNote(10, a, 'Lời thứ hai đã sửa');
  const [student] = await wishNoteService.withWishNotes([{ id: 10 }]);
  assert.deepEqual(student.admin_wish_notes.map((n) => n.content), ['Lời thứ hai đã sửa', 'Lời thứ ba', 'Lời thứ tư']);
  assert.deepEqual(student.intro_notes.map((n) => n.content), ['Lời riêng thứ hai']);
});

test('lời nhắn không được trống, sai loại, hay sửa qua hồ sơ của bạn khác', async (t) => {
  fakeDatabase(t);
  await assert.rejects(() => wishNoteService.addNote(10, 'admin_wish', '   '), { statusCode: 400 });
  await assert.rejects(() => wishNoteService.addNote(10, 'greeting', 'x'), { statusCode: 400 });
  await assert.rejects(() => wishNoteService.addNote(99, 'intro', 'x'), { statusCode: 404 });
  const id = await wishNoteService.addNote(10, 'intro', 'Của bạn 10');
  await assert.rejects(() => wishNoteService.updateNote(11, id, 'chiếm'), { statusCode: 404 });
  await assert.rejects(() => wishNoteService.removeNote(11, id), { statusCode: 404 });
});

test('mỗi lời nhắn kèm tối đa 4 ảnh; bỏ ảnh hay xoá lời thì dọn ảnh trên Cloudinary', async (t) => {
  const { db, destroyed } = fakeDatabase(t);
  const id = await wishNoteService.addNote(10, 'admin_wish', 'Có ảnh');
  await wishNoteService.addNoteImages(10, id, [photo(1), photo(2), photo(3)]);
  await assert.rejects(() => wishNoteService.addNoteImages(10, id, [photo(4), photo(5)]), { statusCode: 400, message: /chỉ thêm được 1 ảnh nữa/ });
  await wishNoteService.addNoteImages(10, id, [photo(4)]);
  let [student] = await wishNoteService.withWishNotes([{ id: 10 }]);
  assert.deepEqual(student.admin_wish_notes[0].images.map((i) => i.url), [1, 2, 3, 4].map((n) => photo(n).url));

  await wishNoteService.removeNoteImage(10, id, db.images[0].id);
  assert.deepEqual(destroyed, ['gift_20_10/n1']);
  [student] = await wishNoteService.withWishNotes([{ id: 10 }]);
  assert.equal(student.admin_wish_notes[0].images.length, 3);

  await wishNoteService.removeNote(10, id);
  assert.deepEqual(destroyed.sort(), ['gift_20_10/n1', 'gift_20_10/n2', 'gift_20_10/n3', 'gift_20_10/n4']);
  [student] = await wishNoteService.withWishNotes([{ id: 10 }]);
  assert.deepEqual(student.admin_wish_notes, []);
});

test('máy chưa migrate 026: trang quà đọc như cũ, thêm lời báo cần cập nhật', async (t) => {
  const originalExecute = pool.execute;
  const originalGetConnection = pool.getConnection;
  const missing = () => Promise.reject(Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }));
  pool.execute = missing;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql) => (sql.includes('FROM students') ? [[{ id: 10 }]] : missing()),
    commit: async () => {}, rollback: async () => {}, release: () => {},
  });
  t.after(() => { pool.execute = originalExecute; pool.getConnection = originalGetConnection; });
  const [student] = await wishNoteService.withWishNotes([{ id: 10, admin_wish: 'Lời đầu' }]);
  assert.deepEqual([student.intro_notes, student.admin_wish_notes, student.admin_wish], [[], [], 'Lời đầu']);
  await assert.rejects(() => wishNoteService.addNote(10, 'intro', 'x'), { statusCode: 503 });
});

test('đường lời nhắn cần đăng nhập admin', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/students/10/wish-notes`;
  const json = { 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/admin_wish`, { method: 'POST', headers: json, body: '{"content":"x"}' })).status, 401);
  assert.equal((await fetch(`${base}/3`, { method: 'PATCH', headers: json, body: '{"content":"x"}' })).status, 401);
  assert.equal((await fetch(`${base}/3`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${base}/3/images`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/3/images/4`, { method: 'DELETE' })).status, 401);
});

test('bản lưu kỷ niệm có đủ các lời chúc riêng và mỗi lời 💌 một ô', () => {
  const html = keepsakeService.renderKeepsake({
    student: {
      id: 3, full_name: 'Nguyễn Thúy Vy', member_type: 'class',
      intro_message: 'Lời riêng một',
      intro_notes: [{ id: 1, content: 'Lời riêng hai', images: [{ id: 1, url: 'https://x/i2.jpg' }] }],
      admin_wish: 'Lời admin một',
      admin_wish_notes: [
        { id: 2, content: 'Lời admin hai', images: [] },
        { id: 3, content: '', images: [{ id: 2, url: 'https://x/a3.jpg' }] },
      ],
    },
    srcOf: (url) => url,
  });
  for (const text of ['Lời riêng một', 'Lời riêng hai', 'Lời admin một', 'Lời admin hai', 'https://x/i2.jpg', 'https://x/a3.jpg']) {
    assert.ok(html.includes(text), `thiếu ${text}`);
  }
  assert.equal((html.match(/<section class="note note--admin">/g) || []).length, 3);
});
