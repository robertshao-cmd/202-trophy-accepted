const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const modalRoot = document.querySelector("#modal-root");

const STORAGE = {
  events: "invoice-lab-events-v1",
  feedback: "invoice-lab-feedback-v1",
  session: "invoice-lab-session-v1",
};

const ratingLabels = {
  understanding: "我理解這個功能的用途",
  helpfulness: "這對我有幫助",
  trust: "我相信這個結果",
  willingness: "我願意在發票載具中使用",
};

let lab;
const demoStates = new Map();
let toastTimer;

function readStore(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sessionId() {
  let id = sessionStorage.getItem(STORAGE.session);
  if (!id) {
    id = `LAB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(STORAGE.session, id);
  }
  return id;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "—";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
}

function getDemo(id) {
  if (id === "truth") return lab.demos.find((demo) => demo.id === "detective");
  return lab.demos.find((demo) => demo.id === id);
}

function originalRankLabel(demo) {
  return (demo.sourceRanks ?? [demo.rank]).map((rank) => `#${rank}`).join(" + ");
}

function initialState(demo) {
  const common = { step: 0, openedAt: Date.now(), startedAt: null, opened: false, firstSeen: false, completed: false, feedbackDone: false };
  if (demo.id === "detective") return { ...common, phase: "merchant", merchantRound: 0, truthRound: 0, merchantScore: 0, truthScore: 0, score: 0, streak: 0, bestStreak: 0, selected: null, revealed: false };
  if (demo.id === "fridge") return { ...common, ingredients: [...lab.ingredients], refreshes: 0 };
  if (demo.id === "rare") return { ...common, category: "全部", period: "全部", rarity: 60 };
  return common;
}

function stateFor(demo) {
  if (!demoStates.has(demo.id)) demoStates.set(demo.id, initialState(demo));
  return demoStates.get(demo.id);
}

function updateState(demo, patch, { focus = false } = {}) {
  const next = { ...stateFor(demo), ...patch };
  demoStates.set(demo.id, next);
  renderRoute({ focus });
  return next;
}

function elapsed(state) {
  return state.startedAt ? Math.max(0, Date.now() - state.startedAt) : 0;
}

function track(type, demo, state = stateFor(demo), extra = {}) {
  const events = readStore(STORAGE.events);
  events.push({
    event: type,
    concept_id: demo.id,
    rank: demo.rank,
    elapsed_ms: elapsed(state),
    step: String(state.step),
    result: extra.result ?? null,
    data_dependency: demo.dependency,
    session_id: sessionId(),
    at: new Date().toISOString(),
    ...extra,
  });
  writeStore(STORAGE.events, events.slice(-5000));
}

function startDemo(demo, patch = {}) {
  const state = stateFor(demo);
  const next = updateState(demo, { ...patch, step: 1, startedAt: Date.now() });
  track("demo_started", demo, next);
}

function markValue(demo, state, result) {
  if (!state.firstSeen) {
    state.firstSeen = true;
    track("first_value_seen", demo, state, { result });
  }
}

function markComplete(demo, state, result) {
  markValue(demo, state, result);
  if (!state.completed) {
    state.completed = true;
    track("demo_completed", demo, state, { result });
  }
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || "gallery";
  const parts = raw.split("/").filter(Boolean);
  return { page: parts[0] || "gallery", id: parts[1] || null };
}

function setActiveNav(page) {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === page));
}

function feedbackFor(id) {
  return readStore(STORAGE.feedback).filter((entry) => entry.concept_id === id);
}

function average(rows, key) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
}

function metricsFor(demo) {
  const events = readStore(STORAGE.events).filter((event) => event.concept_id === demo.id);
  const feedback = feedbackFor(demo.id);
  const unique = (type) => new Set(events.filter((event) => event.event === type).map((event) => event.session_id)).size;
  const opened = unique("demo_opened");
  const started = unique("demo_started");
  const completed = unique("demo_completed");
  const values = events.filter((event) => event.event === "first_value_seen").map((event) => event.elapsed_ms);
  const result = {
    opened,
    started,
    completed,
    startRate: opened ? started / opened * 100 : null,
    completionRate: started ? completed / started * 100 : null,
    timeToValue: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    understanding: average(feedback, "understanding"),
    helpfulness: average(feedback, "helpfulness"),
    trust: average(feedback, "trust"),
    willingness: average(feedback, "willingness"),
    willingnessRate: feedback.length ? feedback.filter((row) => row.willingness >= 4).length / feedback.length * 100 : null,
    notificationRate: feedback.length ? feedback.filter((row) => row.notification).length / feedback.length * 100 : null,
    dataRate: feedback.length ? feedback.filter((row) => row.dataPermission).length / feedback.length * 100 : null,
    feedbackCount: feedback.length,
  };
  const unresolved = demo.status !== "Prototype";
  const gates = feedback.length >= 5 && result.completionRate >= 80 && result.understanding >= 4 && result.helpfulness >= 4 && result.trust >= 3.5 && result.willingnessRate >= 60;
  const fails = [result.completionRate < 80, result.understanding < 4, result.helpfulness < 4, result.trust < 3.5, result.willingnessRate < 60].filter(Boolean).length;
  result.decision = gates && !unresolved ? "Build" : feedback.length >= 5 && fails >= 3 ? "Not Now" : "Need Evidence";
  result.evidenceGrade = feedback.length < 5 ? "未定" : result.decision === "Build" ? (scoreMetric(result) / 4 >= 4.4 ? "A" : "B+") : result.decision === "Not Now" ? "C" : "待補證";
  return result;
}

function decisionBadge(decision) {
  const className = decision === "Build" ? "build" : decision === "Not Now" ? "no" : "evidence";
  return `<span class="decision ${className}">${decision}</span>`;
}

function renderGallery() {
  const feedbackTotal = readStore(STORAGE.feedback).length;
  app.innerHTML = `
    <div class="page">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">9 concepts · 1 evidence system</p>
          <h1>別先愛上點子。<br>先讓證據說話。</h1>
          <p class="lead">九個發票資料應用，都能真的操作、看見推論依據、留下回饋。目標是在一天內找出值得進下一輪的 2–3 個方向。</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#/demo/recall">從第一項實驗開始</a>
            <a class="button button-secondary" href="#/dashboard">查看目前證據 ${feedbackTotal ? `(${feedbackTotal})` : ""}</a>
          </div>
        </div>
        <div class="hero-lab" aria-label="發票鬼怪實驗標本">
          <div class="specimen"><div class="specimen-ghost" aria-hidden="true"></div><span class="specimen-label">假設，不是結論</span></div>
        </div>
      </section>
      <div class="lab-note"><span aria-hidden="true">🧪</span><div><strong>${escapeHtml(lab.meta.label)}｜${escapeHtml(lab.meta.dataset)}</strong>${escapeHtml(lab.meta.notice)}</div></div>
      <div class="section-head">
        <div><p class="eyebrow">Experiment gallery</p><h2>九項最小可驗證體驗</h2><p>原始排名保留；#4 與 #5 已合併為一個完整推理遊戲。</p></div>
        <div class="filter-tabs" role="group" aria-label="篩選 Demo">
          <button class="filter-tab active" data-filter="all">全部 9</button>
          <button class="filter-tab" data-filter="Prototype">可直接測</button>
          <button class="filter-tab" data-filter="external">有外部依賴</button>
        </div>
      </div>
      <section class="demo-grid" aria-label="九項發票實驗">
        ${lab.demos.map(demoCard).join("")}
      </section>
    </div>`;

  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".demo-card").forEach((card) => {
      const filter = button.dataset.filter;
      card.hidden = filter !== "all" && (filter === "external" ? card.dataset.status === "Prototype" : card.dataset.status !== filter);
    });
  }));
}

function demoCard(demo) {
  const metric = metricsFor(demo);
  const result = metric.feedbackCount
    ? `${metric.feedbackCount} 份回饋｜證據評級 ${metric.evidenceGrade}｜信任 ${fmt(metric.trust)}/5｜${metric.decision}`
    : "尚無證據；完成體驗後才會產生證據後評級。";
  return `<article class="demo-card demo-card-${demo.id}" data-demo="${demo.id}" data-status="${escapeHtml(demo.status)}">
    <div class="demo-card-top">
      <div class="demo-id"><span class="demo-icon" aria-hidden="true">${demo.icon}</span><div><span class="demo-number">ORIGINAL RANK ${originalRankLabel(demo)}</span><h3>${escapeHtml(demo.title)}</h3></div></div>
      <span class="grade" title="原始評級">${escapeHtml(demo.grade)}</span>
    </div>
    <p class="demo-tagline">${escapeHtml(demo.tagline)}</p>
    <dl class="fact-list">
      <div class="fact"><dt>解決問題</dt><dd>${escapeHtml(demo.problem)}</dd></div>
      <div class="fact"><dt>核心假設</dt><dd>${escapeHtml(demo.assumption)}</dd></div>
      <div class="fact"><dt>資料需求</dt><dd>${escapeHtml(demo.dependency)}</dd></div>
      <div class="fact"><dt>設計原型</dt><dd><strong>${escapeHtml(demo.design.pattern)}</strong><br>${escapeHtml(demo.design.principle)}</dd></div>
    </dl>
    <div>
      <div class="demo-card-foot"><span class="status-badge">${escapeHtml(demo.status)}</span><a class="button button-primary" href="#/demo/${demo.id}">開始體驗</a></div>
      <div class="evidence-summary"><strong>證據摘要：</strong>${escapeHtml(result)}</div>
    </div>
  </article>`;
}

