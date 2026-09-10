import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import FaceHistory from './FaceHistory'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    getFaceSummary: vi.fn(),
    listFaceScans: vi.fn(),
    getFaceScan: vi.fn(),
    clearFaceHistory: vi.fn(),
  },
}))

const THRESHOLDS = { tau: 0.45, margin: 0.1, minFacePx: 80, minBrightness: 40, minBlur: 40 }
const counts = (extra = {}) => ({ match: 0, reject: 0, no_face: 0, many_faces: 0, small: 0, dark: 0, blurry: 0, ...extra })

const SUMMARY = {
  ready: true,
  thresholds: THRESHOLDS,
  totals: { scans: 2, confirmed: 1, denied: 0, failed: 1 },
  medianConfirmMs: 1700,
  issues: { no_match: 1 },
  members: [
    { id: 4, name: 'Thanh Huyền', nickname: '', avatarUrl: '', hasProfile: true, confirmed: 1, failed: 0, mistakenFor: 0, lastAt: '2026-09-11T12:10:00.000Z', lastIssue: null },
    { id: 20, name: 'Hùng', nickname: '', avatarUrl: '', hasProfile: true, confirmed: 0, failed: 1, mistakenFor: 0, lastAt: '2026-09-11T12:05:00.000Z', lastIssue: 'no_match' },
    { id: 30, name: 'Mai', nickname: '', avatarUrl: '', hasProfile: false, confirmed: 0, failed: 0, mistakenFor: 0, lastAt: null, lastIssue: null },
  ],
}

const SCANS = [
  {
    id: 12,
    startedAt: '2026-09-11T12:10:00.000Z',
    outcome: 'confirmed',
    durationMs: 1700,
    darkFrames: 0,
    device: 'iphone',
    browser: 'zalo',
    frames: 2,
    counts: counts({ match: 2 }),
    best: { score: 0.81, margin: 0.54, candidate: { id: 4, name: 'Thanh Huyền' } },
    suggested: { id: 4, name: 'Thanh Huyền' },
    claimed: null,
    member: { id: 4, name: 'Thanh Huyền', via: 'face' },
    issue: null,
  },
  {
    id: 11,
    startedAt: '2026-09-11T12:05:00.000Z',
    outcome: 'unrecognized',
    durationMs: 5200,
    darkFrames: 0,
    device: 'android',
    browser: 'chrome',
    frames: 6,
    counts: counts({ reject: 6 }),
    best: { score: 0.41, margin: 0.2, candidate: { id: 20, name: 'Hùng' } },
    suggested: null,
    claimed: { id: 20, name: 'Hùng' },
    member: { id: 20, name: 'Hùng', via: 'typed' },
    issue: 'no_match',
  },
]

// Vitest không bật globals nên Testing Library không tự dọn giữa các test
afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  adminApi.getFaceSummary.mockResolvedValue(SUMMARY)
  adminApi.listFaceScans.mockResolvedValue({ ready: true, items: SCANS, nextBefore: null })
  adminApi.getFaceScan.mockResolvedValue({
    ...SCANS[1],
    thresholds: THRESHOLDS,
    timeline: [
      { id: 1, tMs: 800, decision: 'reject', reason: null, score: 0.41, margin: 0.2, candidate: { id: 20, name: 'Hùng' }, faces: 1, facePx: 160, brightness: 118, blur: 90, detScore: 0.9 },
      { id: 2, tMs: 1600, decision: 'low_quality', reason: 'dark', score: null, margin: null, candidate: null, faces: 1, facePx: 150, brightness: 31, blur: 70, detScore: 0.8 },
    ],
  })
})

test('shows scan totals, who each scan was, and why the failed one failed', async () => {
  render(<FaceHistory />)

  expect(await screen.findByRole('heading', { name: 'Lịch sử quét' })).toBeInTheDocument()
  expect(await screen.findByText('Nhận ra trong (trung vị)')).toBeInTheDocument()
  expect(screen.getByText('1,7 giây')).toBeInTheDocument()
  // 2/3 bạn có hồ sơ Face ID
  expect(screen.getByText('2/3')).toBeInTheDocument()

  expect(screen.getByText('máy nhận ra')).toBeInTheDocument()
  expect(screen.getByText('gõ tên ngay sau đó')).toBeInTheDocument()
  // Nguyên nhân + người giống nhất, suýt khớp vì 0,41 chỉ thiếu 0,04 so với ngưỡng
  expect(screen.getByText(/Nhìn rõ mặt nhưng không khớp ai · giống nhất: Hùng 0,41 — suýt khớp/)).toBeInTheDocument()
  // Người chưa có hồ sơ được đánh dấu trong danh sách thành viên
  expect(screen.getByText('chưa có hồ sơ Face ID')).toBeInTheDocument()
  // Cam kết hiện ngay trên trang: không lưu ảnh
  expect(screen.getByText(/không có ảnh hay video nào được lưu/)).toBeInTheDocument()
})

test('opening a scan loads its frames and flags the numbers below the quality gate', async () => {
  render(<FaceHistory />)
  // Chỉ dòng lượt quét có aria-expanded; nút thành viên dùng aria-pressed
  const row = await screen.findByRole('button', { name: /Hùng/, expanded: false })
  fireEvent.click(row)

  await waitFor(() => expect(adminApi.getFaceScan).toHaveBeenCalledWith(11))
  const table = await screen.findByRole('table')
  const cells = within(table).getAllByRole('row')
  expect(cells).toHaveLength(3)
  // Sáng 31 < 40: ô được tô đỏ
  expect(within(cells[2]).getByText('31')).toHaveClass('is-low')
  expect(screen.getByText(/Gợi ý:/)).toBeInTheDocument()
})

test('picking a member filters the scan list to that member', async () => {
  render(<FaceHistory />)
  const memberList = await screen.findByRole('heading', { name: 'Theo thành viên' })
  const section = memberList.closest('section')
  fireEvent.click(within(section).getByRole('button', { name: /Hùng/ }))

  await waitFor(() => expect(adminApi.listFaceScans).toHaveBeenLastCalledWith({ filter: 'all', studentId: 20 }))
  expect(await screen.findByText(/Chỉ các lượt của/)).toBeInTheDocument()
})

test('explains how to create the history table when migration 018 has not run', async () => {
  adminApi.getFaceSummary.mockResolvedValue({ ready: false })
  adminApi.listFaceScans.mockResolvedValue({ ready: false, items: [], nextBefore: null })
  render(<FaceHistory />)
  expect(await screen.findByText(/npm run migrate/)).toBeInTheDocument()
})
