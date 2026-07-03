import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
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
