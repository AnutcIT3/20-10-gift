const pool = require('../config/db');
const reactionService = require('./reactionService');

const STATUSES = ['pending', 'approved', 'rejected'];
const MAX_BULK_ITEMS = 100;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function assertPlainObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
}

function parsePositiveId(value, field = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(`${field} không hợp lệ`, 400);
  }
  return id;
}

function parseIdList(ids, field = 'ids') {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw httpError(`${field} phải là mảng không rỗng`, 400);
  }
  if (ids.length > MAX_BULK_ITEMS) {
    throw httpError(`Chỉ được thao tác tối đa ${MAX_BULK_ITEMS} mục mỗi lần`, 400);
  }
  const cleanIds = ids.map((id) => parsePositiveId(id, field));
  if (new Set(cleanIds).size !== cleanIds.length) {
    throw httpError(`${field} bị trùng`, 400);
  }
  return cleanIds;
}

function validateStatus(status, allowed = STATUSES) {
  if (!allowed.includes(status)) throw httpError('Trạng thái không hợp lệ', 400);
  return status;
}

function normalizeRevealAt(value, { enforceFuture = true } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError('reveal_at không hợp lệ', 400);

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) throw httpError('reveal_at không phải ngày hợp lệ', 400);
  const now = new Date();
  if (enforceFuture) {
    if (dt <= now) throw httpError('reveal_at phải là thời điểm trong tương lai', 400);
    const maxDate = new Date(now);
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (dt > maxDate) throw httpError('reveal_at không được quá 1 năm từ hiện tại', 400);
  }
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function sanitizeLetterPayload(data, {
  defaultStatus = 'approved',
  enforceFutureReveal = true,
  requireStudentIds = false,
} = {}) {
  assertPlainObject(data);

  const isAnonymous = data.is_anonymous === true;
  if (data.is_anonymous !== undefined && typeof data.is_anonymous !== 'boolean') {
    throw httpError('is_anonymous phải là boolean', 400);
  }
  if (typeof data.content !== 'string') throw httpError('Nội dung là bắt buộc', 400);

  const content = data.content.trim();
  if (!content) throw httpError('Nội dung không được để trống', 400);
  if (content.length > 5000) throw httpError('Nội dung quá dài (tối đa 5000 ký tự)', 400);

  if (data.title !== undefined && data.title !== null && typeof data.title !== 'string') {
    throw httpError('Tiêu đề không hợp lệ', 400);
  }
  if (data.sender_name !== undefined && data.sender_name !== null && typeof data.sender_name !== 'string') {
    throw httpError('Tên người gửi không hợp lệ', 400);
  }

  const title = data.title ? data.title.trim() : null;
  const submittedSenderName = data.sender_name ? data.sender_name.trim() : null;
  if (title && title.length > 200) throw httpError('Tiêu đề quá dài (tối đa 200 ký tự)', 400);
  if (submittedSenderName && submittedSenderName.length > 100) {
    throw httpError('Tên người gửi quá dài (tối đa 100 ký tự)', 400);
  }

  const senderName = isAnonymous ? null : submittedSenderName;
  if (!isAnonymous && !senderName) {
    throw httpError('Tên người gửi là bắt buộc khi không ẩn danh', 400);
  }

  const status = data.status === undefined || data.status === null || data.status === ''
    ? defaultStatus
    : validateStatus(data.status);

  return {
    studentIds: requireStudentIds ? parseIdList(data.student_ids, 'student_ids') : undefined,
    studentId: data.student_id === undefined || data.student_id === null || data.student_id === ''
      ? undefined
      : parsePositiveId(data.student_id, 'student_id'),
    senderName,
    title,
    content,
    isAnonymous,
    status,
    revealAt: normalizeRevealAt(data.reveal_at, { enforceFuture: enforceFutureReveal }),
  };
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
      l.title, l.content, l.is_anonymous, l.status, l.reveal_at, l.created_at
     FROM letters l JOIN students s ON s.id = l.student_id
     WHERE ${where} ORDER BY l.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  // Enrich với reaction counts
  let enrichedItems = items;
  if (items.length) {
    const letterIds = items.map((item) => item.id);
    const counts = await reactionService.getReactionCounts(letterIds);
    enrichedItems = items.map((item) => ({ ...item, reactions: counts[item.id] || {} }));
  }

  return {
    items: enrichedItems,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function updateStatus(id, status) {
  validateStatus(status, ['approved', 'rejected']);
  const [result] = await pool.execute(
    'UPDATE letters SET status = ? WHERE id = ?',
    [status, id],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy lời chúc', 404);
  return {};
}

async function assertStudentsExist(connection, studentIds) {
  const placeholders = studentIds.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT id FROM students WHERE id IN (${placeholders}) AND is_active = TRUE`,
    studentIds,
  );
  if (rows.length !== studentIds.length) {
    throw httpError('Một hoặc nhiều người nhận không tồn tại hoặc đã bị tắt', 400);
  }
}

async function createLetters(data) {
  const clean = sanitizeLetterPayload(data, { requireStudentIds: true });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertStudentsExist(connection, clean.studentIds);

    for (const studentId of clean.studentIds) {
      await connection.execute(
        `INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status, reveal_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt],
      );
    }

    await connection.commit();
    return { created: clean.studentIds.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateLetter(id, data) {
  const clean = sanitizeLetterPayload(data, { enforceFutureReveal: false });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (clean.studentId) await assertStudentsExist(connection, [clean.studentId]);

    const fields = [
      ['sender_name', clean.senderName],
      ['title', clean.title],
      ['content', clean.content],
      ['is_anonymous', clean.isAnonymous],
      ['status', clean.status],
      ['reveal_at', clean.revealAt],
    ];
    if (clean.studentId) fields.unshift(['student_id', clean.studentId]);

    const assignments = fields.map(([field]) => `${field} = ?`).join(', ');
    const [result] = await connection.execute(
      `UPDATE letters SET ${assignments} WHERE id = ?`,
      [...fields.map(([, value]) => value), id],
    );
    if (!result.affectedRows) throw httpError('Không tìm thấy lời chúc', 404);

    await connection.commit();
    return {};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function bulkUpdateStatus(ids, status) {
  const cleanIds = parseIdList(ids);
  validateStatus(status, ['approved', 'rejected']);
  const placeholders = cleanIds.map(() => '?').join(',');
  const [result] = await pool.execute(
    `UPDATE letters SET status = ? WHERE id IN (${placeholders})`,
    [status, ...cleanIds],
  );
  return { updated: result.affectedRows };
}

async function deleteLetter(id) {
  const [result] = await pool.execute('DELETE FROM letters WHERE id = ?', [id]);
  if (!result.affectedRows) throw httpError('Không tìm thấy lời chúc', 404);
  return {};
}

async function bulkDelete(ids) {
  const cleanIds = parseIdList(ids);
  const placeholders = cleanIds.map(() => '?').join(',');
  const [result] = await pool.execute(
    `DELETE FROM letters WHERE id IN (${placeholders})`,
    cleanIds,
  );
  return { deleted: result.affectedRows };
}

module.exports = {
  listLetters,
  createLetters,
  updateLetter,
  updateStatus,
  bulkUpdateStatus,
  deleteLetter,
  bulkDelete,
};
