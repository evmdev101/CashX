import { useEffect, useState } from 'react'

// Current unix time (seconds), ticking every `intervalMs`. Drives the
// countdown AND the mint-window state so badges/buttons flip live the
// moment the clock crosses mintStart/mintEnd — no refresh needed.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
