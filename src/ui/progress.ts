/**
 * どこまでクリアしたかを端末に覚えさせる。
 * 保存できない環境（プライベートモードなど）でも遊べるよう、失敗しても黙って続ける。
 */

const STORAGE_KEY = 'boxpush:progress'

export type Progress = {
  /** クリア済みの面番号 */
  readonly cleared: ReadonlySet<number>
  /** 次に開く面 */
  readonly current: number
}

export function loadProgress(levelCount: number): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cleared: new Set(), current: 1 }
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return { cleared: new Set(), current: 1 }

    const { cleared, current } = data as { cleared?: unknown; current?: unknown }
    const clearedSet = new Set(
      Array.isArray(cleared)
        ? cleared.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= levelCount)
        : [],
    )
    const currentLevel =
      typeof current === 'number' && current >= 1 && current <= levelCount ? current : 1
    return { cleared: clearedSet, current: currentLevel }
  } catch {
    return { cleared: new Set(), current: 1 }
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cleared: [...progress.cleared], current: progress.current }),
    )
  } catch {
    // 保存できなくてもその回は遊べる
  }
}

/** その面を開けるか。クリア済みの次の面までは開く */
export function isUnlocked(progress: Progress, index: number): boolean {
  if (index === 1) return true
  return progress.cleared.has(index - 1) || progress.cleared.has(index)
}
