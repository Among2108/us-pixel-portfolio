import { memo, type CSSProperties, type ReactNode } from 'react'
import { Landscape } from './PixelArt'
import './scenery.css'

const sparkle = 'M5 0h2v4h4v2H7v4H5V6H1V4h4Z'

function SkyParticles({ world, tileCount }: { world: number; tileCount: number }) {
  const particles = Array.from({ length: world === 3 ? 44 : 29 }, (_, index) => {
      const style = { left: `${(index * 43 + 11) % 98}%`, top: `${(index * 29 + 11) % 86}%`, '--delay': `${-(index % 9) * .63}s` } as CSSProperties
      return index % 6 === 0
        ? <svg className="sparkle" key={index} style={style} viewBox="0 0 12 10"><path d={sparkle} fill="currentColor" /></svg>
        : <i key={index} style={style} />
    })
  return <div className="sky-particles"><div className="particle-strip">
    {Array.from({ length: tileCount }, (_, index) => <div className="particle-tile" key={index}>{particles}</div>)}
  </div></div>
}

function Rail({ layer, tileCount, children }: { layer: string; tileCount: number; children: ReactNode }) {
  return <div className={`biome-rail ${layer}`}>
    {Array.from({ length: tileCount }, (_, index) => <div className="biome-tile" key={index}>{children}</div>)}
  </div>
}

function Crystal({ x, h, hue }: { x: number; h: number; hue: number }) {
  const palettes = [
    ['#6d599b', '#9b88d6', '#cfbdf3', '#eee0ff'],
    ['#586aa0', '#8999d0', '#b0daf0', '#e6fdff'],
    ['#8c5d97', '#b981ba', '#e4b2df', '#ffe7f7'],
  ]
  const [stem, facet, face, gleam] = palettes[hue]
  return <svg className="crystal" style={{ left: `${x}%`, height: h }} viewBox="0 0 66 104" shapeRendering="crispEdges">
    <path fill={stem} d="M28 104V74h-9v-8h-6V53h6v10h12V49h8v13h9V48h7v20H43v36Z" />
    <path fill={facet} d="M30 104V76h4v28ZM46 61h4v-8h-4Z" />
    <path fill={facet} d="M22 33h4V18h4V8h5V0h5v10h5v10h4v23h-5v10H31V43h-5v-6h-4Z" />
    <path fill={face} d="M35 3h4v12h4v13h4v16h-6v9h-6Z" />
    <path className="crystal-shine" fill={gleam} d="M35 6h3v16h-3Zm5 25h3v11h-3Z" />
    <path fill={facet} d="M4 36h5v-9h5v7h5v9h5v12h-5v7H9v-7H4Z" />
    <path fill={face} d="M11 30h4v9h4v17h-4v6h-4Z" />
    <path fill={facet} d="M45 40h4V29h5v-8h6v7h4v23h-5v6H49v-6h-4Z" />
    <path fill={face} d="M54 26h5v7h4v16h-4v6h-5Z" />
  </svg>
}

function Hollow({ tileCount }: { tileCount: number }) {
  const arc = 'M14 114V91h10V70h13V53h16V38h23V25h30V16h59v9h30v13h23v15h16v17h13v21h10v23'
  return <>
    <svg className="rainbow-arc" viewBox="0 0 271 126" fill="none" shapeRendering="crispEdges">
      <path d={arc} stroke="#ef9bbe" strokeWidth="6" />
      <path d={arc} stroke="#ffd5a2" strokeWidth="6" transform="translate(9 7) scale(.934 .95)" />
      <path d={arc} stroke="#c5e3b0" strokeWidth="6" transform="translate(18 14) scale(.868 .9)" />
      <path d={arc} stroke="#a5d7df" strokeWidth="6" transform="translate(27 21) scale(.802 .85)" />
      <path d={arc} stroke="#c5abe9" strokeWidth="6" transform="translate(36 28) scale(.736 .8)" />
    </svg>
    <Rail layer="distant" tileCount={tileCount}>
      <svg className="biome-range" viewBox="0 0 500 184" preserveAspectRatio="none" shapeRendering="crispEdges">
        <path fill="#d0c1e8" d="M0 136h27v-18h16V94h17V73h15v21h14v22h23v20h26v-26h23V91h18V58h16V43h20V23h14v20h17v26h16v24h23v30h29v-16h23V83h23V59h39v17h26v19h28v28h37v13h20v48H0Z" />
        <path fill="#b9afd8" d="M0 158h35v-11h53v10h49v-15h60v14h54v-31h34v-13h37v16h29v17h38v-12h46v19h65v32H0Z" />
        <path fill="#d8ceeb" d="M214 23h15v20h17v26h16v24h17v21h-33V85h-14V59h-18Z" />
      </svg>
    </Rail>
    <Rail layer="foreground" tileCount={tileCount}>
      <Crystal x={2} h={119} hue={0} /><Crystal x={12} h={64} hue={2} />
      <Crystal x={26} h={101} hue={1} /><Crystal x={45} h={71} hue={2} />
      <Crystal x={65} h={134} hue={0} /><Crystal x={72} h={63} hue={1} />
      <Crystal x={91} h={137} hue={2} /><Crystal x={98} h={61} hue={0} />
      {[18, 39, 54, 79, 86].map((x) => <i className="crystal-light" key={x} style={{ left: `${x}%` }} />)}
    </Rail>
  </>
}

