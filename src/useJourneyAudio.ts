import { useCallback, useEffect, useRef, useState } from 'react'
import { JourneyAudio, supportsJourneyAudio } from './journeyAudio'

type JourneyAudioOptions = { world: number; portal: number; returning: boolean; blocked: boolean }

export function useJourneyAudio({ world, portal, returning, blocked }: JourneyAudioOptions) {
  const [supported] = useState(supportsJourneyAudio)
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const engine = useRef<JourneyAudio | null>(null)
  const wanted = useRef(false)
  const activating = useRef(false)
  const mounted = useRef(true)
  const operation = useRef(0)
  const options = useRef({ world, blocked })
  options.current = { world, blocked }

  const activate = useCallback(() => {
    if (!mounted.current || document.hidden || activating.current) return
    const currentOperation = ++operation.current
    activating.current = true
    setPending(true)
    setError(null)
    try {
      engine.current ??= new JourneyAudio(() => {
        if (!mounted.current) return
        operation.current += 1
        wanted.current = false
        activating.current = false
        setEnabled(false)
        setPending(false)
        setError('Tap Sound to resume.')
      })
      const audio = engine.current
      audio.setWorld(options.current.world)
      audio.setBlocked(options.current.blocked)
      void audio.start().then(ready => {
        if (!mounted.current || currentOperation !== operation.current) return
        activating.current = false
        setPending(false)
        setEnabled(ready)
        if (!ready) {
          wanted.current = false
          audio.dispose()
          if (engine.current === audio) engine.current = null
          setError('Tap Sound to try again.')
        }
      })
    } catch {
      wanted.current = false
      activating.current = false
      engine.current?.dispose()
      engine.current = null
      setEnabled(false)
      setPending(false)
      setError('Sound unavailable. Try again.')
    }
  }, [])

  const toggle = useCallback(() => {
    if (wanted.current) {
      wanted.current = false
      activating.current = false
      operation.current += 1
      engine.current?.pause()
      setEnabled(false)
      setPending(false)
      setError(null)
      return
    }
    if (!supported) {
      setError('Sound is unavailable in this browser.')
      return
    }
    wanted.current = true
    activate()
  }, [activate, supported])

  const jump = useCallback(() => engine.current?.jump(), [])

  useEffect(() => { engine.current?.setWorld(world) }, [world])
  useEffect(() => { engine.current?.setBlocked(blocked) }, [blocked])

  useEffect(() => {
    mounted.current = true
    const suspend = () => {
      operation.current += 1
      activating.current = false
      engine.current?.pause()
      setEnabled(false)
      setPending(false)
    }
    const resume = () => {
      if (wanted.current && !document.hidden && !engine.current?.isRunning) activate()
    }
    const visibility = () => document.hidden ? suspend() : resume()
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', suspend)
    window.addEventListener('pageshow', resume)
    return () => {
      mounted.current = false
      operation.current += 1
      wanted.current = false
      activating.current = false
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', suspend)
      window.removeEventListener('pageshow', resume)
      engine.current?.dispose()
      engine.current = null
    }
  }, [activate])

  const soundedPortal = useRef(-1)
  useEffect(() => {
    if (portal < 0) {
      // Brief movement across a portal boundary must not produce a sound burst.
      const timer = window.setTimeout(() => { soundedPortal.current = -1 }, 600)
      return () => window.clearTimeout(timer)
    }
    if (soundedPortal.current !== portal) {
      soundedPortal.current = portal
      engine.current?.jump()
      engine.current?.warp()
    }
  }, [portal])

  const wasReturning = useRef(false)
  useEffect(() => {
    if (returning && !wasReturning.current) engine.current?.warp()
    wasReturning.current = returning
  }, [returning])

  return { enabled, supported, pending, error, toggle, jump }
}
