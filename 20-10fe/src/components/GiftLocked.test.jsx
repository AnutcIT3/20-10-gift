import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import GiftLocked from './GiftLocked'

vi.mock('../api/giftRepository', () => ({ default: { getEventStatus: vi.fn() } }))

beforeEach(() => {
  // Mặc định máy chủ chưa trả lời: màn khoá dựa vào giờ hẹn kèm theo mã 423
  giftRepository.getEventStatus.mockReset().mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderLocked(props) {
  return render(<MemoryRouter><GiftLocked {...props} /></MemoryRouter>)
}

test('đã hẹn giờ: đếm tới từng giây, về 0 thì tự gọi mở quà đúng một lần', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T16:59:58.000Z'))
  const onUnlock = vi.fn()
  renderLocked({ unlockAt: '2026-10-19T17:00:00.000Z', serverNow: '2026-10-19T16:59:58.000Z', onUnlock })

  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Còn 0 giờ 0 phút 2 giây')
  act(() => { vi.advanceTimersByTime(2000) })
  expect(screen.getByText('Tới giờ rồi!')).toBeTruthy()
  // Hỏi lại máy chủ sau một khoảng ngẫu nhiên ≤ 1,5 giây, không dồn cả lớp vào một khắc
  act(() => { vi.advanceTimersByTime(1600) })
  expect(onUnlock).toHaveBeenCalledTimes(1)
})

test('đồng hồ điện thoại chạy nhanh vẫn đếm theo giờ máy chủ, không "mở" sớm', () => {
  vi.useFakeTimers()
  // Điện thoại nhanh hơn máy chủ 2 phút
  vi.setSystemTime(new Date('2026-10-19T17:01:00.000Z'))
  const onUnlock = vi.fn()
  renderLocked({ unlockAt: '2026-10-19T17:00:00.000Z', serverNow: '2026-10-19T16:59:00.000Z', onUnlock })

  expect(screen.getByText('Chưa đến ngày 20/10')).toBeTruthy()
  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Còn 0 giờ 1 phút 0 giây')
  act(() => { vi.advanceTimersByTime(5000) })
  expect(onUnlock).not.toHaveBeenCalled()
})

test('admin mở tay trong lúc bạn đang chờ: màn khoá tự nhận ra và mở quà', async () => {
  vi.useFakeTimers()
  giftRepository.getEventStatus.mockResolvedValue({ locked: false, unlockAt: null, serverNow: new Date().toISOString() })
  const onUnlock = vi.fn()
  renderLocked({ onUnlock })
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  expect(screen.getByText('Tới giờ rồi!')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
  expect(onUnlock).toHaveBeenCalledTimes(1)
})

test('admin hẹn giờ sau khi màn khoá đã mở: đồng hồ chuyển sang đếm tới giờ hẹn', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T16:59:00.000Z'))
  giftRepository.getEventStatus.mockResolvedValue({
    locked: true, unlockAt: '2026-10-19T17:00:00.000Z', serverNow: '2026-10-19T16:59:00.000Z',
  })
  renderLocked({})
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  expect(screen.getByText(/Món quà sẽ tự mở lúc/)).toBeTruthy()
  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Còn 0 giờ 1 phút 0 giây')
})

test('chưa hẹn giờ thì đếm theo phút tới 20/10 và không tự tải lại', () => {
  renderLocked({})
  expect(screen.getByText(/Hãy quay lại vào dịp 20\/10/)).toBeTruthy()
  expect(screen.getByRole('timer').getAttribute('aria-label')).not.toMatch(/giây/)
})
