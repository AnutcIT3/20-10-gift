const studentService = require('../services/studentService');
const { sendSuccess, sendError } = require('../utils/response');

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(res, 'ID học sinh không hợp lệ', 400);
    return null;
  }
  return id;
}

async function list(req, res) {
  return sendSuccess(res, await studentService.listStudents());
}

async function getOne(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const student = await studentService.getStudent(id);
  if (!student) return sendError(res, 'Không tìm thấy học sinh', 404);
  return sendSuccess(res, student);
}

async function create(req, res) {
  return sendSuccess(res, await studentService.createStudent(req.body), 201);
}

async function update(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.updateStudent(id, req.body));
}

async function deactivate(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.deactivateStudent(id));
}

async function rotateCode(req, res) {
  const id = parseId(req, res);
  if (id === null) return undefined;
  return sendSuccess(res, await studentService.rotateCode(id));
}

module.exports = { list, getOne, create, update, deactivate, rotateCode };
