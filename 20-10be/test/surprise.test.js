const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-surprise';

const pool = require('../config/db');
const settingsService = require('../services/settingsService');
const eventService = require('../services/eventService');
const replyService = require('../services/replyService');
const keepsakeService = require('../services/keepsakeService');
const { isSharedDataMutation } = require('../middleware/dataRevision');
const { signToken } = require('../utils/jwt');
const app = require('../server');

// Ba bất ngờ cho 20/10: quà tự mở đúng giờ hẹn (và bông hoa 12A1 đếm từng bạn
// mở quà), thư hồi âm, và bản lưu quà tải về máy.

async function startApp(t) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

// Bảng app_settings giả: đọc/ghi theo key, UPDATE có điều kiện như MySQL
function mockSettings(initial = {}, extra = async () => undefined) {
  const settings = { gift_pages_locked: '0', face_enabled: '0', ...initial };
  const calls = [];
  pool.execute = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM app_settings')) {
      return [params[0] in settings ? [{ setting_value: settings[params[0]] }] : []];
    }
    if (sql.startsWith('INSERT INTO app_settings')) {
      settings[params[0]] = params[1];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE app_settings')) {
      if (settings[params[0]] !== '1') return [{ affectedRows: 0 }];
      settings[params[0]] = '0';
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('revision = revision + 1')) return [{ affectedRows: 1 }];
    const answer = await extra(sql, params);
    if (answer !== undefined) return answer;
    return [[]];
  };
  return { settings, calls };
}

function withPool(t) {
  const original = { execute: pool.execute, getConnection: pool.getConnection };
  t.after(() => {
    pool.execute = original.execute;
    pool.getConnection = original.getConnection;
    eventService.clearCache();
  });
}

// ── Hẹn giờ tự mở ───────────────────────────────────────────────────────────

test('trang quà khoá có hẹn giờ thì tự mở đúng giờ, dời mốc đếm bông hoa về giờ hẹn', async (t) => {
  withPool(t);
  const unlockAt = '2026-10-19T17:00:00.000Z';
  const { settings } = mockSettings({ gift_pages_locked: '1', gift_unlock_at: unlockAt });

  const before = await settingsService.getGiftLockState(new Date('2026-10-19T16:59:59.000Z'));
  assert.equal(before.locked, true);
  assert.equal(before.unlockAt.toISOString(), unlockAt);

  const after = await settingsService.getGiftLockState(new Date('2026-10-19T17:00:00.500Z'));
  assert.deepEqual(after, { locked: false, unlockAt: null });
  assert.equal(settings.gift_pages_locked, '0');
  assert.equal(settings.gift_unlock_at, '');
  // Lượt mở thử trước giờ hẹn không được tính vào bông hoa
  assert.equal(settings.gift_opens_since, unlockAt);
});

test('khoá lại giữa ngày 20/10 rồi hẹn mở lại, dù khoá lâu: bông hoa giữ các lượt mở đã có', async (t) => {
  withPool(t);
  const { settings } = mockSettings({
    gift_pages_locked: '1',
    // Khoá lúc 00:10 để sửa thư, hẹn mở lại tận 06:00
    gift_unlock_at: '2026-10-19T23:00:00.000Z',
    gift_opens_since: '2026-10-19T17:00:00.000Z',
  });
  const state = await settingsService.getGiftLockState(new Date('2026-10-19T23:00:01.000Z'));
  assert.equal(state.locked, false);
  assert.equal(settings.gift_opens_since, '2026-10-19T17:00:00.000Z');
});

test('lượt thử hồi tháng 9 hay tổng duyệt tối 19/10 không vào hoa: mở thật 00:00 thì đếm lại', async (t) => {
  withPool(t);
  for (const before of ['2026-09-29T08:00:00.000Z', '2026-10-19T13:00:00.000Z']) {
    const { settings } = mockSettings({
      gift_pages_locked: '1', gift_unlock_at: '2026-10-19T17:00:00.000Z', gift_opens_since: before,
    });
    await settingsService.getGiftLockState(new Date('2026-10-19T17:00:01.000Z'));
    assert.equal(settings.gift_opens_since, '2026-10-19T17:00:00.000Z', before);
  }
});

