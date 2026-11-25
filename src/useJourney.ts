import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { beats, clamp, readRoute, routeEnd } from './story'

type Speed = 'Slow' | 'Normal' | 'Fast'

const additionalStopSpacing = .96
const additionalStops = ['gift', 'delivery', 'lostfound', 'lostcash', 'tour', 'training'] as const
const expandedLength = additionalStopSpacing * additionalStops.length
const expansionStart = beats[4].at
const expansionEnd = expansionStart + expandedLength

function anchor<Id extends string>(id: Id, beatIndex: number, offset = 0) {
  const beat = beats[beatIndex]
  return { id, beatIndex, world: beat.world, at: beat.at + offset, sceneAt: beat.at }
}

// The additional reading stops hold the scene phase at beat 4. The original
// scene/portal coordinates and the distances travelled through portals remain unchanged.
export const readingStops = [
  anchor('profile', 0),
  anchor('skills', 1),
  anchor('icare', 2),
  anchor('tofu', 3),
  anchor('tofu-systems', 4),
  ...additionalStops.map((id, index) => anchor(id, 4, (index + 1) * additionalStopSpacing)),
  anchor('pick-us', 5, expandedLength),
  anchor('deck-forge', 6, expandedLength),
  anchor('maipaws', 7, expandedLength),
  anchor('contact', 8, expandedLength),
] as const

export type ReadingStop = (typeof readingStops)[number]
export type ReadingStopId = ReadingStop['id']
export const chapterStops = ['profile', 'icare', 'pick-us', 'contact'] as const
export const routeLength = routeEnd + expandedLength

export function readJourney(travelPosition: number) {
  const position = clamp(travelPosition, 0, routeLength)
  const scenePosition = position <= expansionStart
    ? position
    : position <= expansionEnd
      ? expansionStart
      : position - expandedLength
  const route = readRoute(scenePosition)
  let stopIndex = readingStops.findIndex(stop => stop.world === route.world)
  for (let index = stopIndex + 1; index < readingStops.length; index++) {
    const stop = readingStops[index]
    if (stop.world !== route.world) break
    if (Math.abs(stop.at - position) < Math.abs(readingStops[stopIndex].at - position)) stopIndex = index
  }
  const chapter = readingStops.find(stop => stop.id === chapterStops[route.world])!
  return {
    ...route,
    stop: readingStops[stopIndex],
    stopIndex,
    scenePosition,
    travelPosition: position,
    worldTravel: Math.max(0, position - chapter.at),
    progress: position / routeLength,
  }
}

const speedOptions: Record<Speed, { travel: number; dwell: number }> = {
  Slow: { travel: .24, dwell: 12000 },
  Normal: { travel: .38, dwell: 10000 },
  Fast: { travel: .58, dwell: 8000 },
}

const motionPreference = 'aslan-ambient-motion'
const blockingOverlay = 'dialog[open], [role="dialog"][aria-modal="true"], [data-tour-settings-open]'
const scrollTolerance = 2
const settleQuietTime = 180
const settleMinimumTime = 220

type ActiveTour =
  | { phase: 'settling'; startedAt: number; stableSince: number; lastY: number }
  | { phase: 'reading'; index: number; until: number; seconds: number; lastY: number }
  | {
    phase: 'travelling'
    target: number
    lastTime: number
    fraction: number
    lastY: number
    requestedY: number
  }

function followsCommand(tour: ActiveTour, y: number) {
  if (tour.phase === 'settling') return true
  if (tour.phase === 'reading') return Math.abs(y - tour.lastY) <= scrollTolerance
  // Native compositor scroll acknowledgement may lag a request. Accept the
  // interval from the last observed point to the most recent requested point.
  return y >= tour.lastY - scrollTolerance && y <= tour.requestedY + scrollTolerance
}

function preferredAmbientMotion() {
  try {
    return localStorage.getItem(motionPreference) !== 'off'
  } catch {
    return true
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isTourExemptControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-auto-play], [data-auto-gesture]'))
}

function usesOwnArrowKeys(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'button, a[href], input, textarea, select, summary, [contenteditable], [role="button"], [role="slider"], [role="listbox"], dialog, [role="dialog"], [data-journey-keys]',
  ))
}

