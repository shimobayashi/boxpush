/**
 * levels.txt そのものの検査。
 * 面は生成スクリプトが作るので、人が目で確かめない代わりにここで守る。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Level } from '../src/core/level.ts'
import { formatGrid, isGoal, parseLevels, toXY } from '../src/core/level.ts'
import { allowsSingleDirection, blockOf, TARGETS } from '../src/core/targets.ts'
import { solve } from '../src/solver/solve.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const levels = parseLevels(readFileSync(join(ROOT, 'levels.txt'), 'utf8'))

/** 回転と鏡写しの 8 通りのうち、文字列として一番小さいものを面の指紋にする */
function fingerprint(level: Level): string {
  const base = formatGrid(level, level.boxStarts, level.playerStart)
  const shapes = [base]
  let current = base
  for (let i = 0; i < 3; i++) {
    current = rotate(current)
    shapes.push(current)
  }
  return [...shapes, ...shapes.map(mirror)].map((s) => s.join('\n')).sort()[0]!
}

function rotate(rows: string[]): string[] {
  const width = Math.max(...rows.map((r) => r.length))
  const padded = rows.map((r) => r.padEnd(width, ' '))
  const out: string[] = []
  for (let x = 0; x < width; x++) {
    let row = ''
    for (let y = padded.length - 1; y >= 0; y--) row += padded[y]![x]
    out.push(row)
  }
  return out
}

function mirror(rows: string[]): string[] {
  const width = Math.max(...rows.map((r) => r.length))
  return rows.map((row) => [...row.padEnd(width, ' ')].reverse().join(''))
}

describe('levels.txt', () => {
  it('30 面ある', () => {
    expect(levels).toHaveLength(30)
    expect(levels).toHaveLength(TARGETS.length)
  })

  it('面 01 と各ブロックの頭にだけテキストが付いている', () => {
    const withText = levels.filter((level) => level.text !== '').map((level) => level.index)
    expect(withText).toEqual([1, 7, 13, 19, 25])
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
      const print = fingerprint(level)
      const already = seen.get(print)
      expect(already, `面 ${level.index} は面 ${already} と同じ形`).toBeUndefined()
      seen.set(print, level.index)
    }
  })

  it('すべての面が解けて、最小押し回数が目標どおり', () => {
    levels.forEach((level, i) => {
      const target = TARGETS[i]!
      const solution = solve(level)
      expect(solution, `面 ${level.index} が解けない`).not.toBe(null)
      expect(solution!.pushes, `面 ${level.index} の押し回数`).toBe(target.pushes)
    })
  })

  it('ブロック 2 以降は箱を 2 方向以上に押す', () => {
    for (const level of levels) {
      if (allowsSingleDirection(level.index)) continue
      const solution = solve(level)!
      expect(
        solution.pushDirections.length,
        `面 ${level.index}（ブロック ${blockOf(level.index)}）が一方向にしか押さない`,
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it('ブロックの中で難易度が上がり、切れ目で落ちる', () => {
    for (let i = 1; i < TARGETS.length; i++) {
      const prev = TARGETS[i - 1]!
      const current = TARGETS[i]!
      const index = i + 1
      if (blockOf(index) === blockOf(index - 1)) {
        expect(current.pushes, `面 ${index} はブロックの中なので前より上がる`).toBeGreaterThanOrEqual(
          prev.pushes,
        )
      } else {
        expect(current.pushes, `面 ${index} はブロックの頭なので前より落ちる`).toBeLessThan(prev.pushes)
      }
    }
  })

  it('ブロックの谷と山がどちらも後ろほど上がる', () => {
    const valleys: number[] = []
    const peaks: number[] = []
    for (let block = 0; block < 5; block++) {
      const slice = TARGETS.slice(block * 6, block * 6 + 6).map((t) => t.pushes)
      valleys.push(Math.min(...slice))
      peaks.push(Math.max(...slice))
    }
    for (let i = 1; i < valleys.length; i++) {
      expect(valleys[i]!, `ブロック ${i + 1} の谷`).toBeGreaterThan(valleys[i - 1]!)
      expect(peaks[i]!, `ブロック ${i + 1} の山`).toBeGreaterThan(peaks[i - 1]!)
    }
  })
})
