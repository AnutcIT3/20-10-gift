import { useEffect, useRef, useState } from 'react'
import giftRepository from '../api/giftRepository'
import {
  HINTS,
  INITIAL_VOTES,
  MAX_FRAME_WIDTH,
  RETRYABLE_STOPS,
  SCAN_TIMEOUT_MS,
  STOP_MESSAGES,
  TICK_MS,
  isTooDark,
  meanLuma,
  remainingSeconds,
  stopKindFor,
  tallyVotes,
} from '../lib/faceVote'

const METER_SIZE = 32                 // canvas đo sáng 32×32, lấy luma vùng giữa 16×16
const HAVE_CURRENT_DATA = 2           // video.readyState đủ để vẽ được một khung

const IDLE = Object.freeze({
  status: 'idle',      // 'idle' | 'starting' | 'scanning' | 'confirm' | 'stopped'
  hint: '',
  kind: null,          // lý do dừng khi status === 'stopped'
  message: '',
  candidate: null,     // { matchId, studentId, giftPath, displayName, score, margin } khi 'confirm'
  secondsLeft: SCAN_TIMEOUT_MS / 1000,
})

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

// Luma trung bình vùng giữa khung — tối quá thì nhắc tại chỗ, không gửi lên server
function measureLuma(video, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, METER_SIZE, METER_SIZE)
  const quarter = METER_SIZE / 4
  const { data } = ctx.getImageData(quarter, quarter, METER_SIZE / 2, METER_SIZE / 2)
  return meanLuma(data)
}

// Khung hình gửi đi: thu về ≤ 480 px, JPEG 0.8 — đủ cho detector, nhẹ cho 4G
function captureFrame(video, canvas) {
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

/**
 * Máy quét Face ID: mở camera, mỗi TICK_MS đo sáng rồi gửi một khung lên
 * /api/face/match (không bao giờ chồng request), đếm phiếu cho tới khi hai
 * khung liên tiếp cùng chỉ một người → dừng camera, đưa ứng viên ra hỏi.
 *
 * Trả về `open/close` (hook tự giữ cờ active để reset trạng thái đúng lúc mở),
 * `accept/deny/retry` cho màn xác nhận, và `videoRef` gắn vào <video>.
 * Stream, interval, AbortController, phiếu bầu nằm trong ref — không phải state.
 * Camera được nhả khi: đóng modal, Esc (qua close), rời tab, đổi vai trò, unmount.
 */
function useFaceScan() {
  const [active, setActive] = useState(false)
  // Mỗi lần "Không phải mình"/"Quét lại" tăng session → effect chạy lại từ đầu
  const [session, setSession] = useState(0)
  const [state, setState] = useState(IDLE)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const controllerRef = useRef(null)
  const votesRef = useRef(INITIAL_VOTES)
  const inFlightRef = useRef(false)
  const meterCanvasRef = useRef(null)
  const frameCanvasRef = useRef(null)

  useEffect(() => {
    if (!active) return undefined
    let done = false          // phiên này đã nhả camera (kết luận, dừng, hoặc dọn dẹp)
    let startedAt = Date.now()
    votesRef.current = INITIAL_VOTES

    const release = () => {
      done = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      controllerRef.current?.abort()
      controllerRef.current = null
      stopTracks(streamRef.current)
      streamRef.current = null
      inFlightRef.current = false
      if (videoRef.current) videoRef.current.srcObject = null
    }

    const setHint = (hint) => {
      setState((current) => (current.hint === hint ? current : { ...current, hint }))
    }

    const finish = (kind) => {
      if (done) return
      release()
      setState((current) => ({ ...current, status: 'stopped', kind, message: STOP_MESSAGES[kind], candidate: null }))
    }

    const conclude = (candidate) => {
      if (done) return
      release()
      setState((current) => ({ ...current, status: 'confirm', candidate, hint: '' }))
    }

    const send = async (blob) => {
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const result = await giftRepository.matchFace(blob, { signal: controller.signal, timeout: 6000 })
        if (done) return
        const { votes, hint, conclusion } = tallyVotes(votesRef.current, result)
        votesRef.current = votes
        if (conclusion) conclude(conclusion)
        else setHint(hint)
      } catch (err) {
        if (done || controller.signal.aborted) return
        // 400/413/500 chỉ là một khung hỏng → quét tiếp; 503/mất mạng/429 thì dừng
        const kind = stopKindFor(err)
        if (kind) finish(kind)
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
        inFlightRef.current = false
      }
    }

    const tick = () => {
      if (done) return
      const left = remainingSeconds(startedAt, Date.now())
      if (left <= 0) { finish('timeout'); return }
      setState((current) => (current.secondsLeft === left ? current : { ...current, secondsLeft: left }))
      // Không bao giờ chồng request: còn khung đang bay thì bỏ qua nhịp này
      if (inFlightRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < HAVE_CURRENT_DATA || !video.videoWidth) return

      meterCanvasRef.current ||= makeCanvas(METER_SIZE, METER_SIZE)
      if (isTooDark(measureLuma(video, meterCanvasRef.current))) {
        setHint(HINTS.darkLocal)
        return
      }

      inFlightRef.current = true
      frameCanvasRef.current ||= makeCanvas(MAX_FRAME_WIDTH, MAX_FRAME_WIDTH)
      captureFrame(video, frameCanvasRef.current).then((blob) => {
        if (done || !blob) { inFlightRef.current = false; return undefined }
        return send(blob)
      })
    }

    const start = async () => {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 } },
        })
      } catch {
        finish('camera')
        return
      }
      if (done) { stopTracks(stream); return }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.play?.()?.catch?.(() => {})
      }
      startedAt = Date.now()
      setState((current) => ({ ...current, status: 'scanning', hint: HINTS.scanning, secondsLeft: SCAN_TIMEOUT_MS / 1000 }))
      intervalRef.current = setInterval(tick, TICK_MS)
    }

    // Rời tab thì tắt camera ngay — không quét ngầm khi người dùng không nhìn
    const onVisibility = () => {
      if (document.hidden) finish('hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active, session])

  const open = () => {
    setState({ ...IDLE, status: 'starting', hint: HINTS.starting })
    setActive(true)
  }

  // Effect cleanup nhả camera; trạng thái cũ giữ lại nhưng không hiện vì !active
  const close = () => setActive(false)

  const restart = () => {
    setState({ ...IDLE, status: 'starting', hint: HINTS.starting })
    setSession((current) => current + 1)
  }

  // "Đúng là mình": báo server (không chờ), đóng modal, trả ứng viên để trang
  // chủ chạy openGiftWithReveal
  const accept = () => {
    const { candidate } = state
    if (!candidate) return null
    giftRepository.faceConfirm(candidate.matchId, true).catch(() => {})
    setActive(false)
    return candidate
  }

  // "Không phải mình": báo server, xóa phiếu, mở camera quét lại từ đầu
  const deny = () => {
    const { candidate } = state
    if (candidate) giftRepository.faceConfirm(candidate.matchId, false).catch(() => {})
    restart()
  }

  return {
    active,
    status: active ? state.status : 'idle',
    hint: state.hint,
    kind: state.kind,
    message: state.message,
    candidate: state.candidate,
    secondsLeft: state.secondsLeft,
    canRetry: state.status === 'stopped' && RETRYABLE_STOPS.includes(state.kind),
    videoRef,
    open,
    close,
    accept,
    deny,
    retry: restart,
  }
}

export default useFaceScan
