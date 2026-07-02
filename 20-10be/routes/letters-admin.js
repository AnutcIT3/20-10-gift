const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const letterController = require('../controllers/letterController');
const { asyncHandler } = require('../utils/response');

const adminLettersRouter = Router();
adminLettersRouter.use(authMiddleware);
adminLettersRouter.get('/', asyncHandler(letterController.list));

const lettersRouter = Router();
lettersRouter.use(authMiddleware);
lettersRouter.patch('/:id/status', asyncHandler(letterController.updateStatus));
lettersRouter.delete('/:id', asyncHandler(letterController.remove));

module.exports = { adminLettersRouter, lettersRouter };
