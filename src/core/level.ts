/**
 * levels.txt の読み取りと、面の表現。
 *
 * 書式は docs/design.md の「面データ」を見る。
 * 空行で面を区切り、`;` 始まりはコメント、`; text:` だけは盤面の下に出す 1 行として扱う。
 */

export const WALL = '#'
export const FLOOR = ' '
export const PLAYER = '@'
export const BOX = '$'
export const GOAL = '.'
export const BOX_ON_GOAL = '*'
export const PLAYER_ON_GOAL = '+'

/** 面の静的な部分。壁と穴は動かないので、盤面ごとに 1 つだけ持つ */
export type Level = {
  /** 面番号（1 始まり） */
  readonly index: number
  /** levels.txt の `; NN <タイトル>` から拾う。無ければ空文字 */
  readonly title: string
  /** `; text:` の 1 行。無ければ空文字 */
  readonly text: string
  readonly width: number
  readonly height: number
  /** 壁なら true。長さは width * height */
  readonly walls: readonly boolean[]
  /** 穴なら true。長さは width * height */
  readonly goals: readonly boolean[]
  /** 人の初期位置 */
  readonly playerStart: number
  /** 箱の初期位置。昇順に並べる */
  readonly boxStarts: readonly number[]
}

/**
 * 大きさだけ分かればよい処理のための、面の最小限の形。
 * 面ができる前の生成スクリプトからも同じ処理を呼びたいため。
 */
export type Board = Pick<Level, 'width' | 'height'>

export function at(board: Board, x: number, y: number): number {
  return y * board.width + x
}

export function toXY(board: Board, pos: number): { x: number; y: number } {
  return { x: pos % board.width, y: Math.floor(pos / board.width) }
}

export function isWall(level: Level, pos: number): boolean {
  return level.walls[pos] === true
}

export function isGoal(level: Level, pos: number): boolean {
  return level.goals[pos] === true
}

/**
 * from から step だけ動いた先の to が、盤面の中か。
 *
 * 盤面を 1 次元の配列で持っているので、左右に動くと行を飛び越えて
 * 隣の行の端につながってしまう。それも弾く。
 */
export function inLine(board: Board, from: number, to: number, step: number): boolean {
  if (to < 0 || to >= board.width * board.height) return false
  if (step === -1 || step === 1) {
    return Math.floor(from / board.width) === Math.floor(to / board.width)
  }
  return true
}

export class LevelParseError extends Error {}

/**
 * levels.txt 全体を面の配列にする。
 *
 * 面の区切りは空行。ただし盤面の行にも空白が含まれるので、
 * 空白だけの行は「盤面の一部」か「区切り」かを、盤面が始まっているかどうかで判ずる。
 */
