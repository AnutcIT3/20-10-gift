import { describe, expect, it } from 'vitest'
import {
  DARK_LUMA,
  HINTS,
  INITIAL_VOTES,
  SCAN_TIMEOUT_MS,
  STOP_MESSAGES,
  RETRYABLE_STOPS,
  greetingFor,
  hintFor,
  isTooDark,
  meanLuma,
  remainingSeconds,
  stopKindFor,
  tallyVotes,
} from './faceVote'

const match = (studentId, extra = {}) => ({
  decision: 'match',
  matchId: 100 + studentId,
  studentId,
  giftPath: `/gift/code${studentId}`,
  displayName: `Bạn ${studentId}`,
  score: 0.62,
  margin: 0.2,
  ...extra,
})

// Chạy một chuỗi kết quả qua reducer, trả về trạng thái cuối
function run(results, start = INITIAL_VOTES) {
  return results.reduce(
    (acc, result) => {
      const step = tallyVotes(acc.votes, result)
      return { ...step, conclusions: acc.conclusions.concat(step.conclusion ? [step.conclusion] : []) }
    },
    { votes: start, hint: '', conclusion: null, conclusions: [] },
  )
}

describe('tallyVotes', () => {
  it('hai khung liên tiếp cùng một người thì kết luận, kèm đủ dữ liệu để hỏi xác nhận', () => {
    const first = tallyVotes(INITIAL_VOTES, match(7))
    expect(first.conclusion).toBeNull()
    expect(first.votes).toEqual({ studentId: 7, count: 1 })
    expect(first.hint).toBe(HINTS.almost)

    const second = tallyVotes(first.votes, match(7, { matchId: 999, score: 0.71 }))
    expect(second.conclusion).toEqual({
      matchId: 999,
      studentId: 7,
      giftPath: '/gift/code7',
      displayName: 'Bạn 7',
      score: 0.71,
      margin: 0.2,
    })
  })

  it('xen một người khác vào thì đếm lại từ đầu', () => {
    const { conclusions, votes } = run([match(7), match(8), match(7)])
    expect(conclusions).toEqual([])
    expect(votes).toEqual({ studentId: 7, count: 1 })

    const switched = run([match(7), match(8), match(8)])
    expect(switched.conclusions).toHaveLength(1)
    expect(switched.conclusions[0].studentId).toBe(8)
  })

  it('reject / no_face / low_quality / many_faces không tính phiếu và không xóa phiếu đang có', () => {
    const noise = [
      { decision: 'reject', score: 0.41, margin: 0.02 },
      { decision: 'no_face' },
      { decision: 'low_quality', reason: 'blurry' },
      { decision: 'many_faces', faces: 2 },
    ]
    const onlyNoise = run([match(7), ...noise])
    expect(onlyNoise.conclusions).toEqual([])
    expect(onlyNoise.votes).toEqual({ studentId: 7, count: 1 })

    // Khung nhòe giữa hai khung tốt không làm mất công khung đầu
    const around = run([match(7), ...noise, match(7)])
    expect(around.conclusions).toHaveLength(1)

    // Toàn reject thì không bao giờ kết luận
    expect(run(Array(5).fill(noise[0])).conclusions).toEqual([])
  })

  it('không đụng vào object phiếu cũ', () => {
    const before = { studentId: 3, count: 1 }
    tallyVotes(before, match(3))
    expect(before).toEqual({ studentId: 3, count: 1 })
  })
})

describe('hintFor', () => {
  it('ánh xạ từng quyết định sang câu nhắc', () => {
    expect(hintFor({ decision: 'no_face' })).toBe('Đưa mặt vào khung nhé')
    expect(hintFor({ decision: 'low_quality', reason: 'small' })).toBe('Lại gần máy hơn chút nhé')
    expect(hintFor({ decision: 'low_quality', reason: 'dark' })).toBe('Hơi tối rồi 🌙')
    expect(hintFor({ decision: 'low_quality', reason: 'blurry' })).toBe('Giữ máy yên một chút nhé')
    expect(hintFor({ decision: 'many_faces', faces: 2 })).toBe('Chỉ một người trong khung thôi nha')
  })

  it('reject và trường hợp lạ thì vẫn "đang so với gương mặt của lớp mình…"', () => {
    expect(hintFor({ decision: 'reject', score: 0.3 })).toBe('đang so với gương mặt của lớp mình…')
    expect(hintFor({ decision: 'low_quality', reason: 'weird' })).toBe(HINTS.scanning)
    expect(hintFor(undefined)).toBe(HINTS.scanning)
    expect(tallyVotes(INITIAL_VOTES, { decision: 'reject' }).hint).toBe(HINTS.scanning)
  })
})

