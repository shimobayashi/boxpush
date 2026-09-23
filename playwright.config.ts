/**
 * 遊んでみないと分からない層の検査。
 *
 * 報告された不具合はどれも「盤面は正しいのに、操作の受け付けが間違っている」もので、
 * vitest の検査（core / solver / 入力の溜め方）は全部通ったまますり抜けた。
 * ここは実際にブラウザで遊んで、そのすり抜けを塞ぐ。
 */

import { defineConfig } from '@playwright/test'

const BASE = 'http://localhost:4173/boxpush/'

export default defineConfig({
  testDir: './e2e',
  // どこまで進んだかを localStorage に持つので、並べて走らせると取り合う
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: BASE,
    browserName: 'chromium',
  },
  webServer: {
    // 公開するものと同じ形で確かめる
    command: 'npm run build && npm run preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
  },
})
