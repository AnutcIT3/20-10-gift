const galleryService = require('../services/galleryService');
const { cloudinary } = require('../config/cloudinary');
const { sendSuccess, sendError } = require('../utils/response');

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function list(req, res) {
  const studentId = positiveId(req.params.studentId);
  if (!studentId) return sendError(res, 'ID học sinh không hợp lệ', 400);
  return sendSuccess(res, await galleryService.listGallery(studentId));
}

async function upload(req, res) {
  const files = [
    ...(req.files?.image || []),
    ...(req.files?.images || []),
  ];
  if (!files.length) return sendError(res, 'Vui lòng chọn ảnh', 400);
  const studentId = positiveId(req.body.student_id);
  if (!studentId) {
    await Promise.all(files.map((file) => cloudinary.uploader.destroy(file.filename).catch(() => {})));
    return sendError(res, 'student_id không hợp lệ', 400);
  }
  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : null;
  const uploadedImages = [];
  try {
    for (const file of files) {
      const image = await galleryService.createImage({
        studentId,
        imageUrl: file.path,
        publicId: file.filename,
        caption,
      });
      uploadedImages.push(image);
    }
    return sendSuccess(res, files.length === 1 ? uploadedImages[0] : uploadedImages, 201);
  } catch (error) {
    await Promise.all(files.map((file) => cloudinary.uploader.destroy(file.filename).catch(() => {})));
    throw error;
  }
}

async function reorder(req, res) {
  return sendSuccess(res, await galleryService.reorder(req.body?.items));
}

async function remove(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return sendError(res, 'ID ảnh không hợp lệ', 400);
  return sendSuccess(res, await galleryService.deleteImage(id));
}

async function updateCaption(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return sendError(res, 'ID ảnh không hợp lệ', 400);
  return sendSuccess(res, await galleryService.updateCaption(id, req.body?.caption));
}

module.exports = { list, upload, reorder, remove, updateCaption };
