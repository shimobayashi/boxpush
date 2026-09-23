/**
 * 起動と、面を遊んでいる間の流れ。
 *
 * 面をクリアしたら演出を見せて自動で次へ進む。手を止める瞬間を作らないため。
 */

import levelsText from '../levels.txt?raw'
import type { Direction } from './core/game.ts'
import { Game } from './core/game.ts'
import { isGoal, parseLevels, toXY } from './core/level.ts'
import type { Reach } from './core/reach.ts'
import { findReaches } from './core/reach.ts'
import { Sound, vibrate } from './ui/audio.ts'
import { Effects } from './ui/effects.ts'
import { Input } from './ui/input.ts'
import type { Motion } from './ui/render.ts'
import { Renderer } from './ui/render.ts'
import { isUnlocked, loadProgress, saveProgress } from './ui/progress.ts'
import type { Progress } from './ui/progress.ts'
import './ui/style.css'

const levels = parseLevels(levelsText)

/** 1 歩の移動を描き切るまでの秒数。速すぎると何が起きたか分からず、遅いとテンポが落ちる */
const STEP_SECONDS = 0.085
/** クリア演出を見せてから次の面へ移るまでの秒数 */
const CLEAR_SECONDS = 1.5
/** 入ったばかりの箱を強く光らせておく秒数 */
const JUST_FIT_SECONDS = 0.4
/** 人が通った跡が消えるまでの秒数 */
const TRAIL_SECONDS = 0.5
/** 跡として残す最大の数 */
const TRAIL_LIMIT = 8
/** 箱が穴に入る一手だけ、移動をこの倍だけ長くかけて吸い込まれるように見せる */
const FIT_SLOWDOWN = 7
/** 吸い込まれ切った瞬間に、これだけ画面を止めてから爆発させる */
const HIT_STOP_SECONDS = 0.18

const canvas = must<HTMLCanvasElement>('#board')
const levelLabel = must<HTMLElement>('#level-label')
const moveLabel = must<HTMLElement>('#move-label')
const remainingLabel = must<HTMLElement>('#remaining-label')
const levelText = must<HTMLElement>('#level-text')
const soundButton = must<HTMLButtonElement>('#sound-button')
const undoButton = must<HTMLButtonElement>('#undo-button')
const resetButton = must<HTMLButtonElement>('#reset-button')
const menuButton = must<HTMLButtonElement>('#menu-button')
const levelSelect = must<HTMLElement>('#level-select')
const levelGrid = must<HTMLElement>('#level-grid')
const closeSelect = must<HTMLButtonElement>('#level-select .close')

const renderer = new Renderer(canvas)
const effects = new Effects()
const sound = new Sound()

let progress: Progress = loadProgress(levels.length)
let game = new Game(levels[0]!)
let motion: Motion | null = null
let justFit = new Set<number>()
let justFitTimer = 0
let clearTimer = 0
let fitCount = 0
/** クリア演出の間は操作を受け付けない */
let locked = false
/** 人が通ってきた跡 */
let trail: { pos: number; age: number }[] = []
/** 残りの箱があと 1 つになったことを、もう知らせたか */
let lastOneNotified = false
/** やり直さずに何面続けてクリアしたか */
let streak = 0
/** 箱が吸い込まれ切るのを待っている間、演出をここに置いておく */
let pendingFit: number[] | null = null
/** 演出を出す前の、画面を止めておく残り秒数 */
let hitStop = 0
/** あと 1 手で入る箱と穴。予告に使う */
let reaches: Reach[] = []
/** 予告中に粒を出す間隔を測るための時計 */
let reachSpawn = 0
/** クリア時に手数を数え上げて見せるための、今表示している値 */
let countedMoves = 0

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`${selector} が見つからない`)
  return element
}

function startLevel(index: number): void {
  const level = levels[index - 1]
  if (!level) return
  game = new Game(level)
  motion = null
  justFit = new Set()
  justFitTimer = 0
  clearTimer = 0
  fitCount = 0
  locked = false
  trail = []
  lastOneNotified = false
  countedMoves = 0
  pendingFit = null
  hitStop = 0
  reaches = []
  // 紙吹雪はここで消さない。次の面が始まってからも降り続ける方が続けて遊んでいる感じが出る

  progress = { ...progress, current: index }
  saveProgress(progress)

  levelLabel.textContent = `面 ${String(index).padStart(2, '0')}`
  levelText.textContent = level.text
  input.release()
  input.setCellSize(renderer.cellSize(level.width, level.height))
  updateReaches(false)
  updateHud()
}

