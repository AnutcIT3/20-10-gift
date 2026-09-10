// Phần "không cần camera" của Face ID: đếm phiếu, chọn câu nhắc, chào theo
// độ tự tin, đo sáng. Toàn hàm thuần để vitest phủ được mà không cần webcam.

export const TICK_MS = 800                 // nhịp lấy khung hình (~1.25 fps)
// Hai đường dừng khi không nhận ra, tách theo nguyên nhân:
// - Nhìn rõ mặt mà không khớp ai (người ngoài, hoặc hôm nay khác ảnh hồ sơ):
//   sau REJECTS_TO_GIVE_UP khung rõ mặt (~5 giây) là đủ biết, dừng sớm.
// - Không nhìn rõ mặt (tối, lệch khung, quá xa): nhắc chỉnh tối đa 30 giây.
// Người được nhận ra thường xong trong ~2 giây nên không ai phải chờ lâu.
export const SCAN_TIMEOUT_MS = 30 * 1000
export const REJECTS_TO_GIVE_UP = 6
export const COUNTDOWN_FROM = 10           // chỉ hiện đồng hồ đếm ngược ở 10 giây cuối
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

// Lý do dừng quét → câu nhắn; mọi đường lỗi đều rơi êm về gõ tên. Mỗi câu nói
// đúng nguyên nhân: không đổ cho ánh sáng khi thật ra máy đã nhìn rõ mặt.
export const STOP_MESSAGES = Object.freeze({
  camera: 'Không mở được camera — gõ tên giúp mình nhé 🌷',
  offline: 'Face ID đang nghỉ, gõ tên giúp mình nhé 🌷',
  limited: 'Hôm nay mình quét hơi nhiều rồi — gõ tên giúp mình nhé 🌷',
  timeout: 'Mình chưa nhìn rõ mặt cậu — thử chỗ sáng hơn, để cả khuôn mặt trong khung, hoặc gõ tên nhé 🌷',
  unrecognized: 'Có thể hôm nay cậu hơi khác ảnh mình đang giữ — tóc mới, kính, góc máy… Không sao đâu, gõ tên là mở được quà ngay.',
  hidden: 'Cậu rời tab nên mình đã tắt camera — bấm quét lại nhé 🌷',
})

// Tiêu đề riêng cho lượt dừng không phải lỗi; lý do khác dùng tiêu đề chung
export const STOP_TITLES = Object.freeze({
  unrecognized: 'Hôm nay cậu xinh quá, mình nhận không ra 😅',
})

// Hết giờ, rời tab, không nhận ra thì cho quét lại; camera bị từ chối, service
// nghỉ hay bị giới hạn tần suất thì không — thử lại cũng chỉ lỗi y hệt
export const RETRYABLE_STOPS = Object.freeze(['timeout', 'hidden', 'unrecognized'])

// rejects = số khung RÕ MẶT mà không khớp ai kể từ lần khớp gần nhất
export const INITIAL_VOTES = Object.freeze({ studentId: null, count: 0, rejects: 0 })

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
 *   Mọi lần khớp đều xóa bộ đếm "rõ mặt mà không khớp".
 * - 'reject' (máy nhìn rõ mặt nhưng không khớp ai đủ chắc): cộng 1 vào
 *   `rejects`; đủ REJECTS_TO_GIVE_UP thì `giveUp` — dừng sớm, không bắt người
 *   dùng chờ hết giờ chỉ để nghe câu "không nhận ra".
 * - no_face / low_quality / many_faces là trạng thái đang chỉnh máy: không tính
 *   phiếu, không cộng `rejects`, cũng không xóa gì — một khung nhòe không làm
 *   mất công khung tốt vừa rồi.
 * - `excluded`: những người cậu ấy vừa bấm "Không phải mình"; khớp với họ được
 *   coi như không khớp ai, để máy không hỏi lại đúng cái tên sai đó.
 * Đủ VOTES_TO_CONCLUDE phiếu liên tiếp → `conclusion` là ứng viên để hỏi xác nhận.
 */
export function tallyVotes(votes, result, excluded = []) {
  const rejects = votes.rejects || 0
  const isMatch = result?.decision === 'match' && !excluded.includes(result.studentId)
  const isReject = result?.decision === 'reject'
    || (result?.decision === 'match' && excluded.includes(result.studentId))

  if (isReject) {
    const next = { ...votes, rejects: rejects + 1 }
    return {
      votes: next,
      hint: HINTS.scanning,
      conclusion: null,
      giveUp: next.rejects >= REJECTS_TO_GIVE_UP,
    }
  }
  if (!isMatch) {
    return { votes, hint: hintFor(result), conclusion: null, giveUp: false }
  }
  const count = votes.studentId === result.studentId ? votes.count + 1 : 1
  const next = { studentId: result.studentId, count, rejects: 0 }
  if (count >= VOTES_TO_CONCLUDE) {
    return {
      votes: next,
      hint: HINTS.almost,
      giveUp: false,
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
  return { votes: next, hint: HINTS.almost, conclusion: null, giveUp: false }
}

// Chỉ hiện đồng hồ ở COUNTDOWN_FROM giây cuối; trước đó là câu trấn an —
// thấy "còn 29 giây" ngay từ đầu dễ tưởng phải chờ đủ chừng ấy
export function showCountdown(secondsLeft) {
  return Number(secondsLeft) <= COUNTDOWN_FROM
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

// Mã lượt quét: 32 ký tự hex ngẫu nhiên (backend kiểm /^[a-f0-9]{32}$/) — chỉ
// để gom các khung hình của một lần camera chạy, không gắn với máy hay người
export function makeScanToken(random = globalThis.crypto) {
  const bytes = random.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
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