function renderBrief() {
  const rice = [...lab.demos].sort((a, b) => b.rice - a.rice);
  app.innerHTML = `<div class="page page-narrow">
    <p class="eyebrow">Validation brief</p>
    <h1>這次不是選最酷，<br>是找最值得驗證。</h1>
    <p class="lead">第一輪決策是 Evidence First。所有目標族群、需求與排名仍是假設，必須用任務完成、信任與使用意願來反駁。</p>
    <section class="brief-section"><h2>Problem Brief</h2><div class="brief-card">
      <h3>誰／解什麼問題</h3>
      <p>目標使用者是假設為：已綁定載具、累積足夠明細、不想手動整理、又在意推論可信度的台灣消費者。第一輪便利樣本是 20–35 歲、高頻外食、熟悉 LINE／IG 分享的內部同事。</p>
      <p><strong>JTBD：</strong>當我累積大量發票後，主動替我找出能省錢、避免損失或值得分享的洞察，而且讓我快速判斷它為何可信。</p>
      <p><strong>現行替代：</strong>自己翻載具／銀行紀錄、靠記憶管理庫存與期限、查價，或完全不處理。</p>
    </div></section>
    <section class="brief-section"><h2>最危險假設</h2><div class="brief-card">
      <p><strong>使用者願意相信「不完整發票資料＋必要外部資料」產生的主動推論，並據此採取行動。</strong>如果這點不成立，九個概念最多只能成為一次性娛樂。</p>
      <div class="lab-note warning"><span>⚡</span><div><strong>最便宜測法</strong>以固定資料讓 5–8 位目標使用者完成任務；量測 30 秒內是否看見價值、四項評分、授權意願，並要求指出最不可信之處。只替前 2–3 名接真實資料。</div></div>
    </div></section>
    <section class="brief-section"><h2>四面向風險</h2><div class="brief-card"><ul>
      <li><strong>Desirability：</strong>新奇是否能轉成持續回訪，而不是玩一次。</li>
      <li><strong>Value：</strong>是否能帶動綁定、留存或可衡量的避免損失。</li>
      <li><strong>Feasibility：</strong>商品正規化、單位換算、事件與規則資料是否足夠。</li>
      <li><strong>Usability：</strong>是否能在 30 秒內同時看懂結論、依據與限制。</li>
    </ul></div></section>
    <section class="brief-section"><h2>RICE 重新排序</h2><p class="muted">相對估值只用於安排測試順序；Confidence 是證據信心，不是成功率。</p>
      <div class="table-wrap"><table><thead><tr><th>RICE</th><th>原排</th><th>概念</th><th>分數</th><th>判斷</th></tr></thead><tbody>
        ${rice.map((demo, index) => `<tr><td>#${index + 1}</td><td>#${demo.rank}／${demo.grade}</td><td><a href="#/demo/${demo.id}">${escapeHtml(demo.title)}</a></td><td>${fmt(demo.rice, 2)}</td><td>${decisionBadge(metricsFor(demo).decision)}</td></tr>`).join("")}
      </tbody></table></div>
    </section>
    <section class="brief-section"><h2>決策門檻</h2><div class="brief-card"><p>每個概念至少 5 份有效回饋，且完成率 ≥80%、理解與幫助 ≥4/5、信任 ≥3.5/5、使用意願 ≥60%，並且沒有不可解的資料／法規依賴，才可標記 Build。</p></div></section>
  </div>`;
}

function renderNextStage() {
  app.innerHTML = `<div class="page product-stage-page">
    <section class="stage-hero">
      <div><p class="eyebrow">Stage 4.5 · High-fidelity validation</p><h1>九個產品，<br>不該長得像同一個 Prompt。</h1><p class="lead">共用資料誠信、回饋與可及性；但每個產品依自己的使用情境建立視覺語言。#4 與 #5 已合併為同一個發票推理局。</p></div>
      <div class="stage-position"><span>目前位置</span><strong>SPEC → VALIDATE</strong><p>下一個 Gate：5–8 位目標使用者完成任務測試</p></div>
    </section>
    <div class="stage-track" aria-label="產品開發階段">
      ${["Intake","Frame","Risk","Decide","Spec","Execute","Launch"].map((label,index) => `<div class="stage-node ${index < 5 ? "done" : index === 5 ? "next" : ""}"><span>${index}</span><strong>${label}</strong></div>`).join("")}
    </div>
    <div class="lab-note warning"><span>✦</span><div><strong>AI-native PM 判斷</strong>#4 的商家辨識與 #5 的自我認知共享「看線索、做判斷、翻證據」核心循環，因此合併成一個更完整的遊戲。</div></div>
    <div class="section-head"><div><p class="eyebrow">Nine design archetypes</p><h2>各自的產品語言與下一個 Gate</h2><p>靈感來源用於方法與 art direction，不直接複製第三方作品。</p></div></div>
    <section class="design-matrix">
      ${lab.demos.map(demo => `<article class="design-brief design-brief-${demo.id}">
        <div class="design-brief-number">${String(demo.rank).padStart(2,"0")}</div><div class="design-brief-icon">${demo.icon}</div>
        <p class="design-kicker">${escapeHtml(demo.design.pattern)}</p><h3>${escapeHtml(demo.title)}</h3>
        <blockquote>${escapeHtml(demo.design.principle)}</blockquote>
        <dl><div><dt>語氣</dt><dd>${escapeHtml(demo.design.voice)}</dd></div><div><dt>成功指標</dt><dd>${escapeHtml(demo.nextStage.successMetric)}</dd></div><div><dt>下一 Gate</dt><dd>${escapeHtml(demo.nextStage.gate)}</dd></div></dl>
        <div class="design-brief-actions"><a href="#/demo/${demo.id}">開啟高擬真 Demo →</a><a href="${escapeHtml(demo.design.referenceUrl)}" target="_blank" rel="noopener">參考入口：${escapeHtml(demo.design.reference)}</a></div>
      </article>`).join("")}
    </section>
    <div class="section-head"><div><p class="eyebrow">Dependency-ordered roadmap</p><h2>產品化任務圖</h2></div></div>
    <section class="roadmap-board">
      <div class="roadmap-lane"><span>01 · Shared spine</span><h3>先固定不可分歧的底座</h3><ul><li>品項／商家正規化資料契約</li><li>推論確定性與限制文案</li><li>隱私分類、事件埋點、可及性</li></ul></div>
      <div class="roadmap-arrow">→</div>
      <div class="roadmap-lane"><span>02 · Evidence lanes</span><h3>三條線並行驗證</h3><ul><li>Utility：價格、庫存、保固、冰箱</li><li>Risk：召回</li><li>Social：推理、兩真一假、味覺、趨勢、稀有種</li></ul></div>
      <div class="roadmap-arrow">→</div>
      <div class="roadmap-lane"><span>03 · Commit gate</span><h3>只讓證據過門檻者進工程</h3><ul><li>完成率 ≥80%</li><li>理解／幫助 ≥4；信任 ≥3.5</li><li>資料依賴可解、無法規阻塞</li></ul></div>
    </section>
    <section class="brief-section"><h2>這一階段的 Definition of Done</h2><div class="brief-card"><ul><li>每項產品有獨立 art direction、核心循環、成功指標與下一 Gate。</li><li>桌機、手機、鍵盤操作、直接 URL 與返回／前進皆可用。</li><li>不出現未解釋的 AI 推論；每個結果都能追到資料與限制。</li><li>完成 5–8 位目標使用者測試後，才更新證據後排名與工程承諾。</li></ul></div></section>
  </div>`;
}

function renderDashboard() {
  const rows = lab.demos.map((demo) => ({ demo, metric: metricsFor(demo) }));
  const evidenceRank = [...rows].filter((row) => row.metric.feedbackCount).sort((a, b) => scoreMetric(b.metric) - scoreMetric(a.metric));
  const rankMap = new Map(evidenceRank.map((row, index) => [row.demo.id, index + 1]));
  const feedback = readStore(STORAGE.feedback);
  const events = readStore(STORAGE.events);
  const concerns = feedback.flatMap((row) => row.untrusted ? [{ demo: getDemo(row.concept_id)?.title, text: row.untrusted }] : []).slice(-8).reverse();

  app.innerHTML = `<div class="page">
    <div class="dashboard-hero"><div><p class="eyebrow">Evidence dashboard</p><h1>排名會變，證據要留下。</h1><p class="lead">目前 ${events.length} 筆事件、${feedback.length} 份回饋。樣本不足時不產生成功結論。</p></div>
      <div class="dashboard-actions"><button class="button button-secondary" data-export="json">匯出 JSON</button><button class="button button-secondary" data-export="csv">匯出 CSV</button></div>
    </div>
    <div class="gate-grid">
      <div class="gate"><strong>≥ 80%</strong><span>任務完成率</span></div><div class="gate"><strong>≥ 4/5</strong><span>理解度</span></div><div class="gate"><strong>≥ 4/5</strong><span>幫助度</span></div><div class="gate"><strong>≥ 3.5/5</strong><span>信任度</span></div><div class="gate"><strong>≥ 60%</strong><span>使用意願（4–5 分）</span></div>
    </div>
    <div class="lab-note warning"><span>⚖️</span><div><strong>決策保護欄</strong>至少 5 份有效回饋且所有門檻都通過，才顯示 Build；外部資料依賴未解前仍維持 Need Evidence。</div></div>
    <div class="table-wrap"><table><thead><tr><th>原排／評級</th><th>概念</th><th>證據排</th><th>證據評級</th><th>開始率</th><th>完成率</th><th>價值時間</th><th>理解</th><th>幫助</th><th>信任</th><th>使用意願</th><th>通知</th><th>資料授權</th><th>n</th><th>建議</th></tr></thead><tbody>
      ${rows.map(({ demo, metric }) => `<tr><td>#${demo.rank}／${demo.grade}</td><td><a href="#/demo/${demo.id}">${escapeHtml(demo.title)}</a></td><td>${rankMap.get(demo.id) ? `#${rankMap.get(demo.id)}` : "—"}</td><td>${metric.evidenceGrade}</td><td>${metric.startRate == null ? "—" : `${fmt(metric.startRate)}%`}</td><td>${metric.completionRate == null ? "—" : `${fmt(metric.completionRate)}%`}</td><td>${metric.timeToValue == null ? "—" : `${fmt(metric.timeToValue / 1000)}s`}</td><td>${fmt(metric.understanding)}</td><td>${fmt(metric.helpfulness)}</td><td>${fmt(metric.trust)}</td><td>${metric.willingnessRate == null ? "—" : `${fmt(metric.willingnessRate)}%`}</td><td>${metric.notificationRate == null ? "—" : `${fmt(metric.notificationRate)}%`}</td><td>${metric.dataRate == null ? "—" : `${fmt(metric.dataRate)}%`}</td><td>${metric.feedbackCount}</td><td>${decisionBadge(metric.decision)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="section-head"><div><p class="eyebrow">Qualitative evidence</p><h2>主要不信任點</h2></div></div>
    ${concerns.length ? `<ul class="concern-list">${concerns.map(item => `<li><strong>${escapeHtml(item.demo || "未知概念")}：</strong>${escapeHtml(item.text)}</li>`).join("")}</ul>` : `<div class="empty-state">還沒有質性回饋。請先完成任一 Demo，並留下「最不可信的部分」。</div>`}
    <div class="section-head"><div><p class="eyebrow">Current recommendation</p><h2>下一輪先驗證什麼</h2></div></div>
    <div class="brief-card"><p><strong>目前不宣告任何概念已通過。</strong>若今天必須安排順序，依 RICE 與風險組合優先測：價格刺客（廣泛、省錢價值清楚）、囤貨鬼打牆（低成本驗證推論校正）、商品召回雷達（高影響但外部依賴最大）。味覺 DNA 可當作社交分享對照組。</p></div>
  </div>`;

  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportEvidence(button.dataset.export, rows)));
}

function scoreMetric(metric) {
  return [metric.understanding, metric.helpfulness, metric.trust, metric.willingness].filter(Number.isFinite).reduce((a, b) => a + b, 0);
}

function exportEvidence(type, rows) {
  const payload = {
    exported_at: new Date().toISOString(),
    dataset: lab.meta,
    summary: rows.map(({ demo, metric }) => ({ concept_id: demo.id, original_rank: demo.rank, original_grade: demo.grade, ...metric })),
    feedback: readStore(STORAGE.feedback),
    events: readStore(STORAGE.events),
  };
  let content;
  let mime;
  let extension;
  if (type === "csv") {
    const headers = ["concept_id","original_rank","original_grade","opened","started","completed","completion_rate","time_to_value_ms","understanding","helpfulness","trust","willingness_rate","notification_rate","data_permission_rate","feedback_count","decision"];
    const csvRows = payload.summary.map(row => [row.concept_id,row.original_rank,row.original_grade,row.opened,row.started,row.completed,row.completionRate,row.timeToValue,row.understanding,row.helpfulness,row.trust,row.willingnessRate,row.notificationRate,row.dataRate,row.feedbackCount,row.decision]);
    content = [headers, ...csvRows].map(line => line.map(value => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
    mime = "text/csv;charset=utf-8";
    extension = "csv";
  } else {
    content = JSON.stringify(payload, null, 2);
    mime = "application/json";
    extension = "json";
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-lab-evidence-${new Date().toISOString().slice(0,10)}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${extension.toUpperCase()}`);
}

function demoShell(demo, state, body, step, total = 4) {
  const currentIndex = lab.demos.findIndex((item) => item.id === demo.id);
  const prev = lab.demos[(currentIndex - 1 + lab.demos.length) % lab.demos.length];
  const next = lab.demos[(currentIndex + 1) % lab.demos.length];
  return `<div class="page demo-page">
    <div class="demo-breadcrumb"><a href="#/gallery">九項實驗</a><span>/</span><span>${originalRankLabel(demo)} ${escapeHtml(demo.title)}</span></div>
    <div class="demo-layout">
      <article class="experiment theme-${demo.id}" data-product-theme="${demo.id}">
        <header class="experiment-head"><span class="demo-icon" aria-hidden="true">${demo.icon}</span><div><span class="demo-number">ORIGINAL RANK ${originalRankLabel(demo)} · ${demo.grade}</span><h1>${escapeHtml(demo.title)}</h1></div><span class="step-count">${Math.min(step, total)} / ${total}</span></header>
        <div class="progress" aria-label="體驗進度"><span style="width:${Math.min(100, Math.max(4, step / total * 100))}%"></span></div>
        <div class="experiment-body">${body}</div>
      </article>
      <aside class="side-stack">
        <div class="side-card"><h3>這次要驗證</h3><p>${escapeHtml(demo.assumption)}</p></div>
        <div class="side-card design-signature"><span class="design-signature-label">DESIGN ARCHETYPE</span><h3>${escapeHtml(demo.design.pattern)}</h3><p>${escapeHtml(demo.design.principle)}</p><a href="#/next-stage">查看產品化藍圖 →</a></div>
        <div class="side-card"><h3>資料與依賴</h3><p>${escapeHtml(demo.dependency)}</p><p style="margin-top:8px">${decisionBadge(metricsFor(demo).decision)}</p></div>
        <div class="side-card"><h3>快速移動</h3><div class="side-nav"><a href="#/demo/${prev.id}" aria-label="上一個 Demo：${escapeHtml(prev.title)}">← 上一個</a><a href="#/demo/${next.id}" aria-label="下一個 Demo：${escapeHtml(next.title)}">下一個 →</a><a href="#/gallery">Gallery</a><a href="#/dashboard">看證據</a></div></div>
      </aside>
    </div>
  </div>`;
}

function startScreen(demo, copy, extra = "") {
  return `<div class="start-visual"><span class="demo-icon" aria-hidden="true">${demo.icon}</span></div>
    <p class="eyebrow">${escapeHtml(demo.status)}</p><h2>${escapeHtml(copy.title)}</h2><p class="lead">${escapeHtml(copy.body)}</p>
    ${extra}<div class="experiment-actions"><button class="button button-primary" data-act="start">開始這項實驗</button><a class="button button-ghost" href="#/gallery">先看其他概念</a></div>`;
}

function evidenceDetails(demo, content) {
  return `<details class="evidence" data-evidence><summary>為什麼得到這個結果？</summary><div class="evidence-inner">${content}<p><strong>資料依賴：</strong>${escapeHtml(demo.dependency)}</p></div></details>`;
}

function resultActions(demo, state, shareTitle, { feedback = true } = {}) {
  return `<div class="experiment-actions"><button class="button button-secondary" data-act="share" data-share-title="${escapeHtml(shareTitle)}">預覽分享卡</button>${feedback ? `<button class="button button-primary" data-act="feedback">完成並留下回饋</button>` : ""}</div>`;
}

function feedbackScreen(demo) {
  return `<form class="feedback" id="feedback-form">
    <div class="feedback-intro"><p class="eyebrow">最後 60 秒</p><h2>這個概念，值得往下做嗎？</h2><p>請依剛剛的體驗回答。資料只留在這台裝置，匯出後才會被團隊使用。</p></div>
    <div class="rating-grid">${Object.entries(ratingLabels).map(([key, label]) => `<fieldset class="rating-field"><legend>${label}</legend><div class="stars" aria-label="${label}，1 到 5 分">${[1,2,3,4,5].map(value => `<input required id="${demo.id}-${key}-${value}" name="${key}" type="radio" value="${value}"><label for="${demo.id}-${key}-${value}" title="${value} 分">${value}</label>`).join("")}</div></fieldset>`).join("")}</div>
    <div class="toggle-grid"><label class="toggle-card"><span>願意開啟相關通知</span><input name="notification" type="checkbox"></label><label class="toggle-card"><span>願意提供必要資料權限</span><input name="dataPermission" type="checkbox"></label></div>
    <div class="feedback-fields"><label class="field"><span>最有價值的部分</span><textarea name="valuable" placeholder="哪一刻讓你覺得有用？"></textarea></label><label class="field"><span>最不可信的部分</span><textarea name="untrusted" placeholder="哪個推論讓你懷疑？"></textarea></label></div>
    <label class="field" style="margin-top:10px"><span>其他回饋（選填）</span><textarea name="note" placeholder="如果正式上線，你希望它怎麼做？"></textarea></label>
    <div class="experiment-actions"><button class="button button-primary" type="submit">送出這份證據</button><button class="button button-ghost" type="button" data-act="result">回看結果</button></div>
  </form>`;
}

function completionScreen(demo) {
  const metric = metricsFor(demo);
  return `<div class="complete-card"><div><div class="complete-check" aria-hidden="true">✓</div><p class="eyebrow">Evidence captured</p><h2>你的回饋已加入實驗</h2><p>目前這個概念有 ${metric.feedbackCount} 份回饋，決策狀態為 <strong>${metric.decision}</strong>。達到樣本與全部門檻前，不會被標成驗證成功。</p><div class="experiment-actions" style="justify-content:center"><button class="button button-primary" data-act="restart">重新體驗</button><a class="button button-secondary" href="#/dashboard">查看證據儀表板</a></div></div></div>`;
}

function bindShared(demo, state, renderResultStep) {
  document.querySelectorAll("[data-evidence]").forEach((details) => details.addEventListener("toggle", () => {
    if (details.open) track("evidence_expanded", demo, state);
  }, { once: true }));
  document.querySelectorAll('[data-act="share"]').forEach((button) => button.addEventListener("click", () => openShare(demo, state, button.dataset.shareTitle)));
  document.querySelectorAll('[data-act="feedback"]').forEach((button) => button.addEventListener("click", () => updateState(demo, { step: "feedback", resultStep: renderResultStep })));
  document.querySelectorAll('[data-act="result"]').forEach((button) => button.addEventListener("click", () => updateState(demo, { step: state.resultStep ?? renderResultStep })));
  document.querySelectorAll('[data-act="restart"]').forEach((button) => button.addEventListener("click", () => {
    const fresh = initialState(demo);
    fresh.opened = true;
    demoStates.set(demo.id, fresh);
    track("demo_restarted", demo, fresh);
    renderRoute({ focus: true });
  }));
  const form = document.querySelector("#feedback-form");
  if (form) form.addEventListener("submit", (event) => submitFeedback(event, demo, state));
}

function submitFeedback(event, demo, state) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entry = {
    concept_id: demo.id,
    rank: demo.rank,
    session_id: sessionId(),
    at: new Date().toISOString(),
    understanding: Number(form.get("understanding")),
    helpfulness: Number(form.get("helpfulness")),
    trust: Number(form.get("trust")),
    willingness: Number(form.get("willingness")),
    notification: form.get("notification") === "on",
    dataPermission: form.get("dataPermission") === "on",
    valuable: String(form.get("valuable") || "").trim(),
    untrusted: String(form.get("untrusted") || "").trim(),
    note: String(form.get("note") || "").trim(),
  };
  const feedback = readStore(STORAGE.feedback);
  feedback.push(entry);
  writeStore(STORAGE.feedback, feedback);
  track("feedback_submitted", demo, state, { result: `${entry.understanding}/${entry.helpfulness}/${entry.trust}/${entry.willingness}` });
  updateState(demo, { step: "complete", feedbackDone: true });
  showToast("回饋已記錄在這台裝置");
}