export function parseLevels(source: string): Level[] {
  const levels: Level[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  let title = ''
  let text = ''
  let grid: string[] = []

  const flush = () => {
    if (grid.length === 0) return
    levels.push(buildLevel(levels.length + 1, title, text, grid))
    title = ''
    text = ''
    grid = []
  }

  for (const line of lines) {
    if (line.startsWith(';')) {
      // 盤面のあとにコメントが来たら、そこで前の面は終わり。
      // コメントが続いているだけなら、拾ったタイトルを捨てない
      flush()
      const body = line.slice(1).trim()
      const textMatch = /^text:\s*(.*)$/.exec(body)
      if (textMatch) {
        text = textMatch[1] ?? ''
      } else {
        title = body
      }
      continue
    }
    if (line.trim() === '') {
      // 盤面が始まっていなければただの空行、始まっていれば区切り
      if (grid.length > 0) flush()
      continue
    }
    grid.push(line)
  }
  flush()

  return levels
}

function buildLevel(index: number, title: string, text: string, grid: string[]): Level {
  const height = grid.length
  const width = Math.max(...grid.map((row) => row.length))

  const walls: boolean[] = new Array(width * height).fill(false)
  const goals: boolean[] = new Array(width * height).fill(false)
  const boxStarts: number[] = []
  let playerStart = -1

  for (let y = 0; y < height; y++) {
    const row = grid[y] ?? ''
    for (let x = 0; x < width; x++) {
      // 行末が短い面があるので、足りない分は壁の外側（＝壁扱い）にする
      const ch = x < row.length ? row[x]! : WALL
      const pos = y * width + x
      switch (ch) {
        case WALL:
          walls[pos] = true
          break
        case FLOOR:
          break
        case GOAL:
          goals[pos] = true
          break
        case BOX:
          boxStarts.push(pos)
          break
        case BOX_ON_GOAL:
          goals[pos] = true
          boxStarts.push(pos)
          break
        case PLAYER:
          if (playerStart >= 0) {
            throw new LevelParseError(`面 ${index}: 人が 2 人以上いる`)
          }
          playerStart = pos
          break
        case PLAYER_ON_GOAL:
          if (playerStart >= 0) {
            throw new LevelParseError(`面 ${index}: 人が 2 人以上いる`)
          }
          goals[pos] = true
          playerStart = pos
          break
        default:
          throw new LevelParseError(`面 ${index}: 使えない記号 "${ch}" がある`)
      }
    }
  }

  if (playerStart < 0) {
    throw new LevelParseError(`面 ${index}: 人がいない`)
  }
  if (boxStarts.length === 0) {
    throw new LevelParseError(`面 ${index}: 箱が 1 つも無い`)
  }
  const goalCount = goals.filter(Boolean).length
  if (goalCount !== boxStarts.length) {
    throw new LevelParseError(
      `面 ${index}: 箱が ${boxStarts.length} 個、穴が ${goalCount} 個で数が合わない`,
    )
  }

  boxStarts.sort((a, b) => a - b)

  return {
    index,
    title,
    text,
    width,
    height,
    walls,
    goals,
    playerStart,
    boxStarts,
  }
}

/**
 * 面を記号の行に戻す。生成スクリプトと、面の同一判定に使う。
 */
export function formatGrid(
  level: Board & Pick<Level, 'walls' | 'goals'>,
  boxes: readonly number[],
  player: number,
): string[] {
  const rows: string[] = []
  const boxSet = new Set(boxes)
  for (let y = 0; y < level.height; y++) {
    let row = ''
    for (let x = 0; x < level.width; x++) {
      const pos = at(level, x, y)
      if (level.walls[pos]) row += WALL
      else if (boxSet.has(pos)) row += level.goals[pos] ? BOX_ON_GOAL : BOX
      else if (pos === player) row += level.goals[pos] ? PLAYER_ON_GOAL : PLAYER
      else if (level.goals[pos]) row += GOAL
      else row += FLOOR
    }
    rows.push(row.replace(/\s+$/, ''))
  }
  return rows
}

/**
 * 面の指紋。回転と鏡写しの 8 通りのうち、文字列として一番小さいものを採る。
 *
 * 生成スクリプトは「同じ形の面を作らない」ために、テストは「同じ形の面が無い」ことを
 * 確かめるために使う。別々に持つと、弾いていないものを通すか、通したものを落とすかになる。
 */
export function fingerprint(rows: readonly string[]): string {
  const shapes = [rows]
  let current = rows
  for (let i = 0; i < 3; i++) {
    current = rotate(current)
    shapes.push(current)
  }
  return [...shapes, ...shapes.map(mirror)].map((shape) => shape.join('\n')).sort()[0]!
}

/** 行の長さがまちまちでも回せるよう、短い行は空白で埋めてから回す */
function rotate(rows: readonly string[]): string[] {
  const width = Math.max(...rows.map((row) => row.length))
  const padded = rows.map((row) => row.padEnd(width, ' '))
  const out: string[] = []
  for (let x = 0; x < width; x++) {
    let row = ''
    for (let y = padded.length - 1; y >= 0; y--) row += padded[y]![x]
    out.push(row)
  }
  return out
}

function mirror(rows: readonly string[]): string[] {
  const width = Math.max(...rows.map((row) => row.length))
  return rows.map((row) => [...row.padEnd(width, ' ')].reverse().join(''))
}
