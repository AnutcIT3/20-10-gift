import { useMemo, useState } from 'react'
import dataBanNu from '../Data/BanNu'
import logoclass from '../assets/logoclass.jpg'

const normalizeName = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')

function Girls() {
  const [name, setName] = useState('')
  const [searchedName, setSearchedName] = useState('')

  const girl = useMemo(() => {
    const keyword = normalizeName(searchedName)

    if (!keyword) {
      return null
    }

    return dataBanNu.find((item) => normalizeName(item.hoVaTen) === keyword)
  }, [searchedName])

  const hasSearched = searchedName.trim().length > 0

  const handleSubmit = (event) => {
    event.preventDefault()
    setSearchedName(name)
  }

  return (
    <main className="girls-page">
      <section className="girls-search">
        <p className="girls-eyebrow">20/10</p>
        <h1>Lời chúc dành cho bạn nữ</h1>
        <form className="girls-form" onSubmit={handleSubmit}>
          <label htmlFor="girl-name">Nhập tên bạn nữ</label>
          <div className="girls-form-row">
            <input
              id="girl-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: Nguyễn Thị A"
            />
            <button type="submit">Enter</button>
          </div>
        </form>
      </section>

      {girl && (
        <section className="girl-result" aria-live="polite">
          <div className="girl-photo-wrap">
            <img
              src={girl.hinhAnh}
              alt={girl.hoVaTen}
              className="girl-photo"
              onError={(event) => {
                event.currentTarget.src = logoclass
              }}
            />
          </div>
          <div className="girl-message">
            <p className="girl-label">Admin gửi tới</p>
            <h2>{girl.hoVaTen}</h2>
            <p>{girl.loiChucCuaAdmin}</p>
          </div>
        </section>
      )}

      {!girl && hasSearched && (
        <p className="girl-empty" aria-live="polite">
          Chúc bạn "{searchedName}" một ngày 20-10 vui vẻ.
        </p>
      )}
    </main>
  )
}

export default Girls
