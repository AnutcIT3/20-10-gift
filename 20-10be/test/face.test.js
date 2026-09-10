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

function mockDatabase({ faceEnabled = '1', giftLocked = '0', gallery = GALLERY } = {}) {
  const writes = [];
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
    if (sql.includes('INSERT INTO face_match_log')) {
      writes.push({ sql, params });
      return [{ insertId: 42 }];
    }
    if (sql.includes('UPDATE face_match_log')) {
      writes.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('revision = revision + 1')) return [{ affectedRows: 1 }];
    return [[]];
  };
  return writes;
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

function frameForm() {
  const form = new FormData();
  form.append('frame', new Blob([Buffer.from('not-really-a-jpeg')], { type: 'image/jpeg' }), 'frame.jpg');
  return form;
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
  assert.equal(log.params[0], 1);
  assert.equal(log.params[1], 'match');
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
