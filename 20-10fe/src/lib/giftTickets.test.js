import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { giftAuthHeaders, giftTicket, keepGiftTicket } from './giftTickets'

// jsdom của bộ test không có Web Storage: bộ nhớ giả đơn giản
function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
    clear: () => data.clear(),
  }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})
afterEach(() => { vi.unstubAllGlobals() })

test('giữ vé theo mã trang (từ giftPath hay mã), đọc lại được, gửi kèm header', () => {
  keepGiftTicket('/gift/12A1-Ngoc', 've-ngoc')
  expect(giftTicket('12a1-ngoc')).toBe('ve-ngoc')
  expect(giftTicket('/gift/12a1-ngoc')).toBe('ve-ngoc')
  expect(giftTicket('12a1-thuy')).toBeNull()
  expect(giftAuthHeaders('12a1-ngoc')).toEqual({ 'X-Gift-Ticket': 've-ngoc' })
  // Đăng nhập admin: kèm token admin để xem trước
  sessionStorage.setItem('gift_admin_token', 'admin-token')
  expect(giftAuthHeaders('12a1-thuy')).toEqual({ Authorization: 'Bearer admin-token' })
})

test('dữ liệu hỏng hay vé rỗng thì bỏ qua, không làm vỡ trang', () => {
  localStorage.setItem('gift_tickets', '{hỏng')
  expect(giftTicket('12a1-ngoc')).toBeNull()
  keepGiftTicket('12a1-ngoc', '')
  expect(giftTicket('12a1-ngoc')).toBeNull()
  keepGiftTicket('12a1-ngoc', 've')
  expect(giftTicket('12a1-ngoc')).toBe('ve')
})
