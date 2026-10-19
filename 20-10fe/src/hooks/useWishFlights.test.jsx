import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import useWishFlights from './useWishFlights'
import { heapSpot, sentAgo } from '../lib/wishHeap'

beforeEach(() => {
  vi.useFakeTimers()
  window.matchMedia = vi.fn(() => ({ matches: false }))
})
afterEach(() => vi.useRealTimers())

const settle = () => act(() => { vi.runOnlyPendingTimers() })

test('lần đầu đặt thẳng số hiện tại; số tăng thì từng lá bay vào rồi mới cộng', () => {
  const { result, rerender } = renderHook(({ target }) => useWishFlights(target), { initialProps: { target: 24 } })
  settle()
  expect(result.current.landed).toBe(24)
  expect(result.current.flights).toEqual([])

  rerender({ target: 26 })
  settle()
  expect(result.current.landed).toBe(24)
  expect(result.current.flights).toHaveLength(2)
  act(() => result.current.land(result.current.flights[0].id))
  expect(result.current.landed).toBe(25)
  act(() => result.current.land(result.current.flights[0].id))
  expect(result.current.landed).toBe(26)
})

test('nhiều lời chúc cùng lúc: chỉ vài lá bay, phần dư đặt thẳng; số giảm thì đặt lại không bay', () => {
  const { result, rerender } = renderHook(({ target }) => useWishFlights(target), { initialProps: { target: 20 } })
  settle()
  rerender({ target: 32 })
  settle()
  expect(result.current.flights).toHaveLength(5)
  expect(result.current.landed).toBe(27)

  rerender({ target: 21 })
  settle()
  expect(result.current.landed).toBe(21)
  expect(result.current.flights).toEqual([])
})

test('đang mở khung gửi lời chúc thì chờ, đóng rồi mới bay; máy giảm chuyển động thì cộng thẳng', () => {
  const { result, rerender } = renderHook(({ target, paused }) => useWishFlights(target, { paused }), {
    initialProps: { target: 24, paused: false },
  })
  settle()
  rerender({ target: 25, paused: true })
  settle()
  expect(result.current.flights).toEqual([])
  rerender({ target: 25, paused: false })
  settle()
  expect(result.current.flights).toHaveLength(1)

  window.matchMedia = vi.fn(() => ({ matches: true }))
  rerender({ target: 30, paused: false })
  settle()
  expect(result.current.landed).toBe(30)
  expect(result.current.flights).toEqual([])
})

test('chỗ của từng lá cố định theo thứ tự; dòng "vừa xong" theo thời gian, quá 24 giờ thì ẩn', () => {
  expect(heapSpot(7)).toEqual(heapSpot(7))
  expect(heapSpot(7)).not.toEqual(heapSpot(8))
  const now = Date.parse('2026-10-19T12:00:00Z')
  expect(sentAgo('2026-10-19T11:59:40Z', now)).toBe('vừa xong')
  expect(sentAgo('2026-10-19T11:48:00Z', now)).toBe('12 phút trước')
  expect(sentAgo('2026-10-19T09:00:00Z', now)).toBe('3 giờ trước')
  expect(sentAgo('2026-10-18T11:00:00Z', now)).toBeNull()
  expect(sentAgo(null, now)).toBeNull()
})
