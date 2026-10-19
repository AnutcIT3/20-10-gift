import Polaroid from './paper/Polaroid'
import Postmark from './paper/Postmark'
import Stamp from './paper/Stamp'
import PhotoSet from './PhotoSet'
import { CLASS_NAME, GUEST_POSTMARK } from '../lib/event'
import { wishNotes } from '../lib/images'

function HeroSection({ student }) {
  const displayName = student.nickname || student.full_name
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()
  const isFriend = student.member_type === 'friend'

  return (
    <section className="hero">
      <div className="hero__text">
        {/* Khách ngoài lớp: dấu "GỬI BẠN" thay cho dấu tên lớp */}
        <Postmark className="hero__postmark" lines={isFriend ? GUEST_POSTMARK : undefined} />
        <h1 className="hero__title">Gửi <span>{displayName}</span>,</h1>
        {/* Lời chúc riêng (tối đa 4 lời, mỗi lời kèm ảnh riêng — admin viết ở
            Lời chúc → Riêng từng bạn) */}
        {wishNotes(student, 'intro').map((note) => (
          <div key={note.key} className="hero__note">
            {note.content && <p className="hero__intro">{note.content}</p>}
            <PhotoSet urls={note.urls} alt="Ảnh kèm lời chúc riêng" rotate={2} className="hero__intro-photo" />
          </div>
        ))}
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
