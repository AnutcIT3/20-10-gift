const pool = require('../config/db');
const {
  FACE_MODEL,
  FACE_TAU,
  FACE_MARGIN,
  FACE_MIN_FACE_PX,
  FACE_MIN_BRIGHTNESS,
  FACE_MIN_BLUR,
} = require('../config/constants');

// Lịch sử Face ID cho trang admin: đọc face_scans + face_match_log. Cả hai chỉ
// có kết quả và con số của từng khung hình — không ảnh, không video, không vector.

// Ngưỡng nhận và cổng chất lượng đang dùng, để trang admin so từng con số
const THRESHOLDS = Object.freeze({
  tau: FACE_TAU,
  margin: FACE_MARGIN,
  minFacePx: FACE_MIN_FACE_PX,
  minBrightness: FACE_MIN_BRIGHTNESS,
  minBlur: FACE_MIN_BLUR,
});

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const FILTERS = {
  all: null,
  ok: "s.outcome = 'confirmed'",
  fail: "(s.outcome IS NULL OR s.outcome <> 'confirmed')",
};
const COUNT_KEYS = ['match', 'reject', 'no_face', 'many_faces', 'small', 'dark', 'blurry'];
const QUALITY_REASONS = new Set(['small', 'dark', 'blurry']);

function emptyCounts() {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
}

// decision (+ reason của low_quality) của một khung → ô đếm tương ứng
function countKey(decision, reason) {
  if (decision === 'low_quality') return QUALITY_REASONS.has(reason) ? reason : null;
  return COUNT_KEYS.includes(decision) ? decision : null;
}

/**
 * Một nguyên nhân cho mỗi lượt chưa thành, theo thứ tự:
 * 1. Kết quả đã tự nói lên nguyên nhân: nhầm người, camera, Face ID nghỉ,
 *    mạng của người quét, giới hạn, máy nhìn rõ mặt mà không khớp ai.
 * 2. Máy đã hỏi "Có phải cậu là…?" mà người dùng bỏ đi không trả lời.
 * 3. Còn lại (hết giờ, rời tab, tự đóng, bỏ dở): vấn đề chiếm nhiều khung nhất —
 *    khung trình duyệt tự bỏ vì tối cũng tính là tối. Hòa thì ưu tiên "rõ mặt
 *    mà không khớp" vì đó là vấn đề của hồ sơ chứ không phải của ánh sáng.
 * 4. Không có khung nào đáng kể: hết giờ = camera không cho hình, còn lại = tự đóng sớm.
 */
