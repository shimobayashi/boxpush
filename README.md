# BOXPUSH

指でなぞって箱を穴に運ぶ、短時間で遊べる箱押しパズル。全 18 面。

遊ぶ: https://shimobayashi.github.io/boxpush/

## 遊び方

- 盤面を指でなぞると、なぞった分だけ人が歩く。指を離さずに向きを変えれば続けて進める
- パソコンでは矢印キーか WASD
- 箱は押すだけで引けない。全部の箱を穴に乗せるとクリア
- 上の帯のボタンで、音の入切・一手戻る・最初からやり直す・面を選ぶ

進んだところは端末に保存される。

## 開発

```sh
npm install
npm run dev       # 開発中の表示
npm test          # 盤面と面データの検査
npm run test:e2e  # ブラウザで実際に遊んで、操作の受け付けを検査
npm run build     # 公開する形に固める
npm run gen       # 面を作り直して levels.txt を書き出す
```

`test:e2e` は初回だけ `npx playwright install chromium` が要る。

main に push すると GitHub Actions が両方の検査を回し、通れば GitHub Pages に公開する。

## 面を足す

面は `levels.txt` に記号で書く。

```
; 31 あたらしい面
; text: 盤面の下に出る一言（省いてよい）
#######
#  .  #
# $   #
#  @  #
#######
```

`#` 壁 / 空白 床 / `@` 人 / `$` 箱 / `.` 穴 / `*` 穴の上の箱 / `+` 穴の上の人。
空行で面を区切る。

足したら `npm test` を通す。解けること、難易度が目標どおりであることを検査している。
面 01・02・04 の形は `e2e/play.spec.ts` が前提にしているので、作り直したらそちらも見る。

仕様と、そう決めた理由は [docs/design.md](docs/design.md) にある。
面の作り方と難しさの測り方は [docs/levels.md](docs/levels.md)、演出は [docs/effects.md](docs/effects.md)。

## ライセンス

MIT
