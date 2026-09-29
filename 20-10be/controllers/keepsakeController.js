const giftService = require('../services/giftService');
const replyService = require('../services/replyService');
const keepsakeService = require('../services/keepsakeService');
const pdfService = require('../services/pdfService');
const { sendError } = require('../utils/response');

function sendFile(res, { body, filename, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Bản lưu chứa thư riêng: không để proxy hay trình duyệt giữ lại bản sao
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

// POST /api/gifts/:accessCode/keepsake — body { greeting?, format? }: lời chúc
// AI đang hiện trên màn hình, và 'pdf' để nhận file PDF (mặc định vẫn là file
// .html). Máy chủ không in được PDF thì trả bản .html để bạn ấy không về tay
// không; trang quà đặt đuôi file theo Content-Type.
async function download(req, res) {
  const student = await giftService.getStudentByCode(req.params.accessCode);
  if (!student) return sendError(res, 'Not found', 404);

  const [gallery, letters, replies] = await Promise.all([
    giftService.getGallery(student.id),
    giftService.getApprovedLetters(student.id),
    replyService.listStudentReplies(student.id),
  ]);
  const data = {
    student,
    gallery,
    letters,
    // Thư riêng gửi admin không vào bản lưu: ai có mã trang cũng tải được file
    replies: replies.filter((reply) => reply.target !== 'admin'),
    greeting: req.body?.greeting,
  };

  if (req.body?.format === 'pdf') {
    const { html, filename } = await keepsakeService.buildKeepsake({ ...data, format: 'pdf' });
    try {
      const pdf = await pdfService.htmlToPdf(html);
      return sendFile(res, { body: pdf, filename, contentType: 'application/pdf' });
    } catch (error) {
      if (error.code === 'PDF_BUSY') {
        res.setHeader('Retry-After', '60');
        return sendError(res, 'Nhiều bạn đang tải bản lưu cùng lúc quá, chờ một phút rồi bấm lại nhé.', 503);
      }
      console.warn('[keepsake] Không in được PDF, trả bản HTML:', error.message);
    }
  }

  const { html, filename } = await keepsakeService.buildKeepsake(data);
  return sendFile(res, { body: html, filename, contentType: 'text/html; charset=utf-8' });
}

module.exports = { download };
