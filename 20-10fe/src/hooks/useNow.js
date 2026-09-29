import { useEffect, useState } from 'react'

// Đồng hồ nhịp đều cho các màn đếm ngược; enabled=false thì đứng yên
function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])
  return now
}

export default useNow
