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
  case_full: "本案偵探已滿（上限 8 位），請等待下一局。",
  case_already_started: "案件已經開辦，現在無法加入。",
  nickname_too_short: "偵探代號至少需要兩個字。",
  nickname_taken: "這個偵探代號已有人使用。",
  identity_taken: "這個身分已被認領，請選別的。",
  identity_unknown: "這個身分不在本案名單裡。",
  need_four_detectives: "至少需要 4 位偵探才能開始辦案。",
  answer_locked: "證詞已封存，不能反悔。",
  answering_closed: "本題已經開牌。",
  on_stage_locked: "你在台上受審，這一輪不能投票。",
  host_required: "只有開局者能執行這個動作。",
  case_unknown: "沒有這個案件可選。",
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
    headerStatus.textContent = "發票推理局 · 真實發票／虛構案件";
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
  const act = room.act ?? "";
  if (room.phase === "lobby") return "開場一句話：發票不只記帳，還能變成辦公室推理遊戲。";
  if (act.includes("第一幕")) return "第一幕：污漬發票推地點——先復原證據，不先猜人。";
  if (act.includes("第二幕")) return "第二幕：三人上台唸口供、兩真一假，台下投票抓說謊者。";
  if (act.includes("第三幕")) return "第三幕：行動線回放 → 兩輪下注 → 開牌真兇。";
  return "收尾：發票不可替代、每局 13 分鐘內、結果值得互相比。";
}

function portraitMarkup(person, className = "") {
  const label = person?.name ?? person?.label ?? "嫌疑人";
  if (!person?.avatarUrl) {
    return `<span class="portrait-fallback ${className}" aria-hidden="true">${escapeHtml(String(label).slice(0, 1))}</span>`;
  }
  return `<span class="portrait-wrap ${className}"><img src="${escapeHtml(person.avatarUrl)}" alt="${escapeHtml(label)}的頭像" /><small>CAST</small></span>`;
}

function actClass(question) {
  if (question?.act?.includes("第一幕")) return "act-clue";
  if (question?.act?.includes("第二幕")) return "act-interrogation";
  return "act-timeline";
}

function renderStageProp(question) {
  if (question.kind === "quiz") {
    return `<div class="crime-receipt" aria-hidden="true"><span class="receipt-stain stain-one"></span><span class="receipt-stain stain-two"></span><b>電子發票證明聯</b><i>${escapeHtml(question.prop?.date ?? "20██")} · NT$ ${escapeHtml(String(question.prop?.amt ?? "██"))}</i><em>${escapeHtml(question.prop?.time ?? "██:██")} · 店名：██████</em><small>線索正在對焦…</small></div>`;
  }
  if (question.kind === "vote") {
    return `<div class="interrogation-lamp" aria-hidden="true"><span></span><b>誰在說謊？</b></div>`;
  }
  return `<div class="timeline-radar" aria-hidden="true"><span></span><b>終局指認進行中</b></div>`;
}

function renderCaseProgress(room) {
  return `<div class="case-progress" aria-label="目前第 ${room.stepIndex + 1} 步，共 ${room.stepCount} 步">
    ${Array.from({ length: room.stepCount }, (_, index) => `<span class="${index < room.stepIndex ? "done" : index === room.stepIndex ? "active" : ""}">${index + 1}</span>`).join("")}
  </div>`;
}

function humanObservation(question) {
  const observations = {
    quiz: "品牌名、登記名與記憶中的地點常常不一樣；發票讓我們把印象重新對焦。",
    vote: "人會本能地縮小高頻習慣，因為『偶爾』聽起來比真實次數更像自己。",
    bet: "我們會急著用人設定罪，但只有完整行動線才能把懷疑變成答案。",
    timeline: "一天的發票連起來，就是一條沒人能否認的行動線。",
    clue: "決定性線索不是新證據，是舊證據終於排成一直線。",
  };
  return observations[question.kind] ?? "發票記錄行為；當事人的解釋，才補上行為背後的人。";
}

