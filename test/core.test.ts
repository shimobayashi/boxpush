import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game.ts'
import { LevelParseError, parseLevels } from '../src/core/level.ts'

function one(source: string) {
  const levels = parseLevels(source)
  expect(levels).toHaveLength(1)
  return levels[0]!
}

describe('parseLevels', () => {
  it('タイトルとテキストを拾う', () => {
    const level = one(['; 01 はじめの一歩', '; text: 指でなぞって動かす', '#####', '#@$.#', '#####'].join('\n'))
    expect(level.title).toBe('01 はじめの一歩')
    expect(level.text).toBe('指でなぞって動かす')
    expect(level.width).toBe(5)
    expect(level.height).toBe(3)
    expect(level.playerStart).toBe(6)
    expect(level.boxStarts).toEqual([7])
  })

  it('空行で面を区切る', () => {
    const levels = parseLevels(
      ['#####', '#@$.#', '#####', '', '#####', '#@$.#', '#####'].join('\n'),
    )
    expect(levels).toHaveLength(2)
    expect(levels[1]!.index).toBe(2)
  })

  it('穴の上の箱と人を読める', () => {
    const level = one(['#####', '#+$*#', '#####'].join('\n'))
    expect(level.goals.filter(Boolean)).toHaveLength(2)
    expect(level.boxStarts).toHaveLength(2)
  })

  it('テキストが無ければ空になる', () => {
    const level = one(['; 02 曲がる', '#####', '#@$.#', '#####'].join('\n'))
    expect(level.text).toBe('')
  })

  it('箱と穴の数が合わなければ弾く', () => {
    expect(() => parseLevels(['######', '#@$..#', '######'].join('\n'))).toThrow(LevelParseError)
  })

  it('人がいなければ弾く', () => {
    expect(() => parseLevels(['#####', '# $.#', '#####'].join('\n'))).toThrow(LevelParseError)
  })

  it('人が 2 人いれば弾く', () => {
    expect(() => parseLevels(['######', '#@@$.#', '######'].join('\n'))).toThrow(LevelParseError)
  })

  it('知らない記号を弾く', () => {
    expect(() => parseLevels(['#####', '#@$X#', '#####'].join('\n'))).toThrow(LevelParseError)
  })
})

describe('Game', () => {
  const level = one(['#######', '#     #', '# $ . #', '# @   #', '#######'].join('\n'))

  it('壁には進めない', () => {
    const game = new Game(level)
    expect(game.move('down')).toBe(false)
    expect(game.moves).toBe(0)
  })

  it('箱を押すと箱が動き、押し回数が増える', () => {
    const game = new Game(level)
    expect(game.move('up')).toBe(true) // 人が箱の位置へ…ではなく箱を上に押す
    expect(game.pushes).toBe(1)
  })

  it('箱の向こうが壁なら押せない', () => {
    const game = new Game(level)
    game.move('up') // 箱を (2,1) へ押す
    expect(game.move('up')).toBe(false) // その上は壁
  })

  it('右に 2 回押すとクリアになる', () => {
    const game = new Game(level)
    expect(game.cleared).toBe(false)
    game.move('left')
    game.move('up')
    game.move('right')
    game.move('right')
    expect(game.pushes).toBe(2)
    expect(game.moves).toBe(4)
    expect(game.cleared).toBe(true)
  })

  it('戻すと箱も人も元に戻る', () => {
    const game = new Game(level)
    game.move('left')
    game.move('up')
    game.move('right')
    const boxesBefore = [...game.boxes]
    const playerBefore = game.player
    game.move('right')
    expect(game.undo()).toBe(true)
    expect([...game.boxes]).toEqual(boxesBefore)
    expect(game.player).toBe(playerBefore)
    expect(game.pushes).toBe(1)
  })

  it('最初まで戻すと戻せなくなる', () => {
    const game = new Game(level)
    game.move('left')
    expect(game.undo()).toBe(true)
    expect(game.undo()).toBe(false)
    expect(game.player).toBe(level.playerStart)
  })

  it('やり直すと最初の状態になる', () => {
    const game = new Game(level)
    game.move('left')
    game.move('up')
    game.reset()
    expect(game.player).toBe(level.playerStart)
    expect([...game.boxes].sort((a, b) => a - b)).toEqual([...level.boxStarts])
    expect(game.moves).toBe(0)
  })

  it('左端から左には出られない', () => {
    const narrow = one(['###', '#@#', '#$#', '#.#', '###'].join('\n'))
    const game = new Game(narrow)
    expect(game.move('left')).toBe(false)
  })
})
