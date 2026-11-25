import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Dino } from './PixelArt'
import { previewsAreComingFromCache, usePreviewProgress } from './imageReadiness'

export function StartupGate({ children }: { children: ReactNode }) {
  const { settled, total } = usePreviewProgress()
  const [skip, setSkip] = useState(false)
  const [checkCache, setCheckCache] = useState(false)
  const [showArt, setShowArt] = useState(false)
  const [showSkip, setShowSkip] = useState(false)
  const returnFocus = useRef(false)
  const entered = useRef(false)
  const ready = entered.current || skip || settled === total

  useLayoutEffect(() => {
    if (!ready) return
    entered.current = true
    if (returnFocus.current) {
      document.querySelector<HTMLElement>('.brand')?.focus({ preventScroll: true })
      returnFocus.current = false
    }
  }, [ready])

  useEffect(() => {
    if (ready) return
    // Suppress a flash on fast cache hits. Readiness always opens the site immediately.
    const reveal = window.setTimeout(() => setCheckCache(true), 180)
    const offerSkip = window.setTimeout(() => setShowSkip(true), 3000)
    const deadline = window.setTimeout(() => setSkip(true), 12000)
    return () => {
      window.clearTimeout(reveal)
      window.clearTimeout(offerSkip)
      window.clearTimeout(deadline)
    }
  }, [ready])

  useEffect(() => {
    if (!ready && checkCache && !showArt && (showSkip || !previewsAreComingFromCache())) setShowArt(true)
  }, [ready, checkCache, showArt, showSkip, settled])

  if (ready) return children
  return <main className="startup" aria-label="ASLAN.EXE">
    <p className="sr-only" role="status">Loading portfolio images.</p>
    {showArt && <div className="startup-art" data-startup-loader>
      <h1>ASLAN<span>.EXE</span></h1>
      <div className="startup-track" aria-hidden="true" style={{ '--readiness': total ? settled / total : 1 } as CSSProperties}>
        <div className="startup-lane"><Dino running unicorn={false} interactive={false} motion={false} /></div>
        <span className="finish-flag" />
      </div>
      {showSkip && <button className="startup-skip" onFocus={() => { returnFocus.current = true }} onClick={() => setSkip(true)}>Skip</button>}
    </div>}
  </main>
}