function updateHud(): void {
  moveLabel.textContent = `${game.moves} 手`
  undoButton.disabled = game.moves === 0 || locked
  resetButton.disabled = game.moves === 0 || locked
  updateRemaining()
}

function step(direction: Direction): void {
  if (locked) return

  const before = new Map<number, number>()
  for (const box of game.boxes) before.set(box, box)
  const playerBefore = game.player
  const fitBefore = fitBoxes()

  if (!game.move(direction)) {
    // 進めなかったことを音だけでなく画面でも返す
    const { cell } = renderer.boardOrigin(game.level.width, game.level.height)
    effects.bump(cell * 0.1)
    sound.blocked()
    return
  }

  // 押した箱は位置が変わるので、動く前の位置を引き継いで補間の起点にする
  const from = new Map<number, number>()
  let pushedBox: number | null = null
  for (const box of game.boxes) {
    if (before.has(box)) {
      from.set(box, box)
      continue
    }
    from.set(box, findMovedFrom(box, before, direction))
    pushedBox = box
  }
  motion = { progress: 0, from, playerFrom: playerBefore, pushedBox, slow: false }

  trail.unshift({ pos: playerBefore, age: 0 })
  if (trail.length > TRAIL_LIMIT) trail.length = TRAIL_LIMIT

  const board = renderer.boardOrigin(game.level.width, game.level.height)
  const footAt = toXY(game.level, playerBefore)
  effects.footprint(
    board.x + footAt.x * board.cell + board.cell / 2,
    board.y + footAt.y * board.cell + board.cell / 2,
    board.cell,
  )

  if (pushedBox !== null) {
    // 押した箱の後ろから粒が散る。押している手応えを目でも返す
    const at = toXY(game.level, pushedBox)
    const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction]
    effects.scrape(
      board.x + at.x * board.cell + board.cell / 2,
      board.y + at.y * board.cell + board.cell / 2,
      board.cell,
      step[0]!,
      step[1]!,
    )
    effects.bump(board.cell * 0.04)
    sound.push()
    vibrate(sound, 8)
  } else {
    sound.step()
  }

  const fitAfter = fitBoxes()
  const fresh = [...fitAfter].filter((box) => !fitBefore.has(box))
  if (fresh.length > 0) {
    if (game.cleared) {
      // 最後の 1 つだけ溜める。途中の箱まで毎回止めると、続けて解く流れが切れる
      motion.slow = true
      pendingFit = fresh
      sound.suck()
    } else {
      onFit(fresh)
    }
  } else if (fitAfter.size < fitBefore.size) {
    justFit = new Set()
    fitCount = Math.max(0, fitCount - 1)
    sound.unfit()
  }

  updateReaches()
  notifyLastOne()
  updateHud()
}

/**
 * 予告を出し直す。
 * notify が true なら、新しく立ったときに音で知らせる。
 * 面を始めたときや戻したときは、こちらから動かしたわけではないので鳴らさない。
 */
function updateReaches(notify = true): void {
  // 数だけ見ると、別の箱の予告に入れ替わったときに気づけない
  const before = new Set(reaches.map((r) => `${r.box}>${r.goal}`))
  // 予告は面の最後の 1 つだけ。途中の箱でも出すと、ここぞという感じが薄れる
  const quiet = locked || pendingFit !== null || !isLastOne()
  reaches = quiet ? [] : findReaches(game)
  const appeared = reaches.some((r) => !before.has(`${r.box}>${r.goal}`))
  if (notify && appeared) sound.reach()
}

/**
 * 残りがあと 1 つになったら、一度だけ知らせる。
 * 箱が最初から 1 つしかない面では、減った実感が無いので鳴らさない。
 */
function notifyLastOne(): void {
  if (game.cleared) return
  if (game.level.boxStarts.length < 2) return
  const remaining = game.level.boxStarts.length - fitBoxes().size
  if (remaining === 1) {
    if (!lastOneNotified) {
      lastOneNotified = true
      sound.lastOne()
    }
  } else {
    lastOneNotified = false
  }
}

/** 残りの箱があと 1 つか */
function isLastOne(): boolean {
  if (locked) return false
  return game.level.boxStarts.length - fitBoxes().size === 1
}

/** 押されて動いた箱の、動く前の位置 */
function findMovedFrom(box: number, before: Map<number, number>, direction: Direction): number {
  const level = game.level
  const back =
    direction === 'up'
      ? box + level.width
      : direction === 'down'
        ? box - level.width
        : direction === 'left'
          ? box + 1
          : box - 1
  return before.has(back) ? back : box
}