function diagnose(scan, counts) {
  const { outcome } = scan;
  if (outcome === 'confirmed') return null;
  if (outcome === 'denied') return 'wrong_person';
  if (['camera', 'offline', 'network', 'limited'].includes(outcome)) return outcome;
  if (outcome === 'unrecognized') return 'no_match';
  if (scan.suggested_student_id) return 'unanswered';

  const tallies = [
    ['no_match', counts.reject],
    ['dark', counts.dark + Number(scan.dark_frames || 0)],
    ['small', counts.small],
    ['blurry', counts.blurry],
    ['no_face', counts.no_face],
    ['many_faces', counts.many_faces],
  ];
  let issue = null;
  let most = 0;
  for (const [key, count] of tallies) {
    if (count > most) {
      issue = key;
      most = count;
    }
  }
  if (issue) return issue;
  return outcome === 'timeout' ? 'no_frames' : 'left_early';
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

async function loadStudents() {
  const [rows] = await pool.execute(
    'SELECT id, full_name, nickname, avatar_url, member_type, is_active FROM students',
  );
  return new Map(rows.map((row) => [Number(row.id), row]));
}

function personOf(students, id) {
  if (id === null || id === undefined) return null;
  const student = students.get(Number(id));
  return student
    ? { id: Number(student.id), name: student.full_name, nickname: student.nickname || '' }
    : { id: Number(id), name: `#${id}`, nickname: '' };
}

// Gom các khung của nhiều lượt: đếm theo loại, và khung điểm cao nhất (người
// máy thấy giống nhất, kể cả khi từ chối)
function summarizeFrames(frames) {
  const byScan = new Map();
  for (const frame of frames) {
    const scanId = Number(frame.scan_id);
    if (!byScan.has(scanId)) byScan.set(scanId, { counts: emptyCounts(), frames: 0, best: null });
    const entry = byScan.get(scanId);
    const n = Number(frame.n ?? 1);
    entry.frames += n;
    const key = countKey(frame.decision, frame.reason);
    if (key) entry.counts[key] += n;
    const score = toNumber(frame.score);
    if (score !== null && (!entry.best || score > entry.best.score)) {
      entry.best = { score, margin: toNumber(frame.margin), candidateId: toNumber(frame.candidate_id) };
    }
  }
  return byScan;
}

function shapeScan(scan, summary, students) {
  const counts = summary?.counts || emptyCounts();
  const suggested = personOf(students, scan.suggested_student_id);
  const claimed = personOf(students, scan.claimed_student_id);
  // "Là ai" của một lượt: máy nhận ra và được xác nhận, hoặc người đó tự gõ tên sau
  let member = null;
  if (scan.outcome === 'confirmed' && suggested) member = { ...suggested, via: 'face' };
  else if (claimed) member = { ...claimed, via: 'typed' };
  return {
    id: Number(scan.id),
    startedAt: scan.started_at,
    endedAt: scan.ended_at,
    outcome: scan.outcome || null,
    durationMs: toNumber(scan.duration_ms),
    darkFrames: Number(scan.dark_frames || 0),
    device: scan.device || null,
    browser: scan.browser || null,
    frames: summary?.frames || 0,
    counts,
    best: summary?.best
      ? { score: summary.best.score, margin: summary.best.margin, candidate: personOf(students, summary.best.candidateId) }
      : null,
    suggested,
    claimed,
    member,
    issue: diagnose(scan, counts),
  };
}

const SCAN_COLUMNS = `s.id, s.outcome, s.suggested_student_id, s.claimed_student_id, s.duration_ms,
  s.dark_frames, s.device, s.browser, s.started_at, s.ended_at`;

async function framesFor(scanIds) {
  if (!scanIds.length) return [];
  const [rows] = await pool.execute(
    `SELECT scan_id, decision, reason, score, margin, candidate_id
     FROM face_match_log WHERE scan_id IN (${scanIds.map(() => '?').join(', ')})`,
    scanIds,
  );
  return rows;
}

/**
 * Trang lịch sử, mới nhất trước. options: { limit, before (id), filter
 * 'all'|'ok'|'fail', studentId } — studentId gồm các lượt người đó được máy
 * nhận ra, bị máy đoán nhầm là họ, hoặc tự gõ tên sau khi quét chưa thành.
 */
async function listScans(options = {}) {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(options.limit, 10) || DEFAULT_PAGE_SIZE));
  const where = [];
  const params = [];
  const before = Number.parseInt(options.before, 10);
  if (before > 0) {
    where.push('s.id < ?');
    params.push(before);
  }
  const filter = Object.hasOwn(FILTERS, options.filter) ? FILTERS[options.filter] : null;
  if (filter) where.push(filter);
  const studentId = Number.parseInt(options.studentId, 10);
  if (studentId > 0) {
    where.push('(s.suggested_student_id = ? OR s.claimed_student_id = ?)');
    params.push(studentId, studentId);
  }

  let scans;
  try {
    // limit đã ép về số nguyên ở trên nên chèn thẳng được (mysql2 execute không
    // nhận tham số cho LIMIT)
    [scans] = await pool.execute(
      `SELECT ${SCAN_COLUMNS} FROM face_scans s
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.id DESC LIMIT ${limit + 1}`,
      params,
    );
  } catch (error) {
    if (isMissingTable(error)) return { ready: false, items: [], nextBefore: null };
    throw error;
  }

  const page = scans.slice(0, limit);
  const ids = page.map((scan) => Number(scan.id));
  const [frames, students] = await Promise.all([framesFor(ids), loadStudents()]);
  const summaries = summarizeFrames(frames);
  return {
    ready: true,
    items: page.map((scan) => shapeScan(scan, summaries.get(Number(scan.id)), students)),
    nextBefore: scans.length > limit ? ids[ids.length - 1] : null,
  };
}

// Một lượt kèm từng khung hình theo thứ tự thời gian — thay cho "ảnh chụp lúc
// hỏng": tối/xa/nhòe/không khớp hiện ra ở con số của từng khung
async function getScan(id) {
  const scanId = Number.parseInt(id, 10);
  if (!(scanId > 0)) return null;
  let scan;
  try {
    [[scan]] = await pool.execute(`SELECT ${SCAN_COLUMNS} FROM face_scans s WHERE s.id = ?`, [scanId]);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!scan) return null;
  const [[frames], students] = await Promise.all([
    pool.execute(
      `SELECT id, decision, reason, score, margin, candidate_id, student_id, confirmed, faces,
              face_px, brightness, blur, det_score, elapsed_ms, t_ms, created_at
       FROM face_match_log WHERE scan_id = ? ORDER BY COALESCE(t_ms, 0), id`,
      [scanId],
    ),
    loadStudents(),
  ]);
  const summary = summarizeFrames(frames.map((frame) => ({ ...frame, scan_id: scanId }))).get(scanId);
  return {
    ...shapeScan(scan, summary, students),
    thresholds: THRESHOLDS,
    timeline: frames.map((frame) => ({
      id: Number(frame.id),
      tMs: toNumber(frame.t_ms),
      decision: frame.decision,
      reason: frame.reason || null,
      score: toNumber(frame.score),
      margin: toNumber(frame.margin),
      candidate: personOf(students, frame.candidate_id),
      faces: toNumber(frame.faces),
      facePx: toNumber(frame.face_px),
      brightness: toNumber(frame.brightness),
      blur: toNumber(frame.blur),
      detScore: toNumber(frame.det_score),
      elapsedMs: toNumber(frame.elapsed_ms),
      at: frame.created_at,
    })),
  };
}