test('cả lớp cùng hỏi đúng 00:00: chỉ request lật được khoá mới ghi mốc đếm', async (t) => {
  withPool(t);
  const { calls } = mockSettings({ gift_pages_locked: '1', gift_unlock_at: '2026-10-19T17:00:00.000Z' });
  // Giả lập request khác đã lật khoá trước: UPDATE có điều kiện không trúng hàng nào
  const execute = pool.execute;
  pool.execute = async (sql, params) => (sql.startsWith('UPDATE app_settings')
    ? [{ affectedRows: 0 }]
    : execute(sql, params));
  const state = await settingsService.getGiftLockState(new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(state.locked, false);
  assert.equal(calls.some((call) => call.sql.startsWith('INSERT INTO app_settings')), false);
});

test('giá trị hẹn giờ không đúng dạng ISO thì coi như không hẹn — quà không mở sai giờ', async (t) => {
  withPool(t);
  // new Date('1') của V8 là năm 2001 — nếu tin nó, quà sẽ mở ngay lập tức
  mockSettings({ gift_pages_locked: '1', gift_unlock_at: '1' });
  assert.deepEqual(await settingsService.getGiftLockState(), { locked: true, unlockAt: null });
  assert.equal(settingsService.parseIso('2026-10-19T17:00:00Z')?.toISOString(), '2026-10-19T17:00:00.000Z');
  assert.equal(settingsService.parseIso('2026-10-20 00:00'), null);
});

test('hẹn giờ tự mở phải ở tương lai; mở tay thì huỷ lịch hẹn', async (t) => {
  withPool(t);
  const { settings } = mockSettings({ gift_pages_locked: '1' });
  const now = new Date('2026-10-01T00:00:00.000Z');

  await assert.rejects(() => settingsService.setGiftUnlockAt('2026-09-30T00:00:00.000Z', now), { statusCode: 400 });
  await assert.rejects(() => settingsService.setGiftUnlockAt('ngày mai', now), { statusCode: 400 });
  await assert.rejects(() => settingsService.setGiftUnlockAt('2028-01-01T00:00:00.000Z', now), { statusCode: 400 });
  // Giờ theo datetime-local của trình duyệt Việt Nam, quy về UTC
  assert.deepEqual(
    await settingsService.setGiftUnlockAt('2026-10-20T00:00:00+07:00', now),
    { gift_unlock_at: '2026-10-19T17:00:00.000Z' },
  );
  assert.equal(settings.gift_unlock_at, '2026-10-19T17:00:00.000Z');

  assert.deepEqual(await settingsService.setGiftPagesLocked(false), { gift_pages_locked: false });
  assert.equal(settings.gift_unlock_at, '');
  assert.deepEqual(await settingsService.setGiftUnlockAt(null, now), { gift_unlock_at: null });
});

test('chỉ hẹn được giờ tự mở khi trang quà đang khoá; khoá lại không thừa hưởng lịch cũ', async (t) => {
  withPool(t);
  const { settings } = mockSettings({ gift_pages_locked: '0' });
  const now = new Date('2026-10-01T00:00:00.000Z');
  // Thẻ admin cũ trên máy khác vẫn tưởng đang khoá: lịch không được nằm ẩn chờ lần khoá sau
  await assert.rejects(() => settingsService.setGiftUnlockAt('2026-10-19T17:00:00.000Z', now), { statusCode: 409 });
  assert.equal(settings.gift_unlock_at, undefined);

  settings.gift_unlock_at = '2026-09-30T00:00:00.000Z';
  assert.deepEqual(await settingsService.setGiftPagesLocked(true), { gift_pages_locked: true });
  assert.equal(settings.gift_unlock_at, '');
  // Nhờ vậy lần đọc kế tiếp không tự mở lại ngay
  assert.deepEqual(await settingsService.getGiftLockState(now), { locked: true, unlockAt: null });
});

test('đặt lại bông hoa làm tròn mốc xuống tới giây như opened_at', async (t) => {
  withPool(t);
  const { settings } = mockSettings({});
  assert.deepEqual(
    await settingsService.resetGiftOpens(new Date('2026-10-20T03:00:00.750Z')),
    { gift_opens_since: '2026-10-20T03:00:00.000Z' },
  );
  assert.equal(settings.gift_opens_since, '2026-10-20T03:00:00.000Z');
});

test('màn khoá nhận giờ tự mở và giờ máy chủ để đếm ngược đúng khoảnh khắc', async (t) => {
  withPool(t);
  const base = await startApp(t);
  mockSettings({ gift_pages_locked: '1', gift_unlock_at: '2099-10-19T17:00:00.000Z' });
  const response = await fetch(`${base}/api/gifts/some-code/content`);
  assert.equal(response.status, 423);
  const body = await response.json();
  assert.equal(body.unlockAt, '2099-10-19T17:00:00.000Z');
  assert.ok(!Number.isNaN(new Date(body.serverNow).getTime()));
});

test('admin hẹn giờ, huỷ hẹn và đặt lại bông hoa qua /api/admin/settings', async (t) => {
  withPool(t);
  const base = await startApp(t);
  const { settings } = mockSettings({ gift_pages_locked: '1' }, async (sql) => (
    sql.includes('FROM admins') ? [[{ id: 1 }]] : undefined
  ));
  const headers = { Authorization: `Bearer ${signToken({ sub: 1 })}`, 'Content-Type': 'application/json' };
  const patch = (body) => fetch(`${base}/api/admin/settings`, { method: 'PATCH', headers, body: JSON.stringify(body) });

  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const scheduled = await patch({ gift_unlock_at: nextWeek });
  assert.equal(scheduled.status, 200);
  assert.deepEqual((await scheduled.json()).data, { gift_unlock_at: nextWeek });

  const current = await (await fetch(`${base}/api/admin/settings`, { headers })).json();
  assert.equal(current.data.gift_pages_locked, true);
  assert.equal(current.data.gift_unlock_at, nextWeek);

  assert.equal((await patch({ gift_unlock_at: '2000-01-01T00:00:00.000Z' })).status, 400);

  const reset = await patch({ reset_gift_opens: true });
  assert.equal(reset.status, 200);
  assert.match(settings.gift_opens_since, /^\d{4}-\d{2}-\d{2}T/);
});

// ── Bông hoa 12A1 ───────────────────────────────────────────────────────────

test('trạng thái 20/10: đang khoá chỉ có đếm ngược, đã mở thì kèm bông hoa và số hồi âm', async (t) => {
  withPool(t);
  const unlockAt = '2099-10-19T17:00:00.000Z';
  mockSettings({ gift_pages_locked: '1', gift_unlock_at: unlockAt });
  const now = new Date('2099-10-19T16:00:00.000Z');
  assert.deepEqual(await eventService.getStatus(now), {
    locked: true, unlockAt, serverNow: now.toISOString(),
  });

  eventService.clearCache();
  mockSettings({ gift_opens_since: '2099-10-19T17:00:00.000Z' }, async (sql, params) => {
    if (sql.includes('FROM gift_opens')) {
      assert.deepEqual(params, [new Date('2099-10-19T17:00:00.000Z')]);
      return [[{ student_id: 1 }, { student_id: 2 }]];
    }
    if (sql.includes('FROM students')) return [[{ total: 23 }]];
    if (sql.includes('FROM letter_replies')) return [[{ total: 4 }]];
    return undefined;
  });
  const open = await eventService.getStatus(new Date('2099-10-20T01:00:00.000Z'));
  assert.deepEqual(open, {
    locked: false, unlockAt: null, serverNow: '2099-10-20T01:00:00.000Z', opened: 2, total: 23, replies: 4,
  });
});

test('mở quà từ trang chủ trả "bạn thứ mấy"; hồ sơ bạn ngoài lớp không nằm trong bông hoa', async (t) => {
  withPool(t);
  const inserts = [];
  const { calls } = mockSettings({}, async (sql, params) => {
    if (sql.startsWith('INSERT INTO gift_opens')) {
      inserts.push(params);
      return [{ insertId: 1 }];
    }
    if (sql.includes('FROM gift_opens')) return [[{ student_id: 4 }, { student_id: 7 }, { student_id: 9 }]];
    if (sql.includes('FROM students')) return [[{ total: 23 }]];
    return undefined;
  });

  assert.deepEqual(
    await eventService.recordOpen({ id: 7, member_type: 'class' }, 'face'),
    { counted: true, rank: 2, opened: 3, total: 23 },
  );
  // opened_at chỉ tới giây: hai bạn mở cùng giây phải xếp theo thứ tự ghi (id)
  const rankQuery = calls.find((call) => call.sql.includes('FROM gift_opens o'));
  assert.match(rankQuery.sql, /MIN\(o\.id\) AS first_id/);
  assert.match(rankQuery.sql, /ORDER BY first_id ASC/);
  // via lạ không được ghi thẳng vào ENUM
  await eventService.recordOpen({ id: 9, member_type: 'class' }, '<script>');
  assert.deepEqual(inserts, [[7, 'face'], [9, 'name']]);

  assert.deepEqual(await eventService.recordOpen({ id: 50, member_type: 'friend' }, 'name'), { counted: false });
  assert.equal(inserts.length, 2);
});

test('hạn mức theo trang quà gộp các cách viết khác nhau của cùng một mã', () => {
  const { giftKey } = require('../middleware/rateLimit');
  const keys = ['12a1-linh-tan', '12A1-LINH-TAN', '12a1-linh-tan ', '12a1-Linh-Tan  ']
    .map((accessCode) => giftKey({ params: { accessCode } }));
  assert.equal(new Set(keys).size, 1);
});

test('lượt mở quà chỉ ghi được khi quà đã mở và không làm admin phải tải lại trang', async (t) => {
  withPool(t);
  const base = await startApp(t);
  mockSettings({ gift_pages_locked: '1' });
  const locked = await fetch(`${base}/api/gifts/vy1020/open`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ via: 'name' }),
  });
  assert.equal(locked.status, 423);

  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/gifts/vy1020/open' }), false);
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/gifts/vy1020/keepsake' }), false);
  // Hồi âm mới phải hiện ở hộp thư admin như lời chúc mới
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/gifts/vy1020/replies' }), true);
  assert.equal(isSharedDataMutation({ method: 'PATCH', originalUrl: '/api/admin/replies/3/status' }), true);
});

