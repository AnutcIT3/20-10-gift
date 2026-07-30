const { sendError } = require('../utils/response');

function errorHandler(err, req, res, next) {
  console.error(err);
  const statusCode = err.statusCode || err.status || 500;

  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });
  }

  const message = statusCode >= 500
    ? 'Đã xảy ra lỗi máy chủ, vui lòng thử lại sau.'
    : err.message;
  return sendError(res, message, statusCode);
}

module.exports = errorHandler;
