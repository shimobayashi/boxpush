/**
 * 面ごとの難しさの目標。docs/design.md の「難易度の設計」の表そのもの。
 *
 * 30 面を 6 面ずつ 5 ブロックに分け、ブロックの中で上げて、次のブロックの頭で落とす。
 * 谷も山も後ろほど上がる。
 *
 * 生成スクリプトはこの値を狙って面を作り、テストは levels.txt がこの値どおりかを見る。
 * 二重に書くとずれるので、両方がここを読む。
 */

export type Target = {
  /** 難しさの点数の下限。src/solver/analyze.ts が出す score */
  readonly score: number
  /** 点数がこの幅に収まっていればよい */
  readonly tolerance: number
  readonly boxes: number
  /** 盤面の一辺。外周の壁を含む */
  readonly size: number
  /**
   * 最小押し回数で解ける押し方の上限。
   * どう押しても解ける面は、押し回数が多くても易しいため、後半ほど狭く縛る。
   */
  readonly maxPaths: number
  /** 押す向きを変える回数の下限。回り込みを強いる */
  readonly minTurns: number
  /** 箱を穴から遠ざける押しの回数の下限。直感に反する手を強いる */
  readonly minDetours: number
}

export const TARGETS: readonly Target[] = [
  // ブロック 1（01-06）: 押すことを覚える。仕掛けは求めない
  { score: 12, tolerance: 5, boxes: 1, size: 6, maxPaths: 999, minTurns: 0, minDetours: 0 },
  { score: 15, tolerance: 4, boxes: 1, size: 6, maxPaths: 999, minTurns: 0, minDetours: 0 },
  { score: 18, tolerance: 4, boxes: 1, size: 6, maxPaths: 60, minTurns: 1, minDetours: 0 },
  { score: 21, tolerance: 4, boxes: 1, size: 6, maxPaths: 40, minTurns: 1, minDetours: 0 },
  { score: 24, tolerance: 4, boxes: 1, size: 6, maxPaths: 30, minTurns: 2, minDetours: 0 },
  { score: 27, tolerance: 4, boxes: 1, size: 6, maxPaths: 24, minTurns: 2, minDetours: 0 },
  // ブロック 2（07-12）: 箱が増える。回り込みを求め始める
  { score: 16, tolerance: 4, boxes: 1, size: 6, maxPaths: 60, minTurns: 1, minDetours: 0 },
  { score: 20, tolerance: 4, boxes: 1, size: 6, maxPaths: 40, minTurns: 2, minDetours: 0 },
  { score: 23, tolerance: 4, boxes: 2, size: 6, maxPaths: 40, minTurns: 2, minDetours: 0 },
  { score: 26, tolerance: 4, boxes: 2, size: 6, maxPaths: 30, minTurns: 2, minDetours: 0 },
  { score: 29, tolerance: 4, boxes: 2, size: 7, maxPaths: 24, minTurns: 3, minDetours: 0 },
  { score: 32, tolerance: 4, boxes: 2, size: 7, maxPaths: 20, minTurns: 3, minDetours: 0 },
  // ブロック 3（13-18）: 遠回りを覚える
  { score: 20, tolerance: 4, boxes: 2, size: 6, maxPaths: 40, minTurns: 2, minDetours: 0 },
  { score: 24, tolerance: 4, boxes: 2, size: 6, maxPaths: 30, minTurns: 3, minDetours: 0 },
  { score: 27, tolerance: 4, boxes: 2, size: 7, maxPaths: 24, minTurns: 3, minDetours: 0 },
  { score: 30, tolerance: 4, boxes: 2, size: 7, maxPaths: 20, minTurns: 4, minDetours: 0 },
  { score: 34, tolerance: 4, boxes: 2, size: 7, maxPaths: 16, minTurns: 4, minDetours: 1 },
  { score: 38, tolerance: 5, boxes: 2, size: 7, maxPaths: 12, minTurns: 5, minDetours: 1 },
  // ブロック 4（19-24）: 箱 3 個へ
  { score: 24, tolerance: 4, boxes: 2, size: 6, maxPaths: 30, minTurns: 3, minDetours: 0 },
  { score: 28, tolerance: 4, boxes: 2, size: 7, maxPaths: 24, minTurns: 4, minDetours: 0 },
  { score: 32, tolerance: 4, boxes: 3, size: 7, maxPaths: 24, minTurns: 4, minDetours: 0 },
  { score: 36, tolerance: 4, boxes: 3, size: 7, maxPaths: 20, minTurns: 5, minDetours: 1 },
  { score: 40, tolerance: 5, boxes: 3, size: 7, maxPaths: 16, minTurns: 5, minDetours: 1 },
  { score: 44, tolerance: 5, boxes: 3, size: 7, maxPaths: 12, minTurns: 6, minDetours: 1 },
  // ブロック 5（25-30）: 最後の 6 面。
  // 仕掛けの縛りは点数を押し上げるので、点数の帯と噛み合う範囲に留める。
  // 向きを 5 回変えると、それだけで点数が 12.5 上がる
  { score: 28, tolerance: 4, boxes: 3, size: 7, maxPaths: 24, minTurns: 3, minDetours: 0 },
  { score: 32, tolerance: 4, boxes: 3, size: 7, maxPaths: 20, minTurns: 4, minDetours: 0 },
  { score: 36, tolerance: 4, boxes: 3, size: 7, maxPaths: 16, minTurns: 4, minDetours: 1 },
  { score: 41, tolerance: 5, boxes: 3, size: 7, maxPaths: 14, minTurns: 5, minDetours: 1 },
  { score: 45, tolerance: 6, boxes: 3, size: 7, maxPaths: 12, minTurns: 5, minDetours: 1 },
  { score: 49, tolerance: 7, boxes: 3, size: 7, maxPaths: 12, minTurns: 5, minDetours: 1 },
]

/** 面が何ブロック目か（1 始まり） */
export function blockOf(index: number): number {
  return Math.floor((index - 1) / 6) + 1
}

/**
 * 面 01-06 では、箱を一方向に押すだけの面も許す。
 * 「まず押す」を覚えてもらう場所なので、回り込みを求めない。
 */
export function allowsSingleDirection(index: number): boolean {
  return blockOf(index) === 1
}
