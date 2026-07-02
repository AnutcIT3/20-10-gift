const { sendSuccess } = require('../utils/response');

function honeypot(req, res, next) {
  if (req.body && req.body._website) {
    return sendSuccess(res, { status: 'pending' }, 201);
  }
  next();
}

module.exports = honeypot;
