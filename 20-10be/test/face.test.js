const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-face';
// Host riêng để giả lập face-service không bao giờ trùng cổng ngẫu nhiên của
// server test (127.0.0.1:50021 cũng "bắt đầu bằng" 127.0.0.1:5002)
process.env.FACE_SERVICE_URL = 'http://face-service.test.invalid:5002';

const pool = require('../config/db');
const faceService = require('../services/faceService');
const { isSharedDataMutation } = require('../middleware/dataRevision');
const { signToken } = require('../utils/jwt');
const { FACE_SERVICE_URL } = require('../config/constants');
const app = require('../server');

const realFetch = global.fetch;

function oneHot(index) {
  const values = new Array(512).fill(0);
  values[index] = 1;
  return values;
}

// Vector đơn vị nằm giữa trục 0 và trục 1: cosine với e0 = a, với e1 = b
function mix(a, b) {
  const values = new Array(512).fill(0);
  values[0] = a;
  values[1] = b;
  const norm = Math.hypot(a, b);
  return values.map((v) => v / norm);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Chỉ chặn request tới face-service; request tới server test đi qua bình thường
function stubFaceService(handler) {
  const calls = [];
  global.fetch = async (url, options) => {
    const target = String(url);
    if (target.startsWith(FACE_SERVICE_URL)) {
      calls.push(target);
      return handler(target, options);
    }
    return realFetch(url, options);
  };
  return calls;
}

function healthyService(faces) {
  return (url) => {
    if (url.endsWith('/health')) return jsonResponse({ status: 'ok', model: 'arcface_r50' });
    return jsonResponse({ faces, image: { width: 480, height: 360 }, elapsed_ms: 12 });
  };
}

const GALLERY = [
  { student_id: 1, kind: 'enroll', embedding: faceService.encodeEmbedding(oneHot(0)), full_name: 'Nguyễn Thúy Vy', nickname: 'Vy', access_code: 'vy1020' },
  { student_id: 2, kind: 'enroll', embedding: faceService.encodeEmbedding(oneHot(1)), full_name: 'Hương', nickname: null, access_code: '12a1-huong' },
];

const SCAN = 'ab'.repeat(16);
const SCAN_ID = 7;

function mockDatabase({ faceEnabled = '1', giftLocked = '0', gallery = GALLERY } = {}) {
  const writes = [];
  // Lượt quét giả: tạo một lần rồi đọc lại được; chỉ tín hiệu kết thúc đầu
  // tiên được ghi (WHERE outcome IS NULL)
  let scanCreated = false;
  let scanOutcome = null;
  pool.execute = async (sql, params = []) => {
    if (sql.includes('FROM admins')) return [[{ id: 1 }]];
    if (sql.includes('FROM app_settings')) {
      const value = params[0] === 'face_enabled' ? faceEnabled : giftLocked;
      return [[{ setting_value: value }]];
    }
    if (sql.startsWith('INSERT INTO app_settings')) {
      writes.push({ sql, params });
      if (params[0] === 'face_enabled') faceEnabled = params[1];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM face_profiles')) return [gallery];
    if (sql.includes('SELECT id FROM face_scans')) return [scanCreated ? [{ id: SCAN_ID }] : []];
    if (sql.includes('INSERT INTO face_scans')) {
      writes.push({ sql, params });
      scanCreated = true;
      return [{ insertId: SCAN_ID }];
    }
    if (sql.includes('UPDATE face_scans')) {
      writes.push({ sql, params });
      if (sql.includes('claimed_student_id')) return [{ affectedRows: 1 }];
      if (scanOutcome) return [{ affectedRows: 0 }];
      [scanOutcome] = params;
      return [{ affectedRows: 1 }];
    }
    // Chỉ khung 42 là khung "match" (của học sinh 1) thuộc lượt SCAN_ID
    if (sql.includes('SELECT student_id FROM face_match_log')) {
      return [params[0] === 42 && params[1] === SCAN_ID ? [{ student_id: 1 }] : []];
    }
    if (sql.includes('WHERE access_code = ?')) {
      return [params[0] === 'vy1020' ? [{ id: 1 }] : []];
    }
    if (sql.includes('INSERT INTO face_match_log')) {
      writes.push({ sql, params });
      return [{ insertId: 42 }];
    }
    if (sql.includes('UPDATE face_match_log')) {
      writes.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM')) {
      writes.push({ sql, params });
      return [{ affectedRows: 3 }];
    }
    if (sql.includes('revision = revision + 1')) return [{ affectedRows: 1 }];
    return [[]];
  };
  return writes;
}

// Cột → giá trị của một câu INSERT, để test không phụ thuộc thứ tự cột
function insertedRow(write) {
  const columns = write.sql.match(/\(([^)]+)\)\s*VALUES/)[1].split(',').map((column) => column.trim());
  return Object.fromEntries(columns.map((column, index) => [column, write.params[index]]));
}

async function startApp(t) {
  const originalExecute = pool.execute;
  faceService.resetCache();
  const server = app.listen(0);
  t.after(() => {
    server.close();
    pool.execute = originalExecute;
    global.fetch = realFetch;
    faceService.resetCache();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function frameForm(fields = {}) {
  const form = new FormData();
  form.append('frame', new Blob([Buffer.from('not-really-a-jpeg')], { type: 'image/jpeg' }), 'frame.jpg');
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

// ── Hàm thuần ───────────────────────────────────────────────────────────────

test('face decide: accepts only a clear winner above the threshold', () => {
  const match = faceService.decide([{ studentId: 1, score: 0.6 }, { studentId: 2, score: 0.4 }]);
  assert.equal(match.decision, 'match');
  assert.equal(match.studentId, 1);
  assert.ok(Math.abs(match.margin - 0.2) < 1e-9);

  // Đủ ngưỡng nhưng hai bạn quá sát nhau → không dám gọi tên
  const close = faceService.decide([{ studentId: 1, score: 0.5 }, { studentId: 2, score: 0.45 }]);
  assert.equal(close.decision, 'reject');
  assert.equal(close.studentId, null);

  // Cách biệt lớn nhưng điểm dưới ngưỡng → người lạ
  const low = faceService.decide([{ studentId: 1, score: 0.4 }, { studentId: 2, score: 0.05 }]);
  assert.equal(low.decision, 'reject');

  // Thư viện chỉ một bạn: cách biệt lấy bằng chính điểm
  assert.equal(faceService.decide([{ studentId: 7, score: 0.5 }]).decision, 'match');
  assert.equal(faceService.decide([]).decision, 'reject');
});

test('face embedding survives the BLOB round-trip, even from an unaligned buffer', () => {
  const values = mix(0.8, 0.6);
  const encoded = faceService.encodeEmbedding(values);
  assert.equal(encoded.length, 2048);

  // mysql2 có thể trả BLOB là một lát cắt lệch 1 byte trong gói tin
  const packet = Buffer.alloc(2049);
  encoded.copy(packet, 1);
  const decoded = faceService.decodeEmbedding(packet.subarray(1));
  assert.ok(Math.abs(decoded[0] - 0.8) < 1e-6);
  assert.ok(Math.abs(decoded[1] - 0.6) < 1e-6);

  assert.throws(() => faceService.encodeEmbedding([1, 2, 3]), /512/);
  assert.throws(() => faceService.decodeEmbedding(Buffer.alloc(100)), /2048/);
  assert.throws(() => faceService.encodeEmbedding(new Array(512).fill(Number.NaN)), /không hợp lệ/);
});

test('face quality gate runs no_face, many_faces, small, dark, blurry in that order', () => {
  const good = { face_px: 150, brightness: 120, blur: 90 };
  assert.deepEqual(faceService.gate([]), { decision: 'no_face' });
  assert.deepEqual(faceService.gate([good, { ...good, face_px: 100 }]), { decision: 'many_faces', faces: 2 });
  // Một mặt nhỏ phía sau không tính là "nhiều người"
  assert.equal(faceService.gate([good, { ...good, face_px: 30 }]), null);
  assert.equal(faceService.gate([{ ...good, face_px: 60, brightness: 10 }]).reason, 'small');
  assert.equal(faceService.gate([{ ...good, brightness: 20, blur: 5 }]).reason, 'dark');
  assert.equal(faceService.gate([{ ...good, blur: 5 }]).reason, 'blurry');
  assert.equal(faceService.gate([good]), null);
});

test('face match requests never count as shared-data mutations', () => {
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/face/match' }), false);
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/face/confirm' }), false);
});

// ── HTTP ────────────────────────────────────────────────────────────────────

test('face status stays off without asking the service when the admin switch is off', async (t) => {
  const base = await startApp(t);
  mockDatabase({ faceEnabled: '0' });
  const calls = stubFaceService(healthyService([]));

  const response = await fetch(`${base}/api/face/status`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { enabled: false, model: null, profiles: 0 });
  assert.equal(calls.length, 0);
});

test('face status turns on only with switch, healthy service and enrolled profiles', async (t) => {
  const base = await startApp(t);
  mockDatabase();
  stubFaceService(healthyService([]));
  const on = await (await fetch(`${base}/api/face/status`)).json();
  assert.deepEqual(on.data, { enabled: true, model: 'arcface_r50', profiles: 2 });

  faceService.resetCache();
  mockDatabase({ gallery: [] });
  const empty = await (await fetch(`${base}/api/face/status`)).json();
  assert.equal(empty.data.enabled, false);

  faceService.resetCache();
  mockDatabase();
  stubFaceService(() => { throw new Error('ECONNREFUSED'); });
  const down = await (await fetch(`${base}/api/face/status`)).json();
  assert.equal(down.data.enabled, false);
});

test('face match names the student, logs numbers only, and ignores the 20/10 lock', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase({ giftLocked: '1' });
  stubFaceService(healthyService([{ face_px: 150, brightness: 120, blur: 90, embedding: mix(0.8, 0.6) }]));

  const response = await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm() });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.decision, 'match');
  assert.equal(data.matchId, 42);
  assert.equal(data.studentId, 1);
  assert.equal(data.giftPath, '/gift/vy1020');
  assert.equal(data.displayName, 'Vy');
  assert.equal(data.score, 0.8);
  assert.equal(data.margin, 0.2);

  const log = writes.find((w) => w.sql.includes('INSERT INTO face_match_log'));
  assert.ok(log, 'phải ghi một dòng nhật ký');
  const row = insertedRow(log);
  assert.equal(row.student_id, 1);
  assert.equal(row.candidate_id, 1);
  assert.equal(row.decision, 'match');
  // Không kèm mã lượt quét → dòng nhật ký không thuộc lượt nào, không tạo lượt
  assert.equal(row.scan_id, null);
  assert.equal(writes.filter((w) => w.sql.includes('face_scans')).length, 0);
  // Không có ảnh hay vector trong nhật ký: toàn số hoặc chuỗi quyết định ngắn
  for (const value of log.params) {
    assert.ok(value === null || typeof value === 'number' || value === 'match');
  }
});

test('face match rejects look-alikes without revealing any name', async (t) => {
  const base = await startApp(t);
  mockDatabase();
  stubFaceService(healthyService([{ face_px: 150, brightness: 120, blur: 90, embedding: mix(1, 1) }]));

  const { data } = await (await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm() })).json();
  assert.equal(data.decision, 'reject');
  assert.equal(data.matchId, 42);
  assert.equal(data.displayName, undefined);
  assert.equal(data.giftPath, undefined);
  assert.equal(data.studentId, undefined);
  // Người giống nhất chỉ nằm trong nhật ký cho admin, không bao giờ về trình duyệt
  assert.equal(data.candidateId, undefined);
});

