/**
 * 面をひとつ遊んでいる間の状態と、その動かし方。
 * 画面には触らない。
 */

import type { Level } from './level.ts'
import { inLine, isGoal, isWall } from './level.ts'

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
    if (!inLine(this.level, this.playerPos, next, step) || isWall(this.level, next)) return false

    if (this.boxPositions.has(next)) {
      const beyond = next + step
      if (!inLine(this.level, next, beyond, step) || isWall(this.level, beyond) || this.boxPositions.has(beyond)) {
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
}

/** 上下左右へ 1 マス動く量。並びは DIRECTIONS と同じ */
export function steps(level: Level): readonly number[] {
  return DIRECTIONS.map((direction) => delta(level, direction))
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