function renderHome() {
  app.innerHTML = `
    <section class="scene hero-grid">
      <div class="hero-copy">
        <div class="issue-strip"><span>ISSUE #0821</span><strong>辦公室限定公演</strong></div>
        <p class="eyebrow">KAHOOT × DETECTIVE × INVOICE</p>
        <h1>發票<em>推理局</em></h1>
        <div class="hero-burst" aria-hidden="true"><strong>發票不會</strong><span>說謊！</span></div>
        <p class="hero-lead">有人的一天被做成了案件。三幕流程：先擦掉發票上的污漬推理消費地點，再看三位同事上台唸口供、投票抓說謊者，最後沿行動線下注指認真兇。</p>
        <div class="button-row">
          <button class="primary-button" data-action="create-case">立案，成為主持人</button>
          <button class="ghost-button" data-action="focus-join">我有案件編號</button>
          ${testMode ? `<span class="test-mode-badge">${demoMode ? "5-MIN DEMO" : "TEST MODE"} · 動畫已關閉</span>` : `<a class="ghost-button test-mode-link" href="/detective.html?test=1">無動畫測試</a><a class="ghost-button test-mode-link" href="/detective.html?demo=1">五分鐘簡報</a>`}
        </div>
        <div class="hero-proof">
          <span class="proof-chip">三幕破案</span>
          <span class="proof-chip">4–8 位偵探</span>
          <span class="proof-chip">真實發票證據</span>
          <span class="proof-chip">不需註冊</span>
        </div>
        <div class="case-loop" aria-label="一局的三個步驟">
          <span><b>01</b><strong>犯罪現場</strong><small>污漬發票推地點</small></span>
          <span><b>02</b><strong>口供審訊</strong><small>兩真一假、台下投票</small></span>
          <span><b>03</b><strong>終局指認</strong><small>行動線＋雙輪下注</small></span>
        </div>
      </div>
      <aside class="folder-card" aria-label="案件檔案袋">
        <span class="paper-clip" aria-hidden="true"></span>
        <p class="eyebrow">CASE DOSSIER</p>
        <h2>消費軌跡失竊案</h2>
        <p>案件由真實發票編譯而成；犯人、口供與定罪皆為遊戲虛構。掃碼入局，領一個偵探代號就能玩。</p>
        <div class="sealed-dossiers" aria-label="案件規模">
          <span><strong>3–5</strong><small>張污漬發票</small></span>
          <span><strong>3–4</strong><small>輪口供審訊</small></span>
          <span><strong>02</strong><small>輪終局下注</small></span>
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
  const identities = state.room?.identities ?? [];
  const open = identities.filter((identity) => !identity.claimedBy);
  app.innerHTML = `
    <section class="scene join-scene">
      <div class="join-card">
        <div class="join-sticker" aria-hidden="true">臨時偵探證</div>
        <div class="join-ghost ghost-shape" aria-hidden="true"><i></i></div>
        <p class="eyebrow">CASE #${escapeHtml(state.code)}</p>
        <h1>領取偵探證</h1>
        <p>取一個偵探代號；如果你是本案關係人，認領自己的身分——第二幕會傳喚你上台。</p>
        <form data-form="join-case">
          <label class="field-label" for="detective-name">偵探代號</label>
          <input id="detective-name" class="case-input" name="nickname" maxlength="16" placeholder="例如：宵夜目擊者" autocomplete="nickname" autofocus />
          <label class="field-label" for="detective-identity">我的身分（本案關係人才選）</label>
          <select id="detective-identity" class="case-input" name="identity">
            <option value="">路人偵探（不認領身分）</option>
            ${open.map((identity) => `<option value="${escapeHtml(identity.name)}">${escapeHtml(identity.name)}</option>`).join("")}
          </select>
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
      <span><strong>${escapeHtml(player.nickname)}</strong><small>${player.identity ? `身分：${escapeHtml(player.identity)}` : player.isBot ? "示範線民" : "路人偵探"}</small></span>
    </div>
  `).join("");
}

function renderLobby() {
  const room = state.room;
  if (state.view === "host") {
    const canStart = room.players.length >= 4 && room.isHost;
    const meta = room.caseMeta;
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
            ${room.caseOptions ? `
              <div class="case-brief" style="margin-top:18px">
                <strong>選擇案件</strong>
                <select class="case-input" data-select="case-index">
                  ${room.caseOptions.map((option) => `<option value="${option.index}" ${option.index === room.caseIndex ? "selected" : ""}>案件 ${String.fromCharCode(65 + option.index)}｜${escapeHtml(option.date)}｜${option.invoiceCount} 張發票｜${option.roundCount} 輪口供｜混淆度 ${option.confusable}</option>`).join("")}
                </select>
                <small>開局前請先人工過一遍案件腳本（隱私規則見 docs/handoff.md §8）。</small>
              </div>` : ""}
          </section>
          <section class="panel">
            <p class="eyebrow">${room.players.length} / 8 DETECTIVES</p>
            <h2>報到名單</h2>
            <div class="live-ticker"><span>現場快報</span><strong>${room.players.length >= 4 ? "已達開案門檻，隨時可以撕封條！" : `再 ${4 - room.players.length} 位偵探即可開案`}</strong></div>
            <p class="panel-note">滿 4 人開案、8 人滿座。Demo 可補示範線民（會自動認領空身分），單人也能順跑完整一局。</p>
            ${demoMode ? `<div class="demo-cue"><span>5-MIN RUN OF SHOW</span><strong>${escapeHtml(demoCue(room))}</strong><small>答案一出就按「快轉」，不等待動畫。</small></div>` : ""}
            <div class="case-brief">
              <strong>案情摘要</strong>
              <p>${escapeHtml(meta.date)} 這一天，有人的消費軌跡被做成了案件：${meta.invoiceCount} 張污漬發票、${meta.roundCount} 輪口供審訊、行動線回放與兩輪下注。真兇就藏在 ${meta.castCount} 名關係人之中。</p>
              <small>消費紀錄為真實發票；案件、口供與定罪皆為虛構。</small>
            </div>
            <div class="case-brief">
              <strong>身分認領（${(room.identities ?? []).filter((identity) => identity.claimedBy).length} / ${(room.identities ?? []).length}）</strong>
              <p>${(room.identities ?? []).map((identity) => identity.claimedBy ? `<b>${escapeHtml(identity.name)}</b>（${escapeHtml(identity.claimedBy)}）` : escapeHtml(identity.name)).join("、")}</p>
            </div>
            <div class="detective-list">${renderDetectiveList(room.players)}</div>
            <div class="button-row">
              <button class="ghost-button" data-action="fill-demo" ${room.isHost ? "" : "disabled"}>補滿 6 位示範偵探</button>
              <button class="primary-button" data-action="start-case" ${canStart ? "" : "disabled"}>開始辦案 · 三幕</button>
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
        <p class="eyebrow">CASE #${escapeHtml(state.code)}</p>
        <h1>${escapeHtml(state.playerName ?? "偵探")}，報到完成</h1>
        <p>${state.room?.viewerIdentity ? `你以「${escapeHtml(state.room.viewerIdentity)}」的身分應訊——第二幕若被傳喚，請照螢幕唸出口供。` : "案件資料正在封存。等主持人按下「開始辦案」，第一張污漬發票就會出現。"}</p>
        <div class="waiting-list">${(state.room?.players ?? []).map((player) => `<span class="waiting-chip">${escapeHtml(player.nickname)}</span>`).join("")}</div>
        <p><strong>${state.room?.players?.length ?? 0} / 8</strong> 位偵探已入局</p>
      </div>
    </section>
  `;
}