describe('greetingFor', () => {
  it('điểm từ 0.60 thì nhận ra ngay, thấp hơn thì hmm', () => {
    expect(greetingFor(0.6)).toBe('Nhận ra cậu ngay lập tức luôn!')
    expect(greetingFor(0.83)).toBe('Nhận ra cậu ngay lập tức luôn!')
    expect(greetingFor(0.59)).toBe('Hmm... có phải cậu không ta? 🤔')
    expect(greetingFor(undefined)).toBe('Hmm... có phải cậu không ta? 🤔')
  })
})

describe('stopKindFor', () => {
  it('503 hoặc mất mạng → nghỉ; 429 → giới hạn; lỗi khác → quét tiếp', () => {
    expect(stopKindFor({ status: 503 })).toBe('offline')
    expect(stopKindFor({ isNetworkError: true })).toBe('offline')
    expect(stopKindFor({ status: 429 })).toBe('limited')
    expect(stopKindFor({ status: 400 })).toBeNull()
    expect(stopKindFor({ status: 413 })).toBeNull()
    expect(stopKindFor({ status: 500 })).toBeNull()
    expect(stopKindFor(null)).toBeNull()
  })

  it('mỗi lý do dừng đều có câu nhắn, chỉ hết giờ / rời tab mới được quét lại', () => {
    for (const kind of ['camera', 'offline', 'limited', 'timeout', 'hidden']) {
      expect(STOP_MESSAGES[kind]).toBeTruthy()
    }
    expect(STOP_MESSAGES.offline).toBe('Face ID đang nghỉ, gõ tên giúp mình nhé 🌷')
    expect(STOP_MESSAGES.limited).toBe('Hôm nay cậu xinh quá mình nhận không ra 😅 — thử gõ tên nhé')
    expect(STOP_MESSAGES.timeout).toBe('Ánh sáng chưa chiều mình rồi, gõ tên giúp mình nha 🌷')
    expect(STOP_MESSAGES.camera).toBe('Không mở được camera — gõ tên giúp mình nhé 🌷')
    expect(RETRYABLE_STOPS).toEqual(['timeout', 'hidden'])
  })
})

describe('remainingSeconds — hết 120 giây thì dừng', () => {
  const startedAt = 1_700_000_000_000

  it('đếm lùi từ 120 và chạm 0 đúng lúc 120 s', () => {
    expect(SCAN_TIMEOUT_MS).toBe(120_000)
    expect(remainingSeconds(startedAt, startedAt)).toBe(120)
    expect(remainingSeconds(startedAt, startedAt + 800)).toBe(120)
    expect(remainingSeconds(startedAt, startedAt + 1_000)).toBe(119)
    expect(remainingSeconds(startedAt, startedAt + 119_999)).toBe(1)
    expect(remainingSeconds(startedAt, startedAt + 120_000)).toBe(0)
  })

  it('không âm khi đã quá giờ', () => {
    expect(remainingSeconds(startedAt, startedAt + 500_000)).toBe(0)
  })
})

describe('meanLuma / isTooDark — đo sáng vùng giữa trước khi gửi', () => {
  const pixels = (r, g, b, count) => {
    const arr = new Uint8ClampedArray(count * 4)
    for (let i = 0; i < count; i += 1) {
      arr[i * 4] = r; arr[i * 4 + 1] = g; arr[i * 4 + 2] = b; arr[i * 4 + 3] = 255
    }
    return arr
  }

  it('trắng = 255, đen = 0, kênh nhân theo Rec.601', () => {
    expect(meanLuma(pixels(255, 255, 255, 16))).toBeCloseTo(255, 5)
    expect(meanLuma(pixels(0, 0, 0, 16))).toBe(0)
    expect(meanLuma(pixels(255, 0, 0, 4))).toBeCloseTo(76.245, 2)
    expect(meanLuma(pixels(0, 255, 0, 4))).toBeCloseTo(149.685, 2)
    expect(meanLuma(new Uint8ClampedArray(0))).toBe(0)
  })

  it('dưới 35 là tối, không gửi khung', () => {
    expect(DARK_LUMA).toBe(35)
    expect(isTooDark(meanLuma(pixels(20, 20, 20, 8)))).toBe(true)
    expect(isTooDark(meanLuma(pixels(35, 35, 35, 8)))).toBe(false)
    expect(isTooDark(meanLuma(pixels(120, 100, 90, 8)))).toBe(false)
  })
})
