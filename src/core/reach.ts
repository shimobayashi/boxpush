/**
 * 「あと 1 手で箱が穴に入る」状態を探す。
 *
 * これが立っている間は画面で予告を出す。結果が出たあとにしか演出が無いと、
 * 気持ちが高ぶる時間が生まれないため。
 */

import type { Direction, Game } from './game.ts'
import { DIRECTIONS, delta } from './game.ts'
import { inLine, isGoal } from './level.ts'
import { zoneLabels } from './zone.ts'

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
  const zones = zoneLabels(level, game.boxes)
  const here = zones[game.player]
  const found: Reach[] = []

  for (const box of game.boxes) {
    if (isGoal(level, box)) continue
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const ahead = box + step
      const behind = box - step
      if (!inLine(level, box, ahead, step)) continue
      if (!inLine(level, box, behind, step)) continue
      // 穴なら壁ではないので、行き先が空いているかは箱の有無だけ見れば足りる
      if (!isGoal(level, ahead) || game.hasBox(ahead)) continue
      // 人が箱の反対側に立てないと押せない
      if (zones[behind] !== here) continue
      found.push({ box, goal: ahead, direction })
    }
  }

  return found
}
