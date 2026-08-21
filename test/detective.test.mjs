import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAppServer, DETECTIVE_QUESTIONS, DETECTIVE_SUSPECTS } from "../server.mjs";

async function withServer(run) {
  const server = createAppServer({
    timings: { questionMs: 50, revealMs: 20, leaderboardMs: 20, botAnswerMs: 10 },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function post(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

test("detective API runs a complete nine-question room lifecycle", async () => {
  await withServer(async (base) => {
    const created = await post(`${base}/api/detective/rooms`);
    assert.equal(created.response.status, 201);
    assert.match(created.json.room.code, /^\d{4}$/);
    const { code } = created.json.room;
    const { hostKey } = created.json;

    const players = [];
    for (const nickname of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      const joined = await post(`${base}/api/detective/rooms/${code}/join`, { nickname });
      assert.equal(joined.response.status, 201);
      players.push(joined.json.playerKey);
    }

    const started = await post(`${base}/api/detective/rooms/${code}/start`, { hostKey });
    assert.equal(started.json.phase, "question");
    assert.equal(started.json.question.correctChoice, undefined, "answer stays hidden during questioning");

    const answered = await post(`${base}/api/detective/rooms/${code}/answer`, {
      playerKey: players[0],
      choice: DETECTIVE_QUESTIONS[0].correctChoice,
    });
    assert.equal(answered.response.status, 200);
    assert.equal(answered.json.viewerAnswered, true);

    for (let index = 0; index < DETECTIVE_QUESTIONS.length; index += 1) {
      const reveal = await post(`${base}/api/detective/rooms/${code}/advance`, { hostKey });
      assert.equal(reveal.json.phase, "reveal");
      assert.equal(reveal.json.question.correctChoice, DETECTIVE_QUESTIONS[index].correctChoice);
      assert.ok(reveal.json.question.evidence.finding);

      const ranking = await post(`${base}/api/detective/rooms/${code}/advance`, { hostKey });
      assert.equal(ranking.json.phase, "leaderboard");

      const next = await post(`${base}/api/detective/rooms/${code}/advance`, { hostKey });
      assert.equal(next.json.phase, index === DETECTIVE_QUESTIONS.length - 1 ? "results" : "question");
    }

    const final = await fetch(`${base}/api/detective/rooms/${code}?host=${hostKey}`).then((response) => response.json());
    assert.equal(final.questionCount, 9);
    assert.ok(final.results.caseFinding.includes("發票"));
    assert.equal(final.results.culprit, "Rebecca｜彭聿采");
    assert.equal(final.results.culpritPortrait, "/avatars/rebecca.png");
    assert.equal(final.results.finalSuspects.length, 4);
    assert.equal(final.results.needPyramid.length, 5);
    assert.deepEqual(final.results.evidenceChain, ["6/15 購買", "大潤發", "風倍清噴霧除菌", "Rebecca 的發票"]);
    assert.equal(final.players.length, 4);
  });
});

test("question architecture follows the three-act investigation", () => {
  assert.equal(DETECTIVE_QUESTIONS.length, 9);
  assert.deepEqual(
    DETECTIVE_QUESTIONS.map((question) => question.act),
    [
      "第一幕｜蒐集資訊", "第一幕｜蒐集資訊", "第一幕｜蒐集資訊",
      "第二幕｜框出嫌疑人", "第二幕｜框出嫌疑人", "第二幕｜框出嫌疑人", "第二幕｜框出嫌疑人",
      "第三幕｜找出犯人", "第三幕｜找出犯人",
    ],
  );

  for (const question of DETECTIVE_QUESTIONS.slice(3, 7)) {
    assert.equal(question.type, "lie");
    assert.equal(question.choices.length, 3);
    assert.equal(new Set(question.choices.map((choice) => choice.personId)).size, 3);
    assert.ok(question.choices.some((choice) => choice.id === question.correctChoice));
    assert.ok(question.choices.every((choice) => choice.avatarUrl?.startsWith("/avatars/")));
  }

  assert.equal(DETECTIVE_QUESTIONS[7].choices.length, 4);
  assert.ok(DETECTIVE_QUESTIONS[7].choices.every((choice) => choice.timeline?.length === 3));
  assert.deepEqual(DETECTIVE_SUSPECTS.map((suspect) => suspect.id), ["rebecca", "xu-ruiyu", "he-pinru", "huang-junlin"]);
  assert.ok(DETECTIVE_SUSPECTS.every((suspect) => suspect.avatarSource === "Jira"));
  assert.ok(JSON.stringify(DETECTIVE_QUESTIONS).includes("風倍清噴霧除菌"));
  assert.doesNotMatch(JSON.stringify(DETECTIVE_QUESTIONS), /[A-Z]{2}\d{8}/, "full invoice numbers stay hidden");
});

test("detective API enforces capacity, identity, and four-player start", async () => {
  await withServer(async (base) => {
    const created = await post(`${base}/api/detective/rooms`);
    const { code } = created.json.room;
    const { hostKey } = created.json;

    const early = await post(`${base}/api/detective/rooms/${code}/start`, { hostKey });
    assert.equal(early.response.status, 409);
    assert.equal(early.json.error, "need_four_detectives");

    const shortName = await post(`${base}/api/detective/rooms/${code}/join`, { nickname: "A" });
    assert.equal(shortName.response.status, 400);

    const first = await post(`${base}/api/detective/rooms/${code}/join`, { nickname: "同名偵探" });
    assert.equal(first.response.status, 201);
    const duplicate = await post(`${base}/api/detective/rooms/${code}/join`, { nickname: "同名偵探" });
    assert.equal(duplicate.response.status, 409);
  });
});

test("detective prototype exposes responsive host and player surfaces", async () => {
  const publicUrl = new URL("../public/", import.meta.url);
  const [html, css, js] = await Promise.all([
    readFile(new URL("detective.html", publicUrl), "utf8"),
    readFile(new URL("detective.css", publicUrl), "utf8"),
    readFile(new URL("detective.js", publicUrl), "utf8"),
  ]);

  assert.match(html, /KAHOOT × DETECTIVE × INVOICE/);
  assert.match(html, /誰是犯人/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--brand: #01afa2/);
  assert.match(css, /ISSUE #0821 — COMIC INVESTIGATION EDITION/);
  assert.match(css, /\.evidence-layout \{ grid-template-columns: 1fr; \}/);
  assert.match(js, /function renderCaseProgress/);
  assert.match(js, /function humanObservation/);
  assert.match(js, /HUMANITY \/ 人性觀察/);
  assert.match(js, /function portraitMarkup/);
  assert.match(js, /receipt-blaster/);
  assert.match(js, /needs-pyramid/);
  assert.match(js, /search\.get\("test"\) === "1"/);
  assert.match(js, /動畫已關閉/);
  assert.match(js, /function demoCue/);
  assert.match(js, /五分鐘簡報/);
  assert.match(css, /\.suspect-frame/);
  assert.match(css, /@keyframes receipt-focus/);
  assert.match(css, /@keyframes receipt-shot/);
  assert.match(css, /html\[data-test-mode="true"\]/);
  assert.match(css, /\.demo-cue/);
  assert.match(js, /function updateQuestionClock/);
  for (const feature of ["renderLobby", "renderQuestion", "renderReveal", "renderLeaderboard", "renderResults"]) {
    assert.match(js, new RegExp(`function ${feature}`));
  }
  for (const action of ["create-case", "fill-demo", "start-case", "share-result"]) {
    assert.match(js, new RegExp(action));
  }
});
