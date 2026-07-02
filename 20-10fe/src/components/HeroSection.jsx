import { useState } from 'react'

function HeroSection({ student }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = (student.nickname || student.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <div className="hero-avatar-wrap">
          {!imageFailed && student.avatar_url ? (
            <img
              src={student.avatar_url}
              alt={student.full_name}
              className="hero-avatar"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="hero-avatar-fallback" aria-label={student.full_name}>{initial}</span>
          )}
        </div>
        <h1 className="hero-name">
          {student.nickname || student.full_name}
        </h1>
        <p className="hero-intro">{student.intro_message}</p>
      </div>
    </section>
  )
}

export default HeroSection
