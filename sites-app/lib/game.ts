import casePack from "./cases.json";

// ---------- 案件包（編譯器 v3 產出；owner / is_lie / answer 僅存在伺服端） ----------
type Invoice = { time: string; brand: string; reg_name: string; addr: string; amt: number; items: string[] };
type Act1Question = { invoice_idx: number; type: string; prompt: string; options: string[]; answer: string; "遮蔽說明"?: string };
type Statement = { player: string; stmt: string; is_lie: boolean; note: string };
type Act2Round = { round: number; theme: string; members: string[]; liar: string; statements: Statement[]; "旁白": string };
type Act3 = { reveal: string; first_bet: string; final_clue: string; final_bet: string; escape_bonus: string };
type CaseData = { owner: string; date: string; confusable: number; invoices: Invoice[]; act1: Act1Question[]; act2: Act2Round[]; act3: Act3 };

const cases = (casePack as { cases: CaseData[] }).cases;

// ---------- 狀態機 ----------
type StepKind = "quiz" | "vote" | "timeline" | "bet" | "clue";
type Step = { kind: StepKind; index: number; betRound?: 1 | 2 };
type Answer = { choice: string; answeredAt: number; points: number };
type Player = { id: string; nickname: string; identity: string | null; score: number; answerScore: number; betScore: number; escapeScore: number; isBot: boolean };
type Verdict = {
  owner: string;
  ownerNickname: string | null;
  escapeAct2: number;
  escapeBet1: number;
  culpritLie: { theme: string; stmt: string; note: string } | null;
  betHistory: { nickname: string; identity: string | null; bet1: string | null; bet2: string | null; isBot: boolean }[];
};
type Room = {
  code: string; hostKey: string; phase: "lobby" | "question" | "reveal" | "leaderboard" | "results";
  caseIndex: number; steps: Step[]; stepIndex: number;
  phaseStartedAt: number | null; phaseEndsAt: number | null;
  players: Player[]; answers: Record<number, Record<string, Answer>>;
  settledSteps: number[]; suspects: string[]; verdict: Verdict | null;
};

const timings = { quizMs: 20_000, voteMs: 20_000, betMs: 15_000, timelineStopMs: 2_000, botAnswerMs: 2_500 };

const root = globalThis as typeof globalThis & { __invoiceDetectiveRooms?: Map<string, Room> };
const rooms = root.__invoiceDetectiveRooms ??= new Map<string, Room>();

function caseOf(room: Room) { return cases[room.caseIndex]; }
function stepOf(room: Room): Step | null { return room.stepIndex >= 0 ? room.steps[room.stepIndex] ?? null : null; }
function castOf(c: CaseData) {
  const names = new Set<string>();
  c.act2.forEach((round) => round.members.forEach((member) => names.add(member)));
  return [...names].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}
function buildSteps(c: CaseData): Step[] {
  return [
    ...c.act1.map((_, index) => ({ kind: "quiz" as const, index })),
    ...c.act2.map((_, index) => ({ kind: "vote" as const, index })),
    { kind: "timeline", index: 0 },
    { kind: "bet", index: 0, betRound: 1 },
    { kind: "clue", index: 0 },
    { kind: "bet", index: 1, betRound: 2 },
  ];
}
function liarIndex(round: Act2Round) { return round.statements.findIndex((s) => s.is_lie); }
function onStage(room: Room, player: Player, step: Step | null) {
  if (!step || step.kind !== "vote" || !player.identity) return false;
  return caseOf(room).act2[step.index].members.includes(player.identity);
}
function eligible(room: Room, step: Step | null) {
  if (!step || step.kind === "timeline" || step.kind === "clue") return [];
  return room.players.filter((player) => !onStage(room, player, step));
}
function stepDuration(_room: Room, step: Step) {
  if (step.kind === "quiz") return timings.quizMs;
  if (step.kind === "vote") return timings.voteMs;
  return timings.betMs;
}
function correctChoiceOf(room: Room, step: Step): string | null {
  const c = caseOf(room);
  if (step.kind === "quiz") { const q = c.act1[step.index]; return String(q.options.indexOf(q.answer)); }
  if (step.kind === "vote") return String(liarIndex(c.act2[step.index]));
  if (step.kind === "bet") return c.owner;
  return null;
}
function addScore(player: Player, track: "answerScore" | "betScore" | "escapeScore", points: number) {
  player[track] += points;
  player.score = player.answerScore + player.betScore + player.escapeScore;
}

