import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import MusicPlayer from '../components/MusicPlayer'
import { pauseMusic, playMusic, resetMusicForTests, toggleMusic } from './music'

// Thẻ audio giả: đếm số thẻ được tạo và số lần play() — jsdom không phát nhạc
const audios = []
class FakeAudio {
  constructor() {
    this.paused = true
    this.plays = 0
    this.listeners = {}
    this.resolvePlay = null
    this.manual = FakeAudio.manual
    audios.push(this)
  }

  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener) }

  fire(type) { (this.listeners[type] || []).forEach((listener) => listener()) }

  play() {
    this.plays += 1
    this.paused = false
    if (FakeAudio.blocked) {
      this.paused = true
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    }
    if (this.manual) return new Promise((resolve, reject) => { this.resolvePlay = resolve; this.rejectPlay = reject })
    this.fire('playing')
    return Promise.resolve()
  }

  pause() {
    if (this.paused) return
    this.paused = true
    // Như trình duyệt: dừng khi play() còn đang chờ thì play() bị huỷ
    this.rejectPlay?.(new DOMException('aborted', 'AbortError'))
    this.fire('pause')
  }
}

beforeEach(() => {
  audios.length = 0
  FakeAudio.blocked = false
  FakeAudio.manual = false
  vi.stubGlobal('Audio', FakeAudio)
  resetMusicForTests()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const renderPlayer = (path = '/') => render(<MemoryRouter initialEntries={[path]}><MusicPlayer /></MemoryRouter>)

test('cả trang chỉ có MỘT thẻ nhạc: bấm Bật nhạc rồi Face ID tự bật không phát lại, không chồng tiếng', async () => {
  renderPlayer()
  fireEvent.click(screen.getByRole('button', { name: 'Phát nhạc' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Tạm dừng nhạc' })).toHaveTextContent('Tạm dừng')

  // Face ID nhận ra bạn khi nhạc đang phát: không tạo thẻ mới, không play() lại
  await act(() => playMusic())
  await act(() => playMusic())
  expect(audios).toHaveLength(1)
  expect(audios[0].plays).toBe(1)
})

test('Face ID tự bật nhạc thì nút cũng chuyển sang "Tạm dừng", bấm là dừng hẳn', async () => {
  renderPlayer()
  await act(() => playMusic())
  const button = screen.getByRole('button', { name: 'Tạm dừng nhạc' })
  expect(button).toHaveTextContent('Tạm dừng')
  fireEvent.click(button)
  expect(audios[0].paused).toBe(true)
  expect(screen.getByRole('button', { name: 'Phát nhạc' })).toHaveTextContent('Bật nhạc')
})

test('bấm liên tiếp lúc nhạc đang tải: chỉ một lần play(), bấm lần hai là huỷ — không phát ngầm sau đó', async () => {
  FakeAudio.manual = true
  renderPlayer()
  const button = screen.getByRole('button', { name: 'Phát nhạc' })
  fireEvent.click(button)
  playMusic()   // Face ID cùng lúc
  expect(screen.getByRole('button')).toHaveTextContent('Đang tải…')
  expect(audios[0].plays).toBe(1)
  fireEvent.click(screen.getByRole('button'))
  await flush()
  expect(audios[0].paused).toBe(true)
  expect(screen.getByRole('button', { name: 'Phát nhạc' })).toHaveTextContent('Bật nhạc')
})

test('nhạc tải xong sau khi đã bấm dừng thì tự dừng lại', async () => {
  FakeAudio.manual = true
  playMusic()
  const audio = audios[0]
  const resolve = audio.resolvePlay
  audio.rejectPlay = null    // trình duyệt này không huỷ play() đang chờ
  toggleMusic()
  audio.paused = false       // ...và vẫn phát khi tải xong
  await act(async () => { resolve(); await Promise.resolve(); await Promise.resolve() })
  expect(audio.paused).toBe(true)
})

test('trình duyệt chặn phát thì nút trở về "Bật nhạc", bấm lại được', async () => {
  FakeAudio.blocked = true
  renderPlayer()
  fireEvent.click(screen.getByRole('button', { name: 'Phát nhạc' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Phát nhạc' })).toHaveTextContent('Bật nhạc')
  FakeAudio.blocked = false
  fireEvent.click(screen.getByRole('button', { name: 'Phát nhạc' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Tạm dừng nhạc' })).toBeTruthy()
  expect(audios).toHaveLength(1)
})

test('vào trang admin thì nhạc dừng và nút ẩn', async () => {
  await act(() => playMusic())
  renderPlayer('/admin')
  expect(audios[0].paused).toBe(true)
  expect(screen.queryByRole('button')).toBeNull()
  pauseMusic()
})
