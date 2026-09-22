/**
 * 面ごとの難易度の目標。docs/design.md の「難易度の設計」の表そのもの。
 *
 * 30 面を 6 面ずつ 5 ブロックに分け、ブロックの中で上げて、次のブロックの頭で落とす。
 * 谷は 2 → 3 → 4 → 5 → 6、山は 5 → 7 → 9 → 11 → 12 と、どちらも後ろほど上がる。
 *
 * 生成スクリプトはこの値を狙って面を作り、テストは levels.txt がこの値どおりかを見る。
 * 二重に書くとずれるので、両方がここを読む。
 */

export type Target = {
  /** 最小押し回数 */
  readonly pushes: number
  readonly boxes: number
  /** 盤面の一辺。外周の壁を含む */
  readonly size: number
}

export const TARGETS: readonly Target[] = [
  // ブロック 1（01-06）: 押すことを覚える
  { pushes: 2, boxes: 1, size: 5 },
  { pushes: 3, boxes: 1, size: 6 },
  { pushes: 3, boxes: 1, size: 6 },
  { pushes: 4, boxes: 1, size: 6 },
  { pushes: 4, boxes: 1, size: 6 },
  { pushes: 5, boxes: 1, size: 6 },
  // ブロック 2（07-12）: 箱が増える
  { pushes: 3, boxes: 1, size: 6 },
  { pushes: 4, boxes: 1, size: 6 },
  { pushes: 5, boxes: 2, size: 6 },
  { pushes: 5, boxes: 2, size: 6 },
  { pushes: 6, boxes: 2, size: 7 },
  { pushes: 7, boxes: 2, size: 7 },
  // ブロック 3（13-18）: 回り込んで押す
  { pushes: 4, boxes: 2, size: 6 },
  { pushes: 5, boxes: 2, size: 6 },
  { pushes: 6, boxes: 2, size: 7 },
  { pushes: 7, boxes: 2, size: 7 },
  { pushes: 8, boxes: 2, size: 7 },
  { pushes: 9, boxes: 2, size: 7 },
  // ブロック 4（19-24）: 箱 3 個へ
  { pushes: 5, boxes: 2, size: 6 },
  { pushes: 6, boxes: 2, size: 7 },
  { pushes: 7, boxes: 3, size: 7 },
  { pushes: 8, boxes: 3, size: 7 },
  { pushes: 9, boxes: 3, size: 7 },
  { pushes: 11, boxes: 3, size: 7 },
  // ブロック 5（25-30）: 最後の 6 面
  { pushes: 6, boxes: 3, size: 7 },
  { pushes: 7, boxes: 3, size: 7 },
  { pushes: 8, boxes: 3, size: 7 },
  { pushes: 9, boxes: 3, size: 7 },
  { pushes: 10, boxes: 3, size: 7 },
  { pushes: 12, boxes: 3, size: 7 },
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
