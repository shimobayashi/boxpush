/**
 * Canvas への描画。盤面と演出だけを描く。
 * 面番号・手数・ボタンは HTML なのでここでは扱わない。
 */

import type { Game } from '../core/game.ts'
import { isGoal, isWall, toXY } from '../core/level.ts'
import type { Effects } from './effects.ts'

const COLORS = {
  wall: '#27314d',
  wallEdge: '#3b4870',
  floor: '#080c16',
} as const

/** 箱や人が滑らかに動いて見えるよう、前の位置から今の位置へ補間する */
export type Motion = {
  /** 0 から 1。1 で今の位置に着く */
  progress: number
  /** 位置ごとの、直前の位置。補間の起点 */
  from: Map<number, number>
  playerFrom: number
}

export type RenderState = {
  game: Game
  motion: Motion | null
  /** 穴に入ったばかりの箱。光らせる */
  justFit: Set<number>
  /** クリア演出の進み具合。0 なら演出していない */
  clearProgress: number
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private width = 0
  private height = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas を使えない')
    this.ctx = ctx
  }

  /**
   * 画面の大きさに合わせる。
   * 端末の画素密度に合わせて実際の画素数を増やさないと、線がぼやける。
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * ratio)
    this.canvas.height = Math.round(rect.height * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  /** マスの一辺。盤面が画面に収まる一番大きい値を選ぶ */
  cellSize(columns: number, rows: number): number {
    if (this.width === 0 || this.height === 0) return 0
    return Math.floor(Math.min(this.width / columns, this.height / rows))
  }

  draw(state: RenderState, effects: Effects): void {
    const { game } = state
    const level = game.level
    const ctx = this.ctx

    ctx.clearRect(0, 0, this.width, this.height)

    const cell = this.cellSize(level.width, level.height)
    if (cell === 0) return
    const boardWidth = cell * level.width
    const boardHeight = cell * level.height
    const originX = (this.width - boardWidth) / 2
    const originY = (this.height - boardHeight) / 2

    ctx.save()
    const shake = effects.shakeAmount
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
    }
    ctx.translate(originX, originY)

    // クリアの瞬間は盤面全体を少し膨らませる
    if (state.clearProgress > 0) {
      const pop = 1 + Math.sin(Math.min(1, state.clearProgress * 3) * Math.PI) * 0.06
      ctx.translate(boardWidth / 2, boardHeight / 2)
      ctx.scale(pop, pop)
      ctx.translate(-boardWidth / 2, -boardHeight / 2)
    }

    this.drawFloorAndWalls(level, cell)
    this.drawGoals(level, cell)
    this.drawBoxes(state, cell)
    this.drawPlayer(state, cell)

    ctx.restore()

    // 粒は盤面の外にも飛ぶので、揺れも盤面のずらしも掛けずに描く
    effects.draw(ctx)
  }

  /** 盤面の左上を原点にした座標を、画面の座標に直す */
  boardOrigin(columns: number, rows: number): { x: number; y: number; cell: number } {
    const cell = this.cellSize(columns, rows)
    return {
      cell,
      x: (this.width - cell * columns) / 2,
      y: (this.height - cell * rows) / 2,
    }
  }

  private drawFloorAndWalls(level: RenderState['game']['level'], cell: number): void {
    const ctx = this.ctx
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const pos = y * level.width + x
        const px = x * cell
        const py = y * cell
        if (isWall(level, pos)) {
          ctx.fillStyle = COLORS.wall
          ctx.fillRect(px, py, cell, cell)
          // 上端だけ明るくして、平らな面が立体に見えるようにする
          ctx.fillStyle = COLORS.wallEdge
          ctx.fillRect(px, py, cell, Math.max(1, cell * 0.06))
        } else {
          ctx.fillStyle = COLORS.floor
          ctx.fillRect(px, py, cell, cell)
        }
      }
    }
  }

  private drawGoals(level: RenderState['game']['level'], cell: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.75)'
    ctx.lineWidth = Math.max(2, cell * 0.06)
    ctx.shadowColor = 'rgba(255, 209, 102, 0.5)'
    ctx.shadowBlur = cell * 0.25
    for (let pos = 0; pos < level.width * level.height; pos++) {
      if (!isGoal(level, pos)) continue
      const { x, y } = toXY(level, pos)
      ctx.beginPath()
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.24, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawBoxes(state: RenderState, cell: number): void {
    const ctx = this.ctx
    const level = state.game.level
    for (const box of state.game.boxes) {
      const { x, y } = this.interpolate(box, state, level.width)
      const onGoal = isGoal(level, box)
      const fresh = state.justFit.has(box)

      const pad = cell * 0.11
      const px = x * cell + pad
      const py = y * cell + pad
      const size = cell - pad * 2

      ctx.save()
      if (fresh) {
        // はまった直後だけ強く光らせる
        ctx.shadowColor = '#ffd166'
        ctx.shadowBlur = cell * 0.7
      } else if (onGoal) {
        ctx.shadowColor = 'rgba(255, 209, 102, 0.8)'
        ctx.shadowBlur = cell * 0.35
      } else {
        ctx.shadowColor = 'rgba(77, 216, 255, 0.7)'
        ctx.shadowBlur = cell * 0.28
      }

      const gradient = ctx.createLinearGradient(px, py, px, py + size)
      if (onGoal) {
        gradient.addColorStop(0, '#ffe3a0')
        gradient.addColorStop(1, '#f0a93c')
      } else {
        gradient.addColorStop(0, '#8ee9ff')
        gradient.addColorStop(1, '#2a9fd6')
      }
      ctx.fillStyle = gradient
      roundedRect(ctx, px, py, size, size, cell * 0.16)
      ctx.fill()
      ctx.restore()
    }
  }

  private drawPlayer(state: RenderState, cell: number): void {
    const ctx = this.ctx
    const level = state.game.level
    const player = state.game.player
    let x: number
    let y: number
    if (state.motion) {
      const from = toXY(level, state.motion.playerFrom)
      const to = toXY(level, player)
      const t = state.motion.progress
      x = from.x + (to.x - from.x) * t
      y = from.y + (to.y - from.y) * t
    } else {
      const at = toXY(level, player)
      x = at.x
      y = at.y
    }

    const cx = x * cell + cell / 2
    const cy = y * cell + cell / 2

    ctx.save()
    ctx.shadowColor = 'rgba(255, 255, 255, 0.55)'
    ctx.shadowBlur = cell * 0.3
    ctx.fillStyle = '#f2f6ff'
    ctx.beginPath()
    ctx.arc(cx, cy, cell * 0.27, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** 箱の、補間した位置（マス単位） */
  private interpolate(box: number, state: RenderState, width: number): { x: number; y: number } {
    const to = { x: box % width, y: Math.floor(box / width) }
    const motion = state.motion
    if (!motion) return to
    const fromPos = motion.from.get(box)
    if (fromPos === undefined) return to
    const from = { x: fromPos % width, y: Math.floor(fromPos / width) }
    const t = motion.progress
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}
