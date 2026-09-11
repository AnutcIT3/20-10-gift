import { useEffect, useRef, useState } from 'react'
import giftRepository from '../api/giftRepository'
import {
  HINTS,
  INITIAL_VOTES,
  MAX_FRAME_WIDTH,
  NO_NETWORK_TROUBLE,
  RETRYABLE_STOPS,
  SCAN_TIMEOUT_MS,
  STOP_MESSAGES,
  STOP_TITLES,
  TICK_MS,
  addNetworkFailure,
  frameErrorKind,
  isTooDark,
  makeScanToken,
  meanLuma,
  networkGaveUp,
  remainingSeconds,
  tallyVotes,
  timeoutKind,
} from '../lib/faceVote'

const METER_SIZE = 32                 // canvas đo sáng 32×32, lấy luma vùng giữa 16×16
const HAVE_CURRENT_DATA = 2           // video.readyState đủ để vẽ được một khung
const MAX_CLAIM_TOKENS = 10           // khớp giới hạn ghép tên của backend

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

// Một lượt quét = một lần camera chạy (mở modal, "Quét lại", "Không phải mình").
// Mã lượt đi kèm mọi khung hình để admin xem lại lượt đó — chỉ con số, không ảnh.
function newScan() {
  return {
    token: makeScanToken(),
    startedAt: 0,        // lúc camera chạy; 0 = camera chưa lên
    darkFrames: 0,       // nhịp tự bỏ vì quá tối, không gửi lên server
    concludedMs: null,   // ms tới lúc máy hỏi "Có phải cậu là…?"
    matchId: null,       // khung hình được đem ra hỏi
    ended: false,
  }
}

// Báo lượt quét kết thúc thế nào — đúng một lần mỗi lượt. Lượt chưa thành giữ
// lại mã để ghép tên nếu ngay sau đó người dùng mở quà. Lỗi mạng bỏ qua: đây
// chỉ là lịch sử, không được chen vào đường tới trang quà.
function reportScanEnd(scan, unclaimed, outcome) {
  if (!scan || scan.ended) return
  scan.ended = true
  if (outcome !== 'confirmed') {
    unclaimed.push(scan.token)
    if (unclaimed.length > MAX_CLAIM_TOKENS) unclaimed.shift()
  }
  const durationMs = scan.concludedMs ?? (scan.startedAt ? Date.now() - scan.startedAt : null)
  giftRepository.faceScanEnd(scan.token, {
    outcome,
    durationMs,
    darkFrames: scan.darkFrames,
    ...(scan.matchId ? { matchId: scan.matchId } : {}),
  }).catch(() => {})
}

