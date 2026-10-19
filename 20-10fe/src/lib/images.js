// Một lời chúc kèm tối đa 4 ảnh. Máy chủ trả `images: [{ id, url }]`; bản cũ
// (hay máy chủ chưa cập nhật) chỉ có một `image_url` — đọc được cả hai.

export function letterImageUrls(letter) {
  if (Array.isArray(letter?.images) && letter.images.length) {
    return letter.images.map((image) => image.url).filter(Boolean)
  }
  return letter?.image_url ? [letter.image_url] : []
}

// kind: intro | admin_wish | greeting → [{ id, url }] (id null = ảnh ở cột cũ)
export function wishImages(student, kind) {
  const list = student?.[`${kind}_images`]
  if (Array.isArray(list) && list.length) return list.filter((image) => image?.url)
  const url = student?.[`${kind}_image_url`]
  return url ? [{ id: null, url }] : []
}

export function wishImageUrls(student, kind) {
  return wishImages(student, kind).map((image) => image.url)
}

// Lời chúc riêng và 💌 lời chúc từ admin: tối đa 4 lời mỗi loại. Lời thứ nhất ở
// cột cũ (intro_message / admin_wish, ảnh ở *_images); các lời thêm ở *_notes.
export const MAX_WISH_NOTES = 4
const NOTE_FIELDS = { intro: 'intro_message', admin_wish: 'admin_wish' }

// [{ key, content, urls }] theo thứ tự, bỏ lời không chữ không ảnh
export function wishNotes(student, kind) {
  const main = { key: 'main', content: student?.[NOTE_FIELDS[kind]] || '', urls: wishImageUrls(student, kind) }
  const extras = (student?.[`${kind}_notes`] || []).map((note) => ({
    key: note.id,
    content: note.content || '',
    urls: (note.images || []).map((image) => image.url).filter(Boolean),
  }))
  return [main, ...extras].filter((note) => note.content || note.urls.length)
}
