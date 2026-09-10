const { sendSuccess, sendError } = require('../utils/response');
const faceHistoryService = require('../services/faceHistoryService');

async function summary(req, res) {
  return sendSuccess(res, await faceHistoryService.getSummary());
}

async function list(req, res) {
  const { limit, before, filter, studentId } = req.query;
  return sendSuccess(res, await faceHistoryService.listScans({
    limit, before, filter, studentId,
  }));
}

async function detail(req, res) {
  const scan = await faceHistoryService.getScan(req.params.id);
  if (!scan) return sendError(res, 'Không tìm thấy lượt quét', 404);
  return sendSuccess(res, scan);
}

async function clear(req, res) {
  return sendSuccess(res, await faceHistoryService.clearHistory());
}

module.exports = {
  summary, list, detail, clear,
};
