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
galleryRouter.post('/upload', uploadImage.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 20 },
]), uploadErrorHandler, asyncHandler(galleryController.upload));
galleryRouter.put('/reorder', asyncHandler(galleryController.reorder));
galleryRouter.patch('/:id/caption', asyncHandler(galleryController.updateCaption));
galleryRouter.delete('/:id', asyncHandler(galleryController.remove));

module.exports = { adminStudentGalleryRouter, galleryRouter };
