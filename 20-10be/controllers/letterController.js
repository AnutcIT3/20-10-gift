const letterService = require('../services/letterService');
const { sendSuccess, sendError } = require('../utils/response');

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(res, 'ID lời chúc không hợp lệ', 400);
    return null;
  }
  return id;
}

async function list(req, res) {
  return sendSuccess(res, await letterService.listLetters(req.query));
}

async function updateStatus(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await letterService.updateStatus(id, req.body?.status));
}

async function remove(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await letterService.deleteLetter(id));
}

module.exports = { list, updateStatus, remove };