function openShare(demo, state, title) {
  track("share_clicked", demo, state, { result: title });
  const shareUrl = `${location.origin}${location.pathname}#/demo/${demo.id}`;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="share-heading"><header class="modal-head"><h3 id="share-heading">隱私安全分享預覽</h3><button class="modal-close" data-close aria-label="關閉">×</button></header><div class="share-card"><small>發票腦洞實驗室 · #${demo.rank}</small><h2>${escapeHtml(title)}</h2><p>${escapeHtml(demo.tagline)}</p><span class="privacy-chip">不含商家、金額、日期與個人明細</span></div><div class="modal-actions"><button class="button button-primary button-wide" data-copy data-url="${escapeHtml(shareUrl)}">複製分享文字與連結</button></div></section></div>`;
  const close = () => { modalRoot.innerHTML = ""; };
  modalRoot.querySelector("[data-close]").addEventListener("click", close);
  modalRoot.querySelector("[data-modal-backdrop]").addEventListener("click", (event) => { if (event.target === event.currentTarget) close(); });
  modalRoot.querySelector("[data-copy]").addEventListener("click", async (event) => {
    const text = `${title}｜${demo.tagline}\n${event.currentTarget.dataset.url}`;
    try { await navigator.clipboard.writeText(text); showToast("分享文字已複製"); } catch { showToast("瀏覽器未允許複製，請手動複製網址"); }
  });
  modalRoot.querySelector("[data-close]").focus();
}

