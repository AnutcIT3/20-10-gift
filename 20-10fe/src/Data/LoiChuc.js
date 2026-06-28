const dataLoiChuc = [
  {
    id: 101,
    tenNguoiGui: "Hoàng Nam",
    noiDung: "Chúc cậu sinh nhật vui vẻ nhé Vy ơi, tuổi mới thật nhiều niềm vui!",
    idBanNu: 1 // Liên kết tới Nguyễn Thúy Vy (id: 1)
  },
  {
    id: 102,
    tenNguoiGui: "Minh Tuấn",
    noiDung: "Gửi lời chúc tốt đẹp nhất đến Vy, mong mọi điều may mắn sẽ đến với cậu.",
    idBanNu: 1 // Liên kết tới Nguyễn Thúy Vy (id: 1)
  },
  {
    id: 103,
    tenNguoiGui: "Khánh Linh",
    noiDung: "Chúc Mai Anh luôn học tốt và mãi giữ nụ cười tươi trên môi nha!",
    idBanNu: 2 // Liên kết tới Trần Mai Anh (id: 2)
  }
];

const STORAGE_KEY = 'dataLoiChuc'

export const getSavedLoiChuc = () => {
  if (typeof window === 'undefined') {
    return []
  }

  const savedData = window.localStorage.getItem(STORAGE_KEY)

  if (!savedData) {
    return []
  }

  try {
    return JSON.parse(savedData)
  } catch {
    return []
  }
}

export const getAllLoiChuc = () => [...dataLoiChuc, ...getSavedLoiChuc()]

export const addLoiChuc = ({ tenNguoiGui, noiDung, idBanNu, tenNguoiNhan }) => {
  const savedLoiChuc = getSavedLoiChuc()
  const newLoiChuc = {
    id: Date.now(),
    tenNguoiGui,
    noiDung,
    idBanNu,
    tenNguoiNhan,
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...savedLoiChuc, newLoiChuc]),
  )

  return newLoiChuc
}

export default dataLoiChuc;