/** 今、穴の上にある箱 */
function fitBoxes(): Set<number> {
  const result = new Set<number>()
  for (const box of game.boxes) {
    if (isGoal(game.level, box)) result.add(box)
  }
  return result
}

function onFit(fresh: number[]): void {
  const level = game.level
  justFit = new Set(fresh)
  justFitTimer = JUST_FIT_SECONDS

  // 入れるたびに派手さを積み増す。1 つ目より 2 つ目、2 つ目より 3 つ目が強い。
  // 最後の 1 つが決まった瞬間だけ、けた違いにする
  const final = game.cleared
  const strength = final ? 6 : 2.6 + fitCount * 0.8

  const { cell, x, y } = renderer.boardOrigin(level.width, level.height)
  for (const box of fresh) {
    const at = toXY(level, box)
    const cx = x + at.x * cell + cell / 2
    const cy = y + at.y * cell + cell / 2
    effects.burst(cx, cy, cell, strength)
    // 溜めたぶんを解き放つ衝撃波。画面の外まで走り抜ける
    effects.shockwave(cx, cy, cell, strength)
  }

  if (final) {
    effects.whiteOut(1)
    sound.finalFit()
    vibrate(sound, [0, 60])
  } else {
    // 金色に飛ばす。入れた数が増えるほど強くする
    effects.whiteOut(Math.min(0.75, 0.42 + fitCount * 0.12), 'gold')
    sound.fit(fitCount)
    vibrate(sound, [0, 35 + fitCount * 10])
  }
  fitCount += fresh.length
}

/** あと何個で終わりかを出す。残りが見えると入れたくなる */
function updateRemaining(): void {
  const remaining = game.level.boxStarts.length - fitBoxes().size
  remainingLabel.textContent = remaining > 0 ? `あと ${remaining}` : ''
  remainingLabel.classList.toggle('last-one', remaining === 1)
}

function onCleared(): void {
  locked = true
  clearTimer = CLEAR_SECONDS
  // なぞり終えた指はここで切る。触れたままだと演出を飛ばす操作と見なされてしまう
  input.release()
  updateHud()

  const level = game.level
  const { cell } = renderer.boardOrigin(level.width, level.height)
  effects.confetti(canvas.clientWidth, canvas.clientHeight, cell)
  sound.clear()
  vibrate(sound, [0, 40, 60, 80])

  const cleared = new Set(progress.cleared)
  cleared.add(level.index)
  progress = { cleared, current: Math.min(level.index + 1, levels.length) }
  saveProgress(progress)

  streak++
  countedMoves = 0
  levelText.textContent = '0 手でクリア'

  if (cleared.size === levels.length) {
    sound.allClear()
  }
}

function advance(): void {
  const next = game.level.index + 1
  if (next > levels.length) {
    showAllClear()
    return
  }
  startLevel(next)
}

function showAllClear(): void {
  levelText.textContent = '全 30 面クリア。おつかれさまでした'
  openLevelSelect()
  // 面選択に戻ったあとも最後の面を眺められるよう、盤面はそのままにしておく
  locked = false
  updateHud()
}

/**
 * クリア演出の待ち時間を飛ばして、すぐ次の面へ送る。
 * 残り時間を 0 にするだけだと、時間切れで次へ進む処理が二度と動かず固まる。
 */
function skipClearDelay(): void {
  if (!locked || clearTimer <= 0) return
  clearTimer = 0
  advance()
}

const input = new Input(canvas, {
  onStep: (direction) => {
    // クリア演出の間は動かさない。飛ばしたいときは指を離して触り直す
    if (locked) return
    step(direction)
  },
  onTouch: () => sound.wake(),
})

canvas.addEventListener('pointerdown', skipClearDelay)

soundButton.addEventListener('click', () => {
  const on = sound.toggle()
  soundButton.textContent = on ? '🔊' : '🔇'
  soundButton.setAttribute('aria-label', on ? '音を止める' : '音を出す')
})

undoButton.addEventListener('click', () => {
  if (locked) return
  if (!game.undo()) return
  motion = null
  justFit = new Set()
  fitCount = fitBoxes().size
  updateReaches(false)
  updateHud()
})

resetButton.addEventListener('click', () => {
  if (locked) return
  game.reset()
  motion = null
  justFit = new Set()
  fitCount = 0
  trail = []
  lastOneNotified = false
  // やり直したら連続クリアは途切れる。背景の熱も冷める
  streak = 0
  effects.clear()
  updateReaches(false)
  updateHud()
})

