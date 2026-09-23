/**
 * 面ごとの難しさの目標。docs/design.md の「難易度の設計」の表そのもの。
 *
 * 18 面を 6 面ずつ 3 ブロックに分け、ブロックの中で上げて、次のブロックの頭で落とす。
 * 谷も山も後ろほど上がる。
 *
 * 生成スクリプトはこの値を狙って面を作り、テストは levels.txt がこの値どおりかを見る。
 * 二重に書くとずれるので、両方がここを読む。
 */

export type Target = {
  /** 難しさの点数。src/solver/analyze.ts が出す score */
  readonly score: number
  /** 点数がこの幅に収まっていればよい */
  readonly tolerance: number
  readonly boxes: number
  /** 盤面の一辺。外周の壁を含む */
  readonly size: number
  /**
   * 問題の分解の下限。
   * 箱を 2 組に分けて「片方を片付けてからもう片方」で解けると 0 になる。
   * 人の感じる難しさといちばん相関が強いので、後半ほど大きく求める。
   */
  readonly minDecomposition: number
  /** 押す箱を変える回数の下限 */
  readonly minBoxChanges: number
}

export const TARGETS: readonly Target[] = [
  // ブロック 1（01-06）: 押すことを覚える。絡みは求めない
  { score: 10, tolerance: 4, boxes: 1, size: 5, minDecomposition: 0, minBoxChanges: 0 },
  { score: 14, tolerance: 4, boxes: 1, size: 6, minDecomposition: 0, minBoxChanges: 0 },
  { score: 18, tolerance: 4, boxes: 2, size: 6, minDecomposition: 0, minBoxChanges: 1 },
  { score: 23, tolerance: 4, boxes: 2, size: 6, minDecomposition: 0, minBoxChanges: 2 },
  { score: 28, tolerance: 5, boxes: 2, size: 6, minDecomposition: 1, minBoxChanges: 2 },
  { score: 33, tolerance: 5, boxes: 2, size: 7, minDecomposition: 1, minBoxChanges: 3 },
  // ブロック 2（07-12）: 箱が増え、行き来が要る
  { score: 24, tolerance: 4, boxes: 2, size: 6, minDecomposition: 0, minBoxChanges: 2 },
  { score: 30, tolerance: 5, boxes: 3, size: 7, minDecomposition: 1, minBoxChanges: 2 },
  { score: 36, tolerance: 5, boxes: 3, size: 7, minDecomposition: 1, minBoxChanges: 3 },
  { score: 42, tolerance: 5, boxes: 3, size: 7, minDecomposition: 2, minBoxChanges: 4 },
  { score: 48, tolerance: 6, boxes: 3, size: 7, minDecomposition: 2, minBoxChanges: 4 },
  { score: 54, tolerance: 6, boxes: 3, size: 8, minDecomposition: 3, minBoxChanges: 5 },
  // ブロック 3（13-18）: じっくり考える面。
  // 箱 4 個は測るのが重く、条件に合う面もなかなか出ないので、最後の 2 面だけに絞る
  { score: 40, tolerance: 5, boxes: 3, size: 7, minDecomposition: 2, minBoxChanges: 3 },
  { score: 46, tolerance: 6, boxes: 3, size: 7, minDecomposition: 2, minBoxChanges: 4 },
  { score: 52, tolerance: 6, boxes: 3, size: 7, minDecomposition: 3, minBoxChanges: 5 },
  { score: 58, tolerance: 7, boxes: 3, size: 8, minDecomposition: 3, minBoxChanges: 5 },
  { score: 64, tolerance: 9, boxes: 4, size: 7, minDecomposition: 3, minBoxChanges: 6 },
  { score: 72, tolerance: 12, boxes: 4, size: 8, minDecomposition: 3, minBoxChanges: 7 },
]

/** 面が何ブロック目か（1 始まり） */
export function blockOf(index: number): number {
  return Math.floor((index - 1) / 6) + 1
}

/**
 * 面 01-02 では、箱を一方向に押すだけの面も許す。
 * 「まず押す」を覚えてもらう場所なので、回り込みを求めない。
 */
export function allowsSingleDirection(index: number): boolean {
  return index <= 2
}