/**
 * Máy quét Face ID: mở camera, mỗi TICK_MS đo sáng rồi gửi một khung lên
 * /api/face/match (không bao giờ chồng request), đếm phiếu cho tới khi hai
 * khung liên tiếp cùng chỉ một người → dừng camera, đưa ứng viên ra hỏi.
 *
 * Trả về `open/close` (hook tự giữ cờ active để reset trạng thái đúng lúc mở),
 * `accept/deny/retry` cho màn xác nhận, `claim` để ghép tên vào các lượt chưa
 * thành khi quà được mở, và `videoRef` gắn vào <video>.
 * Stream, interval, AbortController, phiếu bầu, lượt quét nằm trong ref — không phải state.
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
  // Những người vừa bị bấm "Không phải mình" trong lần mở modal này — khớp
  // với họ coi như không khớp, để máy không hỏi lại đúng cái tên sai đó
  const excludedRef = useRef([])
  const inFlightRef = useRef(false)
  const meterCanvasRef = useRef(null)
  const frameCanvasRef = useRef(null)
  const scanRef = useRef(null)
  // Mã các lượt chưa thành trong lần mở trang này, chờ ghép tên
  const unclaimedRef = useRef([])

  useEffect(() => {
    if (!active) return undefined
    let done = false          // phiên này đã nhả camera (kết luận, dừng, hoặc dọn dẹp)
    let startedAt = Date.now()
    let trouble = NO_NETWORK_TROUBLE   // chuỗi khung liên tiếp không có phản hồi
    let pendingSince = null            // lúc gửi khung đang chờ phản hồi
    votesRef.current = INITIAL_VOTES
    const scan = newScan()
    scanRef.current = scan
    const unclaimed = unclaimedRef.current

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
      reportScanEnd(scan, unclaimed, kind)
      setState((current) => ({ ...current, status: 'stopped', kind, message: STOP_MESSAGES[kind], candidate: null }))
    }

    // Chưa khép lượt ở đây: lượt kết thúc khi người dùng trả lời câu hỏi
    const conclude = (candidate) => {
      if (done) return
      release()
      scan.concludedMs = Date.now() - startedAt
      scan.matchId = candidate.matchId
      setState((current) => ({ ...current, status: 'confirm', candidate, hint: '' }))
    }

    const send = async (blob, t) => {
      const controller = new AbortController()
      controllerRef.current = controller
      const sentAt = Date.now()
      pendingSince = sentAt
      try {
        const result = await giftRepository.matchFace(blob, {
          signal: controller.signal, scan: scan.token, t,
        })
        if (done) return
        trouble = NO_NETWORK_TROUBLE
        const { votes, hint, conclusion, giveUp } = tallyVotes(votesRef.current, result, excludedRef.current)
        votesRef.current = votes
        if (conclusion) conclude(conclusion)
        // Nhìn rõ mặt vài giây mà không khớp ai: dừng ngay, khỏi chờ hết giờ
        else if (giveUp) finish('unrecognized')
        else setHint(hint)
      } catch (err) {
        if (done || controller.signal.aborted) return
        // 400/413/500 chỉ là một khung hỏng → quét tiếp; 503/429 thì dừng.
        // Khung mất trên đường truyền thì bỏ qua, nhịp sau gửi khung mới — chỉ
        // dừng khi mạng hỏng đủ lâu, và nói đúng là do mạng
        const kind = frameErrorKind(err)
        if (kind === 'network') {
          trouble = addNetworkFailure(trouble, sentAt)
          if (networkGaveUp(trouble, Date.now())) finish('network')
          else setHint(HINTS.slowNetwork)
        } else if (kind) {
          finish(kind)
        }
      } finally {
        pendingSince = null
        if (controllerRef.current === controller) controllerRef.current = null
        inFlightRef.current = false
      }
    }

    const tick = () => {
      if (done) return
      const now = Date.now()
      const left = remainingSeconds(startedAt, now)
      if (left <= 0) { finish(timeoutKind(trouble, pendingSince, now)); return }
      setState((current) => (current.secondsLeft === left ? current : { ...current, secondsLeft: left }))
      // Không bao giờ chồng request: còn khung đang bay thì bỏ qua nhịp này
      if (inFlightRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < HAVE_CURRENT_DATA || !video.videoWidth) return

      meterCanvasRef.current ||= makeCanvas(METER_SIZE, METER_SIZE)
      if (isTooDark(measureLuma(video, meterCanvasRef.current))) {
        scan.darkFrames += 1
        setHint(HINTS.darkLocal)
        return
      }

      inFlightRef.current = true
      frameCanvasRef.current ||= makeCanvas(MAX_FRAME_WIDTH, MAX_FRAME_WIDTH)
      captureFrame(video, frameCanvasRef.current).then((blob) => {
        if (done || !blob) { inFlightRef.current = false; return undefined }
        return send(blob, now - startedAt)
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
      scan.startedAt = startedAt
      setState((current) => ({ ...current, status: 'scanning', hint: HINTS.scanning, secondsLeft: SCAN_TIMEOUT_MS / 1000 }))
      intervalRef.current = setInterval(tick, TICK_MS)
    }

    // Rời tab thì tắt camera ngay — không quét ngầm khi người dùng không nhìn
    const onVisibility = () => {
      if (document.hidden) finish('hidden')
    }
    // Đóng tab / rời trang khi lượt chưa có kết quả (kể cả đang ở câu hỏi
    // "Có phải cậu là…?"): báo "đóng" — faceScanEnd dùng keepalive nên kịp gửi
    const onPageHide = () => {
      if (scan.startedAt) reportScanEnd(scan, unclaimed, 'closed')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    start()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      release()
      // Đóng modal, đổi vai trò, rời trang chủ khi lượt chưa có kết quả. Camera
      // chưa kịp lên thì chưa có gì để ghi — đó cũng là lần chạy thử của StrictMode
      if (scan.startedAt) reportScanEnd(scan, unclaimed, 'closed')
    }
  }, [active, session])

  const open = () => {
    excludedRef.current = []
    setState({ ...IDLE, status: 'starting', hint: HINTS.starting })
    setActive(true)
  }

  // Effect cleanup nhả camera; trạng thái cũ giữ lại nhưng không hiện vì !active
  const close = () => setActive(false)

  const restart = () => {
    setState({ ...IDLE, status: 'starting', hint: HINTS.starting })
    setSession((current) => current + 1)
  }

  // "Đúng là mình": khép lượt (không chờ), đóng modal, trả ứng viên để trang
  // chủ chạy openGiftWithReveal
  const accept = () => {
    const { candidate } = state
    if (!candidate) return null
    reportScanEnd(scanRef.current, unclaimedRef.current, 'confirmed')
    setActive(false)
    return candidate
  }

  // "Không phải mình": khép lượt, loại người đó khỏi lượt quét tiếp, quét lại
  const deny = () => {
    const { candidate } = state
    if (candidate) {
      excludedRef.current = [...excludedRef.current, candidate.studentId]
      reportScanEnd(scanRef.current, unclaimedRef.current, 'denied')
    }
    restart()
  }

  // Quà vừa được mở (gõ tên, hay Face ID sau vài lượt hỏng): ghép người đó vào
  // các lượt chưa thành trong lần mở trang này — admin biết ai hay bị nhận
  // không ra. Backend chỉ nhận lượt trong 30 phút gần nhất.
  const claim = (accessCode) => {
    const tokens = unclaimedRef.current.splice(0)
    if (tokens.length && accessCode) giftRepository.faceScanClaim(tokens, accessCode).catch(() => {})
  }

  return {
    active,
    status: active ? state.status : 'idle',
    hint: state.hint,
    kind: state.kind,
    message: state.message,
    title: STOP_TITLES[state.kind] || '',
    candidate: state.candidate,
    secondsLeft: state.secondsLeft,
    canRetry: state.status === 'stopped' && RETRYABLE_STOPS.includes(state.kind),
    videoRef,
    open,
    close,
    accept,
    deny,
    retry: restart,
    claim,
  }
}

export default useFaceScan
