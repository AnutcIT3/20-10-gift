const pool = require('../config/db');
const settingsService = require('./settingsService');
const { describeUserAgent } = require('../utils/userAgent');
const {
  FACE_SERVICE_URL,
  FACE_MODEL,
  FACE_TAU,
  FACE_MARGIN,
  FACE_MIN_FACE_PX,
  FACE_MIN_BRIGHTNESS,
  FACE_MIN_BLUR,
  FACE_EMBED_TIMEOUT_MS,
  FACE_HEALTH_TTL_MS,
  FACE_GALLERY_TTL_MS,
} = require('../config/constants');

const EMBEDDING_DIM = 512;
const EMBEDDING_BYTES = EMBEDDING_DIM * 4;
const HEALTH_TIMEOUT_MS = 2000;
// Lượt quét: mã 32 ký tự hex do trình duyệt tạo; kết quả khép lượt lại
const SCAN_TOKEN_RE = /^[a-f0-9]{32}$/;
// 'offline' = máy chủ báo Face ID nghỉ (503); 'network' = khung hình của người
// quét không tới được máy chủ (mạng điện thoại, Cloudflare) — hai chuyện khác nhau
const SCAN_OUTCOMES = new Set([
  'confirmed', 'denied', 'unrecognized', 'timeout', 'hidden', 'camera', 'offline', 'network', 'limited', 'closed',
]);
// Hai kết quả gắn với câu hỏi "Có phải cậu là…?" nên bắt buộc kèm matchId
const ANSWER_OUTCOMES = new Set(['confirmed', 'denied']);
const MAX_CLAIM_TOKENS = 10;
// Ghép tên chỉ cho lượt vừa quét xong, không cho gắn tên vào lượt cũ tùy ý
const CLAIM_WINDOW_MINUTES = 30;
const MAX_MEDIUMINT = 16777215;
// Câu này đi thẳng qua sendError ở controller: errorHandler production thay
// mọi thông điệp ≥ 500 bằng câu chung, mà frontend cần đúng câu này để hiện
const UNAVAILABLE_MESSAGE = 'Face ID tạm nghỉ, gõ tên giúp mình nhé 🌷';

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function unavailable() {
  return httpError(UNAVAILABLE_MESSAGE, 503);
}

// ── Vector ─────────────────────────────────────────────────────────────────

