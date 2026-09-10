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
    // scan/t là trường chữ đi cùng khung hình trong multipart: mã lượt quét và
    // thời điểm của khung trong lượt — thiếu hay sai thì chỉ không vào lịch sử
    const context = { scan: req.body?.scan, t: req.body?.t, userAgent: req.get('user-agent') };
    return sendSuccess(res, await faceService.matchFrame(req.file.buffer, req.file.mimetype, context));
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

async function endScan(req, res) {
  if (!faceService.isScanToken(req.params.token)) {
    return sendError(res, 'Mã lượt quét không hợp lệ', 400);
  }
  return sendSuccess(res, await faceService.endScan(req.params.token, req.body || {}, req.get('user-agent')));
}

async function claimScans(req, res) {
  const { tokens, accessCode } = req.body || {};
  if (!Array.isArray(tokens) || typeof accessCode !== 'string') {
    return sendError(res, 'Cần tokens (mảng mã lượt quét) và accessCode', 400);
  }
  return sendSuccess(res, await faceService.claimScans(tokens, accessCode));
}

module.exports = {
  status, match, confirm, endScan, claimScans,
};
