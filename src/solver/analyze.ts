/**
 * 面がどれくらい難しいかを測る。
 *
 * 最小押し回数は「作業量」であって「難しさ」ではない。
 * 一本道を 10 回押す面より、回り込みが要る 3 回押しの面の方が考えることは多い。
 * ここでは正解の狭さ・詰みやすさ・読みの深さを数えて点数にする。
 *
 * 数え方は押し単位で見る。人がどう歩いたかは難しさに関わらないので、
 * 人の位置は「箱を動かさずに行ける範囲」にまとめて 1 つの状態として扱う。
 */

import type { Direction } from '../core/game.ts'
import { DIRECTIONS } from '../core/game.ts'
import type { Level } from '../core/level.ts'
import { isGoal, isWall } from '../core/level.ts'
import { solve } from './solve.ts'

export type Analysis = {
  /** 最小押し回数 */
  readonly pushes: number
  /** そのときの最小手数 */
  readonly moves: number
  /** 最小押し回数で解ける押し方が何通りあるか。1 なら正解が一本道 */
  readonly optimalPaths: number
  /** 最短の解で、押す向きを変える回数 */
  readonly turns: number
  /** 最短の解で、箱を穴から遠ざける向きに押す回数 */
  readonly detours: number
  /** たどり着ける盤面のうち、もう解けなくなっているものの割合 */
  readonly deadRatio: number
  /** 上の値を合わせた難しさの点数 */
  readonly score: number
}

/** 経路の数え上げが跳ね上がらないよう、この数で頭打ちにする */
const MAX_PATHS = 1000

type State = {
  /** 箱の位置。昇順 */
  readonly boxes: number[]
  /** 人が行ける範囲のうち、いちばん小さい位置。同じ範囲なら同じ状態とみなす */
  readonly zone: number
}

export function analyze(level: Level): Analysis | null {
  const base = solve(level)
  if (!base) return null

  const start = normalize(level, [...level.boxStarts].sort((a, b) => a - b), level.playerStart)
  const startKey = keyOf(start)

  // 押し単位で全部たどり、それぞれに最小押し回数と、そこへ至る押し方の数を持たせる
  const depth = new Map<string, number>([[startKey, 0]])
  const paths = new Map<string, number>([[startKey, 1]])
  const states = new Map<string, State>([[startKey, start]])
  const previous = new Map<string, { key: string; direction: Direction; box: number }>()

  let frontier = [startKey]
  const goals: string[] = []

  while (frontier.length > 0) {
    const next: string[] = []
    for (const key of frontier) {
      const state = states.get(key)!
      const here = depth.get(key)!
      if (state.boxes.every((box) => isGoal(level, box))) {
        goals.push(key)
        // クリアした盤面から先は数えない
        continue
      }
      for (const move of pushesFrom(level, state)) {
        const nextKey = keyOf(move.state)
        const known = depth.get(nextKey)
        if (known === undefined) {
          depth.set(nextKey, here + 1)
          paths.set(nextKey, paths.get(key)!)
          states.set(nextKey, move.state)
          previous.set(nextKey, { key, direction: move.direction, box: move.box })
          next.push(nextKey)
        } else if (known === here + 1) {
          // 同じ押し回数で別の行き方が見つかった
          paths.set(nextKey, Math.min(MAX_PATHS, paths.get(nextKey)! + paths.get(key)!))
        }
      }
    }
    frontier = next
  }

  if (goals.length === 0) return null

  const best = Math.min(...goals.map((key) => depth.get(key)!))
  const bestGoals = goals.filter((key) => depth.get(key) === best)
  const optimalPaths = Math.min(
    MAX_PATHS,
    bestGoals.reduce((sum, key) => sum + paths.get(key)!, 0),
  )

  const { turns, detours } = describePath(level, bestGoals[0]!, previous, states)
  const deadRatio = countDead(level, states, goals)

  const score =
    base.pushes * 1 +
    turns * 2.5 +
    detours * 4 +
    deadRatio * 20 +
    (optimalPaths <= 1 ? 8 : optimalPaths <= 3 ? 4 : optimalPaths <= 8 ? 1.5 : 0)

  return {
    pushes: base.pushes,
    moves: base.moves,
    optimalPaths,
    turns,
    detours,
    deadRatio,
    score: Math.round(score * 10) / 10,
  }
}

/** その盤面から 1 回押してたどり着ける盤面を、すべて挙げる */
function pushesFrom(
  level: Level,
  state: State,
): { state: State; direction: Direction; box: number }[] {
  const reachable = walkable(level, state.boxes, state.zone)
  const boxSet = new Set(state.boxes)
  const result: { state: State; direction: Direction; box: number }[] = []

  for (const box of state.boxes) {
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const ahead = box + step
      const behind = box - step
      if (!inLine(level, box, ahead, step)) continue
      if (!inLine(level, box, behind, step)) continue
      if (isWall(level, ahead) || boxSet.has(ahead)) continue
      if (!reachable.has(behind)) continue

      const boxes = state.boxes.filter((b) => b !== box)
      boxes.push(ahead)
      boxes.sort((a, b) => a - b)
      // 押したあと、人は箱がいた場所に立つ
      result.push({ state: normalize(level, boxes, box), direction, box: ahead })
    }
  }

  return result
}

