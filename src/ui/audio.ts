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

  /** ただ歩いた。ほとんど聞こえないくらいの足音 */
  step(): void {
    this.tone({ semitone: -22, duration: 0.035, type: 'sine', volume: 0.035 })
  }

  /** 箱を押した。低い方と高い方を重ねて、ずしりとした感じを出す */
  push(): void {
    this.tone({ semitone: -17, duration: 0.09, type: 'square', volume: 0.05 })
    this.tone({ semitone: -5, duration: 0.06, type: 'triangle', volume: 0.06 })
  }

  /**
   * あと 1 手で入る箱ができた。気持ちを引っぱるための合図。
   *
   * 押した音と重なると細い音は埋もれるので、少し遅らせてから駆け上がらせる。
   */
  reach(): void {
    const start = 0.12
    ;[12, 19, 24].forEach((semitone, i) => {
      this.tone({
        semitone,
        duration: 0.16,
        type: 'triangle',
        volume: 0.14,
        delay: start + i * 0.07,
      })
      this.tone({
        semitone: semitone + 12,
        duration: 0.16,
        type: 'sine',
        volume: 0.06,
        delay: start + i * 0.07,
      })
    })
  }

  /**
   * 箱が穴へ吸い込まれている間の音。
   * 半音ずつ駆け上がって、爆発の直前で一番高くなる。
   */
  suck(): void {
    const steps = 9
    for (let i = 0; i < steps; i++) {
      this.tone({
        semitone: -14 + i * 2,
        duration: 0.12,
        type: 'sine',
        volume: 0.04 + i * 0.008,
        delay: i * 0.055,
      })
    }
    // 下から押し上げる低音を重ねて、来るぞという感じを出す
    this.tone({ semitone: -26, duration: 0.55, type: 'triangle', volume: 0.07 })
  }

  /** 残りの箱があと 1 つになった。気づかせるための合図 */
  lastOne(): void {
    this.tone({ semitone: -12, duration: 0.5, type: 'sine', volume: 0.07 })
    this.tone({ semitone: -5, duration: 0.5, type: 'sine', volume: 0.05, delay: 0.06 })
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

  /**
   * 最後の 1 つが穴に入った。
   * 音階を上げるのをやめて、和音を一度に鳴らして解き放つ。
   */
  finalFit(): void {
    for (const semitone of [0, 4, 7, 12, 19]) {
      this.tone({ semitone, duration: 0.6, type: 'triangle', volume: 0.13 })
    }
    this.tone({ semitone: -24, duration: 0.7, type: 'sine', volume: 0.14 })
  }

  /** 箱が穴から出た。入ったときの逆で下げる */
  unfit(): void {
    this.tone({ semitone: -12, duration: 0.12, type: 'triangle', volume: 0.08 })
  }

  clear(): void {
    FANFARE.forEach((semitone, i) => {
      this.tone({ semitone, duration: 0.45, type: 'triangle', volume: 0.15, delay: i * 0.08 })
      this.tone({ semitone: semitone + 7, duration: 0.45, type: 'triangle', volume: 0.09, delay: i * 0.08 })
      this.tone({ semitone: semitone + 12, duration: 0.45, type: 'sine', volume: 0.07, delay: i * 0.08 })
    })
    // 最後に和音を伸ばして余韻を残す
    for (const semitone of [12, 16, 19, 24]) {
      this.tone({ semitone, duration: 1.1, type: 'triangle', volume: 0.1, delay: 0.34 })
    }
    this.tone({ semitone: -12, duration: 1.2, type: 'sine', volume: 0.12, delay: 0.34 })
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
