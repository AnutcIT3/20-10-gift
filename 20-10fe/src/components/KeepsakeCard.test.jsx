import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import KeepsakeCard from './KeepsakeCard'

vi.mock('../api/giftRepository', () => ({ default: { downloadKeepsake: vi.fn() } }))

const saved = []

beforeEach(() => {
  saved.length = 0
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:keepsake')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    saved.push(this.download)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('tải bản lưu PDF và đặt tên file .pdf', async () => {
  giftRepository.downloadKeepsake.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
  render(<KeepsakeCard accessCode="12a1-vy" studentName="Thúy Vy" greeting="Chúc Vy vui" />)
  expect(screen.getByText(/tải bản lưu pdf về để lưu giữ làm kỉ niệm/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '💾 Tải bản lưu' }))
  expect(await screen.findByText('qua-20-10-thuy-vy.pdf')).toBeTruthy()
  expect(saved).toEqual(['qua-20-10-thuy-vy.pdf'])
  expect(giftRepository.downloadKeepsake).toHaveBeenCalledWith('12a1-vy', 'Chúc Vy vui')
})

test('máy chủ không in được PDF mà trả HTML thì file giữ đuôi .html cho mở được', async () => {
  giftRepository.downloadKeepsake.mockResolvedValue(new Blob(['<!doctype html>'], { type: 'text/html; charset=utf-8' }))
  render(<KeepsakeCard accessCode="12a1-vy" studentName="Thúy Vy" />)
  fireEvent.click(screen.getByRole('button', { name: '💾 Tải bản lưu' }))
  expect(await screen.findByText('qua-20-10-thuy-vy.html')).toBeTruthy()
  expect(saved).toEqual(['qua-20-10-thuy-vy.html'])
})
