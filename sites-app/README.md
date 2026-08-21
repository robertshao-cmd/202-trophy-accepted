# 202 Trophy Accepted｜Production App

KAHOOT × DETECTIVE × INVOICE 的正式 Cloudflare Worker 專案，包含多人房間 API、九題三幕流程與漫畫偵探 UI。

- 正式網址：<https://202-trophy-accepted.robert-shao.workers.dev/detective.html>
- 正式環境預設無動畫；不需要加 `?test=1`。

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
- `app/api/detective/rooms/**`：房間建立、加入、作答與主持控制。
- `lib/game.ts`：九題題庫、計分與 edge-memory 房間狀態。
- `worker/index.ts`：Cloudflare Worker 入口。
- `tests/rendered-html.test.mjs`：正式 build、API 與無動畫來源驗證。
