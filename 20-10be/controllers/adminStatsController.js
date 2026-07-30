const statsService = require('../services/statsService');
const exportService = require('../services/exportService');
const { sendSuccess } = require('../utils/response');

async function getStats(req, res) {
  return sendSuccess(res, await statsService.getDashboardStats());
}

async function exportStudents(req, res) {
  const csv = await exportService.exportStudentsCsv();
  const filename = `hoc-sinh-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

module.exports = { getStats, exportStudents };
