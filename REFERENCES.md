# 發票推理局：UI／UX 參考與採用決策

來源書籤：`PM-Chrome-Bookmarks.html`。只保留能在一日黑客松直接轉成產品決策的參考。

## 立即採用

1. [Material Design 3](https://m3.material.io/)
   - 採用：清楚的卡片層級、狀態差異、手機觸控尺寸、可關閉動態效果。
   - 轉化：保留發票載具色彩 token，增加更有情緒的形狀、動態與對比，但不改變主流程。

2. [Pure CSS Ghost animation](https://codepen.io/gabriel-ortiz/pen/GRRwyzN)
   - 採用：漂浮、眨眼、陰影縮放三種低成本動態。
   - 轉化：做成一個通用 SVG 鬼體，三種人格只替換色彩、頭牌與手持物。

3. [Pure CSS ghost bustin' game](https://codepen.io/jh3y/pen/wYzWxz)
   - 採用：用 CSS variables 管理角色變體，以及「抓到鬼」的遊戲感。
   - 轉化：結果頁加入漫畫網點、判決印章、粗框卡片與揭曉動畫。

4. [Ghost Hunting App UI](https://dribbble.com/shots/26204920-Ghost-Hunting-App-UI)
   - 採用：角色是畫面主角，資料是 supporting content。
   - 轉化：結果頁先看鬼格，再看三項證據、NPC 指數與同事投票。

5. [InvoiceManager Design System](https://invoicemanager-screens-dev-j5nssatgwa-de.a.run.app/design-system.html)
   - 採用：Primary `#01AFA2`、Secondary `#FF9924`、Background `#F5F5F5`、文字 `#262626`。
   - 轉化：漫畫效果只做為活動皮膚，仍讓人一眼看出是發票載具產品。

6. [CSS Reveal animation](https://codepen.io/epaezrubio/pen/OoMGXR)
   - 採用：遮罩先蓋滿、再快速擦除的兩段式揭曉節奏。
   - 轉化：答案先以綠色證物遮罩擦出，收據延遲進場，製造「先判決、後看證據」的舞台感。

7. [Fast-Paced Quiz Game UI](https://dribbble.com/shots/25877882-Fast-Paced-Quiz-Game-UI)
   - 採用：倒數、選項與即時排行必須維持強烈但清楚的視覺層級。
   - 轉化：每個選項有固定色條、72px 以上手機觸控高度；前三名用 podium 標記，其他名次維持可掃讀列表。

8. [Awwwards — Active Waiting](https://www.awwwards.com/brainfood-mobile-performance-vol3.pdf)
   - 採用：等待不應只是被動 loading，要持續提供可理解的進度與下一步期待。
   - 轉化：大廳顯示開案門檻，答題頁顯示已作答人數與證詞 badge，封存後立即顯示不可反悔狀態。

## 暫不採用

- Product Hunt／BetaList：適合市場與定位研究，不會直接改善明天的現場體驗。
- SiteInspire／Muzli：靈感範圍太廣，容易造成視覺 scope creep。
- Brand New：適合完整品牌改版；本 Demo 只需要活動視覺皮膚，不應重做品牌。

## 通用鬼角色規則

- 永遠共用同一個輪廓、臉部比例、漂浮節奏與黑色漫畫線條。
- 人格差異只使用三個插槽：`body color`、`badge`、`prop`。
- 新增鬼格時不畫新角色，只新增一組變體設定。
- 任何動態都尊重 `prefers-reduced-motion`。
