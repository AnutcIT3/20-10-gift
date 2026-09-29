import { describe, expect, it } from 'vitest'
import { formatClock, serverOffset, splitDuration } from './event'

describe('đếm ngược 20/10', () => {
  it('tách khoảng thời gian thành ngày, giờ, phút, giây và không bao giờ âm', () => {
    const ms = ((((2 * 24 + 3) * 60 + 4) * 60) + 5) * 1000 + 999
    expect(splitDuration(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
    expect(splitDuration(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('ghi giờ tự mở kiểu "00:00 · 20/10" theo giờ máy người xem', () => {
    expect(formatClock(new Date(2026, 9, 20, 0, 0))).toBe('00:00 · 20/10')
    expect(formatClock('không phải ngày')).toBe('')
  })

  it('đo độ lệch đồng hồ so với máy chủ, bù nửa độ trễ mạng', () => {
    const server = Date.parse('2026-10-19T17:00:10.000Z')
    const sentAt = Date.parse('2026-10-19T17:00:00.000Z')
    // Điện thoại chạy chậm 10 giây, gói tin đi về mất 200 ms
    expect(serverOffset(new Date(server).toISOString(), sentAt - 100, sentAt + 100)).toBe(10_000)
    expect(serverOffset(undefined, sentAt)).toBe(0)
  })
})
