import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Artifact, Warp, WorldArt } from './Biomes'
import { Dino } from './PixelArt'
import { beats, clamp, code, contact, entries, portals, worlds, profile, skills, training, tofuSystems, portraitImage, resumeFiles, type Entry, type PortfolioImage } from './story'
import { usePreparedImage, retryImage, markImageUnavailable } from './imageReadiness'
import { chapterStops, readingStops, routeLength, useJourney, type ReadingStopId } from './useJourney'
import { useJourneyAudio } from './useJourneyAudio'
import { sceneryStyle } from './scenery'
import resumeUrl from './assets/aslan-resume.txt?url'

const iconPaths = {
  dino: 'M14 3h8v2h2v9h-7v5h-2v4h-4v-4H8v4H5v-5H3v-2H1v-5h2v3h4v-2h3V7h2V5h2Z M17 6v2h2V6Z M19 11v1h5v-1Z',
  arrow: 'M12 4h3v3h3v3h3v4h-3v3h-3v3h-3v-4h3v-3H3v-3h12V8h-3Z',
  mouse: 'M8 2h8v2h3v16h-3v2H8v-2H5V4h3ZM8 5v14h8V5ZM11 6h2v5h-2Z',
  flag: 'M4 3h16v11h-3v-3H7v11H4Zm3 3v2h10V6Z',
  star: 'M10 2h4v7h7v4h-7v8h-4v-8H3V9h7Z',
  crystal: 'M10 2h4v4h4v4h3v5h-3v3h-4v4h-4v-4H6v-3H3v-5h3V6h4Zm0 8v5h4v-5Z',
  box: 'M4 5h16v3h2v13H2V8h2Zm2 3v2h12V8Zm-1 5v5h14v-5h-5v2h-4v-2Z',
  signal: 'M4 5h16v2h2v12H2V7h2Zm1 4v6h14V9l-5 4h-4Zm2-1 5 3 5-3Z',
  profile: 'M9 4h6v2h2v7h-2v2H9v-2H7V6h2ZM7 16h10v2h3v4H4v-4h3Z',
  previous: 'M14 4h3v4h-4v3h8v3h-8v3h4v4h-3v-3h-4v-3H6v-5h4V7h4Z',
  next: 'M10 4H7v4h4v3H3v3h8v3H7v4h3v-3h4v-3h4v-5h-4V7h-4Z',
  play: 'M6 3h3v2h3v2h3v2h3v2h3v3h-3v2h-3v2h-3v2H9v2H6Z',
  pause: 'M5 4h5v16H5Zm9 0h5v16h-5Z',
  settings: 'M3 6h6V3h4v3h8v3h-8v3H9V9H3Zm0 10h12v-3h4v3h2v3h-2v3h-4v-3H3Z',
  soundOn: 'M2 9h4V7h3V5h3v14H9v-2H6v-2H2Zm13-1h2v2h2v4h-2v2h-2v-3h2v-2h-2Zm4-4h2v3h2v10h-2v3h-2v-4h2V8h-2Z',
  soundOff: 'M2 9h4V7h3V5h3v14H9v-2H6v-2H2Zm13-1h2v2h2V8h2v3h-2v2h2v3h-2v-2h-2v2h-2v-3h2v-2h-2Z',
}

const worldIcons = ['star', 'crystal', 'box', 'signal'] as const
const navLabels = ['About', 'Experience', 'Projects', 'Contact']
type Detail = 'profile' | 'skills' | 'training' | 'contact' | 'settings' | 'entry' | 'system'
type OpenDetail = (kind: Detail, id?: string) => void

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" shapeRendering="crispEdges" aria-hidden="true"><path d={iconPaths[name]} /></svg>
}

function Tags({ tags }: { tags: readonly string[] }) {
  return <ul className="skill-tags">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
}

function CardTop({ title, codeLabel, icon }: { title: string; codeLabel: string; icon: keyof typeof iconPaths }) {
  return <div className="card-top"><span><Icon name={icon} /> {title}</span><span>{codeLabel}</span></div>
}

function DetailButton({ onClick, children = 'View details' }: { onClick: () => void; children?: ReactNode }) {
  return <button className="detail-button" onClick={onClick}>{children}</button>
}

