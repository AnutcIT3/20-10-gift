const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const { uploadImage, uploadErrorHandler } = require('../middleware/upload');
const galleryController = require('../controllers/galleryController');
const { asyncHandler } = require('../utils/response');

const adminStudentGalleryRouter = Router();
adminStudentGalleryRouter.use(authMiddleware);
adminStudentGalleryRouter.get('/:studentId/gallery', asyncHandler(galleryController.list));

const galleryRouter = Router();
galleryRouter.use(authMiddleware);
galleryRouter.post('/upload', uploadImage.single('image'), uploadErrorHandler, asyncHandler(galleryController.upload));
galleryRouter.put('/reorder', asyncHandler(galleryController.reorder));
galleryRouter.delete('/:id', asyncHandler(galleryController.remove));

module.exports = { adminStudentGalleryRouter, galleryRouter };
