const { sendError } = require('../utils/response');

function errorHandler(err, req, res, next) {
  console.error(err);

  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });
  }

  return sendError(res, err.message, err.statusCode || 500);
}

module.exports = errorHandler;