// ── Thư hồi âm ──────────────────────────────────────────────────────────────

test('hồi âm luôn chờ duyệt và chỉ trả lời được thư đã duyệt của chính trang quà', async (t) => {
  withPool(t);
  const inserts = [];
  let letterLookup;
  pool.execute = async (sql, params) => {
    if (sql.includes('FROM letters')) {
      letterLookup = { sql, params };
      return [params[0] === 5 ? [{ id: 5 }] : []];
    }
    if (sql.startsWith('INSERT INTO letter_replies')) {
      inserts.push({ sql, params });
      return [{ insertId: 11 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const student = { id: 3 };

  const reply = await replyService.createReply(student, {
    target: 'letter', letter_id: 5, content: '  Cảm ơn cậu nhiều lắm!  ', status: 'approved',
  });
  assert.equal(reply.status, 'pending');
  assert.equal(reply.content, 'Cảm ơn cậu nhiều lắm!');
  assert.match(inserts[0].sql, /'pending'\)/);
  assert.deepEqual(inserts[0].params, [3, 'letter', 5, 'Cảm ơn cậu nhiều lắm!']);
  // Thư phải của đúng trang này, đã duyệt và đã tới giờ hiện
  assert.deepEqual(letterLookup.params, [5, 3]);
  assert.match(letterLookup.sql, /status = 'approved'/);
  assert.match(letterLookup.sql, /reveal_at <= UTC_TIMESTAMP\(\)/);

  await assert.rejects(() => replyService.createReply(student, { target: 'letter', letter_id: 6, content: 'Hi' }), { statusCode: 404 });
  await assert.rejects(() => replyService.createReply(student, { target: 'teacher', content: 'Hi' }), { statusCode: 400 });
  await assert.rejects(() => replyService.createReply(student, { target: 'class', content: '   ' }), { statusCode: 400 });
  await assert.rejects(() => replyService.createReply(student, { target: 'class', content: 'x'.repeat(2001) }), { statusCode: 400 });
  await assert.rejects(() => replyService.createReply(student, { target: 'letter', content: 'Thiếu thư' }), { statusCode: 400 });

  await replyService.createReply(student, { target: 'class', letter_id: 5, content: 'Cảm ơn cả lớp!' });
  // Hồi âm cả lớp không gắn với lá thư nào dù payload có gửi kèm
  assert.deepEqual(inserts[1].params, [3, 'class', null, 'Cảm ơn cả lớp!']);
});

test('hộp thư hồi âm: người ẩn danh chỉ được nhắc lúc gửi thư, tìm theo tên không dấu', async (t) => {
  withPool(t);
  pool.execute = async (sql) => {
    assert.match(sql, /r\.status = 'approved'/);
    // Thư riêng gửi admin và hồi âm cho lá thư đã mất không bao giờ lên bảng
    assert.match(sql, /r\.target <> 'admin'/);
    // …và lá thư admin đã gỡ (từ chối sau khi duyệt) kéo hồi âm của nó theo
    assert.match(sql, /r\.target <> 'letter' OR \(l\.id IS NOT NULL AND l\.status = 'approved'\)/);
    assert.equal(/LIMIT/.test(sql), false);
    return [[
      {
        id: 4, target: 'letter', content: 'Cảm ơn Anh!', created_at: '2026-10-20T01:10:00.000Z',
        from_full_name: 'Lê Hà', from_nickname: 'Hà', from_member_type: 'class',
        letter_exists: 8, letter_sender_name: 'Nguyễn Văn Anh', letter_is_anonymous: 0, letter_created_at: '2026-10-18T14:30:00.000Z',
      },
      {
        id: 3, target: 'letter', content: 'Cảm ơn Tuấn!', created_at: '2026-10-20T01:00:00.000Z',
        from_full_name: 'Nguyễn Thúy Vy', from_nickname: 'Vy', from_member_type: 'class',
        letter_exists: 5, letter_sender_name: 'Nguyễn Văn Tuấn', letter_is_anonymous: 0, letter_created_at: '2026-10-18T14:30:00.000Z',
      },
      {
        id: 2, target: 'letter', content: 'Ai vậy ta?', created_at: '2026-10-20T00:30:00.000Z',
        from_full_name: 'Trần Mai Anh', from_nickname: null, from_member_type: 'class',
        letter_exists: 6, letter_sender_name: 'Bí mật', letter_is_anonymous: 1, letter_created_at: '2026-10-18T14:30:00.000Z',
      },
      {
        id: 1, target: 'class', content: 'Cảm ơn cả lớp', created_at: '2026-10-20T00:10:00.000Z',
        from_full_name: 'Lê Hà', from_nickname: 'Hà', from_member_type: 'class',
      },
    ]];
  };

  const board = await replyService.listBoard();
  assert.equal(board.total, 4);
  assert.deepEqual(board.items[1].to, { kind: 'person', name: 'Nguyễn Văn Tuấn' });
  assert.equal(board.items[1].from.name, 'Vy');
  // Tên thật của người gửi ẩn danh không bao giờ ra khỏi máy chủ
  assert.deepEqual(board.items[2].to, { kind: 'anonymous', letterSentAt: '2026-10-18T14:30:00.000Z' });
  assert.equal(JSON.stringify(board).includes('Bí mật'), false);
  assert.deepEqual(board.items[3].to, { kind: 'class' });

  assert.deepEqual((await replyService.listBoard({ to: 'tuấn' })).items.map((item) => item.id), [3]);
  assert.deepEqual((await replyService.listBoard({ to: 'van tuan' })).items.map((item) => item.id), [3]);
  // Ô tìm kiếm khớp từ đầu một chữ, không khớp giữa chữ
  assert.equal((await replyService.listBoard({ to: 'uan' })).total, 0);
  assert.deepEqual((await replyService.listBoard({ to: 'an' })).items.map((item) => item.id), [4]);
  // Lời nhắc "có thư gửi cậu" khớp trọn chữ: An không được đếm thư gửi Anh
  assert.equal((await replyService.listBoard({ to: 'An', exact: true })).total, 0);
  assert.deepEqual((await replyService.listBoard({ to: 'Anh', exact: true })).items.map((item) => item.id), [4]);
  assert.deepEqual((await replyService.listBoard({ to: 'văn tuấn', exact: true })).items.map((item) => item.id), [3]);
  // Một ký tự khớp gần như mọi tên: báo lỗi chứ không lặng lẽ bỏ bộ lọc
  await assert.rejects(() => replyService.listBoard({ to: 'T' }), { statusCode: 400 });
  await assert.rejects(() => replyService.listBoard({ to: ['a', 'b'] }), { statusCode: 400 });
});

test('hồi âm trỏ vào lá thư đã mất không bị đoán thành "người bạn ẩn danh"', () => {
  assert.deepEqual(replyService.recipientOf({ target: 'letter', letter_exists: null, letter_sender_name: null }), { kind: 'missing' });
  assert.deepEqual(
    replyService.recipientOf({ target: 'letter', letter_exists: 9, letter_is_anonymous: 1, letter_created_at: 'x' }),
    { kind: 'anonymous', letterSentAt: 'x' },
  );
  assert.deepEqual(replyService.recipientOf({ target: 'admin' }), { kind: 'admin' });
  // Lá thư đã bị gỡ: admin thấy "đã gỡ", không phải tên người viết
  assert.deepEqual(
    replyService.recipientOf({ target: 'letter', letter_exists: 9, letter_status: 'rejected', letter_sender_name: 'Tuấn' }),
    { kind: 'missing' },
  );
});

test('bảng hồi âm tìm theo tên trên TOÀN BỘ hồi âm rồi mới cắt 300 dòng', async (t) => {
  withPool(t);
  const rows = Array.from({ length: 320 }, (_, index) => ({
    id: 400 - index,
    target: 'letter',
    content: `Hồi âm ${index}`,
    created_at: '2026-10-20T01:00:00.000Z',
    from_full_name: 'Vy',
    letter_exists: 1,
    letter_sender_name: index === 310 ? 'Nguyễn Văn Tuấn' : 'Lan',
    letter_is_anonymous: 0,
  }));
  pool.execute = async () => [rows];
  const all = await replyService.listBoard();
  assert.equal(all.items.length, 300);
  assert.equal(all.total, 320);
  // Hồi âm cũ (nằm ngoài 300 dòng mới nhất) vẫn tìm thấy theo tên
  assert.deepEqual((await replyService.listBoard({ to: 'Tuấn', exact: true })).items.map((item) => item.content), ['Hồi âm 310']);
});

test('hồi âm: gửi qua trang quà, hộp thư công khai và các đường admin', async (t) => {
  withPool(t);
  const base = await startApp(t);
  const statusUpdates = [];
  mockSettings({}, async (sql, params) => {
    if (sql.includes('FROM admins')) return [[{ id: 1 }]];
    if (sql.includes('WHERE access_code = ?')) {
      return [params[0] === 'vy1020' ? [{ id: 3, full_name: 'Nguyễn Thúy Vy', member_type: 'class' }] : []];
    }
    if (sql.startsWith('INSERT INTO letter_replies')) return [{ insertId: 11 }];
    if (sql.startsWith('UPDATE letter_replies')) {
      statusUpdates.push(params);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM letter_replies r')) return [[]];
    return undefined;
  });

  const created = await fetch(`${base}/api/gifts/vy1020/replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'class', content: 'Cảm ơn cả lớp!' }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.status, 'pending');

  const missing = await fetch(`${base}/api/gifts/khong-co/replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'class', content: 'Hi' }),
  });
  assert.equal(missing.status, 404);

  assert.equal((await fetch(`${base}/api/replies`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/replies`)).status, 401);

  const headers = { Authorization: `Bearer ${signToken({ sub: 1 })}`, 'Content-Type': 'application/json' };
  const approved = await fetch(`${base}/api/admin/replies/11/status`, {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(approved.status, 200);
  assert.deepEqual(statusUpdates[0], ['approved', 11]);
  const invalid = await fetch(`${base}/api/admin/replies/11/status`, {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'pending' }),
  });
  assert.equal(invalid.status, 400);
});

test('khi trang quà đang khoá thì không hồi âm được và hộp thư hồi âm cũng đóng', async (t) => {
  withPool(t);
  const base = await startApp(t);
  mockSettings({ gift_pages_locked: '1' });
  const reply = await fetch(`${base}/api/gifts/vy1020/replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'class', content: 'Hi' }),
  });
  assert.equal(reply.status, 423);
  assert.equal((await fetch(`${base}/api/replies`)).status, 423);
});

