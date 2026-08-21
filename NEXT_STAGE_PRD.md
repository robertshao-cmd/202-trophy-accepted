# PRD Lite：發票腦洞實驗室 Stage 4.5

> 2026-08-21 更新：ORIGINAL RANK #4「發票推理局」與 #5「發票兩真一假」已合併為一個兩章五題產品，Portfolio 由十項收斂為九項。下方兩份原始 PRD Lite 保留作決策脈絡；實作以合併版 vertical slice 為準。

## Portfolio decision

Recommendation：**EVIDENCE FIRST — HIGH-FIDELITY VALIDATION**

十個概念都進入「高擬真可用性／價值驗證」，不是十個都進正式工程。這次投資在公平比較所需的設計品質、資料誠信與可量測閉環；真實 API、通知與資料管線只提供規格與 Spike，不先全面建置。

One thing that would change my mind：若單一概念取得至少 5 份有效樣本，完成率 ≥80%、理解／幫助 ≥4/5、信任 ≥3.5/5、使用意願 ≥60%，且資料與法規依賴可解，即可由 Evidence First 改為 Build。

## Problem

第一版已證明十項流程都能操作，但共用視覺語言太強，容易讓受測者覺得它們是同一個 AI Dashboard 的十張皮。這會污染價值理解與分享意願：召回需要壓力下的清楚，遊戲需要節奏，飲食需要個性，保固需要信任，不能用同一種表現方式。

## Target user

第一輪為 20–35 歲、高頻外食、已有足夠發票明細、熟悉 LINE／IG 分享、同時在意隱私與推論可信度的內部同事。此分群仍是假設，測試後才可外推。

## Success metric

- Portfolio：每個概念至少 5 份有效回饋；所有 Demo 可直接開啟、完成、重玩與匯出證據。
- Usability：核心價值在 30 秒內出現；任務完成率 ≥80%。
- Trust：平均信任 ≥3.5/5，且質性回饋能清楚指出資料缺口。
- Design discrimination：80% 受測者能用一句不同的話描述至少 8/10 個產品，不把它們混成同一套功能。

## In scope

- 十套獨立 art direction、內容階層與互動節奏。
- 十個 PRD Lite、垂直切片、成功指標與下一 Gate。
- 共用的資料確定性、證據展開、隱私、埋點、回饋與可及性。
- 響應式、高擬真 Demo、產品化藍圖與 Evidence Dashboard。

## Out of scope

- 不把十個概念同時接上正式 API 或排進正式 Roadmap。
- 不使用真實個資、支付、登入、推播或法律資格判定。
- 不以視覺喜好分數取代產品價值與信任證據。
- 不複製 Awwwards、Dribbble 或其他作品；只使用設計模式與方法。

## Design source strategy

