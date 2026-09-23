/**
 * 入力は歩を溜めるだけで、盤面は動かさない。
 *
 * まとめて動かすと、箱が穴に入ったことに気づく前に穴の先まで押してしまう。
 * 1 歩ずつ取り出して結果を見られるか、入ったところで残りを捨てられるかを検査する。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Direction } from '../src/core/game.ts'
import { Input } from '../src/ui/input.ts'

/** 1 マスの大きさ。STEP_RATIO が 1 なので、これがそのまま 1 歩ぶんの距離になる */
const CELL = 100

/** addEventListener だけ備えた、イベントを配れる入れもの */
function makeTarget() {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  return {
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn))
    },
    setPointerCapture() {},
    dispatch(type: string, event: unknown) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event)
    },
  }
}

type Harness = {
  input: Input
  touches: number
  /** 溜まっている歩を、空になるまで取り出す */
  drain(): Direction[]
  touch(x: number, y: number): void
  drag(x: number, y: number): void
  lift(): void
  key(key: string, repeat: boolean): void
}

function setup(): Harness {
  const element = makeTarget()
  const win = makeTarget()
  vi.stubGlobal('window', win)

  const harness = {
    touches: 0,
    drain() {
      const steps: Direction[] = []
      for (;;) {
        const next = harness.input.take()
        if (!next) return steps
        steps.push(next)
      }
    },
    touch(x: number, y: number) {
      element.dispatch('pointerdown', { pointerId: 1, clientX: x, clientY: y })
    },
    drag(x: number, y: number) {
      element.dispatch('pointermove', { pointerId: 1, clientX: x, clientY: y })
    },
    lift() {
      element.dispatch('pointerup', { pointerId: 1 })
    },
    key(key: string, repeat: boolean) {
      win.dispatch('keydown', { key, repeat, preventDefault() {} })
    },
  } as Harness

  harness.input = new Input(element as unknown as HTMLElement, {
    onTouch: () => harness.touches++,
  })
  harness.input.setCellSize(CELL)
  return harness
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('指でなぞる', () => {
  it('動かした距離のぶんだけ歩が溜まり、1 歩ずつ取り出せる', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL * 2, 0)
    expect(h.drain()).toEqual(['right', 'right'])
    expect(h.input.take()).toBeNull()
  })

  it('1 歩ぶんに満たない動きでは溜まらない', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL * 0.9, 0)
    expect(h.drain()).toEqual([])
  })

  it('指を離さずに向きを変えれば続けて溜まる', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL, 0)
    h.drag(CELL, CELL)
    expect(h.drain()).toEqual(['right', 'down'])
  })

  it('一気に払っても溜めは上限で止まる', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL * 10, 0)
    // 指を止めたあとも歩き続けないよう、あふれたぶんは捨てる
    expect(h.drain()).toHaveLength(3)
  })
})

describe('箱が穴に入ったところで切る', () => {
  it('release すると、溜まった歩もなぞっている指も消える', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL * 2, 0)
    h.input.release()
    expect(h.drain()).toEqual([])

    // 指を置き直すまで、そのまま動かしても歩かない
    h.drag(CELL * 3, 0)
    expect(h.drain()).toEqual([])

    h.lift()
    h.touch(0, 0)
    h.drag(CELL, 0)
    expect(h.drain()).toEqual(['right'])
  })

  it('discard は溜まった歩だけ捨て、なぞっている指は続く', () => {
    const h = setup()
    h.touch(0, 0)
    h.drag(CELL * 2, 0)
    h.input.discard()
    expect(h.drain()).toEqual([])

    // 壁に当ててから向きを変えるのを、なぞったまま続けられる
    h.drag(CELL * 2, CELL)
    expect(h.drain()).toEqual(['down'])
  })
})

describe('キー', () => {
  it('押しっぱなしでも 1 歩ずつしか溜まらない', () => {
    const h = setup()
    h.key('ArrowRight', false)
    h.key('ArrowRight', true)
    h.key('ArrowRight', true)
    expect(h.drain()).toEqual(['right'])

    // 取り出したぶんだけ、また溜まる
    h.key('ArrowRight', true)
    expect(h.drain()).toEqual(['right'])
  })

  it('discard のあとは、押し直すまで繰り返しを受けない', () => {
    const h = setup()
    h.key('ArrowRight', false)
    h.input.discard()
    h.key('ArrowRight', true)
    expect(h.drain()).toEqual([])

    h.key('ArrowRight', false)
    expect(h.drain()).toEqual(['right'])
  })

  it('WASD でも動く', () => {
    const h = setup()
    h.key('w', false)
    expect(h.drain()).toEqual(['up'])
  })
})
