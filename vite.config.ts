// vitest の設定を同じファイルに書くため、vite ではなく vitest/config から読む
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages では https://<user>.github.io/boxpush/ に置かれるため、
  // 資産の参照をこのパス起点にする
  base: '/boxpush/',
  build: {
    target: 'es2022',
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
