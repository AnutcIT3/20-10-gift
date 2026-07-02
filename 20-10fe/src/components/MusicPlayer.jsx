import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import musicSrc from '../music/Đường Tôi Chở Em Về ⧸ buitruonglinh _ Lyrics Video _ (mp3cut.net).mp3'

function MusicPlayer() {
  const audioRef = useRef(null)
  const { pathname } = useLocation()
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (pathname.startsWith('/admin') && audioRef.current) {
      audioRef.current.pause()
    }
  }, [pathname])

  if (pathname.startsWith('/admin')) return null
  const toggle = async () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) {
      try { await audioRef.current.play(); setPlaying(true) } catch { setPlaying(false) }
    } else { audioRef.current.pause(); setPlaying(false) }
  }
  return (
    <div className="music-player">
      <audio ref={audioRef} src={musicSrc} loop preload="metadata" onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <button type="button" onClick={toggle} aria-label={playing ? 'Tạm dừng nhạc' : 'Phát nhạc'}>{playing ? '⏸' : '♫'} <span>{playing ? 'Tạm dừng' : 'Bật nhạc'}</span></button>
    </div>
  )
}

export default MusicPlayer
