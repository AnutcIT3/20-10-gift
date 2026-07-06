import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

function MusicPlayer() {
  const audioRef = useRef(null)
  const { pathname } = useLocation()
  const [playing, setPlaying] = useState(false)
  const [musicSrc, setMusicSrc] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (pathname.startsWith('/admin') && audioRef.current) {
      audioRef.current.pause()
    }
  }, [pathname])

  if (pathname.startsWith('/admin')) return null
  const toggle = async () => {
    if (!musicSrc) {
      setLoading(true)
      try {
        const module = await import('../music/Đường Tôi Chở Em Về ⧸ buitruonglinh _ Lyrics Video _ (mp3cut.net).mp3?url')
        setMusicSrc(module.default)
        requestAnimationFrame(() => audioRef.current?.play().then(() => setPlaying(true)).catch(() => setPlaying(false)))
      } finally {
        setLoading(false)
      }
      return
    }
    if (!audioRef.current) return
    if (audioRef.current.paused) {
      try { await audioRef.current.play(); setPlaying(true) } catch { setPlaying(false) }
    } else { audioRef.current.pause(); setPlaying(false) }
  }
  return (
    <div className="music-player">
      {musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="none" onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
      <button type="button" onClick={toggle} disabled={loading} aria-label={playing ? 'Tạm dừng nhạc' : 'Phát nhạc'}>
        {playing ? '⏸' : '♫'} <span>{loading ? 'Đang tải...' : playing ? 'Tạm dừng' : 'Bật nhạc'}</span>
      </button>
    </div>
  )
}

export default MusicPlayer
