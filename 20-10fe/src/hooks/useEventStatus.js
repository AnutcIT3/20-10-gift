import { useCallback, useEffect, useState } from 'react'
import giftRepository from '../api/giftRepository'
import { serverOffset } from '../lib/event'

const POLL_MS = 30_000

/**
 * Trạng thái 20/10 dùng chung cho trang chủ: đang khoá hay đã mở, giờ tự mở,
 * bông hoa 12A1 (bao nhiêu bạn đã mở quà) và số thư hồi âm. Hỏi lại mỗi 30
 * giây khi tab đang hiện. `offset` là độ lệch đồng hồ máy này so với máy chủ;
 * `justOpened` bật lên khi chính trang này chứng kiến quà chuyển từ khoá sang
 * mở, và tắt nếu quà bị khoá lại.
 * Lỗi mạng thì giữ trạng thái cũ — trang chủ không được hỏng vì phần trang trí.
 */
function useEventStatus() {
  const [state, setState] = useState({ status: null, offset: 0, justOpened: false })

  const refresh = useCallback(async () => {
    const sentAt = Date.now()
    try {
      const status = await giftRepository.getEventStatus()
      const offset = serverOffset(status?.serverNow, sentAt, Date.now())
      setState((current) => ({
        status,
        offset,
        // Khoá lại (admin thử rồi khoá, hay khoá để sửa thư) thì tắt lời "quà đã mở"
        justOpened: status?.locked
          ? false
          : current.justOpened || Boolean(current.status?.locked && status && !status.locked),
      }))
      return status
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    // setTimeout 0: setState chỉ chạy trong callback bất đồng bộ (react-hooks v7)
    const initial = setTimeout(refresh, 0)
    const interval = setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)
    const handleVisibility = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  return { ...state, refresh }
}

export default useEventStatus