function code() { for (let i = 0; i < 100; i += 1) { const value = String(Math.floor(1000 + Math.random() * 9000)); if (!rooms.has(value)) return value; } return String(Date.now()).slice(-4); }
function ranks(room: Room) { return room.players.map(({ id, nickname, identity, score, isBot }) => ({ id, nickname, identity, score, isBot })).sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "zh-Hant")); }

function beginStep(room: Room, index: number) {
  room.stepIndex = index;
  room.phase = "question";
  room.phaseStartedAt = Date.now();
  const step = room.steps[index];
  // 展示型步驟（行動線／線索）不倒數，由主持人控場前進
  room.phaseEndsAt = step.kind === "timeline" || step.kind === "clue" ? null : room.phaseStartedAt + stepDuration(room, step);
  room.answers[index] ??= {};
}
function nextStep(room: Room) {
  if (room.stepIndex + 1 >= room.steps.length) { room.phase = "results"; room.phaseEndsAt = null; return; }
  beginStep(room, room.stepIndex + 1);
}

function computeVerdict(room: Room) {
  const c = caseOf(room);
  const bet1Index = room.steps.findIndex((step) => step.kind === "bet" && step.betRound === 1);
  const bet2Index = room.steps.findIndex((step) => step.kind === "bet" && step.betRound === 2);
  const bet1 = room.answers[bet1Index] ?? {};
  const bet2 = room.answers[bet2Index] ?? {};
  for (const player of room.players) {
    if (bet1[player.id]?.choice === c.owner) addScore(player, "betScore", 400);
    if (bet2[player.id]?.choice === c.owner) addScore(player, "betScore", 150);
  }
  const culpritPlayer = room.players.find((player) => player.identity === c.owner) ?? null;
  const culpritRound = c.act2.findIndex((round) => round.liar === c.owner);
  let escapeAct2 = 0;
  let escapeBet1 = 0;
  if (culpritRound >= 0) {
    const votes = Object.values(room.answers[c.act1.length + culpritRound] ?? {});
    const hits = votes.filter((vote) => vote.choice === String(liarIndex(c.act2[culpritRound]))).length;
    if (hits * 2 <= votes.length) escapeAct2 = 150;
  }
  const bets = Object.values(bet1);
  if (bets.filter((bet) => bet.choice === c.owner).length * 2 <= bets.length) escapeBet1 = 150;
  if (culpritPlayer) { addScore(culpritPlayer, "escapeScore", escapeAct2 + escapeBet1); }
  const lieStatement = culpritRound >= 0 ? c.act2[culpritRound].statements[liarIndex(c.act2[culpritRound])] : null;
  room.verdict = {
    owner: c.owner,
    ownerNickname: culpritPlayer?.nickname ?? null,
    escapeAct2, escapeBet1,
    culpritLie: lieStatement ? { theme: c.act2[culpritRound].theme, stmt: lieStatement.stmt, note: lieStatement.note } : null,
    betHistory: room.players.map((player) => ({
      nickname: player.nickname, identity: player.identity, isBot: player.isBot,
      bet1: bet1[player.id]?.choice ?? null, bet2: bet2[player.id]?.choice ?? null,
    })),
  };
}

function settleStep(room: Room) {
  if (room.settledSteps.includes(room.stepIndex)) return;
  room.settledSteps.push(room.stepIndex);
  const step = room.steps[room.stepIndex];
  const answers = room.answers[room.stepIndex] ?? {};
  const correct = correctChoiceOf(room, step);
  if (step.kind === "quiz") {
    for (const player of room.players) { const a = answers[player.id]; if (a?.choice === correct) addScore(player, "answerScore", a.points); }
  } else if (step.kind === "vote") {
    for (const player of room.players) { const a = answers[player.id]; if (a?.choice === correct) addScore(player, "answerScore", 100); }
    const liar = caseOf(room).act2[step.index].liar;
    if (!room.suspects.includes(liar)) room.suspects.push(liar);
  } else if (step.kind === "bet" && step.betRound === 2) {
    computeVerdict(room);
  } else {
    nextStep(room);
    return;
  }
  // 開牌畫面停留到主持人前進為止（真人控場，不自動翻頁）
  room.phase = "reveal";
  room.phaseStartedAt = Date.now();
  room.phaseEndsAt = null;
}

