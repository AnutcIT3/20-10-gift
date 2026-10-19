import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import ClassFlower from '../components/ClassFlower'
import EventCountdown from '../components/EventCountdown'
import GiftReveal from '../components/GiftReveal'
import Petals from '../components/paper/Petals'
import Envelope from '../components/paper/Envelope'
import Stamp from '../components/paper/Stamp'
import Postmark from '../components/paper/Postmark'
import PetalRain from '../components/PetalRain'
import PickedImages from '../components/PickedImages'
import WishHeap from '../components/WishHeap'
import useDialogA11y from '../hooks/useDialogA11y'
import useEventStatus from '../hooks/useEventStatus'
import useFaceScan from '../hooks/useFaceScan'
import useImagePicks, { MAX_WISH_IMAGES, WISH_IMAGE_ACCEPT } from '../hooks/useImagePicks'
import useNow from '../hooks/useNow'
import useWishFlights from '../hooks/useWishFlights'
import { CLASS_NAME, EVENT_YEAR, formatStamp } from '../lib/event'
import { CLD_TINY, cld } from '../lib/cloudinary'
import { greetingFor, greetNames, showCountdown } from '../lib/faceVote'
import { playMusic } from '../lib/music'
import { seatLabel } from '../lib/seat'
import { sentAgo } from '../lib/wishHeap'
import '../styles/landing.css'

// Đồng hồ về 0 mà máy chủ vẫn báo khoá (đồng hồ hai bên lệch nhau vài giây):
// hỏi lại mỗi 2 giây, tối đa 10 lần, rồi để nhịp hỏi 30 giây thường lo tiếp
const OPEN_RETRY_MS = 2000
const OPEN_RETRIES = 10

// Face-service có thể còn đang nạp model khi trang vừa mở (start-dev mở trình
// duyệt sau 4 giây): hỏi lại status sau 5 giây rồi 15 giây trước khi thôi
const FACE_STATUS_RETRIES_MS = [5000, 10000]

// Camera chỉ chạy trên HTTPS (hoặc localhost) và trình duyệt có getUserMedia
function cameraSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && Boolean(navigator.mediaDevices?.getUserMedia)
}

const EMPTY_WISH = {
  isAnonymous: false,
  senderName: '',
  receiverType: 'class',
  title: '',
  content: '',
  revealAt: '',
}
const MATCH_ROTATIONS = [-1, 0.8, -0.5]
// Lượt mở chờ ghi (xem GiftPage): kèm lúc tạo để một tab thử cũ được khôi
// phục vài ngày sau không lén góp cánh hoa
function pendingOpenFor(via) {
  return { via: via === 'face' ? 'face' : 'name', at: Date.now() }
}

function computeRevealLimits() {
  const now = Date.now()
  return {
    min: new Date(now + 5 * 60 * 1000).toISOString().slice(0, 16),
    max: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  }
}

// "20/10 · 00:00" từ giá trị datetime-local — hiện trên chip hẹn giờ
function formatReveal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function matchSubline(match) {
  const parts = []
  if (match.nickname && match.nickname !== match.displayName) parts.push(`"${match.nickname}"`)
  const seat = seatLabel(match.seatRow, match.seatCol)
  if (seat) parts.push(seat)
  return parts.join(' · ')
}

