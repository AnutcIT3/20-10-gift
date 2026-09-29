const giftService = require('../services/giftService');
const replyService = require('../services/replyService');
const keepsakeService = require('../services/keepsakeService');
const { sendError } = require('../utils/response');

// POST /api/gifts/:accessCode/keepsake — body { greeting? }: lời chúc AI đang
// hiện trên màn hình. Trả về chính file .html để trình duyệt lưu xuống máy.
async function download(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);

  const [gallery, letters, replies] = await Promise.all([
    giftService.getGallery(student.id),
    giftService.getApprovedLetters(student.id),
    replyService.listStudentReplies(student.id),
  ]);
  const { html, filename } = await keepsakeService.buildKeepsake({
    student,
    gallery,
    letters,
    // Thư riêng gửi admin không vào bản lưu: ai có mã trang cũng tải được file
    replies: replies.filter((reply) => reply.target !== 'admin'),
    greeting: req.body?.greeting,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Bản lưu chứa thư riêng: không để proxy hay trình duyệt giữ lại bản sao
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
}

module.exports = { download };
