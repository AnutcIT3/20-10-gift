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
