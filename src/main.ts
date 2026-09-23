/**
 * 起動と、面を遊んでいる間の流れ。
 *
 * 面をクリアしたら演出を見せて自動で次へ進む。手を止める瞬間を作らないため。
 */

import levelsText from '../levels.txt?raw'
import type { Direction } from './core/game.ts'
import { delta, Game } from './core/game.ts'
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
/** クリア演出の残り秒数がこの値を切ったときに、紙吹雪を追加で降らせる */
const CONFETTI_WAVES = [1.15, 0.85, 0.5]
/**
 * 紙吹雪が、次の面に移ってからも残る秒数。
 * 少しだけ残っている方が続けて遊んでいる感じが出るが、
 * 降り続けると盤面が読み取りにくくなる。
 * 撒いた時点の残り時間にこれを足したぶんを、その紙の寿命にする。
 */
const CONFETTI_TAIL_SECONDS = 0.25

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
/** クリア演出の残り秒数。0 より大きい間がクリア演出中 */
let clearTimer = 0
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
  trail = []
  lastOneNotified = false
  countedMoves = 0
  pendingFit = null
  hitStop = 0
  reaches = []
  // 紙吹雪はここで消さない。撒いた時点で寿命を決めてあるので、少し残ってから自然に消える

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
  undoButton.disabled = game.moves === 0 || isBusy()
  resetButton.disabled = game.moves === 0 || isBusy()
  updateRemaining()
}

/** クリア演出を見せている最中か */
function isClearing(): boolean {
  return clearTimer > 0
}

/**
 * 今は盤面を進めない。
 *
 * クリア演出の間、最後の箱を溜めてから爆発させるまでの間、面選択を開いている間。
 * ここを開けておくと、キーを押しっぱなしにしたときに入ったばかりの箱を穴の先へ押し出せてしまう。
 */
function isBusy(): boolean {
  return isClearing() || pendingFit !== null || hitStop > 0 || !levelSelect.hidden
}