function renderRecall(demo, state) {
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "你買過的東西，出事時找得到你嗎？", body: "用一個虛構召回事件，測試發票自動比對是否能在 30 秒內帶來可信、可行動的價值。" }, `<div class="lab-note error"><span>!</span><div><strong>重要</strong>本事件完全虛構；正式版必須依賴權威召回來源與商品級發票明細。</div></div>`);
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 模擬外部事件</p><div class="event-card"><span class="event-date">${lab.recallEvent.published} · 虛構事件</span><h2>${escapeHtml(lab.recallEvent.title)}</h2><p>${escapeHtml(lab.recallEvent.reason)}。可能批號：${escapeHtml(lab.recallEvent.batch)}；示範販售區間 ${lab.recallEvent.window.join(" – ")}。</p></div><div class="experiment-actions"><button class="button button-primary" data-act="scan">掃描我的示範發票</button></div>`;
  else if (state.step === 2) body = `<p class="eyebrow">Step 2 · 自動比對</p><div class="scan-box"><div class="scan-beam"></div><div class="scan-copy"><strong>正在比對 10 張固定發票</strong><p>品名 → 日期 → 商家 → 批號可得性</p></div></div><div class="lab-note warning" style="margin-top:16px"><span>🔎</span><div>批號通常不在發票上，所以即使品名、日期相符，也不能宣稱百分之百命中。</div></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, "possible_match_86");
    body = `<p class="eyebrow">Step 3 · 第一個價值</p><div class="result-card"><div class="result-banner warning"><span class="status-badge" style="background:white;color:#8a2713">可能命中</span><h2>找到 1 筆需要你確認</h2><p>不是判定中標，而是把最值得確認的那一筆先找出來。</p></div><div class="result-content"><div class="confidence"><div class="confidence-score">${lab.recallEvent.confidence}%</div><div><strong>匹配可信度</strong><p>品名、購買日期相符；發票沒有批號，所以仍需查看瓶身。</p></div></div><div class="invoice-card"><div class="invoice-line"><span>商品</span><strong>清涼氣泡水 500ml</strong></div><div class="invoice-line"><span>日期／商家</span><strong>2026-08-12 · 日日便利</strong></div><div class="invoice-line"><span>建議</span><strong>確認瓶身批號 QX0812</strong></div></div>${evidenceDetails(demo, `<ul class="evidence-list"><li>品名完整相符：清涼氣泡水 500ml</li><li>購買日落在示範販售區間內</li><li>商家屬於事件示範通路</li></ul><p><strong>缺口：</strong>發票沒有批號，不能把「可能命中」寫成「已買到召回品」。正式上線還需權威、穩定且可稽核的召回事件資料。</p>`)}<h3 style="margin-top:20px">你會怎麼處理？</h3><div class="choice-grid">${["已確認，是這項商品","不是這項商品","已經處理完畢"].map((label, index) => `<button class="choice-card ${state.resolution === index ? "selected" : ""}" data-resolution="${index}"><strong>${label}</strong><small>${["下一步查看批號與處理指引","幫助系統修正錯誤匹配","關閉這次提醒並留下狀態"][index]}</small></button>`).join("")}</div>${state.resolution != null ? `<div class="lab-note" style="margin-top:14px"><span>✓</span><div>${["已記錄：仍需由你確認瓶身批號。","已記錄為誤判；這是模型必須學會的反證。","已記錄完成；正式版可停止重複提醒。"][state.resolution]}</div></div>` : ""}${resultActions(demo, state, "我的發票幫我抓到一筆召回風險")}</div></div>`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  if (state.step === 0) document.querySelector('[data-act="start"]').addEventListener("click", () => startDemo(demo));
  if (state.step === 1) document.querySelector('[data-act="scan"]').addEventListener("click", () => { updateState(demo, { step: 2 }); setTimeout(() => { if (location.hash.includes("/recall") && stateFor(demo).step === 2) updateState(demo, { step: 3 }, { focus: true }); }, 850); });
  document.querySelectorAll("[data-resolution]").forEach(button => button.addEventListener("click", () => updateState(demo, { resolution: Number(button.dataset.resolution) })));
  bindShared(demo, state, 3);
}

