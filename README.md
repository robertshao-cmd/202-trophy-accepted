# KAHOOT × DETECTIVE × INVOICE｜誰是犯人？

「202 獎盃失竊案」多人發票推理遊戲。玩家透過九題三幕，從模糊發票、兩真一假口供與消費行動線中找出虛構案件的犯人。

這個 repository 只保留目前正式開發中的產品；先前的發票腦洞實驗室與其他 Demo 已移除。

## 正式網址

- 正式多人版（預設無動畫）：<https://202-trophy-accepted.robert-shao.workers.dev/detective.html>
- 五分鐘簡報模式：<https://202-trophy-accepted.robert-shao.workers.dev/detective.html?demo=1>
- 無動畫測試模式：<https://202-trophy-accepted.robert-shao.workers.dev/detective.html?test=1>

所有非 localhost 的部署環境會自動關閉 animation 與 transition；正式網址不需要額外參數。

## Team

- **Robert — Team Lead**：整合產品方向、組織工作與最終交付。
- **Michelle — Process & Logic**：負責三幕流程、遊戲邏輯與題庫結構。
- **Rebecca — UI/UX**：負責介面、互動體驗與視覺設計。

## 開發

正式產品位於 `sites-app/`：

```powershell
cd sites-app
npm ci
npm run dev
```

驗證：

```powershell
npm test
```

## 產品結構

- `sites-app/public/detective.html`：遊戲入口。
- `sites-app/public/detective.js`：主持人／玩家流程與無動畫模式。
- `sites-app/public/detective.css`：漫畫偵探 UI 與全站 motion control。
- `sites-app/app/api/detective/rooms/**`：多人房間 API。
- `sites-app/lib/game.ts`：九題題庫、計分與房間狀態。
- `sites-app/tests/`：正式 Worker、路由與無動畫來源驗證。
- `pregame-video/`：Seedance 開場腳本、Prompt 與 UI 參考。

## 資料說明

Jira 真實頭像與發票衍生線索已依團隊授權用於公開 Hackathon Demo。獎盃失竊、口供與犯人身分皆為遊戲虛構；完整發票號碼、地址與付款資訊不會顯示。
