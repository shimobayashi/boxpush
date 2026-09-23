/**
 * 面がどれくらい難しいかを測る。
 *
 * 測り方は、人が解いた時間との相関を調べた研究に合わせている。
 * Jarušek & Pelánek "Difficulty Rating of Sokoban Puzzle"（2000 問・785 時間の実測）では、
 * 順位相関がこうなっている。
 *
 *   状態空間の大きさ  -0.07  ← ほぼ無関係
 *   最短手数           0.47
 *   箱の持ち替え回数   0.74
 *   問題の分解         0.82  ← いちばん効く
 *   http://sokoban.dk/wp-content/uploads/2016/02/Difficulty-Rating-of-Sokoban-Puzzle.pdf
 *
 * 詰みやすさや解の通り数といった状態空間の広さは、人の感じる難しさとほぼ関係が無い。
 * このゲームには戻る操作があるので、詰んでも取り返しがつくことも理由になる。
 *
 * 数え方は押し単位で見る。人がどう歩いたかは難しさに関わらないので、
 * 人の位置は「箱を動かさずに行ける範囲」にまとめて 1 つの状態として扱う。
 */

import type { Direction } from '../core/game.ts'
import { DIRECTIONS } from '../core/game.ts'
import type { Level } from '../core/level.ts'
import { isGoal, isWall } from '../core/level.ts'
import { findDeadCells } from './solve.ts'

export type Analysis = {
  /** 最小押し回数 */
  readonly pushes: number
  /**
   * 押す箱を変えた回数。
   * 1 つずつ順に片付けられる面は少なく、行ったり来たりが要る面は多い。
   */
  readonly boxChanges: number
  /**
   * 同じ箱を同じ向きに押し続ける並びを 1 つと数えたときの数（box lines）。
   * 「まっすぐ押すだけ」の作業量を除いた、実質の手順の長さ。
   */
  readonly boxLines: number
  /**
   * 問題の分解。箱を 2 組に分けたとき、組を行き来する回数のいちばん少ない値。
   * 0 なら「片方を全部片付けてからもう片方」で解ける。大きいほど絡み合っていて難しい。
   */
  readonly decomposition: number
  /** 上の値を合わせた難しさの点数 */
  readonly score: number
}

type State = {
  /** 箱の位置。昇順 */
  readonly boxes: number[]
  /** 人が行ける範囲のうち、いちばん小さい位置。同じ範囲なら同じ状態とみなす */
  readonly zone: number
}

type Step = {
  readonly key: string
  /** 押した箱の、押す前の位置 */
  readonly from: number
  /** 押した箱の、押したあとの位置 */
  readonly to: number
  readonly direction: Direction
}

export type AnalyzeOptions = {
  /**
   * 調べる盤面の数の上限。超えたら測るのをやめて null を返す。
   * 状態空間の広さは難しさとほぼ関係が無いので、
   * 重い候補を切り捨てても作れる面の難しさは変わらない。
   */
  readonly maxStates?: number
}

export function analyze(level: Level, options: AnalyzeOptions = {}): Analysis | null {
  const path = shortestPath(level, options.maxStates ?? Infinity)
  if (!path) return null

  const boxChanges = countBoxChanges(path)
  const boxLines = countBoxLines(path)
  const decomposition = countDecomposition(level, path)

  // 重みは研究の相関の強さに合わせた。分解をいちばん重く見る
  const score =
    path.length * 1 + boxLines * 1.5 + boxChanges * 3 + decomposition * 5 + level.boxStarts.length * 2

  return {
    pushes: path.length,
    boxChanges,
    boxLines,
    decomposition,
    score: Math.round(score * 10) / 10,
  }
}

/** 解けるかどうかだけ知りたいとき */
export function isSolvable(level: Level): boolean {
  return shortestPath(level, Infinity) !== null
}

/** 押し回数がいちばん少ない手順を 1 つ返す。調べた盤面が maxStates を超えたら諦める */
function shortestPath(level: Level, maxStates: number): Step[] | null {
  // 箱が入ると二度と出せない場所。ここへ押す手はたどらない。
  // これを見ないと調べる盤面が何倍にも膨らむ
  const dead = findDeadCells(level)
  const start = normalize(level, [...level.boxStarts].sort((a, b) => a - b), level.playerStart)
  const startKey = keyOf(start)
  const states = new Map<string, State>([[startKey, start]])
  const cameFrom = new Map<string, Step>()
  const seen = new Set([startKey])

  let frontier = [startKey]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const key of frontier) {
      const state = states.get(key)!
      if (state.boxes.every((box) => isGoal(level, box))) {
        return rebuild(cameFrom, key)
      }
      for (const move of pushesFrom(level, state)) {
        if (dead[move.to] && !isGoal(level, move.to)) continue
        const nextKey = keyOf(move.state)
        if (seen.has(nextKey)) continue
        if (seen.size >= maxStates) return null
        seen.add(nextKey)
        states.set(nextKey, move.state)
        cameFrom.set(nextKey, {
          key,
          from: move.from,
          to: move.to,
          direction: move.direction,
        })
        next.push(nextKey)
      }
    }
    frontier = next
  }

  return null
}

