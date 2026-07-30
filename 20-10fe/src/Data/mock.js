const mockStudents = [
  {
    id: 1,
    full_name: 'Nguyen Thuy Vy',
    nickname: 'Vy',
    avatar_url: 'https://picsum.photos/seed/vy/400/400',
    intro_message:
      'Cam on cau da ghe tham trang nay. Chuc cau mot ngay 20/10 that vui ve va hanh phuc nhe!',
    class_name: 'A1',
    access_code: 'vy1020',
    seat_row: 2,
    seat_col: 3,
  },
  {
    id: 2,
    full_name: 'Tran Mai Anh',
    nickname: 'Anh',
    avatar_url: 'https://picsum.photos/seed/maianh/400/400',
    intro_message:
      'Chuc cau mot ngay 20/10 that rang ro, luon vui ve va tu tin nhe!',
    class_name: 'A1',
    access_code: 'anh2010',
    seat_row: 3,
    seat_col: 5,
  },
]

const mockStudent = mockStudents[0]

const mockGallery = [
  {
    id: 1,
    image_url: 'https://picsum.photos/seed/photo1/800/600',
    caption: 'Di choi bien he nam ay',
    display_order: 0,
  },
  {
    id: 2,
    image_url: 'https://picsum.photos/seed/photo2/600/800',
    caption: 'Tui minh ngay dau vao lop',
    display_order: 1,
  },
  {
    id: 3,
    image_url: 'https://picsum.photos/seed/photo3/800/800',
    caption: 'An vat sau gio hoc',
    display_order: 2,
  },
  {
    id: 4,
    image_url: 'https://picsum.photos/seed/photo4/600/600',
    caption: 'Ky niem dang nho',
    display_order: 3,
  },
  {
    id: 5,
    image_url: 'https://picsum.photos/seed/photo5/800/600',
    caption: 'Chup cung hoi ban than',
    display_order: 4,
  },
  {
    id: 6,
    image_url: 'https://picsum.photos/seed/photo6/600/800',
    caption: 'Mot ngay nang dep',
    display_order: 5,
  },
]

const mockLetters = [
  {
    id: 1,
    sender_name: 'Hoang Nam',
    title: 'Chuc Vy 20/10 vui ve!',
    content:
      'Chuc Vy luon xinh dep, hoc gioi va luon tuoi cuoi nhe. Rat vui khi duoc lam ban cung lop voi Vy!',
    created_at: '2026-10-18T14:30:00Z',
    is_anonymous: false,
  },
  {
    id: 2,
    sender_name: null,
    title: 'Loi chuc an danh',
    content:
      'Ban la nguoi ban tuyet voi nhat lop minh. Cam on vi da luon giup do moi nguoi nhe! 20/10 vui ve nha.',
    created_at: '2026-10-18T10:15:00Z',
    is_anonymous: true,
  },
  {
    id: 3,
    sender_name: 'Minh Anh',
    title: 'Gui chut yeu thuong',
    content:
      'Chuc cau ngay 20/10 that y nghia. Mong rang cau se luon gap nhieu may man va thanh cong tren con duong phia truoc. Co len nhe!',
    created_at: '2026-10-17T20:00:00Z',
    is_anonymous: false,
  },
]

const mockEmptyGallery = []
const mockEmptyLetters = []

export { mockStudent, mockStudents, mockGallery, mockLetters, mockEmptyGallery, mockEmptyLetters }