function secondsLeft(room) {
  if (!room.phaseEndsAt) return 0;
  return Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
}

function phaseProgress(room) {
  if (!room.phaseEndsAt || !room.phaseStartedAt) return 0;
  const total = room.phaseEndsAt - room.phaseStartedAt;
  const left = Math.max(0, room.phaseEndsAt - Date.now());
  return total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
}

function renderOptions(question, { interactive = false, selected = null, reveal = false } = {}) {
  return question.choices.map((choice, index) => {
    const correct = reveal && choice.id === question.correctChoice;
    const wrong = reveal && choice.id !== question.correctChoice;
    const classes = [selected === choice.id ? "selected" : "", correct ? "correct" : "", wrong ? "wrong" : ""].filter(Boolean).join(" ");
    return `
      <button class="option-button ${classes} ${choice.name ? "has-portrait" : ""}" data-letter="${String.fromCharCode(65 + index)}" ${interactive ? `data-answer="${escapeHtml(choice.id)}"` : "disabled"}>
        ${choice.name ? portraitMarkup(choice, "option-portrait") : ""}
        <span class="option-copy">${choice.name ? `<strong>${escapeHtml(choice.name)}</strong>` : ""}<span>${escapeHtml(choice.label)}</span>${choice.suspect ? `<small class="suspect-tag">嫌疑名單</small>` : ""}</span>
      </button>
    `;
  }).join("");
}