function Screenshot({ image, expanded = false, open, demoUrl }: { image: PortfolioImage; expanded?: boolean; open?: () => void; demoUrl?: string }) {
  const preview = usePreparedImage(image.preview?.src)
  const detail = usePreparedImage(expanded ? image.detail?.src : undefined)
  if (!image.preview || !image.full) return null
  const target = expanded && image.detail ? image.detail : image.preview
  const status = expanded && image.detail ? detail : preview
  const display = status === 'ready' ? target : preview === 'ready' ? image.preview : undefined
  const picture = display
    ? <img src={display.src} width={display.width} height={display.height} alt={image.alt} onError={() => markImageUnavailable(display.src)} />
    : <span className="media-placeholder">{status === 'failed' ? 'Image unavailable' : 'Loading image…'}</span>
  return <figure className={`screenshot${expanded ? ' screenshot-expanded' : ''}`}>
    <div className="preview-media" style={{ '--media-ratio': `${image.full.width} / ${image.full.height}` } as CSSProperties}>
      {demoUrl || expanded
        ? <a className="screenshot-frame" href={demoUrl || image.full.src} target="_blank" rel="noopener noreferrer" aria-label={`${demoUrl ? 'Open project website' : 'Open full-size image'}: ${image.alt}`}>{picture}</a>
        : <button type="button" className="screenshot-frame" onClick={open} aria-label={`Open details: ${image.alt}`}>{picture}</button>}
      {status === 'failed' && <button className="media-retry" onClick={() => retryImage(target.src)} aria-label={`Retry image: ${image.alt}`}>Retry image</button>}
    </div>
    <figcaption><span>{image.caption}</span><a href={image.full.src} target="_blank" rel="noopener noreferrer" aria-label={`View image: ${image.alt} (opens in a new tab)`}>View image</a></figcaption>
  </figure>
}

function ProfileCard({ open }: { open: OpenDetail }) {
  const portrait = portraitImage.preview
  const status = usePreparedImage(portrait?.src)
  return <aside className="story-card profile-card" aria-label="Player profile">
    <CardTop title="PLAYER PROFILE" codeLabel="ID: 01" icon="profile" />
    <div className="card-body">
      <div className="profile-main">
        <div className="portrait actual-portrait">
          {portrait && status === 'ready'
            ? <img src={portrait.src} width={portrait.width} height={portrait.height} alt="Portrait of Aslan Promjit." onError={() => markImageUnavailable(portrait.src)} />
            : <div className="portrait-placeholder"><span>AP</span>{portrait && status === 'failed' && <button className="media-retry" onClick={() => retryImage(portrait.src)}>Retry portrait</button>}</div>}
        </div>
        <div><h3>{profile.name}</h3><p className="profile-role">{profile.title}</p><p>{profile.subtitle}</p></div>
      </div>
      <DetailButton onClick={() => open('profile')} />
    </div>
  </aside>
}

function SkillsCard({ open }: { open: OpenDetail }) {
  return <aside className="story-card skills-card" aria-label="Skill inventory">
    <CardTop title="SKILL INVENTORY" codeLabel={`${code(skills.length)} GROUPS`} icon="star" />
    <div className="card-body">
      <h3>Technologies I Use and Continue to Learn</h3>
      <div className="skill-preview">
        {skills.filter(group => ['Languages', 'Front end', 'Back end', 'AI-assisted development'].includes(group.label)).map(group => <div key={group.id}><strong>{group.label}</strong><Tags tags={group.items} /></div>)}
      </div>
      <DetailButton onClick={() => open('skills')}>View all skills</DetailButton>
    </div>
  </aside>
}

