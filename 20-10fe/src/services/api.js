import axios from 'axios'

// ── Session ID (stable per browser, shared với reaction + view tracking) ──────
function getOrCreateSessionId() {
  const KEY = 'gift_session_id'
  let sid = localStorage.getItem(KEY)
  if (!sid || sid.length < 16) {
    sid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    try { localStorage.setItem(KEY, sid) } catch { /* ignore */ }
  }
  return sid
}

const SESSION_ID = getOrCreateSessionId()

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': SESSION_ID,
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = new Error(
      error.response?.data?.message
      || (error.code === 'ECONNABORTED' ? 'Máy chủ phản hồi quá chậm' : 'Không thể kết nối tới máy chủ'),
    )
    normalized.status = error.response?.status
    normalized.isNetworkError = !error.response
    return Promise.reject(normalized)
  },
)

export default api
