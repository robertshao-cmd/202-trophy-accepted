const app = document.querySelector("#detective-app");
const toast = document.querySelector("#detective-toast");
const headerStatus = document.querySelector("#header-status");

const search = new URLSearchParams(location.search);
const initialCode = (search.get("room") ?? "").replace(/\D/g, "").slice(0, 4);
const demoMode = search.get("demo") === "1";
const hostedNoMotion = !["localhost", "127.0.0.1"].includes(location.hostname);
const testMode = hostedNoMotion || demoMode || search.get("test") === "1" || search.get("motion") === "off";
document.documentElement.dataset.testMode = testMode ? "true" : "false";

const state = {
  code: initialCode,
  view: location.hash.replace("#", "") || (initialCode ? "join" : "home"),
  room: null,
  busy: false,
  error: null,
  hostKey: initialCode ? localStorage.getItem(`detective-host-${initialCode}`) : null,
  playerKey: initialCode ? localStorage.getItem(`detective-player-${initialCode}`) : null,
  playerName: initialCode ? localStorage.getItem(`detective-player-name-${initialCode}`) : null,
};

const errorMessages = {
  case_not_found: "找不到這個案件。請確認案件編號。",
  case_full: "本案偵探已滿，請等待下一局。",
  case_already_started: "案件已經開辦，現在無法加入。",
  nickname_too_short: "偵探代號至少需要兩個字。",
  nickname_taken: "這個偵探代號已有人使用。",
  need_four_detectives: "至少需要 4 位偵探才能開始辦案。",
  answer_locked: "證詞已封存，不能反悔。",
  answering_closed: "本題已經開牌。",
  host_required: "只有開局者能執行這個動作。",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "request_failed");
    error.code = body.error;
    throw error;
  }
  return body;
}

function hostStorageKey(code) { return `detective-host-${code}`; }
function playerStorageKey(code) { return `detective-player-${code}`; }

function caseUrl(code, view = "join") {
  const params = new URLSearchParams({ room: code });
  if (testMode) params.set("test", "1");
  if (demoMode) params.set("demo", "1");
  return `${location.origin}/detective.html?${params}#${view}`;
}

function setRoute(code, view) {
  state.code = code;
  state.view = view;
  const params = new URLSearchParams({ room: code });
  if (testMode) params.set("test", "1");
  if (demoMode) params.set("demo", "1");
  history.replaceState({}, "", `/detective.html?${params}#${view}`);
}

function updateHeader() {
  if (!state.room) {
    headerStatus.textContent = "202 TROPHY CASE · 真實彙總／虛構案件";
    return;
  }
  const labels = {
    lobby: "等待偵探報到",
    question: "偵訊進行中",
    reveal: "證據已開牌",
    leaderboard: "更新辦案排名",
    results: "案件已結案",
  };
  headerStatus.textContent = `案件 #${state.room.code} · ${labels[state.room.phase] ?? "調查中"}${demoMode ? " · 5-MIN DEMO" : testMode ? " · TEST MODE 無動畫" : ""}`;
}

function demoCue(room) {
  const index = room.questionIndex;
  if (index < 0) return "0:00–0:30｜一句話：發票不只記帳，還能變成辦公室社交遊戲。";
  if (index <= 2) return "0:30–1:20｜只講：先復原發票，不先猜人。";
  if (index <= 6) return "1:20–3:20｜只講：三人一組，唯一說謊者進嫌疑區。";
  if (index <= 8) return "3:20–4:15｜只講：四條完整消費行動線，才有資格定案。";
  return "4:15–5:00｜收尾：發票不可替代、30 秒有答案、結果值得互相比。";
}

function portraitMarkup(person, className = "") {
  const label = person?.name ?? person?.label ?? "嫌疑人";
  if (!person?.avatarUrl) return `<span class="portrait-fallback ${className}" aria-hidden="true">?</span>`;
  return `<span class="portrait-wrap ${className}"><img src="${escapeHtml(person.avatarUrl)}" alt="${escapeHtml(label)}的 Jira 頭像" /><small>JIRA</small></span>`;
}

function actClass(question) {
  if (question?.act?.includes("第一幕")) return "act-clue";
  if (question?.act?.includes("第二幕")) return "act-interrogation";
  return "act-timeline";
}