function EntryCard({ entry, open }: { entry: Entry; open: OpenDetail }) {
  const index = entries.indexOf(entry)
  const isProject = index >= 3
  return <article className={`story-card entry-card${isProject ? ' project-card' : ''}`} data-entry-id={entry.id} data-art={entry.art}>
    <CardTop title={isProject ? 'PROJECT LOG' : 'EXPERIENCE LOG'} codeLabel={`${code(index % 3 + 1)}/03`} icon={isProject ? 'box' : 'crystal'} />
    <div className="card-body">
      <div className="entry-heading"><div className="entry-art"><Artifact name={entry.art} /></div><div>
        <p className="card-kicker">{entry.category}</p><h3>{isProject && entry.demoUrl ? <a className="project-title" href={entry.demoUrl} target="_blank" rel="noopener noreferrer">{entry.name}</a> : entry.name}</h3>
        {entry.badge && <span className="status-badge">{entry.badge}</span>}
      </div></div>
      <p className="entry-copy">{entry.copy}</p>
      {entry.images?.[0] && <Screenshot image={entry.images[0]} demoUrl={isProject ? entry.demoUrl : undefined} open={() => open('entry', entry.id)} />}
      <DetailButton onClick={() => open('entry', entry.id)} />
    </div>
  </article>
}

function SystemCard({ system, open }: { system: typeof tofuSystems[number]; open: OpenDetail }) {
  const index = tofuSystems.indexOf(system)
  return <article className="story-card system-card" data-parent-id={system.parentId}>
    <CardTop title="TOFU SKINCARE" codeLabel={`${index + 1} OF 5`} icon="crystal" />
    <div className="card-body">
      <p className="card-kicker system-parent">Tofu Skincare / Internal Web Applications</p>
      <h3>{system.name}</h3>
      <span className="status-badge">{system.badge}</span>
      <p className="entry-copy">{system.summary}</p>
      {system.images[0] && <Screenshot image={system.images[0]} open={() => open('system', system.id)} />}
      <DetailButton onClick={() => open('system', system.id)} />
    </div>
  </article>
}

function TrainingCard({ open }: { open: OpenDetail }) {
  return <article className="story-card training-card">
    <CardTop title="TRAINING LOG" codeLabel="01/01" icon="star" />
    <div className="card-body">
      <p className="card-kicker">Training</p>
      <h3>{training.name}</h3>
      <p className="entry-copy">{training.copy}</p>
      {training.images?.[0] && <Screenshot image={training.images[0]} open={() => open('training')} />}
      <DetailButton onClick={() => open('training')} />
    </div>
  </article>
}

function ResumeDownloads({ expanded = false }: { expanded?: boolean }) {
  return <div className="resume-downloads">
    {resumeFiles.map(file => file.src
      ? <a key={file.id} className="detail-button" href={file.src} download={file.expectedFilename}>{file.label}</a>
      : expanded && <span key={file.id} className="unavailable-download">{file.label} · Unavailable</span>)}
    {!expanded && resumeFiles.some(file => !file.src) && <p className="download-note">Résumé PDFs not yet supplied.</p>}
    <a className="detail-button summary-download" href={resumeUrl} download="aslan-resume.txt">Download Portfolio Summary</a>
  </div>
}

