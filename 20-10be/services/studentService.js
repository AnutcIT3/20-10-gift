const crypto = require('crypto');
const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');

const EDITABLE_FIELDS = ['nickname', 'avatar_url', 'intro_message', 'class_name'];

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
  return Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined));
}

function presentStudent(row) {
  const { access_code: accessCode, normalized_name: _normalizedName, ...student } = row;
  return { ...student, giftPath: `/gift/${accessCode}` };
}

function generateAccessCode() {
  return crypto.randomBytes(9).toString('base64url');
}

async function listStudents() {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, class_name,
      is_active, access_code, created_at, updated_at
     FROM students ORDER BY full_name ASC`,
  );
  return rows.map(presentStudent);
}

async function getStudent(id) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, class_name,
      is_active, access_code, created_at, updated_at
     FROM students WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? presentStudent(rows[0]) : null;
}

async function createStudent(data) {
  const clean = sanitizeInput(data, true);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accessCode = generateAccessCode();
    try {
      const [result] = await pool.execute(
        `INSERT INTO students
          (full_name, normalized_name, nickname, avatar_url, intro_message, class_name, access_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [clean.full_name, clean.normalized_name, clean.nickname || null,
          clean.avatar_url || null, clean.intro_message || null, clean.class_name || 'A1', accessCode],
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

async function rotateCode(id) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accessCode = generateAccessCode();
    try {
      const [result] = await pool.execute(
        'UPDATE students SET access_code = ? WHERE id = ?',
        [accessCode, id],
      );
      if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
      return { giftPath: `/gift/${accessCode}` };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  throw httpError('Không thể tạo access code', 500);
}

module.exports = {
  listStudents, getStudent, createStudent, updateStudent, deactivateStudent, rotateCode,
  sanitizeInput, presentStudent,
};
