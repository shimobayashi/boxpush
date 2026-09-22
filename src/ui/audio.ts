/**
 * 効果音。音源ファイルは持たず、その場で波を作って鳴らす。
 *
 * ブラウザの決まりで、画面を触るまで音は出せない。
 * 最初の操作で AudioContext を起こす（resume）。
 */

const STORAGE_KEY = 'boxpush:sound'

/** 箱が入るたびに音階を上げる。ペンタトニックなので外れて聞こえない */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

/** クリアのファンファーレ。ド→ミ→ソ→ド */
const FANFARE = [0, 4, 7, 12]

export class Sound {
  private context: AudioContext | null = null
  private enabled: boolean

  constructor() {
    this.enabled = readEnabled()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off')
    } catch {
      // プライベートモードなどで保存できなくても、その回だけ効けばよい
    }
    if (this.enabled) this.wake()
    return this.enabled
  }

  /** 最初の操作で呼ぶ。触る前に音を出そうとしても鳴らないため */
  wake(): void {
    if (!this.enabled) return
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.context = new Ctor()
    }
    if (this.context.state === 'suspended') void this.context.resume()
  }

  /** 壁や箱にぶつかった。短く鈍い音 */
  blocked(): void {
    this.tone({ semitone: -17, duration: 0.07, type: 'square', volume: 0.05 })
  }

  /** 箱を押した */
  push(): void {
    this.tone({ semitone: -5, duration: 0.06, type: 'triangle', volume: 0.07 })
  }

  /**
   * 箱が穴に入った。
   * 同じ面で入れた数だけ音階が上がるので、続けて入れるほど上がっていく。
   */
  fit(order: number): void {
    const semitone = SCALE[Math.min(order, SCALE.length - 1)] ?? 24
    this.tone({ semitone, duration: 0.22, type: 'triangle', volume: 0.16 })
    this.tone({ semitone: semitone + 12, duration: 0.14, type: 'sine', volume: 0.08, delay: 0.02 })
  }

  /** 箱が穴から出た。入ったときの逆で下げる */
  unfit(): void {
    this.tone({ semitone: -12, duration: 0.12, type: 'triangle', volume: 0.08 })
  }

  clear(): void {
    FANFARE.forEach((semitone, i) => {
      this.tone({ semitone, duration: 0.3, type: 'triangle', volume: 0.16, delay: i * 0.09 })
      this.tone({ semitone: semitone + 12, duration: 0.3, type: 'sine', volume: 0.07, delay: i * 0.09 })
    })
  }

  allClear(): void {
    ;[0, 4, 7, 12, 16, 19, 24].forEach((semitone, i) => {
      this.tone({ semitone, duration: 0.5, type: 'triangle', volume: 0.15, delay: i * 0.12 })
    })
  }

  private tone(options: {
    semitone: number
    duration: number
    type: OscillatorType
    volume: number
    delay?: number
  }): void {
    if (!this.enabled) return
    this.wake()
    const context = this.context
    if (!context || context.state !== 'running') return

    const start = context.currentTime + (options.delay ?? 0)
    // 440Hz の A を基準に、半音ぶんずつずらす
    const frequency = 440 * 2 ** (options.semitone / 12)

    const oscillator = context.createOscillator()
    oscillator.type = options.type
    oscillator.frequency.value = frequency

    const gain = context.createGain()
    // 立ち上がりを一瞬で、あとは減衰させる。矩形波をそのまま鳴らすとブツッと鳴るため
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(options.volume, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)

    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + options.duration + 0.02)
  }
}

/**
 * 振動。音と同じ入切に従う。
 * iOS Safari は Vibration API に対応していないので、実際に効くのは Android などに限られる。
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
 */
export function vibrate(sound: Sound, pattern: number | number[]): void {
  if (!sound.isEnabled) return
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // 対応していない端末では何も起きなくてよい
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}
