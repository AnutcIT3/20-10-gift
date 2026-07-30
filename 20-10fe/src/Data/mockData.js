const mockStudent = {
  id: 1,
  full_name: 'Nguyễn Thúy Vy',
  nickname: 'Vy',
  avatar_url: 'https://picsum.photos/seed/vy/400/400',
  intro_message:
    'Cảm ơn cậu đã ghé thăm trang này 💐 Chúc cậu một ngày 20/10 thật vui vẻ và hạnh phúc nhé!',
  class_name: 'A1',
}

const mockGallery = [
  {
    id: 1,
    image_url: 'https://picsum.photos/seed/photo1/800/600',
    caption: 'Đi chơi biển hè năm ấy 📸',
    display_order: 0,
  },
  {
    id: 2,
    image_url: 'https://picsum.photos/seed/photo2/600/800',
    caption: 'Tụi mình ngày đầu vào lớp',
    display_order: 1,
  },
  {
    id: 3,
    image_url: 'https://picsum.photos/seed/photo3/800/800',
    caption: 'Ăn vặt sau giờ học',
    display_order: 2,
  },
  {
    id: 4,
    image_url: 'https://picsum.photos/seed/photo4/600/600',
    caption: 'Kỷ niệm đáng nhớ',
    display_order: 3,
  },
  {
    id: 5,
    image_url: 'https://picsum.photos/seed/photo5/800/600',
    caption: 'Chụp cùng hội bạn thân',
    display_order: 4,
  },
  {
    id: 6,
    image_url: 'https://picsum.photos/seed/photo6/600/800',
    caption: 'Một ngày nắng đẹp ☀️',
    display_order: 5,
  },
]

const mockLetters = [
  {
    id: 1,
    sender_name: 'Hoàng Nam',
    title: 'Chúc Vy 20/10 vui vẻ!',
    content:
      'Chúc Vy luôn xinh đẹp, học giỏi và luôn tươi cười nhé. Rất vui khi được làm bạn cùng lớp với Vy!',
    created_at: '2026-10-18T14:30:00Z',
    is_anonymous: false,
  },
  {
    id: 2,
    sender_name: null,
    title: 'Lời chúc ẩn danh',
    content:
      'Bạn là người bạn tuyệt vời nhất lớp mình. Cảm ơn vì đã luôn giúp đỡ mọi người nhé! 20/10 vui vẻ nha 🎉',
    created_at: '2026-10-18T10:15:00Z',
    is_anonymous: true,
  },
  {
    id: 3,
    sender_name: 'Minh Anh',
    title: 'Gửi chút yêu thương',
    content:
      'Chúc cậu ngày 20/10 thật ý nghĩa. Mong rằng cậu sẽ luôn gặp nhiều may mắn và thành công trên con đường phía trước. Cố lên nhé!',
    created_at: '2026-10-17T20:00:00Z',
    is_anonymous: false,
  },
]

export { mockStudent, mockGallery, mockLetters }