function botAnswers(room: Room) {
  const step = stepOf(room);
  if (!step || room.phase !== "question") return;
  const now = Date.now();
  if (!room.phaseStartedAt || now - room.phaseStartedAt < timings.botAnswerMs) return;
  const answers = room.answers[room.stepIndex] ?? {};
  const c = caseOf(room);
  for (const [botIndex, bot] of room.players.filter((p) => p.isBot && !answers[p.id]).entries()) {
    if (onStage(room, bot, step)) continue;
    let choice: string | null = null;
    if (step.kind === "quiz") {
      // 示範用：多數答對、少數答錯（沿用原殼節奏）
      const ids = c.act1[step.index].options.map((_, i) => String(i));
      const correct = correctChoiceOf(room, step)!;
      choice = (room.stepIndex + botIndex) % 4 === 0 ? ids[(ids.indexOf(correct) + 1) % ids.length] : correct;
    } else if (step.kind === "vote") {
      // 均勻亂猜：投票分布不可洩漏誰是說謊者
      choice = String(Math.floor(Math.random() * c.act2[step.index].statements.length));
    } else if (step.kind === "bet") {
      const cast = castOf(c);
      choice = cast[Math.floor(Math.random() * cast.length)];
    }
    if (choice !== null) answers[bot.id] = { choice, answeredAt: now, points: step.kind === "quiz" ? 125 : 0 };
  }
  room.answers[room.stepIndex] = answers;
}

function sync(room: Room) {
  // 完全不自動翻頁：倒數歸零只停止收證詞（answerRoom 會擋），
  // 開牌／排行榜／下一步全部由主持人 advance 觸發
  if (room.phase === "question") botAnswers(room);
}

export function createRoom() {
  const room: Room = { code: code(), hostKey: crypto.randomUUID(), phase: "lobby", caseIndex: 0, steps: [], stepIndex: -1, phaseStartedAt: null, phaseEndsAt: null, players: [], answers: {}, settledSteps: [], suspects: [], verdict: null };
  rooms.set(room.code, room);
  return { room: publicRoom(room, { hostKey: room.hostKey }), hostKey: room.hostKey };
}
export function findRoom(roomCode: string) { const room = rooms.get(roomCode); if (!room) throw Object.assign(new Error("case_not_found"), { status: 404 }); sync(room); return room; }

// ---------- 對外視圖（安全鐵則：owner / is_lie / answer 不進玩家 payload） ----------
function actLabelOf(step: Step | null) {
  if (!step) return null;
  if (step.kind === "quiz") return "第一幕｜犯罪現場";
  if (step.kind === "vote") return "第二幕｜口供審訊";
  return "第三幕｜終局指認";
}

