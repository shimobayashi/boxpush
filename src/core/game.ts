/**
 * 面をひとつ遊んでいる間の状態と、その動かし方。
 * 画面には触らない。
 */

import type { Level } from './level.ts'
import { isGoal, isWall } from './level.ts'

export type Direction = 'up' | 'down' | 'left' | 'right'

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 1 歩ぶんの記録。戻るときにこれを逆にたどる */
type Step = {
  readonly direction: Direction
  /** 箱を押したなら、その箱の元の位置。押していなければ -1 */
  readonly pushedFrom: number
}

export class Game {
  readonly level: Level
  private playerPos: number
  private boxPositions: Set<number>
  private history: Step[] = []

  constructor(level: Level) {
    this.level = level
    this.playerPos = level.playerStart
    this.boxPositions = new Set(level.boxStarts)
  }

  get player(): number {
    return this.playerPos
  }

  get boxes(): ReadonlySet<number> {
    return this.boxPositions
  }

  /** 人が動いた回数 */
  get moves(): number {
    return this.history.length
  }

  /** 箱を押した回数 */
  get pushes(): number {
    return this.history.reduce((n, step) => (step.pushedFrom >= 0 ? n + 1 : n), 0)
  }

  get cleared(): boolean {
    for (const box of this.boxPositions) {
      if (!isGoal(this.level, box)) return false
    }
    return true
  }

  hasBox(pos: number): boolean {
    return this.boxPositions.has(pos)
  }

  /**
   * 1 歩動かす。動けたら true。
   * 壁にぶつかる、箱の向こうが壁か箱、のときは動かない。
   */
  move(direction: Direction): boolean {
    const step = delta(this.level, direction)
    const next = this.playerPos + step
    if (!this.inside(next, direction) || isWall(this.level, next)) return false

    if (this.boxPositions.has(next)) {
      const beyond = next + step
      if (!this.inside(beyond, direction) || isWall(this.level, beyond) || this.boxPositions.has(beyond)) {
        return false
      }
      this.boxPositions.delete(next)
      this.boxPositions.add(beyond)
      this.playerPos = next
      this.history.push({ direction, pushedFrom: next })
      return true
    }

    this.playerPos = next
    this.history.push({ direction, pushedFrom: -1 })
    return true
  }

  /** 一手戻す。戻せたら true */
  undo(): boolean {
    const step = this.history.pop()
    if (!step) return false

    const d = delta(this.level, step.direction)
    if (step.pushedFrom >= 0) {
      // 押した箱を元に戻す。箱は人の 1 つ先にいる
      const boxNow = this.playerPos + d
      this.boxPositions.delete(boxNow)
      this.boxPositions.add(step.pushedFrom)
    }
    this.playerPos -= d
    return true
  }

  reset(): void {
    this.playerPos = this.level.playerStart
    this.boxPositions = new Set(this.level.boxStarts)
    this.history = []
  }

  /**
   * 盤面の端をはみ出していないか。
   * 盤面を 1 次元で持っているので、左右の動きは行をまたがないことも見る。
   */
  private inside(pos: number, direction: Direction): boolean {
    if (pos < 0 || pos >= this.level.width * this.level.height) return false
    if (direction === 'left' || direction === 'right') {
      const from = direction === 'left' ? pos + 1 : pos - 1
      return Math.floor(pos / this.level.width) === Math.floor(from / this.level.width)
    }
    return true
  }
}

export function delta(level: Level, direction: Direction): number {
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
