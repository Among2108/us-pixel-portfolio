import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { beats, clamp, readRoute, routeEnd } from './story'
import { minimumSceneryTileWidth } from './scenery'

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

// Portal n connects worlds n and n + 1, including any extra stops in world n.
function portalLanding(portal: number, direction: 1 | -1) {
  const nextChapter = readingStops.findIndex(stop => stop.id === chapterStops[portal + 1])
  return readingStops[direction === 1 ? nextChapter : nextChapter - 1]
}

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

// Continuous speeds leave each card visible for several seconds without
// inserting a stop or changing the dinosaur's gait at chapter boundaries.
const speedOptions: Record<Speed, number> = {
  Slow: .12,
  Normal: .18,
  Fast: .26,
}

const motionPreference = 'aslan-ambient-motion'
const blockingOverlay = 'dialog[open], [role="dialog"][aria-modal="true"], [data-tour-settings-open]'
const scrollTolerance = 2
const manualDirectionThreshold = 2
const geometryTolerance = 1
const settleQuietTime = 180
const settleMinimumTime = 220
const replayIdleMs = 30_000
const replayCoverMs = 380
const replayHoldMs = 160
const replayRevealMs = 500

type ReplayState = 'unavailable' | 'waiting' | 'counting' | 'stayed' | 'ready' | 'returning'

type ContactVisit = {
  settled: boolean
  deadline: number | null
  cancelled: boolean
  resumeAuto: boolean
}

type ReplayTransition = {
  phase: 'cover' | 'hold' | 'reveal'
  startedAt: number
  resumeAuto: boolean
  overflow: string
}

type SceneryMetric = {
  width: number
  tileWidth: number
  range: number
  anchorPosition: number
  anchorDistance: number
  world: number
  worldOrigin: number
}

const sceneChapterStart = (world: number) =>
  readingStops.find(stop => stop.id === chapterStops[world])!.at

type ActiveTour =
  | { phase: 'settling'; startedAt: number; stableSince: number; lastY: number }
  | {
    phase: 'travelling'
    lastTime: number
    fraction: number
    lastY: number
    requestedY: number
  }

function followsCommand(tour: ActiveTour, y: number) {
  if (tour.phase === 'settling') return true
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
  return target instanceof Element && Boolean(target.closest('[data-auto-play], [data-auto-gesture], [data-audio-toggle]'))
}

function usesOwnArrowKeys(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'button, a[href], input, textarea, select, summary, [contenteditable], [role="button"], [role="slider"], [role="listbox"], dialog, [role="dialog"], [data-journey-keys]',
  ))
}

