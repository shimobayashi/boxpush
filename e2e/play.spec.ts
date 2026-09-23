/**
 * 実際に遊んで、操作の受け付けが正しいかを見る。
 *
 * ここにある検査はどれも、報告された不具合をそのまま再現したもの。
 * 盤面の規則（core）と入力の溜め方（ui/input）は vitest が見ているので、
 * ここが見るのは main.ts の繋ぎ目、つまり「いつ入力を受けて、いつ切るか」だけ。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 1 歩を描き切る時間（STEP_SECONDS）より少し長く待つ。溜めた歩は 1 フレームに 1 つずつ出る */
const STEP_WAIT = 140

async function moves(page: Page): Promise<string> {
  return (await page.locator('#move-label').textContent()) ?? ''
}

async function levelName(page: Page): Promise<string> {
  return (await page.locator('#level-label').textContent()) ?? ''
}

/** 1 歩ずつ、描き切るのを待ちながら押す */
async function walk(page: Page, keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key)
    await page.waitForTimeout(STEP_WAIT)
  }
}

/** 盤面のマス 1 つぶんの大きさ。盤面は使える幅と高さの小さい方に合わせて正方形に収まる */
async function cellSize(page: Page, columns: number, rows: number): Promise<number> {
  const box = await page.locator('#board').boundingBox()
  if (!box) throw new Error('盤面が見つからない')
  return Math.min(box.width / columns, box.height / rows)
}

/** 盤面の真ん中。なぞり始める場所として使う */
async function boardCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#board').boundingBox()
  if (!box) throw new Error('盤面が見つからない')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** 面 01 を最初から始める */
async function startFresh(page: Page): Promise<void> {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('#level-label')).toHaveText('面 01')
}

/** 途中の面から始める。そこまではクリア済みということにする */
async function openLevel(page: Page, index: number): Promise<void> {
  await page.goto('./')
  await page.evaluate((n) => {
    const cleared = Array.from({ length: n - 1 }, (_, i) => i + 1)
    localStorage.setItem('boxpush:progress', JSON.stringify({ cleared, current: n }))
  }, index)
  await page.reload()
  await expect(page.locator('#level-label')).toHaveText(`面 ${String(index).padStart(2, '0')}`)
}

/**
 * ここにある検査は、面 01・02・04 がこの形であることを前提にしている。
 * 面を作り直して形が変わったら、まず下の「面データが変わっていない」が落ちる。
 */
const GRIDS: Record<number, string[]> = {
  1: ['#####', '#  .#', '#@$ #', '#   #', '#####'],
  2: ['######', '# #@ #', '# $  #', '#    #', '#.#  #', '######'],
  4: ['######', '# .  #', '# $  #', '#@$  #', '#  . #', '######'],
}

test('面データが変わっていない', () => {
  const text = readFileSync(join(ROOT, 'levels.txt'), 'utf8')
  for (const [index, grid] of Object.entries(GRIDS)) {
    expect(text, `面 ${index}`).toContain(grid.join('\n'))
  }
})