// BLOB trong face_profiles = 512 float32 little-endian, đúng 2048 byte
function encodeEmbedding(values) {
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding phải có ${EMBEDDING_DIM} chiều`);
  }
  const floats = new Float32Array(values);
  for (const v of floats) {
    if (!Number.isFinite(v)) throw new Error('Embedding chứa giá trị không hợp lệ');
  }
  return Buffer.from(floats.buffer);
}

function decodeEmbedding(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== EMBEDDING_BYTES) {
    throw new Error(`Embedding phải đúng ${EMBEDDING_BYTES} byte`);
  }
  // mysql2 cắt BLOB ra từ gói tin nên byteOffset có thể không chia hết cho 4;
  // Float32Array đòi hỏi căn 4 byte, lệch thì phải chép ra buffer riêng
  if (buffer.byteOffset % 4 === 0) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, EMBEDDING_DIM);
  }
  const copy = new Uint8Array(buffer);
  return new Float32Array(copy.buffer, 0, EMBEDDING_DIM);
}

// Các vector đều đã chuẩn hóa L2 nên cosine chính là tích vô hướng
function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function normalize(vector) {
  const out = new Float32Array(vector.length);
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (!(norm > 0)) throw new Error('Không chuẩn hóa được vector 0');
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i] / norm;
  return out;
}

function meanVector(vectors) {
  if (!vectors.length) throw new Error('Không có vector để lấy trung bình');
  const out = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    for (let i = 0; i < out.length; i += 1) out[i] += vector[i];
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= vectors.length;
  return out;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

// ── Quyết định thuần ────────────────────────────────────────────────────────

// candidates: [{ studentId, score }] — điểm cao nhất của mỗi bạn.
// Khớp khi top1 ≥ τ VÀ cách biệt top1 − top2 ≥ margin; thư viện chỉ có một
// bạn thì cách biệt lấy bằng chính top1 (không có ai để so). candidateId là
// top1 kể cả khi từ chối — chỉ để ghi nhật ký cho admin, không trả về client.
function decide(candidates, options = {}) {
  const tau = options.tau ?? FACE_TAU;
  const minMargin = options.margin ?? FACE_MARGIN;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  if (!sorted.length) {
    return { decision: 'reject', studentId: null, candidateId: null, score: 0, margin: 0 };
  }
  const [top1, top2] = sorted;
  const margin = top2 ? top1.score - top2.score : top1.score;
  const matched = top1.score >= tau && margin >= minMargin;
  return {
    decision: matched ? 'match' : 'reject',
    studentId: matched ? top1.studentId : null,
    candidateId: top1.studentId,
    score: top1.score,
    margin,
  };
}

// Cổng chất lượng trước khi chấm điểm, theo đúng thứ tự:
// no_face → many_faces → low_quality (small → dark → blurry). Trả null khi
// khung hình đủ tốt để so khớp.
function gate(faces) {
  if (!Array.isArray(faces) || faces.length === 0) {
    return { decision: 'no_face' };
  }
  const bigFaces = faces.filter((face) => Number(face.face_px) >= FACE_MIN_FACE_PX);
  if (bigFaces.length >= 2) {
    return { decision: 'many_faces', faces: bigFaces.length };
  }
  const [primary] = faces;
  const facePx = Number(primary.face_px);
  const brightness = Number(primary.brightness);
  const blur = Number(primary.blur);
  let reason = null;
  if (facePx < FACE_MIN_FACE_PX) reason = 'small';
  else if (brightness < FACE_MIN_BRIGHTNESS) reason = 'dark';
  else if (blur < FACE_MIN_BLUR) reason = 'blurry';
  if (reason) {
    return {
      decision: 'low_quality', reason, face_px: facePx, brightness, blur,
    };
  }
  return null;
}

// ── face-service ────────────────────────────────────────────────────────────

let healthCache = { at: 0, value: null };
let galleryCache = { at: 0, value: null };

function resetCache() {
  healthCache = { at: 0, value: null };
  galleryCache = { at: 0, value: null };
}

// Cả kết quả xấu cũng được đệm: service chết thì trang chủ không đập vào cổng
// đóng mỗi lần hỏi status
async function checkHealth() {
  const now = Date.now();
  if (healthCache.value && now - healthCache.at < FACE_HEALTH_TTL_MS) {
    return healthCache.value;
  }
  let value;
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const payload = response.ok ? await response.json() : null;
    const model = typeof payload?.model === 'string' ? payload.model : null;
    // Service chạy model khác thì vector không so được với hồ sơ — coi như chưa sẵn sàng
    value = { ok: payload?.status === 'ok' && model === FACE_MODEL, model };
  } catch {
    value = { ok: false, model: null };
  }
  healthCache = { at: now, value };
  return value;
}

async function embedImage(buffer, mimetype, maxFaces) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), 'frame.jpg');
  let response;
  try {
    response = await fetch(`${FACE_SERVICE_URL}/embed?max_faces=${maxFaces}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(FACE_EMBED_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  if (response.status === 400) throw httpError('Khung hình không đọc được, thử lại nhé', 400);
  if (response.status === 413) throw httpError('Khung hình quá lớn', 413);
  if (!response.ok) throw unavailable();
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw unavailable();
  }
  if (!payload || !Array.isArray(payload.faces)) throw unavailable();
  return payload;
}

// ── Thư viện gương mặt ──────────────────────────────────────────────────────

const GALLERY_SQL = `SELECT fp.student_id, fp.kind, fp.embedding, s.full_name, s.nickname, s.access_code
     FROM face_profiles fp
     JOIN students s ON s.id = fp.student_id
     WHERE fp.model = ? AND s.is_active = TRUE AND s.member_type = 'class'`;

async function loadGallery() {
  const now = Date.now();
  if (galleryCache.value && now - galleryCache.at < FACE_GALLERY_TTL_MS) {
    return galleryCache.value;
  }
  const [rows] = await pool.execute(GALLERY_SQL, [FACE_MODEL]);
  const byStudent = new Map();
  let profiles = 0;
  for (const row of rows) {
    let vector;
    try {
      vector = decodeEmbedding(row.embedding);
    } catch (error) {
      // Hàng hỏng thì bỏ qua chứ không làm sập cả Face ID
      console.error('[faceService] bỏ qua hồ sơ hỏng của học sinh', row.student_id, error.message);
      continue;
    }
    profiles += 1;
    const studentId = Number(row.student_id);
    if (!byStudent.has(studentId)) {
      byStudent.set(studentId, {
        studentId,
        displayName: row.nickname || row.full_name,
        accessCode: row.access_code,
        vectors: [],
      });
    }
    byStudent.get(studentId).vectors.push(vector);
  }
  const value = { students: [...byStudent.values()], profiles };
  galleryCache = { at: now, value };
  return value;
}

// ── API ─────────────────────────────────────────────────────────────────────

