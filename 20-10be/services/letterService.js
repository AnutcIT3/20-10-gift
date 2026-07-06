const pool = require('../config/db');

const STATUSES = ['pending', 'approved', 'rejected'];

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function parseListQuery(query = {}) {
  const status = query.status || 'pending';
  if (!STATUSES.includes(status)) throw httpError('Trạng thái không hợp lệ', 400);
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw httpError('Thông tin phân trang không hợp lệ', 400);
  }
  let studentId = null;
  if (query.studentId !== undefined && query.studentId !== '') {
    studentId = Number(query.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw httpError('studentId không hợp lệ', 400);
    }
  }
  return { status, page, pageSize, studentId };
}

async function listLetters(query) {
  const { status, page, pageSize, studentId } = parseListQuery(query);
  const filters = ['l.status = ?'];
  const params = [status];
  if (studentId !== null) {
    filters.push('l.student_id = ?');
    params.push(studentId);
  }
  const where = filters.join(' AND ');
  const [[countRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM letters l WHERE ${where}`,
    params,
  );
  const total = Number(countRow.total);
  const offset = (page - 1) * pageSize;
  const [items] = await pool.execute(
    `SELECT l.id, l.student_id, s.full_name AS student_name, l.sender_name,
      l.title, l.content, l.is_anonymous, l.status, l.created_at
     FROM letters l JOIN students s ON s.id = l.student_id
     WHERE ${where} ORDER BY l.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function updateStatus(id, status) {
  if (!['approved', 'rejected'].includes(status)) {
    throw httpError('Trạng thái phải là approved hoặc rejected', 400);
  }
  const [result] = await pool.execute(
    'UPDATE letters SET status = ? WHERE id = ?',
    [status, id],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy lời chúc', 404);
  return {};
}

async function deleteLetter(id) {
  const [result] = await pool.execute('DELETE FROM letters WHERE id = ?', [id]);
  if (!result.affectedRows) throw httpError('Không tìm thấy lời chúc', 404);
  return {};
}

module.exports = { listLetters, updateStatus, deleteLetter, parseListQuery };
