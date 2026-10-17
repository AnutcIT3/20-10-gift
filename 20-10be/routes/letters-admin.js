const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const letterController = require('../controllers/letterController');
const { asyncHandler } = require('../utils/response');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');

const adminLettersRouter = Router();
// authMiddleware đứng trước multer: request chưa đăng nhập không được đẩy
// ảnh lên Cloudinary
adminLettersRouter.use(authMiddleware);
adminLettersRouter.get('/', asyncHandler(letterController.list));
adminLettersRouter.post('/', letterImageUpload, uploadErrorHandler, asyncHandler(letterController.create));
adminLettersRouter.patch('/bulk/status', asyncHandler(letterController.bulkUpdateStatus));
adminLettersRouter.delete('/bulk', asyncHandler(letterController.bulkRemove));

const lettersRouter = Router();
lettersRouter.use(authMiddleware);
lettersRouter.patch('/:id', asyncHandler(letterController.update));
lettersRouter.patch('/:id/status', asyncHandler(letterController.updateStatus));
lettersRouter.delete('/:id', asyncHandler(letterController.remove));

module.exports = { adminLettersRouter, lettersRouter };