test.describe('操作の受け付け', () => {
  test('面をクリアすると、ボタンを押さなくても次の面へ進む', async ({ page }) => {
    await startFresh(page)
    await walk(page, ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp'])

    await expect(page.locator('#level-label')).toHaveText('面 02', { timeout: 5000 })
    expect(await moves(page)).toBe('0 手')
  })

  test('最後の箱を溜めている間とクリア演出の間は、押しても動かない', async ({ page }) => {
    await startFresh(page)
    await walk(page, ['ArrowRight', 'ArrowDown', 'ArrowRight'])

    // 最後の 1 手。ここから爆発までの約 0.8 秒と、クリア演出の 1.5 秒は受け付けない
    await page.keyboard.press('ArrowUp')

    // 溜めている間に戻せてしまうと、入ったばかりの箱を穴から出したまま演出だけ進む。
    // toBeDisabled は条件が満たされるまで待つので、演出が終わってからでも通ってしまう。
    // 「今この瞬間どうか」を見たいので、その場で読む
    await page.waitForTimeout(200)
    expect(await page.locator('#undo-button').isDisabled()).toBe(true)
    expect(await page.locator('#reset-button').isDisabled()).toBe(true)

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(60)
    }

    // 押した分が溜まっていれば、次の面が始まったとたんに歩き出す
    await expect(page.locator('#level-label')).toHaveText('面 02', { timeout: 5000 })
    await page.waitForTimeout(STEP_WAIT * 3)
    expect(await moves(page)).toBe('0 手')
  })

  test('面選択を開いている間は盤面が動かず、閉じれば動く', async ({ page }) => {
    await startFresh(page)
    await walk(page, ['ArrowRight'])
    expect(await moves(page)).toBe('1 手')

    await page.locator('#menu-button').click()
    await expect(page.locator('#level-select')).toBeVisible()
    await walk(page, ['ArrowDown', 'ArrowDown', 'ArrowDown'])
    expect(await moves(page)).toBe('1 手')
    expect(await levelName(page)).toBe('面 01')

    await page.locator('#level-select .close').click()
    await expect(page.locator('#level-select')).toBeHidden()
    // 受け付けを戻すのは次のフレームなので、1 フレーム分だけ待ってから押す
    await page.waitForTimeout(STEP_WAIT)
    await walk(page, ['ArrowDown'])
    expect(await moves(page)).toBe('2 手')
  })

  test('クリア演出の途中で面選択を開いても、裏で面が変わらない', async ({ page }) => {
    await startFresh(page)
    await walk(page, ['ArrowRight', 'ArrowDown', 'ArrowRight'])

    // クリア演出は 1.5 秒。その間に開く
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(300)
    await page.locator('#menu-button').click()
    await expect(page.locator('#level-select')).toBeVisible()

    // 演出が終わる時間を過ぎても、開いている間は次へ送らない。
    // 送ってしまうと、選択画面が指している「今ここ」と実際の面がずれる
    await page.waitForTimeout(2500)
    expect(await levelName(page)).toBe('面 01')
    await expect(page.locator('#level-grid button.current')).toHaveText('1')
  })

  test('指と人は同じだけ動く。2 マス分なぞれば 2 歩', async ({ page }) => {
    // 面 02 は人の下に 2 マス以上の空きがある
    await openLevel(page, 2)
    const cell = await cellSize(page, 6, 6)
    const start = await boardCenter(page)

    // 1 回の pointermove に 2 マス分を乗せる。まとめて流し込まれないことも同時に見る
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x, start.y + cell * 2)
    await page.waitForTimeout(STEP_WAIT * 3)
    await page.mouse.up()

    expect(await moves(page)).toBe('2 手')
  })

  test('1 歩を描いている間に届いたキーの繰り返しは捨てる', async ({ page }) => {
    await startFresh(page)

    // OS のキーの繰り返しは 1 歩を描く速さより速いことがある。
    // そのまま受けると、目で追えない速さで盤面だけ進む
    await page.evaluate(() => {
      const fire = (repeat: boolean) =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat }))
      fire(false)
      for (let i = 0; i < 10; i++) fire(true)
    })
    await page.waitForTimeout(STEP_WAIT * 3)

    expect(await moves(page)).toBe('1 手')
  })

  test('やり直すと手数が 0 に戻り、面は変わらない', async ({ page }) => {
    await startFresh(page)
    await walk(page, ['ArrowRight', 'ArrowDown'])
    expect(await moves(page)).toBe('2 手')

    await page.locator('#reset-button').click()
    expect(await moves(page)).toBe('0 手')
    expect(await levelName(page)).toBe('面 01')
    expect(await page.locator('#level-text').textContent()).toBe('指でなぞって動かす')
  })
})

test.describe('箱が穴に入った瞬間', () => {
  test('箱が入ったら、同じなぞりの続きは効かない', async ({ page }) => {
    // 面 04 は「まだ残りがあるのに 1 つ入る」瞬間を作れる形をしている
    await openLevel(page, 4)

    const cell = await cellSize(page, 6, 6)
    const start = await boardCenter(page)

    // 指を離さずに 右 → 上 → 右。2 歩目で箱が穴に入る。
    // 入った時点で残りを捨てるので、3 歩目は効かない
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + cell, start.y)
    await page.mouse.move(start.x + cell, start.y - cell)
    await page.mouse.move(start.x + cell * 2, start.y - cell)
    await page.waitForTimeout(STEP_WAIT * 4)
    await page.mouse.up()

    expect(await moves(page)).toBe('2 手')
    expect(await page.locator('#remaining-label').textContent()).toBe('あと 1')
  })
})
