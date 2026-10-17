const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const { asyncHandler } = require('../utils/response');
const { uploadImage, uploadErrorHandler } = require('../config/cloudinary');

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
router.put('/:id/wish-images/:kind', uploadImage.single('image'), uploadErrorHandler, asyncHandler(studentController.uploadWishImage));
router.delete('/:id/wish-images/:kind', asyncHandler(studentController.removeWishImage));
router.delete('/:id', asyncHandler(studentController.remove));

module.exports = router;
