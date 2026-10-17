const studentService = require('../services/studentService');
const { sendSuccess, sendError } = require('../utils/response');
const { extractLetterImages, cleanupLetterImages, assertImageCount } = require('../utils/letterUpload');

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

// Ảnh kèm một trong ba lời chúc riêng (intro / admin_wish / greeting): thêm
// một lúc nhiều ảnh, mỗi lời chúc tối đa 4
async function uploadWishImage(req, res) {
  const images = extractLetterImages(req);
  const id = parseId(req, res);
  if (id === null) { await cleanupLetterImages(images); return undefined; }
  if (!images.length) return sendError(res, 'Chọn ảnh để tải lên (trường "images")', 400);
  await assertImageCount(images);
  try {
    return sendSuccess(res, await studentService.addWishImages(id, req.params.kind, images));
  } catch (error) {
    // Loại lời chúc sai, không có học sinh hay quá 4 ảnh → dọn ảnh đã lỡ upload
    await cleanupLetterImages(images);
    throw error;
  }
}

// Có :imageId thì bỏ một ảnh, không có thì bỏ hết ảnh của lời chúc đó
async function removeWishImage(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  let imageId = null;
  if (req.params.imageId !== undefined) {
    imageId = Number(req.params.imageId);
    if (!Number.isInteger(imageId) || imageId <= 0) return sendError(res, 'ID ảnh không hợp lệ', 400);
  }
  return sendSuccess(res, await studentService.removeWishImages(id, req.params.kind, imageId));
}

module.exports = {
  list, getOne, create, update, deactivate, activate, remove, updateAccessCode, updateSeat,
  uploadWishImage, removeWishImage,
};
