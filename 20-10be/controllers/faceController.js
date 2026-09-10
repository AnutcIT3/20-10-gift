const { sendSuccess, sendError } = require('../utils/response');
const faceService = require('../services/faceService');

async function status(req, res) {
  return sendSuccess(res, await faceService.getStatus());
}

async function match(req, res) {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return sendError(res, 'Thiếu khung hình (trường "frame")', 400);
  }
  try {
    return sendSuccess(res, await faceService.matchFrame(req.file.buffer, req.file.mimetype));
  } catch (error) {
    // 503 đi thẳng qua sendError: errorHandler production thay thông điệp ≥ 500
    // bằng câu chung, mà frontend cần đúng câu "Face ID tạm nghỉ" để hiện
    if (error.statusCode === 503) return sendError(res, error.message, 503);
    throw error;
  }
}

async function confirm(req, res) {
  const { matchId, confirmed } = req.body || {};
  if (!Number.isInteger(matchId) || matchId <= 0 || typeof confirmed !== 'boolean') {
    return sendError(res, 'Cần matchId (số nguyên dương) và confirmed (boolean)', 400);
  }
  return sendSuccess(res, await faceService.confirmMatch(matchId, confirmed));
}

module.exports = { status, match, confirm };