function renderPrice(demo, state) {
  const products = [...new Set(lab.priceHistory.map(item => item.product))];
  const selected = state.product || products[0];
  const history = lab.priceHistory.filter(item => item.product === selected);
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "你記得價格，但記得單位價嗎？", body: "從自己的固定歷史發票比同商品、同規格，找出價格變化。這不是即時市場比價。" });
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 選一個商品</p><h2>哪個最近可能被刺到？</h2><p class="lead">先選商品，再用相同規格的歷史紀錄比較。</p><div class="choice-grid">${products.map(product => `<button class="choice-card ${selected === product ? "selected" : ""}" data-product="${escapeHtml(product)}"><strong>${escapeHtml(product)}</strong><small>${lab.priceHistory.filter(item => item.product === product).length} 筆可比紀錄</small></button>`).join("")}</div><div class="experiment-actions"><button class="button button-primary" data-act="compare">比較歷史單位價</button></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, `price_${selected}`);
    const ordered = [...history].sort((a,b) => state.sort === "recent" ? b.date.localeCompare(a.date) : a.unitPrice - b.unitPrice);
    const max = Math.max(...history.map(item => item.unitPrice));
    const min = Math.min(...history.map(item => item.unitPrice));
    const diff = (max - min) / min * 100;
    body = `<p class="eyebrow">Step 2 · 個人歷史比價</p><div class="result-card"><div class="result-banner"><h2>同規格最多差 ${fmt(diff)}%</h2><p>${escapeHtml(selected)} · 只比較你的固定示範紀錄</p></div><div class="result-content"><div class="button-row"><button class="filter-tab ${state.sort !== "recent" ? "active" : ""}" data-sort="low">最低單位價</button><button class="filter-tab ${state.sort === "recent" ? "active" : ""}" data-sort="recent">最近購買</button></div><div class="result-list" style="margin-top:15px">${ordered.map((item, index) => `<div class="result-row"><div><strong>${item.date} · ${escapeHtml(item.merchant)}</strong><p>${escapeHtml(item.product)}</p></div><div class="score">$${item.price}<small style="display:block;font-size:9px;color:var(--hint)">${selected.includes("衛生紙") ? `$${item.unitPrice}/包` : `$${item.unitPrice}/ml`}</small></div></div>`).join("")}</div>${evidenceDetails(demo, `<p>只比較正規化後的同商品、同規格，先換算成單位價格再排序。Demo 沒有即時市場資料，因此結論只能是「比你自己的歷史價格高／低」，不能宣稱全市場最便宜。</p>`)}<div class="lab-note warning" style="margin-top:14px"><span>!</span><div><strong>不是即時市價</strong>正式版若要回答「附近哪裡最便宜」，還需要新鮮的商家價格與距離資料。</div></div>${resultActions(demo, state, `我買 ${selected} 最多差了 ${fmt(diff)}%`)}</div></div>`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  if (state.step === 0) document.querySelector('[data-act="start"]').addEventListener("click", () => startDemo(demo, { product: products[0] }));
  document.querySelectorAll("[data-product]").forEach(button => button.addEventListener("click", () => updateState(demo, { product: button.dataset.product })));
  document.querySelector('[data-act="compare"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  document.querySelectorAll("[data-sort]").forEach(button => button.addEventListener("click", () => updateState(demo, { sort: button.dataset.sort })));
  bindShared(demo, state, 2);
}