function renderTimelineStops(question) {
  return `<div class="timeline-route" aria-label="案發日行動線">
    ${question.stops.map((stop, index) => `
      <div class="route-stop" style="--stop:${index}">
        <b>${escapeHtml(stop.time)}</b>
        <strong>${escapeHtml(stop.brand)}</strong>
        <span>NT$ ${escapeHtml(String(stop.amt))}</span>
      </div>
    `).join("")}
  </div>`;
}

function renderShowcase(question, room) {
  const isClue = question.kind === "clue";
  app.innerHTML = `
    <section class="scene scene-wide ${actClass(question)}">
      <div class="question-card showcase-card">
        <div class="question-progress"><span class="question-label">${escapeHtml(question.label)}</span><span>${escapeHtml(question.act)}</span></div>
        ${renderCaseProgress(room)}
        ${isClue ? `
          <div class="clue-card">
            <span class="reveal-stamp">機密</span>
            <p class="eyebrow">FINAL CLUE</p>
            <h1>${escapeHtml(question.prompt)}</h1>
            <p>下一輪是最後下注。線索已亮，賠率下降：押中 150 分。</p>
          </div>` : `
          <h1>${escapeHtml(question.prompt)}</h1>
          ${renderTimelineStops(question)}
          <p class="panel-note">行動線播完自動開盤：首輪下注，押中真兇 400 分。</p>`}
        ${room.isHost ? `<div class="button-row" style="margin-top:20px"><button class="ghost-button small-button" data-action="advance">快轉</button></div>` : ""}
      </div>
    </section>
  `;
}

function renderVoteStage(question) {
  const distribution = question.liveDistribution ?? {};
  const totalVotes = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  app.innerHTML = `
    <section class="scene join-scene player-question ${actClass(question)}">
      <div class="question-card">
        <span class="question-sfx" aria-hidden="true">盯——</span>
        <div class="question-progress"><span class="question-label">${escapeHtml(question.label)}</span><span>${escapeHtml(question.act)}</span></div>
        <div class="interrogation-lamp" aria-hidden="true"><span></span><b>你在台上</b></div>
        <h1>你被傳喚上台。請照著唸你的口供，這一輪不能投票。</h1>
        <div class="narration-strip">${escapeHtml(question.narration)}</div>
        <div class="option-grid">${renderOptions(question)}</div>
        <div class="onstage-meter">
          <p class="eyebrow">大家怎麼看你</p>
          ${question.choices.map((choice) => {
            const count = distribution[choice.id] ?? 0;
            const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
            return `<div class="distribution-row"><span>${escapeHtml(choice.name)}</span><span class="distribution-bar"><span style="width:${percent}%"></span></span><strong>${count}</strong></div>`;
          }).join("")}
        </div>
      </div>
    </section>
    <div class="player-status locked">台上受審中 · 目前 ${totalVotes} 票</div>
  `;
}