function renderStageProp(question) {
  if (question.type === "merchant" || question.type === "item" || question.type === "invoice") {
    return `<div class="crime-receipt" aria-hidden="true"><span class="receipt-stain stain-one"></span><span class="receipt-stain stain-two"></span><b>電子發票證明聯</b><i>20██/06/15　NT$ 1,687</i><em>${question.type === "merchant" ? "全聯實業…██分公司" : question.type === "item" ? "除菌・噴霧・NT$ ██" : "日期 → 商家 → 品項"}</em><small>線索正在對焦…</small></div>`;
  }
  if (question.type === "lie") {
    return `<div class="interrogation-lamp" aria-hidden="true"><span></span><b>誰在說謊？</b></div>`;
  }
  return `<div class="timeline-radar" aria-hidden="true"><span></span><b>四條行動線同步展開</b></div>`;
}

function renderSuspects(suspects = []) {
  return suspects.map((suspect) => `
    <div class="suspect-line">
      ${portraitMarkup(suspect, "suspect-avatar")}
      <span><strong>${escapeHtml(suspect.name)}</strong><small>${escapeHtml(suspect.alias)}</small></span>
      <span class="suspect-status" aria-hidden="true">已框出</span>
    </div>
  `).join("");
}

function renderCaseProgress(room) {
  return `<div class="case-progress" aria-label="目前第 ${room.questionIndex + 1} 題，共 ${room.questionCount} 題">
    ${Array.from({ length: room.questionCount }, (_, index) => `<span class="${index < room.questionIndex ? "done" : index === room.questionIndex ? "active" : ""}">${index + 1}</span>`).join("")}
  </div>`;
}

function humanObservation(question) {
  const observations = {
    merchant: "品牌名、公司名與記憶中的地點常常不一樣；發票讓我們把印象重新對焦。",
    item: "幾個殘缺字就會喚起不同故事，直到價格與品名一起出現，猜測才成為證據。",
    invoice: "單一線索容易誤導；日期、商家、品項與金額互相扣合，才是一張完整發票。",
    lie: "人會本能地縮小高頻習慣，因為『偶爾』聽起來比真實次數更像自己。",
    route: "我們會急著用人設定罪，但只有完整行動線才能把懷疑變成答案。",
  };
  return observations[question.type] ?? "發票記錄行為；當事人的解釋，才補上行為背後的人。";
}

function renderHome() {
  app.innerHTML = `
    <section class="scene hero-grid">
      <div class="hero-copy">
        <div class="issue-strip"><span>ISSUE #0821</span><strong>辦公室限定公演</strong></div>
        <p class="eyebrow">KAHOOT × DETECTIVE × INVOICE</p>
        <h1>誰是<em>犯人？</em></h1>
        <div class="hero-burst" aria-hidden="true"><strong>發票不會</strong><span>說謊！</span></div>
        <p class="hero-lead">202 獎盃憑空消失。犯罪現場只剩沾滿污漬的發票；你有 9 題時間破解線索、審問四組同事，再從四名嫌疑人中揪出犯人。</p>
        <div class="button-row">
          <button class="primary-button" data-action="create-case">立案，成為主持人</button>
          <button class="ghost-button" data-action="focus-join">我有案件編號</button>
          ${testMode ? `<span class="test-mode-badge">${demoMode ? "5-MIN DEMO" : "TEST MODE"} · 動畫已關閉</span>` : `<a class="ghost-button test-mode-link" href="/detective.html?test=1">無動畫測試</a><a class="ghost-button test-mode-link" href="/detective.html?demo=1">五分鐘簡報</a>`}
        </div>
        <div class="hero-proof">
          <span class="proof-chip">9 題三幕破案</span>
          <span class="proof-chip">4–8 位偵探</span>
          <span class="proof-chip">發票證據開牌</span>
          <span class="proof-chip">不需註冊</span>
        </div>
        <div class="case-loop" aria-label="一局的三個步驟">
          <span><b>01</b><strong>蒐集資訊</strong><small>髒污發票逐格對焦</small></span>
          <span><b>02</b><strong>框出嫌疑人</strong><small>四組三人、每組一謊</small></span>
          <span><b>03</b><strong>找出犯人</strong><small>四條行動線正面對決</small></span>
        </div>
      </div>
      <aside class="folder-card" aria-label="案件嫌疑人名冊">
        <span class="paper-clip" aria-hidden="true"></span>
        <p class="eyebrow">SUSPECT DOSSIER</p>
        <h2>202 獎盃失竊案</h2>
        <p>消費數字取自真實發票；失竊、說謊與犯人設定完全是遊戲虛構。偵探只需一個代號即可加入。</p>
        <div class="sealed-dossiers" aria-label="案件規模">
          <span><strong>03</strong><small>張髒污發票</small></span>
          <span><strong>04</strong><small>組交叉口供</small></span>
          <span><strong>04</strong><small>名最終嫌疑人</small></span>
        </div>
        <form class="join-panel" data-form="enter-code">
          <label class="field-label" for="home-code">輸入 4 位案件編號</label>
          <div class="join-inline">
            <input id="home-code" class="case-input" name="code" inputmode="numeric" maxlength="4" placeholder="例如 0821" autocomplete="off" />
            <button class="secondary-button" type="submit">前往現場</button>
          </div>
        </form>
      </aside>
    </section>
  `;
}

