/**
 * levels.txt の各面の難しさを測って並べる。
 * 面の作り直しが効いているかを見るのに使う。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLevels } from '../src/core/level.ts'
import { analyze } from '../src/solver/analyze.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const levels = parseLevels(readFileSync(join(ROOT, 'levels.txt'), 'utf8'))

console.log('面  押し  持ち替え  区切り  分解  箱  点数')
const scores = []
for (const level of levels) {
  const a = analyze(level)
  if (!a) {
    console.log(`${String(level.index).padStart(2, '0')}  解けない`)
    continue
  }
  scores.push(a.score)
  console.log(
    [
      String(level.index).padStart(2, '0'),
      String(a.pushes).padStart(4),
      String(a.boxChanges).padStart(8),
      String(a.boxLines).padStart(6),
      String(a.decomposition).padStart(4),
      String(level.boxStarts.length).padStart(3),
      a.score.toFixed(1).padStart(6),
    ].join(' '),
  )
}

// ブロックの切れ目以外で易しくなっていないかを見る
let inversions = 0
for (let i = 1; i < scores.length; i++) {
  const block = Math.floor(i / 6)
  const previousBlock = Math.floor((i - 1) / 6)
  if (block === previousBlock && scores[i] < scores[i - 1]) inversions++
}
console.log(`\nブロックの中で前より易しくなっている箇所: ${inversions}`)
console.log(`点数の幅: ${Math.min(...scores).toFixed(1)} 〜 ${Math.max(...scores).toFixed(1)}`)
