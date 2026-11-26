import { memo, useCallback, useEffect, useRef, useState } from 'react'
import './characterGestures.css'

// Trace the ridgelines on a grid so even the distant silhouettes have pixel steps.
function ridge(points: number[][], step = 8) {
  let path = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    for (let x = x0 + step; x < x1; x += step) {
      path += `H${x}V${Math.round((y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) / step) * step}`
    }
    path += `H${x1}V${y1}`
  }
  return path
}

function mountain(points: number[][]) {
  return `${ridge(points)}V304H${points[0][0]}Z`
}

const far = mountain([
  [0, 224], [80, 200], [200, 104], [280, 164], [352, 112], [464, 208],
  [552, 184], [680, 104], [744, 136], [856, 40], [904, 72], [1000, 160],
  [1088, 96], [1232, 192], [1320, 224],
])
const farShade = mountain([[856, 40], [880, 120], [920, 144], [952, 208], [1000, 232], [1040, 240], [1120, 272]])
const near = mountain([
  [0, 232], [88, 208], [192, 152], [304, 232], [424, 248], [520, 216],
  [632, 152], [712, 112], [792, 168], [856, 208], [968, 120], [1056, 72],
  [1184, 176], [1320, 232],
])
const nearShade = mountain([[1056, 72], [1072, 136], [1112, 168], [1128, 208], [1216, 248], [1320, 280]])
const foothills = mountain([[0, 280], [144, 272], [272, 244], [400, 276], [624, 272], [760, 232], [920, 264], [1072, 240], [1232, 256], [1320, 280]])

const cloudPath = 'M0 16h8v-4h12V8h8V4h20v4h8v4h20v4h12v4H0Z'

function Cloud({ left, top, width, light = false }: { left: string; top: string; width: number; light?: boolean }) {
  return (
    <svg className="cloud" style={{ left, top, width }} viewBox="0 0 88 20" shapeRendering="crispEdges">
      <path fill={light ? '#eaf3e7' : '#eaf4e9'} d={cloudPath} />
      <path fill={light ? '#f0f6eb' : '#f8f8ed'} d="M20 12V8h8V4h20v4h8v4Z" />
    </svg>
  )
}

function Pine({ left, height, faded = false }: { left: string; height: number; faded?: boolean }) {
  return (
    <svg className="pine" style={{ left, height }} viewBox="0 0 28 47" shapeRendering="crispEdges">
      <path fill={faded ? '#8bb49e' : '#507b65'} d="M12 0h4v4h2v4h2v4h2v4h-3v4h3v4h3v4h-4v4h4v4h3v4H16v7h-4v-7H0v-4h3v-4h4v-4H3v-4h3v-4h3v-4H6v-4h2V8h2V4h2Z" />
      <path fill={faded ? '#9fc3ad' : '#678e76'} d="M12 4h2v12H8v-4h2V8h2ZM10 20h4v8H6v-4h4ZM9 32h5v8H3v-4h6Z" />
    </svg>
  )
}

function Brush({ left, width }: { left: string; width: number }) {
  return (
    <svg className="brush" style={{ left, width }} viewBox="0 0 42 13" shapeRendering="crispEdges">
      <path fill="#7ba88e" d="M0 13V9h6V6h6v3h5V4h5V0h9v4h5v5h6v4Z" />
      <path fill="#a6c8af" d="M17 4h5V0h9v4h5v4h-7V5h-7v4h-5Z" />
    </svg>
  )
}

function Strip({ name, tileCount, children }: { name: string; tileCount: number; children: React.ReactNode }) {
  return (
    <div className={`scenery-strip ${name}`}>
      {Array.from({ length: tileCount }, (_, index) => <div className="scenery-tile" key={index}>{children}</div>)}
    </div>
  )
}

