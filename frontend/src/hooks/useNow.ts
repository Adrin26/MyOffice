import { useEffect, useState } from 'react'

/** Current time, refreshed on an interval, for relative timestamps. */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
