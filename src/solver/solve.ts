/**
 * 面を解いて、最小押し回数と、そのときの最小手数を返す。
 *
 * 難易度は最小押し回数で測ると決めたので（docs/design.md）、
 * 押し回数を第 1 のコスト、手数を第 2 のコストにした経路探索にする。
 * 2 つをまとめて `押し回数 * PUSH_WEIGHT + 手数` という 1 つの数にし、ダイクストラで最小を取る。
 */

import type { Direction } from '../core/game.ts'
import type { Level } from '../core/level.ts'
import { isGoal, isWall } from '../core/level.ts'

/**
 * 手数がこの値を超える面は扱わない。
 * 押し回数を必ず優先させるため、1 押しの重みを手数の上限より大きくしておく。
 */
const MAX_MOVES = 10000
const PUSH_WEIGHT = MAX_MOVES

export type Solution = {
  readonly pushes: number
  readonly moves: number
  /**
   * 見つけた解で、箱を押した向きの種類。
   * 一方向に押すだけの面を生成時に外すのに使う（docs/design.md の足切り条件）。
   */
  readonly pushDirections: readonly Direction[]
}

export type SolveOptions = {
  /** 押し回数がこれを超えたら探索を打ち切る。生成時に見込みの無い候補を早く捨てるのに使う */
  readonly maxPushes?: number
}

export function solve(level: Level, options: SolveOptions = {}): Solution | null {
  const maxPushes = options.maxPushes ?? Infinity
  const size = level.width * level.height

  // 押せない位置（穴でない角）をあらかじめ調べておく。
  // ここに箱が入ると二度と動かせないので、探索を早く打ち切れる。
  const deadCells = findDeadCells(level)

  const startBoxes = [...level.boxStarts].sort((a, b) => a - b)
  if (startBoxes.some((box) => deadCells[box] && !isGoal(level, box))) return null

  const startKey = stateKey(startBoxes, level.playerStart)
  const best = new Map<string, number>([[startKey, 0]])
  // 押した向きを取り出せるよう、どの状態からどう来たかを覚えておく
  const cameFrom = new Map<string, { from: string; step: number; pushed: boolean }>()
  const heap = new Heap()
  heap.push(0, startKey)

  while (heap.size > 0) {
    const { cost, key } = heap.pop()!
    if ((best.get(key) ?? Infinity) < cost) continue

    const { boxes, player } = parseKey(key)
    const pushes = Math.floor(cost / PUSH_WEIGHT)
    const moves = cost % PUSH_WEIGHT

    if (boxes.every((box) => isGoal(level, box))) {
      return { pushes, moves, pushDirections: collectPushDirections(level, cameFrom, key) }
    }
    if (pushes >= maxPushes) continue
    if (moves >= MAX_MOVES - 1) continue

    const boxSet = new Set(boxes)
    for (const step of steps(level)) {
      const next = player + step
      if (!inside(level, player, next, step, size)) continue
      if (isWall(level, next)) continue

      let nextCost: number
      let nextBoxes = boxes

      if (boxSet.has(next)) {
        const beyond = next + step
        if (!inside(level, next, beyond, step, size)) continue
        if (isWall(level, beyond) || boxSet.has(beyond)) continue
        if (deadCells[beyond] && !isGoal(level, beyond)) continue

        nextBoxes = boxes.filter((b) => b !== next)
        nextBoxes.push(beyond)
        nextBoxes.sort((a, b) => a - b)
        nextCost = cost + PUSH_WEIGHT + 1
      } else {
        nextCost = cost + 1
      }

      const nextKey = stateKey(nextBoxes, next)
      if ((best.get(nextKey) ?? Infinity) <= nextCost) continue
      best.set(nextKey, nextCost)
      cameFrom.set(nextKey, { from: key, step, pushed: nextBoxes !== boxes })
      heap.push(nextCost, nextKey)
    }
  }

  return null
}

/** 解けるかどうかだけ知りたいとき */
export function isSolvable(level: Level): boolean {
  return solve(level) !== null
}

/** ゴールから逆にたどって、箱を押した向きを集める */
function collectPushDirections(
  level: Level,
  cameFrom: Map<string, { from: string; step: number; pushed: boolean }>,
  goalKey: string,
): Direction[] {
  const found = new Set<Direction>()
  let key = goalKey
  for (;;) {
    const back = cameFrom.get(key)
    if (!back) break
    if (back.pushed) found.add(toDirection(level, back.step))
    key = back.from
  }
  return [...found]
}

function toDirection(level: Level, step: number): Direction {
  if (step === -level.width) return 'up'
  if (step === level.width) return 'down'
  if (step === -1) return 'left'
  return 'right'
}

/**
 * 壁の角のように、箱が入ると押し出せなくなるマスを探す。
 *
 * 上下のどちらかが壁で、かつ左右のどちらかが壁なら、その箱は二度と動かない。
 * 穴の上なら止まっていて構わないので、呼ぶ側で穴かどうかを見る。
 */
function findDeadCells(level: Level): boolean[] {
  const dead: boolean[] = new Array(level.width * level.height).fill(false)
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const pos = y * level.width + x
      if (isWall(level, pos)) continue
      const up = y === 0 || isWall(level, pos - level.width)
      const down = y === level.height - 1 || isWall(level, pos + level.width)
      const left = x === 0 || isWall(level, pos - 1)
      const right = x === level.width - 1 || isWall(level, pos + 1)
      if ((up || down) && (left || right)) dead[pos] = true
    }
  }
  return dead
}

function steps(level: Level): number[] {
  return [-level.width, level.width, -1, 1]
}

/** 盤面の端をはみ出していないか。左右の動きは行をまたがないことも見る */
function inside(level: Level, from: number, to: number, step: number, size: number): boolean {
  if (to < 0 || to >= size) return false
  if (step === -1 || step === 1) {
    return Math.floor(from / level.width) === Math.floor(to / level.width)
  }
  return true
}

function stateKey(boxes: readonly number[], player: number): string {
  return `${player}|${boxes.join(',')}`
}

function parseKey(key: string): { boxes: number[]; player: number } {
  const sep = key.indexOf('|')
  const player = Number(key.slice(0, sep))
  const boxes = key
    .slice(sep + 1)
    .split(',')
    .map(Number)
  return { boxes, player }
}

/** 素朴なバイナリヒープ。優先度は数値の小さい順 */
class Heap {
  private costs: number[] = []
  private keys: string[] = []

  get size(): number {
    return this.costs.length
  }

  push(cost: number, key: string): void {
    this.costs.push(cost)
    this.keys.push(key)
    let i = this.costs.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.costs[parent]! <= this.costs[i]!) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): { cost: number; key: string } | undefined {
    if (this.costs.length === 0) return undefined
    const cost = this.costs[0]!
    const key = this.keys[0]!
    const lastCost = this.costs.pop()!
    const lastKey = this.keys.pop()!
    if (this.costs.length > 0) {
      this.costs[0] = lastCost
      this.keys[0] = lastKey
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.costs.length && this.costs[left]! < this.costs[smallest]!) smallest = left
        if (right < this.costs.length && this.costs[right]! < this.costs[smallest]!) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return { cost, key }
  }

  private swap(a: number, b: number): void {
    const c = this.costs[a]!
    this.costs[a] = this.costs[b]!
    this.costs[b] = c
    const k = this.keys[a]!
    this.keys[a] = this.keys[b]!
    this.keys[b] = k
  }
}