export const Landscape = memo(function Landscape({ tileCount = 4 }: { tileCount?: number }) {
  return (
    <div className="landscape" aria-hidden="true">
      <svg className="sun" viewBox="0 0 34 34" shapeRendering="crispEdges">
        <path fill="#f8f4d9" d="M12 0h10v3h6v4h3v5h3v10h-3v5h-3v4h-6v3H12v-3H6v-4H3v-5H0V12h3V7h3V3h6Z" />
        <path fill="#e6ead0" d="M7 8h7v2h3v4h-3v2H8v-2H5v-4h2ZM19 22h5v3h3v4h-8v-2h-3v-3h3ZM24 9h4v4h-4Z" />
        <path fill="#efefd6" d="M2 20h30v2H2ZM5 25h24v2H5ZM10 30h14v1H10Z" />
      </svg>
      <Strip name="cloud-strip" tileCount={tileCount}>
        <Cloud left="33%" top="16%" width={114} light />
        <Cloud left="60%" top="25%" width={143} />
        <Cloud left="84%" top="18%" width={149} />
        <Cloud left="17%" top="55%" width={74} light />
        <Cloud left="97%" top="17%" width={76} light />
      </Strip>
      <Strip name="far-strip" tileCount={tileCount}>
        <svg className="ridge" viewBox="0 0 1320 304" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#cce3d4" d={far} />
          <path fill="#c1ddce" d={farShade} />
          <path fill="#ebf2e5" d="M824 72h8V64h8v-8h8v-8h8v-8h8v8h8v8h8v8h8v8h8v8h-24v-8h-16v8h-16v8h-24v-8h8Z" />
        </svg>
      </Strip>
      <Strip name="near-strip" tileCount={tileCount}>
        <svg className="ridge" viewBox="0 0 1320 304" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#accfb9" d={near} />
          <path fill="#9cc5ad" d={nearShade} />
          <path fill="#86b295" d={foothills} />
        </svg>
      </Strip>
      <Strip name="woods-strip" tileCount={tileCount}>
        <Pine left="1%" height={105} />
        <Pine left="5.5%" height={67} faded />
        <Pine left="12%" height={46} faded />
        <Pine left="34%" height={69} faded />
        <Pine left="39%" height={42} />
        <Pine left="68%" height={71} faded />
        <Pine left="70.8%" height={126} />
        <Pine left="75.4%" height={51} faded />
        <Pine left="92.3%" height={64} faded />
        <Pine left="96.2%" height={94} />
        <Brush left="9%" width={58} />
        <Brush left="19%" width={89} />
        <Brush left="42%" width={72} />
        <Brush left="62%" width={51} />
        <Brush left="78%" width={62} />
        <Brush left="89%" width={83} />
      </Strip>
      <Strip name="grass-strip" tileCount={tileCount}>
        {[7, 25, 31, 46, 61, 67, 84, 93].map((left) => (
          <svg className="grass" key={left} style={{ left: `${left}%` }} viewBox="0 0 23 8" width="23" height="8" shapeRendering="crispEdges">
            <path fill="#507b65" d="M0 8V5h3v3h4V3h3v5h4V0h3v8h3V5h3v3Z" />
            <path fill="#f0e4a5" d="M13 0h5v3h-5Z" />
          </svg>
        ))}
      </Strip>
    </div>
  )
})

type MascotGesture = 'idle' | 'greeting' | 'wave' | 'wink' | 'hop' | 'curious' | 'activation'

const friendlyLines = ['Hi!', 'How are you?', "Let's go!", 'Nice to see you!', 'Enjoy the view!', 'Take your time.']
const worldLines = [
  ['Hello, stargazer!', 'To the stars!', 'Ready to explore?'],
  ['Rainbow time!', 'A little magic!', 'Follow the rainbow!'],
  ["Let's build!", 'Made with care!', 'Got an idea?'],
  ['Say hello!', 'Thanks for visiting!', 'See you again!'],
]

