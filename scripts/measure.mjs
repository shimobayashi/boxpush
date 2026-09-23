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

console.log('面   押し  向き  遠回り  詰み率  正解数   点数')
const scores = []
for (const level of levels) {
  const a = analyze(level)
  if (!a) {
    console.log(`${String(level.index).padStart(2, '0')}   解けない`)
    continue
  }
  scores.push(a.score)
  console.log(
    [
      String(level.index).padStart(2, '0'),
      String(a.pushes).padStart(4),
      String(a.turns).padStart(5),
      String(a.detours).padStart(6),
      `${(a.deadRatio * 100).toFixed(0)}%`.padStart(7),
      String(a.optimalPaths).padStart(6),
      a.score.toFixed(1).padStart(6),
    ].join(' '),
  )
}

// 面番号が進むほど難しくなっているかを、前後のずれで見る
let inversions = 0
for (let i = 1; i < scores.length; i++) {
  if (scores[i] < scores[i - 1]) inversions++
}
console.log(`\n前の面より易しくなっている箇所: ${inversions} / ${scores.length - 1}`)
console.log(`点数の幅: ${Math.min(...scores).toFixed(1)} 〜 ${Math.max(...scores).toFixed(1)}`)
