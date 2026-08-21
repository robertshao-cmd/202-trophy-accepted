const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const modalRoot = document.querySelector("#modal-root");

const STORAGE = {
  events: "invoice-lab-events-v1",
  feedback: "invoice-lab-feedback-v1",
  session: "invoice-lab-session-v1",
};

const ratingLabels = {
  understanding: "æˆ‘ç†è§£é€™å€‹åŠŸèƒ½çš„ç”¨é€”",
  helpfulness: "é€™å°æˆ‘æœ‰å¹«åŠ©",
  trust: "æˆ‘ç›¸ä¿¡é€™å€‹çµæœ",
  willingness: "æˆ‘é¡˜æ„åœ¨ç™¼ç¥¨è¼‰å…·ä¸­ä½¿ç”¨",
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
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0$/, "") : "â€”";
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
  if (demo.id === "rare") return { ...common, category: "å…¨éƒ¨", period: "å…¨éƒ¨", rarity: 60 };
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
  result.evidenceGrade = feedback.length < 5 ? "æœªå®š" : result.decision === "Build" ? (scoreMetric(result) / 4 >= 4.4 ? "A" : "B+") : result.decision === "Not Now" ? "C" : "å¾…è£œè­‰";
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
          <p class="eyebrow">9 concepts Â· 1 evidence system</p>
          <h1>åˆ¥å…ˆæ„›ä¸Šé»å­ã€‚<br>å…ˆè®“è­‰æ“šèªªè©±ã€‚</h1>
          <p class="lead">ä¹å€‹ç™¼ç¥¨è³‡æ–™æ‡‰ç”¨ï¼Œéƒ½èƒ½çœŸçš„æ“ä½œã€çœ‹è¦‹æ¨è«–ä¾æ“šã€ç•™ä¸‹å›é¥‹ã€‚ç›®æ¨™æ˜¯åœ¨ä¸€å¤©å…§æ‰¾å‡ºå€¼å¾—é€²ä¸‹ä¸€è¼ªçš„ 2â€“3 å€‹æ–¹å‘ã€‚</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#/demo/recall">å¾ç¬¬ä¸€é …å¯¦é©—é–‹å§‹</a>
            <a class="button button-secondary" href="#/dashboard">æŸ¥çœ‹ç›®å‰è­‰æ“š ${feedbackTotal ? `(${feedbackTotal})` : ""}</a>
          </div>
        </div>
        <div class="hero-lab" aria-label="ç™¼ç¥¨é¬¼æ€ªå¯¦é©—æ¨™æœ¬">
          <div class="specimen"><div class="specimen-ghost" aria-hidden="true"></div><span class="specimen-label">å‡è¨­ï¼Œä¸æ˜¯çµè«–</span></div>
        </div>
      </section>
      <div class="lab-note"><span aria-hidden="true">ğŸ§ª</span><div><strong>${escapeHtml(lab.meta.label)}ï½œ${escapeHtml(lab.meta.dataset)}</strong>${escapeHtml(lab.meta.notice)}</div></div>
      <div class="section-head">
        <div><p class="eyebrow">Experiment gallery</p><h2>ä¹é …æœ€å°å¯é©—è­‰é«”é©—</h2><p>åŸå§‹æ’åä¿ç•™ï¼›#4 èˆ‡ #5 å·²åˆä½µç‚ºä¸€å€‹å®Œæ•´æ¨ç†éŠæˆ²ã€‚</p></div>
        <div class="filter-tabs" role="group" aria-label="ç¯©é¸ Demo">
          <button class="filter-tab active" data-filter="all">å…¨éƒ¨ 9</button>
          <button class="filter-tab" data-filter="Prototype">å¯ç›´æ¥æ¸¬</button>
          <button class="filter-tab" data-filter="external">æœ‰å¤–éƒ¨ä¾è³´</button>
        </div>
      </div>
      <section class="demo-grid" aria-label="ä¹é …ç™¼ç¥¨å¯¦é©—">
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
    ? `${metric.feedbackCount} ä»½å›é¥‹ï½œè­‰æ“šè©•ç´š ${metric.evidenceGrade}ï½œä¿¡ä»» ${fmt(metric.trust)}/5ï½œ${metric.decision}`
    : "å°šç„¡è­‰æ“šï¼›å®Œæˆé«”é©—å¾Œæ‰æœƒç”¢ç”Ÿè­‰æ“šå¾Œè©•ç´šã€‚";
  return `<article class="demo-card demo-card-${demo.id}" data-demo="${demo.id}" data-status="${escapeHtml(demo.status)}">
    <div class="demo-card-top">
      <div class="demo-id"><span class="demo-icon" aria-hidden="true">${demo.icon}</span><div><span class="demo-number">ORIGINAL RANK ${originalRankLabel(demo)}</span><h3>${escapeHtml(demo.title)}</h3></div></div>
      <span class="grade" title="åŸå§‹è©•ç´š">${escapeHtml(demo.grade)}</span>
    </div>
    <p class="demo-tagline">${escapeHtml(demo.tagline)}</p>
    <dl class="fact-list">
      <div class="fact"><dt>è§£æ±ºå•é¡Œ</dt><dd>${escapeHtml(demo.problem)}</dd></div>
      <div class="fact"><dt>æ ¸å¿ƒå‡è¨­</dt><dd>${escapeHtml(demo.assumption)}</dd></div>
      <div class="fact"><dt>è³‡æ–™éœ€æ±‚</dt><dd>${escapeHtml(demo.dependency)}</dd></div>
      <div class="fact"><dt>è¨­è¨ˆåŸå‹</dt><dd><strong>${escapeHtml(demo.design.pattern)}</strong><br>${escapeHtml(demo.design.principle)}</dd></div>
    </dl>
    <div>
      <div class="demo-card-foot"><span class="status-badge">${escapeHtml(demo.status)}</span><a class="button button-primary" href="#/demo/${demo.id}">é–‹å§‹é«”é©—</a></div>
      <div class="evidence-summary"><strong>è­‰æ“šæ‘˜è¦ï¼š</strong>${escapeHtml(result)}</div>
    </div>
  </article>`;
}