// Không bao giờ ném lỗi: bất kỳ trục trặc nào cũng chỉ là "chưa bật"
async function getStatus() {
  try {
    if (!(await settingsService.isFaceEnabled())) {
      return { enabled: false, model: null, profiles: 0 };
    }
    const health = await checkHealth();
    if (!health.ok) return { enabled: false, model: null, profiles: 0 };
    const gallery = await loadGallery();
    const enabled = gallery.profiles > 0;
    return { enabled, model: enabled ? FACE_MODEL : null, profiles: gallery.profiles };
  } catch (error) {
    console.error('[faceService.getStatus]', error.message);
    return { enabled: false, model: null, profiles: 0 };
  }
}

function clampUnsigned(value, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(0, Math.round(number)));
}

function clampSmallInt(value) {
  return clampUnsigned(value, 65535);
}

function detScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(9.999, Math.max(0, number)) * 1000) / 1000;
}

function isScanToken(value) {
  return typeof value === 'string' && SCAN_TOKEN_RE.test(value);
}

// Khung đầu tiên hay tín hiệu kết thúc đều có thể tới trước: bên nào tới trước
// tạo dòng. Đọc trước để các khung sau không phải ghi (INSERT trùng khóa vẫn
// đốt một số AUTO_INCREMENT); hai request cùng tạo một lúc thì LAST_INSERT_ID(id)
// đưa id của dòng đã có vào insertId.
async function ensureScan(token, userAgent) {
  const [rows] = await pool.execute('SELECT id FROM face_scans WHERE token = ? LIMIT 1', [token]);
  if (rows.length) return Number(rows[0].id);
  const { device, browser } = describeUserAgent(userAgent);
  const [result] = await pool.execute(
    `INSERT INTO face_scans (token, device, browser) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [token, device, browser],
  );
  return Number(result.insertId);
}

// Một dòng nhật ký cho một khung hình — toàn con số và chuỗi quyết định ngắn,
// không pixel, không vector. frame.primary là mặt lớn nhất (vắng khi no_face).
async function logFrame(frame) {
  const primary = frame.primary || {};
  const [result] = await pool.execute(
    `INSERT INTO face_match_log
       (scan_id, student_id, candidate_id, decision, reason, score, margin, faces,
        face_px, brightness, blur, det_score, elapsed_ms, t_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      frame.scanId ?? null,
      frame.studentId ?? null,
      frame.candidateId ?? null,
      frame.decision,
      frame.reason ?? null,
      frame.score ?? null,
      frame.margin ?? null,
      clampUnsigned(frame.faces, 255),
      clampSmallInt(primary.face_px),
      clampSmallInt(primary.brightness),
      clampSmallInt(primary.blur),
      detScore(primary.det_score),
      clampSmallInt(frame.elapsedMs),
      clampUnsigned(frame.tMs, MAX_MEDIUMINT),
    ],
  );
  return Number(result.insertId);
}

// context: { scan (mã lượt quét), t (ms từ lúc camera chạy), userAgent }
async function matchFrame(buffer, mimetype, context = {}) {
  const started = Date.now();
  if (!(await settingsService.isFaceEnabled())) throw unavailable();
  const health = await checkHealth();
  if (!health.ok) throw unavailable();
  const gallery = await loadGallery();
  if (!gallery.students.length) throw unavailable();

  // max_faces=2 là đủ để biết "có hơn một người trong khung" mà không tốn
  // công trích vector cho cả nhóm
  const payload = await embedImage(buffer, mimetype, 2);
  const [primary] = payload.faces;
  // Khung thuộc một lượt quét thì ghi cả khi bị cổng chất lượng chặn: admin
  // cần biết lượt đó hỏng vì tối, xa hay nhòe. Không kèm mã lượt thì như cũ —
  // chỉ ghi khung đã chấm điểm.
  const scanId = isScanToken(context.scan) ? await ensureScan(context.scan, context.userAgent) : null;
  const frame = { scanId, primary, faces: payload.faces.length, tMs: context.t };

  const gated = gate(payload.faces);
  if (gated) {
    if (scanId) {
      await logFrame({
        ...frame, decision: gated.decision, reason: gated.reason, elapsedMs: Date.now() - started,
      });
    }
    return gated;
  }

  if (!Array.isArray(primary.embedding) || primary.embedding.length !== EMBEDDING_DIM) {
    throw unavailable();
  }
  const probe = new Float32Array(primary.embedding);
  const candidates = gallery.students.map((student) => ({
    studentId: student.studentId,
    score: Math.max(...student.vectors.map((vector) => dot(probe, vector))),
  }));
  const verdict = decide(candidates);
  const score = round4(verdict.score);
  const margin = round4(verdict.margin);

  // Chỉ ghi số: quyết định, điểm, chất lượng khung — không ảnh, không vector
  const matchId = await logFrame({
    ...frame,
    decision: verdict.decision,
    studentId: verdict.studentId,
    candidateId: verdict.candidateId,
    score,
    margin,
    elapsedMs: Date.now() - started,
  });

  if (verdict.decision !== 'match') {
    // Người lạ hay khung khó đều chỉ nhận về con số — không bao giờ lộ tên
    return {
      decision: 'reject',
      matchId,
      score,
      margin,
      face_px: primary.face_px,
      brightness: primary.brightness,
    };
  }
  const student = gallery.students.find((item) => item.studentId === verdict.studentId);
  return {
    decision: 'match',
    matchId,
    studentId: student.studentId,
    giftPath: `/gift/${student.accessCode}`,
    displayName: student.displayName,
    score,
    margin,
    face_px: primary.face_px,
    brightness: primary.brightness,
  };
}

