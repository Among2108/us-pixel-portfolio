type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }
type Voice = { oscillator: OscillatorNode; envelope: GainNode }
type MusicLayer = {
  gain: GainNode
  filter: BiquadFilterNode
  voices: Set<Voice>
  step: number
  nextNoteAt: number
  world: number
}

// Original, deliberately sparse motifs leave room for the portfolio's text.
// A rest is zero. MIDI pitches keep each world's melody and bass in tune.
const scores = [
  { interval: .62, tone: 'triangle', cutoff: 1900, melody: [72, 0, 76, 79, 0, 74, 0, 67, 72, 0, 76, 0, 79, 0, 74, 0], bass: [48, 53, 57, 55] },
  { interval: .46, tone: 'sine', cutoff: 3200, melody: [74, 78, 81, 0, 83, 81, 78, 0, 76, 78, 81, 0, 85, 83, 81, 0], bass: [50, 57, 54, 52] },
  { interval: .39, tone: 'square', cutoff: 1050, melody: [60, 67, 72, 0, 64, 67, 74, 0, 65, 69, 72, 0, 67, 71, 74, 0], bass: [36, 40, 41, 43] },
  { interval: .78, tone: 'sine', cutoff: 2300, melody: [69, 0, 76, 0, 73, 0, 64, 0, 69, 0, 80, 76, 0, 73, 0, 0], bass: [45, 50, 54, 52] },
] as const

function audioConstructor() {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || (window as AudioWindow).webkitAudioContext
}

export function supportsJourneyAudio() {
  return Boolean(audioConstructor())
}

function fade(parameter: AudioParam, value: number, time: number, duration: number) {
  parameter.cancelScheduledValues(time)
  parameter.setValueAtTime(parameter.value, time)
  parameter.linearRampToValueAtTime(value, time + duration)
}

function frequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12)
}

/** One context, one scheduling timer, and at most two music layers per visitor. */
export class JourneyAudio {
  private readonly context: AudioContext
  private readonly master: GainNode
  private readonly music: GainNode
  private readonly effects: Set<Voice> = new Set()
  private layer: MusicLayer | null = null
  private retiringLayer: MusicLayer | null = null
  private scheduler: number | undefined
  private fadeTimer: number | undefined
  private resumeTimer: number | undefined
  private cancelResume: (() => void) | undefined
  private operation = 0
  private world = 0
  private blocked = false
  private intended = false
  private playing = false
  private disposed = false
  private lastJump = -Infinity
  private lastWarp = -Infinity

  constructor(private readonly interrupted: () => void) {
    const Context = audioConstructor()
    if (!Context) throw new Error('Audio is unavailable')
    // The constructor is invoked only from the visitor's sound-button click.
    this.context = new Context({ latencyHint: 'interactive' })
    let master: GainNode | undefined
    let music: GainNode | undefined
    try {
      this.master = master = this.context.createGain()
      this.master.gain.value = 0
      this.master.connect(this.context.destination)
      this.music = music = this.context.createGain()
      this.music.connect(this.master)
      this.context.addEventListener('statechange', this.onStateChange)
    } catch (error) {
      // A throwing constructor never reaches the hook's engine ref.
      music?.disconnect()
      master?.disconnect()
      void this.context.close().catch(() => {})
      throw error
    }
  }

  get isRunning() {
    return this.playing && this.context.state === 'running'
  }

  private onStateChange = () => {
    if (this.disposed) return
    if (!this.intended && this.context.state === 'running') {
      void this.context.suspend().catch(() => {})
    } else if (this.playing && this.context.state !== 'running') {
      // An OS interruption can happen without a visibilitychange on iOS.
      this.recover()
    }
  }

  private recover() {
    this.pause()
    this.interrupted()
  }

  async start() {
    if (this.disposed) return false
    if (this.isRunning) return true
    this.cancelResume?.()
    window.clearTimeout(this.scheduler)
    this.scheduler = undefined
    const operation = ++this.operation
    this.intended = true
    const ready = await new Promise<boolean>(resolve => {
      let settled = false
      const finish = (success: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(this.resumeTimer)
        this.resumeTimer = undefined
        this.cancelResume = undefined
        resolve(success)
      }
      this.cancelResume = () => finish(false)
      this.resumeTimer = window.setTimeout(() => finish(false), 2400)
      try {
        // Invoke resume synchronously before awaiting, preserving the click's
        // activation on Safari. A stalled resume always leaves a usable button.
        const resumed = this.context.resume()
        void resumed.then(() => finish(this.context.state === 'running'), () => finish(false))
      } catch {
        finish(false)
      }
    })
    if (operation !== this.operation || this.disposed) return false
    if (!ready || this.context.state !== 'running') {
      this.pause()
      return false
    }
    try {
      this.playing = true
      fade(this.master.gain, .55, this.context.currentTime, .12)
      this.changeMusic()
      this.schedule()
      // The first scheduler tick may already have reported an allocation error.
      return this.isRunning
    } catch {
      this.pause()
      return false
    }
  }

  setWorld(world: number) {
    const next = Math.max(0, Math.min(scores.length - 1, Math.trunc(world)))
    if (next === this.world) return
    this.world = next
    if (this.isRunning) {
      try { this.changeMusic() } catch { this.recover() }
    }
  }

  setBlocked(blocked: boolean) {
    this.blocked = blocked
    fade(this.music.gain, blocked ? .24 : 1, this.context.currentTime, .22)
  }

