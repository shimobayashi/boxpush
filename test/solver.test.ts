import { describe, expect, it } from 'vitest'
import { parseLevels } from '../src/core/level.ts'
import { solve } from '../src/solver/solve.ts'

function one(rows: string[]) {
  return parseLevels(rows.join('\n'))[0]!
}

describe('solve', () => {
  it('1 回押すだけの面', () => {
    expect(solve(one(['#####', '#@$.#', '#####']))).toMatchObject({ pushes: 1, moves: 1 })
  })

  it('回り込んでから押す面', () => {
    // 人は箱の下にいるので、左へ回り込んでから右に 2 回押す
    const level = one(['#######', '#     #', '# $ . #', '# @   #', '#######'])
    expect(solve(level)).toMatchObject({ pushes: 2, moves: 4 })
  })

  it('まっすぐ押すだけの面は押し回数と手数が一致する', () => {
    // 箱を右へ 4 マス運ぶ。人は箱の後ろを付いていくだけなので手数も 4
    const level = one(['########', '#@$   .#', '########'])
    expect(solve(level)).toMatchObject({ pushes: 4, moves: 4 })
  })

  it('最初から穴に乗っていれば 0 手', () => {
    expect(solve(one(['#####', '#@* #', '#####']))).toMatchObject({ pushes: 0, moves: 0 })
  })

  it('箱が角に入って動かせない面は解けない', () => {
    // 箱が左上の角にあり、穴は別の場所
    const level = one(['#####', '#$  #', '# @ #', '#  .#', '#####'])
    expect(solve(level)).toBe(null)
  })

  it('箱を押し出せない面は解けない', () => {
    // 箱の向こうがずっと壁で、穴まで運べない
    const level = one(['#####', '#@$##', '#  .#', '#####'])
    expect(solve(level)).toBe(null)
  })

  it('箱 2 個の面を解ける', () => {
    const level = one(['#######', '#  .  #', '# $$@ #', '#  .  #', '#######'])
    const result = solve(level)
    expect(result).not.toBe(null)
    expect(result!.pushes).toBeGreaterThan(0)
  })

  it('押した向きを返す', () => {
    // 右に 1 回押してから、下に回り込んで上に押す
    const level = one(['######', '#    #', '#  . #', '#@$  #', '#    #', '######'])
    expect([...solve(level)!.pushDirections].sort()).toEqual(['right', 'up'])
  })

  it('一方向にしか押さない面は向きが 1 つ', () => {
    const level = one(['########', '#@$   .#', '########'])
    expect(solve(level)!.pushDirections).toEqual(['right'])
  })

  it('maxPushes を超えたら打ち切る', () => {
    const level = one(['########', '#@$   .#', '########'])
    expect(solve(level, { maxPushes: 3 })).toBe(null)
    expect(solve(level, { maxPushes: 4 })).toMatchObject({ pushes: 4, moves: 4 })
  })
})