// Danh sách trùng tên: card trắng nghiêng xen kẽ, avatar kiểu tem
function MatchList({ matches, onPick, disabled = false }) {
  return (
    <div className="match-list" aria-live="polite">
      {matches.map((match, index) => {
        const subline = matchSubline(match)
        return (
          <button
            type="button"
            key={match.giftPath}
            className="match-card"
            style={{ '--rot': `${MATCH_ROTATIONS[index % MATCH_ROTATIONS.length]}deg`, '--delay': `${index * 0.1}s` }}
            disabled={disabled}
            onClick={() => onPick(match)}
          >
            <span className="match-card__avatar" aria-hidden="true">
              {/* Bản thu nhỏ 160px cắt theo khuôn mặt, không phải ảnh gốc vài MB */}
              {match.avatarUrl ? <img src={cld(match.avatarUrl, CLD_TINY)} alt="" /> : match.displayName.charAt(0)}
            </span>
            <span className="match-card__text">
              <b>{match.displayName}</b>
              {subline && <small>{subline}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Thời gian hiệu ứng mở quà lúc 00:00 (mưa cánh hoa, số "20.10")
const CELEBRATE_MS = 6000

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

// "✉ 24 lời chúc đã được gửi" và "Ai đó vừa gửi một lời chúc · 2 phút trước"
// (không lộ ai gửi, gửi cho ai — chỉ cho thấy đang có người chúc)
function WishStats({ shown, lastAt, offset = 0 }) {
  const now = useNow(30000)
  const ago = sentAgo(lastAt, now + offset)
  return (
    <div className="wish-stats">
      <span>✉ <b aria-live="polite">{shown}</b> lời chúc đã được gửi</span>
      {ago && <span className="wish-stats__recent">Ai đó vừa gửi một lời chúc · {ago}</span>}
    </div>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Hỏi "là ai" TRƯỚC khi nhập tên: khách trùng tên với thành viên lớp sẽ
  // không bao giờ bị tra danh sách rồi mở nhầm trang cá nhân của bạn ấy
  const [visitorRole, setVisitorRole] = useState(null) // 'classmate' | 'guest' | null
  const [name, setName] = useState('')
  const [matches, setMatches] = useState([])
  const [message, setMessage] = useState('')
  // Danh sách chỉ là gợi ý (gõ "Phượng" mà lớp chỉ có "Phương"): hỏi "có phải…"
  const [matchGuess, setMatchGuess] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Gift reveal state
  const [revealPath, setRevealPath] = useState(null)
  const [revealName, setRevealName] = useState('')
  const [revealStudent, setRevealStudent] = useState(null)
  // 'face' khi quà được mở bằng Face ID → GiftReveal thêm huy hiệu nhỏ
  const [revealVia, setRevealVia] = useState('')
  // Bạn thứ mấy của lớp mở quà (bông hoa 12A1) → GiftReveal và trang quà
  const [revealRank, setRevealRank] = useState(null)
  // Lượt mở chưa ghi được (mạng chập, hay trượt đúng khoảnh khắc quà mở):
  // GiftPage ghi bù một lần khi quà đã hiện ra
  const [revealPendingOpen, setRevealPendingOpen] = useState(null)

  // Ngày 20/10: đếm ngược tới giờ tự mở, bông hoa 12A1, số thư hồi âm
  const {
    status: eventStatus,
    offset: eventOffset,
    justOpened,
    refresh: refreshEvent,
  } = useEventStatus()

  // Face ID: thẻ ✨ chỉ hiện khi admin bật, service sống, đã có hồ sơ và máy
  // có camera trên kết nối an toàn. Thiếu một điều kiện → thẻ không hề xuất hiện.
  // Hai nhóm quét riêng: thành viên lớp ('class') và khách ngoài lớp
  // ('friend') — mỗi nhóm chỉ so với thư viện khuôn mặt của mình. Ghi nhớ
  // nhóm nào đã sẵn sàng, để đổi vai trò không mượn kết quả của nhóm kia.
  const faceScope = visitorRole === 'guest' ? 'friend' : 'class'
  const [faceReadyScope, setFaceReadyScope] = useState(null)
  // Trang quà đang khoá chờ 20/10: trang chủ chỉ còn đếm ngược và gửi lời
  // chúc — không chọn vai trò, không tra tên, không Face ID (máy chủ cũng chặn)
  const giftsLocked = Boolean(eventStatus?.locked)
  // 00:00 — chính trang này thấy quà chuyển từ khoá sang mở: dấu "20.10" vỡ,
  // phong bì mở ra lá thư chúc mừng, mưa cánh hoa và số mờ thành "20.10" vài giây
  const [celebrating, setCelebrating] = useState(false)
  useEffect(() => {
    if (!justOpened) return undefined
    const start = setTimeout(() => setCelebrating(true), 0)
    const stop = setTimeout(() => setCelebrating(false), CELEBRATE_MS)
    return () => { clearTimeout(start); clearTimeout(stop) }
  }, [justOpened])
  // Số lời chúc (đã cộng sẵn số khởi đầu ở máy chủ): máy chủ báo mỗi 15 giây;
  // chính mình vừa gửi thì dùng luôn số trả về để thư bay vào ngay
  const [ownWishNumber, setOwnWishNumber] = useState(null)
  const serverWishes = eventStatus?.wishes
  const wishTarget = serverWishes ? Math.max(serverWishes.shown, ownWishNumber || 0) : null
  const faceAvailable = !giftsLocked && visitorRole !== null && faceReadyScope === faceScope
  // Destructure ngay tại đây: videoRef là ref, phần còn lại là giá trị render —
  // gộp chung một object thì React Compiler coi mọi lần đọc thuộc tính là đọc ref
  const {
    active: faceActive,
    status: faceStatus,
    hint: faceHint,
    kind: faceKind,
    message: faceMessage,
    title: faceTitle,
    candidate: faceCandidate,
    people: facePeople,
    secondsLeft: faceSecondsLeft,
    canRetry: faceCanRetry,
    videoRef: faceVideoRef,
    open: openFaceScan,
    close: closeFace,
    accept: acceptFace,
    deny: denyFace,
    retry: retryFace,
    claim: claimFaceScans,
  } = useFaceScan({ scope: faceScope })

  // Link "gửi lời chúc" từ màn khóa 20/10 mở thẳng modal (/?wish=1)
  const [wishOpen, setWishOpen] = useState(() => searchParams.get('wish') === '1')
  const [wishForm, setWishForm] = useState(EMPTY_WISH)
  // Ảnh kèm lời chúc: chọn một lúc nhiều ảnh, tối đa 4
  const wishImages = useImagePicks()
  // Người nhận: tích chọn các bạn trong lớp (và cô) từ danh sách; bạn ngoài lớp
  // thì gõ tên rồi thêm. Danh sách tải khi mở khung gửi lời chúc.
  const [recipientOptions, setRecipientOptions] = useState(null)
  const [recipientLoadError, setRecipientLoadError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [friendRecipients, setFriendRecipients] = useState([])
  const [friendName, setFriendName] = useState('')
  const [wishError, setWishError] = useState('')
  const [wishSubmitting, setWishSubmitting] = useState(false)
  // Màn "Thư đã vào hộp!" thay nội dung modal sau khi gửi thành công
  const [wishSent, setWishSent] = useState(null)
  const [showReveal, setShowReveal] = useState(false)
  const [revealLimits, setRevealLimits] = useState(computeRevealLimits)
  const wishFileRef = useRef(null)

  const closeWish = () => {
    setWishOpen(false)
    if (searchParams.has('wish')) setSearchParams({}, { replace: true })
  }
  const wishDialogRef = useDialogA11y(wishOpen, closeWish)
  // Đang mở khung gửi lời chúc thì chờ; đóng rồi mới cho thư bay vào đống
  const { landed: wishesShown, flights: wishFlights, land: landWish } = useWishFlights(wishTarget, { paused: wishOpen })
  // Esc / bấm nền / nút × đều đi qua đây → hook nhả camera ngay
  const faceDialogRef = useDialogA11y(faceActive, closeFace)

  // Hỏi status khi đã chọn vai trò, theo đúng nhóm của vai trò đó; lỗi gì cũng
  // coi như tắt. setState chỉ chạy trong callback bất đồng bộ (quy tắc react-hooks v7).
  useEffect(() => {
    if (!visitorRole || !cameraSupported()) return undefined
    let cancelled = false
    const timers = []
    const probe = async (attempt) => {
      try {
        const status = await giftRepository.faceStatus(faceScope)
        if (cancelled) return
        if (status?.enabled) {
          setFaceReadyScope(faceScope)
          return
        }
      } catch {
        // Thẻ tiếp tục ẩn — gõ tên vẫn là đường chính
      }
      if (cancelled) return
      const delay = FACE_STATUS_RETRIES_MS[attempt]
      if (delay !== undefined) timers.push(setTimeout(() => probe(attempt + 1), delay))
    }
    probe(0)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [visitorRole, faceScope])

  const clearWishImage = () => {
    wishImages.clear()
    if (wishFileRef.current) wishFileRef.current.value = ''
  }

  const chooseWishImages = (fileList) => {
    setWishError(wishImages.add(fileList))
    // Cho chọn lại đúng ảnh vừa bỏ
    if (wishFileRef.current) wishFileRef.current.value = ''
  }

  const resetWish = () => {
    setWishForm(EMPTY_WISH)
    setSelectedIds([])
    setFriendRecipients([])
    setFriendName('')
    clearWishImage()
    setWishError('')
    setWishSent(null)
    setShowReveal(false)
  }

  const openWish = () => {
    setRevealLimits(computeRevealLimits())
    resetWish()
    setWishOpen(true)
  }

  const accessCodeFromGiftPath = (giftPath) => giftPath.split('/').filter(Boolean).pop()

  const openGiftWithReveal = async (giftPath, displayName = '', via = '') => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    // Vừa quét Face ID chưa thành rồi mở được quà: báo cho lịch sử của admin
    // biết các lượt đó là của ai (không có lượt nào thì không gửi gì)
    claimFaceScans(accessCode)
    let studentData = null
    // Thành viên lớp tự mở quà (gõ tên hay Face ID) thì góp một cánh cho bông
    // hoa 12A1. Chạy song song với getGift; quà còn khoá thì máy chủ trả 423 và
    // không ghi gì. Lỗi gì cũng bỏ qua — hoa chỉ là phần trang trí.
    const opening = visitorRole === 'classmate' && accessCode
      ? giftRepository.recordOpen(accessCode, via === 'face' ? 'face' : 'name').catch(() => null)
      : Promise.resolve(null)

    try {
      studentData = accessCode ? await giftRepository.getGift(accessCode) : null
    } catch (err) {
      if (err?.status === 423) {
        // Trang quà đang khóa chờ 20/10 — bỏ hiệu ứng mở quà, đưa thẳng tới
        // màn "Chưa đến ngày" của GiftPage. Bạn trong lớp chờ ở đó tới giờ
        // hẹn thì quà tự mở: GiftPage ghi lượt mở giùm (pendingOpen) để bạn ấy
        // vẫn góp một cánh cho bông hoa và biết mình là bạn thứ mấy
        navigate(giftPath, visitorRole === 'classmate'
          ? { state: { pendingOpen: pendingOpenFor(via) } }
          : undefined)
        return
      }
      // Vẫn mở quà nếu không tải được thông tin chỗ ngồi.
    }

    const opened = await opening
    setRevealName(displayName || studentData?.nickname || studentData?.full_name || '')
    setRevealVia(via)
    setRevealRank(opened?.counted ? opened.rank : null)
    setRevealPendingOpen(visitorRole === 'classmate' && opened === null ? pendingOpenFor(via) : null)
    // Truyền student sang GiftReveal (sơ đồ lớp + thư bay từ đúng bàn) và sang
    // GiftPage qua router state để hero hiện ngay, không fetch lại
    setRevealStudent(studentData)
    setRevealPath(giftPath)
  }

  // Đồng hồ về 0: hỏi lại tới khi máy chủ báo quà đã mở. Mỗi lần hỏi làm
  // trang render lại; cờ này giữ cho chỉ MỘT vòng hỏi lại chạy tại một lúc
  const retryingRef = useRef(false)
  const handleCountdownDone = async () => {
    if (retryingRef.current) return
    retryingRef.current = true
    try {
      for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
        const status = await refreshEvent()
        if (status && !status.locked) return
        await new Promise((resolve) => { setTimeout(resolve, OPEN_RETRY_MS) })
      }
    } finally {
      retryingRef.current = false
    }
  }

  const openFace = () => {
    setError('')
    openFaceScan()
  }

  // "Đúng là mình": hook đã đóng modal và nhả camera; chạy hiệu ứng mở quà như
  // khi gõ tên (sơ đồ lớp, thư bay từ bàn), khóa 20/10 vẫn được tôn trọng
  // Face ID nhận ra bạn → nhạc nền tự bật. Gọi ngay trong cú bấm (trước mọi
  // await) để trình duyệt cho phát; đang phát sẵn thì không phát lại từ đầu
  const confirmFace = async () => {
    const candidate = acceptFace()
    if (!candidate) return
    playMusic()
    await openGiftWithReveal(candidate.giftPath, candidate.displayName, 'face')
  }

  // Cả nhóm cùng quét: chọn một thiệp là mở quà của bạn đó (tính cánh hoa cho
  // đúng bạn đó); những bạn còn lại quét hay gõ tên sau
  const chooseFace = async (person) => {
    const picked = acceptFace(person)
    if (!picked) return
    playMusic()
    await openGiftWithReveal(picked.giftPath, picked.displayName, 'face')
  }

  // Dừng quét → đóng modal và đưa con trỏ về ô gõ tên. Chờ một nhịp vì
  // useDialogA11y trả focus về nút ✨ ngay khi modal đóng.
  const typeNameInstead = () => {
    closeFace()
    setTimeout(() => document.getElementById('student-name')?.focus(), 0)
  }

  const wishLetterData = () => ({
    sender_name: wishForm.isAnonymous ? null : wishForm.senderName.trim(),
    title: wishForm.title.trim() || null,
    content: wishForm.content.trim(),
    is_anonymous: wishForm.isAnonymous,
    reveal_at: wishForm.revealAt || null,
  })

  const finishWish = ({ friend = false, sent = null, count = 1 } = {}) => {
    const number = Number.isInteger(sent?.wish_number) ? sent.wish_number : null
    if (number) setOwnWishNumber((current) => Math.max(current || 0, number))
    setSelectedIds([])
    setFriendRecipients([])
    setFriendName('')
    setWishSent({ revealAt: wishForm.revealAt || null, friend, number, count })
    setWishForm(EMPTY_WISH)
    clearWishImage()
    setShowReveal(false)
  }

  // Tải danh sách người nhận khi mở khung gửi lời chúc (một lần mỗi lượt mở)
  useEffect(() => {
    if (!wishOpen || recipientOptions) return undefined
    let cancelled = false
    giftRepository.listWishRecipients()
      .then((list) => { if (!cancelled) { setRecipientOptions(list || []); setRecipientLoadError('') } })
      .catch(() => { if (!cancelled) setRecipientLoadError('Không tải được danh sách các bạn — đóng khung rồi mở lại thử nhé.') })
    return () => { cancelled = true }
  }, [wishOpen, recipientOptions])

  const allIds = (recipientOptions || []).map((option) => option.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))
  const toggleRecipient = (id) => {
    setWishError('')
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  const toggleAll = () => {
    setWishError('')
    setSelectedIds(allSelected ? [] : allIds)
  }

  // Bạn ngoài lớp: gõ tên rồi thêm (bỏ trùng); hồ sơ khách tạo khi gửi
  const addFriend = () => {
    const name = friendName.trim()
    setWishError('')
    if (name.length < 2) {
      setWishError('Gõ tên bạn ngoài lớp (ít nhất 2 ký tự) rồi bấm thêm.')
      return null
    }
    const key = name.toLocaleLowerCase('vi')
    const next = friendRecipients.some((item) => item.key === key) ? friendRecipients : [...friendRecipients, { key, name }]
    setFriendRecipients(next)
    setFriendName('')
    return next
  }
  const removeFriend = (key) => setFriendRecipients((current) => current.filter((item) => item.key !== key))

  const submitWish = async (event) => {
    event.preventDefault()
    setWishError('')
    const content = wishForm.content.trim()
    const senderName = wishForm.senderName.trim()
    if (!wishForm.isAnonymous && !senderName) {
      setWishError('Vui lòng nhập tên người gửi hoặc chọn ẩn danh.')
      return
    }
    // Tên bạn ngoài lớp còn trong ô lúc bấm gửi cũng được tính
    let friends = friendRecipients
    if (friendName.trim()) {
      const next = addFriend()
      if (!next) return
      friends = next
    }
    if (!selectedIds.length && !friends.length) {
      setWishError('Chọn ít nhất một người nhận trong danh sách (hoặc thêm một bạn ngoài lớp).')
      return
    }
    if (!content) {
      setWishError('Vui lòng nhập lời chúc.')
      return
    }
    setWishSubmitting(true)
    try {
      const recipients = [...selectedIds.map((id) => ({ id })), ...friends.map((item) => ({ friend: item.name }))]
      const sent = await giftRepository.createWishes(recipients, wishLetterData(), wishImages.files)
      finishWish({ friend: friends.length > 0, sent, count: recipients.length })
    } catch (err) {
      if (err.status === 404) {
        // Danh sách cũ (có bạn vừa bị tắt trang): tải lại danh sách
        setRecipientOptions(null)
        setSelectedIds([])
      }
      setWishError(err.message || 'Không gửi được lời chúc.')
    } finally {
      setWishSubmitting(false)
    }
  }

  const chooseRole = (role) => {
    // Camera không bao giờ sống lâu hơn bước "thành viên trong lớp"
    closeFace()
    setVisitorRole(role)
    setError('')
    setMatches([])
    setMessage('')
  }

  // Trang quà bị khoá giữa chừng: bỏ bước đang dở (vai trò, danh sách trùng
  // tên, camera) — mở lại thì ai cũng bắt đầu từ bước chọn vai trò, kèm lời
  // "Quà đã mở rồi!"
  useEffect(() => {
    if (!giftsLocked) return undefined
    const timer = setTimeout(() => chooseRole(null), 0)
    return () => clearTimeout(timer)
    // Chỉ chạy khi trạng thái khoá đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giftsLocked])

  const submit = async (event) => {
    event.preventDefault()
    const value = name.trim()
    setError(''); setMatches([]); setMessage('')
    if (value.length < 2) { setError('Vui lòng nhập ít nhất 2 ký tự.'); return }

    // Khách KHÔNG tra danh sách lớp — chỉ tra các hồ sơ "bạn bè" (người ngoài
    // lớp từng được ai đó gửi lời chúc); không có thì sang trang chúc chung
    if (visitorRole === 'guest') {
      setLoading(true)
      try {
        const result = await giftRepository.resolveStudent(value, 'friend')
        if (result?.giftPath) {
          await openGiftWithReveal(result.giftPath, value)
          return
        }
        if (result?.matches?.length) {
          setMatches(result.matches)
          setMatchGuess(Boolean(result.unsure))
          setMessage(result.message || '')
          return
        }
        navigate(`/celebrate/${encodeURIComponent(value)}?audience=visitor`)
      } catch (err) {
        if (err.status === 404) navigate(`/celebrate/${encodeURIComponent(value)}?audience=visitor`)
        else if (!navigator.onLine || err.isNetworkError) setError('Bạn đang offline hoặc backend chưa được bật.')
        else setError(err.message)
      } finally { setLoading(false) }
      return
    }

    setLoading(true)
    try {
      const result = await giftRepository.resolveStudent(value)
      if (result?.giftPath) await openGiftWithReveal(result.giftPath, value)
      else if (result?.matches?.length) { setMatches(result.matches); setMatchGuess(Boolean(result.unsure)); setMessage(result.message || '') }
      else setError('Không tìm thấy tên này trong danh sách.')
    } catch (err) {
      // Thành viên lớp nhưng không có trang quà riêng (ví dụ các bạn nam)
      if (err.status === 404) navigate(`/celebrate/${encodeURIComponent(value)}?audience=classmate`)
      else if (!navigator.onLine || err.isNetworkError) setError('Bạn đang offline hoặc backend chưa được bật.')
      else setError(err.message)
    } finally { setLoading(false) }
  }

  const isGuest = visitorRole === 'guest'
  const sentAt = new Date()

  return (
    <main className="landing page-paper">
      <Petals count={3} />
      {/* Overlay mở quà phủ lên trang chủ (mờ đi phía sau): sơ đồ lớp → thư bay
          từ bàn → phong bì mở → chuyển sang trang quà */}
      {revealPath && (
        <GiftReveal
          student={revealStudent}
          recipientName={revealName}
          via={revealVia}
          openRank={revealRank}
          onComplete={() => navigate(revealPath, revealStudent || revealRank || revealPendingOpen
            ? { state: { student: revealStudent, openRank: revealRank, pendingOpen: revealPendingOpen } }
            : undefined)}
        />
      )}
      {/* Số lời chúc to, mờ, nghiêng sau nội dung — trang trí; số đọc được ở dòng dưới nút gửi */}
      {wishesShown !== null && (
        <div
          className={`wish-ghost${celebrating ? ' is-date' : ''}`}
          style={{ '--digits': celebrating ? 5 : String(wishesShown).length }}
          aria-hidden="true"
        >
          {celebrating ? '20.10' : wishesShown}
        </div>
      )}
      <div className="landing__grid">
        <div className="landing__envelope">
          <div className={`wish-heap-scene${wishesShown !== null ? ' has-heap' : ''}${celebrating ? ' is-celebrating' : ''}`}>
            {/* Quà vừa mở: phong bì mở sẵn với lá thư chúc mừng cho tới khi chọn vai trò */}
            <Envelope
              open={Boolean(visitorRole) || justOpened}
              letterText={visitorRole ? undefined : 'Chúc mừng 20/10! 💐'}
              sealWiggle
            >
              {celebrating && (
                <span className="seal-crack" aria-hidden="true"><i>20.10</i><i>20.10</i></span>
              )}
            </Envelope>
            {wishesShown !== null && <WishHeap count={wishesShown} flights={wishFlights} onLanded={landWish} />}
          </div>
        </div>
        <div className="landing__content">
          {giftsLocked ? (
            <div className="landing__locked">
              <p className="kicker">20 · 10 · {EVENT_YEAR}</p>
              <h1 className="landing__title">Một món quà nhỏ dành riêng cho bạn</h1>
              <p className="landing__intro">Góc lưu bút các bạn nam {CLASS_NAME} làm tặng đang được gói, sẽ mở vào ngày 20/10.</p>
              {/* Điện thoại thấp: đồng hồ xuống dưới nút gửi lời chúc (CSS order) */}
              <div className="landing__wait">
                {eventStatus.unlockAt
                  ? <EventCountdown unlockAt={eventStatus.unlockAt} offset={eventOffset} onDone={handleCountdownDone} />
                  : <p className="landing__ask">Hẹn bạn ngày 20/10 nhé!</p>}
              </div>
              <p className="landing__ask">Trong lúc chờ, bạn có thể gửi trước một lời chúc:</p>
              <div className="landing__roles landing__roles--locked">
                <button type="button" className="btn-stamp" style={{ '--rot': '-1deg' }} onClick={openWish}>
                  <span className="btn-stamp__icon" aria-hidden="true">✉</span>Gửi lời chúc cho một bạn
                </button>
              </div>
            </div>
          ) : !visitorRole ? (
            <>
              <p className="kicker">20 · 10 · {EVENT_YEAR}</p>
              <h1 className="landing__title">Một món quà nhỏ dành riêng cho bạn</h1>
              <p className="landing__intro">Nhập tên để mở góc lưu bút các bạn nam {CLASS_NAME} làm tặng, cùng những lời chúc gửi tới bạn.</p>
              {justOpened && (
                <p className="event-opened" role="status">
                  🎉 Quà đã mở rồi! Cho tụi mình biết bạn là ai để mở tiếp nhé.
                </p>
              )}
              <p className="landing__ask">Trước tiên, cho tụi mình biết bạn là ai nhé:</p>
              <div className="landing__roles">
                <button type="button" className="btn-stamp" style={{ '--rot': '-1deg' }} onClick={() => chooseRole('classmate')}>
                  <span className="btn-stamp__icon" aria-hidden="true">✎</span>Mình là thành viên trong lớp
                </button>
                <button type="button" className="btn-stamp btn-stamp--moss" style={{ '--rot': '1deg' }} onClick={() => chooseRole('guest')}>
                  <span className="btn-stamp__icon" aria-hidden="true">✿</span>Mình là khách ghé thăm
                </button>
              </div>
            </>
          ) : matches.length > 0 ? (
            <>
              <button type="button" className="btn-dashed" onClick={() => { setMatches([]); setMessage('') }}>← Chọn lại</button>
              <h1 className="landing__title landing__title--step">
                {matchGuess ? 'Có phải cậu là…' : <>Có mấy bạn tên <span className="landing__name">{name.trim()}</span></>}
              </h1>
              <p className="landing__intro">{message || 'Bạn là ai trong số này? Chọn đúng người để mở quà.'}</p>
              <MatchList matches={matches} onPick={(match) => openGiftWithReveal(match.giftPath, match.displayName)} />
              <p className="landing__note">
                Không thấy tên mình? <button type="button" className="landing__link" onClick={() => setMatches([])}>Nhập lại tên đầy đủ</button>
              </p>
            </>
          ) : (
            <>
              <button type="button" className="btn-dashed" onClick={() => chooseRole(null)}>
                ← Chọn lại · {isGuest ? 'khách ghé thăm' : 'thành viên trong lớp'}
              </button>
              <h1 className="landing__title landing__title--step">Tên của bạn là gì?</h1>
              <p id="student-name-help" className="landing__intro">
                {isGuest
                  ? 'Nhập tên của bạn để nhận một lời chúc 20/10 dành riêng cho bạn.'
                  : 'Nhập họ tên hoặc tên thường gọi của bạn trong lớp.'}
              </p>
              <form className="landing__form" onSubmit={submit}>
                <label className="field-hand" htmlFor="student-name">
                  Tên:
                  <input
                    id="student-name"
                    className="input-hand"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isGuest ? 'Ví dụ: Minh Thư' : 'Ví dụ: Nguyễn Thúy Vy'}
                    autoComplete="name"
                    aria-describedby="student-name-help"
                  />
                </label>
                <button className="btn-primary" disabled={loading} aria-busy={loading}>
                  {loading ? 'Đang tìm…' : isGuest ? 'Nhận lời chúc' : 'Mở quà'}
                </button>
              </form>
              {/* Lối vào phụ, không thay thế gõ tên: service báo nghỉ giữa chừng
                  thì thẻ tự ẩn luôn cho tới lần tải trang sau */}
              {faceAvailable && faceKind !== 'offline' && (
                <button type="button" className="face-card" onClick={openFace} disabled={loading}>
                  <span className="face-card__icon" aria-hidden="true">✨</span>
                  <span className="face-card__text">
                    <b>Face ID</b>
                    <small>Nếu cậu đang ở nơi có ánh sáng ổn định, hãy đến với tôi.</small>
                  </span>
                </button>
              )}
              {error && <p className="alert-note landing__alert" role="alert">{error}</p>}
              <p className="landing__note">
                {isGuest
                  ? 'Là thành viên trong lớp? Chọn lại "thành viên trong lớp" để mở đúng trang quà của bạn.'
                  : 'Khách trùng tên với bạn trong lớp? Chọn lại "khách ghé thăm" để không mở nhầm trang.'}
              </p>
            </>
          )}
          {!giftsLocked && (
            <button type="button" className="landing__wish" onClick={openWish}>
              <span className="link-dashed">✉ Mình muốn gửi lời chúc cho một bạn</span>
            </button>
          )}
          {wishesShown !== null && <WishStats shown={wishesShown} lastAt={serverWishes?.lastAt} offset={eventOffset} />}
          {eventStatus && !eventStatus.locked && eventStatus.replies > 0 && (
            <Link to="/hoi-am" className="landing__wish landing__replies">
              <span className="link-dashed">📬 Hộp thư hồi âm · {eventStatus.replies} lá</span>
            </Link>
          )}
          {/* Bông hoa 12A1: mỗi bạn mở quà, hoa nở thêm một cánh */}
          {eventStatus && !eventStatus.locked && eventStatus.total > 0 && (
            <section className="landing-flower" aria-label={`Bông hoa ${CLASS_NAME}`}>
              <ClassFlower opened={eventStatus.opened} total={eventStatus.total} compact caption={false} />
              <div className="landing-flower__text">
                <p className="landing-flower__title">Bông hoa {CLASS_NAME}</p>
                <p className="landing-flower__count" aria-live="polite">
                  {eventStatus.opened >= eventStatus.total
                    ? `Cả ${eventStatus.total} bạn nữ đã mở quà rồi! 🌸`
                    : <><b>{eventStatus.opened}/{eventStatus.total}</b> bạn đã mở quà</>}
                </p>
                <p className="landing-flower__note">Mỗi bạn mở quà, hoa nở thêm một cánh.</p>
              </div>
            </section>
          )}
        </div>
      </div>
      {/* Khoảnh khắc quà mở ngay trước mắt: thêm một đợt cánh hoa */}
      {celebrating && !prefersReducedMotion() && <PetalRain />}

      {wishOpen && (
        <div className="wish-backdrop" role="presentation" onClick={closeWish}>
          <section
            ref={wishDialogRef}
            className={wishSent ? 'wish-modal wish-modal--success' : 'wish-modal letter-paper letter-paper--form'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wish-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="wish-close" onClick={closeWish} aria-label="Đóng">×</button>
            {wishSent ? (
              <div className="wish-success">
                <div className="wish-success__envelope">
                  <Envelope logo={false} sealAnimate sealDelay={0.3}>
                    <Stamp variant="date" size="sm" rotate={6} animate delay={0.6} className="wish-success__stamp" />
                    <Postmark
                      moss
                      size={84}
                      rotate={-14}
                      animate
                      delay={0.9}
                      lines={['ĐÃ', { big: 'GỬI' }, formatStamp(sentAt, { time: false }).slice(0, 5)]}
                      className="wish-success__postmark"
                    />
                  </Envelope>
                </div>
                <h2 id="wish-modal-title">Thư đã vào hộp!</h2>
                {wishSent.number && (
                  <p className="wish-success__number">Bạn là người gửi lời chúc thứ <b>{wishSent.number}</b>!</p>
                )}
                {wishSent.count > 1 && <p className="wish-success__count">Đã gửi tới {wishSent.count} người nhận.</p>}
                <p role="status">
                  {wishSent.revealAt
                    ? <>Lời chúc bí mật sẽ hiện đúng lúc <b>{formatReveal(wishSent.revealAt).split(' · ').reverse().join(' · ')}</b>, sau khi admin duyệt.</>
                    : 'Lời chúc sẽ xuất hiện trên trang quà sau khi admin duyệt.'}
                  {wishSent.friend && ' Người nhận tìm tên mình ở trang chủ (mục "khách ghé thăm") là thấy.'}
                </p>
                <div className="wish-success__actions">
                  <button type="button" className="btn-primary" onClick={resetWish}>Gửi thêm một lời chúc</button>
                  <button type="button" className="landing__wish" onClick={closeWish}><span className="link-dashed">Về trang chủ</span></button>
                </div>
              </div>
            ) : (
              <>
                <Stamp variant="date" rotate={5} className="wish-stamp" />
                <h2 id="wish-modal-title">Gửi lời chúc</h2>
                <form className="wish-form" onSubmit={submitWish}>
                  <div className="wish-row">
                    <span className="wish-row__label">Mình là</span>
                    {wishForm.isAnonymous
                      ? <span className="wish-row__anon">một người bạn ẩn danh</span>
                      : (
                        <input
                          className="input-hand wish-row__input"
                          value={wishForm.senderName}
                          maxLength={100}
                          onChange={(event) => setWishForm({ ...wishForm, senderName: event.target.value })}
                          placeholder="Ví dụ: Nguyễn Văn A"
                          aria-label="Tên của bạn"
                        />
                      )}
                    <label className="wish-check">
                      <input
                        type="checkbox"
                        checked={wishForm.isAnonymous}
                        onChange={(event) => setWishForm({ ...wishForm, isAnonymous: event.target.checked, senderName: event.target.checked ? '' : wishForm.senderName })}
                      />
                      Ẩn danh
                    </label>
                  </div>
                  <fieldset className="wish-to">
                    <legend className="wish-row__label">Gửi tới</legend>
                    <span className="wish-toggle" role="radiogroup" aria-label="Người nhận là">
                      <button type="button" role="radio" aria-checked={wishForm.receiverType === 'class'} onClick={() => setWishForm({ ...wishForm, receiverType: 'class' })}>
                        Trong lớp{selectedIds.length > 0 && ` · ${selectedIds.length}`}
                      </button>
                      <button type="button" role="radio" aria-checked={wishForm.receiverType === 'friend'} onClick={() => setWishForm({ ...wishForm, receiverType: 'friend' })}>
                        Ngoài lớp{friendRecipients.length > 0 && ` · ${friendRecipients.length}`}
                      </button>
                    </span>
                    {wishForm.receiverType === 'class' ? (
                      recipientOptions ? (
                        <div className="wish-checklist">
                          <label className="wish-check wish-check--all">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && !allSelected }}
                              onChange={toggleAll}
                            />
                            Tất cả ({recipientOptions.length})
                          </label>
                          <ul className="wish-checklist__list" aria-label="Các bạn trong lớp">
                            {recipientOptions.map((option) => (
                              <li key={option.id}>
                                <label className="wish-check">
                                  <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => toggleRecipient(option.id)} />
                                  <span>{option.name}{option.nickname && <i> “{option.nickname}”</i>}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="wish-hint" role={recipientLoadError ? 'alert' : 'status'}>{recipientLoadError || 'Đang tải danh sách các bạn…'}</p>
                      )
                    ) : (
                      <div className="wish-friend">
                        <div className="wish-add-row">
                          <input
                            className="input-hand wish-row__input"
                            value={friendName}
                            maxLength={100}
                            onChange={(event) => setFriendName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFriend() } }}
                            placeholder="Ví dụ: Minh Thư (bạn khác lớp)"
                            aria-label="Tên bạn ngoài lớp"
                          />
                          <button type="button" className="btn-dashed" onClick={addFriend}>＋ Thêm</button>
                        </div>
                        <p className="wish-hint">Hệ thống sẽ tạo trang lời chúc riêng cho người này — họ tìm tên mình ở trang chủ (mục "khách ghé thăm") là thấy.</p>
                      </div>
                    )}
                    {friendRecipients.length > 0 && (
                      <ul className="wish-recipients" aria-label="Bạn ngoài lớp đã thêm">
                        {friendRecipients.map((item) => (
                          <li key={item.key}>
                            <span>{item.name}<i> · ngoài lớp</i></span>
                            <button type="button" onClick={() => removeFriend(item.key)} aria-label={`Bỏ ${item.name}`}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="wish-hint wish-to__summary" aria-live="polite">
                      {selectedIds.length + friendRecipients.length > 0
                        ? `Sẽ gửi tới ${selectedIds.length + friendRecipients.length} người — mỗi người một lá thư.`
                        : 'Tích chọn một hay nhiều bạn, hoặc "Tất cả" để chúc cả lớp một lần.'}
                    </p>
                  </fieldset>
                  <div className="wish-row">
                    <span className="wish-row__label">Tiêu đề</span>
                    <input
                      className="input-hand wish-row__input"
                      value={wishForm.title}
                      maxLength={200}
                      onChange={(event) => setWishForm({ ...wishForm, title: event.target.value })}
                      placeholder="Ví dụ: Gửi người bạn đặc biệt..."
                      aria-label="Tiêu đề"
                    />
                    <i className="wish-row__note">tuỳ chọn</i>
                  </div>
                  <textarea
                    className="input-hand wish-textarea"
                    value={wishForm.content}
                    maxLength={5000}
                    rows={4}
                    onChange={(event) => setWishForm({ ...wishForm, content: event.target.value })}
                    placeholder="Bạn hãy viết lời chúc của bạn vào đây..."
                    aria-label="Lời chúc"
                  />
                  <div className="wish-chips">
                    <button
                      type="button"
                      className={`btn-dashed${wishForm.revealAt ? ' is-active' : ''}`}
                      aria-expanded={showReveal}
                      onClick={() => setShowReveal((open) => !open)}
                    >
                      ⏰ {wishForm.revealAt ? formatReveal(wishForm.revealAt) : <>Hẹn giờ hiện lời chúc <i>tuỳ chọn</i></>}
                    </button>
                    <button
                      type="button"
                      className={`btn-dashed${wishImages.picks.length ? ' is-active' : ''}`}
                      disabled={wishImages.full}
                      onClick={() => wishFileRef.current?.click()}
                    >
                      📷 {wishImages.picks.length
                        ? (wishImages.full ? `Đủ ${MAX_WISH_IMAGES} ảnh` : <>Thêm ảnh <i>{wishImages.picks.length}/{MAX_WISH_IMAGES}</i></>)
                        : <>Kèm ảnh <i>tối đa {MAX_WISH_IMAGES} · ≤ 5 MB</i></>}
                    </button>
                    <input
                      ref={wishFileRef}
                      type="file"
                      hidden
                      multiple
                      accept={WISH_IMAGE_ACCEPT}
                      aria-label="Ảnh kèm lời chúc"
                      onChange={(e) => chooseWishImages(e.target.files)}
                    />
                  </div>
                  {showReveal && (
                    <label className="wish-reveal">
                      Hiện lúc
                      <input
                        type="datetime-local"
                        value={wishForm.revealAt}
                        min={revealLimits.min}
                        max={revealLimits.max}
                        onChange={(e) => setWishForm({ ...wishForm, revealAt: e.target.value })}
                      />
                      {wishForm.revealAt && (
                        <button type="button" className="btn-dashed" onClick={() => setWishForm({ ...wishForm, revealAt: '' })}>Bỏ hẹn giờ</button>
                      )}
                    </label>
                  )}
                  <PickedImages picks={wishImages.picks} onRemove={wishImages.remove} />
                  {wishError && <p className="alert-note wish-alert" role="alert">{wishError}</p>}
                  <div className="wish-submit-row">
                    <span className="wish-submit-note">Lời chúc sẽ hiện sau khi admin duyệt</span>
                    <button className="btn-stamp btn-stamp--fill wish-submit" disabled={wishSubmitting}>
                      {wishSubmitting ? 'Đang gửi…' : 'Dán tem & gửi ✉'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {/* Face ID: con trực tiếp của <main> như modal lời chúc — .landing__content
          có animation transform nên sẽ thành khung chứa của position: fixed */}
      {faceActive && (
        <div className="wish-backdrop" role="presentation" onClick={closeFace}>
          <section
            ref={faceDialogRef}
            className="wish-modal face-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="face-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="wish-close" onClick={closeFace} aria-label="Đóng">×</button>
            {faceStatus === 'choose' && facePeople.length ? (
              <div className="face-confirm face-choose">
                <Postmark
                  moss
                  size={84}
                  rotate={-12}
                  animate
                  lines={['MẮT', 'THẦN', { big: '20.10' }]}
                  className="face-confirm__postmark"
                />
                <p className="face-confirm__greeting">Chào {greetNames(facePeople)}! 🌷</p>
                <h2 id="face-modal-title">Cậu muốn mở quà cho ai nào?</h2>
                <MatchList matches={facePeople} onPick={chooseFace} />
                <div className="face-actions">
                  <button type="button" className="landing__wish" onClick={retryFace}>
                    <span className="link-dashed">Quét lại</span>
                  </button>
                </div>
              </div>
            ) : faceStatus === 'confirm' && faceCandidate ? (
              <div className="face-confirm">
                <Postmark
                  moss
                  size={84}
                  rotate={-12}
                  animate
                  lines={['MẮT', 'THẦN', { big: '20.10' }]}
                  className="face-confirm__postmark"
                />
                <p className="face-confirm__greeting">{greetingFor(faceCandidate.score)}</p>
                <h2 id="face-modal-title">Có phải cậu là <b>{faceCandidate.displayName}</b>? 🌸</h2>
                <div className="face-actions">
                  <button type="button" className="btn-primary" onClick={confirmFace}>Đúng là mình 🌸</button>
                  <button type="button" className="landing__wish" onClick={denyFace}>
                    <span className="link-dashed">Không phải mình</span>
                  </button>
                </div>
              </div>
            ) : faceStatus === 'stopped' && faceKind === 'unrecognized' ? (
              // Không phải lỗi: máy nhìn rõ mà không khớp ai. Lối nhanh nhất tới
              // quà là gõ tên, nên nút đó đứng đầu; quét lại để phía sau.
              <div className="face-stopped face-stopped--soft">
                <h2 id="face-modal-title">{faceTitle}</h2>
                <p className="face-stopped__text" role="status">{faceMessage}</p>
                <div className="face-actions">
                  <button type="button" className="btn-primary" onClick={typeNameInstead}>Gõ tên để mở quà</button>
                  <button type="button" className="landing__wish" onClick={retryFace}>
                    <span className="link-dashed">Quét lại</span>
                  </button>
                </div>
              </div>
            ) : faceStatus === 'stopped' ? (
              <div className="face-stopped">
                <h2 id="face-modal-title">{faceTitle || '✨ Face ID'}</h2>
                <p className="alert-note" role="alert">{faceMessage}</p>
                <div className="face-actions">
                  {faceCanRetry && <button type="button" className="btn-primary" onClick={retryFace}>Quét lại</button>}
                  <button type="button" className="landing__wish" onClick={typeNameInstead}>
                    <span className="link-dashed">Gõ tên thay nhé</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 id="face-modal-title">✨ Face ID</h2>
                <div className={`face-viewfinder${faceStatus === 'scanning' ? ' is-scanning' : ''}`}>
                  <video ref={faceVideoRef} className="face-video" autoPlay muted playsInline aria-hidden="true" />
                  <span className="face-oval" aria-hidden="true" />
                </div>
                {/* Chữ luôn hiện song song với vòng quét: prefers-reduced-motion
                    tắt animation thì người dùng vẫn biết máy đang làm gì */}
                <p className="face-hint" role="status" aria-live="polite">{faceHint}</p>
                {/* Đồng hồ chỉ hiện ở 10 giây cuối — thấy "còn 29 giây" ngay từ đầu
                    dễ tưởng phải chờ đủ chừng ấy, trong khi thường ~2 giây là xong */}
                {faceStatus === 'scanning' && (
                  <p className="face-countdown">
                    {showCountdown(faceSecondsLeft) ? `còn ${faceSecondsLeft} giây` : 'thường chỉ mất vài giây thôi'}
                  </p>
                )}
                <p className="wish-hint face-privacy">
                  Không lưu ảnh hay video — mỗi khung hình so khớp xong là bỏ. Mình chỉ ghi lại
                  vài con số (đủ sáng chưa, có nhận ra không) để Face ID ngày càng nhận đúng hơn.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default LandingPage
