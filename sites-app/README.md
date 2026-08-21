# 202 Trophy Accepted｜Production App

KAHOOT × DETECTIVE × INVOICE 的正式 Cloudflare Worker 專案，包含多人房間 API、Michelle 的案件包三幕流程、Rebecca 的攝影片頭與漫畫偵探 UI。

- 正式網址：<https://202-trophy-accepted.robert-shao.workers.dev/detective.html>
- 正式首頁預設播放 Rebecca 的 23 秒完整攝影片頭；房號加入不會重播。
- 自測時使用 `?test=1` 或 `?motion=off` 關閉動畫；使用 `?intro=0` 只略過片頭。

## Team ownership

- Robert：team lead、整體整合與交付。
- Michelle：產品流程與遊戲邏輯優化。
- Rebecca：開場體驗與 UI/UX。

## Local development

```powershell
npm ci
npm run dev
```

## Validation

```powershell
npm test
```

## Architecture

- `public/detective.*`：主持人與玩家介面。
- `public/intro.*` 與 `public/intro-assets/*`：Rebecca 開場的隔離式 pre-game layer 與 GitLab 原始照片，不改房間狀態。
- `public/home-detective.png`：首頁主辦警探真人主視覺。
- `app/api/detective/rooms/**`：房間建立、加入、作答與主持控制。
- `lib/cases.json`：由真實發票編譯而成的案件包（敏感資訊依展示規則遮蔽）。
- `lib/game.ts`：三幕流程、Jira 卡司頭像、計分與 edge-memory 房間狀態。
- `worker/index.ts`：Cloudflare Worker 入口。
- `tests/rendered-html.test.mjs`：正式 build、三幕 API、資料防洩漏與視覺資產驗證。