function renderQuestion() {
  const room = state.room;
  const question = room.question;
  if (question.kind === "timeline" || question.kind === "clue") return renderShowcase(question, room);
  if (question.kind === "vote" && question.viewerOnStage && state.view !== "host") return renderVoteStage(question);

  const remaining = secondsLeft(room);
  const progress = phaseProgress(room);
  const progressText = `第 ${room.stepIndex + 1} / ${room.stepCount} 步`;
  const eligibleCount = room.eligibleCount || room.players.length;
  const answerPercent = eligibleCount ? Math.round((room.answeredCount / eligibleCount) * 100) : 0;
  const statusText = question.kind === "bet" ? "壓上你的判斷 · 下注不倒扣" : question.kind === "vote" ? "台下投票 · 誰在說謊？" : "選一個消費地點";
  const narration = question.kind === "vote" ? `<div class="narration-strip">${escapeHtml(question.narration)}</div>` : "";

  if (state.view !== "host") {
    app.innerHTML = `
      <section class="scene join-scene player-question ${actClass(question)}">
        <div class="question-card">
          <span class="question-sfx" aria-hidden="true">盯——</span>
          <div class="question-progress"><span class="question-label">${escapeHtml(question.label)}</span><span>${escapeHtml(question.act)} · ${progressText}</span></div>
          ${renderCaseProgress(room)}
          ${renderStageProp(question)}
          ${narration}
          <h1>${escapeHtml(question.prompt)}</h1>
          <div class="option-grid ${question.kind === "bet" ? "bet-grid" : ""}">${renderOptions(question, { interactive: !room.viewerAnswered, selected: room.viewerChoice })}</div>
        </div>
      </section>
      <div class="player-status ${room.viewerAnswered ? "locked" : ""}">${room.viewerAnswered ? "✓ 證詞已蓋章・不能反悔" : `剩餘 ${remaining} 秒 · ${statusText}`}</div>
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
          ${narration}
          <h1>${escapeHtml(question.prompt)}</h1>
          <div class="option-grid ${question.kind === "bet" ? "bet-grid" : ""}">${renderOptions(question)}</div>
        </article>
        <aside class="panel timer-panel">
          <div class="timer-ring" style="--progress:${progress}%"><span class="timer-value">${remaining}</span></div>
          <div class="answer-meter">
            <p class="eyebrow">LIVE TESTIMONY</p>
            <h2>${room.answeredCount} / ${eligibleCount} 已${question.kind === "bet" ? "下注" : "作答"}</h2>
            <div class="meter-line"><span style="width:${answerPercent}%"></span></div>
            ${question.kind === "vote" ? `<p class="panel-note">台上 ${Math.max(0, room.players.length - eligibleCount)} 人受審中，不能投票。</p>` : ""}
            <p class="panel-note">全員作答會提前開牌；逾時視為未作答，局不會停。</p>
            ${demoMode ? `<div class="demo-cue compact"><span>PRESENTER CUE</span><strong>${escapeHtml(demoCue(room))}</strong></div>` : ""}
            ${room.isHost ? `<button class="ghost-button small-button" data-action="advance">快轉開牌</button>` : ""}
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
        <span>${escapeHtml(choice.name ?? choice.label)}</span>
        <span class="distribution-bar"><span style="width:${percent}%"></span></span>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
}

function renderEvidenceRows(evidence) {
  return (evidence.rows ?? [])
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<div class="receipt-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderVerdictReveal(question, room) {
  const verdict = question.verdict;
  app.innerHTML = `
    <section class="scene scene-wide act-timeline reveal-scene">
      <div class="evidence-layout">
        <article class="reveal-card">
          <div class="reveal-impact" aria-hidden="true"><strong>啪！</strong><span>開牌</span></div>
          <span class="reveal-stamp">真兇鎖定</span>
          <p class="comic-caption">第三幕｜終局指認 · 所有下注封存完畢，開牌。</p>
          <h1 class="truth-reveal">真兇是 <span>${escapeHtml(verdict.owner)}</span></h1>
          ${verdict.ownerNickname ? `<p>由「${escapeHtml(verdict.ownerNickname)}」飾演。潛逃成績：口供未被過半識破 +${verdict.escapeAct2}、首輪未被過半押中 +${verdict.escapeBet1}。</p>` : `<p>本局無人認領真兇身分；潛逃分從缺。</p>`}
          ${verdict.culpritLie ? `
            <div class="humanity-note">
              <span>打臉現場</span>
              <strong>他在「${escapeHtml(verdict.culpritLie.theme)}」那輪說：「${escapeHtml(verdict.culpritLie.stmt)}」</strong>
              <small>發票開牌：${escapeHtml(verdict.culpritLie.note)}</small>
            </div>` : ""}
          ${room.isHost ? `<div class="button-row" style="margin-top:24px"><button class="ghost-button small-button" data-action="advance">前往結案頁</button></div>` : ""}
        </article>
        <aside class="receipt" aria-label="押注回放">
          <div class="evidence-tape" aria-hidden="true">BETTING LEDGER</div>
          <div class="receipt-head"><small>BET HISTORY</small><strong>押注回放</strong></div>
          ${verdict.betHistory.map((entry) => `<div class="receipt-row"><span>${escapeHtml(entry.nickname)}</span><strong>${escapeHtml(entry.bet1 ?? "—")} → ${escapeHtml(entry.bet2 ?? "—")}</strong></div>`).join("")}
          <p class="receipt-finding">首輪押中 400、末輪押中 150；押錯不倒扣。</p>
        </aside>
      </div>
    </section>
  `;
}

function renderReveal() {
  const room = state.room;
  const question = room.question;
  if (question.kind === "bet" && question.verdict) return renderVerdictReveal(question, room);
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
          <h1 class="truth-reveal">${question.kind === "vote" ? "說謊的是" : "真相是"} <span>${escapeHtml(correctLabel)}</span></h1>
          ${question.kind === "vote" && correctChoice ? `<div class="suspect-frame"><span class="spotlight" aria-hidden="true"></span>${portraitMarkup(correctChoice, "suspect-reveal-portrait")}<div><small>SUSPECT LISTED</small><strong>嫌疑名單 ${room.suspects.length} 人</strong><span>說謊 ≠ 定罪，先框起來，等第三幕行動線。</span></div><b class="suspect-stamp">嫌疑人</b></div>` : ""}
          <p>${escapeHtml(evidence.finding)}</p>
          <div class="humanity-note">
            <span>HUMANITY / 人性觀察</span>
            <strong>${escapeHtml(humanObservation(question))}</strong>
            <small>請當事人用 10 秒補完故事：這筆消費當時到底發生了什麼？</small>
          </div>
          ${demoMode ? `<div class="demo-cue compact"><span>PRESENTER CUE</span><strong>${escapeHtml(demoCue(room))}</strong></div>` : ""}
          <div class="option-grid">${renderOptions(question, { selected: room.viewerChoice, reveal: true })}</div>
          ${state.view === "host" ? `<div class="distribution">${renderDistribution(question, room.answeredCount)}</div>` : ""}
          ${room.isHost ? `<div class="button-row" style="margin-top:24px"><button class="ghost-button small-button" data-action="advance">快轉排行榜</button></div>` : ""}
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
  const board = room.leaderboard;
  const viewerIndex = state.playerKey ? board.findIndex((player) => player.id === state.playerKey) : -1;
  const shown = board.slice(0, 5);
  const viewerOutside = viewerIndex >= 5 ? board[viewerIndex] : null;
  app.innerHTML = `
    <section class="scene">
      <article class="leaderboard-card">
        <div class="newspaper-flag" aria-hidden="true">EXTRA! EXTRA!</div>
        <p class="eyebrow">CASE RANKING · ${room.stepIndex + 1}/${room.stepCount}</p>
        <h1>誰最會<br /><span>讀同事？</span></h1>
        <p>答題有速度加分、投票命中 +100、下注押中大額入帳；亂猜沒有倒扣。</p>
        <div class="rank-list">
          ${shown.map((player, index) => `
            <div class="rank-row ${player.id === state.playerKey ? "self" : ""}">
              <span class="rank-number">${["👑", "🥈", "🥉"][index] ?? `#${index + 1}`}</span>
              <strong>${escapeHtml(player.nickname)}</strong>
              <span class="rank-score">${player.score} pts</span>
            </div>
          `).join("")}
          ${viewerOutside ? `<div class="rank-row self"><span class="rank-number">#${viewerIndex + 1}</span><strong>${escapeHtml(viewerOutside.nickname)}</strong><span class="rank-score">${viewerOutside.score} pts</span></div>` : ""}
        </div>
        ${room.isHost ? `<div class="button-row" style="justify-content:center;margin-top:24px"><button class="ghost-button small-button" data-action="advance">快轉下一步</button></div>` : ""}
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
      <div class="case-topline"><div><p class="eyebrow">CASE CLOSED</p><h1>結案</h1></div><span class="case-number">案件 #${escapeHtml(room.code)}</span></div>
      <div class="result-grid">
        <article class="result-card" id="share-card">
          <div class="result-burst" aria-hidden="true">破案！</div>
          <div class="confetti-field" aria-hidden="true">✦ ● ▲ ✦ ■ ●</div>
          <p class="eyebrow" style="color:#8d211d">FICTIONAL CULPRIT</p>
          <div class="culprit-lockup">${portraitMarkup({ name: results.culprit }, "culprit-portrait")}<span>證據命中</span></div>
          <h1><span class="champion-name">${escapeHtml(results.culprit)}</span><br />就是真兇</h1>
          ${results.culpritLie ? `<div class="humanity-note"><span>謊言 × 打臉發票</span><strong>「${escapeHtml(results.culpritLie.stmt)}」</strong><small>${escapeHtml(results.culpritLie.note)}（主題：${escapeHtml(results.culpritLie.theme)}）</small></div>` : ""}
          <div class="evidence-chain" aria-label="案發日行動線">
            ${results.timeline.map((stop, index) => `<span><b>${index + 1}</b>${escapeHtml(stop.time)} ${escapeHtml(stop.brand)}</span>`).join("")}
          </div>
          <div class="result-metrics">
            <div class="result-metric"><strong>${escapeHtml(champion.nickname)}</strong><small>冠軍偵探 · ${champion.score} pts</small></div>
            <div class="result-metric"><strong>${results.escapeTotal}</strong><small>真兇潛逃分${results.culpritNickname ? ` · ${escapeHtml(results.culpritNickname)}` : ""}</small></div>
            <div class="result-metric"><strong>${results.accuracy}%</strong><small>全局答對率</small></div>
          </div>
          <div class="result-metrics">
            <div class="result-metric"><strong>NT$ ${results.aggregate.invoiceTotal.toLocaleString("zh-TW")}</strong><small>本案 ${results.aggregate.invoiceCount} 張證據發票合計</small></div>
            <div class="result-metric"><strong>${escapeHtml(results.aggregate.clue.replace(/^決定性線索:/, ""))}</strong><small>本局最驚人的一條紀錄</small></div>
          </div>
          <p class="case-finding">${escapeHtml(results.caseFinding)}</p>
        </article>
        <aside class="panel">
          <p class="eyebrow">NEXT CASE</p>
          <h2>開新案件，考你的朋友</h2>
          <div class="share-hook"><strong>下一局的誘餌</strong><span>「你看到的是人設，發票記得的是日常。」</span></div>
          <p class="panel-note">分享的不是誰被公開處刑，而是整間辦公室對同一個人的印象，如何被一張張發票翻轉。</p>
          <div class="rank-list" style="margin-top:8px">
            ${results.leaderboard.slice(0, 5).map((player, index) => `<div class="rank-row"><span class="rank-number">#${index + 1}</span><strong>${escapeHtml(player.nickname)}</strong><span class="rank-score">${player.score}</span></div>`).join("")}
          </div>
          <div class="final-suspect-list" style="margin-top:18px"><strong>押注回放</strong>${results.betHistory.map((entry) => `<div class="suspect-line"><span><strong>${escapeHtml(entry.nickname)}</strong><small>${escapeHtml(entry.bet1 ?? "—")} → ${escapeHtml(entry.bet2 ?? "—")}</small></span><span class="suspect-status">${entry.bet2 === results.culprit ? "押中" : "落空"}</span></div>`).join("")}</div>
          <div class="button-row">
            ${room.isHost ? `<button class="primary-button" data-action="reset-case">開新案件</button>` : ""}
            <button class="secondary-button" data-action="share-result">分享戰績</button>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderError() {
  app.innerHTML = `
    <section class="scene"><div class="error-card"><p class="eyebrow">CASE ERROR</p><h1>這個案件斷線了</h1><p>${escapeHtml(state.error ?? "請回到首頁重新立案。")}</p><a class="primary-button" style="display:inline-grid;place-items:center;text-decoration:none" href="/detective.html">回到發票推理局</a></div></section>
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
  const progress = phaseProgress(state.room);
  const timerValue = document.querySelector(".timer-value");
  const timerRing = document.querySelector(".timer-ring");
  const playerStatus = document.querySelector(".player-status:not(.locked)");
  if (timerValue) timerValue.textContent = remaining;
  if (timerRing) timerRing.style.setProperty("--progress", `${progress}%`);
  if (playerStatus) playerStatus.textContent = playerStatus.textContent.replace(/剩餘 \d+ 秒/, `剩餘 ${remaining} 秒`);
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

async function hostAction(action, extra = {}) {
  if (!state.hostKey || state.busy) return;
  state.busy = true;
  try {
    state.room = await request(`/api/detective/rooms/${state.code}/${action}`, {
      method: "POST",
      body: JSON.stringify({ hostKey: state.hostKey, ...extra }),
    });
    render();
  } catch (error) {
    notify(errorMessages[error.code] ?? "操作失敗，請再試一次。");
  } finally {
    state.busy = false;
  }
}

async function joinCase(nickname, identity) {
  if (state.busy) return;
  state.busy = true;
  try {
    const data = await request(`/api/detective/rooms/${state.code}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname, identity }),
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
  const results = state.room?.results;
  const champion = results?.champion?.nickname ?? "首席偵探";
  const text = `案件 #${state.code} 已結案：${champion} 成為冠軍偵探，真兇是 ${results?.culprit ?? "？？"}。你看到的是人設，發票記得的是日常。`;
  if (navigator.share) {
    try { await navigator.share({ title: "發票推理局｜誰是真兇？", text, url: caseUrl(state.code) }); return; } catch { /* user cancelled */ }
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
  if (form.dataset.form === "join-case") joinCase(String(data.get("nickname") ?? ""), String(data.get("identity") ?? ""));
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-select='case-index']");
  if (!select) return;
  hostAction("case", { caseIndex: Number(select.value) });
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