function ContactLinks() {
  return <div className="contact-actions">
    {contact.links.map(({ label, href }) => <a key={href} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
  </div>
}

function ContactCard({ goTo, open }: { goTo: (id: ReadingStopId) => void; open: OpenDetail }) {
  return <aside className="story-card contact-card" aria-label="Contact details">
    <CardTop title="SIGNAL TERMINAL" codeLabel="ONLINE" icon="signal" />
    <div className="card-body">
      <dl className="contact-list">
        <div><dt>Email</dt><dd><a href={`mailto:${contact.email}`}>{contact.email}</a></dd></div>
        <div><dt>Phone</dt><dd><a href={contact.phoneHref}>{contact.phone}</a></dd></div>
      </dl>
      <ContactLinks />
      <ResumeDownloads />
      <div className="contact-fallback"><button onClick={() => goTo('icare')}>Work</button><button onClick={() => goTo('pick-us')}>Projects</button><button onClick={() => open('contact')}>View contact details</button></div>
    </div>
  </aside>
}

function StoryScene({ stop, open, goTo, covered }: {
  stop: typeof readingStops[number]; open: OpenDetail; goTo: (id: ReadingStopId) => void; covered: boolean
}) {
  const beat = beats[stop.beatIndex]
  const entry = entries.find(item => item.id === stop.id)
  const system = tofuSystems.find(item => item.id === stop.id)
  const title = system ? system.name : stop.id === 'training' ? 'TRAINING' : beat.title
  const [line, accent] = title.split('|')
  const intro = stop.id === 'profile' ? profile.intro : stop.id === 'contact' ? contact.body
    : stop.id === 'skills' ? 'I build practical web applications and keep learning through hands-on projects.'
    : !system && stop.id !== 'training' ? beat.copy : ''
  return <section className={`story-scene reading-layout scene-${stop.beatIndex}`} data-stop-id={stop.id} inert={covered} aria-labelledby="reading-title">
    <div className="reading-intro">
      <p className="eyebrow"><i /> {system ? 'TOFU SKINCARE / INTERNAL WEB APPLICATIONS' : stop.id === 'training' ? '02 / TRAINING' : beat.label}</p>
      <h2 id="reading-title" className="reading-title">{line}{accent && <><br /><span>{accent}</span></>}</h2>
      {intro && <p className="intro-copy">{intro}</p>}
      {(system || stop.id === 'training') && <p className="intro-copy compact-summary">{system?.summary ?? training.copy}</p>}
    </div>
    <div className="reading-panel">
      {stop.id === 'profile' ? <ProfileCard open={open} /> : stop.id === 'skills' ? <SkillsCard open={open} />
        : stop.id === 'contact' ? <ContactCard goTo={goTo} open={open} />
        : system ? <SystemCard system={system} open={open} />
        : stop.id === 'training' ? <TrainingCard open={open} />
        : entry ? <EntryCard entry={entry} open={open} /> : null}
    </div>
  </section>
}

function Modal({ title, close, motion, children }: { title: string; close: () => void; motion: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const entranceFinished = useRef(0)
  const [entering, setEntering] = useState(motion)
  const [closing, setClosing] = useState(false)
  const requestClose = () => motion ? setClosing(true) : close()
  useEffect(() => {
    if (!motion) {
      setEntering(false)
      return
    }
    if (!entering || closing) return
    // Animation events normally settle the full dust sequence. Release the
    // decorative layer even if a browser cancels or omits an ending event.
    const timer = window.setTimeout(() => setEntering(false), 1000)
    return () => window.clearTimeout(timer)
  }, [entering, closing, motion])
  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(close, motion ? 320 : 0)
    return () => window.clearTimeout(timer)
  }, [closing, close, motion])
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.documentElement
    const overflow = root.style.overflowY
    root.style.overflowY = 'hidden'
    node.showModal()
    return () => {
      if (node.open) node.close()
      root.style.overflowY = overflow
      opener?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="detail-dialog" aria-labelledby="dialog-title" data-transition={motion ? closing ? 'exit' : entering ? 'enter' : 'settled' : 'none'}
    onAnimationEnd={event => {
      if (!entering || closing || (event.animationName !== 'dust-gather' && event.animationName !== 'panel-materialize')) return
      entranceFinished.current += 1
      // Wait for every grain and the panel, including staggered grain delays.
      if (entranceFinished.current >= dustGrains.length + 1) setEntering(false)
    }}
    onCancel={event => { event.preventDefault(); requestClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      // The materializing surface temporarily has transparent cut-outs. A
      // click in those gaps is still inside the panel, not on the backdrop.
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose()
    }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0)
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }}>
    {motion && (entering || closing) && <PixelDust />}
    <div className="dialog-surface">
      <header className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="detail-button" onClick={requestClose}>Close details <span aria-hidden="true">×</span></button></header>
      <div className="dialog-content">{children}</div>
    </div>
  </dialog>
}

// Fixed seeds keep the dust stable through React updates. Every grain has a
// destination on the panel, so it gathers into the content rather than raining
// over the page. The layer is decorative and never catches pointer events.
const dustGrains = Array.from({ length: 84 }, (_, index) => {
  const column = index % 12
  const row = Math.floor(index / 12)
  const seed = (index * 37 + 19) % 101
  const angle = index * 2.399963
  const distance = 65 + seed * 1.25
  return {
    left: `${(column + .5) / 12 * 100}%`,
    top: `${(row + .5) / 7 * 100}%`,
    '--dust-x': `${Math.round(Math.cos(angle) * distance)}px`,
    '--dust-y': `${Math.round(Math.sin(angle) * distance)}px`,
    '--dust-size': `${4 + index % 3 * 3}px`,
    '--dust-delay': `${seed * .7}ms`,
    '--dust-ink': ['#f8f8ed', '#9bcab5', '#527962', '#d5e7c9'][index % 4],
  } as CSSProperties
})

