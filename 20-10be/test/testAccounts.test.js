const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-test-accounts';

const pool = require('../config/db');
const eventService = require('../services/eventService');
const studentService = require('../services/studentService');

// Tài khoản thử: mở quà được như thành viên lớp, nhưng không tính vào sĩ số.

const original = pool.execute;
test.afterEach(() => {
  pool.execute = original;
  eventService.clearCache();
});

test('tài khoản thử mở quà không góp cánh cho bông hoa và không được ghi lại', async () => {
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return [[]];
  };
  assert.deepEqual(await eventService.recordOpen({ id: 26, member_type: 'test' }, 'name'), { counted: false });
  assert.equal(calls.some((call) => call.sql.startsWith('INSERT INTO gift_opens')), false);
});

test('sĩ số và danh sách đã mở của bông hoa chỉ tính thành viên lớp', async () => {
  const seen = [];
  pool.execute = async (sql) => {
    seen.push(sql);
    if (sql.includes('FROM app_settings')) return [[]];
    if (sql.includes('COUNT(*) AS total FROM students')) return [[{ total: 18 }]];
    return [[]];
  };
  const summary = await eventService.openSummary();
  assert.equal(summary.total, 18);
  const studentQueries = seen.filter((sql) => sql.includes('students'));
  assert.ok(studentQueries.length >= 2);
  for (const sql of studentQueries) assert.match(sql, /member_type = 'class'/);
});

test('admin đổi thành viên lớp sang tài khoản thử, nhưng không đổi được hồ sơ bạn ngoài lớp', async () => {
  let update;
  pool.execute = async (sql, params) => {
    if (sql.startsWith('UPDATE')) {
      update = { sql, params };
      return [{ affectedRows: 1 }];
    }
    return [[{ id: 26, full_name: 'an', member_type: 'test', access_code: 'an-thu' }]];
  };
  const student = await studentService.updateStudent(26, { member_type: 'test' });
  assert.equal(student.member_type, 'test');
  assert.deepEqual(update.params, ['test', 26]);
  assert.match(update.sql, /AND member_type <> 'friend'/);

  await assert.rejects(() => studentService.updateStudent(26, { member_type: 'friend' }), { statusCode: 400 });
  await assert.rejects(() => studentService.updateStudent(26, { member_type: 'admin' }), { statusCode: 400 });

  // Hồ sơ bạn ngoài lớp: UPDATE không khớp dòng nào nhưng hồ sơ vẫn còn
  pool.execute = async (sql) => {
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 0 }];
    return [[{ id: 40, full_name: 'Minh Thư', member_type: 'friend', access_code: 'ban-minh-thu' }]];
  };
  await assert.rejects(
    () => studentService.updateStudent(40, { member_type: 'class' }),
    { statusCode: 400, message: 'Hồ sơ bạn ngoài lớp không đổi loại được' },
  );
  pool.execute = async (sql) => (sql.startsWith('UPDATE') ? [{ affectedRows: 0 }] : [[]]);
  await assert.rejects(() => studentService.updateStudent(99, { member_type: 'test' }), { statusCode: 404 });
});

test('tạo tài khoản thử mới; trùng tên với thành viên lớp thì bị chặn', async () => {
  let insert;
  let duplicateCheck;
  pool.execute = async (sql, params) => {
    if (sql.startsWith('SELECT id, full_name FROM students')) {
      duplicateCheck = sql;
      return [[]];
    }
    if (sql.startsWith('INSERT INTO students')) {
      insert = params;
      return [{ insertId: 30 }];
    }
    return [[{ id: 30, full_name: 'Khách thử', member_type: 'test', access_code: 'khach-thu' }]];
  };
  await studentService.createStudent({ full_name: 'Khách thử', member_type: 'test' });
  assert.equal(insert.at(-1), 'test');
  // Gõ tên tìm cả lớp lẫn tài khoản thử, nên hai loại không được trùng tên
  assert.match(duplicateCheck, /member_type IN \('class', 'test'\)/);

  await studentService.createStudent({ full_name: 'Bạn mới' });
  assert.equal(insert.at(-1), 'class');
});
