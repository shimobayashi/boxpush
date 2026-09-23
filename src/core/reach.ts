/**
 * 「あと 1 手で箱が穴に入る」状態を探す。
 *
 * これが立っている間は画面で予告を出す。結果が出たあとにしか演出が無いと、
 * 気持ちが高ぶる時間が生まれないため。
 */

import type { Direction, Game } from './game.ts'
import { DIRECTIONS, delta } from './game.ts'
import { isGoal, isWall } from './level.ts'

export type Reach = {
  /** 今の箱の位置 */
  readonly box: number
  /** 押したら入る穴の位置 */
  readonly goal: number
  readonly direction: Direction
}

/**
 * 今すぐ 1 回押せば穴に入る箱を、すべて挙げる。
 * 人がその箱を押せる場所まで実際に歩いて行けるかどうかまで見る。
 */
export function findReaches(game: Game): Reach[] {
  const level = game.level
  const reachable = walkableFrom(game)
  const found: Reach[] = []

  for (const box of game.boxes) {
    if (isGoal(level, box)) continue
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const ahead = box + step
      const behind = box - step
      if (!sameLine(level, box, ahead, step)) continue
      if (!sameLine(level, box, behind, step)) continue
      if (!isGoal(level, ahead)) continue
      if (isWall(level, ahead) || game.hasBox(ahead)) continue
      // 人が箱の反対側に立てないと押せない
      if (!reachable.has(behind)) continue
      found.push({ box, goal: ahead, direction })
    }
  }

  return found
}

/** 人が今いる場所から、箱を動かさずに歩いて行けるマス */
function walkableFrom(game: Game): Set<number> {
  const level = game.level
  const seen = new Set<number>([game.player])
  const queue = [game.player]

  while (queue.length > 0) {
    const pos = queue.pop()!
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const next = pos + step
      if (!sameLine(level, pos, next, step)) continue
      if (seen.has(next)) continue
      if (isWall(level, next) || game.hasBox(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }

  return seen
}

/** 盤面をはみ出していないか。左右の動きは行をまたがないことも見る */
function sameLine(
  level: Game['level'],
  from: number,
  to: number,
  step: number,
): boolean {
  if (to < 0 || to >= level.width * level.height) return false
  if (step === -1 || step === 1) {
    return Math.floor(from / level.width) === Math.floor(to / level.width)
  }
  return true
}
