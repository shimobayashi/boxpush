/**
 * 入力。盤面は指でなぞって動かす。
 *
 * 1 マス分の距離を動かすごとに 1 歩進み、指を離さずに向きを変えれば続けて進める。
 * スワイプ 1 回で 1 マスにすると長い移動で何十回も指を離すことになるため。
 */

import type { Direction } from '../core/game.ts'

/** 1 歩ぶんと見なす距離を、マスの一辺の何割にするか */
const STEP_RATIO = 0.55

/** これより小さい動きは、指の震えとして捨てる */
const NOISE = 3

export type InputHandlers = {
  onStep: (direction: Direction) => void
  /** 指が触れた。音を起こすのに使う */
  onTouch: () => void
}

export class Input {
  private element: HTMLElement
  private handlers: InputHandlers
  private cellSize = 40
  private pointerId: number | null = null
  /** 前に 1 歩進んだ地点。ここからの距離で次の 1 歩を決める */
  private anchorX = 0
  private anchorY = 0

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

  /**
   * いま触れている指を、なかったことにする。
   * 面が切り替わったときに呼ぶ。指を置いたままだと、前の面の続きの動きが次の面に流れ込む。
   */
  release(): void {
    this.pointerId = null
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return
    this.pointerId = event.pointerId
    this.anchorX = event.clientX
    this.anchorY = event.clientY
    this.element.setPointerCapture(event.pointerId)
    this.handlers.onTouch()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return

    const threshold = Math.max(12, this.cellSize * STEP_RATIO)
    // 指を離さずに何マスでも進めるよう、1 歩ぶん動くたびに起点をずらして繰り返す
    for (let guard = 0; guard < 16; guard++) {
      const dx = event.clientX - this.anchorX
      const dy = event.clientY - this.anchorY
      if (Math.abs(dx) < NOISE && Math.abs(dy) < NOISE) return

      // 縦横のうち、より大きく動いた方だけを見る。斜めの誤りを避けるため
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (Math.abs(dx) < threshold) return
        const direction: Direction = dx > 0 ? 'right' : 'left'
        this.anchorX += dx > 0 ? threshold : -threshold
        this.anchorY = event.clientY
        this.handlers.onStep(direction)
      } else {
        if (Math.abs(dy) < threshold) return
        const direction: Direction = dy > 0 ? 'down' : 'up'
        this.anchorY += dy > 0 ? threshold : -threshold
        this.anchorX = event.clientX
        this.handlers.onStep(direction)
      }
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return
    this.pointerId = null
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const direction = KEYS[event.key.toLowerCase()]
    if (!direction) return
    event.preventDefault()
    this.handlers.onTouch()
    this.handlers.onStep(direction)
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