/**
 * Toàn cảnh: tổng theo kết quả, thời gian nhận ra (trung vị), nguyên nhân của
 * các lượt chưa thành, và từng thành viên lớp — có hồ sơ Face ID chưa, bao
 * nhiêu lượt được nhận ra, bao nhiêu lượt phải gõ tên, bị máy nhận nhầm mấy lần.
 */
async function getSummary() {
  let scans;
  try {
    [scans] = await pool.execute(
      `SELECT id, outcome, suggested_student_id, claimed_student_id, duration_ms, dark_frames, started_at
       FROM face_scans ORDER BY id`,
    );
  } catch (error) {
    if (isMissingTable(error)) return { ready: false };
    throw error;
  }

  const [[frameRows], [profileRows], students] = await Promise.all([
    pool.execute(
      `SELECT scan_id, decision, reason, COUNT(*) AS n
       FROM face_match_log WHERE scan_id IS NOT NULL
       GROUP BY scan_id, decision, reason`,
    ),
    pool.execute('SELECT DISTINCT student_id FROM face_profiles WHERE model = ?', [FACE_MODEL]),
    loadStudents(),
  ]);
  const summaries = summarizeFrames(frameRows);
  const withProfile = new Set(profileRows.map((row) => Number(row.student_id)));

  const totals = { scans: scans.length, confirmed: 0, denied: 0, failed: 0 };
  const issues = {};
  const confirmTimes = [];
  const members = new Map();
  const memberOf = (id) => {
    const key = Number(id);
    if (!members.has(key)) {
      members.set(key, { confirmed: 0, failed: 0, mistakenFor: 0, lastAt: null, lastIssue: null });
    }
    return members.get(key);
  };
  const touch = (entry, scan, issue) => {
    if (!entry.lastAt || scan.started_at > entry.lastAt) {
      entry.lastAt = scan.started_at;
      entry.lastIssue = issue;
    }
  };

  for (const scan of scans) {
    const counts = summaries.get(Number(scan.id))?.counts || emptyCounts();
    const issue = diagnose(scan, counts);
    if (scan.outcome === 'confirmed') {
      totals.confirmed += 1;
      if (scan.duration_ms !== null) confirmTimes.push(Number(scan.duration_ms));
      if (scan.suggested_student_id) {
        const entry = memberOf(scan.suggested_student_id);
        entry.confirmed += 1;
        touch(entry, scan, null);
      }
      continue;
    }
    if (scan.outcome === 'denied') totals.denied += 1;
    else totals.failed += 1;
    issues[issue] = (issues[issue] || 0) + 1;
    if (scan.outcome === 'denied' && scan.suggested_student_id) {
      memberOf(scan.suggested_student_id).mistakenFor += 1;
    }
    if (scan.claimed_student_id) {
      const entry = memberOf(scan.claimed_student_id);
      entry.failed += 1;
      touch(entry, scan, issue);
    }
  }

  const roster = [...students.values()]
    .filter((student) => student.member_type === 'class' && student.is_active)
    .map((student) => {
      const id = Number(student.id);
      const entry = members.get(id) || { confirmed: 0, failed: 0, mistakenFor: 0, lastAt: null, lastIssue: null };
      return {
        id,
        name: student.full_name,
        nickname: student.nickname || '',
        avatarUrl: student.avatar_url || '',
        hasProfile: withProfile.has(id),
        ...entry,
      };
    });

  return {
    ready: true,
    thresholds: THRESHOLDS,
    totals,
    medianConfirmMs: median(confirmTimes),
    issues,
    members: roster,
  };
}

// Xóa sạch lịch sử: nhật ký khung hình (cả dòng cũ trước khi có lượt quét) rồi
// các lượt quét. Hồ sơ Face ID (face_profiles) không bị động tới.
async function clearHistory() {
  const [frames] = await pool.execute('DELETE FROM face_match_log');
  const [scans] = await pool.execute('DELETE FROM face_scans');
  return { frames: frames.affectedRows, scans: scans.affectedRows };
}

module.exports = {
  diagnose,
  summarizeFrames,
  listScans,
  getScan,
  getSummary,
  clearHistory,
};
