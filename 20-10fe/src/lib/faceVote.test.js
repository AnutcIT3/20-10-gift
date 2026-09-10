import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_FROM,
  DARK_LUMA,
  HINTS,
  INITIAL_VOTES,
  REJECTS_TO_GIVE_UP,
  SCAN_TIMEOUT_MS,
  STOP_MESSAGES,
  STOP_TITLES,
  RETRYABLE_STOPS,
  greetingFor,
  hintFor,
  isTooDark,
  makeScanToken,
  meanLuma,
  remainingSeconds,
  showCountdown,
  stopKindFor,
  tallyVotes,
} from './faceVote'

describe('makeScanToken', () => {
  it('cho đúng 32 ký tự hex như backend kiểm, mỗi lượt một mã', () => {
    const token = makeScanToken()
    expect(token).toMatch(/^[a-f0-9]{32}$/)
    expect(makeScanToken()).not.toBe(token)
    // Byte nhỏ vẫn đủ hai chữ số: 0x00 → "00", 0x0f → "0f"
    const fixed = { getRandomValues: (bytes) => bytes.fill(15) }
    expect(makeScanToken(fixed)).toBe('0f'.repeat(16))
  })
})

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
function run(results, start = INITIAL_VOTES, excluded = []) {
  return results.reduce(
    (acc, result) => {
      const step = tallyVotes(acc.votes, result, excluded)
      return {
        ...step,
        conclusions: acc.conclusions.concat(step.conclusion ? [step.conclusion] : []),
        // Bước đầu tiên bật cờ giveUp — hook dừng camera ngay tại đó
        gaveUpAt: acc.gaveUpAt ?? (step.giveUp ? acc.steps : null),
        steps: acc.steps + 1,
      }
    },
    { votes: start, hint: '', conclusion: null, conclusions: [], gaveUpAt: null, steps: 1 },
  )
}

const reject = { decision: 'reject', score: 0.31, margin: 0.04 }

describe('tallyVotes', () => {
  it('hai khung liên tiếp cùng một người thì kết luận, kèm đủ dữ liệu để hỏi xác nhận', () => {
    const first = tallyVotes(INITIAL_VOTES, match(7))
    expect(first.conclusion).toBeNull()
    expect(first.votes).toEqual({ studentId: 7, count: 1, rejects: 0 })
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
    expect(votes).toEqual({ studentId: 7, count: 1, rejects: 0 })

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
    expect(onlyNoise.votes).toEqual({ studentId: 7, count: 1, rejects: 1 })

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

describe('dừng sớm khi nhìn rõ mặt mà không khớp ai', () => {
  it('đủ 6 khung rõ mặt liên tiếp không khớp → dừng, không bắt chờ hết giờ', () => {
    expect(REJECTS_TO_GIVE_UP).toBe(6)
    expect(run(Array(REJECTS_TO_GIVE_UP - 1).fill(reject)).gaveUpAt).toBeNull()
    const out = run(Array(REJECTS_TO_GIVE_UP).fill(reject))
    expect(out.gaveUpAt).toBe(REJECTS_TO_GIVE_UP)
    expect(out.conclusions).toEqual([])
  })

  it('khung mờ, tối, lệch khung không tính vào lượt "không nhận ra" nhưng cũng không xóa nó', () => {
    const coaching = [
      { decision: 'no_face' },
      { decision: 'low_quality', reason: 'dark' },
      { decision: 'many_faces', faces: 2 },
    ]
    // Người đang chỉnh máy: toàn khung chưa rõ thì không bao giờ bị kết luận "không nhận ra"
    expect(run(Array(20).fill(coaching[0])).gaveUpAt).toBeNull()
    // 3 reject, chen khung chỉnh máy, rồi 3 reject nữa → vẫn đủ 6 và dừng
    const out = run([reject, reject, reject, ...coaching, reject, reject, reject])
    expect(out.gaveUpAt).toBe(3 + coaching.length + 3)
  })

  it('một lần khớp xóa bộ đếm, người thật chập chờn quanh ngưỡng vẫn được nhận ra', () => {
    const out = run([reject, reject, reject, reject, reject, match(7), reject, match(7)])
    expect(out.gaveUpAt).toBeNull()
    expect(out.conclusions).toHaveLength(1)
    expect(out.conclusions[0].studentId).toBe(7)
  })

  it('người vừa bị bấm "Không phải mình" bị coi như không khớp, không bị hỏi lại', () => {
    const out = run(Array(REJECTS_TO_GIVE_UP).fill(match(7)), INITIAL_VOTES, [7])
    expect(out.conclusions).toEqual([])
    expect(out.gaveUpAt).toBe(REJECTS_TO_GIVE_UP)
    // Người khác vẫn được nhận ra bình thường
    expect(run([match(8), match(8)], INITIAL_VOTES, [7]).conclusions).toHaveLength(1)
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

  it('mỗi lý do dừng đều có câu nhắn nói đúng nguyên nhân', () => {
    for (const kind of ['camera', 'offline', 'limited', 'timeout', 'unrecognized', 'hidden']) {
      expect(STOP_MESSAGES[kind]).toBeTruthy()
    }
    expect(STOP_MESSAGES.offline).toBe('Face ID đang nghỉ, gõ tên giúp mình nhé 🌷')
    expect(STOP_MESSAGES.camera).toBe('Không mở được camera — gõ tên giúp mình nhé 🌷')
    // Hết giờ = chưa nhìn rõ mặt; không nhận ra = đã nhìn rõ nhưng không khớp —
    // hai câu khác nhau, và câu "không nhận ra" không đổ cho ánh sáng
    expect(STOP_MESSAGES.timeout).toMatch(/chưa nhìn rõ mặt/)
    expect(STOP_MESSAGES.unrecognized).not.toMatch(/sáng/)
    expect(STOP_MESSAGES.unrecognized).toMatch(/gõ tên/)
    expect(STOP_TITLES.unrecognized).toMatch(/nhận không ra/)
    expect(RETRYABLE_STOPS).toEqual(['timeout', 'hidden', 'unrecognized'])
  })
})

describe('remainingSeconds — chưa nhìn rõ mặt suốt 30 giây thì dừng', () => {
  const startedAt = 1_700_000_000_000

  it('đếm lùi từ 30 và chạm 0 đúng lúc 30 s', () => {
    expect(SCAN_TIMEOUT_MS).toBe(30_000)
    expect(remainingSeconds(startedAt, startedAt)).toBe(30)
    expect(remainingSeconds(startedAt, startedAt + 800)).toBe(30)
    expect(remainingSeconds(startedAt, startedAt + 1_000)).toBe(29)
    expect(remainingSeconds(startedAt, startedAt + 29_999)).toBe(1)
    expect(remainingSeconds(startedAt, startedAt + 30_000)).toBe(0)
  })

  it('đồng hồ chỉ hiện ở 10 giây cuối', () => {
    expect(COUNTDOWN_FROM).toBe(10)
    expect(showCountdown(30)).toBe(false)
    expect(showCountdown(11)).toBe(false)
    expect(showCountdown(10)).toBe(true)
    expect(showCountdown(1)).toBe(true)
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
