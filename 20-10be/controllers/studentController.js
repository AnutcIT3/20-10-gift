const studentService = require('../services/studentService');
const { sendSuccess, sendError } = require('../utils/response');
const { extractLetterImage, cleanupLetterImage } = require('../utils/letterUpload');

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(res, 'ID học sinh không hợp lệ', 400);
    return null;
  }
  return id;
}

async function list(req, res) {
  return sendSuccess(res, await studentService.listStudents());
}

async function getOne(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const student = await studentService.getStudent(id);
  if (!student) return sendError(res, 'Không tìm thấy học sinh', 404);
  return sendSuccess(res, student);
}

async function create(req, res) {
  return sendSuccess(res, await studentService.createStudent(req.body), 201);
}

async function update(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.updateStudent(id, req.body));
}

async function deactivate(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.deactivateStudent(id));
}

async function activate(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.activateStudent(id));
}

async function remove(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.deleteStudent(id));
}

async function updateAccessCode(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.updateAccessCode(id, req.body?.access_code));
}

async function updateSeat(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.updateSeat(id, req.body));
}

// Ảnh kèm một trong ba lời chúc riêng (intro / admin_wish / greeting)
async function uploadWishImage(req, res) {
  const image = extractLetterImage(req);
  const id = parseId(req, res);
  if (id === null) { await cleanupLetterImage(image); return undefined; }
  if (!image) return sendError(res, 'Chọn một ảnh để tải lên (trường "image")', 400);
  try {
    return sendSuccess(res, await studentService.setWishImage(id, req.params.kind, image));
  } catch (error) {
    // Loại lời chúc sai hay không có học sinh → dọn ảnh đã lỡ upload
    await cleanupLetterImage(image);
    throw error;
  }
}

async function removeWishImage(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.setWishImage(id, req.params.kind, null));
}

module.exports = {
  list, getOne, create, update, deactivate, activate, remove, updateAccessCode, updateSeat,
  uploadWishImage, removeWishImage,
};
