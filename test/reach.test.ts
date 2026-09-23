import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game.ts'
import { parseLevels } from '../src/core/level.ts'
import { findReaches } from '../src/core/reach.ts'

function gameOf(rows: string[]) {
  return new Game(parseLevels(rows.join('\n'))[0]!)
}

describe('findReaches', () => {
  it('押せば入る箱を見つける', () => {
    // 人・箱・穴が一直線。右に 1 回押せば入る
    const game = gameOf(['#####', '#@$.#', '#####'])
    const reaches = findReaches(game)
    expect(reaches).toHaveLength(1)
    expect(reaches[0]!.direction).toBe('right')
    expect(reaches[0]!.goal).toBe(8)
  })

  it('人が押す場所へ行けないなら立たない', () => {
    // 箱の左に穴があるが、押すために立つ場所が壁で塞がれている
    const game = gameOf(['#######', '#.$#@ #', '#######'])
    expect(findReaches(game)).toHaveLength(0)
  })

  it('回り込めるなら立つ', () => {
    // 箱の右から左へ押したい。上を通って回り込める
    const game = gameOf(['######', '#    #', '#.$@ #', '######'])
    const reaches = findReaches(game)
    expect(reaches).toHaveLength(1)
    expect(reaches[0]!.direction).toBe('left')
  })

  it('すでに入っている箱は数えない', () => {
    const game = gameOf(['#####', '#@* #', '#####'])
    expect(findReaches(game)).toHaveLength(0)
  })

  it('押した先が穴でなければ立たない', () => {
    const game = gameOf(['######', '#@$ .#', '######'])
    expect(findReaches(game)).toHaveLength(0)
  })

  it('押した先に別の箱があれば立たない', () => {
    // 手前の箱を右に押したいが、その先に箱がある
    const game = gameOf(['#######', '#@$$..#', '#######'])
    const reaches = findReaches(game)
    expect(reaches.every((r) => r.box !== 2)).toBe(true)
  })

  it('入る手が 2 つあれば 2 つ返す', () => {
    // 左の箱は左へ、右の箱は右へ。人はどちらの押す場所にも行ける
    const game = gameOf(['#######', '#     #', '#.$ $.#', '#  @  #', '#######'])
    expect(findReaches(game)).toHaveLength(2)
  })
})