// Idempotent và không dò được: id lạ hay đã trả lời rồi đều trả ok
async function confirmMatch(matchId, confirmed) {
  await pool.execute(
    'UPDATE face_match_log SET confirmed = ? WHERE id = ? AND confirmed IS NULL',
    [confirmed ? 1 : 0, matchId],
  );
  return { ok: true };
}

// Khép một lượt quét: body { outcome, matchId?, durationMs?, darkFrames? }.
// "Đúng là mình"/"Không phải mình" đi kèm matchId của câu hỏi — phải là khung
// "match" của chính lượt này thì mới gắn tên người máy đã hỏi. Chỉ tín hiệu
// ĐẦU TIÊN có hiệu lực: "đóng modal" tới muộn không ghi đè "Đúng là mình".
async function endScan(token, body = {}, userAgent = '') {
  const { outcome } = body;
  if (!SCAN_OUTCOMES.has(outcome)) throw httpError('Kết quả lượt quét không hợp lệ', 400);
  const matchId = Number.isInteger(body.matchId) && body.matchId > 0 ? body.matchId : null;
  if (ANSWER_OUTCOMES.has(outcome) && !matchId) {
    throw httpError('Câu trả lời "đúng là mình / không phải" cần kèm matchId', 400);
  }

  const scanId = await ensureScan(token, userAgent);
  let suggestedId = null;
  if (matchId) {
    const [rows] = await pool.execute(
      `SELECT student_id FROM face_match_log
       WHERE id = ? AND scan_id = ? AND decision = 'match' LIMIT 1`,
      [matchId, scanId],
    );
    suggestedId = rows[0]?.student_id ?? null;
  }

  const [result] = await pool.execute(
    `UPDATE face_scans
     SET outcome = ?, suggested_student_id = ?, duration_ms = ?, dark_frames = ?, ended_at = CURRENT_TIMESTAMP
     WHERE id = ? AND outcome IS NULL`,
    [
      outcome,
      suggestedId,
      clampUnsigned(body.durationMs, MAX_MEDIUMINT),
      clampSmallInt(body.darkFrames) ?? 0,
      scanId,
    ],
  );
  // Câu trả lời cũng điền vào dòng nhật ký của khung được hỏi, như /confirm
  if (result.affectedRows > 0 && suggestedId && ANSWER_OUTCOMES.has(outcome)) {
    await confirmMatch(matchId, outcome === 'confirmed');
  }
  return { ok: true };
}

// Gõ tên mở quà ngay sau những lượt quét chưa thành: ghép tên người đó vào các
// lượt ấy để admin biết ai hay bị nhận không ra. Luôn trả ok — không dùng được
// để dò mã quà nào có thật.
async function claimScans(tokens, accessCode) {
  const valid = [...new Set((Array.isArray(tokens) ? tokens : []).filter(isScanToken))]
    .slice(0, MAX_CLAIM_TOKENS);
  if (!valid.length || typeof accessCode !== 'string' || !accessCode) return { ok: true };

  const [students] = await pool.execute(
    `SELECT id FROM students
     WHERE access_code = ? AND is_active = TRUE AND member_type = 'class' LIMIT 1`,
    [accessCode],
  );
  const studentId = students[0]?.id;
  if (!studentId) return { ok: true };

  await pool.execute(
    `UPDATE face_scans SET claimed_student_id = ?
     WHERE token IN (${valid.map(() => '?').join(', ')})
       AND claimed_student_id IS NULL
       AND (outcome IS NULL OR outcome <> 'confirmed')
       AND started_at >= CURRENT_TIMESTAMP - INTERVAL ${CLAIM_WINDOW_MINUTES} MINUTE`,
    [studentId, ...valid],
  );
  return { ok: true };
}

module.exports = {
  EMBEDDING_DIM,
  EMBEDDING_BYTES,
  UNAVAILABLE_MESSAGE,
  SCAN_OUTCOMES,
  encodeEmbedding,
  decodeEmbedding,
  dot,
  normalize,
  meanVector,
  decide,
  gate,
  isScanToken,
  checkHealth,
  embedImage,
  loadGallery,
  resetCache,
  getStatus,
  matchFrame,
  confirmMatch,
  endScan,
  claimScans,
};
