const crypto = require('crypto');
const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const normalizeName = require('../utils/normalizeName');

const EDITABLE_FIELDS = ['nickname', 'avatar_url', 'intro_message', 'class_name', 'seat_row', 'seat_col'];

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function validateText(value, field, max, required = false) {
  if (value === undefined) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string') throw httpError(`${field} không hợp lệ`, 400);
  const trimmed = value.trim();
  if (required && !trimmed) throw httpError(`${field} là bắt buộc`, 400);
  if (trimmed.length > max) throw httpError(`${field} tối đa ${max} ký tự`, 400);
  return trimmed || null;
}

function validateSeat(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 20) {
    throw httpError(`${field} khÃ´ng há»£p lá»‡`, 400);
  }
  return numberValue;
}

function sanitizeInput(data, requireName = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  const clean = {};
  if (requireName || data.full_name !== undefined) {
    clean.full_name = validateText(data.full_name, 'full_name', 100, true);
    clean.normalized_name = normalizeName(clean.full_name);
  }
  clean.nickname = validateText(data.nickname, 'nickname', 50);
  clean.avatar_url = validateText(data.avatar_url, 'avatar_url', 500);
  clean.intro_message = validateText(data.intro_message, 'intro_message', 65535);
  clean.class_name = validateText(data.class_name, 'class_name', 20);
  clean.seat_row = validateSeat(data.seat_row, 'seat_row');
  clean.seat_col = validateSeat(data.seat_col, 'seat_col');
  return Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined));
}

function presentStudent(row) {
  const { access_code: accessCode, normalized_name: _normalizedName, ...student } = row;
  return { ...student, giftPath: `/gift/${accessCode}` };
}

function generateAccessCode() {
  return crypto.randomBytes(9).toString('base64url');
}

function normalizeAccessCode(value) {
  if (typeof value !== 'string') throw httpError('Mã link là bắt buộc', 400);
  const accessCode = value.trim().toLowerCase();
  if (accessCode.length < 3 || accessCode.length > 20) {
    throw httpError('Mã link phải có từ 3 đến 20 ký tự', 400);
  }
  if (!/^[a-z0-9_-]+$/.test(accessCode)) {
    throw httpError('Mã link chỉ được gồm chữ không dấu, số, dấu gạch ngang hoặc gạch dưới', 400);
  }
  return accessCode;
}

function canonicalVisibleName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

async function assertNoDuplicateVisibleName(fullName, excludeId = null) {
  const normalized = normalizeName(fullName);
  const params = [normalized];
  let sql = 'SELECT id, full_name FROM students WHERE normalized_name = ? AND is_active = TRUE';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  const canonical = canonicalVisibleName(fullName);
  const duplicate = rows.find((row) => canonicalVisibleName(row.full_name) === canonical);
  if (duplicate) {
    throw httpError(`Đã tồn tại học sinh tên ${fullName}`, 409);
  }
}

async function listStudents() {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, class_name,
      seat_row, seat_col, is_active, access_code, created_at, updated_at
     FROM students ORDER BY full_name ASC`,
  );
  return rows.map(presentStudent);
}

async function getStudent(id) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, class_name,
      seat_row, seat_col, is_active, access_code, created_at, updated_at
     FROM students WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? presentStudent(rows[0]) : null;
}

async function createStudent(data) {
  const clean = sanitizeInput(data, true);
  await assertNoDuplicateVisibleName(clean.full_name);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accessCode = generateAccessCode();
    try {
      const [result] = await pool.execute(
        `INSERT INTO students
          (full_name, normalized_name, nickname, avatar_url, intro_message, class_name, access_code, seat_row, seat_col)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clean.full_name, clean.normalized_name, clean.nickname || null,
          clean.avatar_url || null, clean.intro_message || null, clean.class_name || 'A1', accessCode,
          clean.seat_row || null, clean.seat_col || null],
      );
      return getStudent(result.insertId);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  throw httpError('Không thể tạo access code', 500);
}

async function updateStudent(id, data) {
  const clean = sanitizeInput(data);
  if (clean.full_name) await assertNoDuplicateVisibleName(clean.full_name, id);
  const allowed = ['full_name', 'normalized_name', ...EDITABLE_FIELDS];
  const entries = Object.entries(clean).filter(([key]) => allowed.includes(key));
  if (!entries.length) throw httpError('Không có dữ liệu để cập nhật', 400);

  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const [result] = await pool.execute(
    `UPDATE students SET ${assignments} WHERE id = ?`,
    [...entries.map(([, value]) => value), id],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
  return getStudent(id);
}

async function deactivateStudent(id) {
  const [result] = await pool.execute('UPDATE students SET is_active = FALSE WHERE id = ?', [id]);
  if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
  return { is_active: false };
}

async function activateStudent(id) {
  const [rows] = await pool.execute(
    'SELECT id, full_name FROM students WHERE id = ? LIMIT 1',
    [id],
  );
  const student = rows[0];
  if (!student) throw httpError('Không tìm thấy học sinh', 404);

  await assertNoDuplicateVisibleName(student.full_name, id);
  await pool.execute('UPDATE students SET is_active = TRUE WHERE id = ?', [id]);
  return { is_active: true };
}

async function deleteStudent(id) {
  const connection = await pool.getConnection();
  let assets = [];
  try {
    await connection.beginTransaction();
    const [assetRows] = await connection.execute(
      `SELECT public_id, resource_type FROM gallery WHERE student_id = ? AND public_id IS NOT NULL
       UNION ALL
       SELECT public_id, resource_type FROM music WHERE student_id = ? AND public_id IS NOT NULL
       UNION ALL
       SELECT public_id, resource_type FROM videos WHERE student_id = ? AND public_id IS NOT NULL`,
      [id, id, id],
    );
    assets = assetRows;

    const [result] = await connection.execute('DELETE FROM students WHERE id = ?', [id]);
    if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const cleanupResults = await Promise.allSettled(assets.map((asset) => (
    cloudinary.uploader.destroy(asset.public_id, {
      resource_type: asset.resource_type || 'image',
    })
  )));
  const cleanupFailed = cleanupResults.filter((result) => result.status === 'rejected').length;
  if (cleanupFailed) {
    console.error(`Cloudinary cleanup failed for ${cleanupFailed} asset(s) of student ${id}`);
  }

  return {
    deleted: true,
    assetsDeleted: assets.length - cleanupFailed,
    assetCleanupFailed: cleanupFailed,
  };
}

async function updateAccessCode(id, value) {
  const accessCode = normalizeAccessCode(value);
  try {
    const [result] = await pool.execute(
      'UPDATE students SET access_code = ? WHERE id = ?',
      [accessCode, id],
    );
    if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
    return { giftPath: `/gift/${accessCode}` };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError('Mã link này đã được sử dụng', 409);
    }
    throw error;
  }
}

module.exports = {
  listStudents, getStudent, createStudent, updateStudent, deactivateStudent, activateStudent,
  deleteStudent, updateAccessCode,
};