test('face match turns quality problems into hints without logging them', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  stubFaceService(healthyService([{ face_px: 40, brightness: 120, blur: 90, embedding: mix(0.8, 0.6) }]));

  const { data } = await (await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm() })).json();
  assert.equal(data.decision, 'low_quality');
  assert.equal(data.reason, 'small');
  assert.equal(writes.filter((w) => w.sql.includes('face_match_log')).length, 0);
});

test('face match answers 503 with a friendly message when the service is down or switched off', async (t) => {
  const base = await startApp(t);
  mockDatabase();
  stubFaceService(() => { throw new Error('ECONNREFUSED'); });
  const down = await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm() });
  assert.equal(down.status, 503);
  assert.equal((await down.json()).message, faceService.UNAVAILABLE_MESSAGE);

  faceService.resetCache();
  mockDatabase({ faceEnabled: '0' });
  stubFaceService(healthyService([]));
  const off = await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm() });
  assert.equal(off.status, 503);
});

test('face match refuses a request without a frame or with a non-image frame', async (t) => {
  const base = await startApp(t);
  mockDatabase();
  stubFaceService(healthyService([]));

  const missing = await fetch(`${base}/api/face/match`, { method: 'POST', body: new FormData() });
  assert.equal(missing.status, 400);

  const form = new FormData();
  form.append('frame', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
  const wrongType = await fetch(`${base}/api/face/match`, { method: 'POST', body: form });
  assert.equal(wrongType.status, 400);
});

test('face confirm validates its body and only fills an unanswered log row', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  const post = (body) => fetch(`${base}/api/face/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  assert.equal((await post({ matchId: 'x', confirmed: true })).status, 400);
  assert.equal((await post({ matchId: 5, confirmed: 'yes' })).status, 400);

  const ok = await post({ matchId: 42, confirmed: true });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { ok: true });
  const update = writes.find((w) => w.sql.includes('UPDATE face_match_log'));
  assert.match(update.sql, /confirmed IS NULL/);
  assert.deepEqual(update.params, [1, 42]);
});

// ── Lượt quét (lịch sử cho admin) ─────────────────────────────────────────────

test('frames of a scan are all logged with their numbers, quality problems included', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  const faces = [];
  stubFaceService((url) => {
    if (url.endsWith('/health')) return jsonResponse({ status: 'ok', model: 'arcface_r50' });
    return jsonResponse({ faces: faces.shift(), image: { width: 480, height: 360 }, elapsed_ms: 12 });
  });
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/560 ZaloTheme/light';
  const send = (ms) => fetch(`${base}/api/face/match`, {
    method: 'POST', body: frameForm({ scan: SCAN, t: ms }), headers: { 'User-Agent': userAgent },
  }).then((response) => response.json());

  faces.push([{ face_px: 40, brightness: 120, blur: 90, det_score: 0.91, embedding: mix(0.8, 0.6) }]);
  const small = await send('800');
  // Trình duyệt vẫn chỉ nhận câu nhắc như cũ
  assert.deepEqual(small.data, { decision: 'low_quality', reason: 'small', face_px: 40, brightness: 120, blur: 90 });

  faces.push([]);
  assert.equal((await send('1600')).data.decision, 'no_face');

  const scans = writes.filter((w) => w.sql.includes('INSERT INTO face_scans'));
  assert.equal(scans.length, 1, 'khung đầu tạo lượt, khung sau chỉ đọc lại id');
  assert.deepEqual(scans[0].params, [SCAN, 'iphone', 'zalo']);

  const [first, second] = writes.filter((w) => w.sql.includes('INSERT INTO face_match_log')).map(insertedRow);
  assert.equal(first.scan_id, SCAN_ID);
  assert.equal(first.decision, 'low_quality');
  assert.equal(first.reason, 'small');
  assert.equal(first.face_px, 40);
  assert.equal(first.det_score, 0.91);
  assert.equal(first.t_ms, 800);
  assert.equal(first.faces, 1);
  assert.equal(second.decision, 'no_face');
  assert.equal(second.faces, 0);
  assert.equal(second.face_px, null);
  assert.equal(second.t_ms, 1600);
});

test('a malformed scan token is ignored: no scan row, quality frames stay unlogged', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  stubFaceService(healthyService([{ face_px: 40, brightness: 120, blur: 90, embedding: mix(0.8, 0.6) }]));

  const { data } = await (await fetch(`${base}/api/face/match`, {
    method: 'POST', body: frameForm({ scan: "x' OR 1=1 --", t: '10' }),
  })).json();
  assert.equal(data.decision, 'low_quality');
  assert.equal(writes.length, 0);
});

test('scan end validates its input and only the first outcome counts', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  const end = (token, body) => postJson(`${base}/api/face/scans/${token}/end`, body);

  assert.equal((await end('not-a-token', { outcome: 'closed' })).status, 400);
  assert.equal((await end(SCAN, { outcome: 'exploded' })).status, 400);
  // Trả lời câu hỏi "Có phải cậu là…?" thì phải chỉ ra khung được hỏi
  assert.equal((await end(SCAN, { outcome: 'confirmed' })).status, 400);
  assert.equal(writes.length, 0);

  const ok = await end(SCAN, { outcome: 'confirmed', matchId: 42, durationMs: 1734, darkFrames: 2 });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { ok: true });
  const update = writes.find((w) => w.sql.includes('UPDATE face_scans'));
  assert.match(update.sql, /outcome IS NULL/);
  assert.deepEqual(update.params, ['confirmed', 1, 1734, 2, SCAN_ID]);
  // Câu trả lời cũng điền vào dòng nhật ký của khung được hỏi
  const confirm = writes.find((w) => w.sql.includes('UPDATE face_match_log'));
  assert.deepEqual(confirm.params, [1, 42]);

  // "Đóng modal" tới muộn không ghi đè được "Đúng là mình"
  const late = await end(SCAN, { outcome: 'closed', matchId: 42 });
  assert.equal(late.status, 200);
  assert.equal(writes.filter((w) => w.sql.includes('UPDATE face_match_log')).length, 1);
});

test('scan end records "network" apart from "offline": the frame never reached us, the service is fine', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();

  const response = await postJson(`${base}/api/face/scans/${SCAN}/end`, { outcome: 'network', durationMs: 21700 });
  assert.equal(response.status, 200);
  const update = writes.find((w) => w.sql.includes('UPDATE face_scans'));
  assert.deepEqual(update.params, ['network', null, 21700, 0, SCAN_ID]);
});

test('scan end never attaches a name through a match frame of another scan', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();

  const response = await postJson(`${base}/api/face/scans/${SCAN}/end`, { outcome: 'denied', matchId: 41 });
  assert.equal(response.status, 200);
  const update = writes.find((w) => w.sql.includes('UPDATE face_scans'));
  assert.equal(update.params[0], 'denied');
  assert.equal(update.params[1], null);
  assert.equal(writes.filter((w) => w.sql.includes('UPDATE face_match_log')).length, 0);
});

test('typing a name after an unsuccessful scan attaches it, only through a real class access code', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();
  const claim = (body) => postJson(`${base}/api/face/scans/claim`, body);

  assert.equal((await claim({ accessCode: 'vy1020' })).status, 400);

  const ok = await claim({ tokens: [SCAN, 'bad-token', SCAN], accessCode: 'vy1020' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { ok: true });
  const update = writes.find((w) => w.sql.includes('claimed_student_id'));
  assert.deepEqual(update.params, [1, SCAN]);
  // Không ghép vào lượt đã được nhận ra, lượt đã có tên, hay lượt cũ quá 30 phút
  assert.match(update.sql, /outcome <> 'confirmed'/);
  assert.match(update.sql, /claimed_student_id IS NULL/);
  assert.match(update.sql, /INTERVAL 30 MINUTE/);

  // Mã quà không có thật: vẫn trả ok (không dò được), không ghi gì
  const unknown = await claim({ tokens: [SCAN], accessCode: 'khong-co' });
  assert.deepEqual((await unknown.json()).data, { ok: true });
  assert.equal(writes.filter((w) => w.sql.includes('claimed_student_id')).length, 1);
});

test('Face ID traffic has its own generous limit and never eats the shared API budget', async (t) => {
  const base = await startApp(t);
  mockDatabase();
  stubFaceService(healthyService([{ face_px: 150, brightness: 120, blur: 90, embedding: mix(0.8, 0.6) }]));
  // /api/face/status chỉ đi qua limiter chung → header cho biết hạn mức chung còn bao nhiêu
  const sharedRemaining = async () => Number((await fetch(`${base}/api/face/status`)).headers.get('ratelimit-remaining'));

  const before = await sharedRemaining();
  let frame;
  for (let i = 0; i < 3; i += 1) {
    frame = await fetch(`${base}/api/face/match`, { method: 'POST', body: frameForm({ scan: SCAN, t: String(i * 800) }) });
    assert.equal(frame.status, 200);
  }
  const end = await postJson(`${base}/api/face/scans/${SCAN}/end`, { outcome: 'closed' });
  assert.equal(end.status, 200);

  // Trang chỉ dùng trong lớp: hạn mức khung hình rất cao, chỉ để phanh máy kẹt vòng lặp
  assert.equal(frame.headers.get('ratelimit-limit'), '10000');
  assert.equal(end.headers.get('ratelimit-limit'), '5000');
  // Ba khung hình và tín hiệu kết thúc không bị tính vào hạn mức chung — chỉ
  // lần hỏi status thứ hai bị tính
  assert.equal(await sharedRemaining(), before - 1);
});

test('scan events never count as shared-data mutations', () => {
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: `/api/face/scans/${SCAN}/end` }), false);
  assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/face/scans/claim' }), false);
  assert.equal(isSharedDataMutation({ method: 'DELETE', originalUrl: '/api/admin/face/scans' }), false);
});

test('Face ID history is admin-only, and clearing it wipes scans and frame logs', async (t) => {
  const base = await startApp(t);
  const writes = mockDatabase();

  assert.equal((await fetch(`${base}/api/admin/face/summary`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/face/scans`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/face/scans`, { method: 'DELETE' })).status, 401);
  assert.equal(writes.length, 0);

  const headers = { Authorization: `Bearer ${signToken({ sub: 1 })}` };
  const summary = await fetch(`${base}/api/admin/face/summary`, { headers });
  assert.equal(summary.status, 200);
  assert.deepEqual((await summary.json()).data.totals, { scans: 0, confirmed: 0, denied: 0, failed: 0 });

  const missing = await fetch(`${base}/api/admin/face/scans/999`, { headers });
  assert.equal(missing.status, 404);

  const cleared = await fetch(`${base}/api/admin/face/scans`, { method: 'DELETE', headers });
  assert.equal(cleared.status, 200);
  assert.deepEqual(writes.map((w) => w.sql), ['DELETE FROM face_match_log', 'DELETE FROM face_scans']);
});

test('admin settings expose and toggle the Face ID switch separately from the lock', async (t) => {
  const base = await startApp(t);
  mockDatabase({ faceEnabled: '0' });
  const headers = { Authorization: `Bearer ${signToken({ sub: 1 })}`, 'Content-Type': 'application/json' };

  const initial = await (await fetch(`${base}/api/admin/settings`, { headers })).json();
  assert.deepEqual(initial.data, { gift_pages_locked: false, face_enabled: false });

  const toggled = await fetch(`${base}/api/admin/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ face_enabled: true }),
  });
  assert.equal(toggled.status, 200);
  assert.deepEqual((await toggled.json()).data, { face_enabled: true });

  const invalid = await fetch(`${base}/api/admin/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ face_enabled: 'on' }),
  });
  assert.equal(invalid.status, 400);

  const empty = await fetch(`${base}/api/admin/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({}),
  });
  assert.equal(empty.status, 400);
});
