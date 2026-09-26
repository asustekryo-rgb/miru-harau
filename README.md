# 視る者、祓う者

二台のスマホで遊ぶ、2人協力の3D除霊ホラーです。ブラウザで開くだけで動きます（インストール不要）。

**プレイ：https://asustekryo-rgb.github.io/miru-harau/**

- **指示役**：霊が見えるが、戦えない。「印」と合図で相棒を導く
- **除霊役**：霊が見えない。気配（囁き・振動・画面ノイズ）と相棒の声を頼りに、木刀で祓う

## 遊び方

1. 二台のスマホを同じWi-Fi（またはどちらかのテザリング）につなぐ
2. 片方で「部屋を作る」→ QRが表示される
3. もう片方で「部屋に入る」→ ホストのQRを読み取る → 応答のQRが表示される
4. ホスト側で「相手のQRを読み取る」→ 接続完了
5. ロビーで役割を決めて「開始」

ステージは「廃屋敷」「廃校」「廃病院」の3つ。御札を3枚集めて封印を解き、主を祓って、夜明け（15分）までに二人で出口から脱出する。
詳しいルールはゲーム内の「遊び方」を参照してください。

## 動かし方

ES Modules とカメラを使うため、**HTTPS で配信する必要があります**（`file://` では動きません）。

- スマホで遊ぶ：GitHub Pages などの HTTPS ホスティングに、このフォルダをそのまま置く。一度開けば Service Worker がキャッシュするので、以後はインターネットがなくてもローカル通信だけで遊べます
- PCで開発・確認する：`powershell -ExecutionPolicy Bypass -File serve.ps1` を実行して `http://localhost:8080/` を開く
  - 「ひとりで練習」：相棒なしで片方の役を試せます
  - 「同じ端末でテスト」：同じブラウザの2タブを BroadcastChannel でつないで、2人プレイを試せます

## 構成

| ファイル | 内容 |
|---|---|
| `js/main.js` | 画面遷移、接続フロー、メインループ |
| `js/game.js` | 1プレイ分の描画・入力・同期・HUD |
| `js/sim.js` | ホスト権威のシミュレーション（霊AI、当たり判定、アイテム、勝敗） |
| `js/map.js` | 屋敷のマップ、当たり判定、視線、経路探索 |
| `js/world.js` | 屋敷の3Dモデルと役割ごとのライティング |
| `js/entities.js` | 霊・プレイヤー・木刀・印・パーティクル |
| `js/net.js` | WebRTC DataChannel、QRでのシグナリング、2タブテスト用の通信 |
| `js/audio.js` | WebAudioで合成する効果音と立体音響 |
| `js/input.js` | 仮想スティック、ボタン、キーボード |
| `js/textures.js` | Canvasで描くテクスチャ |

通信はホスト権威方式です。霊・ダメージ・進行はホストが決め、20Hzでスナップショットを送ります。各プレイヤーの位置は、それぞれの端末から送ります。

## 既知の制限

- iOS Safari は振動（Vibration API）に対応していないため、iPhoneでは振動の代わりに画面表示だけになります。マナーモード中は音も出ません
- 接続が切れたら部屋を作り直す必要があります（自動再接続はありません）
- 一部のルーター（APアイソレーションが有効な公衆Wi-Fiなど）では端末同士がつながりません。その場合はテザリングを使ってください

## 霊の3Dモデルの作り直し

`assets/models/ghost.glb` は元モデル（約20万三角形・8.6MB）を軽量化したものです（約1.6万三角形・0.8MB）。
元モデルを `assets/src/ghost_src.glb` に置き、`serve.ps1` を起動して `http://localhost:8080/tools/optimize-model.html` を開くと作り直せます（`?tris=20000&tex=2048` で調整可）。
`tools/preview-model.html` で向きと顔の位置を確認できます。

## クレジット

- 3Dモデル: [“Horror Ghost Character - Blood Stained Spirit”](https://sketchfab.com/3d-models/horror-ghost-character-blood-stained-spirit-ed1a90be19404450935720f7abaae471) by [adhamasalah](https://sketchfab.com/adhamAsalah) — [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
  - 改変: ポリゴン数の削減、テクスチャの縮小、原点と大きさの調整。ゲーム内ではシェーダーで変形・発光・消滅の表現を加えています
- [three.js](https://threejs.org/)（MIT）、[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（MIT）、[jsQR](https://github.com/cozmo/jsQR)（Apache-2.0）、[meshoptimizer](https://github.com/zeux/meshoptimizer)（MIT）