function questionView(room: Room, viewerPlayer: Player | null) {
  const step = stepOf(room);
  if (!step) return null;
  const c = caseOf(room);
  const reveal = ["reveal", "leaderboard", "results"].includes(room.phase);
  const answers = room.answers[room.stepIndex] ?? {};
  const distribution = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, Object.values(answers).filter((a) => a.choice === id).length]));
  const act = actLabelOf(step);

  if (step.kind === "quiz") {
    const q = c.act1[step.index];
    const invoice = c.invoices[q.invoice_idx];
    return {
      kind: "quiz", act, label: q.type, prompt: q.prompt,
      prop: { time: invoice.time, amt: invoice.amt, date: c.date },
      choices: q.options.map((option, index) => ({ id: String(index), label: option })),
      ...(reveal ? {
        correctChoice: String(q.options.indexOf(q.answer)),
        evidence: {
          title: `證物 ${q.invoice_idx + 1} 號`,
          eyebrow: `EVIDENCE ${q.invoice_idx + 1} / ${c.invoices.length}`,
          rows: [
            ["時間", `${c.date} ${invoice.time}`],
            ["商家", invoice.brand],
            ["登記名", invoice.reg_name.slice(0, 16)],
            ["地址", invoice.addr.slice(0, 6)],
            ["品項", invoice.items.slice(0, 3).join("、").slice(0, 30)],
            ["金額", `NT$ ${invoice.amt.toLocaleString("zh-TW")}`],
          ],
          finding: q["遮蔽說明"] ? `污漬擦除：${q["遮蔽說明"]}。發票歸位證據板。` : "污漬擦除，發票歸位證據板。",
        },
        distribution: distribution(q.options.map((_, i) => String(i))),
      } : {}),
    };
  }

  if (step.kind === "vote") {
    const round = c.act2[step.index];
    const viewerOnStage = viewerPlayer ? onStage(room, viewerPlayer, step) : false;
    return {
      kind: "vote", act, label: `口供第 ${round.round} 輪`, prompt: `主題：「${round.theme}」——三句口供、兩真一假。台下投票，誰在說謊？`,
      theme: round.theme, narration: round["旁白"], round: round.round, roundCount: c.act2.length,
      choices: round.statements.map((s, index) => ({ id: String(index), name: s.player, label: s.stmt })),
      viewerOnStage,
      ...(viewerOnStage && !reveal ? { liveDistribution: distribution(round.statements.map((_, i) => String(i))) } : {}),
      ...(reveal ? {
        correctChoice: String(liarIndex(round)),
        evidence: {
          title: `證物 ${c.invoices.length + round.round} 號`,
          eyebrow: `INTERROGATION ${round.round} / ${c.act2.length}`,
          rows: [
            ["主題商家", round.theme],
            ["說謊者", round.statements[liarIndex(round)].player],
            ["破綻", round.statements[liarIndex(round)].note],
            ["處置", "列入嫌疑名單"],
          ],
          finding: `${round.statements[liarIndex(round)].player} 的口供被發票打臉：${round.statements[liarIndex(round)].note}。說謊不等於犯案，先列入嫌疑名單。`,
        },
        distribution: distribution(round.statements.map((_, i) => String(i))),
      } : {}),
    };
  }

  if (step.kind === "timeline") {
    return {
      kind: "timeline", act, label: "行動線回放", prompt: "案發日的完整行動線，按真實時間戳播放。看清楚，等一下要下注。",
      stops: c.invoices.map((invoice) => ({ time: invoice.time, brand: invoice.brand, amt: invoice.amt })),
      stopMs: timings.timelineStopMs,
      choices: [] as { id: string; label: string }[],
    };
  }

  if (step.kind === "clue") {
    return { kind: "clue", act, label: "決定性線索", prompt: c.act3.final_clue, choices: [] as { id: string; label: string }[] };
  }

  // bet
  const round = step.betRound ?? 1;
  return {
    kind: "bet", act, label: round === 1 ? "首輪下注" : "末輪下注",
    prompt: round === 1 ? "行動線播完，開盤。押中真兇：400 分。" : "決定性線索已亮出。最後一次下注：150 分。",
    betRound: round,
    clue: round === 2 ? c.act3.final_clue : null,
    choices: castOf(c).map((name) => ({ id: name, label: name, suspect: room.suspects.includes(name) })),
    ...(reveal && room.verdict ? { correctChoice: room.verdict.owner, verdict: room.verdict } : {}),
  };
}