const cratePaths = 'M6 16h35v4h4v29h-4v4H6v-4H2V20h4ZM7 21v26h33V21Z'

export function Artifact({ name }: { name: string }) {
  return <svg viewBox="0 0 72 56" className="artifact" shapeRendering="crispEdges" aria-hidden="true">
    {name === 'package' && <>
      <path fill="#966345" d="M6 18h21v-6h27v6h11v28H54v6H6Z" />
      <path fill="#efbf8e" d="M9 20h35v29H9Z" /><path fill="#d59a68" d="M44 20h18v24H52v5h-8Z" />
      <path fill="#f6d7a5" d="M14 15h38v5H14Z" /><path fill="#f6edcd" d="M23 15h8v16h-8Z" />
      <path fill="#966345" d="M16 36h15v2H16Zm0 5h8v2h-8Z" />
      <path fill="#618077" d="M49 27h8v8h-8Z" />
    </>}
    {name === 'cards' && <>
      <path fill="#665689" d="M11 13h35v36H11Z" /><path fill="#c5addf" d="M14 16h29v30H14Z" />
      <path fill="#6b4d78" d="M25 8h35v40H25Z" /><path fill="#dfbfdc" d="M28 11h29v34H28Z" />
      <path fill="#2d574d" d="M37 17h28v35H37Z" /><path fill="#9bcab5" d="M40 20h22v29H40Z" />
      <path fill="#f1edd2" d="M49 26h4v4h4v8h-4v4h-4v-4h-4v-8h4Z" />
    </>}
    {name === 'pet' && <>
      <path fill="#964f53" d="M7 37h58v13h-5v3H12v-3H7Z" /><path fill="#db8a82" d="M10 37h52v10H10Z" />
      <path fill="#743f45" d="M11 34h51v6H11Z" /><path fill="#f3c3aa" d="M16 35h41v3H16Z" />
      <path fill="#faf0d3" d="M32 43h3v3h-3Zm6 0h3v3h-3Zm-3 4h3v3h-3Z" />
      <path fill="#657e66" d="M28 8h7v8h-7Zm11 0h7v8h-7Zm-19 8h7v7h-7Zm27 0h7v7h-7Zm-14 4h8v4h5v7H28v-7h5Z" />
    </>}
    {name === 'care' && <>
      <path fill="#527b69" d="M12 9h49v36H12Z" /><path fill="#a5cdb7" d="M16 13h41v28H16Z" />
      <path fill="#eaf2dc" d="M32 17h8v8h8v8h-8v7h-8v-7h-8v-8h8Z" />
      <path fill="#416754" d="M31 44h10v6h10v3H22v-3h9Z" />
    </>}
    {name === 'tofu' && <>
      <path fill="#88667f" d="M14 8h44v8h7v21H42l-12 10V37H14Z" />
      <path fill="#e7bcce" d="M18 12h36v8h7v13H40l-6 5v-5H18Z" />
      <path fill="#825d77" d="M25 21h5v5h-5Zm10 0h5v5h-5Zm10 0h5v5h-5Z" />
    </>}
    {name === 'systems' && <>
      <path fill="#4d6085" d="M29 6h14v6h9v8h8v15h-8v8h-9v8H29v-8h-9v-8h-8V20h8v-8h9Z" />
      <path fill="#a7bfe0" d="M32 10h8v7h9v7h7v8h-7v8h-9v7h-8v-7h-8v-8h-8v-8h8v-7h8Z" />
      <path fill="#526486" d="M28 21h16v16H28Z" /><path fill="#ebf3ec" d="M32 25h8v8h-8Z" />
    </>}
  </svg>
}

