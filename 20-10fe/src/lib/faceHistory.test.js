import { describe, expect, it } from 'vitest'
import {
  ISSUES,
  LIVE_MS,
  OUTCOMES,
  deviceLabel,
  formatDuration,
  formatScore,
  formatSeconds,
  frameKind,
  isNearMiss,
  mergeScans,
  outcomeOf,
  sortMembers,
} from './faceHistory'

describe('outcomeOf', () => {
  const startedAt = '2026-09-11T12:00:00.000Z'
  const start = new Date(startedAt).getTime()

  it('dùng nhãn của kết quả khi lượt đã khép', () => {
    expect(outcomeOf({ outcome: 'confirmed', startedAt })).toEqual({ label: 'Nhận đúng', tone: 'ok' })
    expect(outcomeOf({ outcome: 'denied', startedAt }).tone).toBe('bad')
  })

  it('chưa có kết quả: vừa bắt đầu là đang quét, lâu rồi là bỏ dở', () => {
    expect(outcomeOf({ outcome: null, startedAt }, start + 5_000).label).toBe('Đang quét…')
    expect(outcomeOf({ outcome: null, startedAt }, start + LIVE_MS + 1).label).toBe('Bỏ dở')
  })

  it('mọi kết quả backend có thể trả về đều có nhãn', () => {
    for (const outcome of ['confirmed', 'denied', 'unrecognized', 'timeout', 'hidden', 'camera', 'offline', 'limited', 'closed']) {
      expect(OUTCOMES[outcome]?.label).toBeTruthy()
    }
  })

  it('mọi nguyên nhân backend chẩn đoán đều có nhãn và gợi ý', () => {
    const issues = ['wrong_person', 'no_match', 'dark', 'small', 'blurry', 'no_face', 'many_faces',
      'unanswered', 'camera', 'offline', 'limited', 'no_frames', 'left_early']
    for (const issue of issues) {
      expect(ISSUES[issue]?.label).toBeTruthy()
      expect(ISSUES[issue]?.tip).toBeTruthy()
    }
  })
})

describe('định dạng', () => {
  it('số thập phân kiểu Việt', () => {
    expect(formatScore(0.4512)).toBe('0,45')
    expect(formatScore(null)).toBe('—')
    expect(formatDuration(1734)).toBe('1,7 giây')
    expect(formatDuration(29_600)).toBe('30 giây')
    expect(formatDuration(null)).toBe('—')
    expect(formatSeconds(800)).toBe('0,8s')
  })

  it('khung low_quality lấy lý do làm loại', () => {
    expect(frameKind({ decision: 'low_quality', reason: 'dark' })).toBe('dark')
    expect(frameKind({ decision: 'reject' })).toBe('reject')
  })

  it('máy + trình duyệt gọn một dòng', () => {
    expect(deviceLabel({ device: 'iphone', browser: 'zalo' })).toBe('iPhone · Zalo')
    expect(deviceLabel({ device: null, browser: null })).toBe('')
  })

  it('suýt khớp = dưới ngưỡng không quá 0,1', () => {
    expect(isNearMiss({ score: 0.41 }, 0.45)).toBe(true)
    expect(isNearMiss({ score: 0.3 }, 0.45)).toBe(false)
    expect(isNearMiss({ score: 0.5 }, 0.45)).toBe(false)
    expect(isNearMiss(null, 0.45)).toBe(false)
  })
})

describe('mergeScans — tự làm mới không làm mất các trang đã tải thêm', () => {
  const scan = (id, extra = {}) => ({ id, frames: 1, ...extra })

  it('trang mới thay các lượt trùng, lượt cũ hơn được giữ', () => {
    const existing = [scan(9), scan(8, { frames: 2 }), scan(7), scan(6)]
    const fresh = [scan(10), scan(9), scan(8, { frames: 5 })]
    const merged = mergeScans(fresh, existing)
    expect(merged.map((item) => item.id)).toEqual([10, 9, 8, 7, 6])
    expect(merged[2].frames).toBe(5)
  })

  it('lượt vừa bị xoá khỏi trang mới nhất thì không quay lại', () => {
    expect(mergeScans([scan(10), scan(8)], [scan(10), scan(9), scan(8)]).map((item) => item.id)).toEqual([10, 8])
  })
})

describe('sortMembers', () => {
  const member = (name, extra = {}) => ({ name, hasProfile: true, failed: 0, mistakenFor: 0, confirmed: 0, ...extra })

  it('ai cần để ý lên đầu: hay phải gõ tên, bị nhận nhầm, chưa có hồ sơ', () => {
    const sorted = sortMembers([
      member('An'),
      member('Bình', { hasProfile: false }),
      member('Chi', { failed: 2 }),
      member('Dũng', { mistakenFor: 1 }),
      member('Ánh'),
    ])
    expect(sorted.map((item) => item.name)).toEqual(['Chi', 'Dũng', 'Bình', 'An', 'Ánh'])
  })
})
