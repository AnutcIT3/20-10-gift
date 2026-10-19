const pool = require('../config/db');
const letterImageService = require('./letterImageService');
const { LETTER_MAX_IMAGES } = require('../utils/letterUpload');

// Lời chúc riêng (intro) và 💌 lời chúc từ admin (admin_wish): mỗi bạn tối đa
// 4 lời mỗi loại. Lời thứ nhất vẫn là cột cũ của students (sửa ở trang Học sinh
// hay "Riêng từng bạn" như trước); bảng wish_notes (migration 026) chỉ giữ các
// lời THÊM, mỗi lời kèm tối đa 4 ảnh. ✨ lời chúc tự động vẫn chỉ một lời.

const NOTE_KINDS = Object.freeze(['intro', 'admin_wish']);
const MAX_NOTES_PER_KIND = 4;
const MAX_EXTRA_NOTES = MAX_NOTES_PER_KIND - 1;
const MAX_NOTE_LENGTH = 65535;
const NEEDS_MIGRATION = 'Máy chủ chưa hỗ trợ thêm lời nhắn (cần chạy npm run migrate)';

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function assertKind(kind) {
  if (!NOTE_KINDS.includes(kind)) throw httpError('Loại lời chúc không hợp lệ (intro hoặc admin_wish)', 400);
}

function cleanContent(value) {
  if (typeof value !== 'string') throw httpError('Nội dung lời nhắn không hợp lệ', 400);
  const trimmed = value.trim();
  if (!trimmed) throw httpError('Lời nhắn không được để trống', 400);
  if (trimmed.length > MAX_NOTE_LENGTH) throw httpError(`Lời nhắn tối đa ${MAX_NOTE_LENGTH} ký tự`, 400);
  return trimmed;
}

// studentIds → Map(studentId → { intro: [...], admin_wish: [...] }), mỗi lời
// { id, content, images: [{ id, url }] } theo thứ tự. Máy chưa migrate thì null
async function notesForStudents(studentIds) {
  if (!studentIds.length) return new Map();
  let notes;
  try {
    [notes] = await pool.execute(
      `SELECT id, student_id, kind, content FROM wish_notes
       WHERE student_id IN (${studentIds.map(() => '?').join(',')})
       ORDER BY student_id, kind, position, id`,
      studentIds,
    );
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  const imagesByNote = new Map();
  if (notes.length) {
    const [images] = await pool.execute(
      `SELECT id, note_id, image_url FROM wish_note_images
       WHERE note_id IN (${notes.map(() => '?').join(',')})
       ORDER BY note_id, position, id`,
      notes.map((note) => note.id),
    );
    for (const image of images) {
      if (!imagesByNote.has(image.note_id)) imagesByNote.set(image.note_id, []);
      imagesByNote.get(image.note_id).push({ id: image.id, url: image.image_url });
    }
  }
  const byStudent = new Map();
  for (const note of notes) {
    if (!byStudent.has(note.student_id)) byStudent.set(note.student_id, {});
    const kinds = byStudent.get(note.student_id);
    (kinds[note.kind] ||= []).push({ id: note.id, content: note.content || '', images: imagesByNote.get(note.id) || [] });
  }
  return byStudent;
}

// Gắn intro_notes / admin_wish_notes (chỉ các lời THÊM) vào từng bạn
async function withWishNotes(students) {
  const list = students.filter(Boolean);
  if (!list.length) return students;
  const byStudent = await notesForStudents(list.map((student) => student.id));
  return students.map((student) => {
    if (!student) return student;
    const kinds = byStudent?.get(student.id) || {};
    return { ...student, intro_notes: kinds.intro || [], admin_wish_notes: kinds.admin_wish || [] };
  });
}

async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    if (isMissingTable(error)) throw httpError(NEEDS_MIGRATION, 503);
    throw error;
  } finally {
    connection.release();
  }
}