function renderJoin() {
  app.innerHTML = `
    <section class="scene join-scene">
      <div class="join-card">
        <div class="join-sticker" aria-hidden="true">臨時偵探證</div>
        <div class="join-ghost ghost-shape" aria-hidden="true"><i></i></div>
        <p class="eyebrow">CASE #${escapeHtml(state.code)}</p>
        <h1>領取偵探證</h1>
        <p>不用綁載具、不用選身分。今天你只負責拆穿口供，找回消失的 202 獎盃。</p>
        <form data-form="join-case">
          <label class="field-label" for="detective-name">偵探代號</label>
          <input id="detective-name" class="case-input" name="nickname" maxlength="16" placeholder="例如：宵夜目擊者" autocomplete="nickname" autofocus />
          <button class="primary-button" type="submit">進入案件 #${escapeHtml(state.code)}</button>
        </form>
      </div>
    </section>
  `;
}

function fakeQr(code) {
  const seed = [...String(code)].reduce((sum, char) => sum + Number(char), 0);
  return Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const corner = (row < 3 && col < 3) || (row < 3 && col > 5) || (row > 5 && col < 3);
    const on = corner ? (row % 3 !== 1 || col % 3 !== 1) : ((index * 7 + seed * 3 + row) % 5 < 2);
    return `<span class="qr-cell ${on ? "on" : ""}"></span>`;
  }).join("");
}

function renderDetectiveList(players) {
  if (!players.length) return `<div class="empty-list">現場還沒有偵探。<br />把案件連結丟進群組吧。</div>`;
  return players.map((player, index) => `
    <div class="detective-card">
      <span class="badge">${index + 1}</span>
      <span><strong>${escapeHtml(player.nickname)}</strong><small>${player.isBot ? "示範線民" : "已完成報到"}</small></span>
    </div>
  `).join("");
}