export const Dino = memo(function Dino({
  running,
  unicorn,
  greeting = false,
  motion = true,
  interactive = true,
  world = 0,
  onJump,
}: {
  running: boolean
  unicorn: boolean
  greeting?: boolean
  motion?: boolean
  interactive?: boolean
  world?: number
  onJump?: () => void
}) {
  const [gesture, setGesture] = useState<MascotGesture>('idle')
  const [speech, setSpeech] = useState<{ line: string; id: number } | null>(null)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const greeted = useRef(false)
  const currentGesture = useRef<MascotGesture>('idle')
  const previousGesture = useRef<MascotGesture>('idle')
  const previousLine = useRef('')
  const speechId = useRef(0)
  const latest = useRef({ running, world, onJump })
  latest.current = { running, world, onJump }
  const gesturesEnabled = motion && interactive && visible

  const performGesture = useCallback((next: MascotGesture) => {
    if (!gesturesEnabled || currentGesture.current !== 'idle') return
    currentGesture.current = next
    previousGesture.current = next
    setGesture(next)
    if (next === 'hop' || next === 'activation') latest.current.onJump?.()
  }, [gesturesEnabled])

  const saySomething = useCallback((line?: string) => {
    if (!gesturesEnabled) return
    const options = [...friendlyLines, ...(worldLines[latest.current.world] ?? [])]
      .filter(value => value !== previousLine.current)
    const next = line ?? options[Math.floor(Math.random() * options.length)]
    previousLine.current = next
    setSpeech({ line: next, id: ++speechId.current })
  }, [gesturesEnabled])

  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (!greeting || !gesturesEnabled || greeted.current) return
    const timer = window.setTimeout(() => {
      greeted.current = true
      performGesture('greeting')
      saySomething('Hi!')
    }, 450)
    return () => window.clearTimeout(timer)
  }, [greeting, gesturesEnabled, performGesture, saySomething])

  useEffect(() => {
    if (!gesturesEnabled) {
      currentGesture.current = 'idle'
      setGesture('idle')
      setSpeech(null)
      return
    }
    let gestureTimer: number
    let speechTimer: number
    const act = () => {
      const options: MascotGesture[] = latest.current.running
        ? ['wave', 'wink', 'hop']
        : ['curious', 'wave', 'hop', 'wink']
      const choices = options.filter(value => value !== previousGesture.current)
      performGesture(choices[Math.floor(Math.random() * choices.length)])
      gestureTimer = window.setTimeout(act, 3200 + Math.random() * 2200)
    }
    const chat = () => {
      saySomething()
      performGesture('wave')
      speechTimer = window.setTimeout(chat, 6500 + Math.random() * 3000)
    }
    gestureTimer = window.setTimeout(act, 2700)
    speechTimer = window.setTimeout(chat, 6500 + Math.random() * 1500)
    return () => {
      window.clearTimeout(gestureTimer)
      window.clearTimeout(speechTimer)
    }
  }, [gesturesEnabled, performGesture, saySomething])

  useEffect(() => {
    if (gesture === 'idle' || !gesturesEnabled) return
    const duration = gesture === 'greeting' ? 2100 : gesture === 'curious' ? 1800 : 1250
    const timer = window.setTimeout(() => {
      currentGesture.current = 'idle'
      setGesture('idle')
    }, duration)
    return () => window.clearTimeout(timer)
  }, [gesture, gesturesEnabled])

  useEffect(() => {
    if (!speech || !gesturesEnabled) return
    const timer = window.setTimeout(() => setSpeech(null), 2800)
    return () => window.clearTimeout(timer)
  }, [speech, gesturesEnabled])

  const characterLabel = unicorn ? 'Rainbow unicorn dinosaur' : 'Green pixel dinosaur wearing a mint bandana'
  return (
    <button
      type="button"
      className={`dino-avatar${running ? ' is-running' : ''}${unicorn ? ' unicorn' : ''}`}
      data-auto-gesture
      data-gesture={gesturesEnabled ? gesture : 'idle'}
      data-gesture-enabled={gesturesEnabled}
      data-speaking={gesturesEnabled && speech !== null}
      aria-label={gesturesEnabled ? `${characterLabel}. Say hello and jump.` : characterLabel}
      disabled={!gesturesEnabled}
      onClick={() => { saySomething(); performGesture('activation') }}
    >
      <span className="dino-shadow" aria-hidden="true" />
      {gesturesEnabled && speech && <span className="dino-hello" key={speech.id} aria-hidden="true">{speech.line}</span>}
      <span className="dino-gesture-frame"><svg className="dino-sprite" viewBox="0 0 44 34" shapeRendering="crispEdges" aria-hidden="true">
        <g className="dino-tail">
          <path fill="#203a31" d="M1 15h2v5h3v3h4v1h8v7h-7v-1H7v-2H4v-3H2v-4H1Z" />
          <path fill="#36594a" d="M4 24h4v2h9v2H8v-1H5v-1H4Z" />
        </g>
        <path className="hind-leg" fill="#345748" d="M17 27h6v4h2v3H16v-2h1Z" />
        <path className="front-leg" fill="#203a31" d="M26 27h5v5h4v2h-9v-2h-1Z" />
        <g className="dino-body">
        <path fill="#203a31" d="M12 23h3v-3h3v-3h3v-5h-1V6h2V3h3V1h14v2h3v3h2v10H32v4h-2v6h-2v3h-3v2h-8v-2h-4v-2h-1Z" />
        <path fill="#36594a" d="M24 4h3V2h10v2H27v2h-3ZM17 22h3v-3h2v8h-3v2h-3v-2h1Z" />
        <path fill="#648f79" d="M27 22h3v4h-2v3h-3v-4h2Z" />
        <g className="dino-eye-open">
          <path fill="#f8f8ed" d="M31 6h4v5h-4Z" />
          <path fill="#203a31" d="M33 7h2v3h-2Z" />
        </g>
        <path className="dino-eye-closed" fill="#f8f8ed" d="M31 8h4v1h-4Z" />
        <path fill="#203a31" d="M40 8h1v2h-1Z" />
        <path fill="#a5cbb5" d="M38 13h6v1h-6Z" />
        <path className="dino-forelimb" fill="#203a31" d="M28 21h6v2h2v2h-5v-2h-3Z" />
        <path fill="#9bcab5" d="M20 13h3v2h9v3h-9v1h-4v-2h1Z" />
        <path className="bandana-ties" fill="#9bcab5" d="M20 15h-5v-1h-3v-2h-2v3h3v2h4v1h-4v1h-3v2h4v-1h4v-2h2Z" />
        <path fill="#bbdfc9" d="M23 15h8v1h-8Z" />
        {unicorn && <g className="unicorn-details">
          <path fill="#fff0ac" d="M36 2v-3h2v-3h2v-3h2v9Z" />
          <path fill="#f5bee1" d="M19 6h3V3h6v2h-3v6h-4v3h-3V9h1Z" />
          <path fill="#cfc0fb" d="M17 13h4v4h-4v3h-3v-5h3Z" />
          <path fill="#bce7ef" d="M11 21h4v4h-4v3H8v-5h3Z" />
          <path fill="#f6d7ae" d="M5 24h3v5H5v-2H3v-4h2Z" />
          <path fill="#ffb7cc" d="M38 11h4v1h-4Z" />
        </g>}
        </g>
      </svg></span>
    </button>
  )
})

