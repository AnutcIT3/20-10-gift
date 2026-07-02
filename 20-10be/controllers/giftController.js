const { sendSuccess, sendError } = require('../utils/response');
const giftService = require('../services/giftService');

async function getStudent(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  return sendSuccess(res, student);
}

async function getGallery(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  const gallery = await giftService.getGallery(student.id);
  return sendSuccess(res, gallery);
}

async function getLetters(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);
  const letters = await giftService.getApprovedLetters(student.id);
  return sendSuccess(res, letters);
}

async function createLetter(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);

  const result = await giftService.createLetter(student.id, req.body);
  return sendSuccess(res, result, 201);
}

module.exports = { getStudent, getGallery, getLetters, createLetter };
