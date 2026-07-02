import EmptyState from './EmptyState'

function LetterCard({ letter }) {
  return (
    <div className="letter-card">
      <div className="letter-header">
        {letter.is_anonymous || !letter.sender_name ? (
          <span className="letter-sender letter-anonymous">Ẩn danh</span>
        ) : (
          <span className="letter-sender">{letter.sender_name}</span>
        )}
        {letter.title && <span className="letter-title">{letter.title}</span>}
      </div>
      <p className="letter-content">{letter.content}</p>
      <time className="letter-date">
        {new Date(letter.created_at).toLocaleDateString('vi-VN', {
          day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </time>
    </div>
  )
}

function LetterSection({ letters = [] }) {
  return (
    <section className="letters-section">
      <h2 className="section-title">💌 Những lời chúc dành cho bạn</h2>
      {letters.length > 0 ? <div className="letters-list">{letters.map((letter) => <LetterCard key={letter.id} letter={letter} />)}</div>
        : <EmptyState icon="💬" message="Chưa có lời chúc nào..." />}
    </section>
  )
}

export default LetterSection