export function Portrait() {
  return (
    <svg viewBox="0 0 64 64" shapeRendering="crispEdges" role="img" aria-label="Illustrated pixel avatar for Aslan">
      <path fill="#cce1cc" d="M0 0h64v64H0Z" />
      <path fill="#dcebd6" d="M12 64V24h4v-8h8v-4h16v4h8v8h4v40Z" />
      <path fill="#f5f4d9" d="M10 10h2v4h4v2h-4v4h-2v-4H6v-2h4ZM51 18h2v3h3v2h-3v3h-2v-3h-3v-2h3ZM19 8h2v2h-2ZM53 40h3v3h-3Z" />
      <path fill="#28473d" d="M10 64v-8h5v-5h8v-3h18v3h8v5h5v8Z" />
      <path fill="#426754" d="M14 56h8v7h-8ZM43 54h6v4h4v6H43Z" />
      <path fill="#bf896c" d="M26 41h12v12h-3v3h-6v-3h-3Z" />
      <path fill="#ddb08b" d="M21 23h22v9h4v7h-4v5h-4v5H25v-4h-4v-6h-4v-7h4Z" />
      <path fill="#c98f72" d="M38 26h6v7h3v6h-4v6h-5v4h-7v-4h7ZM19 34h3v4h-3Z" />
      <path fill="#223c33" d="M20 16h5v-4h14v3h6v4h4v12h-5v-4h-5v-4h-6v3H23v5h-4v5h-3V21h4Z" />
      <path fill="#446254" d="M24 16h5v-2h9v2h-8v3h-6ZM40 17h5v4h-5Z" />
      <path fill="#203a31" d="M21 31h10v2h3v-2h10v6H34v-2h-3v2H21Zm3 2v2h5v-2Zm12 0v2h5v-2Z" fillRule="evenodd" />
      <path fill="#995d52" d="M30 41h6v2h-6Z" />
      <path fill="#9bcab5" d="M23 48h4v3h12v-3h3v5h-4v3h-3v4h-6v-4h-3v-3h-3Z" />
      <path fill="#f8f8ed" opacity=".7" d="M4 4h7v2H6v5H4Zm49 0h7v7h-2V6h-5ZM4 53h2v5h5v2H4Zm54 0h2v7h-7v-2h5Z" />
    </svg>
  )
}
