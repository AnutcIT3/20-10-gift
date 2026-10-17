// Lời chúc tự động (✨) của một trang quà viết theo kiểu nào và gọi tên gì —
// dùng chung cho trang quà và nút "Xem thử" trong admin để hai nơi luôn khớp.
// - Bạn trong lớp (kể cả tài khoản thử): 'student', gọi họ tên.
// - Khách ngoài lớp có Face ID là bạn thân: 'close_friend', gọi biệt danh.
// - Khách thường: 'visitor', giữ lịch sự.
// closeFriend: trang quà nhận cờ close_friend; admin suy ra từ số hồ sơ Face ID.
export function greetingRequest({ member_type: memberType, full_name: fullName, nickname, closeFriend }) {
  if (memberType !== 'friend') return { name: fullName, audience: 'student' }
  if (closeFriend) return { name: nickname || fullName, audience: 'close_friend' }
  return { name: fullName, audience: 'visitor' }
}

export const AUDIENCE_LABELS = Object.freeze({
  student: 'bạn trong lớp',
  close_friend: 'bạn thân (khách có Face ID)',
  visitor: 'khách ghé thăm',
})
