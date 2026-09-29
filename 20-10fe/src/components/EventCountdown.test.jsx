import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import EventCountdown from './EventCountdown'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('về 0 thì hỏi lại máy chủ đúng một lần, dù trang cha render lại liên tục với callback mới', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T17:00:01.000Z'))
  const calls = []
  const { rerender } = render(
    <EventCountdown unlockAt="2026-10-19T17:00:00.000Z" onDone={() => calls.push(0)} />,
  )
  expect(screen.getByText('Tới giờ rồi! Đang mở quà…')).toBeTruthy()

  // Người dùng đang gõ lời chúc: trang chủ render lại mỗi 100 ms với hàm mới
  for (let tick = 1; tick <= 25; tick += 1) {
    act(() => { vi.advanceTimersByTime(100) })
    rerender(<EventCountdown unlockAt="2026-10-19T17:00:00.000Z" onDone={() => calls.push(tick)} />)
  }
  // Lượt hỏi đã hẹn (≤ 2 giây) vẫn chạy, và chạy bằng callback mới nhất
  expect(calls).toHaveLength(1)
  expect(calls[0]).toBeGreaterThan(0)
})

test('còn giờ thì đếm theo đồng hồ máy chủ đã bù lệch', () => {
  vi.useFakeTimers()
  // Điện thoại nhanh hơn máy chủ 90 giây
  vi.setSystemTime(new Date('2026-10-19T17:00:30.000Z'))
  render(<EventCountdown unlockAt="2026-10-19T17:00:00.000Z" offset={-90_000} onDone={() => {}} />)
  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Còn 0 giờ 1 phút 0 giây')
})