function renderStock(demo, state) {
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "你是真的需要，還是又忘了家裡有？", body: "用重複購買週期推估家中庫存，再讓你一鍵校正。重點是測試你是否接受這種推論。" });
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 發現重複購買</p><h2>9 天內買了兩串衛生紙</h2><p class="lead">同商品、同規格，8/09 與 8/14 各買 12 包。</p><div class="metric-grid"><div class="metric-card"><span>購買次數</span><strong>2 次</strong></div><div class="metric-card"><span>總包數</span><strong>24 包</strong></div><div class="metric-card"><span>間隔</span><strong>5 天</strong></div></div><div class="experiment-actions"><button class="button button-primary" data-act="estimate">讓系統猜家中庫存</button></div>`;
  else if (state.step === 2) {
    markValue(demo, state, "estimated_3_packs");
    body = `<p class="eyebrow">Step 2 · 庫存推估</p><div class="personality-card"><span class="persona-label">囤貨鬼提示</span><h2>家裡可能還有 3 包</h2><p>依兩次購買間隔與示範用量估算。這不是盤點結果，請你校正。</p></div>${evidenceDetails(demo, `<p>24 包 ÷ 示範家庭每日平均 1.1 包的「抽取單位」換算後，扣除推估消耗量。真實版需知道家庭人數、使用場景與是否代購；所以結果只可寫「可能」。</p>`)}<h3 style="margin-top:20px">實際情況是？</h3><div class="choice-grid">${[["still","真的還有","維持提醒，但延後補貨"],["empty","已經用完","提高你的個人消耗率"],["mute","不要提醒","此商品停止庫存推估"]].map(([id,title,copy]) => `<button class="choice-card" data-stock="${id}"><strong>${title}</strong><small>${copy}</small></button>`).join("")}</div>`;
  } else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, `stock_${state.stockAnswer}`);
    const copy = { still:["校正完成：延後補貨","下次提醒會等到推估剩 1 包。"], empty:["校正完成：提高消耗率","系統會縮短你的個人補貨週期。"], mute:["已停止這項提醒","仍保留發票紀錄，不再做庫存通知。"] }[state.stockAnswer];
    body = `<p class="eyebrow">Step 3 · 你的回答改變結果</p><div class="result-card"><div class="result-banner"><h2>${copy[0]}</h2><p>${copy[1]}</p></div><div class="result-content"><div class="lab-note"><span>↻</span><div><strong>不是一次判定</strong>這個概念的價值取決於使用者是否願意校正，以及校正後下一次真的更準。</div></div>${resultActions(demo, state, copy[0])}</div></div>`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo));
  document.querySelector('[data-act="estimate"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  document.querySelectorAll("[data-stock]").forEach(button => button.addEventListener("click", () => updateState(demo, { stockAnswer: button.dataset.stock, step: 3 }, { focus: true })));
  bindShared(demo, state, 3);
}

function renderDetective(demo, state) {
  const merchantTotal = 2;
  const truthTotal = 3;
  const questionTotal = merchantTotal + truthTotal;
  const chapterTabs = `<div class="case-file-tabs" aria-label="案件章節"><span class="case-file-tab ${state.phase === "merchant" ? "active" : "done"}"><b>01</b> 商家身分</span><span class="case-file-tab ${state.phase === "truth" ? "active" : state.phase === "transition" || state.phase === "merchant" ? "" : "done"}"><b>02</b> 消費證詞</span></div>`;
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "先查身分，再抓出誰在說謊。", body: "同一場發票推理遊戲、兩個章節、五宗案件：先用發票線索認出商家，再找出自己消費紀錄裡的假話。" }, `<div class="case-intro"><span>CHAPTER 01</span><strong>這是誰？</strong><i>2 案</i><span>CHAPTER 02</span><strong>誰在說謊？</strong><i>3 案</i></div>`);
  else if (state.step === "summary") {
    markComplete(demo, state, `combined_score_${state.score}_of_${questionTotal}`);
    const badge = state.score === questionTotal ? "首席發票偵探" : state.score >= 4 ? "消費側寫高手" : "發票迷霧行者";
    body = `<p class="eyebrow">案件總結 · Case closed</p><div class="personality-card detective-certificate"><span class="persona-label">發票推理局結案證書</span><h2>${escapeHtml(badge)}</h2><strong class="final-detective-score">${state.score} / ${questionTotal}</strong><div class="case-scoreboard"><span><b>${state.merchantScore}/${merchantTotal}</b>商家身分</span><span><b>${state.truthScore}/${truthTotal}</b>消費證詞</span><span><b>${state.bestStreak}</b>最長連勝</span></div><p>你不只要看懂發票寫了誰，還要分辨自己的記憶有沒有說謊。每一題揭曉都附可追溯證據。</p></div>${resultActions(demo, state, `我的發票偵探力：${state.score}/${questionTotal}，封號「${badge}」`)}`;
  } else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else if (state.phase === "transition") {
    body = `${chapterTabs}<div class="chapter-transition"><span class="case-stamp">IDENTITY VERIFIED</span><p class="eyebrow">第一章完成</p><h2>商家認得了。<br>現在，輪到你的記憶接受偵訊。</h2><p>接下來三宗案件，每題有兩句真話、一句假話。找出與發票證據不符的那一句。</p><div class="case-scoreboard"><span><b>${state.merchantScore}/${merchantTotal}</b>身分查驗</span><span><b>${state.bestStreak}</b>目前最長連勝</span></div><div class="experiment-actions"><button class="button button-primary" data-act="begin-truth">開啟消費證詞卷宗</button></div></div>`;
  } else if (state.phase === "merchant") {
    const round = lab.detectiveRounds[state.merchantRound];
    body = `${chapterTabs}<div class="round-meta"><span>商家身分 · 案件 ${state.merchantRound + 1} / ${merchantTotal}</span><span>總分 ${state.score} · 連勝 ${state.streak}</span></div><p class="eyebrow" style="margin-top:18px">發票登記名</p><h2>${escapeHtml(round.legal)}</h2><ul class="clue-list">${round.clues.map(clue => `<li>${escapeHtml(clue)}</li>`).join("")}</ul><div class="choice-grid">${round.options.map((option,index) => `<button class="choice-card ${state.revealed ? index === round.answer ? "correct" : index === state.selected ? "wrong" : "" : ""}" data-merchant-answer="${index}" ${state.revealed ? "disabled" : ""}><strong>${escapeHtml(option)}</strong><small>${state.revealed && index === round.answer ? "身分核驗完成" : "選這個答案"}</small></button>`).join("")}</div>${state.revealed ? `<div class="lab-note ${state.selected === round.answer ? "" : "error"}" style="margin-top:16px"><span>${state.selected === round.answer ? "✓" : "×"}</span><div><strong>${state.selected === round.answer ? "身分吻合" : "推理失準"}</strong>${escapeHtml(round.why)}</div></div><div class="experiment-actions"><button class="button button-primary" data-act="next-merchant">${state.merchantRound === merchantTotal - 1 ? "完成身分查驗" : "下一宗案件"}</button></div>` : ""}`;
  } else {
    const round = lab.truthRounds[state.truthRound];
    body = `${chapterTabs}<div class="round-meta"><span>消費證詞 · 案件 ${state.truthRound + 1} / ${truthTotal}</span><span>總分 ${state.score} · 連勝 ${state.streak}</span></div><p class="eyebrow" style="margin-top:18px">找出與發票不符的證詞</p><h2>兩句是真的，一句在說謊。</h2><div class="choice-grid truth-case-grid">${round.statements.map((statement,index) => `<button class="choice-card ${state.revealed ? index === round.answer ? "correct" : index === state.selected ? "wrong" : "" : ""}" data-truth-answer="${index}" ${state.revealed ? "disabled" : ""}><span class="statement-number">證詞 ${String.fromCharCode(65 + index)}</span><strong>${escapeHtml(statement)}</strong></button>`).join("")}</div>${state.revealed ? `<div class="lab-note ${state.selected === round.answer ? "" : "error"}" style="margin-top:16px"><span>${state.selected === round.answer ? "✓" : "×"}</span><div><strong>${state.selected === round.answer ? "抓到假話" : "被記憶誤導了"}</strong>${escapeHtml(round.evidence)}</div></div><div class="experiment-actions"><button class="button button-primary" data-act="next-truth-case">${state.truthRound === truthTotal - 1 ? "查看綜合結案" : "偵訊下一組證詞"}</button></div>` : ""}`;
  }
  const progressStep = state.step === "summary" || state.step === "feedback" || state.step === "complete" ? 7 : state.step === 0 ? 1 : state.phase === "merchant" ? state.merchantRound + 2 : state.phase === "transition" ? 3 : state.truthRound + 4;
  app.innerHTML = demoShell(demo, state, body, progressStep, 7);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo, { phase: "merchant", merchantRound: 0, truthRound: 0, merchantScore: 0, truthScore: 0, score: 0, streak: 0, bestStreak: 0, selected: null, revealed: false }));
  document.querySelectorAll("[data-merchant-answer]").forEach(button => button.addEventListener("click", () => {
    const selectedAnswer = Number(button.dataset.merchantAnswer);
    const correct = selectedAnswer === lab.detectiveRounds[state.merchantRound].answer;
    const streak = correct ? state.streak + 1 : 0;
    updateState(demo, { selected: selectedAnswer, revealed: true, score: state.score + (correct ? 1 : 0), merchantScore: state.merchantScore + (correct ? 1 : 0), streak, bestStreak: Math.max(state.bestStreak, streak) });
  }));
  document.querySelector('[data-act="next-merchant"]')?.addEventListener("click", () => state.merchantRound === merchantTotal - 1 ? updateState(demo, { phase: "transition", selected: null, revealed: false }, { focus: true }) : updateState(demo, { merchantRound: state.merchantRound + 1, selected: null, revealed: false }, { focus: true }));
  document.querySelector('[data-act="begin-truth"]')?.addEventListener("click", () => updateState(demo, { phase: "truth", selected: null, revealed: false }, { focus: true }));
  document.querySelectorAll("[data-truth-answer]").forEach(button => button.addEventListener("click", () => {
    const selectedAnswer = Number(button.dataset.truthAnswer);
    const correct = selectedAnswer === lab.truthRounds[state.truthRound].answer;
    const streak = correct ? state.streak + 1 : 0;
    updateState(demo, { selected: selectedAnswer, revealed: true, score: state.score + (correct ? 1 : 0), truthScore: state.truthScore + (correct ? 1 : 0), streak, bestStreak: Math.max(state.bestStreak, streak) });
  }));
  document.querySelector('[data-act="next-truth-case"]')?.addEventListener("click", () => state.truthRound === truthTotal - 1 ? updateState(demo, { step: "summary", phase: "summary" }, { focus: true }) : updateState(demo, { truthRound: state.truthRound + 1, selected: null, revealed: false }, { focus: true }));
  bindShared(demo, state, "summary");
}

function renderTruth(demo, state) {
  renderDetective(demo, state);
}

function renderTaste(demo, state) {
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "你吃的是晚餐，發票看見的是鬼格。", body: "用料理類型、價位、重複度與冒險度生成可分享人設；不使用示範資料沒有的交易時間。" }, `<div class="lab-note warning"><span>🕒</span><div><strong>誠信限制</strong>固定資料只有日期、沒有交易時間，因此不做宵夜或作息推論。</div></div>`);
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 可用訊號</p><h2>4 張餐飲／超商發票，能說到哪裡？</h2><div class="metric-grid"><div class="metric-card"><span>主食料理</span><strong>3 種</strong></div><div class="metric-card"><span>價位跨度</span><strong>$145–220</strong></div><div class="metric-card"><span>重複品項</span><strong>氣泡飲</strong></div></div><div class="lab-note warning"><span>!</span><div>交易時間不可用，本 Demo 不使用「深夜」、「早餐」或作息推論。</div></div><div class="experiment-actions"><button class="button button-primary" data-act="reveal-taste">生成飲食鬼格</button></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, "flavor_wanderer");
    body = `<p class="eyebrow">Step 2 · 模擬分析結果</p><div class="personality-card"><span class="persona-label">你的味覺 DNA</span><h2>跨國主食巡遊鬼</h2><p>打拋豬、豚骨拉麵、咖哩飯輪番出場；你會回購飲料，但主食不喜歡被同一間店綁住。</p><div class="trait-grid"><div class="trait"><strong>料理冒險 82</strong><span>3 張主食發票、3 種料理系</span></div><div class="trait"><strong>重複度 28</strong><span>主食沒有重複購買</span></div><div class="trait"><strong>價位 65</strong><span>主食中位數約 $180</span></div><div class="trait"><strong>飲料忠誠 76</strong><span>蜜桃氣泡飲回購 2 次</span></div></div></div>${evidenceDetails(demo, `<ul class="evidence-list"><li>料理：泰式打拋豬、日式豚骨拉麵、咖哩飯</li><li>主食價格：145、190、180 元</li><li>蜜桃氣泡飲在 8/06 與 8/18 重複出現</li></ul><p><strong>盲點：</strong>發票無法知道你是否吃完、替誰買，也沒有交易時間。因此結果是可反駁的趣味詮釋，不是健康診斷。</p>`)}<div class="lab-note" style="margin-top:14px"><span>✦</span><div><strong>優勢</strong>容易嘗鮮。<br><strong>盲點</strong>單月樣本少，可能把偶然購買當成偏好。<br><strong>趣味建議</strong>下一餐挑一個從沒出現在發票裡的料理系。</div></div>${resultActions(demo, state, "我的味覺 DNA：跨國主食巡遊鬼")}`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo));
  document.querySelector('[data-act="reveal-taste"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  bindShared(demo, state, 2);
}

function renderTrend(demo, state) {
  const selected = lab.trends.find(item => item.id === (state.trend || "peach"));
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "你是先知，還是熱潮收割尾班車？", body: "比較個人購買日與匿名示範群體曲線，測試跟風指數是否有趣且可信。" });
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 選擇期間趨勢</p><h2>你想對照哪一波？</h2><div class="choice-grid">${lab.trends.map(item => `<button class="choice-card ${selected.id === item.id ? "selected" : ""}" data-trend="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>示範群體 7 日曲線</small></button>`).join("")}</div><div class="experiment-actions"><button class="button button-primary" data-act="trend-result">查看跟風指數</button></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, `trend_${selected.id}_${selected.score}`);
    body = `<p class="eyebrow">Step 2 · 模擬群體比較</p><div class="result-card"><div class="result-banner"><h2>${escapeHtml(selected.label)} · ${selected.score}</h2><p>個人購買日與示範群體熱潮峰值的相對位置</p></div><div class="result-content"><div class="trend-chart" aria-label="七日示範購買曲線">${selected.curve.map((value,index) => `<div class="trend-bar ${index + 1 === selected.personalDay ? "personal" : ""}" style="height:${value}%" title="第 ${index + 1} 天：${value}"><span>D${index + 1}${index + 1 === selected.personalDay ? " 你" : ""}</span></div>`).join("")}</div><p class="small muted" style="margin-top:30px">橘色是你的購買日；綠色是固定匿名群體曲線。</p>${evidenceDetails(demo, `<p>分數由「個人購買日距離熱潮峰值」與「該日群體熱度」組合而成。這裡的群體曲線完全是示範資料，不代表市場趨勢；正式版需要足夠匿名樣本與期間商品字典。</p>`)}<h3 style="margin-top:20px">換另一波比較</h3><div class="choice-grid">${lab.trends.map(item => `<button class="choice-card ${selected.id === item.id ? "selected" : ""}" data-trend-result="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${item.score} · ${escapeHtml(item.label)}</small></button>`).join("")}</div>${resultActions(demo, state, `我的跟風指數 ${selected.score}：${selected.label}`)}</div></div>`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo, { trend: "peach" }));
  document.querySelectorAll("[data-trend]").forEach(button => button.addEventListener("click", () => updateState(demo, { trend: button.dataset.trend })));
  document.querySelector('[data-act="trend-result"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  document.querySelectorAll("[data-trend-result]").forEach(button => button.addEventListener("click", () => updateState(demo, { trend: button.dataset.trendResult })));
  bindShared(demo, state, 2);
}

