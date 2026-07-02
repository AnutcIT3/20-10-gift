function EmptyState({ icon = '🌸', message = 'Chưa có gì ở đây cả' }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p className="empty-state-message">{message}</p>
    </div>
  )
}

export default EmptyState
