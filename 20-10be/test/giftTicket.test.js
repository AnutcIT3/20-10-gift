const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-gift-ticket';

const pool = require('../config/db');
const { signGiftTicket, verifyGiftTicket, signToken, verifyToken } = require('../utils/jwt');
const giftTicketGuard = require('../middleware/giftTicketGuard');

// "Vé mở quà": lúc bật "Chỉ mở bằng Face ID", trang của bạn trong lớp chỉ mở
// cho máy có vé (Face ID cấp) hay admin — mở thẳng link thì 403.

function fakeDb(t, { faceOnly = '1' } = {}) {
  const original = pool.execute;
  pool.execute = async (sql, params = []) => {
    if (sql.includes('FROM app_settings')) return [[{ setting_value: params[0] === 'face_only' ? faceOnly : '0' }]];
    if (sql.includes('FROM students WHERE access_code = ?')) {
      const people = { vy1020: 'class', 'khach-ly': 'friend' };
      return [people[params[0]] ? [{ member_type: people[params[0]] }] : []];
    }
    if (sql.includes('FROM admins')) return [params[0] === 1 ? [{ id: 1 }] : []];
    return [[]];
  };
  t.after(() => { pool.execute = original; });
}

async function run(accessCode, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { params: { accessCode }, get: (name) => lower[name.toLowerCase()] };
  let status = null;
  let body = null;
  let passed = false;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  await giftTicketGuard(req, res, () => { passed = true; });
  return { passed, status, body };
}

test('vé mở quà: chỉ đúng trang, đúng khoá; không lẫn với token admin', () => {
  const ticket = signGiftTicket('vy1020');
  assert.equal(verifyGiftTicket(ticket, 'vy1020'), true);
  assert.equal(verifyGiftTicket(ticket, 'VY1020'), true);
  assert.equal(verifyGiftTicket(ticket, '12a1-huong'), false);
  assert.equal(verifyGiftTicket('bịa', 'vy1020'), false);
  // Token admin không dùng làm vé được, vé không dùng làm token admin được
  assert.equal(verifyGiftTicket(signToken({ sub: 1 }), 'vy1020'), false);
  assert.throws(() => verifyToken(ticket));
});

test('đang "Chỉ mở bằng Face ID": mở thẳng link trang bạn trong lớp không có vé → 403', async (t) => {
  fakeDb(t);
  const bare = await run('vy1020');
  assert.equal(bare.passed, false);
  assert.equal(bare.status, 403);
  assert.equal(bare.body.code, 'face_only');
  assert.match(bare.body.message, /Face ID/);
  // Vé của trang khác cũng không được
  assert.equal((await run('vy1020', { 'X-Gift-Ticket': signGiftTicket('12a1-huong') })).status, 403);
  // Đúng vé → qua
  assert.equal((await run('vy1020', { 'X-Gift-Ticket': signGiftTicket('vy1020') })).passed, true);
  // Admin xem trước → qua; token admin của admin đã xoá → không
  assert.equal((await run('vy1020', { Authorization: `Bearer ${signToken({ sub: 1 })}` })).passed, true);
  assert.equal((await run('vy1020', { Authorization: `Bearer ${signToken({ sub: 9 })}` })).status, 403);
});

test('trang khách ngoài lớp, mã không tồn tại, hay công tắc tắt → như cũ', async (t) => {
  fakeDb(t);
  assert.equal((await run('khach-ly')).passed, true);
  assert.equal((await run('khong-co')).passed, true);   // để route trả 404 như cũ
  const off = await (async () => { fakeDb(t, { faceOnly: '0' }); return run('vy1020'); })();
  assert.equal(off.passed, true);
});
