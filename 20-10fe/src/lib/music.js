import { useSyncExternalStore } from 'react'
import songUrl from '../music/co-hen-voi-thanh-xuan.mp3?url'

// Nhạc nền của cả trang: MỘT thẻ <audio> duy nhất. Nút "Bật nhạc" và Face ID
// (tự bật khi nhận ra bạn rồi đưa vào trang quà) đều điều khiển đúng thẻ này,
// nên không bao giờ có hai bản nhạc phát chồng lên nhau. Thẻ chỉ được tạo ở
// lần cần đầu tiên, preload none: chưa ai bật thì chưa tải file nhạc.
//
// `wanted` là ý muốn hiện tại (phát hay dừng). play() trong lúc đang phát hay
// đang chờ tải thì không làm gì — không phát lại từ đầu, không tạo bản thứ hai.

let audio = null
let wanted = false
let pending = null
// Đang phát tắt tiếng chờ tra tên xong (xem primeMusic)
let primed = false
let snapshot = { playing: false, loading: false }
const listeners = new Set()

function emit() {
  const playing = Boolean(audio && wanted && !audio.paused && !pending)
  const loading = Boolean(wanted && pending)
  if (playing === snapshot.playing && loading === snapshot.loading) return
  snapshot = { playing, loading }
  listeners.forEach((listener) => listener())
}

function getAudio() {
  if (audio) return audio
  audio = new Audio()
  audio.src = songUrl
  audio.loop = true
  audio.preload = 'none'
  // Dừng từ ngoài (nút media trên tai nghe, màn hình khoá điện thoại) cũng
  // là ý của người nghe: nút trên trang phải nói đúng như vậy
  audio.addEventListener('pause', () => {
    if (!pending) wanted = false
    emit()
  })
  audio.addEventListener('playing', emit)
  return audio
}

// Gọi ngay trong lúc bấm (click) để trình duyệt cho phát — iPhone chặn phát
// nhạc nếu play() chạy sau một lần chờ mạng
export function playMusic() {
  const element = getAudio()
  if (primed) {
    // Đã chạy tắt tiếng từ lúc bấm "Mở quà": bật tiếng, nghe từ đầu bài
    primed = false
    element.muted = false
    if (!wanted) element.currentTime = 0
  }
  wanted = true
  if (pending) return pending
  if (!element.paused) { emit(); return Promise.resolve() }
  // play() phải chạy ngay, không đợi qua một nhịp Promise
  let started
  try {
    started = element.play()
  } catch (error) {
    started = Promise.reject(error)
  }
  pending = Promise.resolve(started)
    .then(() => {
      pending = null
      // Người nghe đã bấm dừng trong lúc nhạc đang tải
      if (!wanted) element.pause()
    })
    .catch(() => {
      pending = null
      wanted = false
    })
    .finally(emit)
  emit()
  return pending
}

// Gõ tên rồi bấm "Mở quà": phải chờ máy chủ tra tên mới biết có mở quà không,
// mà iPhone chỉ cho phát nhạc NGAY trong cú bấm. Nên trong cú bấm, nhạc chạy
// tắt tiếng; tra ra trang quà thì playMusic() bật tiếng từ đầu bài, không ra
// thì releaseMusic() dừng hẳn. Đang phát sẵn thì không làm gì.
export function primeMusic() {
  if (wanted || primed || pending) return
  const element = getAudio()
  primed = true
  element.muted = true
  let started
  try {
    started = element.play()
  } catch (error) {
    started = Promise.reject(error)
  }
  pending = Promise.resolve(started)
    .then(() => {
      pending = null
      // Tra tên xong mà không mở quà, trong lúc nhạc còn đang tải
      if (!wanted && !primed) element.pause()
    })
    .catch(() => {
      pending = null
      wanted = false
      primed = false
      element.muted = false
    })
    .finally(emit)
}

export function releaseMusic() {
  if (!primed) return
  primed = false
  if (audio && !wanted) {
    audio.pause()
    audio.currentTime = 0
  }
  if (audio) audio.muted = false
  emit()
}

export function pauseMusic() {
  wanted = false
  primed = false
  if (audio) audio.muted = false
  if (audio && !audio.paused) audio.pause()
  emit()
}

export function toggleMusic() {
  return wanted ? pauseMusic() : playMusic()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => snapshot

export function useMusic() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Chỉ dùng trong test: bỏ thẻ audio cũ để mỗi test bắt đầu sạch
export function resetMusicForTests() {
  audio = null
  wanted = false
  pending = null
  primed = false
  snapshot = { playing: false, loading: false }
}
