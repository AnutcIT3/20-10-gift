function EmptyState({ icon = '🌸', message = 'Chưa có gì ở đây cả' }) {
  return (
    <div className="empty-note">
      <span className="empty-note__icon" aria-hidden="true">{icon}</span>
      <p>{message}</p>
    </div>
  )
}

export default EmptyState
