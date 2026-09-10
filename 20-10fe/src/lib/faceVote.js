// Phần "không cần camera" của Face ID: đếm phiếu, chọn câu nhắc, chào theo
// độ tự tin, đo sáng. Toàn hàm thuần để vitest phủ được mà không cần webcam.

export const TICK_MS = 800                 // nhịp lấy khung hình (~1.25 fps)
export const SCAN_TIMEOUT_MS = 120 * 1000  // quét tối đa 2 phút rồi nhường cho gõ tên
export const VOTES_TO_CONCLUDE = 2         // hai khung liên tiếp cùng một người mới kết luận
export const CONFIDENT_SCORE = 0.6         // từ mức này máy "nhận ra ngay", dưới thì "hmm…"
export const DARK_LUMA = 35                // luma Rec.601 trung bình vùng giữa dưới mức này → tối, không gửi
export const MAX_FRAME_WIDTH = 480         // khung gửi lên rộng tối đa 480 px (~50–150 KB JPEG)

export const HINTS = Object.freeze({
  starting: 'Đang mở camera…',
  scanning: 'đang so với gương mặt của lớp mình…',
  almost: 'Hình như thấy cậu rồi, giữ yên thêm một chút nhé ✨',
  darkLocal: 'Chỗ này hơi tối, tìm chỗ sáng hơn giúp mình nhé 🌙',
  no_face: 'Đưa mặt vào khung nhé',
  small: 'Lại gần máy hơn chút nhé',
  dark: 'Hơi tối rồi 🌙',
  blurry: 'Giữ máy yên một chút nhé',
  many_faces: 'Chỉ một người trong khung thôi nha',
})

// Lý do dừng quét → câu nhắn; mọi đường lỗi đều rơi êm về gõ tên
export const STOP_MESSAGES = Object.freeze({
  camera: 'Không mở được camera — gõ tên giúp mình nhé 🌷',
  offline: 'Face ID đang nghỉ, gõ tên giúp mình nhé 🌷',
  limited: 'Hôm nay cậu xinh quá mình nhận không ra 😅 — thử gõ tên nhé',
  timeout: 'Ánh sáng chưa chiều mình rồi, gõ tên giúp mình nha 🌷',
  hidden: 'Cậu rời tab nên mình đã tắt camera — bấm quét lại nhé 🌷',
})

// Dừng vì hết giờ / rời tab thì cho quét lại; camera bị từ chối, service nghỉ
// hay bị giới hạn tần suất thì không — thử lại cũng chỉ lỗi y hệt
export const RETRYABLE_STOPS = Object.freeze(['timeout', 'hidden'])

export const INITIAL_VOTES = Object.freeze({ studentId: null, count: 0 })

// Câu nhắc tại chỗ cho từng quyết định của server (không kết luận danh tính)
export function hintFor(result) {
  switch (result?.decision) {
    case 'no_face': return HINTS.no_face
    case 'many_faces': return HINTS.many_faces
    case 'low_quality':
      if (result.reason === 'small') return HINTS.small
      if (result.reason === 'dark') return HINTS.dark
      if (result.reason === 'blurry') return HINTS.blurry
      return HINTS.scanning
    default: return HINTS.scanning
  }
}

/**
 * Cộng một kết quả /api/face/match vào phiếu bầu.
 * - 'match': cùng người với phiếu trước → +1, khác người → bắt đầu đếm lại từ 1.
 * - Mọi quyết định khác (reject, no_face, low_quality, many_faces) không tính
 *   phiếu và cũng không xóa phiếu đang có: một khung nhòe không làm mất công
 *   khung tốt vừa rồi.
 * Đủ VOTES_TO_CONCLUDE phiếu liên tiếp → `conclusion` là ứng viên để hỏi xác nhận.
 */
export function tallyVotes(votes, result) {
  if (result?.decision !== 'match') {
    return { votes, hint: hintFor(result), conclusion: null }
  }
  const count = votes.studentId === result.studentId ? votes.count + 1 : 1
  const next = { studentId: result.studentId, count }
  if (count >= VOTES_TO_CONCLUDE) {
    return {
      votes: next,
      hint: HINTS.almost,
      conclusion: {
        matchId: result.matchId,
        studentId: result.studentId,
        giftPath: result.giftPath,
        displayName: result.displayName,
        score: result.score,
        margin: result.margin,
      },
    }
  }
  return { votes: next, hint: HINTS.almost, conclusion: null }
}

// Lời chào phân tầng theo độ tự tin — máy có "tính cách" thay vì kết quả khô khan
export function greetingFor(score) {
  return Number(score) >= CONFIDENT_SCORE
    ? 'Nhận ra cậu ngay lập tức luôn!'
    : 'Hmm... có phải cậu không ta? 🤔'
}

// Lỗi từ matchFace → lý do dừng, hoặc null nếu chỉ là một khung hỏng (400/413/
// 500) và nên quét tiếp
export function stopKindFor(err) {
  if (err?.status === 429) return 'limited'
  if (err?.status === 503 || err?.isNetworkError) return 'offline'
  return null
}

export function remainingSeconds(startedAt, now, timeoutMs = SCAN_TIMEOUT_MS) {
  return Math.max(0, Math.ceil((startedAt + timeoutMs - now) / 1000))
}

// Luma Rec.601 trung bình của một mảng RGBA (Uint8ClampedArray từ getImageData)
export function meanLuma(rgba) {
  const pixels = Math.floor(rgba.length / 4)
  if (!pixels) return 0
  let sum = 0
  for (let i = 0; i < pixels * 4; i += 4) {
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
  }
  return sum / pixels
}

export function isTooDark(luma) {
  return luma < DARK_LUMA
}