- [Material Design 3](https://m3.material.io/)：安全、狀態、導覽、可及性與元件行為。
- [Awwwards](https://www.awwwards.com/)／[SiteInspire](https://www.siteinspire.com/)：art direction、版式與視覺節奏。
- [CodePen](https://codepen.io/)：可操作互動原型與遊戲節奏。
- [Dribbble](https://dribbble.com/)：App 資訊架構與行動裝置表現參考。
- [Brand New](https://www.underconsideration.com/brandnew/)：產品識別、語氣與視覺系統。

---

# Ten Product PRD Lites

## 1. 商品召回雷達

Problem：召回資訊分散，使用者不知道自己是否買過，也容易把「可能命中」誤認為「確定中標」。

Target user：希望避免食安／消費損失，且已有商品級發票明細的載具用戶。

Success metric：80% 使用者在 30 秒內分清可能與確認命中，並選對下一步。

Design archetype：**Safety Operations Console**。黑、白、警示紅與工業格線；結果先給風險層級、再給證據和處理。

Vertical slice：事件通知 → 個人發票比對 → 批號確認 → 已確認／誤判／已處理。

Data/API：權威召回事件、品名正規化、販售期間、通路、批號可得性。

Tests：可能／確認文案理解、誤判回報、事件來源缺失、無批號、事件撤回。

Next gate：完成權威資料來源與批號可得性 Spike。

Out of scope：疾病診斷、法律責任、無來源的媒體傳聞。

## 2. 買貴了嗎？價格刺客

Problem：不同包裝與促銷使使用者無法比較自己的真實單位價格。

Target user：有重複購買日用品／食品，且在意節省支出的用戶。

Success metric：70% 使用者能說出下次要改變的購買策略。

Design archetype：**Price Intelligence Tape**。深色行情終端、等寬數字、價差優先，不用裝飾性圖表。

Vertical slice：價格異常 → 同規格歷史 → 單位價解釋 → 下次購買策略。

Data/API：商品正規化、規格與數量解析、個人歷史價格；不依賴即時市場價。

Tests：同品異規格、買一送一、組合包、退款、無單位資訊。

Next gate：品名正規化與單位換算準確率達 95%。

Out of scope：宣稱全市場最低價、未授權的競品爬價。

## 3. 囤貨鬼打牆

Problem：使用者重複買日用品，卻無法接受系統把推估寫成庫存事實。

Target user：固定回購衛生紙、清潔劑、寵物用品等家庭消耗品的用戶。

Success metric：60% 願意校正；第二次推估比第一次更接近實際庫存。

Design archetype：**Household Inventory Shelf**。溫暖米色、可見的層架與物件感，讓抽象推估可被校正。

Vertical slice：重複購買 → 庫存猜測 → 一鍵校正 → 下次補貨提醒。

Data/API：重複品項、家庭消耗模型、校正結果與提醒偏好。

Tests：代購、家庭人數變更、大量促銷囤貨、停止提醒。

Next gate：先驗證三種高頻品類的消耗模型。

Out of scope：不經校正的全品類家庭庫存。

## 4. 發票推理局：這是誰？

Problem：法人登記名難辨識，造成發票回憶與分類挫折。

Target user：常看到陌生法人名、願意用短遊戲修正別名的用戶。

Success metric：三關完成率 ≥85%，揭曉後理解度 ≥4/5。

Design archetype：**Noir Evidence Board**。深色偵查板、紙張選項、每條線索可追溯。

Vertical slice：陌生法人名 → 時間／金額／品項線索 → 選擇 → 揭曉與別名修正。

Data/API：法人名、門市、品牌別名、使用者修正回饋。

Tests：同法人多品牌、百貨櫃位、外送平台、加盟店、未知商家。

Next gate：定義可維護、可回溯的商家別名模型。

Out of scope：只靠生成式 AI 猜商家而沒有資料來源。

## 5. 發票兩真一假

Problem：一般消費統計沒有參與感，使用者不會主動探索。

Target user：喜歡人格測驗、輕遊戲與朋友互相比較的用戶。

Success metric：五關完成率 ≥80%，重玩或分享意願 ≥40%。

Design archetype：**Game-show Statement Cards**。紫黃高對比、翻牌感、每回合即時揭曉。

Vertical slice：三張敘述卡 → 選假話 → 發票證據翻牌 → 五關結算。

Data/API：可解釋敘述模板、敏感類別排除、固定／動態題庫。

Tests：題目重複、無足夠資料、敏感消費、看似矛盾敘述。

Next gate：題目生成不得重複、歧義或洩漏敏感消費。

Out of scope：羞辱性或醫療／財務人格標籤。

## 6. 味覺 DNA／飲食鬼格

Problem：品類圖表很難形成自我理解；過度推論又會降低信任。

Target user：高頻外食、樂於分享有趣人設，但在意隱私的用戶。

Success metric：理解度 ≥4.2/5、分享點擊 ≥30%、信任 ≥3.5/5。

Design archetype：**Food Editorial Personality**。紙本飲食雜誌、襯線大標、有限色塊，不像 AI 診斷卡。

Vertical slice：飲食訊號 → 人格封面 → 特徵證據 → 隱私安全分享。

Data/API：料理類型、價位、重複度、冒險度；沒有交易時間時不得推論作息。

Tests：樣本過少、代購、跨月偏差、冒犯性名稱、敏感飲食。

Next gate：測試命名有趣但不冒犯，並完成敏感類別規則。

Out of scope：營養、健康、排便或疾病診斷。

## 7. 期間限定跟風雷達

Problem：使用者不知道自己何時加入熱潮，也看不懂群體曲線與個人點位的關係。

Target user：會購買期間商品、在意流行角色與社交話題的用戶。

Success metric：75% 能正確解釋個人購買點與熱潮峰值。

Design archetype：**Pop-culture Trend Terminal**。深靛、桃紅、薄荷綠與網格，像即時文化雷達。

Vertical slice：選趨勢 → 個人購買點 → 匿名群體曲線 → 跟風類型比較。

Data/API：期間商品字典、匿名群體曲線、最小樣本與時間窗。

Tests：樣本不足、跨區域、商品改名、熱潮多峰、首日缺資料。

Next gate：確認匿名基準、最小樣本與商品字典維護成本。

Out of scope：把示範曲線宣稱為市場趨勢。

## 8. 辦公室發票稀有種

Problem：異常消費可以好玩，也可能讓同事反推出個人與敏感資訊。

Target user：想在小團體產生安全話題，願意分享匿名結果的用戶。

Success metric：分享意願 ≥40%，隱私疑慮提及率 <10%。

Design archetype：**Natural-history Specimen Card**。博物學標本、雙線框、紙張紋理與收藏語氣。

Vertical slice：稀有度篩選 → 標本卡 → 匿名群體證據 → 安全分享。

Data/API：匿名同群基準、k-anonymity、敏感類別與不可回推規則。

Tests：群體過小、唯一值、敏感品類、日期／金額組合可回推。

Next gate：完成隱私威脅模型與敏感類別 Review。

Out of scope：公開原始發票、猜出本人或建立辦公室排行榜。

## 9. 保固／退貨救援鬼

Problem：使用者忘記期限；系統若不標示規則確定性，容易造成權益誤導。

Target user：購買 3C、家電或可退換商品，願意用通知管理權益的用戶。

Success metric：70% 完成一筆狀態標記，通知授權 ≥50%。

Design archetype：**Document Wallet Timeline**。乾淨藍白、文件袋與時間線，確定性和截止日同層呈現。

Vertical slice：即將到期 → 規則確定性 → 狀態標記 → 申請資料清單。

Data/API：購買日、商品識別、商家／品牌規則、使用者狀態。

Tests：規則未知、跨境、無型號、退貨與保固不同、日期已過。

Next gate：商家規則來源與法律文案 Review。

Out of scope：保證退換資格或提供法律意見。

## 10. 冰箱今晚救援

Problem：發票知道買過，不知道吃完；推薦若跳過校正，會像不可信的 AI 猜測。

Target user：近期買過生鮮、想快速決定晚餐且不想重新輸入冰箱的用戶。

Success metric：60% 在 60 秒內選出一道願意做的料理。

Design archetype：**Kitchen Mise-en-place**。鼠尾草綠、奶油紙張、食材籤與手寫食譜卡。

Vertical slice：可能食材 → 一步校正 → 三道料理 → 缺料與保存提醒。

Data/API：食品品項、購買日、保存期提示、食譜必要食材。

Tests：已吃完、代購、過期、不完整品名、過敏與飲食限制。

Next gate：驗證保存期提示與一步校正是否足夠。

Out of scope：食品安全判定、營養醫療建議、無確認的冰箱全自動盤點。

---

# Execution Plan

## Dependency-ordered task graph

1. **Shared spine**：正規化資料契約 → 推論確定性 → 隱私分類 → 埋點與可及性。
2. **Utility lane**：價格 → 庫存 → 保固 → 冰箱；共用商品／日期能力。
3. **Risk lane**：召回事件來源與批號 Spike。
4. **Social lane**：推理／兩真一假 → 味覺／趨勢／稀有種；先建敏感內容與匿名基準。
5. **Commit gate**：用 Evidence Dashboard 選 2–3 個工程承諾，不以原始排名決定。

## Milestones

- M1 — Design discrimination：十個產品一眼可辨，所有流程仍可完成。
- M2 — User evidence：每項至少 5 份回饋，完成核心任務與質性訪談。
- M3 — Data spikes：只對證據領先者驗證正式資料來源與準確率。
- M4 — Engineering commit：通過門檻者才寫 Full PRD、排正式 Roadmap。

## UAT

- 直接 URL、瀏覽器返回／前進、上一個／下一個、Gallery 皆可用。
- 390px 與 1280px 無頁面水平溢位；鍵盤 focus 可見。
- 十個產品各有不同版式、色彩、字體語氣與結果呈現，不只是換主色。
- Demo 內所有推論可展開證據，限制不可藏在 tooltip。
- 回饋、事件、Dashboard 與 JSON／CSV 匯出不因主題改版失效。
- `prefers-reduced-motion` 下不依賴動畫傳達核心資訊。

## Open questions

- 33 位同事要全部自由玩，還是採拉丁方分派避免測試疲勞？建議每人主測 3 個、快速評 2 個。
- 第一輪是否有權使用商品級明細？若只有店家與金額，需先排除召回、價格與冰箱。
- 分享測試是在現場投影、LINE 群或匿名表單？不同情境會改變社交價值分數。
