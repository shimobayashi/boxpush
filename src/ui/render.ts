/**
 * Canvas への描画。盤面と演出だけを描く。
 * 面番号・手数・ボタンは HTML なのでここでは扱わない。
 */

import type { Game } from '../core/game.ts'
import type { Level } from '../core/level.ts'
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
  /** いま押されている箱。潰れて戻る動きを付ける */
  pushedBox: number | null
}

export type RenderState = {
  game: Game
  motion: Motion | null
  /** 穴に入ったばかりの箱。光らせる */
  justFit: Set<number>
  /** クリア演出の進み具合（秒）。0 なら演出していない */
  clearProgress: number
  /** 残りの箱があと 1 つか。盤面を張り詰めた見た目にする */
  lastOne: boolean
  /** 人が通ってきた跡。新しいものほど後ろ */
  trail: readonly { pos: number; age: number }[]
  /** 何面続けてクリアしているか。背景の濃さに使う */
  streak: number
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private width = 0
  private height = 0
  /** 背景の脈動や穴の明滅に使う、起動からの経過秒 */
  private clock = 0

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

  draw(state: RenderState, effects: Effects, dt: number): void {
    this.clock += dt
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

    this.drawBackground(state, cell)

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

    this.drawFloorAndWalls(level, cell, state.clearProgress)
    this.drawGoals(state, cell)
    this.drawTrail(state, cell)
    this.drawBoxes(state, cell)
    this.drawPlayer(state, cell)
    this.drawGoalUnderPlayer(state, cell)

    ctx.restore()

    // 粒は盤面の外にも飛ぶので、揺れも盤面のずらしも掛けずに描く
    effects.draw(ctx)
    effects.drawFlash(ctx, this.width, this.height)
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

  /**
   * 盤面の外側。連続でクリアしているほど色が濃くなり、格子がゆっくり脈打つ。
   * 画面の半分以上が余白なので、ここが暗いままだと盤面だけが浮いて見える。
   */
  private drawBackground(state: RenderState, cell: number): void {
    const ctx = this.ctx
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 1.4)
    // 5 面続けて抜けると濃さが頭打ちになる
    const heat = Math.min(1, state.streak / 5)

    if (heat > 0) {
      const glow = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        0,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.75,
      )
      glow.addColorStop(0, `rgba(40, 120, 190, ${0.1 * heat + 0.03 * heat * pulse})`)
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, this.width, this.height)
    }

    if (state.lastOne) {
      // 残り 1 つのあいだは赤みを差して、張り詰めた感じにする
      const glow = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        Math.min(this.width, this.height) * 0.3,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.8,
      )
      glow.addColorStop(0, 'rgba(0, 0, 0, 0)')
      glow.addColorStop(1, `rgba(190, 70, 60, ${0.12 + 0.08 * pulse})`)
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, this.width, this.height)
    }

    ctx.save()
    ctx.strokeStyle = `rgba(120, 160, 220, ${0.035 + 0.025 * pulse + 0.03 * heat})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = (this.width / 2) % cell; x < this.width; x += cell) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, this.height)
    }
    for (let y = (this.height / 2) % cell; y < this.height; y += cell) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(this.width, Math.round(y) + 0.5)
    }
    ctx.stroke()
    ctx.restore()
  }

  /**
   * 床と壁。
   * クリアの瞬間だけ、中心から外へ波が走るようにマスを光らせる。
   */
  private drawFloorAndWalls(level: Level, cell: number, clearProgress: number): void {
    const ctx = this.ctx
    const centerX = (level.width - 1) / 2
    const centerY = (level.height - 1) / 2
    // 波が盤面の端に届くまでの速さ。1.5 秒の演出のうち前半で走り切る
    const waveFront = clearProgress * 9

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

        if (clearProgress > 0) {
          const distance = Math.hypot(x - centerX, y - centerY)
          const edge = waveFront - distance
          // 波の先端から少し後ろまでが光る
          if (edge > 0 && edge < 1.6) {
            ctx.save()
            ctx.globalAlpha = Math.sin((edge / 1.6) * Math.PI) * 0.7
            ctx.fillStyle = '#ffd166'
            ctx.fillRect(px, py, cell, cell)
            ctx.restore()
          }
        }
      }
    }
  }

  private drawGoals(state: RenderState, cell: number): void {
    const level = state.game.level
    const ctx = this.ctx
    // 残り 1 つのときだけ、空いている穴を脈打たせて目を引く
    const pulse = state.lastOne ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0

    ctx.save()
    for (let pos = 0; pos < level.width * level.height; pos++) {
      if (!isGoal(level, pos)) continue
      const filled = state.game.hasBox(pos)
      const { x, y } = toXY(level, pos)
      const radius = cell * (0.24 + (filled ? 0 : pulse * 0.05))

      ctx.strokeStyle = filled
        ? 'rgba(255, 209, 102, 0.35)'
        : `rgba(255, 209, 102, ${0.75 + pulse * 0.25})`
      ctx.lineWidth = Math.max(2, cell * (0.06 + (filled ? 0 : pulse * 0.02)))
      ctx.shadowColor = 'rgba(255, 209, 102, 0.5)'
      ctx.shadowBlur = cell * (0.25 + pulse * 0.35)
      ctx.beginPath()
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** 人が通ってきた跡。どう動いたかが目で追えるようにする */
  private drawTrail(state: RenderState, cell: number): void {
    if (state.trail.length === 0) return
    const level = state.game.level
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(127, 212, 255, 0.8)'
    for (const mark of state.trail) {
      const { x, y } = toXY(level, mark.pos)
      const fade = 1 - mark.age
      ctx.globalAlpha = Math.max(0, 0.55 * fade)
      ctx.shadowBlur = cell * 0.25 * fade
      ctx.fillStyle = '#7fd4ff'
      ctx.beginPath()
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.2 * fade, 0, Math.PI * 2)
      ctx.fill()
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
      const size = cell - pad * 2
      const centerX = x * cell + cell / 2
      const centerY = y * cell + cell / 2

      // 押されている間だけ、進む向きに潰れて戻る
      let scaleX = 1
      let scaleY = 1
      if (state.motion && state.motion.pushedBox === box) {
        const t = state.motion.progress
        const squash = Math.sin(t * Math.PI) * 0.18
        const from = state.motion.from.get(box)
        if (from !== undefined) {
          const horizontal = Math.abs(box - from) === 1
          scaleX = horizontal ? 1 - squash : 1 + squash * 0.6
          scaleY = horizontal ? 1 + squash * 0.6 : 1 - squash
        }
      }

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

      ctx.translate(centerX, centerY)
      ctx.scale(scaleX, scaleY)

      const gradient = ctx.createLinearGradient(0, -size / 2, 0, size / 2)
      if (onGoal) {
        gradient.addColorStop(0, '#ffe3a0')
        gradient.addColorStop(1, '#f0a93c')
      } else {
        gradient.addColorStop(0, '#8ee9ff')
        gradient.addColorStop(1, '#2a9fd6')
      }
      ctx.fillStyle = gradient
      roundedRect(ctx, -size / 2, -size / 2, size, size, cell * 0.16)
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

    // 動いている間は進む向きに伸ばす。止まっているときは丸いまま
    let stretchX = 1
    let stretchY = 1
    let angle = 0
    if (state.motion) {
      const t = state.motion.progress
      const amount = Math.sin(t * Math.PI) * 0.3
      const from = toXY(level, state.motion.playerFrom)
      const to = toXY(level, player)
      angle = Math.atan2(to.y - from.y, to.x - from.x)
      stretchX = 1 + amount
      stretchY = 1 - amount * 0.5
    }

    ctx.save()
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)'
    ctx.shadowBlur = cell * 0.4
    ctx.fillStyle = '#f2f6ff'
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.scale(stretchX, stretchY)
    ctx.beginPath()
    ctx.arc(0, 0, cell * 0.27, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /**
   * 人が立っている穴の輪を、人の上から描き直す。
   * 人の方が穴より大きいので、そのままだと穴が 1 つ消えたように見える。
   */
  private drawGoalUnderPlayer(state: RenderState, cell: number): void {
    const level = state.game.level
    const pos = state.game.player
    if (!isGoal(level, pos)) return

    const { x, y } = toXY(level, pos)
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)'
    ctx.lineWidth = Math.max(2, cell * 0.05)
    ctx.beginPath()
    ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.33, 0, Math.PI * 2)
    ctx.stroke()
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
