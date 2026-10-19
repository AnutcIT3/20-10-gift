// Vé mở quà: máy chủ cấp khi Face ID (hay ô gõ tên, lúc còn cho phép) mở đúng
// trang quà. Lưu trên máy này để mở lại trang (F5, link đã lưu) không phải quét
// lại; lúc admin bật "Chỉ mở bằng Face ID", trang của bạn trong lớp chỉ mở cho
// máy có vé. Vé tự hết hạn ở máy chủ — ở đây chỉ giữ, không tự kiểm.
const KEY = 'gift_tickets'
const MAX_TICKETS = 30

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const codeOf = (giftPathOrCode) => String(giftPathOrCode || '').split('/').filter(Boolean).pop()?.toLowerCase() || ''

export function giftTicket(giftPathOrCode) {
  const code = codeOf(giftPathOrCode)
  return code ? readAll()[code] || null : null
}

export function keepGiftTicket(giftPathOrCode, ticket) {
  const code = codeOf(giftPathOrCode)
  if (!code || typeof ticket !== 'string' || !ticket) return
  const all = readAll()
  delete all[code]
  all[code] = ticket
  const entries = Object.entries(all).slice(-MAX_TICKETS)
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries))) } catch { /* bộ nhớ đầy / chế độ riêng tư */ }
}

// Header gửi kèm mọi request tới /api/gifts/<mã>: vé của trang đó, và token
// admin nếu đang đăng nhập admin (admin xem trước trang quà)
export function giftAuthHeaders(accessCode) {
  const headers = {}
  const ticket = giftTicket(accessCode)
  if (ticket) headers['X-Gift-Ticket'] = ticket
  try {
    const admin = sessionStorage.getItem('gift_admin_token')
    if (admin) headers.Authorization = `Bearer ${admin}`
  } catch { /* ignore */ }
  return headers
}
