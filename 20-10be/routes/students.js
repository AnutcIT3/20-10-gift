const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const { asyncHandler } = require('../utils/response');

const router = Router();

router.use(authMiddleware);
router.get('/', asyncHandler(studentController.list));
router.get('/:id', asyncHandler(studentController.getOne));
router.post('/', asyncHandler(studentController.create));
router.put('/:id', asyncHandler(studentController.update));
router.patch('/:id/deactivate', asyncHandler(studentController.deactivate));
router.post('/:id/rotate-code', asyncHandler(studentController.rotateCode));

module.exports = router;
