/**
 * 入力。盤面は指でなぞって動かす。
 *
 * 1 マス分の距離を動かすごとに 1 歩進み、指を離さずに向きを変えれば続けて進める。
 * スワイプ 1 回で 1 マスにすると長い移動で何十回も指を離すことになるため。
 *
 * ここは歩を溜めるだけで、盤面は動かさない。
 * 溜めた歩は呼ぶ側が take() で 1 歩ずつ取り出し、1 歩ごとに結果を見てから次を取る。
 * まとめて動かすと、箱が穴に入ったことに気づく前に穴の先まで押してしまう。
 */

import type { Direction } from '../core/game.ts'

/**
 * 1 歩ぶんと見なす距離を、マスの一辺の何割にするか。
 *
 * 1 なら指と人が同じだけ動く。これより小さくすると人の方が速く進むので、
 * 速くなぞったときに指より先へ行って、狙った穴を通り越して押してしまう。
 */
const STEP_RATIO = 1

/** これより小さい動きは、指の震えとして捨てる */
const NOISE = 3

/**
 * 溜めておく歩の上限。あふれたぶんは捨てる。
 * 指を速く払ったぶんも取りこぼさずに歩きたいが、溜めすぎると
 * 指を止めたあとも人が歩き続けることになり、どこで止まるか読めなくなる。
 */
const QUEUE_LIMIT = 3

/** 1 回の pointermove で読み取る歩の上限。指が飛んだときに回り続けないための歯止め */
const READ_LIMIT = 16

export type InputHandlers = {
  /** 指が触れた、キーが押された。音を起こすのに使う */
  onTouch: () => void
}

export class Input {
  private element: HTMLElement
  private handlers: InputHandlers
  private cellSize = 40
  private pointerId: number | null = null
  /** 前に 1 歩ぶん読み取った地点。ここからの距離で次の 1 歩を決める */
  private anchorX = 0
  private anchorY = 0
  /** まだ盤面に渡していない歩 */
  private queue: Direction[] = []
  /** キーは押し直すまで受け付けない */
  private keyHalted = false
  /** 入力を受け付けるか */
  private accepting = true

  constructor(element: HTMLElement, handlers: InputHandlers) {
    this.element = element
    this.handlers = handlers

    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
  }

  /** 盤面のマスの大きさが変わったら教える。1 歩ぶんの距離がこれで決まる */
  setCellSize(cell: number): void {
    if (cell > 0) this.cellSize = cell
  }

  /** 溜まっている次の 1 歩。無ければ null */
  take(): Direction | null {
    return this.queue.shift() ?? null
  }

  /**
   * 入力を受け付けるかどうかを切り替える。
   * 受け付けないあいだは何も溜めず、戻したあとも置き直すか押し直すまで動かない。
   *
   * 「そのあいだずっと受け付けない」を、溜まりを毎フレーム捨てることで表すと、
   * 止めたい場面が増えるたびに捨てる呼び出しを 1 つずつ足すことになる。
   */
  setAccepting(accepting: boolean): void {
    if (this.accepting === accepting) return
    this.accepting = accepting
    if (!accepting) this.release()
  }

  /**
   * 溜まった歩を捨て、キーは押し直すまで受けない。指はそのままにする。
   * 壁に当たって進めなかったときに呼ぶ。
   *
   * 指を切らないのは、壁に当ててから向きを変えるのを、なぞったまま続けたいため。
   */
  discard(): void {
    this.queue.length = 0
    this.keyHalted = true
  }

  /**
   * 溜まった歩を捨てたうえで、いま触れている指もなかったことにする。
   * 箱が穴に入ったときと、面が切り替わったときに呼ぶ。
   *
   * 切らないと、勢い余って入ったばかりの箱を穴の先へ押し出して詰ませてしまう。
   * 面が切り替わるときも、指を置いたままだと前の面の続きの動きが次の面に流れ込む。
   */
  release(): void {
    this.discard()
    this.pointerId = null
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.accepting || this.pointerId !== null) return
    this.pointerId = event.pointerId
    this.anchorX = event.clientX
    this.anchorY = event.clientY
    this.element.setPointerCapture(event.pointerId)
    this.handlers.onTouch()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return

    const threshold = Math.max(12, this.cellSize * STEP_RATIO)
    // 指を離さずに何マスでも進めるよう、1 歩ぶん読み取るたびに起点をずらして繰り返す
    for (let read = 0; read < READ_LIMIT; read++) {
      const dx = event.clientX - this.anchorX
      const dy = event.clientY - this.anchorY
      if (Math.abs(dx) < NOISE && Math.abs(dy) < NOISE) return

      // 縦横のうち、より大きく動いた方だけを見る。斜めの誤りを避けるため
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (Math.abs(dx) < threshold) return
        this.anchorX += dx > 0 ? threshold : -threshold
        this.anchorY = event.clientY
        this.pushStep(dx > 0 ? 'right' : 'left')
      } else {
        if (Math.abs(dy) < threshold) return
        this.anchorY += dy > 0 ? threshold : -threshold
        this.anchorX = event.clientX
        this.pushStep(dy > 0 ? 'down' : 'up')
      }
    }
  }

  /**
   * 起点はいつも指に合わせて進め、溜めるのは上限までにする。
   * 溜め切れないぶんを持ち越すと、指を止めたあとに歩き続けることになる。
   */
  private pushStep(direction: Direction): void {
    if (this.queue.length < QUEUE_LIMIT) this.queue.push(direction)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return
    this.pointerId = null
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const direction = KEYS[event.key.toLowerCase()]
    if (!direction) return
    event.preventDefault()
    if (!this.accepting) return

    if (event.repeat) {
      if (this.keyHalted) return
    } else {
      this.keyHalted = false
    }

    // 押しっぱなしの繰り返しは OS が決めた間隔で届き、1 歩を描く速さより速い。
    // 溜めずに 1 歩ずつ渡すことで、取り出す側の速さに合わせる
    if (this.queue.length === 0) this.queue.push(direction)
    this.handlers.onTouch()
  }
}

const KEYS: Record<string, Direction | undefined> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}