export function useJourney(track: RefObject<HTMLElement | null>, screen: RefObject<HTMLElement | null>) {
  const [travelPosition, setTravelPosition] = useState(0)
  const [running, setRunning] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [autoMode, setAutoMode] = useState<'paused' | 'travelling' | 'reading'>('paused')
  const [readingSeconds, setReadingSeconds] = useState(0)
  const [ended, setEnded] = useState(false)
  const [speed, setSpeed] = useState<Speed>('Slow')
  const [ambientMotion, setMotion] = useState(preferredAmbientMotion)
  const [reduced, setReduced] = useState(prefersReducedMotion)

  const runtime = useRef<ActiveTour | null>(null)
  const generation = useRef(0)
  const autoFrame = useRef(0)
  const speedRef = useRef(speed)

  const geometry = useCallback(() => {
    if (!track.current || !screen.current) return null
    const top = track.current.getBoundingClientRect().top + window.scrollY
    const range = track.current.offsetHeight - screen.current.offsetHeight
    return range > 0 ? { top, range, position: clamp((window.scrollY - top) / range) * routeLength } : null
  }, [track, screen])

  const pause = useCallback(() => {
    if (!runtime.current) return
    runtime.current = null
    generation.current++
    cancelAnimationFrame(autoFrame.current)
    autoFrame.current = 0
    setAutoMode('paused')
    setReadingSeconds(0)
    setRunning(false)
  }, [])

  const chooseSpeed = useCallback((value: Speed) => {
    speedRef.current = value
    setSpeed(value)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(motionPreference, ambientMotion ? 'on' : 'off')
    } catch {
      // The current setting still works when persistent storage is blocked.
    }
  }, [ambientMotion])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReduced(preference.matches)
      if (preference.matches) {
        pause()
        setRunning(false)
      }
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [pause])

  useEffect(() => {
    let frame = 0
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let lastY = window.scrollY
    const update = () => {
      frame = 0
      const layout = geometry()
      if (!layout) return
      setTravelPosition(layout.position)
      const y = window.scrollY
      setEnded(y >= layout.top + layout.range - 1)
      // A scrollbar or accessibility action can scroll without a pointer/key
      // event in the document. An uncommanded change is a manual interruption.
      if (runtime.current && !followsCommand(runtime.current, y)) pause()
      if (y === lastY) return
      setDirection(y > lastY ? 1 : -1)
      lastY = y
      if (prefersReducedMotion() || runtime.current?.phase === 'reading') {
        clearTimeout(idleTimer)
        setRunning(false)
        return
      }
      setRunning(true)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => setRunning(false), 140)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = () => {
      pause()
      schedule()
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(frame)
      clearTimeout(idleTimer)
    }
  }, [geometry, pause])

  const goTo = useCallback((id: ReadingStopId) => {
    pause()
    const stop = readingStops.find(item => item.id === id)
    const layout = geometry()
    if (!stop || !layout) return
    window.scrollTo({
      top: layout.top + stop.at / routeLength * layout.range,
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    })
  }, [geometry, pause])

  const move = useCallback((step: -1 | 1) => {
    const layout = geometry()
    if (!layout) return
    const { stopIndex } = readJourney(layout.position)
    goTo(readingStops[clamp(stopIndex + step, 0, readingStops.length - 1)].id)
  }, [geometry, goTo])

  const next = useCallback(() => move(1), [move])
  const previous = useCallback(() => move(-1), [move])

  useEffect(() => {
    const interrupt = () => pause()
    const interruptUnlessExempt = (event: Event) => {
      if (!isTourExemptControl(event.target)) pause()
    }
    let tabFocusPending = false
    let tabTimer: ReturnType<typeof setTimeout> | undefined
    const focusin = (event: FocusEvent) => {
      if (!tabFocusPending) return
      tabFocusPending = false
      clearTimeout(tabTimer)
      // Keyboard focus into a changing reading card needs a stable stop.
      // Focus traversal through persistent controls and the mascot is safe.
      if (event.target instanceof Element && event.target.closest('.reading-panel')) pause()
    }
    const keydown = (event: KeyboardEvent) => {
      const activatingExemptControl = isTourExemptControl(event.target) && (event.key === 'Enter' || event.key === ' ')
      const navigationKey = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Enter', ' '].includes(event.key)
      if (!activatingExemptControl && navigationKey) pause()
      if (event.key === 'Tab' && !event.defaultPrevented) {
        tabFocusPending = true
        clearTimeout(tabTimer)
        tabTimer = setTimeout(() => { tabFocusPending = false }, 200)
      }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      if (usesOwnArrowKeys(event.target) || document.querySelector(blockingOverlay)) return
      event.preventDefault()
      move(event.key === 'ArrowRight' ? 1 : -1)
    }
    const visibility = () => {
      if (document.hidden) pause()
    }
    window.addEventListener('wheel', interrupt, { passive: true, capture: true })
    window.addEventListener('touchstart', interruptUnlessExempt, { passive: true, capture: true })
    window.addEventListener('touchmove', interruptUnlessExempt, { passive: true, capture: true })
    window.addEventListener('pointerdown', interruptUnlessExempt, true)
    window.addEventListener('focusin', focusin)
    window.addEventListener('keydown', keydown)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('wheel', interrupt, true)
      window.removeEventListener('touchstart', interruptUnlessExempt, true)
      window.removeEventListener('touchmove', interruptUnlessExempt, true)
      window.removeEventListener('pointerdown', interruptUnlessExempt, true)
      window.removeEventListener('focusin', focusin)
      window.removeEventListener('keydown', keydown)
      document.removeEventListener('visibilitychange', visibility)
      clearTimeout(tabTimer)
    }
  }, [move, pause])

  const play = useCallback(() => {
    if (runtime.current || prefersReducedMotion() || document.hidden || document.querySelector(blockingOverlay)) return
    const layout = geometry()
    if (!layout) return
    const last = readingStops.length - 1
    const pixelsPerUnit = layout.range / routeLength
    const pixelAt = (stopIndex: number) => Math.round(layout.top + readingStops[stopIndex].at * pixelsPerUnit)
    if (window.scrollY >= pixelAt(last) - 1) return

    const beginTravel = (target: number, y: number, now: number) => {
      runtime.current = { phase: 'travelling', target, lastTime: now, fraction: 0, lastY: y, requestedY: y }
      setAutoMode('travelling')
      setReadingSeconds(0)
    }

    const beginReading = (index: number, y: number, now: number) => {
      if (index === last) {
        setEnded(true)
        pause()
        return
      }
      const dwell = speedOptions[speedRef.current].dwell
      const seconds = Math.ceil(dwell / 1000)
      runtime.current = { phase: 'reading', index, until: now + dwell, seconds, lastY: y }
      setAutoMode('reading')
      setReadingSeconds(seconds)
      setRunning(false)
    }

    // Cancelling native smooth travel can leave a queued compositor scroll
    // event after the cancellation. Settle before applying the interruption
    // guard and choose the first stop from the actual settled scroll position.
    const startedAt = performance.now()
    window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    runtime.current = { phase: 'settling', startedAt, stableSince: startedAt, lastY: window.scrollY }
    const runGeneration = ++generation.current
    setAutoMode('travelling')
    setReadingSeconds(0)

    const step = (now: number) => {
      const tour = runtime.current
      if (!tour || generation.current !== runGeneration) return
      if (document.hidden || prefersReducedMotion() || document.querySelector(blockingOverlay)) {
        pause()
        return
      }
      const y = window.scrollY
      if (!followsCommand(tour, y)) {
        pause()
        return
      }

      if (tour.phase === 'settling') {
        if (y !== tour.lastY) {
          tour.stableSince = now
          tour.lastY = y
          window.scrollTo({ top: y, behavior: 'instant' })
        }
        if (now - tour.stableSince >= settleQuietTime && now - tour.startedAt >= settleMinimumTime) {
          const target = readingStops.findIndex((_, index) => pixelAt(index) > y + 1)
          if (target < 0) {
            setEnded(true)
            pause()
            return
          }
          if (target > 0 && Math.abs(pixelAt(target - 1) - y) <= scrollTolerance) {
            beginReading(target - 1, y, now)
          } else {
            beginTravel(target, y, now)
          }
        }
      } else if (tour.phase === 'reading') {
        const remaining = Math.max(0, Math.ceil((tour.until - now) / 1000))
        if (remaining !== tour.seconds) {
          tour.seconds = remaining
          setReadingSeconds(remaining)
        }
        if (now >= tour.until) beginTravel(tour.index + 1, y, now)
      } else {
        const elapsed = Math.max(0, Math.min(100, now - tour.lastTime))
        tour.lastTime = now
        tour.lastY = y
        const settings = speedOptions[speedRef.current]
        const target = pixelAt(tour.target)
        // Browser zoom can make the exact requested CSS pixel unreachable.
        if (y >= target - 1) {
          beginReading(tour.target, y, now)
        } else {
          // Accumulate only fractional pixels so high-refresh-rate displays
          // can move at the same elapsed-time speed as 60 Hz displays.
          const amount = tour.fraction + elapsed / 1000 * settings.travel * pixelsPerUnit
          const distance = Math.floor(amount)
          tour.fraction = amount - distance
          if (distance > 0) {
            const destination = Math.min(target, Math.max(y, tour.requestedY) + distance)
            tour.requestedY = destination
            window.scrollTo({ top: destination, behavior: 'instant' })
          }
        }
      }
      if (runtime.current && generation.current === runGeneration) autoFrame.current = requestAnimationFrame(step)
    }
    autoFrame.current = requestAnimationFrame(step)
  }, [geometry, pause])

  useEffect(() => () => {
    runtime.current = null
    generation.current++
    cancelAnimationFrame(autoFrame.current)
  }, [])

  return {
    ...readJourney(travelPosition),
    running: running && !reduced,
    direction,
    goTo,
    next,
    previous,
    playing: autoMode !== 'paused',
    autoState: autoMode === 'paused' && ended ? 'ended' as const : autoMode,
    readingSeconds,
    ended,
    play,
    pause,
    speed,
    setSpeed: chooseSpeed,
    motion: ambientMotion && !reduced,
    setMotion,
    reduced,
  }
}