menuButton.addEventListener('click', openLevelSelect)
closeSelect.addEventListener('click', () => {
  levelSelect.hidden = true
})

function openLevelSelect(): void {
  levelGrid.replaceChildren()
  for (const level of levels) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = String(level.index)
    const unlocked = isUnlocked(progress, level.index)
    button.disabled = !unlocked
    if (progress.cleared.has(level.index)) button.classList.add('cleared')
    if (level.index === game.level.index) button.classList.add('current')
    button.addEventListener('click', () => {
      levelSelect.hidden = true
      // 選び直したときは前の面の演出も連続クリアも引きずらない
      effects.clear()
      streak = 0
      startLevel(level.index)
    })
    levelGrid.append(button)
  }
  levelSelect.hidden = false
}

let lastTime = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now

  // 吸い込まれ切ったあとの静止。ここでは何も進めない
  if (hitStop > 0) {
    hitStop -= dt
    if (hitStop <= 0) {
      hitStop = 0
      const fresh = pendingFit
      pendingFit = null
      if (fresh) {
        onFit(fresh)
        updateReaches()
        notifyLastOne()
        if (game.cleared) onCleared()
      }
    }
    draw(0)
    requestAnimationFrame(frame)
    return
  }

  if (motion) {
    motion.progress += dt / (STEP_SECONDS * (motion.slow ? FIT_SLOWDOWN : 1))

    // 吸い込まれている間、入る先の穴へ粒を集める。溜まっていくのが目に見える
    if (motion.slow && pendingFit) {
      const board = renderer.boardOrigin(game.level.width, game.level.height)
      for (const box of pendingFit) {
        const at = toXY(game.level, box)
        const cx = board.x + at.x * board.cell + board.cell / 2
        const cy = board.y + at.y * board.cell + board.cell / 2
        // 進むほど密に集める
        const count = 1 + Math.floor(motion.progress * 3)
        for (let i = 0; i < count; i++) effects.gather(cx, cy, board.cell)
      }
    }

    if (motion.progress >= 1) {
      const wasSlow = motion.slow
      motion = null
      // 吸い込み切った瞬間に一拍おいてから爆発させる
      if (wasSlow && pendingFit) hitStop = HIT_STOP_SECONDS
    }
  }

  if (justFitTimer > 0) {
    justFitTimer -= dt
    if (justFitTimer <= 0) {
      justFitTimer = 0
      justFit = new Set()
    }
  }

  for (const mark of trail) mark.age += dt / TRAIL_SECONDS
  trail = trail.filter((mark) => mark.age < 1)

  // 予告が出ている間は、入る先の穴へ粒をちらちら流し続ける
  if (reaches.length > 0) {
    reachSpawn += dt
    if (reachSpawn > 0.07) {
      reachSpawn = 0
      const board = renderer.boardOrigin(game.level.width, game.level.height)
      for (const reach of reaches) {
        const at = toXY(game.level, reach.goal)
        effects.gather(
          board.x + at.x * board.cell + board.cell / 2,
          board.y + at.y * board.cell + board.cell / 2,
          board.cell,
        )
      }
    }
  }

  if (clearTimer > 0) {
    clearTimer -= dt
    // 手数を数え上げて見せる。演出の前半で数え切る
    if (countedMoves < game.moves) {
      countedMoves = Math.min(game.moves, countedMoves + Math.ceil(game.moves * dt * 2.5))
      levelText.textContent = `${countedMoves} 手でクリア`
    }
    if (clearTimer <= 0) {
      clearTimer = 0
      advance()
    }
  }

  draw(dt)
  requestAnimationFrame(frame)
}

function draw(dt: number): void {
  effects.update(dt)
  renderer.draw(
    {
      game,
      motion,
      justFit,
      clearProgress: locked ? Math.max(0, CLEAR_SECONDS - clearTimer) : 0,
      lastOne: isLastOne(),
      trail,
      streak,
      reaches,
    },
    effects,
    dt,
  )
}

function handleResize(): void {
  renderer.resize()
  const level = game.level
  input.setCellSize(renderer.cellSize(level.width, level.height))
}

window.addEventListener('resize', handleResize)
window.addEventListener('orientationchange', handleResize)

soundButton.textContent = sound.isEnabled ? '🔊' : '🔇'
startLevel(progress.current)
handleResize()
requestAnimationFrame(frame)
