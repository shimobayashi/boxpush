/**
 * levels.txt そのものの検査。
 * 面は生成スクリプトが作るので、人が目で確かめない代わりにここで守る。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Level } from '../src/core/level.ts'
import { fingerprint, formatGrid, isGoal, parseLevels, toXY } from '../src/core/level.ts'
import { allowsSingleDirection, blockOf, TARGETS } from '../src/core/targets.ts'
import { analyze } from '../src/solver/analyze.ts'
import { solve } from '../src/solver/solve.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const levels = parseLevels(readFileSync(join(ROOT, 'levels.txt'), 'utf8'))

// 解くのも測るのも面ごとに数千の盤面を調べるので、検査ごとに呼び直さず 1 回で済ませる
const solutions = levels.map((level) => solve(level))
const analyses = levels.map((level) => analyze(level))

/** 面の指紋。生成スクリプトが同じ形を弾くのに使うものと同じ */
function printOf(level: Level): string {
  return fingerprint(formatGrid(level, level.boxStarts, level.playerStart))
}

describe('levels.txt', () => {
  it('18 面ある', () => {
    expect(levels).toHaveLength(18)
    expect(levels).toHaveLength(TARGETS.length)
  })

  it('面 01 と各ブロックの頭にだけテキストが付いている', () => {
    const withText = levels.filter((level) => level.text !== '').map((level) => level.index)
    expect(withText).toEqual([1, 7, 13])
  })

  it('すべての面にタイトルが付いている', () => {
    for (const level of levels) {
      expect(level.title, `面 ${level.index}`).not.toBe('')
    }
  })

  it('外周が壁で閉じている', () => {
    for (const level of levels) {
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          const onEdge = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1
          if (!onEdge) continue
          expect(level.walls[y * level.width + x], `面 ${level.index} の (${x},${y})`).toBe(true)
        }
      }
    }
  })

  it('盤面の大きさが目標どおり', () => {
    levels.forEach((level, i) => {
      const target = TARGETS[i]!
      expect(level.width, `面 ${level.index} の幅`).toBe(target.size)
      expect(level.height, `面 ${level.index} の高さ`).toBe(target.size)
    })
  })

  it('箱の数が目標どおり', () => {
    levels.forEach((level, i) => {
      expect(level.boxStarts.length, `面 ${level.index}`).toBe(TARGETS[i]!.boxes)
    })
  })

  it('最初から穴に乗っている箱が無い', () => {
    for (const level of levels) {
      for (const box of level.boxStarts) {
        const { x, y } = toXY(level, box)
        expect(isGoal(level, box), `面 ${level.index} の箱 (${x},${y})`).toBe(false)
      }
    }
  })

  it('回転や鏡写しで重なる面が無い', () => {
    const seen = new Map<string, number>()
    for (const level of levels) {
      const print = printOf(level)
      const already = seen.get(print)
      expect(already, `面 ${level.index} は面 ${already} と同じ形`).toBeUndefined()
      seen.set(print, level.index)
    }
  })

  it('すべての面が解ける', () => {
    levels.forEach((level, i) => {
      expect(solutions[i], `面 ${level.index} が解けない`).not.toBe(null)
    })
  })

  it('難しさが目標の近くに収まっている', () => {
    levels.forEach((level, i) => {
      const target = TARGETS[i]!
      const a = analyses[i]
      expect(a, `面 ${level.index} を測れない`).not.toBe(null)
      // 目標どおりの面が出ないときは縛りを緩めて作り直すので、その分だけ幅を見ておく
      expect(
        Math.abs(a!.score - target.score),
        `面 ${level.index} の点数 ${a!.score}（目標 ${target.score}）`,
      ).toBeLessThanOrEqual(target.tolerance + 6)
    })
  })

  it('後半の面は箱が絡み合っている', () => {
    levels.forEach((level, i) => {
      const target = TARGETS[i]!
      if (target.minDecomposition === 0) return
      const a = analyses[i]!
      // 片方の箱を全部片付けてから残り、で解ける面は考えることが少ない。
      // 目標どおりの面が出ないときは縛りを緩めて作り直すので、その分は見ておく
      expect(a.decomposition, `面 ${level.index} の分解`).toBeGreaterThanOrEqual(
        Math.max(0, target.minDecomposition - 2),
      )
    })
  })

  it('ブロック 2 以降は箱を 2 方向以上に押す', () => {
    levels.forEach((level, i) => {
      if (allowsSingleDirection(level.index)) return
      expect(
        solutions[i]!.pushDirections.length,
        `面 ${level.index}（ブロック ${blockOf(level.index)}）が一方向にしか押さない`,
      ).toBeGreaterThanOrEqual(2)
    })
  })

  // 目標の表ではなく、出来上がった面そのものを測って確かめる。
  // 表どおりに作れているかは上の検査が見るので、ここは「遊ぶ人が感じる並び」を見る
  const scores = analyses.map((a) => a!.score)

  it('ブロックの中で難しくなり、切れ目で易しくなる', () => {
    for (let i = 1; i < scores.length; i++) {
      const index = i + 1
      if (blockOf(index) === blockOf(index - 1)) {
        expect(
          scores[i]!,
          `面 ${index}（${scores[i]}）はブロックの中なので、面 ${index - 1}（${scores[i - 1]}）より難しいはず`,
        ).toBeGreaterThan(scores[i - 1]!)
      } else {
        expect(
          scores[i]!,
          `面 ${index}（${scores[i]}）はブロックの頭なので、面 ${index - 1}（${scores[i - 1]}）より易しいはず`,
        ).toBeLessThan(scores[i - 1]!)
      }
    }
  })

  it('ブロックの谷と山がどちらも後ろほど上がる', () => {
    const valleys: number[] = []
    const peaks: number[] = []
    for (let block = 0; block < 3; block++) {
      const slice = scores.slice(block * 6, block * 6 + 6)
      valleys.push(Math.min(...slice))
      peaks.push(Math.max(...slice))
    }
    for (let i = 1; i < valleys.length; i++) {
      expect(valleys[i]!, `ブロック ${i + 1} の谷`).toBeGreaterThan(valleys[i - 1]!)
      expect(peaks[i]!, `ブロック ${i + 1} の山`).toBeGreaterThan(peaks[i - 1]!)
    }
  })
})