  private changeMusic() {
    window.clearTimeout(this.fadeTimer)
    this.fadeTimer = undefined
    if (this.retiringLayer) this.releaseLayer(this.retiringLayer)
    this.retiringLayer = this.layer
    this.layer = null
    const now = this.context.currentTime
    if (this.retiringLayer) {
      const outgoing = this.retiringLayer
      fade(outgoing.gain.gain, 0, now, .65)
      this.fadeTimer = window.setTimeout(() => {
        this.releaseLayer(outgoing)
        if (this.retiringLayer === outgoing) this.retiringLayer = null
        this.fadeTimer = undefined
      }, 720)
    }
    const gain = this.context.createGain()
    let filter: BiquadFilterNode
    try { filter = this.context.createBiquadFilter() } catch (error) {
      gain.disconnect()
      throw error
    }
    this.layer = { gain, filter, voices: new Set(), world: this.world, step: 0, nextNoteAt: now + .035 }
    gain.gain.value = 0
    gain.connect(this.music)
    filter.type = 'lowpass'
    filter.frequency.value = scores[this.world].cutoff
    filter.Q.value = .5
    filter.connect(gain)
    fade(gain.gain, 1, now, .65)
  }

  private schedule = () => {
    if (!this.isRunning || !this.layer) return
    try {
      const layer = this.layer
      const score = scores[layer.world]
      const now = this.context.currentTime
      // A throttled browser must never play a backlog of missed notes at once.
      if (layer.nextNoteAt < now - .2) layer.nextNoteAt = now + .035
      while (layer.nextNoteAt < now + .3) {
        const pitch = score.melody[layer.step % score.melody.length]
        if (pitch) this.tone(layer.filter, layer.voices, frequency(pitch), layer.nextNoteAt, .58, score.tone === 'square' ? .025 : .05, score.tone)
        if (layer.step % 4 === 0) {
          const bass = score.bass[Math.floor(layer.step / 4) % score.bass.length]
          this.tone(layer.filter, layer.voices, frequency(bass), layer.nextNoteAt, 1.6, .035, 'sine')
        }
        layer.step += 1
        layer.nextNoteAt += score.interval
      }
      this.scheduler = window.setTimeout(this.schedule, 140)
    } catch {
      this.recover()
    }
  }

  private tone(destination: AudioNode, voices: Set<Voice>, pitch: number, at: number, duration: number, volume: number, type: OscillatorType, endPitch?: number) {
    if (voices.size >= 12) return
    const envelope = this.context.createGain()
    let oscillator: OscillatorNode
    try { oscillator = this.context.createOscillator() } catch (error) {
      envelope.disconnect()
      throw error
    }
    // Own both nodes before configuration/start, so failure recovery can stop them.
    const voice = { oscillator, envelope }
    voices.add(voice)
    oscillator.type = type
    oscillator.frequency.setValueAtTime(pitch, at)
    if (endPitch) oscillator.frequency.exponentialRampToValueAtTime(endPitch, at + duration * .85)
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(volume, at + .015)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    envelope.gain.setValueAtTime(0, at + duration + .01)
    oscillator.connect(envelope)
    envelope.connect(destination)
    oscillator.onended = () => this.releaseVoice(voice, voices)
    oscillator.start(at)
    oscillator.stop(at + duration + .025)
  }

  jump() {
    const now = this.context.currentTime
    if (!this.isRunning || this.blocked || now - this.lastJump < .18) return
    this.lastJump = now
    try {
      this.tone(this.master, this.effects, 280, now, .22, .11, 'triangle', 850)
    } catch { this.recover() }
  }

  warp() {
    const now = this.context.currentTime
    if (!this.isRunning || this.blocked || now - this.lastWarp < .8) return
    this.lastWarp = now
    try {
      this.tone(this.master, this.effects, 110, now, .7, .075, 'sine', 1250)
      this.tone(this.master, this.effects, 165, now + .04, .62, .045, 'triangle', 1800)
      this.tone(this.master, this.effects, 1046.5, now + .45, .55, .055, 'sine')
    } catch { this.recover() }
  }

  private releaseVoice(voice: Voice, voices: Set<Voice>) {
    if (!voices.delete(voice)) return
    voice.oscillator.onended = null
    try { voice.oscillator.stop() } catch { /* An already-ended note needs only disconnection. */ }
    voice.oscillator.disconnect()
    voice.envelope.disconnect()
  }

  private releaseLayer(layer: MusicLayer) {
    for (const voice of layer.voices) this.releaseVoice(voice, layer.voices)
    layer.filter.disconnect()
    layer.gain.disconnect()
  }

  pause() {
    this.operation += 1
    this.intended = false
    this.playing = false
    this.cancelResume?.()
    window.clearTimeout(this.scheduler)
    window.clearTimeout(this.fadeTimer)
    this.scheduler = undefined
    this.fadeTimer = undefined
    if (this.layer) this.releaseLayer(this.layer)
    if (this.retiringLayer) this.releaseLayer(this.retiringLayer)
    this.layer = null
    this.retiringLayer = null
    for (const voice of this.effects) this.releaseVoice(voice, this.effects)
    this.master.gain.cancelScheduledValues(this.context.currentTime)
    this.master.gain.setValueAtTime(0, this.context.currentTime)
    if (this.context.state !== 'closed') void this.context.suspend().catch(() => {})
  }

  dispose() {
    if (this.disposed) return
    this.pause()
    this.disposed = true
    this.context.removeEventListener('statechange', this.onStateChange)
    this.music.disconnect()
    this.master.disconnect()
    if (this.context.state !== 'closed') void this.context.close().catch(() => {})
  }
}