function renderRare(demo, state) {
  const categories = ["全部", ...new Set(lab.rareFinds.map(item => item.category))];
  const cutoff = state.period === "最近 14 天" ? "2026-08-06" : state.period === "最近 30 天" ? "2026-07-21" : "0000-00-00";
  const results = lab.rareFinds.filter(item => (state.category === "全部" || item.category === state.category) && item.date >= cutoff && item.rarity >= state.rarity);
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "33 個人裡，哪一筆只有你會買？", body: "在匿名辦公室基準中找少見模式，測試它能否創造安全、好笑的分享理由。" }, `<div class="lab-note"><span>🔒</span><div>分享卡不含姓名、商家、日期、金額或原始明細。</div></div>`);
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 設定稀有度</p><h2>先決定你想多怪。</h2><div class="filter-form"><label class="field"><span>類型</span><select data-rare-category>${categories.map(value => `<option ${state.category === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>期間</span><select data-rare-period><option>全部</option><option>最近 14 天</option><option>最近 30 天</option></select></label><label class="field"><span>最低稀有度</span><div class="range-line"><input data-rarity type="range" min="50" max="95" value="${state.rarity}"><strong>${state.rarity}</strong></div></label></div><div class="result-list">${results.map(item => `<div class="result-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.item)} · ${escapeHtml(item.peerRate)}</p></div><div class="score">${item.rarity}</div></div>`).join("") || `<div class="empty-state">這個條件沒有示範結果，調低稀有度再找一次。</div>`}</div><div class="experiment-actions"><button class="button button-primary" data-act="rare-result" ${results.length ? "" : "disabled"}>查看最稀有證據</button></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    const top = results.sort((a,b) => b.rarity - a.rarity)[0] || lab.rareFinds[0];
    markComplete(demo, state, `rare_${top.id}`);
    const invoice = lab.invoices.find(item => item.id === top.invoice);
    body = `<p class="eyebrow">Step 2 · 稀有種報告</p><div class="personality-card"><span class="persona-label">辦公室稀有種 · ${top.rarity}</span><h2>${escapeHtml(top.title)}</h2><p>${escapeHtml(top.peerRate)}。分享時只說類型，不揭露原始發票。</p></div>${evidenceDetails(demo, `<div class="invoice-card"><div class="invoice-line"><span>示範品項</span><strong>${escapeHtml(top.item)}</strong></div><div class="invoice-line"><span>原始發票</span><strong>${invoice.id} · ${invoice.date}</strong></div><div class="invoice-line"><span>匿名基準</span><strong>${escapeHtml(top.peerRate)}</strong></div></div><p>正式版需設定最小群體與敏感品類排除，避免從稀有結果反推出個人。</p>`)}<div class="lab-note warning" style="margin-top:14px"><span>!</span><div><strong>反證條件</strong>若同事覺得結果會暴露私生活、需要猜出本人，分享價值就不成立。</div></div>${resultActions(demo, state, `我是辦公室稀有種：${top.title}`)}`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo, { category: "全部", rarity: 60 }));
  document.querySelector("[data-rare-category]")?.addEventListener("change", event => updateState(demo, { category: event.target.value }));
  document.querySelector("[data-rare-period]")?.addEventListener("change", event => updateState(demo, { period: event.target.value }));
  document.querySelector("[data-rarity]")?.addEventListener("input", event => updateState(demo, { rarity: Number(event.target.value) }));
  document.querySelector('[data-act="rare-result"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  bindShared(demo, state, 2);
}