function selectingOrEditing() {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) return true
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)) return true
  if (!(active instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(active.type)
}

export function useJourney(track: RefObject<HTMLElement | null>, screen: RefObject<HTMLElement | null>, overlayOpen = false) {
  const [travelPosition, setTravelPosition] = useState(0)
  const [sceneryDistance, setSceneryDistance] = useState(0)
  const [sceneryLandmarkDistance, setSceneryLandmarkDistance] = useState(0)
  const [sceneryTileWidth, setSceneryTileWidth] = useState(minimumSceneryTileWidth)
  const [sceneryTileCount, setSceneryTileCount] = useState(4)
  const [running, setRunning] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [autoMode, setAutoMode] = useState<'paused' | 'travelling'>('paused')
  const [ended, setEnded] = useState(false)
  const [speed, setSpeed] = useState<Speed>('Slow')
  const [ambientMotion, setMotion] = useState(preferredAmbientMotion)
  const [reduced, setReduced] = useState(prefersReducedMotion)
  const [replayState, setReplayState] = useState<ReplayState>('unavailable')
  const [replaySeconds, setReplaySeconds] = useState<number | null>(null)
  const [replayOpacity, setReplayOpacity] = useState<number | null>(null)
  const [replayAuto, setReplayAuto] = useState(false)

  const runtime = useRef<ActiveTour | null>(null)
  const generation = useRef(0)
  const autoFrame = useRef(0)
  const speedRef = useRef(speed)
  const overlayOpenRef = useRef(overlayOpen)
  const ambientMotionRef = useRef(ambientMotion)
  const positionRef = useRef(0)
  const sceneryMetric = useRef<SceneryMetric | null>(null)
  const distanceRef = useRef(0)
  const lastMovementAt = useRef(performance.now())
  const contactVisit = useRef<ContactVisit | null>(null)
  const replayTransition = useRef<ReplayTransition | null>(null)
  const replayFrame = useRef(0)
  const activePointers = useRef(new Set<number>())
  const touchHeld = useRef(false)
  const portalDestinationY = useRef<number | null>(null)
  const journey = readJourney(travelPosition)
  const portal = journey.portal
  overlayOpenRef.current = overlayOpen
  ambientMotionRef.current = ambientMotion

  const geometry = useCallback(() => {
    if (!track.current || !screen.current) return null
    const trackBounds = track.current.getBoundingClientRect()
    const top = trackBounds.top + window.scrollY
    // Both outer elements include the same dynamic viewport height. Subtract
    // their fractional heights so Safari toolbar changes cancel exactly,
    // rather than rounding independently through offsetHeight.
    const measuredRange = trackBounds.height - screen.current.getBoundingClientRect().height
    const previousRange = sceneryMetric.current?.range
    const range = previousRange !== undefined && Math.abs(measuredRange - previousRange) <= geometryTolerance
      ? previousRange
      : measuredRange
    const width = screen.current.clientWidth
    return range > 0 && width > 0 ? { top, range, width, position: clamp((window.scrollY - top) / range) * routeLength } : null
  }, [track, screen])

  const pauseForInteraction = useCallback(() => {
    if (portalDestinationY.current !== null) {
      portalDestinationY.current = null
      window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    }
    if (!runtime.current) return
    runtime.current = null
    generation.current++
    cancelAnimationFrame(autoFrame.current)
    autoFrame.current = 0
    setAutoMode('paused')
    setRunning(false)
  }, [])

  const clearVisit = useCallback(() => {
    if (!contactVisit.current) return
    contactVisit.current = null
    setReplayAuto(false)
    setReplaySeconds(null)
    setReplayState('unavailable')
  }, [])

  const arriveAtContact = useCallback((resumeAuto: boolean) => {
    if (replayTransition.current || contactVisit.current) return
    contactVisit.current = { settled: false, deadline: null, cancelled: false, resumeAuto }
    setReplayAuto(resumeAuto)
    setReplaySeconds(null)
    setReplayState(prefersReducedMotion() ? 'ready' : 'waiting')
  }, [])

  const resetReplayClock = useCallback(() => {
    const visit = contactVisit.current
    if (visit && !visit.cancelled && !replayTransition.current) visit.deadline = null
  }, [])

  const stayHere = useCallback(() => {
    const visit = contactVisit.current
    if (!visit || replayTransition.current) return
    visit.cancelled = true
    visit.resumeAuto = false
    visit.deadline = null
    setReplayAuto(false)
    setReplaySeconds(null)
    setReplayState('stayed')
  }, [])

  const pause = useCallback(() => {
    pauseForInteraction()
    const layout = geometry()
    if (layout && window.scrollY >= layout.top + layout.range - 1) arriveAtContact(false)
    if (replayTransition.current) {
      replayTransition.current.resumeAuto = false
      setReplayAuto(false)
    } else stayHere()
  }, [arriveAtContact, geometry, pauseForInteraction, stayHere])

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
      resetReplayClock()
      if (preference.matches) {
        pauseForInteraction()
        if (contactVisit.current) contactVisit.current.resumeAuto = false
        if (replayTransition.current) replayTransition.current.resumeAuto = false
        setReplayAuto(false)
        setRunning(false)
      }
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [pauseForInteraction, resetReplayClock])

  useEffect(() => {
    let frame = 0
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let lastY = window.scrollY
    let directionAnchorY = lastY
    const update = () => {
      frame = 0
      let layout = geometry()
      if (!layout) return
      let metric = sceneryMetric.current
      if (!metric) {
        const tileWidth = Math.max(minimumSceneryTileWidth, layout.width)
        const route = readJourney(layout.position)
        metric = {
          width: layout.width,
          tileWidth,
          range: layout.range,
          anchorPosition: 0,
          anchorDistance: 0,
          world: route.world,
          worldOrigin: sceneChapterStart(route.world) * layout.width,
        }
        sceneryMetric.current = metric
        setSceneryTileWidth(tileWidth)
      } else if (metric.width !== layout.width || metric.range !== layout.range) {
        // Responsive scroll length changes should not move the reading stop
        // or the scenery phase. Anchor a new pixels-per-unit scale here;
        // later forward and reverse deltas then use the new stage width.
        pauseForInteraction()
        metric.anchorPosition = positionRef.current
        metric.anchorDistance = distanceRef.current
        metric.width = layout.width
        metric.range = layout.range
        window.scrollTo({ top: layout.top + positionRef.current / routeLength * layout.range, behavior: 'instant' })
        layout = geometry() ?? layout
        directionAnchorY = clamp(window.scrollY, layout.top, layout.top + layout.range)
      }
      const route = readJourney(layout.position)
      const distance = metric.anchorDistance + (layout.position - metric.anchorPosition) * metric.width
      if (metric.world !== route.world) {
        metric.world = route.world
        metric.worldOrigin = distance - (layout.position - sceneChapterStart(route.world)) * metric.width
      }
      positionRef.current = layout.position
      distanceRef.current = distance
      setTravelPosition(layout.position)
      setSceneryDistance(distance)
      setSceneryLandmarkDistance(distance - metric.worldOrigin)
      setSceneryTileCount(Math.ceil(layout.width / metric.tileWidth) + 3)
      const y = window.scrollY
      if (portalDestinationY.current !== null && Math.abs(y - portalDestinationY.current) <= 1) {
        portalDestinationY.current = null
      }
      const atContact = y >= layout.top + layout.range - 1
      setEnded(atContact)
      if (!replayTransition.current) {
        if (atContact) arriveAtContact(Boolean(runtime.current))
        else clearVisit()
      }
      // A scrollbar or accessibility action can scroll without a pointer/key
      // event in the document. An uncommanded change is a manual interruption.
      if (runtime.current && !followsCommand(runtime.current, y)) pauseForInteraction()
      if (y === lastY) return
      lastMovementAt.current = performance.now()
      if (replayTransition.current) {
        lastY = y
        directionAnchorY = clamp(y, layout.top, layout.top + layout.range)
        clearTimeout(idleTimer)
        setRunning(false)
        return
      }
      const facingY = clamp(y, layout.top, layout.top + layout.range)
      if (runtime.current) {
        // Auto Run owns forward travel, including its settling phase. Small
        // compositor acknowledgements already accepted by followsCommand()
        // must not flip the mascot on high-refresh-rate/mobile screens.
        setDirection(1)
        directionAnchorY = facingY
      } else if (Math.abs(facingY - directionAnchorY) >= manualDirectionThreshold) {
        // Accumulate real manual movement before turning. Clamp elastic
        // overscroll and retain the anchor through subpixel scroll noise.
        setDirection(facingY > directionAnchorY ? 1 : -1)
        directionAnchorY = facingY
      }
      lastY = y
      if (prefersReducedMotion()) {
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
      // Height-only browser chrome changes do not change the route budget.
      // update() still pauses and rebases a real width or range change.
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
  }, [geometry, pauseForInteraction, arriveAtContact, clearVisit])

  const goTo = useCallback((id: ReadingStopId) => {
    if (replayTransition.current) return
    pauseForInteraction()
    if (id !== 'contact') clearVisit()
    const stop = readingStops.find(item => item.id === id)
    const layout = geometry()
    if (!stop || !layout) return
    window.scrollTo({
      top: layout.top + stop.at / routeLength * layout.range,
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    })
  }, [geometry, pauseForInteraction, clearVisit])

  const move = useCallback((step: -1 | 1) => {
    const layout = geometry()
    if (!layout) return
    const { stopIndex, portal } = readJourney(layout.position)
    const target = portal >= 0 ? portalLanding(portal, step) : readingStops[clamp(stopIndex + step, 0, readingStops.length - 1)]
    goTo(target.id)
  }, [geometry, goTo])

  const next = useCallback(() => move(1), [move])
  const previous = useCallback(() => move(-1), [move])

  useEffect(() => {
    const activity = (event: Event) => {
      if (event.isTrusted) resetReplayClock()
    }
    let lastPointer: { x: number; y: number } | null = null
    const pointermove = (event: PointerEvent) => {
      const point = { x: event.clientX, y: event.clientY }
      if (!event.isTrusted) return
      // Reflow can synthesize a pointer event under a stationary mouse.
      // Only actual changes in coordinates count as idle-return activity.
      if (lastPointer ? Math.hypot(point.x - lastPointer.x, point.y - lastPointer.y) > 2 : event.movementX !== 0 || event.movementY !== 0) {
        lastPointer = point
        resetReplayClock()
      } else if (!lastPointer) {
        lastPointer = point
      }
    }
    const interrupt = (event: Event) => {
      activity(event)
      pauseForInteraction()
    }
    const interruptUnlessExempt = (event: Event) => {
      activity(event)
      if (!isTourExemptControl(event.target)) pauseForInteraction()
    }
    // Native panning can cancel the pointer before the finger lifts on iOS.
    const touchstart = (event: TouchEvent) => {
      touchHeld.current = true
      interruptUnlessExempt(event)
    }
    const touchend = (event: TouchEvent) => { touchHeld.current = event.touches.length > 0 }
    const pointerdown = (event: PointerEvent) => {
      if (event.isTrusted) {
        activePointers.current.add(event.pointerId)
        lastPointer = { x: event.clientX, y: event.clientY }
      }
      interruptUnlessExempt(event)
    }
    const pointerup = (event: PointerEvent) => {
      if (event.isTrusted) {
        activePointers.current.delete(event.pointerId)
        lastPointer = { x: event.clientX, y: event.clientY }
      }
      activity(event)
    }
    let tabFocusPending = false
    let tabTimer: ReturnType<typeof setTimeout> | undefined
    const focusin = (event: FocusEvent) => {
      if (!tabFocusPending) return
      tabFocusPending = false
      clearTimeout(tabTimer)
      // Keyboard focus into a changing reading card needs a stable stop.
      // Focus traversal through persistent controls and the mascot is safe.
      if (event.target instanceof Element && event.target.closest('.reading-panel')) pauseForInteraction()
    }
    const keydown = (event: KeyboardEvent) => {
      activity(event)
      const activatingExemptControl = isTourExemptControl(event.target) && (event.key === 'Enter' || event.key === ' ')
      const navigationKey = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Enter', ' '].includes(event.key)
      if (!activatingExemptControl && navigationKey) pauseForInteraction()
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
      resetReplayClock()
      if (document.hidden) {
        activePointers.current.clear()
        touchHeld.current = false
        pauseForInteraction()
      }
    }
    const blur = () => {
      activePointers.current.clear()
      touchHeld.current = false
    }
    window.addEventListener('wheel', interrupt, { passive: true, capture: true })
    window.addEventListener('touchstart', touchstart, { passive: true, capture: true })
    window.addEventListener('touchend', touchend, true)
    window.addEventListener('touchcancel', touchend, true)
    window.addEventListener('touchmove', interruptUnlessExempt, { passive: true, capture: true })
    window.addEventListener('pointerdown', pointerdown, true)
    window.addEventListener('pointerup', pointerup, true)
    window.addEventListener('pointercancel', pointerup, true)
    window.addEventListener('pointermove', pointermove, { passive: true, capture: true })
    window.addEventListener('click', activity, true)
    window.addEventListener('focusin', focusin)
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('wheel', interrupt, true)
      window.removeEventListener('touchstart', touchstart, true)
      window.removeEventListener('touchend', touchend, true)
      window.removeEventListener('touchcancel', touchend, true)
      window.removeEventListener('touchmove', interruptUnlessExempt, true)
      window.removeEventListener('pointerdown', pointerdown, true)
      window.removeEventListener('pointerup', pointerup, true)
      window.removeEventListener('pointercancel', pointerup, true)
      window.removeEventListener('pointermove', pointermove, true)
      window.removeEventListener('click', activity, true)
      window.removeEventListener('focusin', focusin)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      clearTimeout(tabTimer)
    }
  }, [move, pauseForInteraction, resetReplayClock])

  // Only arm a landing while a warp is visible. Native scroll events postpone
  // it through trackpad or touch momentum, and new input can interrupt it.
  useEffect(() => {
    if (portal < 0 || reduced || overlayOpen || autoMode !== 'paused') return
    let timer: number
    const finish = () => {
      if (document.hidden || runtime.current || replayTransition.current || overlayOpenRef.current ||
          activePointers.current.size || touchHeld.current || document.querySelector(blockingOverlay) || prefersReducedMotion()) return
      const layout = geometry()
      if (!layout || readJourney(layout.position).portal !== portal) return
      const target = portalLanding(portal, direction)
      const y = layout.top + target.at / routeLength * layout.range
      portalDestinationY.current = y
      window.scrollTo({ top: y, behavior: ambientMotionRef.current ? 'smooth' : 'instant' })
    }
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(finish, settleQuietTime)
    }
    const events = ['scroll', 'wheel', 'pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const
    for (const event of events) window.addEventListener(event, arm, { passive: true })
    document.addEventListener('visibilitychange', arm)
    arm()
    return () => {
      window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, arm)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [portal, direction, reduced, overlayOpen, autoMode, geometry])

  const play = useCallback(() => {
    if (runtime.current || replayTransition.current || prefersReducedMotion() || document.hidden || overlayOpenRef.current || document.querySelector(blockingOverlay)) return
    const layout = geometry()
    if (!layout) return
    const pixelsPerUnit = layout.range / routeLength
    const destinationY = layout.top + layout.range
    if (window.scrollY >= destinationY - 1) return

    const beginTravel = (y: number, now: number) => {
      runtime.current = { phase: 'travelling', lastTime: now, fraction: 0, lastY: y, requestedY: y }
      setRunning(true)
    }

    // Cancelling native smooth travel can leave a queued compositor scroll
    // event after the cancellation. Settle before applying the interruption
    // guard and continue from the actual settled scroll position.
    const startedAt = performance.now()
    portalDestinationY.current = null
    window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    runtime.current = { phase: 'settling', startedAt, stableSince: startedAt, lastY: window.scrollY }
    const runGeneration = ++generation.current
    setDirection(1)
    setAutoMode('travelling')

    const step = (now: number) => {
      const tour = runtime.current
      if (!tour || generation.current !== runGeneration) return
      if (document.hidden || prefersReducedMotion() || overlayOpenRef.current || document.querySelector(blockingOverlay)) {
        pauseForInteraction()
        return
      }
      const y = window.scrollY
      if (!followsCommand(tour, y)) {
        pauseForInteraction()
        return
      }

      if (tour.phase === 'settling') {
        if (y !== tour.lastY) {
          tour.stableSince = now
          tour.lastY = y
          window.scrollTo({ top: y, behavior: 'instant' })
        }
        if (now - tour.stableSince >= settleQuietTime && now - tour.startedAt >= settleMinimumTime) {
          if (y >= destinationY - 1) {
            setEnded(true)
            arriveAtContact(true)
            pauseForInteraction()
            return
          }
          beginTravel(y, now)
        }
      } else {
        // Keep elapsed-time speed even on low-frame-rate devices. Limit a
        // longer stall to one second of travel, without retaining catch-up
        // debt; the visibility guard separately stops background travel.
        const elapsed = Math.max(0, Math.min(1000, now - tour.lastTime))
        tour.lastTime = now
        tour.lastY = y
        // Browser zoom can make the exact requested CSS pixel unreachable.
        if (y >= destinationY - 1) {
          setEnded(true)
          arriveAtContact(true)
          pauseForInteraction()
          return
        }
        // Accumulate only fractional pixels so high-refresh-rate displays
        // can move at the same elapsed-time speed as 60 Hz displays. Reading
        // stops remain navigation targets, but never interrupt Auto Run.
        const amount = tour.fraction + elapsed / 1000 * speedOptions[speedRef.current] * pixelsPerUnit
        const distance = Math.floor(amount)
        tour.fraction = amount - distance
        if (distance > 0) {
          const destination = Math.min(destinationY, Math.max(y, tour.requestedY) + distance)
          tour.requestedY = destination
          window.scrollTo({ top: destination, behavior: 'instant' })
        }
      }
      if (runtime.current && generation.current === runGeneration) autoFrame.current = requestAnimationFrame(step)
    }
    autoFrame.current = requestAnimationFrame(step)
  }, [geometry, pauseForInteraction, arriveAtContact])

  const resetToStart = useCallback(() => {
    const layout = geometry()
    if (!layout) return
    const metric = sceneryMetric.current
    if (metric) {
      metric.anchorPosition = 0
      metric.anchorDistance = 0
      metric.world = 0
      metric.worldOrigin = 0
    }
    // Reset both the rendered frame and its native scroll source while
    // covered. The compositor's following scroll event will agree with it.
    window.scrollTo({ top: layout.top, behavior: 'instant' })
    positionRef.current = 0
    distanceRef.current = 0
    setTravelPosition(0)
    setSceneryDistance(0)
    setSceneryLandmarkDistance(0)
    setEnded(false)
    setRunning(false)
    setDirection(1)
    contactVisit.current = null
  }, [geometry])

  const finishReplay = useCallback((resume: boolean) => {
    const transition = replayTransition.current
    if (!transition) return
    cancelAnimationFrame(replayFrame.current)
    replayFrame.current = 0
    document.documentElement.style.overflowY = transition.overflow
    replayTransition.current = null
    setReplayOpacity(null)
    setReplaySeconds(null)
    setReplayAuto(Boolean(contactVisit.current?.resumeAuto))
    setReplayState(contactVisit.current
      ? contactVisit.current.cancelled ? 'stayed' : prefersReducedMotion() ? 'ready' : 'waiting'
      : 'unavailable')
    if (resume && transition.resumeAuto && !document.hidden && !prefersReducedMotion()) play()
  }, [play])

  const abortReplay = useCallback(() => {
    if (!replayTransition.current) return
    resetReplayClock()
    finishReplay(false)
  }, [finishReplay, resetReplayClock])

  const replayNow = useCallback(() => {
    const layout = geometry()
    if (!layout || window.scrollY < layout.top + layout.range - 1 || document.hidden || overlayOpenRef.current || document.querySelector(blockingOverlay) || replayTransition.current) return
    let visit = contactVisit.current
    if (!visit) {
      arriveAtContact(Boolean(runtime.current))
      visit = contactVisit.current
    }
    if (!visit) return
    const resumeAuto = visit.resumeAuto && !visit.cancelled && !prefersReducedMotion()
    pauseForInteraction()
    const root = document.documentElement
    const transition: ReplayTransition = {
      phase: 'cover', startedAt: performance.now(), resumeAuto, overflow: root.style.overflowY,
    }
    replayTransition.current = transition
    visit.deadline = null
    setReplayState('returning')
    setReplaySeconds(null)
    root.style.overflowY = 'hidden'
    window.scrollTo({ top: window.scrollY, behavior: 'instant' })

    if (!ambientMotionRef.current || prefersReducedMotion()) {
      resetToStart()
      // Keep the transition transaction active until the browser has
      // acknowledged the instant reset, preventing a double activation.
      replayFrame.current = requestAnimationFrame(() => finishReplay(true))
      return
    }

    setReplayOpacity(0)
    const step = (now: number) => {
      if (replayTransition.current !== transition) return
      if (document.hidden || prefersReducedMotion()) {
        abortReplay()
        return
      }
      const elapsed = now - transition.startedAt
      if (transition.phase === 'cover') {
        setReplayOpacity(clamp(elapsed / replayCoverMs))
        if (elapsed >= replayCoverMs) {
          // Leave at least one fully opaque paint before teleporting.
          transition.phase = 'hold'
          transition.startedAt = now
        }
      } else if (transition.phase === 'hold') {
        if (elapsed >= replayHoldMs / 2 && contactVisit.current) resetToStart()
        if (elapsed >= replayHoldMs) {
          transition.phase = 'reveal'
          transition.startedAt = now
        }
      } else {
        setReplayOpacity(1 - clamp(elapsed / replayRevealMs))
        if (elapsed >= replayRevealMs) {
          finishReplay(true)
          return
        }
      }
      replayFrame.current = requestAnimationFrame(step)
    }
    replayFrame.current = requestAnimationFrame(step)
  }, [geometry, arriveAtContact, pauseForInteraction, resetToStart, finishReplay, abortReplay])

  // Only genuine browser input restarts the idle timer. Overlay/visibility
  // suspension instead discards its deadline, so eligibility always begins
  // with a fresh 30 seconds rather than accumulating a background debt.
  useEffect(() => {
    resetReplayClock()
  }, [overlayOpen, resetReplayClock])

  useEffect(() => {
    const tick = () => {
      const visit = contactVisit.current
      if (!visit || replayTransition.current || visit.cancelled) return
      const layout = geometry()
      const metric = sceneryMetric.current
      if (layout && metric && (layout.width !== metric.width || layout.range !== metric.range)) return
      if (!layout || window.scrollY < layout.top + layout.range - 1) {
        clearVisit()
        return
      }
      if (prefersReducedMotion()) {
        visit.deadline = null
        setReplaySeconds(null)
        setReplayState('ready')
        return
      }
      const now = performance.now()
      if (!visit.settled) visit.settled = !runtime.current && now - lastMovementAt.current >= settleMinimumTime
      const suspended = document.hidden || overlayOpenRef.current || Boolean(document.querySelector(blockingOverlay))
        || activePointers.current.size > 0 || selectingOrEditing()
      if (!visit.settled || suspended) {
        visit.deadline = null
        setReplaySeconds(null)
        setReplayState('waiting')
        return
      }
      if (visit.deadline === null) visit.deadline = now + replayIdleMs
      const remaining = Math.ceil((visit.deadline - now) / 1000)
      if (remaining <= 0) {
        replayNow()
      } else {
        setReplayState('counting')
        setReplaySeconds(remaining)
      }
    }
    const visibility = () => {
      resetReplayClock()
      if (document.hidden) abortReplay()
    }
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => {
      resetReplayClock()
      if (preference.matches) abortReplay()
    }
    const interval = window.setInterval(tick, 100)
    document.addEventListener('visibilitychange', visibility)
    preference.addEventListener('change', reduce)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visibility)
      preference.removeEventListener('change', reduce)
    }
  }, [geometry, clearVisit, replayNow, resetReplayClock, abortReplay])

  useEffect(() => () => {
    runtime.current = null
    generation.current++
    cancelAnimationFrame(autoFrame.current)
    cancelAnimationFrame(replayFrame.current)
    if (replayTransition.current) document.documentElement.style.overflowY = replayTransition.current.overflow
    replayTransition.current = null
  }, [])

  return {
    ...journey,
    sceneryDistance,
    sceneryLandmarkDistance,
    sceneryTileWidth,
    sceneryTileCount,
    running: (running || autoMode === 'travelling') && !reduced && !ended,
    direction,
    goTo,
    next,
    previous,
    playing: autoMode !== 'paused',
    autoState: autoMode === 'paused' && ended ? 'ended' as const : autoMode,
    ended,
    play,
    pause,
    pauseForInteraction,
    replayState,
    replaySeconds,
    replayOpacity,
    replayAuto,
    replayNow,
    stayHere,
    speed,
    setSpeed: chooseSpeed,
    motion: ambientMotion && !reduced,
    setMotion,
    reduced,
  }
}
