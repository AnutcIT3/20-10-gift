const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const pool = require('../config/db');
const faceHistoryService = require('../services/faceHistoryService');
const { describeUserAgent } = require('../utils/userAgent');

const { diagnose } = faceHistoryService;

function counts(overrides = {}) {
  return {
    match: 0, reject: 0, no_face: 0, many_faces: 0, small: 0, dark: 0, blurry: 0, ...overrides,
  };
}

function withPool(t, handler) {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params = []) => {
    calls.push({ sql, params });
    return handler(sql, params);
  };
  t.after(() => { pool.execute = original; });
  return calls;
}

const STUDENTS = [
  { id: 1, full_name: 'Thanh Huyền', nickname: 'Huyền', avatar_url: null, member_type: 'class', is_active: 1 },
  { id: 2, full_name: 'Hùng', nickname: null, avatar_url: null, member_type: 'class', is_active: 1 },
  { id: 3, full_name: 'Phương Linh', nickname: null, avatar_url: 'https://res.cloudinary.com/demo/a.jpg', member_type: 'class', is_active: 1 },
  { id: 9, full_name: 'Bạn khác lớp', nickname: null, avatar_url: null, member_type: 'friend', is_active: 1 },
];

const at = (minute) => new Date(Date.UTC(2026, 8, 11, 12, minute));

function scanRow(id, fields = {}) {
  return {
    id,
    outcome: null,
    suggested_student_id: null,
    claimed_student_id: null,
    duration_ms: null,
    dark_frames: 0,
    device: 'iphone',
    browser: 'safari',
    started_at: at(id),
    ended_at: at(id),
    ...fields,
  };
}

// ── diagnose: một nguyên nhân cho mỗi lượt chưa thành ─────────────────────────

test('diagnose trusts outcomes that already explain themselves', () => {
  assert.equal(diagnose({ outcome: 'confirmed' }, counts()), null);
  assert.equal(diagnose({ outcome: 'denied', suggested_student_id: 3 }, counts({ match: 2 })), 'wrong_person');
  // 'offline' là máy chủ báo nghỉ, 'network' là khung không tới được máy chủ
  for (const outcome of ['camera', 'offline', 'network', 'limited']) {
    assert.equal(diagnose({ outcome }, counts({ dark: 9 })), outcome);
  }
  // Máy nhìn rõ mặt đủ lâu mà không khớp ai: vấn đề ở hồ sơ, không ở ánh sáng
  assert.equal(diagnose({ outcome: 'unrecognized' }, counts({ reject: 6, dark: 8 })), 'no_match');
  // Máy đã hỏi "Có phải cậu là…?" rồi người dùng bỏ đi
  assert.equal(diagnose({ outcome: 'closed', suggested_student_id: 1 }, counts({ match: 2 })), 'unanswered');
});

test('diagnose picks the problem seen in most frames, counting browser-side dark skips as dark', () => {
  assert.equal(diagnose({ outcome: 'timeout', dark_frames: 3 }, counts({ dark: 5, reject: 2, no_face: 7 })), 'dark');
  assert.equal(diagnose({ outcome: 'timeout' }, counts({ small: 4, blurry: 1 })), 'small');
  assert.equal(diagnose({ outcome: 'hidden' }, counts({ many_faces: 3, no_face: 1 })), 'many_faces');
  // Hòa: ưu tiên "rõ mặt mà không khớp"
  assert.equal(diagnose({ outcome: 'timeout' }, counts({ reject: 4, dark: 4 })), 'no_match');
  // Không có khung nào đáng kể
  assert.equal(diagnose({ outcome: 'timeout' }, counts()), 'no_frames');
  assert.equal(diagnose({ outcome: 'closed' }, counts()), 'left_early');
  assert.equal(diagnose({ outcome: null }, counts({ match: 1 })), 'left_early');
});

// ── listScans ──────────────────────────────────────────────────────────────────

