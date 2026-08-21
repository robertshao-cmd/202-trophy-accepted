# 發票腦洞實驗室

一套給單日內部 Hackathon 使用的可操作產品驗證工具。九個發票資料產品共用同一份固定匿名資料、互動 Shell、回饋量表與 Evidence Dashboard；原始排名保留，但不當作已驗證結論。

## Team

- **Robert — Team Lead**：整合產品方向、組織工作與最終交付。
- **Michelle — Process & Logic**：負責使用流程、遊戲邏輯與資料推論結構。
- **Rebecca — UI/UX**：負責介面、互動體驗與視覺設計。

## 直接使用

網站目前由本機服務提供：

- Gallery：<http://localhost:4173/#/gallery>
- Validation Brief：<http://localhost:4173/#/brief>
- Productization Blueprint：<http://localhost:4173/#/next-stage>
- Evidence Dashboard：<http://localhost:4173/#/dashboard>

若服務未啟動，在此資料夾執行：

```powershell
node server.mjs
```

測試：

```powershell
node --test
```

## 九項獨立 Demo URL

1. `#/demo/recall` 商品召回雷達
2. `#/demo/price` 買貴了嗎？價格刺客
3. `#/demo/stock` 囤貨鬼打牆
4. `#/demo/detective` 發票推理局：這是誰？誰在說謊？（合併 ORIGINAL RANK #4＋#5）
   - 舊網址 `#/demo/truth` 會自動開啟相同合併版。
6. `#/demo/taste` 味覺 DNA／飲食鬼格
7. `#/demo/trend` 期間限定跟風雷達
8. `#/demo/rare` 辦公室發票稀有種
9. `#/demo/warranty` 保固／退貨救援鬼
10. `#/demo/fridge` 冰箱今晚救援

## 驗證與資料誠信

- 所有發票、商家、品項、召回事件與 33 人群體值皆為虛構、固定、可重現的 `DEMO-01` 資料。
- 未串登入、真實載具、付款、推播、外部 API 或 AI 服務。
- 回饋與事件只存在瀏覽器 localStorage；儀表板可匯出 JSON／CSV。
- 每個結論都附推論依據、資料缺口與正式化依賴。
- 至少 5 份回饋且全部決策門檻通過前，不顯示 Build。

## 主要檔案

- `VALIDATION_BRIEF.md`：Problem Brief、Assumption/Risk Map、RICE、Decision Brief、Vertical Slice。
- `NEXT_STAGE_PRD.md`：九項產品的獨立設計原型、PRD Lite、成功指標、工程切片與進入條件。
- `public/data/lab-data.json`：九項 Demo 共用固定資料。
- `public/app.js`：路由、九項狀態機、事件、回饋、儀表板、分享與匯出。
- `public/styles.css`：發票載具色系、桌機／手機元件與可及性。
- `QA_REPORT.md`：自動測試與瀏覽器 UAT 結果。