function renderBrief() {
  const rice = [...lab.demos].sort((a, b) => b.rice - a.rice);
  app.innerHTML = `<div class="page page-narrow">
    <p class="eyebrow">Validation brief</p>
    <h1>é€™æ¬¡ä¸æ˜¯é¸æœ€é…·ï¼Œ<br>æ˜¯æ‰¾æœ€å€¼å¾—é©—è­‰ã€‚</h1>
    <p class="lead">ç¬¬ä¸€è¼ªæ±ºç­–æ˜¯ Evidence Firstã€‚æ‰€æœ‰ç›®æ¨™æ—ç¾¤ã€éœ€æ±‚èˆ‡æ’åä»æ˜¯å‡è¨­ï¼Œå¿…é ˆç”¨ä»»å‹™å®Œæˆã€ä¿¡ä»»èˆ‡ä½¿ç”¨æ„é¡˜ä¾†åé§ã€‚</p>
    <section class="brief-section"><h2>Problem Brief</h2><div class="brief-card">
      <h3>èª°ï¼è§£ä»€éº¼å•é¡Œ</h3>
      <p>ç›®æ¨™ä½¿ç”¨è€…æ˜¯å‡è¨­ç‚ºï¼šå·²ç¶å®šè¼‰å…·ã€ç´¯ç©è¶³å¤ æ˜ç´°ã€ä¸æƒ³æ‰‹å‹•æ•´ç†ã€åˆåœ¨æ„æ¨è«–å¯ä¿¡åº¦çš„å°ç£æ¶ˆè²»è€…ã€‚ç¬¬ä¸€è¼ªä¾¿åˆ©æ¨£æœ¬æ˜¯ 20â€“35 æ­²ã€é«˜é »å¤–é£Ÿã€ç†Ÿæ‚‰ LINEï¼IG åˆ†äº«çš„å…§éƒ¨åŒäº‹ã€‚</p>
      <p><strong>JTBDï¼š</strong>ç•¶æˆ‘ç´¯ç©å¤§é‡ç™¼ç¥¨å¾Œï¼Œä¸»å‹•æ›¿æˆ‘æ‰¾å‡ºèƒ½çœéŒ¢ã€é¿å…æå¤±æˆ–å€¼å¾—åˆ†äº«çš„æ´å¯Ÿï¼Œè€Œä¸”è®“æˆ‘å¿«é€Ÿåˆ¤æ–·å®ƒç‚ºä½•å¯ä¿¡ã€‚</p>
      <p><strong>ç¾è¡Œæ›¿ä»£ï¼š</strong>è‡ªå·±ç¿»è¼‰å…·ï¼éŠ€è¡Œç´€éŒ„ã€é è¨˜æ†¶ç®¡ç†åº«å­˜èˆ‡æœŸé™ã€æŸ¥åƒ¹ï¼Œæˆ–å®Œå…¨ä¸è™•ç†ã€‚</p>
    </div></section>
    <section class="brief-section"><h2>æœ€å±éšªå‡è¨­</h2><div class="brief-card">
      <p><strong>ä½¿ç”¨è€…é¡˜æ„ç›¸ä¿¡ã€Œä¸å®Œæ•´ç™¼ç¥¨è³‡æ–™ï¼‹å¿…è¦å¤–éƒ¨è³‡æ–™ã€ç”¢ç”Ÿçš„ä¸»å‹•æ¨è«–ï¼Œä¸¦æ“šæ­¤æ¡å–è¡Œå‹•ã€‚</strong>å¦‚æœé€™é»ä¸æˆç«‹ï¼Œä¹å€‹æ¦‚å¿µæœ€å¤šåªèƒ½æˆç‚ºä¸€æ¬¡æ€§å¨›æ¨‚ã€‚</p>
      <div class="lab-note warning"><span>âš¡</span><div><strong>æœ€ä¾¿å®œæ¸¬æ³•</strong>ä»¥å›ºå®šè³‡æ–™è®“ 5â€“8 ä½ç›®æ¨™ä½¿ç”¨è€…å®Œæˆä»»å‹™ï¼›é‡æ¸¬ 30 ç§’å…§æ˜¯å¦çœ‹è¦‹åƒ¹å€¼ã€å››é …è©•åˆ†ã€æˆæ¬Šæ„é¡˜ï¼Œä¸¦è¦æ±‚æŒ‡å‡ºæœ€ä¸å¯ä¿¡ä¹‹è™•ã€‚åªæ›¿å‰ 2â€“3 åæ¥çœŸå¯¦è³‡æ–™ã€‚</div></div>
    </div></section>
    <section class="brief-section"><h2>å››é¢å‘é¢¨éšª</h2><div class="brief-card"><ul>
      <li><strong>Desirabilityï¼š</strong>æ–°å¥‡æ˜¯å¦èƒ½è½‰æˆæŒçºŒå›è¨ªï¼Œè€Œä¸æ˜¯ç©ä¸€æ¬¡ã€‚</li>
      <li><strong>Valueï¼š</strong>æ˜¯å¦èƒ½å¸¶å‹•ç¶å®šã€ç•™å­˜æˆ–å¯è¡¡é‡çš„é¿å…æå¤±ã€‚</li>
      <li><strong>Feasibilityï¼š</strong>å•†å“æ­£è¦åŒ–ã€å–®ä½æ›ç®—ã€äº‹ä»¶èˆ‡è¦å‰‡è³‡æ–™æ˜¯å¦è¶³å¤ ã€‚</li>
      <li><strong>Usabilityï¼š</strong>æ˜¯å¦èƒ½åœ¨ 30 ç§’å…§åŒæ™‚çœ‹æ‡‚çµè«–ã€ä¾æ“šèˆ‡é™åˆ¶ã€‚</li>
    </ul></div></section>
    <section class="brief-section"><h2>RICE é‡æ–°æ’åº</h2><p class="muted">ç›¸å°ä¼°å€¼åªç”¨æ–¼å®‰æ’æ¸¬è©¦é †åºï¼›Confidence æ˜¯è­‰æ“šä¿¡å¿ƒï¼Œä¸æ˜¯æˆåŠŸç‡ã€‚</p>
      <div class="table-wrap"><table><thead><tr><th>RICE</th><th>åŸæ’</th><th>æ¦‚å¿µ</th><th>åˆ†æ•¸</th><th>åˆ¤æ–·</th></tr></thead><tbody>
        ${rice.map((demo, index) => `<tr><td>#${index + 1}</td><td>#${demo.rank}ï¼${demo.grade}</td><td><a href="#/demo/${demo.id}">${escapeHtml(demo.title)}</a></td><td>${fmt(demo.rice, 2)}</td><td>${decisionBadge(metricsFor(demo).decision)}</td></tr>`).join("")}
      </tbody></table></div>
    </section>
    <section class="brief-section"><h2>æ±ºç­–é–€æª»</h2><div class="brief-card"><p>æ¯å€‹æ¦‚å¿µè‡³å°‘ 5 ä»½æœ‰æ•ˆå›é¥‹ï¼Œä¸”å®Œæˆç‡ â‰¥80%ã€ç†è§£èˆ‡å¹«åŠ© â‰¥4/5ã€ä¿¡ä»» â‰¥3.5/5ã€ä½¿ç”¨æ„é¡˜ â‰¥60%ï¼Œä¸¦ä¸”æ²’æœ‰ä¸å¯è§£çš„è³‡æ–™ï¼æ³•è¦ä¾è³´ï¼Œæ‰å¯æ¨™è¨˜ Buildã€‚</p></div></section>
  </div>`;
}

function renderNextStage() {
  app.innerHTML = `<div class="page product-stage-page">
    <section class="stage-hero">
      <div><p class="eyebrow">Stage 4.5 Â· High-fidelity validation</p><h1>ä¹å€‹ç”¢å“ï¼Œ<br>ä¸è©²é•·å¾—åƒåŒä¸€å€‹ Promptã€‚</h1><p class="lead">å…±ç”¨è³‡æ–™èª ä¿¡ã€å›é¥‹èˆ‡å¯åŠæ€§ï¼›ä½†æ¯å€‹ç”¢å“ä¾è‡ªå·±çš„ä½¿ç”¨æƒ…å¢ƒå»ºç«‹è¦–è¦ºèªè¨€ã€‚#4 èˆ‡ #5 å·²åˆä½µç‚ºåŒä¸€å€‹ç™¼ç¥¨æ¨ç†å±€ã€‚</p></div>
      <div class="stage-position"><span>ç›®å‰ä½ç½®</span><strong>SPEC â†’ VALIDATE</strong><p>ä¸‹ä¸€å€‹ Gateï¼š5â€“8 ä½ç›®æ¨™ä½¿ç”¨è€…å®Œæˆä»»å‹™æ¸¬è©¦</p></div>
    </section>
    <div class="stage-track" aria-label="ç”¢å“é–‹ç™¼éšæ®µ">
      ${["Intake","Frame","Risk","Decide","Spec","Execute","Launch"].map((label,index) => `<div class="stage-node ${index < 5 ? "done" : index === 5 ? "next" : ""}"><span>${index}</span><strong>${label}</strong></div>`).join("")}
    </div>
    <div class="lab-note warning"><span>âœ¦×{ÖÚ$z{-®éÜj×ãÇ6ÖÆÃâG¶—FVÒç66÷&WÒ+rG¶W66T‡FÖÂ†—FVÒæÆ&VÂ—ÓÂ÷6ÖÆÃãÂö'WGFöãæ’æ¦ö–â‚""—ÓÂöF—câG·&W7VÇD7F–öç2†FVÖòÂ7FFRÂh‰y¨N‹yşš*hÈ~i[‚G·6VÆV7FVBç66÷&WŞûÉ¢G·6VÆV7FVBæÆ&VÇÖ—ÓÂöF—cãÂöF—cæ°¢Ğ¢æ–ææW$…DÔÂÒFVÖõ6†VÆÂ†FVÖòÂ7FFRÂ&öG’Â7FFRç7FWÓÓÒ&fVVF&6²"ÇÂ7FFRç7FWÓÓÒ&6ö×ÆWFR"òB¢çVÖ&W"‡7FFRç7FW’²ÂB“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'7F'B%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ7F'DFVÖò†FVÖòÂ²G&VæC¢'V6‚"Ò’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&VæEÒ"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²G&VæC¢'WGFöâæFF6WBçG&VæBÒ’’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'G&VæB×&W7VÇB%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²7FW¢"ÒÂ²fö7W3¢G'VRÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&VæB×&W7VÇEÒ"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²G&VæC¢'WGFöâæFF6WBçG&VæE&W7VÇBÒ’’“°¢&–æE6†&VB†FVÖòÂ7FFRÂ"“°§Ğ ¦gVæ7F–öâ&VæFW%&&R†FVÖòÂ7FFR’°¢6öç7B6FVv÷&–W2Ò².XZ˜:‚"ÂââææWr6WB†Æ"ç&&Tf–æG2æÖ†—FVÒÓâ—FVÒæ6FVv÷'’’•Ó°¢6öç7B7WFöfbÒ7FFRçW&–öBÓÓÒ.iÈ‹ùBZJ’"ò###bÓ‚Ób"¢7FFRçW&–öBÓÓÒ.iÈ‹ù3ZJ’"ò###bÓrÓ#"¢#ÓÓ#°¢6öç7B&W7VÇG2ÒÆ"ç&&Tf–æG2æf–ÇFW"†—FVÒÓâ‡7FFRæ6FVv÷'’ÓÓÒ.XZ˜:‚"ÇÂ—FVÒæ6FVv÷'’ÓÓÒ7FFRæ6FVv÷'’’bb—FVÒæFFRãÒ7WFöfbbb—FVÒç&&—G’ãÒ7FFRç&&—G’“°¢ÆWB&öG“°¢–b‡7FFRç7FWÓÓÒ’&öG’Ò7F'E67&VVâ†FVÖòÂ²F—FÆS¢#32X¾K«®Š:ûÈÎY:®KˆzØnXú®iÈKÚiÈ>‹+~ûÉò"Â&öG“¢.YÊXËşYŞ‹ênXZÎZêNYû®k©nKŠŞh›î[	Šh¾jŠ[ÈşûÈÎkŠÎŠšnZè>ˆ;ŞY
nX›^˜
ZèXZ8Z[ŞzÉy¨NXˆnKª¾ynyK8""ÒÂÆF—b6Æ73Ò&Æ"Öæ÷FR#ãÇ7ãï	ùI#Â÷7ããÆF—cîXˆnKª¾XÚKˆŞY
¾Zy>YŞ8YXnZën8iz^iÉş8˜yšŞh‰nXéşZx¾iˆî{K8#ÂöF—cãÂöF—cæ“°¢VÇ6R–b‡7FFRç7FWÓÓÒ’&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW+rŠŠŞZé®zˆiÈ[ªcÂ÷ãÆƒ#îXXk®Zé®KÚh;>ZI®h
®8#Âöƒ#ãÆF—b6Æ73Ò&f–ÇFW"Öf÷&Ò#ãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãîšîYè³Â÷7ããÇ6VÆV7BFF×&&RÖ6FVv÷'“âG¶6FVv÷&–W2æÖ‡fÇVRÓâÆ÷F–öâG·7FFRæ6FVv÷'’ÓÓÒfÇVRò'6VÆV7FVB"¢"'ÓâG·fÇVWÓÂö÷F–öãæ’æ¦ö–â‚""—ÓÂ÷6VÆV7CãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãîiÉş™i3Â÷7ããÇ6VÆV7BFF×&&R×W&–öCãÆ÷F–öãîXZ˜:ƒÂö÷F–öããÆ÷F–öãîiÈ‹ùBZJ“Âö÷F–öããÆ÷F–öãîiÈ‹ù3ZJ“Âö÷F–öããÂ÷6VÆV7CãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãîiÈKØîzˆiÈ[ªcÂ÷7ããÆF—b6Æ73Ò'&ævRÖÆ–æR#ãÆ–çWBFF×&&—G’G—SÒ'&ævR"Ö–ãÒ#S"ÖƒÒ#“R"fÇVSÒ"G·7FFRç&&—G—Ò#ãÇ7G&öæsâG·7FFRç&&—G—ÓÂ÷7G&öæsãÂöF—cãÂöÆ&VÃãÂöF—cãÆF—b6Æ73Ò'&W7VÇBÖÆ—7B#âG·&W7VÇG2æÖ†—FVÒÓâÆF—b6Æ73Ò'&W7VÇB×&÷r#ãÆF—cãÇ7G&öæsâG¶W66T‡FÖÂ†—FVÒçF—FÆR—ÓÂ÷7G&öæsãÇâG¶W66T‡FÖÂ†—FVÒæ—FVÒ—Ò+rG¶W66T‡FÖÂ†—FVÒçVW%&FR—ÓÂ÷ãÂöF—cãÆF—b6Æ73Ò'66÷&R#âG¶—FVÒç&&—G—ÓÂöF—cãÂöF—cæ’æ¦ö–â‚""’ÇÂÆF—b6Æ73Ò&V×G’×7FFR#î˜	X¾j)ŞK»nk).iÈzK®zøN{YiéÎûÈÎŠ«şKØîzˆiÈ[ªnXhŞh›îKˆjÊ8#ÂöF—cæÓÂöF—cãÆF—b6Æ73Ò&W‡W&–ÖVçBÖ7F–öç2#ãÆ'WGFöâ6Æ73Ò&'WGFöâ'WGFöâ×&–Ö'’"FFÖ7CÒ'&&R×&W7VÇB"G·&W7VÇG2æÆVæwF‚ò""¢&F—6&ÆVB'Óîiú^yÈ¾iÈzˆiÈŠØi9£Âö'WGFöããÂöF—cæ°¢VÇ6R–b‡7FFRç7FWÓÓÒ&fVVF&6²"’&öG’ÒfVVF&6µ67&VVâ†FVÖò“°¢VÇ6R–b‡7FFRç7FWÓÓÒ&6ö×ÆWFR"’&öG’Ò6ö×ÆWF–öå67&VVâ†FVÖò“°¢VÇ6R°¢6öç7BF÷Ò&W7VÇG2ç6÷'B‚†Æ"’Óâ"ç&&—G’Òç&&—G’•³ÒÇÂÆ"ç&&Tf–æG5³Ó°¢Ö&´6ö×ÆWFR†FVÖòÂ7FFRÂ&&UòG·F÷æ–GÖ“°¢6öç7B–çfö–6RÒÆ"æ–çfö–6W2æf–æB†—FVÒÓâ—FVÒæ–BÓÓÒF÷æ–çfö–6R“°¢&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW"+rzˆiÈzŠîZY£Â÷ãÆF—b6Æ73Ò'W'6öæÆ—G’Ö6&B#ãÇ7â6Æ73Ò'W'6öæÖÆ&VÂ#î‹ênXZÎZêNzˆiÈzŠâ+rG·F÷ç&&—G—ÓÂ÷7ããÆƒ#âG¶W66T‡FÖÂ‡F÷çF—FÆR—ÓÂöƒ#ãÇâG¶W66T‡FÖÂ‡F÷çVW%&FR—Ş8.XˆnKª¾i˜.Xú®Šª®šîYè¾ûÈÎKˆŞhúŞ™Ë.XéşZx¾y›ÎzZ8#Â÷ãÂöF—câG¶Wf–FVæ6TFWF–Ç2†FVÖòÂÆF—b6Æ73Ò&–çfö–6RÖ6&B#ãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîzK®zøNY8šSÂ÷7ããÇ7G&öæsâG¶W66T‡FÖÂ‡F÷æ—FVÒ—ÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîXéşZx¾y›ÎzZƒÂ÷7ããÇ7G&öæsâG¶–çfö–6Ræ–GÒ+rG¶–çfö–6RæFFWÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîXËşYŞYû®k©cÂ÷7ããÇ7G&öæsâG¶W66T‡FÖÂ‡F÷çVW%&FR—ÓÂ÷7G&öæsãÂöF—cãÂöF—cãÇîjÚ>[Èşx˜™ÈŠŠŞZé®iÈ[ş{êNš¹Nˆˆ~iXşhIşY8šîhé.™šNûÈÎ˜şXXŞ[éîzˆiÈ{YiéÎXøŞhêX{®X¾K«®8#Â÷æ—ÓÆF—b6Æ73Ò&Æ"Öæ÷FRv&æ–ær"7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÇ7ãâÂ÷7ããÆF—cãÇ7G&öæsîXøŞŠØj)ŞK»cÂ÷7G&öæsîˆº^YÎK¨¾Šk®[é~{YiéÎiÈ>i«N™Ë.zxyIşkK¾8™ÈŠhxÉÎX{®iÊÎK«®ûÈÎXˆnKª¾X;XÎ[KˆŞh‰z¸¾8#ÂöF—cãÂöF—câG·&W7VÇD7F–öç2†FVÖòÂ7FFRÂh‰iŠş‹ênXZÎZêNzˆiÈzŠîûÉ¢G·F÷çF—FÆWÖ—Ö°¢Ğ¢æ–ææW$…DÔÂÒFVÖõ6†VÆÂ†FVÖòÂ7FFRÂ&öG’Â7FFRç7FWÓÓÒ&fVVF&6²"ÇÂ7FFRç7FWÓÓÒ&6ö×ÆWFR"òB¢çVÖ&W"‡7FFRç7FW’²ÂB“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'7F'B%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ7F'DFVÖò†FVÖòÂ²6FVv÷'“¢.XZ˜:‚"Â&&—G“¢cÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚%¶FF×&&RÖ6FVv÷'•Ò"“òæFDWfVçDÆ—7FVæW"‚&6†ævR"ÂWfVçBÓâWFFU7FFR†FVÖòÂ²6FVv÷'“¢WfVçBçF&vWBçfÇVRÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚%¶FF×&&R×W&–öEÒ"“òæFDWfVçDÆ—7FVæW"‚&6†ævR"ÂWfVçBÓâWFFU7FFR†FVÖòÂ²W&–öC¢WfVçBçF&vWBçfÇVRÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚%¶FF×&&—G•Ò"“òæFDWfVçDÆ—7FVæW"‚&–çWB"ÂWfVçBÓâWFFU7FFR†FVÖòÂ²&&—G“¢çVÖ&W"†WfVçBçF&vWBçfÇVR’Ò’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'&&R×&W7VÇB%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²7FW¢"ÒÂ²fö7W3¢G'VRÒ’“°¢&–æE6†&VB†FVÖòÂ7FFRÂ"“°§Ğ ¦gVæ7F–öâ&VæFW%v'&çG’†FVÖòÂ7FFR’°¢6öç7B6VÆV7FVBÒÆ"çv'&çF–W2æf–æB†—FVÒÓâ—FVÒæ–BÓÓÒ‡7FFRçv'&çG’ÇÂ&Ö÷W6R"’“°¢ÆWB&öG“°¢–b‡7FFRç7FWÓÓÒ’&öG’Ò7F'E67&VVâ†FVÖòÂ²F—FÆS¢.y›ÎzZ˜(NYÊûÈÎjÈ®y¸®XŠ^˜îiÉş8""Â&öG“¢.[éî‹;Î‹+~iz^hêKËXúşˆ;ŞiÉş™™ûÈÎŠé>KÚj‰Š‰[è^‰™^ynûÉ¾k).iÈYXnZënŠhşX˜~i˜.[ø^šiˆîŠª®Xú®iŠşKËŠˆ8""Ò“°¢VÇ6R–b‡7FFRç7FWÓÓÒ’&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW+rXÛ>[~X‹iÉóÂ÷ãÆƒ#îiÈ’š^XÎ[é~K¸®ZJz+®Š¨ÓÂöƒ#ãÆF—b6Æ73Ò'&W7VÇBÖÆ—7B#âG¶Æ"çv'&çF–W2æÖ†—FVÒÓâÆ'WGFöâ6Æ73Ò'&W7VÇB×&÷r"FF×v'&çG“Ò"G¶—FVÒæ–GÒ"7G–ÆSÒ'v–GFƒ£S·FW‡BÖÆ–vã¦ÆVgC¶7W'6÷#§ö–çFW"#ãÆF—cãÇ7G&öæsâG¶W66T‡FÖÂ†—FVÒæ—FVÒ—ÓÂ÷7G&öæsãÇâG¶—FVÒçW&6†6WÒ+rG¶W66T‡FÖÂ†—FVÒæÖW&6†çB—Ò+rG¶W66T‡FÖÂ†—FVÒæ6W'F–çG’—ÓÂ÷ãÂöF—cãÆF—b6Æ73Ò'66÷&R#âG¶—FVÒæF—2òG¶—FVÒæF—7ÒZJ–¢.ŠhşX˜~iÊ®yúR'ÓÂöF—cãÂö'WGFöãæ’æ¦ö–â‚""—ÓÂöF—cæ°¢VÇ6R–b‡7FFRç7FWÓÓÒ"’°¢Ö&µfÇVR†FVÖòÂ7FFRÂv'&çG•òG·6VÆV7FVBæ–GÖ“°¢&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW"+riÉş™™Š›>h8SÂ÷ãÆF—b6Æ73Ò'&W7VÇBÖ6&B#ãÆF—b6Æ73Ò'&W7VÇBÖ&ææW"G·6VÆV7FVBæ6W'F–çG’ÓÓÒ.iÊ®yúR"ò'v&æ–ær"¢"'Ò#ãÆƒ#âG¶W66T‡FÖÂ‡6VÆV7FVBæ—FVÒ—ÓÂöƒ#ãÇâG·6VÆV7FVBæ6W'F–çG’ÓÓÒ.KËŠˆ‚"òKËŠˆXš’G·6VÆV7FVBæF—7ÒZJ–¢.xJk9^yKy›ÎzZXŠNZé®˜hù¾iÉş™™'ÓÂ÷ãÂöF—cãÆF—b6Æ73Ò'&W7VÇBÖ6öçFVçB#ãÆF—b6Æ73Ò&–çfö–6RÖ6&B#ãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîYXnZënûÈş‹;Î‹+~izSÂ÷7ããÇ7G&öæsâG¶W66T‡FÖÂ‡6VÆV7FVBæÖW&6†çB—Ò+rG·6VÆV7FVBçW&6†6WÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîzK®zøNiÉş™™Â÷7ããÇ7G&öæsâG·6VÆV7FVBæFVFÆ–æWÒ+rG¶W66T‡FÖÂ‡6VÆV7FVBæ6W'F–çG’—ÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ73Ò&–çfö–6RÖÆ–æR#ãÇ7ãîŠhşX˜~Šª®iˆãÂ÷7ããÇ7G&öæsâG¶W66T‡FÖÂ‡6VÆV7FVBç'VÆR—ÓÂ÷7G&öæsãÂöF—cãÂöF—câG¶Wf–FVæ6TFWF–Ç2†FVÖòÂÇîy›ÎzZˆ;ŞXúş™ÚhùKé¾‹;Î‹+~iz^iÉşˆˆ~Y8š^ûÈÎKØn˜hù¾‹*Xø®KùŞY»®Xù~YXnZën8Y8x˜Î8YXnY8x¸hX¾ˆˆ~k9^Šhş[Û™ûş8.k).iÈjÚ>[ÈşŠhşX˜~Kènk©i˜.ûÈÎXú®ˆ;ŞhùzK®8ÎŠ¸¾z+®Š¨Ş8ŞûÈÎKˆŞˆ;ŞKùŞŠØjÈ®XŠ8#Â÷æ—ÓÆƒ27G–ÆSÒ&Ö&v–â×F÷£‡‚#îj‰Š‰x¸hX³Âöƒ3ãÆF—b6Æ73Ò&6†ö–6RÖw&–B#âGµ².[è^‰™^yb"Â.[{.˜‹*‚"Â.KùŞyYYXnY8%ÒæÖ‡fÇVRÓâÆ'WGFöâ6Æ73Ò&6†ö–6RÖ6&B"FF×v'&çG’×7FGW3Ò"G·fÇVWÒ#ãÇ7G&öæsâG·fÇVWÓÂ÷7G&öæsãÂö'WGFöãæ’æ¦ö–â‚""—ÓÂöF—cãÂöF—cãÂöF—cæ°¢ÒVÇ6R–b‡7FFRç7FWÓÓÒ&fVVF&6²"’&öG’ÒfVVF&6µ67&VVâ†FVÖò“°¢VÇ6R–b‡7FFRç7FWÓÓÒ&6ö×ÆWFR"’&öG’Ò6ö×ÆWF–öå67&VVâ†FVÖò“°¢VÇ6R°¢Ö&´6ö×ÆWFR†FVÖòÂ7FFRÂv'&çG•÷7FGW5òG·7FFRçv'&çG•7FGW7Ö“°¢&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW2+ryK>Š¸¾‹8~iikˆ^YjãÂ÷ãÆƒ#âG¶W66T‡FÖÂ‡7FFRçv'&çG•7FGW2—ŞûÉ®‹8~iiXXk©nX)Z[ÓÂöƒ#ãÇVÂ6Æ73Ò&Wf–FVæ6RÖÆ—7B#ãÆÆ“î‹;Î‹+~ŠØiˆîûÉ®zK®zøNy›ÎzZ‚G·6VÆV7FVBæ–BÓÓÒ&Ö÷W6R"ò$"¢$2'ÓÂöÆ“ãÆÆ“îYXnY8Yè¾‰™şûÈşxZ~x˜~ûÉ®K¸Ş™ÈKÛşyJˆ^Š9ÎXXSÂöÆ“ãÆÆ“îYXnZënh‰nY8x˜ÎŠhşX˜~ûÉ®jÚ>[Èşx˜™Èiú^ŠØ“ÂöÆ“ãÆÆ“îˆş{Z{H˜ÈNûÉ®[	®iÊ®[»®z¸³ÂöÆ“ãÂ÷VÃãÆF—b6Æ73Ò&Æ"Öæ÷FRv&æ–ær"7G–ÆSÒ&Ö&v–â×F÷£g‚#ãÇ7ãâÂ÷7ããÆF—cî˜	iŠşi[Nynkˆ^YjîûÈÎKˆŞiŠşk9^[è¾h‰n˜hù¾‹*‹8~jÎXŠNZé®8#ÂöF—cãÂöF—câG·&W7VÇD7F–öç2†FVÖòÂ7FFRÂy›ÎzZ[š¾h‰h›îY¹âG·6VÆV7FVBæ—FV×Òy¨N‰™^yniÉş™™—Ö°¢Ğ¢æ–ææW$…DÔÂÒFVÖõ6†VÆÂ†FVÖòÂ7FFRÂ&öG’Â7FFRç7FWÓÓÒ&fVVF&6²"ÇÂ7FFRç7FWÓÓÒ&6ö×ÆWFR"òB¢çVÖ&W"‡7FFRç7FW’²ÂB“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'7F'B%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ7F'DFVÖò†FVÖòÂ²v'&çG“¢&Ö÷W6R"Ò’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×v'&çG•Ò"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²v'&çG“¢'WGFöâæFF6WBçv'&çG’Â7FW¢"ÒÂ²fö7W3¢G'VRÒ’’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FF×v'&çG’×7FGW5Ò"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²v'&çG•7FGW3¢'WGFöâæFF6WBçv'&çG•7FGW2Â7FW¢2ÒÂ²fö7W3¢G'VRÒ’’“°¢&–æE6†&VB†FVÖòÂ7FFRÂ2“°§Ğ ¦gVæ7F–öâ&V6—U&W7VÇG2†–æw&VF–VçG2’°¢&WGW&âÆ"ç&V6—W2æÖ‡&V6—RÓâ°¢6öç7B÷væVBÒ&V6—RææVVG2æf–ÇFW"†—FVÒÓâ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’“°¢&WGW&â²ââç&V6—RÂ6÷fW&vS¢ÖF‚ç&÷VæB†÷væVBæÆVæwF‚ò&V6—RææVVG2æÆVæwF‚¢’ÂÖ—76–æs¢&V6—RææVVG2æf–ÇFW"†—FVÒÓâ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’’Ó°¢Ò’ç6÷'B‚†Æ"’Óâ"æ6÷fW&vRÒæ6÷fW&vR“°§Ğ ¦gVæ7F–öâ&VæFW$g&–FvR†FVÖòÂ7FFR’°¢6öç7B&V6—W2Ò&V6—U&W7VÇG2‡7FFRæ–æw&VF–VçG2“°¢ÆWB&öG“°¢–b‡7FFRç7FWÓÓÒ’&öG’Ò7F'E67&VVâ†FVÖòÂ²F—FÆS¢.K¸®i™®Y>K¸›«ÎûÈÎXX[éîKÚXúşˆ;ŞiÈy¨N™h¾Zx¾8""Â&öG“¢.yK‹ùiÉşš9şY8y›ÎzZhêKËš9şiÙûÈÎŠé>KÚKˆjÚ^XŠ®iK[èÎûÈÎz¸¾XÛ>˜xŞzé~Kˆ˜>iiynˆˆ~Šhn‰8¾xè~8""Ò“°¢VÇ6R–b‡7FFRç7FWÓÓÒ’&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW+rj
jÚ>Xúşˆ;Şš9şiÙÂ÷ãÆƒ#î˜	KˆjŠ>ûÈÎZënŠ:˜(NiÈYxîûÉóÂöƒ#ãÇ6Æ73Ò&ÆVB#îy›ÎzZXú®yú^˜>‹+~˜îûÈÎKˆŞyú^˜>Y>ZèÎk).8.›¹îKˆKˆ¾XÛ>XúşKùŞyYh‰nz{¾™šN8#Â÷ãÆF—b6Æ73Ò&–æw&VF–VçBÖÆ—7B#âG¶Æ"æ–æw&VF–VçG2æÖ†—FVÒÓâÆ'WGFöâ6Æ73Ò&–æw&VF–VçBG·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’ò&7F—fR"¢"'Ò"FFÖ–æw&VF–VçCÒ"G¶—FV×Ò"&–×&W76VCÒ"G·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ—Ò#âG·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’ò.)É2"¢"²'ÒG¶—FV×ÓÂö'WGFöãæ’æ¦ö–â‚""—ÓÂöF—cãÆF—b6Æ73Ò&Æ"Öæ÷FRv&æ–ær#ãÇ7ãâÂ÷7ããÆF—cîšêîZ[n‹;Î‹+~iz^iŠò‚ó>ûÈÎXúşˆ;Ş[{.˜îKùŞZÙiÉşûÉ¾iÊÂFVÖòXú®hù˜i.z+®Š¨ŞûÈÎKˆŞXŠNZé®Xúşš9şyJ8#ÂöF—cãÂöF—cãÆF—b6Æ73Ò&W‡W&–ÖVçBÖ7F–öç2#ãÆ'WGFöâ6Æ73Ò&'WGFöâ'WGFöâ×&–Ö'’"FFÖ7CÒ'&V6—W2"G·7FFRæ–æw&VF–VçG2æÆVæwF‚ò""¢&F—6&ÆVB'ÓîyJ˜	K©¾š9şiÙhê‰jcÂö'WGFöããÂöF—cæ°¢VÇ6R–b‡7FFRç7FWÓÓÒ&fVVF&6²"’&öG’ÒfVVF&6µ67&VVâ†FVÖò“°¢VÇ6R–b‡7FFRç7FWÓÓÒ&6ö×ÆWFR"’&öG’Ò6ö×ÆWF–öå67&VVâ†FVÖò“°¢VÇ6R°¢Ö&´6ö×ÆWFR†FVÖòÂ7FFRÂ&V6—W5òG·7FFRæ–æw&VF–VçG2æ¦ö–â‚%ò"—Ö“°¢&öG’ÒÇ6Æ73Ò&W–V'&÷r#å7FW"+rXÛ>i˜.˜xŞzérG·7FFRç&Vg&W6†W2ò+r[{.i»NikG·7FFRç&Vg&W6†W7ÒjÊ¢"'ÓÂ÷ãÆƒ#îK¸®i™®iÈyÈˆZny¨NKˆX¾˜i8sÂöƒ#ãÆF—b6Æ73Ò'&V6—RÖw&–B#âG·&V6—W2æÖ‡&V6—RÓâÆF—b6Æ73Ò'&V6—RÖ6&B#ãÇ7â6Æ73Ò&6÷fW&vR#âG·&V6—Ræ6÷fW&vWÒSÂ÷7ããÆƒ3âG¶W66T‡FÖÂ‡&V6—RææÖR—ÓÂöƒ3ãÇî{Ë®ûÉ¢G·&V6—RæÖ—76–æræÆVæwF‚ò&V6—RæÖ—76–æræ¦ö–â‚.8"’¢.k).iÈ’'ÓÂ÷ãÇ6ÖÆÂ6Æ73Ò&†–çB#î{HBG·&V6—RæÖ–çWFW7ÒXˆn™	ƒÂ÷6ÖÆÃãÂöF—cæ’æ¦ö–â‚""—ÓÂöF—câG¶Wf–FVæ6TFWF–Ç2†FVÖòÂÇîŠhn‰8¾xè~ûÉŞyºîX˜Şz+®Š¨Şi8iÈy¨N[ø^Šhš9şiÙ;rš9şŠÙÎ[ø^Šhš9şiÙ8.Zè>KˆŞKº>ŠxyşšH®8Z[ŞY>h‰nš9şY8ZèXZ8.‹;Î‹+~iz^iÉşXú®ˆ;ŞyJKènhùzK®Xúşˆ;Ş˜îiÉşûÈÎK¸Ş™ÈKÛşyJˆ^jª.iú^8#Â÷æ—ÓÆƒ27G–ÆSÒ&Ö&v–â×F÷£#‚#îiKKˆKˆ¾XkzëXZ~ZëûÈÎ{YiéÎiÈ>z¸¾X‹¾i»NikÂöƒ3ãÆF—b6Æ73Ò&–æw&VF–VçBÖÆ—7B#âG¶Æ"æ–æw&VF–VçG2æÖ†—FVÒÓâÆ'WGFöâ6Æ73Ò&–æw&VF–VçBG·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’ò&7F—fR"¢"'Ò"FFÖ–æw&VF–VçB×&W7VÇCÒ"G¶—FV×Ò"&–×&W76VCÒ"G·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ—Ò#âG·7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ’ò.)É2"¢"²'ÒG¶—FV×ÓÂö'WGFöãæ’æ¦ö–â‚""—ÓÂöF—câG·&W7VÇD7F–öç2†FVÖòÂ7FFRÂh‰y¨Ny›ÎzZi»şK¸®i™®h›îX{¢G·&V6—W5³ÒææÖWÖ—Ö°¢Ğ¢æ–ææW$…DÔÂÒFVÖõ6†VÆÂ†FVÖòÂ7FFRÂ&öG’Â7FFRç7FWÓÓÒ&fVVF&6²"ÇÂ7FFRç7FWÓÓÒ&6ö×ÆWFR"òB¢çVÖ&W"‡7FFRç7FW’²ÂB“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'7F'B%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ7F'DFVÖò†FVÖòÂ²–æw&VF–VçG3¢²ââæÆ"æ–æw&VF–VçG5ÒÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FFÖ–æw&VF–VçEÒ"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâFövvÆT–æw&VF–VçB†FVÖòÂ7FFRÂ'WGFöâæFF6WBæ–æw&VF–VçBÂfÇ6R’’“°¢Fö7VÖVçBçVW'•6VÆV7F÷"‚u¶FFÖ7CÒ'&V6—W2%Òr“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâWFFU7FFR†FVÖòÂ²7FW¢"ÒÂ²fö7W3¢G'VRÒ’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FFÖ–æw&VF–VçB×&W7VÇEÒ"’æf÷$V6‚†'WGFöâÓâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâFövvÆT–æw&VF–VçB†FVÖòÂ7FFRÂ'WGFöâæFF6WBæ–æw&VF–VçE&W7VÇBÂG'VR’’“°¢&–æE6†&VB†FVÖòÂ7FFRÂ"“°§Ğ ¦gVæ7F–öâFövvÆT–æw&VF–VçB†FVÖòÂ7FFRÂ—FVÒÂ6÷VçE&Vg&W6‚’°¢6öç7BW†—7G2Ò7FFRæ–æw&VF–VçG2æ–æ6ÇVFW2†—FVÒ“°¢6öç7B–æw&VF–VçG2ÒW†—7G2ò7FFRæ–æw&VF–VçG2æf–ÇFW"‡fÇVRÓâfÇVRÓÒ—FVÒ’¢²ââç7FFRæ–æw&VF–VçG2Â—FVÕÓ°¢–b‚–æw&VF–VçG2æÆVæwF‚’&WGW&â6†÷uFö7B‚.ˆ{>[	KùŞyYKˆš^š9şiÙûÈÎh˜ŞiÈXúşš™~ŠØ{YiéÂ"“°¢WFFU7FFR†FVÖòÂ²–æw&VF–VçG2Â&Vg&W6†W3¢7FFRç&Vg&W6†W2²†6÷VçE&Vg&W6‚ò¢’Ò“°§Ğ ¦gVæ7F–öâ&VæFW$FVÖò†FVÖò’°¢6öç7B7FFRÒ7FFTf÷"†FVÖò“°¢–b‚7FFRæ÷VæVB’°¢7FFRæ÷VæVBÒG'VS°¢G&6²‚&FVÖõö÷VæVB"ÂFVÖòÂ7FFR“°¢Ğ¢6öç7B&VæFW&W'2Ò²&V6ÆÃ¢&VæFW%&V6ÆÂÂ&–6S¢&VæFW%&–6RÂ7Fö6³¢&VæFW%7Fö6²ÂFWFV7F—fS¢&VæFW$FWFV7F—fRÂG'WFƒ¢&VæFW%G'WF‚ÂF7FS¢&VæFW%F7FRÂG&VæC¢&VæFW%G&VæBÂ&&S¢&VæFW%&&RÂv'&çG“¢&VæFW%v'&çG’Âg&–FvS¢&VæFW$g&–FvRÓ°¢&VæFW&W'5¶FVÖòæ–EÒ†FVÖòÂ7FFR“°§Ğ ¦gVæ7F–öâ&VæFW%&÷WFR‡²fö7W2ÒG'VRÒÒ·Ò’°¢ÖöFÅ&ö÷Bæ–ææW$…DÔÂÒ"#°¢6öç7B&÷WFRÒ7W'&VçE&÷WFR‚“°¢6öç7B&÷WFTFVÖòÒ&÷WFRçvRÓÓÒ&FVÖò"bb&÷WFRæ–BòvWDFVÖò‡&÷WFRæ–B’¢çVÆÃ°¢Fö7VÖVçBæ&öG’æFF6WBçF†VÖRÒ&÷WFTFVÖóòæ–Bóò&Æ"#°¢6WD7F—fTæb‡&÷WFRçvRÓÓÒ&FVÖò"ò&vÆÆW'’"¢&÷WFRçvR“°¢–b‡&÷WFRçvRÓÓÒ&vÆÆW'’"’&VæFW$vÆÆW'’‚“°¢VÇ6R–b‡&÷WFRçvRÓÓÒ&'&–Vb"’&VæFW$'&–Vb‚“°¢VÇ6R–b‡&÷WFRçvRÓÓÒ&æW‡B×7FvR"’&VæFW$æW‡E7FvR‚“°¢VÇ6R–b‡&÷WFRçvRÓÓÒ&F6†&ö&B"’&VæFW$F6†&ö&B‚“°¢VÇ6R–b‡&÷WFTFVÖò’&VæFW$FVÖò‡&÷WFTFVÖò“°¢VÇ6R°¢æ–ææW$…DÔÂÒÆF—b6Æ73Ò&fFÂÖW'&÷"#ãÆƒîh›îKˆŞX‹˜	š^Zúnš™sÂöƒãÇî{k.YØXúşˆ;Ş˜îiÉşûÈÎY¹îX‹vÆÆW'’˜xŞik˜i8~8#Â÷ãÆ6Æ73Ò&'WGFöâ'WGFöâ×&–Ö'’"‡&VcÒ"2övÆÆW'’#îY¹îX‹vÆÆW'“ÂöãÂöF—cæ°¢Ğ¢–b†fö7W2’°¢v–æF÷rç67&öÆÅFò‡²F÷¢Â&V†f–÷#¢&–ç7FçB"Ò“°¢æfö7W2‡²&WfVçE67&öÆÃ¢G'VRÒ“°¢Ğ§Ğ §v–æF÷ræFDWfVçDÆ—7FVæW"‚&†6†6†ævR"Â‚’Óâ&VæFW%&÷WFR‡²fö7W3¢G'VRÒ’“° ¦7–æ2gVæ7F–öâ&ö÷B‚’°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚"öFFöÆ"ÖFFæ§6öâ"Â²66†S¢&æò×7F÷&R"Ò“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"†…EEG·&W7öç6Rç7FGW7Ö“°¢Æ"Òv—B&W7öç6Ræ§6öâ‚“°¢–b‚Æö6F–öâæ†6‚’†—7F÷'’ç&WÆ6U7FFR†çVÆÂÂ""Â"2övÆÆW'’"“°¢&VæFW%&÷WFR‡²fö7W3¢fÇ6RÒ“°¢Ò6F6‚†W'&÷"’°¢æ–ææW$…DÔÂÒÆF—b6Æ73Ò&fFÂÖW'&÷"#ãÆƒîZúnš™~‹8~ii‹ÈXZ^ZKiYsÂöƒãÇâG¶W66T‡FÖÂ†W'&÷"æÖW76vR—ÓÂ÷ãÆ'WGFöâ6Æ73Ò&'WGFöâ'WGFöâ×&–Ö'’"öæ6Æ–6³Ò&Æö6F–öâç&VÆöB‚’#î˜xŞik‹ÈXZSÂö'WGFöããÂöF—cæ°¢Ğ§Ğ ¦&ö÷B‚“° 