function PixelDust() {
  return <div className="pixel-dust" aria-hidden="true">{dustGrains.map((style, index) => <i className="pixel-grain" key={index} style={style} />)}</div>
}

function ImageGallery({ images, demoUrl }: { images?: readonly PortfolioImage[]; demoUrl?: string }) {
  const supplied = images?.filter(image => image.preview)
  return supplied?.length ? <div className="detail-gallery">{supplied.map(image => <Screenshot key={image.id} image={image} expanded demoUrl={demoUrl} />)}</div> : null
}

export default function App() {
  const track = useRef<HTMLElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const focusStartAfterReplay = useRef(false)
  const replayButton = useRef<HTMLButtonElement>(null)
  const [detail, setDetail] = useState<{ kind: Detail; id?: string } | null>(null)
  const journey = useJourney(track, screen, detail !== null)
  const { stop, stopIndex, world, portal, phase, cover, nearest, progress, running, direction, playing, autoState, ended, reduced, motion, speed, goTo, next, previous, play, pause, pauseForInteraction, setSpeed, setMotion } = journey
  const { replayState, replaySeconds, replayOpacity, replayAuto, replayNow, stayHere } = journey
  const returning = replayState === 'returning'
  const sound = useJourneyAudio({ world, portal: reduced ? -1 : portal, returning, blocked: detail !== null })
  const soundLabel = sound.pending ? 'Cancel sound activation' : sound.enabled ? 'Turn sound off' : 'Turn sound on'
  const returnPending = !reduced && (replayState === 'counting' || replayState === 'waiting')
  const canPause = playing || (ended && (replayAuto || returnPending))
  const playbackLabel = canPause ? 'Pause Auto Run' : 'Play Auto Run'
  const open: OpenDetail = (kind, id) => {
    pauseForInteraction()
    window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    setDetail({ kind, id })
  }
  const close = useCallback(() => setDetail(null), [])
  useEffect(() => {
    if (focusStartAfterReplay.current && !returning && stop.id === 'profile') {
      screen.current?.querySelector<HTMLButtonElement>('.brand')?.focus({ preventScroll: true })
      focusStartAfterReplay.current = false
    }
  }, [returning, stop.id])
  const jump = portal === 0 ? Math.sin(phase * Math.PI) : portal > 0 ? Math.sin(phase * Math.PI) * .32 : 0
  const style = {
    ...sceneryStyle(journey.sceneryDistance, journey.sceneryTileWidth, journey.sceneryLandmarkDistance, reduced),
    '--jump': reduced ? 0 : jump, '--facing': direction,
  } as CSSProperties
  const prop = entries[clamp(nearest - 2, 3, 5)].art
  const detailEntry = detail?.kind === 'entry' ? entries.find(entry => entry.id === detail.id) : undefined
  const detailSystem = detail?.kind === 'system' ? tofuSystems.find(system => system.id === detail.id) : undefined
  let modalTitle = '', modalContent: ReactNode = null

  if (detail?.kind === 'profile') {
    modalTitle = profile.name
    modalContent = <><p className="dialog-role">{profile.title}</p><p>{profile.subtitle}</p><p>{profile.intro}</p>{profile.detail.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</>
  } else if (detail?.kind === 'skills') {
    modalTitle = 'Technologies I Use and Continue to Learn'
    modalContent = <><div className="full-skills">{skills.map(group => <section key={group.id}><h3>{group.label}</h3><Tags tags={group.items} /></section>)}</div><p>{profile.aiDescription}</p></>
  } else if (detailEntry) {
    modalTitle = detailEntry.name
    modalContent = <><p className="dialog-role">{detailEntry.category}</p>{detailEntry.badge && <span className="status-badge">{detailEntry.badge}</span>}<p>{detailEntry.copy}</p>{detailEntry.detail.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      {detailEntry.id === 'tofu-systems' ? <ul className="system-list">{tofuSystems.map(system => <li key={system.id}>{system.name}</li>)}</ul> : <><h3>{entries.indexOf(detailEntry) >= 3 ? 'Technologies' : 'Experience areas'}</h3><Tags tags={detailEntry.tags} /></>}
      {detailEntry.demoUrl && <a href={detailEntry.demoUrl} target="_blank" rel="noopener noreferrer">Visit {detailEntry.name}</a>}
      <ImageGallery images={detailEntry.images} demoUrl={detailEntry.demoUrl} /></>
  } else if (detailSystem) {
    modalTitle = detailSystem.name
    modalContent = <><p className="dialog-role">Tofu Skincare / Internal Web Applications / {tofuSystems.indexOf(detailSystem) + 1} of 5</p><span className="status-badge">{detailSystem.badge}</span><p>{detailSystem.summary}</p>{detailSystem.detail.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<ImageGallery images={detailSystem.images} /></>
  } else if (detail?.kind === 'training') {
    modalTitle = training.name
    modalContent = <><p className="dialog-role">Training</p><p>{training.copy}</p>{training.detail.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<ImageGallery images={training.images} /></>
  } else if (detail?.kind === 'contact') {
    modalTitle = contact.title
    modalContent = <><p>{contact.body}</p><p><a href={`mailto:${contact.email}`}>{contact.email}</a></p><p><a href={contact.phoneHref}>{contact.phone}</a></p><ContactLinks /><h3>Downloads</h3><ResumeDownloads expanded /></>
  } else if (detail?.kind === 'settings') {
    modalTitle = 'Tour settings'
    modalContent = <><fieldset className="speed-options"><legend>Auto Run speed</legend>{(['Slow', 'Normal', 'Fast'] as const).map(value => <label key={value}><input type="radio" name="tour-speed" checked={speed === value} onChange={() => setSpeed(value)} /> {value}</label>)}</fieldset>
      <label className="motion-setting"><input type="checkbox" checked={motion && !reduced} disabled={reduced} onChange={event => setMotion(event.target.checked)} /> Motion</label>
      <div className="sound-setting"><span>World music &amp; sound effects</span><button type="button" className="detail-button" onClick={sound.toggle} disabled={!sound.supported} aria-pressed={sound.enabled}>{sound.pending ? 'Cancel' : sound.enabled ? 'Sound on' : 'Sound off'}</button></div>
      <p>Turn sound on for each world’s melody, jumps, and portals.</p>
      <p>{reduced ? 'Your reduced-motion preference keeps the world still and Auto Run unavailable.' : 'Auto Run travels continuously through every world. Choose a comfortable speed, or pause whenever you want to read. Scrolling, opening details, or leaving this tab pauses the tour; choose Play to continue.'}</p>
      {!reduced && <p>Motion controls the mascot’s idle gestures, background drift, and pixel dust transitions.</p>}</>
  }

  return (
    <main className="scroll-track" ref={track} style={{ '--route-size': routeLength } as CSSProperties}>
      <h1 className="sr-only">Aslan Promjit — Junior Full-Stack Developer</h1>
      <div className={`game-screen stage world-${world}${!motion || reduced ? ' motion-off' : ''}${reduced ? ' reduced-motion' : ''}`} ref={screen} style={style}>
        <div className="scene-plane">
          <WorldArt world={world} prop={prop} tileCount={journey.sceneryTileCount} />
          <header className="masthead" inert={returning}>
            <div className="frame-width masthead-inner">
              <button className="brand" onClick={() => goTo('profile')} aria-label="ASLAN.EXE Pixel Runner — back to start">
                <span className="brand-mark"><Icon name="dino" /></span>
                <span className="brand-wordmark"><strong>ASLAN<span>.EXE</span></strong><small>PIXEL RUNNER</small></span>
              </button>
              <nav className="site-nav" aria-label="Portfolio worlds">
                {navLabels.map((label, index) => <button className="world-tab" key={label} onClick={() => goTo(chapterStops[index])} aria-current={world === index ? 'location' : undefined} title={worlds[index].theme} style={{ '--nav-tint': worlds[index].tint } as CSSProperties}>
                  <span className="nav-icon"><Icon name={worldIcons[index]} /></span><span className="nav-label">{label}</span>
                </button>)}
              </nav>
              <div className="journey-controls" role="group" aria-label="Journey controls">
                <button className="journey-control" onClick={previous} disabled={stopIndex === 0} aria-label="Previous stop" title="Previous stop"><Icon name="previous" /></button>
                <button className="journey-control" onClick={next} disabled={stopIndex === readingStops.length - 1} aria-label="Next stop" title="Next stop"><Icon name="next" /></button>
                <button data-auto-play className="journey-control auto-play" onClick={canPause ? pause : play} disabled={reduced || (ended && !canPause)} aria-label={playbackLabel} title={playbackLabel}><Icon name={canPause ? 'pause' : 'play'} /><span>{canPause ? 'Pause' : 'Play'}</span></button>
                <button type="button" data-audio-toggle data-audio-state={sound.pending ? 'starting' : sound.enabled ? 'on' : 'off'} className="journey-control sound-toggle" onClick={sound.toggle} disabled={!sound.supported} aria-pressed={sound.enabled} aria-busy={sound.pending} aria-label={sound.supported ? 'Sound' : 'Sound unavailable in this browser'} title={sound.supported ? soundLabel : 'Sound unavailable in this browser'}><Icon name={sound.enabled ? 'soundOn' : 'soundOff'} /></button>
                <button className="journey-control" onClick={() => open('settings')} aria-label="Tour settings" title="Tour settings" aria-haspopup="dialog"><Icon name="settings" /></button>
              </div>
            </div>
            {sound.error && <p className="sound-feedback" role="status">{sound.error}</p>}
          </header>
          <Dino running={!reduced && running} unicorn={world === 1} world={world} greeting={stop.id === 'profile'} motion={motion && !reduced} interactive={portal < 0 && !returning && detail === null} onJump={sound.jump} />
          <div className="game-shell frame-width" inert={returning}>
            <div className="stage-hud">
              <span className="world-tag"><Icon name={portal >= 0 ? 'star' : worldIcons[world]} /> {portal >= 0 && !reduced ? portals[portal].name : <>WORLD {code(world + 1)} <b>/</b> {worlds[world].theme}</>}</span>
              <div className="stage-progress">
                <span className="reading-count" aria-label={`Stop ${stopIndex + 1} of ${readingStops.length}`}>{code(stopIndex + 1)}/{readingStops.length}</span>
                <div className="progress-meter" role="progressbar" aria-label="Story progress" aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
                <span className="tour-status" data-auto-state={autoState}><span role="status">{autoState === 'travelling' ? 'Auto Run' : autoState === 'ended' ? 'Finished' : 'Paused'}</span></span>
              </div>
              {ended && !returning && <div className="endpoint-return" data-replay-state={replayState}>
                {returnPending && <span className="return-countdown" style={{ visibility: replaySeconds === null ? 'hidden' : 'visible' }}>Returning to start in <span>{replaySeconds ?? 30}</span>s</span>}
                {replayState === 'stayed' && <span role="status">Staying at Contact</span>}
                {returnPending && <button type="button" onClick={() => { stayHere(); replayButton.current?.focus({ preventScroll: true }) }}>Stay here</button>}
                <button type="button" ref={replayButton} onClick={() => { focusStartAfterReplay.current = true; replayNow() }}>Replay now</button>
              </div>}
            </div>
            <div className="scene-track">
              <StoryScene key={stop.id} stop={stop} open={open} goTo={goTo} covered={!reduced && cover >= .65} />
            </div>
          </div>
        </div>
        {portal >= 0 && !reduced && <Warp portal={portal} title={portals[portal].name} opacity={cover} />}
        {replayOpacity !== null && <Warp replay portal={0} title={portals[0].name} opacity={replayOpacity} />}
      </div>
      {detail && <Modal title={modalTitle} close={close} motion={motion && !reduced}>{modalContent}</Modal>}
    </main>
  )
}