function renderWarranty(demo, state) {
  const selected = lab.warranties.find(item => item.id === (state.warranty || "mouse"));
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "發票還在，權益別過期。", body: "從購買日推估可能期限，讓你標記待處理；沒有商家規則時必須明說只是估計。" });
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 即將到期</p><h2>有 1 項值得今天確認</h2><div class="result-list">${lab.warranties.map(item => `<button class="result-row" data-warranty="${item.id}" style="width:100%;text-align:left;cursor:pointer"><div><strong>${escapeHtml(item.item)}</strong><p>${item.purchase} · ${escapeHtml(item.merchant)} · ${escapeHtml(item.certainty)}</p></div><div class="score">${item.days ? `${item.days} 天` : "規則未知"}</div></button>`).join("")}</div>`;
  else if (state.step === 2) {
    markValue(demo, state, `warranty_${selected.id}`);
    body = `<p class="eyebrow">Step 2 · 期限詳情</p><div class="result-card"><div class="result-banner ${selected.certainty === "未知" ? "warning" : ""}"><h2>${escapeHtml(selected.item)}</h2><p>${selected.certainty === "估計" ? `估計剩 ${selected.days} 天` : "無法由發票判定退換期限"}</p></div><div class="result-content"><div class="invoice-card"><div class="invoice-line"><span>商家／購買日</span><strong>${escapeHtml(selected.merchant)} · ${selected.purchase}</strong></div><div class="invoice-line"><span>示範期限</span><strong>${selected.deadline} · ${escapeHtml(selected.certainty)}</strong></div><div class="invoice-line"><span>規則說明</span><strong>${escapeHtml(selected.rule)}</strong></div></div>${evidenceDetails(demo, `<p>發票能可靠提供購買日期與品項，但退換貨及保固受商家、品牌、商品狀態與法規影響。沒有正式規則來源時，只能提示「請確認」，不能保證權利。</p>`)}<h3 style="margin-top:18px">標記狀態</h3><div class="choice-grid">${["待處理","已退貨","保留商品"].map(value => `<button class="choice-card" data-warranty-status="${value}"><strong>${value}</strong></button>`).join("")}</div></div></div>`;
  } else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, `warranty_status_${state.warrantyStatus}`);
    body = `<p class="eyebrow">Step 3 · 申請資料清單</p><h2>${escapeHtml(state.warrantyStatus)}：資料先準備好</h2><ul class="evidence-list"><li>購買證明：示範發票 ${selected.id === "mouse" ? "A01" : "A03"}</li><li>商品型號／照片：仍需使用者補充</li><li>商家或品牌規則：正式版需查證</li><li>聯絡紀錄：尚未建立</li></ul><div class="lab-note warning" style="margin-top:16px"><span>!</span><div>這是整理清單，不是法律或退換貨資格判定。</div></div>${resultActions(demo, state, `發票幫我找回 ${selected.item} 的處理期限`)}`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo, { warranty: "mouse" }));
  document.querySelectorAll("[data-warranty]").forEach(button => button.addEventListener("click", () => updateState(demo, { warranty: button.dataset.warranty, step: 2 }, { focus: true })));
  document.querySelectorAll("[data-warranty-status]").forEach(button => button.addEventListener("click", () => updateState(demo, { warrantyStatus: button.dataset.warrantyStatus, step: 3 }, { focus: true })));
  bindShared(demo, state, 3);
}

function recipeResults(ingredients) {
  return lab.recipes.map(recipe => {
    const owned = recipe.needs.filter(item => ingredients.includes(item));
    return { ...recipe, coverage: Math.round(owned.length / recipe.needs.length * 100), missing: recipe.needs.filter(item => !ingredients.includes(item)) };
  }).sort((a,b) => b.coverage - a.coverage);
}

function renderFridge(demo, state) {
  const recipes = recipeResults(state.ingredients);
  let body;
  if (state.step === 0) body = startScreen(demo, { title: "今晚吃什麼，先從你可能有的開始。", body: "由近期食品發票推估食材，讓你一步刪改後，立即重算三道料理與覆蓋率。" });
  else if (state.step === 1) body = `<p class="eyebrow">Step 1 · 校正可能食材</p><h2>這三樣，家裡還有嗎？</h2><p class="lead">發票只知道買過，不知道吃完沒。點一下即可保留或移除。</p><div class="ingredient-list">${lab.ingredients.map(item => `<button class="ingredient ${state.ingredients.includes(item) ? "active" : ""}" data-ingredient="${item}" aria-pressed="${state.ingredients.includes(item)}">${state.ingredients.includes(item) ? "✓ " : "+ "}${item}</button>`).join("")}</div><div class="lab-note warning"><span>!</span><div>鮮奶購買日是 8/03，可能已過保存期；本 Demo 只提醒確認，不判定可食用。</div></div><div class="experiment-actions"><button class="button button-primary" data-act="recipes" ${state.ingredients.length ? "" : "disabled"}>用這些食材推薦</button></div>`;
  else if (state.step === "feedback") body = feedbackScreen(demo);
  else if (state.step === "complete") body = completionScreen(demo);
  else {
    markComplete(demo, state, `recipes_${state.ingredients.join("_")}`);
    body = `<p class="eyebrow">Step 2 · 即時重算 ${state.refreshes ? `· 已更新 ${state.refreshes} 次` : ""}</p><h2>今晚最省腦的三個選擇</h2><div class="recipe-grid">${recipes.map(recipe => `<div class="recipe-card"><span class="coverage">${recipe.coverage}%</span><h3>${escapeHtml(recipe.name)}</h3><p>缺：${recipe.missing.length ? recipe.missing.join("、") : "沒有"}</p><small class="hint">約 ${recipe.minutes} 分鐘</small></div>`).join("")}</div>${evidenceDetails(demo, `<p>覆蓋率＝目前確認擁有的必要食材 ÷ 食譜必要食材。它不代表營養、好吃或食品安全。購買日期只能用來提示可能過期，仍需使用者檢查。</p>`)}<h3 style="margin-top:20px">改一下冰箱內容，結果會立刻更新</h3><div class="ingredient-list">${lab.ingredients.map(item => `<button class="ingredient ${state.ingredients.includes(item) ? "active" : ""}" data-ingredient-result="${item}" aria-pressed="${state.ingredients.includes(item)}">${state.ingredients.includes(item) ? "✓ " : "+ "}${item}</button>`).join("")}</div>${resultActions(demo, state, `我的發票替今晚找出 ${recipes[0].name}`)}`;
  }
  app.innerHTML = demoShell(demo, state, body, state.step === "feedback" || state.step === "complete" ? 4 : Number(state.step) + 1, 4);
  document.querySelector('[data-act="start"]')?.addEventListener("click", () => startDemo(demo, { ingredients: [...lab.ingredients] }));
  document.querySelectorAll("[data-ingredient]").forEach(button => button.addEventListener("click", () => toggleIngredient(demo, state, button.dataset.ingredient, false)));
  document.querySelector('[data-act="recipes"]')?.addEventListener("click", () => updateState(demo, { step: 2 }, { focus: true }));
  document.querySelectorAll("[data-ingredient-result]").forEach(button => button.addEventListener("click", () => toggleIngredient(demo, state, button.dataset.ingredientResult, true)));
  bindShared(demo, state, 2);
}

function toggleIngredient(demo, state, item, countRefresh) {
  const exists = state.ingredients.includes(item);
  const ingredients = exists ? state.ingredients.filter(value => value !== item) : [...state.ingredients, item];
  if (!ingredients.length) return showToast("至少保留一項食材，才有可驗證結果");
  updateState(demo, { ingredients, refreshes: state.refreshes + (countRefresh ? 1 : 0) });
}

function renderDemo(demo) {
  const state = stateFor(demo);
  if (!state.opened) {
    state.opened = true;
    track("demo_opened", demo, state);
  }
  const renderers = { recall: renderRecall, price: renderPrice, stock: renderStock, detective: renderDetective, truth: renderTruth, taste: renderTaste, trend: renderTrend, rare: renderRare, warranty: renderWarranty, fridge: renderFridge };
  renderers[demo.id](demo, state);
}

function renderRoute({ focus = true } = {}) {
  modalRoot.innerHTML = "";
  const route = currentRoute();
  const routeDemo = route.page === "demo" && route.id ? getDemo(route.id) : null;
  document.body.dataset.theme = routeDemo?.id ?? "lab";
  setActiveNav(route.page === "demo" ? "gallery" : route.page);
  if (route.page === "gallery") renderGallery();
  else if (route.page === "brief") renderBrief();
  else if (route.page === "next-stage") renderNextStage();
  else if (route.page === "dashboard") renderDashboard();
  else if (routeDemo) renderDemo(routeDemo);
  else {
    app.innerHTML = `<div class="fatal-error"><h1>找不到這項實驗</h1><p>網址可能過期，回到 Gallery 重新選擇。</p><a class="button button-primary" href="#/gallery">回到 Gallery</a></div>`;
  }
  if (focus) {
    window.scrollTo({ top: 0, behavior: "instant" });
    app.focus({ preventScroll: true });
  }
}

window.addEventListener("hashchange", () => renderRoute({ focus: true }));

async function boot() {
  try {
    const response = await fetch("/data/lab-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lab = await response.json();
    if (!location.hash) history.replaceState(null, "", "#/gallery");
    renderRoute({ focus: false });
  } catch (error) {
    app.innerHTML = `<div class="fatal-error"><h1>實驗資料載入失敗</h1><p>${escapeHtml(error.message)}</p><button class="button button-primary" onclick="location.reload()">重新載入</button></div>`;
  }
}

boot();
