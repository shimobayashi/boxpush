/**
 * キーを押しっぱなしにしたときの繰り返しの扱い。
 *
 * 繰り返す間隔は OS が決めるので、盤面を描き切る速さより速いことがある。
 * そのまま受けると、箱が穴に入ったのを目で確かめる前に穴の先まで押してしまう。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Direction } from '../src/core/game.ts'
import { Input } from '../src/ui/input.ts'

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
  steps: Direction[]
  input: Input
  canRepeat: boolean
  keyDown(key: string, repeat: boolean): void
  keyUp(key: string): void
}

function setup(): Harness {
  const element = makeTarget()
  const win = makeTarget()
  vi.stubGlobal('window', win)

  const steps: Direction[] = []
  const harness = {
    steps,
    canRepeat: true,
    keyDown(key: string, repeat: boolean) {
      win.dispatch('keydown', { key, repeat, preventDefault() {} })
    },
    keyUp(key: string) {
      win.dispatch('keyup', { key })
    },
  } as Harness

  harness.input = new Input(element as unknown as HTMLElement, {
    onStep: (direction) => steps.push(direction),
    onTouch: () => {},
    canRepeat: () => harness.canRepeat,
  })
  return harness
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('キーの押しっぱなし', () => {
  it('1 歩を描き切っていれば繰り返しを受ける', () => {
    const h = setup()
    h.keyDown('ArrowRight', false)
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right', 'right'])
  })

  it('描いている途中の繰り返しは捨てる', () => {
    const h = setup()
    h.keyDown('ArrowRight', false)
    h.canRepeat = false
    h.keyDown('ArrowRight', true)
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right'])

    // 描き切れば、押したままでも続きが進む
    h.canRepeat = true
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right', 'right'])
  })

  it('描いている途中でも、押し直した一歩は受ける', () => {
    const h = setup()
    h.canRepeat = false
    h.keyDown('ArrowRight', false)
    h.keyDown('ArrowDown', false)
    expect(h.steps).toEqual(['right', 'down'])
  })

  it('blockRepeat を呼ぶと、キーを離すまで繰り返さない', () => {
    const h = setup()
    h.keyDown('ArrowRight', false)
    h.input.blockRepeat()
    h.keyDown('ArrowRight', true)
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right'])

    h.keyUp('ArrowRight')
    h.keyDown('ArrowRight', false)
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right', 'right', 'right'])
  })

  it('面が切り替わったら、押したままの指も手も持ち越さない', () => {
    const h = setup()
    h.keyDown('ArrowRight', false)
    h.input.release()
    h.keyDown('ArrowRight', true)
    expect(h.steps).toEqual(['right'])
  })
})
