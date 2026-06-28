import { useState } from 'react'
import dataBanNu from '../Data/BanNu'
import { addLoiChuc } from '../Data/LoiChuc'
import './Style.css'

const normalizeName = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ä‘/g, 'd')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')

function BoysWish() {
  const [senderName, setSenderName] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [wish, setWish] = useState('')
  const [sentWish, setSentWish] = useState(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    const receiver = dataBanNu.find(
      (girl) => normalizeName(girl.hoVaTen) === normalizeName(receiverName),
    )

    const newWish = addLoiChuc({
      tenNguoiGui: senderName.trim(),
      noiDung: wish.trim(),
      idBanNu: receiver?.id ?? null,
      tenNguoiNhan: receiverName.trim(),
    })

    setSentWish({
      ...newWish,
      senderName: senderName.trim(),
      receiverName: receiverName.trim(),
      wish: wish.trim(),
    })

    setSenderName('')
    setReceiverName('')
    setWish('')
  }

  return (
    <main className="boys-wish-page">
      <section className="boys-wish-header">
        <p className="boys-wish-eyebrow">Lời chúc từ bạn nam</p>
        <h1>Gửi lời chúc 20/10</h1>
      </section>

      <form className="boys-wish-form" onSubmit={handleSubmit}>
        <label htmlFor="sender-name">Tên của bạn</label>
        <input
          id="sender-name"
          type="text"
          value={senderName}
          onChange={(event) => setSenderName(event.target.value)}
          placeholder="Ví dụ: Nguyễn Văn A"
          required
        />

        <label htmlFor="receiver-name">Gửi đến ai</label>
        <input
          id="receiver-name"
          type="text"
          value={receiverName}
          onChange={(event) => setReceiverName(event.target.value)}
          placeholder="Ví dụ: Nguyễn Thị B"
          required
        />

        <label htmlFor="wish-content">Lời chúc</label>
        <textarea
          id="wish-content"
          value={wish}
          onChange={(event) => setWish(event.target.value)}
          placeholder="Nhập lời chúc của bạn..."
          rows="5"
          required
        />

        <button type="submit">Gửi lời chúc</button>
      </form>

      {sentWish && (
        <section className="boys-wish-card" aria-live="polite">
          <p className="boys-wish-card-label">Đã gửi lời chúc</p>
          <h2>{sentWish.receiverName}</h2>
          <p className="boys-wish-content">{sentWish.wish}</p>
          <p className="boys-wish-sender">Từ: {sentWish.senderName}</p>
        </section>
      )}
    </main>
  )
}

export default BoysWish
