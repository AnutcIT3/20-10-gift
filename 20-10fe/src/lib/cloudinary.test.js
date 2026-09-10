import { describe, expect, it } from 'vitest'
import { cld, CLD_AVATAR, CLD_FULL, CLD_THUMB } from './cloudinary'

const ORIGINAL = 'https://res.cloudinary.com/demo/image/upload/v1725000000/gift_20_10/abc123.jpg'

describe('cld', () => {
  it('chèn tham số biến đổi ngay sau /image/upload/', () => {
    expect(cld(ORIGINAL)).toBe(
      `https://res.cloudinary.com/demo/image/upload/${CLD_THUMB}/v1725000000/gift_20_10/abc123.jpg`,
    )
    expect(cld(ORIGINAL, CLD_FULL)).toContain(`/image/upload/${CLD_FULL}/v1725000000/`)
    expect(cld(ORIGINAL, CLD_AVATAR)).toContain('g_face')
  })

  it('không chèn hai lần khi URL đã có biến đổi', () => {
    const once = cld(ORIGINAL)
    expect(cld(once)).toBe(once)
  })

  it('để nguyên URL không phải Cloudinary, blob và giá trị rỗng', () => {
    expect(cld('blob:http://localhost/123')).toBe('blob:http://localhost/123')
    expect(cld('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(cld('/logoclass.jpg')).toBe('/logoclass.jpg')
    expect(cld(null)).toBe(null)
    expect(cld(undefined)).toBe(undefined)
  })

  it('chấp nhận URL không có số phiên bản', () => {
    const noVersion = 'https://res.cloudinary.com/demo/image/upload/gift_20_10/abc.png'
    expect(cld(noVersion)).toBe(
      `https://res.cloudinary.com/demo/image/upload/${CLD_THUMB}/gift_20_10/abc.png`,
    )
  })
})