export function publicRoom(room: Room, viewer: { playerKey?: string | null; hostKey?: string | null } = {}) {
  const c = caseOf(room);
  const step = stepOf(room);
  const answers = room.answers[room.stepIndex] ?? {};
  const viewerPlayer = viewer.playerKey ? room.players.find((player) => player.id === viewer.playerKey) ?? null : null;
  const board = ranks(room);
  const cast = castOf(c);
  const isHost = Boolean(viewer.hostKey && viewer.hostKey === room.hostKey);
  const questionSteps = room.steps.filter((s) => s.kind === "quiz" || s.kind === "vote");
  const settledQuestionSteps = room.settledSteps.filter((i) => ["quiz", "vote"].includes(room.steps[i]?.kind));
  const totalAnswers = settledQuestionSteps.reduce((n, i) => n + Object.keys(room.answers[i] ?? {}).length, 0);
  const correctAnswers = settledQuestionSteps.reduce((n, i) => n + Object.values(room.answers[i] ?? {}).filter((a) => a.choice === correctChoiceOf(room, room.steps[i])).length, 0);
  return {
    code: room.code, phase: room.phase,
    stepIndex: room.stepIndex, stepCount: room.steps.length || buildSteps(c).length,
    act: actLabelOf(step),
    phaseStartedAt: room.phaseStartedAt, phaseEndsAt: room.phaseEndsAt,
    players: room.players.map(({ id, nickname, identity, score, isBot }) => ({ id, nickname, identity, score, isBot })),
    leaderboard: board,
    suspects: room.suspects,
    caseIndex: room.caseIndex,
    caseMeta: { date: c.date, invoiceCount: c.invoices.length, roundCount: c.act2.length, confusable: c.confusable, castCount: cast.length },
    ...(room.phase === "lobby" ? {
      identities: cast.map((name) => ({ name, claimedBy: room.players.find((player) => player.identity === name)?.nickname ?? null })),
      ...(isHost ? { caseOptions: cases.map((option, index) => ({ index, date: option.date, invoiceCount: option.invoices.length, roundCount: option.act2.length, confusable: option.confusable })) } : {}),
    } : {}),
    answeredCount: Object.keys(answers).length,
    eligibleCount: eligible(room, step).length,
    viewerAnswered: Boolean(viewerPlayer && answers[viewerPlayer.id]),
    viewerChoice: viewerPlayer ? answers[viewerPlayer.id]?.choice ?? null : null,
    viewerIdentity: viewerPlayer?.identity ?? null,
    isHost,
    question: questionView(room, viewerPlayer),
    results: room.phase === "results" && room.verdict ? {
      champion: board[0] ?? null,
      leaderboard: board,
      accuracy: totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      culprit: room.verdict.owner,
      culpritNickname: room.verdict.ownerNickname,
      escapeAct2: room.verdict.escapeAct2,
      escapeBet1: room.verdict.escapeBet1,
      escapeTotal: room.verdict.escapeAct2 + room.verdict.escapeBet1,
      culpritLie: room.verdict.culpritLie,
      betHistory: room.verdict.betHistory,
      timeline: c.invoices.map((invoice) => ({ time: invoice.time, brand: invoice.brand, amt: invoice.amt })),
      aggregate: {
        invoiceCount: c.invoices.length,
        invoiceTotal: c.invoices.reduce((sum, invoice) => sum + invoice.amt, 0),
        clue: c.act3.final_clue,
      },
      caseFinding: "發票證明了消費紀錄；案件、口供與犯人身分皆為遊戲虛構。",
      questionStepCount: questionSteps.length,
    } : null,
  };
}

export function roomGet(roomCode: string, viewer: Record<string, string | null>) { return publicRoom(findRoom(roomCode), viewer); }