function step(direction: Direction): void {
  if (isBusy()) return

  const before = new Map<number, number>()
  for (const box of game.boxes) before.set(box, box)
  const playerBefore = game.player
  const fitBefore = fitBoxes()

  if (!game.move(direction)) {
    // 進めなかったことを音だけでなく画面でも返す
    const { cell } = renderer.boardOrigin(game.level.width, game.level.height)
    effects.bump(cell * 0.1)
    sound.blocked()
    // 壁に当たったまま押し続けても進まない。溜まったぶんを捨てて、当たる音が鳴り続けないようにする
    input.discard()
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

  const foot = centerOf(playerBefore)
  effects.footprint(foot.x, foot.y, foot.cell)

  if (pushedBox !== null) {
    // 押した箱の後ろから粒が散る。押している手応えを目でも返す
    const box = centerOf(pushedBox)
    const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction]
    effects.scrape(box.x, box.y, box.cell, step[0]!, step[1]!)
    effects.bump(box.cell * 0.04)
    sound.push()
    vibrate(sound, 8)
  } else {
    sound.step()
  }

  const fitAfter = fitBoxes()
  const fresh = [...fitAfter].filter((box) => !fitBefore.has(box))
  if (fresh.length > 0) {
    // 入ったところで入力を切る。切らないと、そのまま穴の先まで押して詰ませてしまう
    input.release()
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
  const quiet = isBusy() || !isLastOne()
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
  if (remaining() === 1) {
    if (!lastOneNotified) {
      lastOneNotified = true
      sound.lastOne()
    }
  } else {
    lastOneNotified = false
  }
}

/** まだ穴に入っていない箱の数 */
function remaining(): number {
  return game.level.boxStarts.length - fitBoxes().size
}

/** 残りの箱があと 1 つか */
function isLastOne(): boolean {
  if (isClearing()) return false
  return remaining() === 1
}

/** マスの中心の画面座標と、そのときのマスの大きさ */
function centerOf(pos: number): { x: number; y: number; cell: number } {
  const level = game.level
  const board = renderer.boardOrigin(level.width, level.height)
  const at = toXY(level, pos)
  return {
    x: board.x + at.x * board.cell + board.cell / 2,
    y: board.y + at.y * board.cell + board.cell / 2,
    cell: board.cell,
  }
}

/** 押されて動いた箱の、動く前の位置 */
function findMovedFrom(box: number, before: Map<number, number>, direction: Direction): number {
  const back = box - delta(game.level, direction)
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
  justFit = new Set(fresh)
  justFitTimer = JUST_FIT_SECONDS

  // 入れるたびに派手さを積み増す。1 つ目より 2 つ目、2 つ目より 3 つ目が強い。
  // 最後の 1 つが決まった瞬間だけ、けた違いにする
  const final = game.cleared
  const already = fitBoxes().size - fresh.length
  const strength = final ? 6 : 2.6 + already * 0.8

  for (const box of fresh) {
    const { x, y, cell } = centerOf(box)
    effects.burst(x, y, cell, strength)
    // 溜めたぶんを解き放つ衝撃波。画面の外まで走り抜ける
    effects.shockwave(x, y, cell, strength)
  }

  if (final) {
    effects.whiteOut(1)
    sound.finalFit()
    vibrate(sound, [0, 60])
  } else {
    // 金色に飛ばす。入れた数が増えるほど強くする
    effects.whiteOut(Math.min(0.75, 0.42 + already * 0.12), 'gold')
    sound.fit(already)
    vibrate(sound, [0, 35 + already * 10])
  }
}

/** あと何個で終わりかを出す。残りが見えると入れたくなる */
function updateRemaining(): void {
  const left = remaining()
  remainingLabel.textContent = left > 0 ? `あと ${left}` : ''
  remainingLabel.classList.toggle('last-one', left === 1)
}

function onCleared(): void {
  clearTimer = CLEAR_SECONDS
  // なぞり終えた指はここで切る。触れたままだと演出を飛ばす操作と見なされてしまう
  input.release()
  updateHud()

  const level = game.level
  const { cell } = renderer.boardOrigin(level.width, level.height)
  // 次の面に移るまでの時間に、少しだけ残るぶんを足したのがこの紙の寿命
  effects.confetti(canvas.clientWidth, canvas.clientHeight, cell, CLEAR_SECONDS + CONFETTI_TAIL_SECONDS)
  effects.whiteOut(0.6, 'gold')
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
  // 面数は levels.txt 次第で変わるので、数えた値を出す
  levelText.textContent = `全 ${levels.length} 面クリア。おつかれさまでした`
  // 面選択に戻ったあとも最後の面を眺められるよう、盤面はそのままにしておく
  openLevelSelect()
  updateHud()
}

/**
 * クリア演出の待ち時間を飛ばして、すぐ次の面へ送る。
 * 残り時間を 0 にするだけだと、時間切れで次へ進む処理が二度と動かず固まる。
 */
function skipClearDelay(): void {
  if (!isClearing()) return
  clearTimer = 0
  advance()
}

const input = new Input(canvas, {
  onTouch: () => sound.wake(),
})

/**
 * 溜まった歩を 1 歩ずつ流し込む。
 *
 * 1 歩を描き切るまで次は取らない。まとめて動かすと、
 * 箱が穴に入ったことに気づく前に穴の先まで押してしまう。
 * 1 歩ごとに結果を見るので、入ったところで残りを捨てて止められる。
 */
function pump(): void {
  if (isBusy() || motion) return
  const direction = input.take()
  if (direction) step(direction)
}

canvas.addEventListener('pointerdown', skipClearDelay)

soundButton.addEventListener('click', () => {
  const on = sound.toggle()
  soundButton.textContent = on ? '🔊' : '🔇'
  soundButton.setAttribute('aria-label', on ? '音を止める' : '音を出す')
})

undoButton.addEventListener('click', () => {
  if (isBusy()) return
  if (!game.undo()) return
  motion = null
  justFit = new Set()
  updateReaches(false)
  updateHud()
})

resetButton.addEventListener('click', () => {
  if (isBusy()) return
  // やり直したら連続クリアは途切れる。背景の熱も冷める
  streak = 0
  effects.clear()
  // 面ごとの状態を戻すのは startLevel の仕事。ここで並べ直すと、
  // 状態が増えたときに片方だけ足し忘れる
  startLevel(game.level.index)
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

  // 入力を受けるかを決めるのはここ 1 か所。止めたい場面が増えても足す場所は増えない
  input.setAccepting(!isBusy())

  // 面選択を開いている間は盤面を進めない。
  // 画面は覆われていてもキーは届くので、裏で人が歩いたり、
  // クリア待ちが進んで面が変わったりして、選択画面の「今ここ」とずれる。
  // 絵だけは描き続けて、粒や紙吹雪が止まって見えないようにする
  if (!levelSelect.hidden) {
    draw(dt)
    requestAnimationFrame(frame)
    return
  }

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
      // 進むほど密に集める
      const count = 1 + Math.floor(motion.progress * 3)
      for (const box of pendingFit) {
        const { x, y, cell } = centerOf(box)
        for (let i = 0; i < count; i++) effects.gather(x, y, cell)
      }
    }

    if (motion.progress >= 1) {
      const wasSlow = motion.slow
      motion = null
      // 吸い込み切った瞬間に一拍おいてから爆発させる
      if (wasSlow && pendingFit) hitStop = HIT_STOP_SECONDS
    }
  }

  pump()

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
      for (const reach of reaches) {
        const { x, y, cell } = centerOf(reach.goal)
        effects.gather(x, y, cell)
      }
    }
  }

  if (isClearing()) {
    const before = clearTimer
    clearTimer -= dt

    // 一度に全部撒くと最初の一瞬で終わるので、何度かに分けて降らせ続ける
    for (const at of CONFETTI_WAVES) {
      if (before > at && clearTimer <= at) {
        const { cell } = renderer.boardOrigin(game.level.width, game.level.height)
        // 遅く撒いた紙ほど短命にして、どの波も次の面で同じころに消え切るようにする
        effects.rain(canvas.clientWidth, canvas.clientHeight, cell, 70, at + CONFETTI_TAIL_SECONDS)
      }
    }

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
      clearProgress: isClearing() ? CLEAR_SECONDS - clearTimer : 0,
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
