const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'gift_admin_token'

export const adminAuth = {
  getToken: () => sessionStorage.getItem(TOKEN_KEY),
  setToken: (token) => {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.setItem(TOKEN_KEY, token)
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
  },
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  const token = adminAuth.getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/admin/login') adminAuth.clear()
    const error = new Error(payload?.message || `Yêu cầu thất bại (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload?.data
}

export const adminApi = {
  login: (username, password) => request('/api/auth/admin/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  verifySession: () => request('/api/auth/admin/me'),
  listStudents: () => request('/api/students'),
  createStudent: (data) => request('/api/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id, data) => request(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateStudent: (id) => request(`/api/students/${id}/deactivate`, { method: 'PATCH' }),
  activateStudent: (id) => request(`/api/students/${id}/activate`, { method: 'PATCH' }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: 'DELETE' }),
  updateGiftLink: (id, accessCode) => request(`/api/students/${id}/access-code`, {
    method: 'PATCH', body: JSON.stringify({ access_code: accessCode }),
  }),
  updateStudentSeat: (id, seatRow, seatCol) => request(`/api/students/${id}/seat`, {
    method: 'PATCH', body: JSON.stringify({ seat_row: seatRow, seat_col: seatCol }),
  }),
  listGallery: (studentId) => request(`/api/admin/students/${studentId}/gallery`),
  uploadImage: (formData) => request('/api/gallery/upload', { method: 'POST', body: formData }),
  updateImageCaption: (id, caption) => request(`/api/gallery/${id}/caption`, {
    method: 'PATCH', body: JSON.stringify({ caption }),
  }),
  reorderGallery: (items) => request('/api/gallery/reorder', {
    method: 'PUT', body: JSON.stringify({ items }),
  }),
  deleteImage: (id) => request(`/api/gallery/${id}`, { method: 'DELETE' }),
  listLetters: ({ status, studentId, page = 1, pageSize = 20 }) => {
    const params = new URLSearchParams({ status, page, pageSize })
    if (studentId) params.set('studentId', studentId)
    return request(`/api/admin/letters?${params}`)
  },
  createLetters: (data) => request('/api/admin/letters', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateLetter: (id, data) => request(`/api/letters/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  updateLetterStatus: (id, status) => request(`/api/letters/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  }),
  bulkUpdateLetterStatus: (ids, status) => request('/api/admin/letters/bulk/status', {
    method: 'PATCH', body: JSON.stringify({ ids, status }),
  }),
  deleteLetter: (id) => request(`/api/letters/${id}`, { method: 'DELETE' }),
  bulkDeleteLetters: (ids) => request('/api/admin/letters/bulk', {
    method: 'DELETE', body: JSON.stringify({ ids }),
  }),
  getStats: () => request('/api/admin/stats'),
  getDataRevision: () => request('/api/admin/data-revision'),
  exportStudents: async () => {
    const token = adminAuth.getToken()
    const response = await fetch(`${API_BASE_URL}/api/admin/export/students`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`Export thất bại (${response.status})`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `hoc-sinh-${new Date().toISOString().slice(0, 10)}.csv`
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  },
}
