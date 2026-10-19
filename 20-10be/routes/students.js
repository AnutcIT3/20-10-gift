const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const { asyncHandler } = require('../utils/response');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');

const router = Router();

router.use(authMiddleware);
router.get('/', asyncHandler(studentController.list));
router.get('/:id', asyncHandler(studentController.getOne));
router.post('/', asyncHandler(studentController.create));
router.put('/:id', asyncHandler(studentController.update));
router.patch('/:id/deactivate', asyncHandler(studentController.deactivate));
router.patch('/:id/activate', asyncHandler(studentController.activate));
router.patch('/:id/access-code', asyncHandler(studentController.updateAccessCode));
router.patch('/:id/seat', asyncHandler(studentController.updateSeat));
// Ảnh kèm lời chúc riêng / 💌 admin / ✨ tự động; authMiddleware (router.use ở
// trên) chạy trước multer nên request chưa đăng nhập không đẩy được ảnh lên
router.post('/:id/wish-images/:kind', letterImageUpload, uploadErrorHandler, asyncHandler(studentController.uploadWishImage));
// Đường cũ (một ảnh) của bản admin chưa tải lại — giờ cũng là thêm ảnh
router.put('/:id/wish-images/:kind', letterImageUpload, uploadErrorHandler, asyncHandler(studentController.uploadWishImage));
router.delete('/:id/wish-images/:kind/:imageId', asyncHandler(studentController.removeWishImage));
router.delete('/:id/wish-images/:kind', asyncHandler(studentController.removeWishImage));
// Lời chúc riêng / 💌: lời nhắn thêm (lời thứ 2–4), mỗi lời kèm tối đa 4 ảnh
router.post('/:id/wish-notes/:kind', asyncHandler(studentController.addWishNote));
router.patch('/:id/wish-notes/:noteId', asyncHandler(studentController.updateWishNote));
router.delete('/:id/wish-notes/:noteId', asyncHandler(studentController.removeWishNote));
router.post('/:id/wish-notes/:noteId/images', letterImageUpload, uploadErrorHandler, asyncHandler(studentController.uploadWishNoteImages));
router.delete('/:id/wish-notes/:noteId/images/:imageId', asyncHandler(studentController.removeWishNoteImage));
router.delete('/:id', asyncHandler(studentController.remove));

module.exports = router;