/** 人が箱を動かさずに行ける範囲を求め、その中のいちばん小さい位置を代表にする */
function normalize(level: Level, boxes: number[], player: number): State {
  const zone = Math.min(...walkable(level, boxes, player))
  return { boxes, zone }
}

function walkable(level: Level, boxes: readonly number[], from: number): Set<number> {
  const blocked = new Set(boxes)
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const pos = queue.pop()!
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      const next = pos + step
      if (!inLine(level, pos, next, step)) continue
      if (seen.has(next) || isWall(level, next) || blocked.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

/** 最短の解を 1 つたどって、押す向きの変化と遠回りを数える */
function describePath(
  level: Level,
  goalKey: string,
  previous: Map<string, { key: string; direction: Direction; box: number }>,
  states: Map<string, State>,
): { turns: number; detours: number } {
  const steps: { direction: Direction; box: number; before: number[] }[] = []
  let key = goalKey
  for (;;) {
    const back = previous.get(key)
    if (!back) break
    steps.unshift({ direction: back.direction, box: back.box, before: states.get(back.key)!.boxes })
    key = back.key
  }

  let turns = 0
  let detours = 0
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    if (i > 0 && steps[i - 1]!.direction !== step.direction) turns++

    // 押す前と後で、いちばん近い穴との距離が伸びたなら遠回り
    const movedFrom = step.box - delta(level, step.direction)
    if (goalDistance(level, step.box) > goalDistance(level, movedFrom)) detours++
  }

  return { turns, detours }
}

/** その位置から、いちばん近い穴までのまっすぐな距離 */
function goalDistance(level: Level, pos: number): number {
  let best = Infinity
  for (let i = 0; i < level.width * level.height; i++) {
    if (!isGoal(level, i)) continue
    const dx = Math.abs((pos % level.width) - (i % level.width))
    const dy = Math.abs(Math.floor(pos / level.width) - Math.floor(i / level.width))
    best = Math.min(best, dx + dy)
  }
  return best
}

/**
 * たどり着ける盤面のうち、そこからではもう解けないものの割合。
 * クリアした盤面から逆に引いて戻れる範囲を出し、それ以外を詰みとみなす。
 */
function countDead(level: Level, states: Map<string, State>, goals: string[]): number {
  const alive = new Set<string>(goals)
  let frontier = [...goals]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const key of frontier) {
      for (const previous of pullsFrom(level, states.get(key)!)) {
        const previousKey = keyOf(previous)
        if (alive.has(previousKey)) continue
        // たどり着けない盤面は数に入れない
        if (!states.has(previousKey)) continue
        alive.add(previousKey)
        next.push(previousKey)
      }
    }
    frontier = next
  }

  const total = states.size
  if (total === 0) return 0
  return (total - alive.size) / total
}

/** その盤面の 1 つ前にありえた盤面を、すべて挙げる（箱を引き戻す） */
function pullsFrom(level: Level, state: State): State[] {
  const reachable = walkable(level, state.boxes, state.zone)
  const boxSet = new Set(state.boxes)
  const result: State[] = []

  for (const box of state.boxes) {
    for (const direction of DIRECTIONS) {
      const step = delta(level, direction)
      // 押す前、箱は 1 つ手前にいて、人はさらにその手前にいた
      const wasBox = box - step
      const wasPlayer = box - step * 2
      if (!inLine(level, box, wasBox, step)) continue
      if (!inLine(level, wasBox, wasPlayer, step)) continue
      if (isWall(level, wasBox) || boxSet.has(wasBox)) continue
      if (isWall(level, wasPlayer) || boxSet.has(wasPlayer)) continue
      // 押したあと人は箱がいた場所に立つので、そこへ行けたはず
      if (!reachable.has(wasBox)) continue

      const boxes = state.boxes.filter((b) => b !== box)
      boxes.push(wasBox)
      boxes.sort((a, b) => a - b)
      result.push(normalize(level, boxes, wasPlayer))
    }
  }

  return result
}

function delta(level: Level, direction: Direction): number {
  switch (direction) {
    case 'up':
      return -level.width
    case 'down':
      return level.width
    case 'left':
      return -1
    case 'right':
      return 1
  }
}

function inLine(level: Level, from: number, to: number, step: number): boolean {
  if (to < 0 || to >= level.width * level.height) return false
  if (step === -1 || step === 1) {
    return Math.floor(from / level.width) === Math.floor(to / level.width)
  }
  return true
}

function keyOf(state: State): string {
  return `${state.zone}|${state.boxes.join(',')}`
}