export function roomAction(roomCode: string, action: string, body: Record<string, string>) {
  const room = findRoom(roomCode);
  if (action === "join") {
    if (room.phase !== "lobby") throw Object.assign(new Error("case_already_started"), { status: 409 });
    if (room.players.length >= 8) throw Object.assign(new Error("case_full"), { status: 409 });
    const nickname = String(body.nickname ?? "").trim().replace(/\s+/g, " ").slice(0, 16);
    if (nickname.length < 2) throw Object.assign(new Error("nickname_too_short"), { status: 400 });
    if (room.players.some((player) => player.nickname.toLowerCase() === nickname.toLowerCase())) throw Object.assign(new Error("nickname_taken"), { status: 409 });
    const identity = String(body.identity ?? "").trim() || null;
    if (identity) {
      if (!castOf(caseOf(room)).includes(identity)) throw Object.assign(new Error("identity_unknown"), { status: 400 });
      if (room.players.some((player) => player.identity === identity)) throw Object.assign(new Error("identity_taken"), { status: 409 });
    }
    const player: Player = { id: crypto.randomUUID(), nickname, identity, score: 0, answerScore: 0, betScore: 0, escapeScore: 0, isBot: false };
    room.players.push(player);
    return { status: 201, body: { playerKey: player.id, room: publicRoom(room, { playerKey: player.id }) } };
  }
  if (body.hostKey !== room.hostKey) throw Object.assign(new Error("host_required"), { status: 403 });
  if (action === "case") {
    if (room.phase !== "lobby") throw Object.assign(new Error("case_already_started"), { status: 409 });
    const caseIndex = Number(body.caseIndex);
    if (!Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= cases.length) throw Object.assign(new Error("case_unknown"), { status: 400 });
    room.caseIndex = caseIndex;
    const cast = castOf(caseOf(room));
    room.players.forEach((player) => { if (player.identity && !cast.includes(player.identity)) player.identity = null; });
  } else if (action === "fill") {
    if (room.phase !== "lobby") throw Object.assign(new Error("case_already_started"), { status: 409 });
    const cast = castOf(caseOf(room));
    const fallbackNames = ["餅乾警探", "手搖線民", "宵夜目擊者", "發票小精靈", "冰箱鑑識官", "週末美食家"];
    while (room.players.length < 6) {
      const identity = cast.find((name) => !room.players.some((player) => player.identity === name)) ?? null;
      const nickname = identity ? `${identity}·線民`.slice(0, 16) : fallbackNames.find((name) => !room.players.some((player) => player.nickname === name)) ?? `示範偵探 ${room.players.length + 1}`;
      room.players.push({ id: crypto.randomUUID(), nickname, identity, score: 0, answerScore: 0, betScore: 0, escapeScore: 0, isBot: true });
    }
  } else if (action === "start") {
    if (room.phase !== "lobby") throw Object.assign(new Error("case_already_started"), { status: 409 });
    if (room.players.length < 4) throw Object.assign(new Error("need_four_detectives"), { status: 409 });
    room.steps = buildSteps(caseOf(room));
    room.suspects = [];
    room.verdict = null;
    room.answers = {};
    room.settledSteps = [];
    beginStep(room, 0);
  } else if (action === "advance") {
    if (room.phase === "question") settleStep(room);
    else if (room.phase === "reveal") {
      const step = stepOf(room)!;
      if (step.kind === "bet") { room.phase = "results"; room.phaseEndsAt = null; }
      else { room.phase = "leaderboard"; room.phaseStartedAt = Date.now(); room.phaseEndsAt = null; }
    } else if (room.phase === "leaderboard") nextStep(room);
  } else if (action === "reset") {
    room.phase = "lobby"; room.stepIndex = -1; room.steps = []; room.phaseStartedAt = null; room.phaseEndsAt = null;
    room.answers = {}; room.settledSteps = []; room.suspects = []; room.verdict = null;
    room.players.forEach((player) => { player.score = 0; player.answerScore = 0; player.betScore = 0; player.escapeScore = 0; });
  } else if (action === "answer") {
    throw Object.assign(new Error("player_required"), { status: 403 });
  } else {
    throw Object.assign(new Error("unknown_action"), { status: 404 });
  }
  return { status: 200, body: publicRoom(room, { hostKey: body.hostKey }) };
}

export function answerRoom(roomCode: string, body: Record<string, string>) {
  const room = findRoom(roomCode);
  if (room.phase !== "question") throw Object.assign(new Error("answering_closed"), { status: 409 });
  const step = stepOf(room)!;
  if (step.kind === "timeline" || step.kind === "clue") throw Object.assign(new Error("answering_closed"), { status: 409 });
  const player = room.players.find((candidate) => candidate.id === body.playerKey && !candidate.isBot);
  if (!player) throw Object.assign(new Error("player_required"), { status: 403 });
  if (onStage(room, player, step)) throw Object.assign(new Error("on_stage_locked"), { status: 403 });
  const view = questionView(room, player)!;
  if (!view.choices.some((choice: { id: string }) => choice.id === body.choice)) throw Object.assign(new Error("invalid_choice"), { status: 400 });
  const answers = room.answers[room.stepIndex] ?? {};
  if (answers[player.id]) throw Object.assign(new Error("answer_locked"), { status: 409 });
  const secondsLeft = Math.max(0, Math.ceil(((room.phaseEndsAt ?? Date.now()) - Date.now()) / 1000));
  answers[player.id] = { choice: body.choice, answeredAt: Date.now(), points: step.kind === "quiz" ? 100 + secondsLeft * 5 : 0 };
  room.answers[room.stepIndex] = answers;
  sync(room);
  return publicRoom(room, { playerKey: player.id });
}