function renderLobby() {
  const room = state.room;
  if (state.view === "host") {
    const canStart = room.players.length >= 4 && room.isHost;
    app.innerHTML = `
      <section class="scene scene-wide">
        <div class="case-topline">
          <div><p class="eyebrow">CASE LOBBY</p><h1>等待偵探報到</h1></div>
          <span class="case-number">案件 #${escapeHtml(room.code)}</span>
        </div>
        <div class="lobby-grid">
          <section class="panel">
            <p class="eyebrow">邀請入口</p>
            <div class="join-code">${escapeHtml(room.code)}</div>
            <code class="share-link">${escapeHtml(caseUrl(room.code))}</code>
            <div class="fake-qr" aria-label="Prototype QR 視覺佔位"><div class="qr-grid">${fakeQr(room.code)}</div></div>
            <p class="qr-label">Prototype QR · 現場請分享上方連結或案件編號</p>
            <div class="button-row">
              <button class="ghost-button small-button" data-action="copy-link">複製邀請連結</button>
              <a class="ghost-button small-button" href="${escapeHtml(caseUrl(room.code))}" target="_blank" rel="noreferrer">開啟玩家頁</a>
            </div>
          </section>
          <section class="panel">
            <p class="eyebrow">${room.players.length} / 8 DETECTIVES</p>
            <h2>報到名單</h2>
            <div class="live-ticker"><span>現場快報</span><strong>${room.players.length >= 4 ? "已達開案門檻，隨時可以撕封條！" : `再 ${4 - room.players.length} 位偵探即可開案`}</strong></div>
            <p class="panel-note">滿 4 人即可開案；Demo 時可補入示範線民，單人也能順跑完整一局。</p>
            ${demoMode ? `<div class="demo-cue"><span>5-MIN RUN OF SHOW</span><strong>${escapeHtml(demoCue(room))}</strong><small>每題最多 10 秒；答案一出就按「Demo 快轉」，不等待排行榜動畫。</small></div>` : ""}
            <div class="case-brief">
              <strong>案情摘要</strong>
              <p>展示櫃斷電後，202 獎盃消失。先復原三張髒污發票，再審問四組、每組三位同事；四名說謊者會進入最終行動線比對。</p>
              <small>消費紀錄為真實彙總；失竊、口供與犯人皆為虛構。</small>
            </div>
            <div class="detective-list">${renderDetectiveList(room.players)}</div>
            <div class="button-row">
              <button class="ghost-button" data-action="fill-demo" ${room.isHost ? "" : "disabled"}>補滿 6 位示範偵探</button>
              <button class="primary-button" data-action="start-case" ${canStart ? "" : "disabled"}>開始辦案 · 9 題</button>
            </div>
          </section>
        </div>
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="scene join-scene">
      <div class="join-card">
        <div class="waiting-illustration" aria-hidden="true">⌕</div>
        <div class="waiting-tape" aria-hidden="true">EVIDENCE SEALED · 證物封存中</div>
        <p class="eyebrow">CASE #${escapeHtml(room.code)}</p>
        <h1>${escapeHtml(state.playerName ?? "偵探")}，報到完成</h1>
        <p>案件資料正在封存。等主持人按下「開始辦案」，第一份發票證據就會出現。</p>
        <div class="waiting-list">${room.players.map((player) => `<span class="waiting-chip">${escapeHtml(player.nickname)}</span>`).join("")}</div>
        <p><strong>${room.players.length} / 8</strong> 位偵探已入局</p>
      </div>
    </section>
  `;
}

function secondsLeft(room) {
  if (!room.phaseEndsAt) return 0;
  return Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
}

function renderOptions(question, { interactive = false, selected = null, reveal = false } = {}) {
  return question.choices.map((choice, index) => {
    const correct = reveal && choice.id === question.correctChoice;
    const wrong = reveal && choice.id !== question.correctChoice;
    const classes = [selected === choice.id ? "selected" : "", correct ? "correct" : "", wrong ? "wrong" : ""].filter(Boolean).join(" ");
    return `
      <button class="option-button ${classes} ${choice.avatarUrl ? "has-portrait" : ""} ${choice.timeline ? "has-timeline" : ""}" data-letter="${String.fromCharCode(65 + index)}" ${interactive ? `data-answer="${escapeHtml(choice.id)}"` : "disabled"}>
        ${choice.avatarUrl ? portraitMarkup(choice, "option-portrait") : ""}
        <span class="option-copy">${choice.name ? `<strong>${escapeHtml(choice.name)}</strong>` : ""}<span>${escapeHtml(choice.label)}</span></span>
        ${choice.timeline ? `<span class="mini-timeline" aria-hidden="true">${choice.timeline.map((stop) => `<i>${escapeHtml(stop)}</i>`).join("")}</span>` : ""}
      </button>
    `;
  }).join("");
}

function renderQuestion() {
  const room = state.room;
  const question = room.question;
  const remaining = secondsLeft(room);
  const progress = Math.max(0, Math.min(100, (remaining / 10) * 100));
  const progressText = `第 ${room.questionIndex + 1} / ${room.questionCount} 題`;
  const answerPercent = room.players.length ? Math.round((room.answeredCount / room.players.length) * 100) : 0;

  if (state.view !== "host") {
    app.innerHTML = `
      <section class="scene join-scene player-question ${actClass(question)}">
        <div class="question-card">
          <span class="question-sfx" aria-hidden="true">盯——</span>
          <div class="question-progress"><span class="question-label">${escapeHtml(question.label)}</span><span>${escapeHtml(question.act)} · ${progressText}</span></div>
          ${renderCaseProgress(room)}
          ${renderStageProp(question)}
          <h1>${escapeHtml(question.prompt)}</h1>
          <div class="option-grid">${renderOptions(question, { interactive: !room.viewerAnswered, selected: room.viewerChoice })}</div>
        </div>
      </section>
      <div class="player-status ${room.viewerAnswered ? "locked" : ""}">${room.viewerAnswered ? "✓ 證詞已蓋章・不能反悔" : `剩餘 ${remaining} 秒 · 選一份口供`}</div>
    `;
    return;
  }

  app.innerHTML = `
    <section class="scene scene-wide ${actClass(question)}">
      <div class="question-shell">
        <article class="question-card">
          <span class="question-sfx" aria-hidden="true">盯——</span>
          <div class="question-progress"><span class="question-label">${escapeHtml(question.label)}</span><span>${escapeHtml(question.act)} · ${progressText}</span></div>
          ${renderCaseProgress(room)}
          ${renderStageProp(question)}
          <h1>${escapeHtml(question.prompt)}</h1>
          <div class="option-grid">${renderOptions(question)}</div>
        </article>
        <aside class="panel timer-panel">
          <div class="timer-ring" style="--progress:${progress}%"><span class="timer-value">${remaining}</span></div>
          <div class="answer-meter">
            <p class="eyebrow">LIVE TESTIMONY</p>
            <h2>${room.answeredCount} / ${room.players.length} 已作答</h2>
            <div class="meter-line"><span style="width:${answerPercent}%"></span></div>
            <div class="testimony-badges" aria-hidden="true">${room.players.map((_, index) => `<span class="${index < room.answeredCount ? "answered" : ""}">${index < room.answeredCount ? "✓" : "?"}</span>`).join("")}</div>
            <p class="panel-note">全員回答會提前開牌；逾時則視為未作答。</p>
            ${demoMode ? `<div class="demo-cue compact"><span>PRESENTER CUE</span><strong>${escapeHtml(demoCue(room))}</strong></div>` : ""}
            ${room.isHost ? `<button class="ghost-button small-button" data-action="advance">Demo 快轉開牌</button>` : ""}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderDistribution(question, total) {
  return question.choices.map((choice) => {
    const count = question.distribution?.[choice.id] ?? 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="distribution-row">
        <span>${escapeHtml(choice.label)}</span>
        <span class="distribution-bar"><span style="width:${percent}%"></span></span>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
}

function renderEvidenceRows(evidence) {
  const rows = Array.isArray(evidence.rows) ? evidence.rows : [
    ["嫌疑人", evidence.owner],
    ["商家", evidence.merchant],
    ["品項", evidence.item],
    ["金額", Number.isFinite(Number(evidence.amount)) ? `NT$ ${Number(evidence.amount).toLocaleString("zh-TW")}` : evidence.amount],
    ["時間", evidence.date],
    ["發票", evidence.invoice],
  ];
  return rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<div class="receipt-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderReveal() {
  const room = state.room;
  const question = room.question;
  const correctChoice = question.choices.find((choice) => choice.id === question.correctChoice);
  const correctLabel = correctChoice?.name ?? correctChoice?.label ?? "真相";
  const evidence = question.evidence;
  app.innerHTML = `
    <section class="scene scene-wide ${actClass(question)} reveal-scene">
      <div class="evidence-layout">
        <article class="reveal-card">
          <div class="reveal-impact" aria-hidden="true"><strong>啪！</strong><span>封條撕開</span></div>
          <span class="reveal-stamp">證據成立</span>
          <p class="comic-caption">${escapeHtml(question.act)} · 所有人的印象，現在接受發票審判。</p>
          <h1 class="truth-reveal">真相是 <span>${escapeHtml(correctLabel)}</span></h1>
          ${question.type === "lie" && correctChoice ? `<div class="suspect-frame"><span class="spotlight" aria-hidden="true"></span>${portraitMarkup(correctChoice, "suspect-reveal-portrait")}<div><small>LOCKED SUSPECT</small><strong>嫌疑人 ${Math.max(1, room.questionIndex - 2)} / 4</strong><span>說謊 ≠ 定罪，先框起來再查行動線。</span></div><b class="suspect-stamp">嫌疑人</b></div>` : ""}
          <p>${escapeHtml(evidence.finding)}</p>
          <div class="humanity-note">
            <span>HUMANITY / 人性觀察</span>
            <strong>${escapeHtml(humanObservation(question))}</strong>
            <small>請當事人用 10 秒補完故事：這筆消費當時到底發生了什麼？</small>
          </div>
          ${demoMode ? `<div class="demo-cue compact"><span>PRESENTER CUE</span><strong>${escapeHtml(demoCue(room))}</strong></div>` : ""}
          <div class="option-grid">${renderOptions(question, { selected: room.viewerChoice, reveal: true })}</div>
          ${state.view === "host" ? `<div class="distribution">${renderDistribution(question, room.answeredCount)}</div>` : ""}
          ${room.isHost ? `<div class="button-row" style="margin-top:24px"><button class="ghost-button small-button" data-action="advance">Demo 快轉排行榜</button></div>` : ""}
        </article>
        <aside class="receipt" aria-label="發票證據卡">
          <div class="evidence-tape" aria-hidden="true">EVIDENCE / 請勿移動</div>
          <div class="receipt-head"><small>${escapeHtml(evidence.eyebrow ?? "INVOICE EVIDENCE")}</small><strong>發票證據卡</strong></div>
          ${renderEvidenceRows(evidence)}
          <p class="receipt-finding">${escapeHtml(evidence.finding)}</p>
        </aside>
      </div>
    </section>
  `;
}

function renderLeaderboard() {
  const room = state.room;
  app.innerHTML = `
    <section class="scene">
      <article class="leaderboard-card">
        <div class="newspaper-flag" aria-hidden="true">EXTRA! EXTRA!</div>
        <p class="eyebrow">CASE RANKING · ${room.questionIndex + 1}/${room.questionCount}</p>
        <h1>誰最會<br /><span>讀同事？</span></h1>
        <p>速度有加分，亂猜沒有倒扣。前三名暫時取得搜查令。</p>
        <div class="rank-list">
          ${room.leaderboard.slice(0, 6).map((player, index) => `
            <div class="rank-row">
              <span class="rank-number">${["👑", "🥈", "🥉"][index] ?? `#${index + 1}`}</span>
              <strong>${escapeHtml(player.nickname)}</strong>
              <span class="rank-score">${player.score} pts</span>
            </div>
          `).join("")}
        </div>
        ${room.isHost ? `<div class="button-row" style="justify-content:center;margin-top:24px"><button class="ghost-button small-button" data-action="advance">Demo 快轉下一題</button></div>` : ""}
      </article>
    </section>
  `;
}

function renderResults() {
  const room = state.room;
  const results = room.results;
  const champion = results.champion ?? { nickname: "無人破案", score: 0 };
  app.innerHTML = `
    <section class="scene scene-wide">
      <div class="case-topline"><div><p class="eyebrow">CASE CLOSED</p><h1>犯人已鎖定</h1></div><span class="case-number">案件 #${escapeHtml(room.code)}</span></div>
      <div class="result-grid">
        <article class="result-card" id="share-card">
          <div class="result-burst" aria-hidden="true">破案！</div>
          <div class="confetti-field" aria-hidden="true">✦　●　▲　✦　■　●</div>
          <div class="receipt-blaster" aria-hidden="true"><span class="blaster-body">發票</span><span class="blaster-barrel"></span><b>BANG!</b>${Array.from({ length: 9 }, (_, index) => `<i style="--shot:${index}">🧾</i>`).join("")}</div>
          <p class="eyebrow" style="color:#8d211d">FICTIONAL CULPRIT</p>
          <div class="culprit-lockup">${portraitMarkup({ name: results.culprit, avatarUrl: results.culpritPortrait }, "culprit-portrait")}<span>證據命中</span></div>
          <h1><span class="champion-name">${escapeHtml(results.culprit)}</span><br />誰是犯人</h1>
          <div class="evidence-chain" aria-label="完整證據鏈">
            ${results.evidenceChain.map((item, index) => `<span><b>${index + 1}</b>${escapeHtml(item)}</span>`).join("")}
          </div>
          <div class="result-metrics">
            <div class="result-metric"><strong>${escapeHtml(champion.nickname)}</strong><small>辦案冠軍 · ${champion.score} pts</small></div>
            <div class="result-metric"><strong>${results.accuracy}%</strong><small>全局答對率</small></div>
            <div class="result-metric"><strong>${room.players.length}</strong><small>入局偵探</small></div>
          </div>
          <p class="case-finding">${escapeHtml(results.caseFinding)}</p>
          <div class="humanity-note result-humanity"><span>HUMANITY / 人性觀察</span><strong>發票只能回答「做了什麼」；當事人的 10 秒自白，才回答「為什麼」。</strong></div>
          ${demoMode ? `<div class="demo-cue final-cue"><span>4:15–5:00 · FINAL LINE</span><strong>「拿掉發票，這個遊戲就不存在；看完結果，每個人都會想比較下一位同事。」</strong></div>` : ""}
          <section class="needs-section" aria-label="五大需求層次對照">
            <div class="needs-heading"><span>WHY PEOPLE CARE</span><strong>這不只是在猜人：五層人性價值都有回報</strong></div>
            <div class="needs-pyramid">${results.needPyramid.map((need, index) => `<div class="need-tier need-${index + 1}"><strong>${escapeHtml(need.level)}</strong><span>${escapeHtml(need.value)}</span></div>`).join("")}</div>
            <div class="reflection-card"><span>SELF-ACTUALIZATION</span><strong>我以為自己＿＿；發票顯示＿＿；接下來我想改＿＿。</strong></div>
          </section>
        </article>
        <aside class="panel">
          <p class="eyebrow">NEXT CASE</p>
          <h2>你真的了解同事嗎？</h2>
          <div class="share-hook"><strong>下一局的誘餌</strong><span>「你看到的是人設，發票記得的是日常。」</span></div>
          <p class="panel-note">分享的不是誰被公開處刑，而是整間辦公室對同一個人的印象，如何被一張張發票翻轉。</p>
          <div class="final-suspect-list"><strong>四名最終嫌疑人</strong>${renderSuspects(results.finalSuspects)}</div>
          <div class="button-row">
            ${room.isHost ? `<button class="primary-button" data-action="reset-case">開新案件</button>` : ""}
            <button class="secondary-button" data-action="share-result">分享戰績</button>
          </div>
          <div class="rank-list" style="margin-top:26px">
            ${room.leaderboard.slice(0, 5).map((player, index) => `<div class="rank-row"><span class="rank-number">#${index + 1}</span><strong>${escapeHtml(player.nickname)}</strong><span class="rank-score">${player.score}</span></div>`).join("")}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderError() {
  app.innerHTML = `
    <section class="scene"><div class="error-card"><p class="eyebrow">CASE ERROR</p><h1>這個案件斷線了</h1><p>${escapeHtml(state.error ?? "請回到首頁重新立案。")}</p><a class="primary-button" style="display:inline-grid;place-items:center;text-decoration:none" href="/detective.html">回到誰是犯人</a></div></section>
  `;
}

function render() {
  updateHeader();
  document.body.dataset.phase = state.room?.phase ?? (state.view === "join" ? "join" : "home");
  document.body.dataset.act = state.room?.question ? actClass(state.room.question) : "none";
  if (state.error) return renderError();
  if (!state.code || state.view === "home") return renderHome();
  if (state.view === "join" && !state.playerKey) return renderJoin();
  if (!state.room) return;
  if (state.room.phase === "lobby") return renderLobby();
  if (state.room.phase === "question") return renderQuestion();
  if (state.room.phase === "reveal") return renderReveal();
  if (state.room.phase === "leaderboard") return renderLeaderboard();
  if (state.room.phase === "results") return renderResults();
}

async function syncRoom({ quiet = false } = {}) {
  if (!state.code) return;
  const query = new URLSearchParams();
  if (state.playerKey) query.set("player", state.playerKey);
  if (state.hostKey) query.set("host", state.hostKey);
  try {
    const previousRoom = state.room ? JSON.stringify(state.room) : "";
    const nextRoom = await request(`/api/detective/rooms/${state.code}?${query}`);
    const roomChanged = previousRoom !== JSON.stringify(nextRoom);
    state.room = nextRoom;
    state.error = null;
    if (!quiet || roomChanged) render();
  } catch (error) {
    if (!quiet || error.code === "case_not_found") {
      state.error = errorMessages[error.code] ?? "暫時無法連上案件。";
      render();
    }
  }
}

function updateQuestionClock() {
  if (state.room?.phase !== "question") return;
  const remaining = secondsLeft(state.room);
  const progress = Math.max(0, Math.min(100, (remaining / 10) * 100));
  const timerValue = document.querySelector(".timer-value");
  const timerRing = document.querySelector(".timer-ring");
  const playerStatus = document.querySelector(".player-status:not(.locked)");
  if (timerValue) timerValue.textContent = remaining;
  if (timerRing) timerRing.style.setProperty("--progress", `${progress}%`);
  if (playerStatus) playerStatus.textContent = `剩餘 ${remaining} 秒 · 選一份口供`;
}

async function createCase() {
  if (state.busy) return;
  state.busy = true;
  try {
    const data = await request("/api/detective/rooms", { method: "POST", body: "{}" });
    state.hostKey = data.hostKey;
    state.room = data.room;
    localStorage.setItem(hostStorageKey(data.room.code), data.hostKey);
    setRoute(data.room.code, "host");
    render();
  } catch {
    notify("立案失敗，請再試一次。");
  } finally {
    state.busy = false;
  }
}

async function hostAction(action) {
  if (!state.hostKey || state.busy) return;
  state.busy = true;
  try {
    state.room = await request(`/api/detective/rooms/${state.code}/${action}`, {
      method: "POST",
      body: JSON.stringify({ hostKey: state.hostKey }),
    });
    render();
  } catch (error) {
    notify(errorMessages[error.code] ?? "操作失敗，請再試一次。");
  } finally {
    state.busy = false;
  }
}

async function joinCase(nickname) {
  if (state.busy) return;
  state.busy = true;
  try {
    const data = await request(`/api/detective/rooms/${state.code}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
    state.playerKey = data.playerKey;
    state.playerName = nickname.trim();
    state.room = data.room;
    localStorage.setItem(playerStorageKey(state.code), data.playerKey);
    localStorage.setItem(`detective-player-name-${state.code}`, state.playerName);
    state.view = "play";
    location.hash = "play";
    render();
  } catch (error) {
    notify(errorMessages[error.code] ?? "加入案件失敗。");
  } finally {
    state.busy = false;
  }
}

async function answerQuestion(choice) {
  if (!state.playerKey || state.room?.viewerAnswered || state.busy) return;
  state.busy = true;
  try {
    state.room = await request(`/api/detective/rooms/${state.code}/answer`, {
      method: "POST",
      body: JSON.stringify({ playerKey: state.playerKey, choice }),
    });
    render();
  } catch (error) {
    notify(errorMessages[error.code] ?? "證詞送出失敗。");
  } finally {
    state.busy = false;
  }
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    notify(message);
  } catch {
    notify("請長按網址手動複製。");
  }
}

async function shareResult() {
  const champion = state.room?.results?.champion?.nickname ?? "首席偵探";
  const text = `案件 #${state.code} 已結案：${champion} 成為辦案冠軍。你看到的是人設，發票記得的是日常。`;
  if (navigator.share) {
    try { await navigator.share({ title: "KAHOOT × DETECTIVE × INVOICE｜誰是犯人？", text, url: caseUrl(state.code) }); return; } catch { /* user cancelled */ }
  }
  await copyText(`${text} ${caseUrl(state.code)}`, "戰績文案已複製");
}

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === "enter-code") {
    const code = String(data.get("code") ?? "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) return notify("請輸入 4 位案件編號。");
    location.href = caseUrl(code, "join");
  }
  if (form.dataset.form === "join-case") joinCase(String(data.get("nickname") ?? ""));
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action],[data-answer]");
  if (!target) return;
  if (target.dataset.answer) return answerQuestion(target.dataset.answer);
  const actions = {
    "create-case": createCase,
    "focus-join": () => document.querySelector("#home-code")?.focus(),
    "copy-link": () => copyText(caseUrl(state.code), "邀請連結已複製"),
    "fill-demo": () => hostAction("fill"),
    "start-case": () => hostAction("start"),
    "advance": () => hostAction("advance"),
    "reset-case": () => hostAction("reset"),
    "share-result": shareResult,
  };
  actions[target.dataset.action]?.();
});

window.addEventListener("hashchange", () => {
  state.view = location.hash.replace("#", "") || (state.code ? "join" : "home");
  render();
});

render();
if (state.code) syncRoom();
setInterval(() => syncRoom({ quiet: true }), 900);
setInterval(updateQuestionClock, 250);
