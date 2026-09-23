/**
 * 箱を動かさずに人が行ける範囲。
 *
 * 床は壁と箱で区切られて、いくつかの島に分かれる。
 * 人がどの島にいるかだけ分かればよく、島の中のどこに立っているかは要らない。
 * 島ごとに代表のマスを 1 つ決めて、全マスにその番号を振った表を作る。
 *
 * 人の位置から毎回たどり直さず表にするのは、解答器が同じ箱の並びで
 * 何度も島を聞くため。表なら 1 回作って参照するだけで済む。
 */

import type { Level } from './level.ts'
import { inLine, isWall } from './level.ts'
import { steps } from './game.ts'

/** 壁と箱のマスに入る値。どの島にも属さない */
export const NO_ZONE = -1

/**
 * マスごとに、その島の代表を入れた表。代表は島の中でいちばん小さい位置。
 * 2 つのマスが同じ島にあるかは、値が等しいかで分かる。
 */
export function zoneLabels(level: Level, boxes: Iterable<number>): Int32Array {
  const size = level.width * level.height
  const labels = new Int32Array(size).fill(NO_ZONE)
  const blocked = new Set(boxes)
  const around = steps(level)

  for (let start = 0; start < size; start++) {
    if (labels[start] !== NO_ZONE) continue
    if (isWall(level, start) || blocked.has(start)) continue

    // 位置の小さい順に見ているので、島に最初に出会うマスがその島の代表になる
    labels[start] = start
    const queue = [start]
    while (queue.length > 0) {
      const pos = queue.pop()!
      for (const step of around) {
        const next = pos + step
        if (!inLine(level, pos, next, step)) continue
        if (labels[next] !== NO_ZONE) continue
        if (isWall(level, next) || blocked.has(next)) continue
        labels[next] = start
        queue.push(next)
      }
    }
  }

  return labels
}