async function lockStudent(connection, studentId) {
  const [rows] = await connection.execute('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!rows.length) throw httpError('Không tìm thấy học sinh', 404);
}

// Lời thuộc đúng bạn này — không sửa được lời của bạn khác qua URL của mình
async function lockNote(connection, studentId, noteId) {
  const [rows] = await connection.execute(
    'SELECT id, kind FROM wish_notes WHERE id = ? AND student_id = ? FOR UPDATE',
    [noteId, studentId],
  );
  if (!rows.length) throw httpError('Không tìm thấy lời nhắn', 404);
  return rows[0];
}

async function addNote(studentId, kind, content) {
  assertKind(kind);
  const text = cleanContent(content);
  return inTransaction(async (connection) => {
    await lockStudent(connection, studentId);
    const [[{ total, last }]] = await connection.execute(
      'SELECT COUNT(*) AS total, MAX(position) AS last FROM wish_notes WHERE student_id = ? AND kind = ?',
      [studentId, kind],
    );
    if (Number(total) >= MAX_EXTRA_NOTES) {
      throw httpError(`Mỗi loại lời chúc tối đa ${MAX_NOTES_PER_KIND} lời nhắn`, 400);
    }
    const position = last === null || last === undefined ? 0 : Number(last) + 1;
    const [result] = await connection.execute(
      'INSERT INTO wish_notes (student_id, kind, content, position) VALUES (?, ?, ?, ?)',
      [studentId, kind, text, position],
    );
    return result.insertId;
  });
}

async function updateNote(studentId, noteId, content) {
  const text = cleanContent(content);
  await inTransaction(async (connection) => {
    await lockNote(connection, studentId, noteId);
    await connection.execute('UPDATE wish_notes SET content = ? WHERE id = ?', [text, noteId]);
  });
}

// Xoá lời (ảnh đi theo nhờ ON DELETE CASCADE), rồi dọn ảnh trên Cloudinary
async function removeNote(studentId, noteId) {
  const publicIds = await inTransaction(async (connection) => {
    await lockNote(connection, studentId, noteId);
    const [images] = await connection.execute('SELECT public_id FROM wish_note_images WHERE note_id = ?', [noteId]);
    await connection.execute('DELETE FROM wish_notes WHERE id = ?', [noteId]);
    return images.map((image) => image.public_id);
  });
  await letterImageService.destroyUnreferenced(publicIds);
}

// images: [{ url, publicId }] vừa upload, thêm vào cuối; tổng quá 4 thì từ chối
async function addNoteImages(studentId, noteId, images) {
  if (!images.length) throw httpError('Chọn ít nhất một ảnh để tải lên', 400);
  await inTransaction(async (connection) => {
    await lockNote(connection, studentId, noteId);
    const [[{ total, last }]] = await connection.execute(
      'SELECT COUNT(*) AS total, MAX(position) AS last FROM wish_note_images WHERE note_id = ?',
      [noteId],
    );
    const count = Number(total);
    if (count + images.length > LETTER_MAX_IMAGES) {
      const left = LETTER_MAX_IMAGES - count;
      throw httpError(left > 0
        ? `Mỗi lời nhắn kèm tối đa ${LETTER_MAX_IMAGES} ảnh — chỉ thêm được ${left} ảnh nữa`
        : `Lời nhắn này đã đủ ${LETTER_MAX_IMAGES} ảnh`, 400);
    }
    const start = last === null || last === undefined ? 0 : Number(last) + 1;
    await connection.execute(
      `INSERT INTO wish_note_images (note_id, image_url, public_id, position)
       VALUES ${images.map(() => '(?, ?, ?, ?)').join(', ')}`,
      images.flatMap((image, index) => [noteId, image.url, image.publicId || null, start + index]),
    );
  });
}

async function removeNoteImage(studentId, noteId, imageId) {
  const publicIds = await inTransaction(async (connection) => {
    await lockNote(connection, studentId, noteId);
    const [rows] = await connection.execute(
      'SELECT id, public_id FROM wish_note_images WHERE id = ? AND note_id = ?',
      [imageId, noteId],
    );
    if (!rows.length) throw httpError('Không tìm thấy ảnh', 404);
    await connection.execute('DELETE FROM wish_note_images WHERE id = ?', [imageId]);
    return [rows[0].public_id];
  });
  await letterImageService.destroyUnreferenced(publicIds);
}

module.exports = {
  NOTE_KINDS,
  MAX_NOTES_PER_KIND,
  notesForStudents,
  withWishNotes,
  addNote,
  updateNote,
  removeNote,
  addNoteImages,
  removeNoteImage,
};