function Sandbox({ prop, tileCount }: { prop: string; tileCount: number }) {
  return <>
    <Rail layer="distant" tileCount={tileCount}>
      <svg className="biome-range" viewBox="0 0 500 184" preserveAspectRatio="none" shapeRendering="crispEdges">
        <path fill="#e9c8a5" d="M0 142h38v-32h31V93h45v19h22v22h39v-26h20V79h17V66h62v22h14v23h25v27h20v-17h34v-24h49v23h40v22h44v42H0Z" />
        <path fill="#efdab9" d="M74 101h35v41H74ZM211 73h58v70h-58ZM383 104h38v38h-38Z" />
        <path fill="#d8ac83" d="M0 160h33v-11h68v11h37v-16h79v8h65v-13h54v14h67v-10h49v7h48v34H0Z" />
      </svg>
    </Rail>
    <Rail layer="foreground" tileCount={tileCount}>
      {[5, 30, 67, 88].map((x, index) => <svg key={x} className={`sandbox-crate crate-${index}`} style={{ left: `${x}%` }} viewBox="0 0 49 54" shapeRendering="crispEdges">
        <path fill="#c4926e" d="M6 18h35v33H6Z" /><path fill="#956848" d={cratePaths} fillRule="evenodd" />
        <path fill="#b8855e" d="M6 43h5v-5h6v-5h6v-5h6v-5h11v5h-7v5h-6v5h-6v5h-6v6H6Z" />
      </svg>)}
      {[17, 75].map((x) => <div className="prop-table" key={x} style={{ left: `${x}%` }}><Artifact name={prop} /><i /><i /></div>)}
    </Rail>
  </>
}

function SignalTower() {
  return <svg className="signal-tower" viewBox="0 0 150 224" shapeRendering="crispEdges">
    <path fill="#436f64" d="M67 12h10v36h9v24h11v99h9v20h9v33H32v-33h9v-20h10V72h9V48h7Z" />
    <path fill="#528074" d="M76 14v45h10v20h9v94h8v20h9v31H75Z" />
    <path fill="#254742" d="M61 83h26v79H61Zm-9 97h44v10H52Zm-8 20h60v24H44Z" />
    <path fill="#7daf9d" d="M66 92h5v63h-5Zm9 0h6v10h-6Zm0 18h6v10h-6Zm0 18h6v10h-6Zm0 18h6v10h-6ZM44 197h61v4H44Z" />
    <path fill="#9bcab5" d="M43 72h61v5H43Zm2 98h55v5H45Z" />
    <path className="beacon-light" fill="#d6f5d5" d="M66 4h13v4h4v13h-4v4H66v-4h-4V8h4Z" />
    <path className="beacon-waves" fill="#a1d8af" d="M48 3h4v4h-4Zm-4 4h4v15h-4Zm4 15h4v4h-4Zm47-19h4v4h-4Zm4 4h4v15h-4Zm-4 15h4v4h-4ZM35 0h4v5h-4Zm-4 5h4v21h-4Zm4 21h4v5h-4Zm73-26h4v5h-4Zm4 5h4v21h-4Zm-4 21h4v5h-4Z" />
  </svg>
}

function Signal({ tileCount }: { tileCount: number }) {
  return <>
    <Rail layer="distant" tileCount={tileCount}>
      <svg className="biome-range" viewBox="0 0 500 184" preserveAspectRatio="none" shapeRendering="crispEdges">
        <path fill="#294c47" d="M0 124h42V96h26v20h23v25h44v-31h26V81h46v31h16v29h49v-32h20v-9h41v24h31V90h28v16h25v29h25v-14h31v16h27v47H0Z" />
        <path fill="#39645a" d="M0 153h40v-9h52v14h47v-11h55v-13h28v13h39v7h53v-7h39v-12h38v18h40v-8h69v39H0Z" />
        <path fill="#79a99a" d="M48 104h6v4h-6Zm124-12h6v4h-6Zm15 0h6v4h-6Zm111 15h7v4h-7Zm15 0h7v4h-7Zm62-9h7v4h-7Z" />
      </svg>
    </Rail>
    <SignalTower />
  </>
}

export const WorldArt = memo(function WorldArt({ world, prop, tileCount = 4 }: { world: number; prop: string; tileCount?: number }) {
  return <div className="world-art" aria-hidden="true">
    {world === 0 ? <Landscape tileCount={tileCount} /> : world === 1 ? <Hollow tileCount={tileCount} /> : world === 2 ? <Sandbox prop={prop} tileCount={tileCount} /> : <Signal tileCount={tileCount} />}
    <SkyParticles world={world} tileCount={tileCount} />
    <div className="ground" />
  </div>
})

export function Warp({ portal, title, opacity, replay = false }: { portal: number; title: string; opacity: number; replay?: boolean }) {
  return <div className={`warp warp-${portal}${replay ? ' warp-replay' : ''}`} style={{ opacity }} aria-hidden="true">
    <div className="warp-core" />
    <div className="warp-trails">
      {Array.from({ length: 26 }, (_, index) => <i key={index} style={{
        '--trail-y': `${(index * 31 + 5) % 100}%`,
        '--trail-x': `${(index * 17) % 110}%`,
        '--trail-length': `${30 + (index * 37) % 170}px`,
        '--delay': `-${(index * 11) % 83 / 100}s`,
      } as CSSProperties} />)}
    </div>
    <span className="warp-label">[ {title} ]</span>
  </div>
}