test('history list pages newest first and tells who each scan was and why it failed', async (t) => {
  const calls = withPool(t, (sql) => {
    if (sql.includes('FROM face_scans')) {
      return [[
        scanRow(12, { outcome: 'confirmed', suggested_student_id: 1, duration_ms: 1700, browser: 'zalo' }),
        scanRow(11, { outcome: 'unrecognized', claimed_student_id: 2, duration_ms: 5200, dark_frames: 1 }),
        scanRow(10, { outcome: 'timeout' }),
      ]];
    }
    if (sql.includes('FROM face_match_log')) {
      return [[
        { scan_id: 12, decision: 'match', reason: null, score: '0.8065', margin: '0.5432', candidate_id: 1 },
        { scan_id: 12, decision: 'match', reason: null, score: '0.7012', margin: '0.4100', candidate_id: 1 },
        { scan_id: 11, decision: 'reject', reason: null, score: '0.4100', margin: '0.2000', candidate_id: 2 },
        { scan_id: 11, decision: 'reject', reason: null, score: '0.3800', margin: '0.1500', candidate_id: 2 },
        { scan_id: 11, decision: 'low_quality', reason: 'dark', score: null, margin: null, candidate_id: null },
      ]];
    }
    if (sql.includes('FROM students')) return [STUDENTS];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const page = await faceHistoryService.listScans({ limit: '2' });
  assert.equal(page.ready, true);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextBefore, 11);
  assert.match(calls[0].sql, /ORDER BY s\.id DESC LIMIT 3/);
  assert.deepEqual(calls[1].params, [12, 11], 'chỉ đọc khung của các lượt trong trang');

  const [ok, failed] = page.items;
  assert.equal(ok.outcome, 'confirmed');
  assert.deepEqual(ok.member, { id: 1, name: 'Thanh Huyền', nickname: 'Huyền', via: 'face' });
  assert.equal(ok.issue, null);
  assert.equal(ok.frames, 2);
  assert.equal(ok.counts.match, 2);
  assert.equal(ok.best.score, 0.8065);
  assert.equal(ok.browser, 'zalo');

  // Không nhận ra, rồi tự gõ tên: biết là Hùng, và máy thấy giống Hùng nhất (0.41 < τ)
  assert.deepEqual(failed.member, { id: 2, name: 'Hùng', nickname: '', via: 'typed' });
  assert.equal(failed.issue, 'no_match');
  assert.deepEqual(failed.counts, counts({ reject: 2, dark: 1 }));
  assert.equal(failed.best.score, 0.41);
  assert.equal(failed.best.candidate.name, 'Hùng');
  assert.equal(failed.darkFrames, 1);
});

test('history list filters by result and member, and ignores unknown filters', async (t) => {
  const calls = withPool(t, () => [[]]);
  const scanQueries = () => calls.filter((call) => call.sql.includes('FROM face_scans'));

  await faceHistoryService.listScans({ filter: 'fail', studentId: '2', before: '50' });
  const [filtered] = scanQueries();
  assert.match(filtered.sql, /s\.id < \?/);
  assert.match(filtered.sql, /s\.outcome IS NULL OR s\.outcome <> 'confirmed'/);
  assert.match(filtered.sql, /s\.suggested_student_id = \? OR s\.claimed_student_id = \?/);
  assert.deepEqual(filtered.params, [50, 2, 2]);

  await faceHistoryService.listScans({ filter: '__proto__', limit: '9999' });
  const [, unfiltered] = scanQueries();
  assert.doesNotMatch(unfiltered.sql, /WHERE/);
  assert.match(unfiltered.sql, /LIMIT 101/, 'trang tối đa 100 lượt');
});

test('history endpoints report "not ready" before migration 018 instead of crashing', async (t) => {
  withPool(t, () => {
    throw Object.assign(new Error("Table 'gift.face_scans' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
  });
  assert.deepEqual(await faceHistoryService.listScans(), { ready: false, items: [], nextBefore: null });
  assert.deepEqual(await faceHistoryService.getSummary(), { ready: false });
  assert.equal(await faceHistoryService.getScan(1), null);
});

// ── getScan ────────────────────────────────────────────────────────────────────

test('one scan comes with every frame in time order, numbers only', async (t) => {
  withPool(t, (sql) => {
    if (sql.includes('FROM face_scans')) return [[scanRow(5, { outcome: 'timeout', dark_frames: 2 })]];
    if (sql.includes('FROM face_match_log')) {
      assert.match(sql, /ORDER BY COALESCE\(t_ms, 0\), id/);
      return [[
        { id: 1, decision: 'no_face', reason: null, score: null, margin: null, candidate_id: null, faces: 0, face_px: null, brightness: null, blur: null, det_score: null, elapsed_ms: 90, t_ms: 800 },
        { id: 2, decision: 'low_quality', reason: 'dark', score: null, margin: null, candidate_id: null, faces: 1, face_px: 120, brightness: 31, blur: 55, det_score: '0.812', elapsed_ms: 95, t_ms: 1600 },
      ]];
    }
    if (sql.includes('FROM students')) return [STUDENTS];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const scan = await faceHistoryService.getScan('5');
  assert.equal(scan.issue, 'dark');
  assert.equal(scan.frames, 2);
  assert.deepEqual(scan.thresholds, {
    tau: 0.45, margin: 0.1, minFacePx: 80, minBrightness: 40, minBlur: 40,
  });
  assert.equal(scan.timeline.length, 2);
  assert.deepEqual(
    scan.timeline.map((frame) => [frame.tMs, frame.decision, frame.reason, frame.brightness]),
    [[800, 'no_face', null, null], [1600, 'low_quality', 'dark', 31]],
  );
  assert.equal(scan.timeline[1].detScore, 0.812);
  assert.equal(await faceHistoryService.getScan('abc'), null);
});

// ── getSummary ─────────────────────────────────────────────────────────────────

test('summary totals scans, times recognition, and lists every class member', async (t) => {
  withPool(t, (sql) => {
    if (sql.includes('FROM face_scans')) {
      return [[
        scanRow(1, { outcome: 'confirmed', suggested_student_id: 1, duration_ms: 1500 }),
        scanRow(2, { outcome: 'confirmed', suggested_student_id: 1, duration_ms: 2500 }),
        scanRow(3, { outcome: 'confirmed', suggested_student_id: 3, duration_ms: 1800 }),
        // Máy hỏi "Phương Linh?" → "Không phải mình" → người đó gõ tên Thanh Huyền
        scanRow(4, { outcome: 'denied', suggested_student_id: 3, claimed_student_id: 1 }),
        scanRow(5, { outcome: 'unrecognized', claimed_student_id: 2 }),
        scanRow(6, { outcome: 'timeout', dark_frames: 10 }),
        scanRow(7, { outcome: 'camera' }),
      ]];
    }
    if (sql.includes('FROM face_match_log')) {
      return [[
        { scan_id: 5, decision: 'reject', reason: null, n: 6 },
        { scan_id: 6, decision: 'low_quality', reason: 'dark', n: 2 },
        { scan_id: 6, decision: 'no_face', reason: null, n: 3 },
      ]];
    }
    if (sql.includes('FROM face_profiles')) return [[{ student_id: 1 }, { student_id: 3 }]];
    if (sql.includes('FROM students')) return [STUDENTS];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const summary = await faceHistoryService.getSummary();
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.totals, { scans: 7, confirmed: 3, denied: 1, failed: 3 });
  assert.equal(summary.medianConfirmMs, 1800);
  assert.deepEqual(summary.issues, { wrong_person: 1, no_match: 1, dark: 1, camera: 1 });

  // Chỉ thành viên lớp đang hoạt động, kể cả người chưa quét lần nào
  assert.deepEqual(summary.members.map((member) => member.id), [1, 2, 3]);
  const [huyen, hung, linh] = summary.members;
  assert.deepEqual(
    [huyen.hasProfile, huyen.confirmed, huyen.failed, huyen.mistakenFor, huyen.lastIssue],
    [true, 2, 1, 0, 'wrong_person'],
  );
  assert.deepEqual([hung.hasProfile, hung.confirmed, hung.failed, hung.lastIssue], [false, 0, 1, 'no_match']);
  assert.deepEqual([linh.confirmed, linh.failed, linh.mistakenFor, linh.lastIssue], [1, 0, 1, null]);
  assert.equal(linh.avatarUrl, 'https://res.cloudinary.com/demo/a.jpg');
});

// ── Loại máy / trình duyệt ─────────────────────────────────────────────────────

test('user agents map to a coarse device and browser, in-app browsers first', () => {
  const cases = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'iphone', 'safari'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1', 'iphone', 'chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.99;FBBV/620000000]', 'iphone', 'facebook'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/465.0.0.35.108]', 'iphone', 'messenger'],
    ['Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', 'ipad', 'safari'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 'android', 'chrome'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'android', 'samsung'],
    ['Mozilla/5.0 (Linux; Android 13; RMX3630) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Zalo android/12100657 ZaloTheme/light ZaloLanguage/vi', 'android', 'zalo'],
    ['Mozilla/5.0 (Linux; Android 13; RMX3630 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/460.0.0.48.109;]', 'android', 'messenger'],
    ['Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'android_tab', 'chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0', 'windows', 'edge'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/123.0.172 Chrome/117.0.0.0 Safari/537.36', 'windows', 'coccoc'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'mac', 'safari'],
    ['curl/8.9.1', 'other', 'other'],
  ];
  for (const [ua, device, browser] of cases) {
    assert.deepEqual(describeUserAgent(ua), { device, browser }, ua);
  }
  assert.deepEqual(describeUserAgent(''), { device: null, browser: null });
  assert.deepEqual(describeUserAgent(undefined), { device: null, browser: null });
});
