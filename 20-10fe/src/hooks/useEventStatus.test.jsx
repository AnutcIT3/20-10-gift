import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import useEventStatus from './useEventStatus'

vi.mock('../api/giftRepository', () => ({ default: { getEventStatus: vi.fn() } }))

afterEach(cleanup)

const status = (locked) => ({ locked, unlockAt: locked ? '2026-10-19T17:00:00.000Z' : null, serverNow: '2026-10-19T17:00:00.000Z' })

test('"quà đã mở" bật khi trang thấy quà chuyển từ khoá sang mở, và tắt nếu quà bị khoá lại', async () => {
  giftRepository.getEventStatus
    .mockResolvedValueOnce(status(true))
    .mockResolvedValueOnce(status(false))
    .mockResolvedValueOnce(status(false))
    .mockResolvedValueOnce(status(true))
  const { result } = renderHook(() => useEventStatus())
  await waitFor(() => expect(result.current.status?.locked).toBe(true))
  expect(result.current.justOpened).toBe(false)

  await act(() => result.current.refresh())
  expect(result.current.justOpened).toBe(true)
  // Lần hỏi sau vẫn mở: giữ nguyên lời báo
  await act(() => result.current.refresh())
  expect(result.current.justOpened).toBe(true)
  // Admin khoá lại để sửa thư: không còn nói "quà đã mở"
  await act(() => result.current.refresh())
  expect(result.current.justOpened).toBe(false)
})

test('lỗi mạng giữ trạng thái cũ, không làm hỏng trang chủ', async () => {
  giftRepository.getEventStatus
    .mockResolvedValueOnce(status(false))
    .mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useEventStatus())
  await waitFor(() => expect(result.current.status?.locked).toBe(false))
  let returned
  await act(async () => { returned = await result.current.refresh() })
  expect(returned).toBeNull()
  expect(result.current.status?.locked).toBe(false)
})