test('trang quà vẫn mở được trên máy chưa chạy migration 020', async (t) => {
  withPool(t);
  pool.execute = async () => {
    throw Object.assign(new Error("Table 'gift.letter_replies' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
  };
  assert.deepEqual(await replyService.listStudentReplies(3), []);
  assert.deepEqual(await replyService.listBoard(), { items: [], total: 0 });
  assert.equal(await replyService.countByStatus(), null);
});

// ── Bản lưu quà ─────────────────────────────────────────────────────────────

const KEEPSAKE_STUDENT = {
  id: 3,
  full_name: 'Nguyễn Thúy Vy',
  nickname: 'Vy',
  avatar_url: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/avatar.jpg',
  intro_message: 'Gửi cô bạn bàn đầu',
  admin_wish: 'Chúc Vy luôn cười thật tươi',
  member_type: 'class',
};

test('bản lưu quà là một file HTML tự chứa, không script, mọi chữ đều được escape', () => {
  const html = keepsakeService.renderKeepsake({
    student: { ...KEEPSAKE_STUDENT, nickname: '<b>Vy</b>' },
    gallery: [{ id: 1, image_url: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/a.jpg', caption: 'Buổi dã ngoại' }],
    letters: [
      { id: 5, sender_name: 'Tuấn', sender_kind: 'classmate', title: 'Gửi Vy', content: 'Chúc cậu <script>alert(1)</script>', created_at: '2026-10-18T14:30:00.000Z' },
      { id: 6, sender_name: null, is_anonymous: 1, sender_kind: 'guest', content: 'Một người bí mật', created_at: '2026-10-19T02:00:00.000Z' },
    ],
    replies: [
      { id: 1, target: 'letter', letter_id: 5, content: 'Cảm ơn Tuấn!', created_at: '2026-10-20T01:00:00.000Z' },
      { id: 2, target: 'letter', letter_id: 6, content: 'Cảm ơn bạn bí mật', created_at: '2026-10-20T01:05:00.000Z' },
      { id: 3, target: 'class', content: 'Yêu cả lớp', created_at: '2026-10-20T01:10:00.000Z' },
    ],
    greeting: 'Chúc Vy một ngày 20/10 thật vui',
    srcOf: (url) => (url ? `data:image/jpeg;base64,${Buffer.from(url).toString('base64')}` : null),
    now: new Date('2026-10-20T03:00:00.000Z'),
  });

  assert.match(html, /^<!doctype html>/);
  assert.equal(/<script/i.test(html), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Gửi <span>&lt;b&gt;Vy&lt;\/b&gt;<\/span>,/);
  assert.match(html, /LỜI CHÚC TỪ ADMIN/);
  assert.match(html, /Chúc Vy một ngày 20\/10 thật vui/);
  assert.match(html, /Buổi dã ngoại/);
  assert.match(html, /Từ các bạn nam 12A1/);
  assert.match(html, /Một người bạn ẩn danh/);
  assert.match(html, /Gửi Tuấn/);
  assert.match(html, /Gửi người bạn ẩn danh/);
  assert.match(html, /Gửi cả lớp 12A1/);
  // Giờ Việt Nam, không phải giờ máy chủ
  assert.match(html, /18\.10\.2026 · 21:30/);
  assert.match(html, /20\.10\.2026 · 10:00/);
  assert.match(html, /Lớp 12A1 · 20\.10\.2026/);
  assert.equal(html.includes('res.cloudinary.com'), false);
});

test('bản lưu chỉ tải ảnh từ Cloudinary, ảnh lỗi thì giữ link thay vì hỏng cả file', async () => {
  keepsakeService.clearCache();
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.includes('broken')) return { ok: false, status: 500, headers: new Headers() };
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };
  const { html, filename, embedded } = await keepsakeService.buildKeepsake({
    student: { ...KEEPSAKE_STUDENT, avatar_url: 'http://169.254.169.254/latest/meta-data' },
    gallery: [
      { id: 1, image_url: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/a.jpg', caption: null },
      { id: 2, image_url: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/broken.jpg', caption: null },
    ],
    letters: [],
    replies: [],
    greeting: 'Chúc\u0000 Vy',
  }, { fetchImpl, logger: null, now: new Date('2026-10-20T03:00:00.000Z') });

  // Địa chỉ nội bộ không bao giờ bị máy chủ gọi tới
  assert.equal(requested.some((url) => url.includes('169.254')), false);
  assert.ok(requested.every((url) => url.startsWith('https://res.cloudinary.com/')));
  assert.ok(requested[0].includes('/image/upload/f_jpg,q_auto:good,c_limit,w_1280/v1/gift_20_10/a.jpg'));
  assert.equal(embedded, 1);
  assert.match(html, /data:image\/jpeg;base64,AQID/);
  assert.match(html, /https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/f_jpg,q_auto:good,c_limit,w_1280\/v1\/gift_20_10\/broken\.jpg/);
  assert.equal(html.includes('169.254'), false);
  assert.match(html, /Chúc Vy/);
  assert.equal(filename, 'qua-20-10-vy.html');

  // Lần tải sau lấy ảnh từ bộ nhớ đệm, không gọi Cloudinary lại
  requested.length = 0;
  await keepsakeService.buildKeepsake({
    student: KEEPSAKE_STUDENT,
    gallery: [{ id: 1, image_url: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/a.jpg' }],
  }, { fetchImpl, logger: null, now: new Date('2026-10-20T03:10:00.000Z') });
  assert.equal(requested.some((url) => url.endsWith('/a.jpg')), false);
});

test('tải bản lưu qua API trả file đính kèm, và bị chặn khi trang quà còn khoá', async (t) => {
  withPool(t);
  keepsakeService.clearCache();
  const base = await startApp(t);
  const settings = mockSettings({}, async (sql, params) => {
    if (sql.includes('WHERE access_code = ?')) {
      return [params[0] === 'vy1020' ? [{ ...KEEPSAKE_STUDENT, avatar_url: null }] : []];
    }
    return undefined;
  });

  const response = await fetch(`${base}/api/gifts/vy1020/keepsake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ greeting: 'Chúc Vy vui' }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="qua-20-10-vy.html"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /Chúc Vy vui/);
  assert.match(html, /Gửi <span>Vy<\/span>,/);

  settings.settings.gift_pages_locked = '1';
  const locked = await fetch(`${base}/api/gifts/vy1020/keepsake`, { method: 'POST' });
  assert.equal(locked.status, 423);
});

// ── Sau vòng kiểm lại bản sửa ───────────────────────────────────────────────

test('khớp trọn chữ tôn trọng dấu và mọi ranh giới chữ, nhưng vẫn nhận thư ký không dấu', async (t) => {
  withPool(t);
  const row = (id, sender) => ({
    id, target: 'letter', content: `Hồi âm ${id}`, created_at: '2026-10-20T01:00:00.000Z',
    from_full_name: 'Vy', letter_exists: id, letter_sender_name: sender, letter_is_anonymous: 0,
  });
  pool.execute = async () => [[
    row(1, 'Nguyễn Văn Hùng'), row(2, 'Hoàng Nam.'), row(3, 'Nam❤️'), row(4, 'Tuan'), row(5, 'Lê Ân'),
  ]];
  const exact = async (to) => (await replyService.listBoard({ to, exact: true })).items.map((item) => item.id);
  // Hưng không phải Hùng, An không phải Ân — cả hai bên đều có dấu mà khác dấu
  assert.deepEqual(await exact('Hưng'), []);
  assert.deepEqual(await exact('Hùng'), [1]);
  assert.deepEqual(await exact('An'), []);
  // Tên theo sau bởi dấu chấm hay emoji vẫn là một chữ trọn vẹn
  assert.deepEqual(await exact('Nam'), [2, 3]);
  // Người ký không dấu vẫn nhận được lời báo của chính mình
  assert.deepEqual(await exact('Tuấn'), [4]);
  // Người gõ không dấu thì không đoán ("An" là tên thật, không phải "Ân")…
  assert.deepEqual(await exact('hung'), []);
  // …nhưng ô tìm kiếm ở Hộp thư vẫn bỏ dấu, gõ tới đâu lọc tới đó
  assert.deepEqual((await replyService.listBoard({ to: 'hung' })).items.map((item) => item.id), [1]);
});

test('thư riêng gửi admin không trả nội dung ra trang quà và không vào bản lưu', async (t) => {
  withPool(t);
  let sql;
  pool.execute = async (query) => {
    sql = query;
    return [[{ id: 1, target: 'admin', content: null, status: 'pending' }]];
  };
  await replyService.listStudentReplies(3);
  assert.match(sql, /CASE WHEN target = 'admin' THEN NULL ELSE content END AS content/);

  keepsakeService.clearCache();
  const base = await startApp(t);
  mockSettings({}, async (query, params) => {
    if (query.includes('WHERE access_code = ?')) {
      return [params[0] === 'vy1020' ? [{ ...KEEPSAKE_STUDENT, avatar_url: null }] : []];
    }
    if (query.includes('FROM letter_replies')) {
      return [[
        { id: 1, target: 'admin', content: null, status: 'pending', created_at: '2026-10-20T01:00:00.000Z' },
        { id: 2, target: 'class', content: 'Yêu cả lớp', status: 'approved', created_at: '2026-10-20T01:05:00.000Z' },
      ]];
    }
    return undefined;
  });
  const html = await (await fetch(`${base}/api/gifts/vy1020/keepsake`, { method: 'POST' })).text();
  assert.match(html, /Yêu cả lớp/);
  assert.equal(html.includes('Gửi admin'), false);
});

test('bấm khoá khi vốn đã khoá (thanh bên cũ trên máy khác) giữ nguyên lịch hẹn', async (t) => {
  withPool(t);
  const { settings } = mockSettings({ gift_pages_locked: '1', gift_unlock_at: '2099-10-19T17:00:00.000Z' });
  await settingsService.setGiftPagesLocked(true);
  assert.equal(settings.gift_unlock_at, '2099-10-19T17:00:00.000Z');
  await settingsService.setGiftPagesLocked(false);
  assert.equal(settings.gift_unlock_at, '');
});

test('máy chưa chạy migration 020 vẫn backup được: bảng thiếu bị bỏ qua, không phát DELETE', async () => {
  const { tableToSql } = require('../scripts/backup');
  const connection = {
    query: async () => { throw Object.assign(new Error("Table 'gift.letter_replies' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }); },
  };
  const sql = await tableToSql(connection, 'letter_replies');
  assert.match(sql, /chưa có bảng/);
  assert.equal(/DELETE/.test(sql), false);
  const broken = { query: async () => { throw Object.assign(new Error('Lost connection'), { code: 'PROTOCOL_CONNECTION_LOST' }); } };
  await assert.rejects(() => tableToSql(broken, 'letters'), /Lost connection/);
});

test('mã trang quà có dấu hay ký tự lạ bị chặn trước mọi hạn mức — không né được giới hạn theo trang', async (t) => {
  withPool(t);
  const base = await startApp(t);
  const lookups = [];
  mockSettings({}, async (sql, params) => {
    if (sql.includes('WHERE access_code = ?')) lookups.push(params[0]);
    return undefined;
  });
  for (const code of ['12a1-l%C3%ADnh-tan', '12a1-linh-tan%20', '12a1%2Flinh']) {
    const response = await fetch(`${base}/api/gifts/${code}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'class', content: 'Hi' }),
    });
    assert.equal(response.status, 404, code);
  }
  assert.deepEqual(lookups, []);
});
