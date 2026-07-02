// src/api/giftRepository.js
// Abstraction layer: chuyển mock ↔ API bằng env, không sửa component
import mockGiftRepository from './mockGiftRepository'
import httpGiftRepository from './httpGiftRepository'

const giftRepository =
  import.meta.env.VITE_USE_MOCK === 'true'
    ? mockGiftRepository
    : httpGiftRepository

export default giftRepository
