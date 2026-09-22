/**
 * 面を生成して levels.txt を書き出す。
 *
 * 目標の難易度（最小押し回数）は docs/design.md の表のとおり。
 * ゴールの状態から箱を逆向きに引いて候補を作り、解答器で押し回数を測って、
 * 目標に合うものだけを採る。人が目で選ばない。
 *
 * 使い方: npm run gen
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLevels } from '../src/core/level.ts'
import { allowsSingleDirection, TARGETS } from '../src/core/targets.ts'
import { solve } from '../src/solver/solve.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 面 01 と各ブロックの頭にだけ出す一言 */
const TEXTS = {
  1: '指でなぞって動かす',
  7: '箱が増えていきます',
  13: '回り込んで押す',
  19: 'ここから本番',
  25: '最後の6面',
}

const TITLES = [
  'はじめの一歩', 'ひと押し', 'ふた押し', '曲がり角', 'すこし遠く', '行って戻る',
  '仕切り直し', '寄り道', 'ふたつの箱', '順番がある', '入れ替え', '奥から',
  'ひと息', '回り込む', '押してから戻る', '遠回り', '両側から', '出口はひとつ',
  'また仕切り直し', '通路', 'みっつの箱', '詰め込む', '順番を考える', '最後のひと押し',
  '仕上げの助走', '見えてくる形', 'ひとつずつ', '折り返し', 'あと少し', 'おしまい',
]

const WALL = '#'
const FLOOR = ' '
const GOAL = '.'

/** seed 固定の乱数。誰が走らせても同じ 30 面になる */
function makeRandom(seed) {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)]
}

/**
 * 外周を壁で囲い、内側にランダムに壁を置く。
 * 床がひとつながりになるまでやり直す。
 */
function makeWalls(random, size) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const walls = []
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
        // 内側の壁は 18% 前後。多すぎると通路だらけになり、少なすぎるとただの広場になる
        walls.push(edge || random() < 0.18)
      }
    }
    const floors = []
    for (let i = 0; i < walls.length; i++) if (!walls[i]) floors.push(i)
    if (floors.length < 8) continue
    if (!connected(walls, size, floors)) continue
    return { walls, floors }
  }
  return null
}