function rebuild(cameFrom: Map<string, Step>, goalKey: string): Step[] {
  const steps: Step[] = []
  let key = goalKey
  for (;;) {
    const step = cameFrom.get(key)
    if (!step) break
    steps.unshift(step)
    key = step.key
  }
  return steps
}

/** 押す箱を変えた回数 */
function countBoxChanges(path: Step[]): number {
  let changes = 0
  for (let i = 1; i < path.length; i++) {
    // 前の手で動かした箱を続けて動かしていなければ、持ち替えたことになる
    if (path[i]!.from !== path[i - 1]!.to) changes++
  }
  return changes
}

/** 同じ箱を同じ向きに押し続ける並びを 1 つと数える */
function countBoxLines(path: Step[]): number {
  if (path.length === 0) return 0
  let lines = 1
  for (let i = 1; i < path.length; i++) {
    const sameBox = path[i]!.from === path[i - 1]!.to
    if (!sameBox || path[i]!.direction !== path[i - 1]!.direction) lines++
  }
  return lines
}

/**
 * 箱を 2 組に分けたとき、組を行き来する回数のいちばん少ない値。
 *
 * 「A を全部片付けてから B」と分けて解けるなら 0 になり、
 * A と B を交互に触らざるを得ないほど大きくなる。
 */
function countDecomposition(level: Level, path: Step[]): number {
  const count = level.boxStarts.length
  if (count < 2 || path.length === 0) return 0

  // 手順を「何番目の箱を押したか」の列に直す
  const order: number[] = []
  const live = new Map<number, number>()
  level.boxStarts.forEach((box, index) => live.set(box, index))
  for (const step of path) {
    const id = live.get(step.from)
    if (id === undefined) continue
    order.push(id)
    live.delete(step.from)
    live.set(step.to, id)
  }

  let best = Infinity
  // 2 組への分け方をすべて試す。箱は多くても 5 個なので数えきれる
  for (let mask = 1; mask < (1 << count) - 1; mask++) {
    let switches = 0
    let previous: number | null = null
    for (const id of order) {
      const group = (mask >> id) & 1
      if (previous !== null && group !== previous) switches++
      previous = group
    }
    best = Math.min(best, switches)
  }
  return best === Infinity ? 0 : best
}

/** その盤面から 1 回押してたどり着ける盤面を、すべて挙げる */
function pushesFrom(
  level: Level,
  state: State,
): { state: State; from: number; to: number; direction: Direction }[] {
  const reachable = walkable(level, state.boxes, state.zone)
  const boxSet = new Set(state.boxes)
  const result: { state: State; from: number; to: number; direction: Direction }[] = []

  for (const box of state.boxes) {
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const ahead = box + step
      const behind = box - step
      if (!inLine(level, box, ahead, step)) continue
      if (!inLine(level, box, behind, step)) continue
      if (isWall(level, ahead) || boxSet.has(ahead)) continue
      if (!reachable.has(behind)) continue

      const boxes = state.boxes.filter((b) => b !== box)
      boxes.push(ahead)
      boxes.sort((a, b) => a - b)
      // 押したあと、人は箱がいた場所に立つ
      result.push({ state: normalize(level, boxes, box), from: box, to: ahead, direction })
    }
  }

  return result
}

/** 人が箱を動かさずに行ける範囲を求め、その中のいちばん小さい位置を代表にする */
function normalize(level: Level, boxes: number[], player: number): State {
  return { boxes, zone: Math.min(...walkable(level, boxes, player)) }
}

function walkable(level: Level, boxes: readonly number[], from: number): Set<number> {
  const blocked = new Set(boxes)
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const pos = queue.pop()!
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const next = pos + step
      if (!inLine(level, pos, next, step)) continue
      if (seen.has(next) || isWall(level, next) || blocked.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

function delta(level: Level, direction: Direction): number {
  switch (direction) {
    case 'up':
      return -level.width
    case 'down':
      return level.width
    case 'left':
      return -1
    case 'right':
      return 1
  }
}

function inLine(level: Level, from: number, to: number, step: number): boolean {
  if (to < 0 || to >= level.width * level.height) return false
  if (step === -1 || step === 1) {
    return Math.floor(from / level.width) === Math.floor(to / level.width)
  }
  return true
}

function keyOf(state: State): string {
  return `${state.zone}|${state.boxes.join(',')}`
}
