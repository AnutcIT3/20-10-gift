import Polaroid from './paper/Polaroid'
import Postmark from './paper/Postmark'
import Stamp from './paper/Stamp'
import { CLASS_NAME } from '../lib/event'

function HeroSection({ student }) {
  const displayName = student.nickname || student.full_name
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()
  const isFriend = student.member_type === 'friend'

  return (
    <section className="hero">
      <div className="hero__text">
        <Postmark className="hero__postmark" />
        <h1 className="hero__title">Gửi <span>{displayName}</span>,</h1>
        {student.intro_message && <p className="hero__intro">{student.intro_message}</p>}
      </div>
      <div className="hero__photo">
        <Polaroid
          src={student.avatar_url}
          alt={student.full_name}
          fallback={initial}
          square
          sway
          tapeRotate={-4}
          caption={isFriend ? `${displayName} ♡` : `${displayName} — ${CLASS_NAME} ♡`}
          className="hero__polaroid"
        >
          {!isFriend && <Stamp variant="logo" rotate={8} className="hero__stamp" />}
        </Polaroid>
      </div>
    </section>
  )
}

export default HeroSection