/** 床がひとつながりか */
function connected(walls, size, floors) {
  const seen = new Set([floors[0]])
  const queue = [floors[0]]
  while (queue.length > 0) {
    const pos = queue.pop()
    for (const next of neighbors(pos, size)) {
      if (walls[next] || seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen.size === floors.length
}

function neighbors(pos, size) {
  const x = pos % size
  const y = Math.floor(pos / size)
  const list = []
  if (y > 0) list.push(pos - size)
  if (y < size - 1) list.push(pos + size)
  if (x > 0) list.push(pos - 1)
  if (x < size - 1) list.push(pos + 1)
  return list
}

function stepsOf(size) {
  return [-size, size, -1, 1]
}

/** 左右の動きが行をまたいでいないか */
function sameRow(from, to, step, size) {
  if (step !== -1 && step !== 1) return true
  return Math.floor(from / size) === Math.floor(to / size)
}

/**
 * ゴールの状態から逆向きに動かして初期配置を作る。
 *
 * 逆向きの「引く」は、人が下がって、正面にあった箱を自分のいた場所へ引き寄せる動き。
 * これを前向きに見ると、ちょうど押したことになる。
 */
function pullBack(random, walls, size, goals, steps) {
  const boxes = new Set(goals)
  const floors = []
  for (let i = 0; i < walls.length; i++) if (!walls[i] && !boxes.has(i)) floors.push(i)
  if (floors.length === 0) return null
  let player = pick(random, floors)

  let pulls = 0
  let lastPull = null
  for (let i = 0; i < steps; i++) {
    const moves = []
    for (const step of stepsOf(size)) {
      const ahead = player + step
      if (ahead < 0 || ahead >= walls.length) continue
      if (!sameRow(player, ahead, step, size)) continue
      if (walls[ahead] || boxes.has(ahead)) continue

      const behind = player - step
      const canPull =
        behind >= 0 &&
        behind < walls.length &&
        sameRow(player, behind, -step, size) &&
        boxes.has(behind)

      moves.push({ step, pull: false })
      // 直前に引いた箱をそのまま戻すと盤面が元通りになるので、その引きは選ばない
      const undoesLastPull = lastPull && behind === lastPull.box && step === -lastPull.step
      if (canPull && !undoesLastPull) moves.push({ step, pull: true })
    }
    if (moves.length === 0) break

    // 引く方を厚めに選ぶ。ただ歩くだけでは盤面が変わらないため
    const pullable = moves.filter((m) => m.pull)
    const move = pullable.length > 0 && random() < 0.85 ? pick(random, pullable) : pick(random, moves)

    if (move.pull) {
      boxes.delete(player - move.step)
      boxes.add(player)
      lastPull = { box: player, step: move.step }
      pulls++
    }
    player += move.step
  }

  return { boxes: [...boxes].sort((a, b) => a - b), player, pulls }
}

/** 盤面を記号の行にする */
function toGrid(walls, size, goals, boxes, player) {
  const goalSet = new Set(goals)
  const boxSet = new Set(boxes)
  const rows = []
  for (let y = 0; y < size; y++) {
    let row = ''
    for (let x = 0; x < size; x++) {
      const pos = y * size + x
      if (walls[pos]) row += WALL
      else if (boxSet.has(pos)) row += goalSet.has(pos) ? '*' : '$'
      else if (pos === player) row += goalSet.has(pos) ? '+' : '@'
      else if (goalSet.has(pos)) row += GOAL
      else row += FLOOR
    }
    rows.push(row)
  }
  return rows
}

/** 回転と鏡写しの 8 通りのうち、文字列として一番小さいものを面の指紋にする */
function fingerprint(rows) {
  let shapes = [rows]
  let current = rows
  for (let i = 0; i < 3; i++) {
    current = rotate(current)
    shapes.push(current)
  }
  shapes = [...shapes, ...shapes.map(mirror)]
  return shapes.map((shape) => shape.join('\n')).sort()[0]
}

function rotate(rows) {
  const h = rows.length
  const w = rows[0].length
  const out = []
  for (let x = 0; x < w; x++) {
    let row = ''
    for (let y = h - 1; y >= 0; y--) row += rows[y][x]
    out.push(row)
  }
  return out
}

function mirror(rows) {
  return rows.map((row) => [...row].reverse().join(''))
}

/**
 * 目標に合う面をひとつ作る。見つからなければ null。
 */
function generateOne(random, target, index, seen) {
  const allowSingleDirection = allowsSingleDirection(index)

  // 押し回数が多い面ほど当たりが少ない。7x7・箱 3 個で押し 12 回だと数千回に 1 つ
  for (let attempt = 0; attempt < 60000; attempt++) {
    const board = makeWalls(random, target.size)
    if (!board) continue
    const { walls, floors } = board
    if (floors.length < target.boxes * 3) continue

    // 穴を選ぶ
    const goals = []
    const pool = [...floors]
    for (let i = 0; i < target.boxes; i++) {
      const at = Math.floor(random() * pool.length)
      goals.push(pool[at])
      pool.splice(at, 1)
    }

    // 長めに引いて、箱を遠くまで運ぶ余地を作る
    const pulled = pullBack(random, walls, target.size, goals, 200)
    if (!pulled) continue
    if (pulled.pulls < target.pushes) continue

    // 最初から穴に乗っている箱があれば捨てる
    if (pulled.boxes.some((box) => goals.includes(box))) continue

    // 余白は削らない。外周の壁を確実に残すのと、
    // 「人も箱も通らないマスが広い面は外さない」という決め（docs/design.md）に合わせる
    const rows = toGrid(walls, target.size, goals, pulled.boxes, pulled.player)
    const print = fingerprint(rows)
    if (seen.has(print)) continue

    let level
    try {
      level = parseLevels(rows.join('\n'))[0]
    } catch {
      continue
    }
    if (!level) continue

    const solution = solve(level, { maxPushes: target.pushes })
    if (!solution) continue
    if (solution.pushes !== target.pushes) continue
    if (!allowSingleDirection && solution.pushDirections.length < 2) continue

    seen.add(print)
    return { rows, solution }
  }
  return null
}

function main() {
  const random = makeRandom(20260922)
  const seen = new Set()
  const out = []
  const report = []

  for (let i = 0; i < TARGETS.length; i++) {
    const index = i + 1
    const target = TARGETS[i]
    const made = generateOne(random, target, index, seen)
    if (!made) {
      console.error(`面 ${index}: 目標（押し ${target.pushes} 回・箱 ${target.boxes} 個）に合う面が作れなかった`)
      process.exit(1)
    }

    const number = String(index).padStart(2, '0')
    const lines = [`; ${number} ${TITLES[i]}`]
    if (TEXTS[index]) lines.push(`; text: ${TEXTS[index]}`)
    lines.push(...made.rows)
    out.push(lines.join('\n'))

    report.push(
      `面 ${number}  押し ${String(made.solution.pushes).padStart(2)}  手数 ${String(made.solution.moves).padStart(3)}  箱 ${target.boxes}  ${made.rows[0].length}x${made.rows.length}`,
    )
  }

  const header = [
    '; BOXPUSH の面データ',
    '; 記号: # 壁 / 空白 床 / @ 人 / $ 箱 / . 穴 / * 穴の上の箱 / + 穴の上の人',
    '; 空行で面を区切る。; 始まりはコメント、; text: は盤面の下に出る 1 行',
    '; このファイルは npm run gen が書き出す。手で足すときは docs/design.md を見る',
    '',
  ].join('\n')

  writeFileSync(join(ROOT, 'levels.txt'), `${header}${out.join('\n\n')}\n`, 'utf8')
  console.log(report.join('\n'))
  console.log(`\n${out.length} 面を levels.txt に書き出した`)
}

main()
