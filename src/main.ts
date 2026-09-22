/**
 * 起動と、面を遊んでいる間の流れ。
 *
 * 面をクリアしたら演出を見せて自動で次へ進む。手を止める瞬間を作らないため。
 */

import levelsText from '../levels.txt?raw'
import type { Direction } from './core/game.ts'
import { Game } from './core/game.ts'
import { isGoal, parseLevels, toXY } from './core/level.ts'
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
const CLEAR_SECONDS = 0.8
/** 入ったばかりの箱を強く光らせておく秒数 */
const JUST_FIT_SECONDS = 0.4

const canvas = must<HTMLCanvasElement>('#board')
const levelLabel = must<HTMLElement>('#level-label')
const moveLabel = must<HTMLElement>('#move-label')
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
  effects.clear()

  progress = { ...progress, current: index }
  saveProgress(progress)

  levelLabel.textContent = `面 ${String(index).padStart(2, '0')}`
  levelText.textContent = level.text
  input.release()
  updateHud()
}

function updateHud(): void {
  moveLabel.textContent = `${game.moves} 手`
  undoButton.disabled = game.moves === 0 || locked
  resetButton.disabled = game.moves === 0 || locked
}

function step(direction: Direction): void {
  if (locked) return

  const before = new Map<number, number>()
  for (const box of game.boxes) before.set(box, box)
  const playerBefore = game.player
  const fitBefore = fitBoxes()

  if (!game.move(direction)) {
    sound.blocked()
    return
  }

  // 押した箱は位置が変わるので、動く前の位置を引き継いで補間の起点にする
  const from = new Map<number, number>()
  for (const box of game.boxes) {
    from.set(box, before.has(box) ? box : findMovedFrom(box, before, direction))
  }
  motion = { progress: 0, from, playerFrom: playerBefore }

  if (wasPush(before)) sound.push()

  const fitAfter = fitBoxes()
  const fresh = [...fitAfter].filter((box) => !fitBefore.has(box))
  if (fresh.length > 0) {
    onFit(fresh)
  } else if (fitAfter.size < fitBefore.size) {
    justFit = new Set()
    fitCount = Math.max(0, fitCount - 1)
    sound.unfit()
  }

  updateHud()

  if (game.cleared) {
    onCleared()
  }
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

function wasPush(before: Map<number, number>): boolean {
  for (const box of game.boxes) {
    if (!before.has(box)) return true
  }
  return false
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

  const { cell, x, y } = renderer.boardOrigin(level.width, level.height)
  for (const box of fresh) {
    const at = toXY(level, box)
    effects.burst(x + at.x * cell + cell / 2, y + at.y * cell + cell / 2, cell)
  }

  sound.fit(fitCount)
  fitCount += fresh.length
  vibrate(sound, 18)
}

function onCleared(): void {
  locked = true
  clearTimer = CLEAR_SECONDS
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

  levelText.textContent = `${game.moves} 手でクリア`

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

const input = new Input(canvas, {
  onStep: (direction) => {
    if (locked) {
      // クリア演出の途中で触ったら、その場で次の面へ送る
      if (clearTimer > 0) clearTimer = 0
      return
    }
    step(direction)
  },
  onTouch: () => sound.wake(),
})

canvas.addEventListener('pointerdown', () => {
  if (locked && clearTimer > 0) clearTimer = 0
})

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
  updateHud()
})

resetButton.addEventListener('click', () => {
  if (locked) return
  game.reset()
  motion = null
  justFit = new Set()
  fitCount = 0
  effects.clear()
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

  if (motion) {
    motion.progress += dt / STEP_SECONDS
    if (motion.progress >= 1) motion = null
  }

  if (justFitTimer > 0) {
    justFitTimer -= dt
    if (justFitTimer <= 0) {
      justFitTimer = 0
      justFit = new Set()
    }
  }

  if (clearTimer > 0) {
    clearTimer -= dt
    if (clearTimer <= 0) {
      clearTimer = 0
      advance()
    }
  }

  effects.update(dt)

  renderer.draw(
    {
      game,
      motion,
      justFit,
      clearProgress: locked ? Math.max(0, CLEAR_SECONDS - clearTimer) : 0,
    },
    effects,
  )

  requestAnimationFrame(frame)
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
