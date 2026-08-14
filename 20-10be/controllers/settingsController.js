const settingsService = require('../services/settingsService');
const { sendSuccess } = require('../utils/response');

async function getSettings(req, res) {
  return sendSuccess(res, await settingsService.getSettings());
}

async function updateSettings(req, res) {
  return sendSuccess(
    res,
    await settingsService.setGiftPagesLocked(req.body?.gift_pages_locked),
  );
}

module.exports = { getSettings, updateSettings };
