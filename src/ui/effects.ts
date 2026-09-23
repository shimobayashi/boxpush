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
  /** 進む向きに細長く伸ばして描く。飛び散る光の線に使う */
  streak?: boolean
  /** 紙が空気を受けて左右に揺れる位相。真下に落ちるだけだと単調なため */
  wobble?: number
}

const FIT_COLORS = ['#ffd166', '#ffe9a8', '#ffffff', '#4dd8ff']
const CLEAR_COLORS = ['#ffd166', '#4dd8ff', '#ff6b9d', '#9dff6b', '#ffffff']

/** 盤面の外へ広がっていく輪 */
type Ripple = {
  x: number
  y: number
  radius: number
  speed: number
  life: number
  born: number
  color: string
  width: number
}

export class Effects {
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  /** 画面をゆする強さ。0 なら揺れない */
  private shake = 0
  /** 画面全体を飛ばす強さ。0 なら何もしない */
  private flash = 0
  private flashTone: 'white' | 'gold' = 'white'
  /** 紙の揺れを進めるための時計 */
  private clock = 0

  get shakeAmount(): number {
    return this.shake
  }

  get flashAmount(): number {
    return this.flash
  }

  /**
   * 箱が穴にはまった。中心から光の粒が散り、輪が盤面の外へ広がる。
   * strength は 1 が普通、最後の 1 つを入れたときは大きくする。
   */
  burst(x: number, y: number, cell: number, strength = 1): void {
    const count = Math.round(18 * strength)
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3
      const speed = cell * (1.2 + Math.random() * 1.8) * (0.8 + strength * 0.4)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: (0.45 + Math.random() * 0.25) * (0.8 + strength * 0.3),
        born: 0.7,
        size: cell * (0.05 + Math.random() * 0.07) * (0.8 + strength * 0.3),
        color: FIT_COLORS[i % FIT_COLORS.length]!,
        spin: 0,
        angle: 0,
        gravity: 0,
      })
    }
    // 放射状に伸びる光の線。粒だけより勢いが出る
    const spokes = Math.round(6 * strength)
    for (let i = 0; i < spokes; i++) {
      const angle = (Math.PI * 2 * i) / spokes + Math.random() * 0.4
      const speed = cell * (4 + Math.random() * 3) * (0.7 + strength * 0.5)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.22 + Math.random() * 0.12,
        born: 0.34,
        size: cell * 0.045 * (0.8 + strength * 0.2),
        color: '#fff3d0',
        spin: 0,
        angle: 0,
        gravity: 0,
        streak: true,
      })
    }

    this.ripples.push({
      x,
      y,
      radius: cell * 0.3,
      speed: cell * (5 + strength * 3),
      life: 0.55 + strength * 0.25,
      born: 0.55 + strength * 0.25,
      color: '255, 209, 102',
      width: Math.max(2, cell * 0.06 * strength),
    })
    this.shake = Math.max(this.shake, cell * 0.12 * strength)
  }

  /** 箱を押したときに、箱の後ろから散る細かい粒 */
  scrape(x: number, y: number, cell: number, dx: number, dy: number): void {
    for (let i = 0; i < 5; i++) {
      // 押した向きと逆に、少しばらけて飛ばす
      const spread = (Math.random() - 0.5) * 1.4
      const angle = Math.atan2(-dy, -dx) + spread
      const speed = cell * (0.8 + Math.random() * 1.6)
      this.particles.push({
        x: x - dx * cell * 0.3,
        y: y - dy * cell * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.16 + Math.random() * 0.12,
        born: 0.28,
        size: cell * (0.025 + Math.random() * 0.025),
        color: '#7fd4ff',
        spin: 0,
        angle: 0,
        gravity: 0,
      })
    }
  }

  /**
   * 穴へ吸い寄せられていく粒。
   * 外から中心へ向かって飛ばすことで、何かが溜まっていく感じを出す。
   */
  gather(x: number, y: number, cell: number): void {
    const angle = Math.random() * Math.PI * 2
    const distance = cell * (1.4 + Math.random() * 1.2)
    const speed = distance / 0.26
    this.particles.push({
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      // 中心へ向かう向き。寿命が尽きるころに着く
      vx: -Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      life: 0.26,
      born: 0.26,
      size: cell * (0.03 + Math.random() * 0.035),
      color: '#ffe9a8',
      spin: 0,
      angle: 0,
      gravity: 0,
      streak: true,
    })
  }

  /** 画面いっぱいに広がる衝撃波。箱が決まった瞬間に出す */
  shockwave(x: number, y: number, cell: number, strength: number): void {
    this.ripples.push({
      x,
      y,
      radius: cell * 0.2,
      speed: cell * (14 + strength * 6),
      life: 0.45 + strength * 0.1,
      born: 0.45 + strength * 0.1,
      color: '255, 255, 255',
      width: Math.max(3, cell * 0.1 * strength),
    })
  }

  /** 人が歩いた足元から、小さな輪を広げる */
  footprint(x: number, y: number, cell: number): void {
    this.ripples.push({
      x,
      y,
      radius: cell * 0.16,
      speed: cell * 2.4,
      life: 0.3,
      born: 0.3,
      color: '127, 212, 255',
      width: Math.max(1, cell * 0.02),
    })
  }

  /** 揺らすだけ。壁にぶつかったときなど */
  bump(amount: number): void {
    this.shake = Math.max(this.shake, amount)
  }

  /**
   * 画面全体を飛ばす。
   * 箱が入るたびの軽い金色と、最後の 1 つが決まったときの白を使い分ける。
   */
  whiteOut(strength = 1, tone: 'white' | 'gold' = 'white'): void {
    if (strength > this.flash) {
      this.flash = strength
      this.flashTone = tone
    }
  }

  /**
   * 面クリア。下の両隅から打ち上げて、そのあと上からも降らせる。
   * 上から降らせるだけだと一方向で単調に見えるため。
   *
   * life は、この紙が消えるまでのおおよその秒数。
   * 呼ぶ側が「次の面に入ってから少しだけ残る」長さを渡す。
   */
  confetti(width: number, height: number, cell: number, life: number): void {
    // 左右の下隅から斜め上へ打ち上げる
    for (const side of [0, 1]) {
      const originX = side === 0 ? 0 : width
      const aim = side === 0 ? 1 : -1
      for (let i = 0; i < 70; i++) {
        // 斜め上へ扇状に散らす
        const spread = Math.random() * 0.9 + 0.15
        const speed = cell * (9 + Math.random() * 7)
        this.particles.push({
          x: originX,
          y: height,
          vx: Math.cos(spread) * speed * aim,
          vy: -Math.sin(spread) * speed - cell * 4,
          life: life + Math.random() * 0.45,
          born: life + 0.45,
          size: cell * (0.1 + Math.random() * 0.11),
          color: CLEAR_COLORS[i % CLEAR_COLORS.length]!,
          spin: (Math.random() - 0.5) * 16,
          angle: Math.random() * Math.PI,
          gravity: cell * 7,
          wobble: Math.random() * Math.PI * 2,
        })
      }
    }
    this.rain(width, height, cell, 90, life)
    this.shake = Math.max(this.shake, cell * 0.3)
  }

  /**
   * 上から紙が舞い落ちる。クリア演出の間、何度かに分けて呼ぶ。
   * life は消えるまでのおおよその秒数。
   */
  rain(width: number, height: number, cell: number, count: number, life: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: -Math.random() * height * 0.25,
        vx: (Math.random() - 0.5) * cell * 2,
        // 落ちる速さに幅を持たせて、速いものとゆっくり舞うものを混ぜる
        vy: cell * (1.2 + Math.random() * 3.4),
        life: life + Math.random() * 0.45,
        born: life + 0.45,
        size: cell * (0.1 + Math.random() * 0.1),
        color: CLEAR_COLORS[i % CLEAR_COLORS.length]!,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
        gravity: cell * 1.6,
        wobble: Math.random() * Math.PI * 2,
      })
    }
  }

  update(dt: number): void {
    this.clock += dt
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.wobble !== undefined) {
        // 紙が空気を受けて左右に流れる。真下に落ちるだけだと作り物に見える
        p.x += Math.sin(this.clock * 5 + p.wobble) * p.size * 9 * dt
      }
      p.vy += p.gravity * dt
      // 空気抵抗。粒がすぐ止まって散らばったままにならないよう、ゆるく減速させる。
      // 紙は打ち上げた勢いを残したいので、落ちる向きには効かせない
      const paper = p.wobble !== undefined
      p.vx *= 1 - (paper ? 1.2 : 2.5) * dt
      if (!paper) p.vy *= 1 - 0.8 * dt
      p.angle += p.spin * dt
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)

    for (const r of this.ripples) {
      r.radius += r.speed * dt
      r.speed *= 1 - 1.6 * dt
      r.life -= dt
    }
    this.ripples = this.ripples.filter((r) => r.life > 0)

    this.shake = Math.max(0, this.shake - this.shake * 9 * dt - 0.4 * dt)
    // 白飛びは一瞬で引く。残っていると盤面が見えなくなる
    this.flash = Math.max(0, this.flash - this.flash * 7 * dt - 1.2 * dt)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const r of this.ripples) {
      const alpha = (r.life / r.born) * 0.5
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = `rgb(${r.color})`
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.born)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.translate(p.x, p.y)
      if (p.streak) {
        // 速さに比例して伸ばす。止まりかけると点に近づく
        const speed = Math.hypot(p.vx, p.vy)
        const length = Math.max(p.size * 2, speed * 0.035)
        ctx.rotate(Math.atan2(p.vy, p.vx))
        ctx.fillRect(-length, -p.size / 2, length * 2, p.size)
      } else if (p.spin === 0) {
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

  /** 画面全体を覆う。盤面を描いたあとに重ねて呼ぶ */
  drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.flash <= 0) return
    ctx.save()
    ctx.globalAlpha = Math.min(0.85, this.flash * 0.85)
    ctx.fillStyle = this.flashTone === 'gold' ? '#ffd98a' : '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  get busy(): boolean {
    return this.particles.length > 0 || this.ripples.length > 0
  }

  clear(): void {
    this.particles = []
    this.ripples = []
    this.shake = 0
    this.flash = 0
  }
}
