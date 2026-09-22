/**
 * 光の粒と紙吹雪。
 * 箱が穴に入った瞬間と面をクリアした瞬間の 2 か所だけに使う。
 */

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  /** 残り時間（秒） */
  life: number
  /** 生まれたときの寿命。薄れ方を決めるのに使う */
  born: number
  size: number
  color: string
  /** 紙吹雪は回りながら落ちる */
  spin: number
  angle: number
  gravity: number
}

const FIT_COLORS = ['#ffd166', '#ffe9a8', '#ffffff', '#4dd8ff']
const CLEAR_COLORS = ['#ffd166', '#4dd8ff', '#ff6b9d', '#9dff6b', '#ffffff']

export class Effects {
  private particles: Particle[] = []
  /** 画面をゆする強さ。0 なら揺れない */
  private shake = 0

  get shakeAmount(): number {
    return this.shake
  }

  /** 箱が穴にはまった。中心から光の粒が散る */
  burst(x: number, y: number, cell: number): void {
    const count = 18
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3
      const speed = cell * (1.2 + Math.random() * 1.8)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.25,
        born: 0.7,
        size: cell * (0.05 + Math.random() * 0.07),
        color: FIT_COLORS[i % FIT_COLORS.length]!,
        spin: 0,
        angle: 0,
        gravity: 0,
      })
    }
    this.shake = Math.max(this.shake, cell * 0.12)
  }

  /** 面クリア。上から紙吹雪が降る */
  confetti(width: number, height: number, cell: number): void {
    for (let i = 0; i < 110; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: -Math.random() * height * 0.3,
        vx: (Math.random() - 0.5) * cell * 2,
        vy: cell * (1.5 + Math.random() * 2.5),
        life: 1.4 + Math.random() * 0.8,
        born: 2.2,
        size: cell * (0.09 + Math.random() * 0.09),
        color: CLEAR_COLORS[i % CLEAR_COLORS.length]!,
        spin: (Math.random() - 0.5) * 12,
        angle: Math.random() * Math.PI,
        gravity: cell * 2.2,
      })
    }
    this.shake = Math.max(this.shake, cell * 0.22)
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
      // 空気抵抗。粒がすぐ止まって散らばったままにならないよう、ゆるく減速させる
      p.vx *= 1 - 2.5 * dt
      p.vy *= 1 - 0.8 * dt
      p.angle += p.spin * dt
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    this.shake = Math.max(0, this.shake - this.shake * 9 * dt - 0.4 * dt)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.born)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.translate(p.x, p.y)
      if (p.spin === 0) {
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.rotate(p.angle)
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2)
      }
      ctx.restore()
    }
  }

  get busy(): boolean {
    return this.particles.length > 0
  }

  clear(): void {
    this.particles = []
    this.shake = 0
  }
}
