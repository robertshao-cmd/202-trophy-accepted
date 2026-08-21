import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  return async (path, init) => worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
}

function post(body) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

test("hosted worker exposes health and redirects home to the detective", async () => {
  const workerRequest = await loadWorker();
  const health = await workerRequest("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "invoice-detective", storage: "edge-demo-memory" });

  const home = await workerRequest("/");
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/detective.html");
});

test("hosted source contains Rebecca's complete intro, the full PR #2 game, Jira portraits, and the lead detective", async () => {
  const [html, css, js, introCss, introJs, game, healthRoute, hostingConfig, migration] = await Promise.all([
    readFile(new URL("../public/detective.html", import.meta.url), "utf8"),
    readFile(new URL("../public/detective.css", import.meta.url), "utf8"),
    readFile(new URL("../public/detective.js", import.meta.url), "utf8"),
    readFile(new URL("../public/intro.css", import.meta.url), "utf8"),
    readFile(new URL("../public/intro.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/game.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_violet_eternity.sql", import.meta.url), "utf8"),
  ]);
  assert.match(html, /KAHOOT × DETECTIVE × INVOICE/);
  assert.match(html, /<strong>KID<\/strong>/);
  assert.match(html, /\/kid-logo\.png/);
  assert.match(html, /誰是犯人/);
  assert.match(html, /id="stageIntro"/);
  assert.match(html, /INTRO DESIGN · REBECCA/);
  assert.match(css, /data-test-mode="true"/);
  assert.match(css, /home-detective/);
  assert.match(introCss, /Rebecca GitLab 完整攝影版/);
  assert.match(introJs, /3459994786776475ec92697b565be79537f8cd9b/);
  assert.match(introJs, /scene6-lineup\.jpg/);
  assert.match(introJs, /assistant-cut\.png/);
  assert.match(js, /search\.get\("intro"\) !== "0"/);
  assert.match(js, /function demoCue/);
  assert.match(js, /invoice-intro-ended/);
  assert.match(js, /home-detective\.png/);
  assert.match(js, /Jira 頭像/);
  assert.match(js, /五分鐘簡報/);
  assert.doesNotMatch(js, />無動畫測試</);
  assert.match(game, /cases\.json/);
  assert.match(game, /escapeScore/);
  assert.match(game, /MAX_ROOM_WRITE_RETRIES = 64/);
  assert.match(game, /WHERE code = \? AND version = \?/);
  assert.match(game, /withSession\("first-primary"\)/);
  assert.match(healthRoute, /cloudflare-d1-shared/);
  assert.equal(JSON.parse(hostingConfig).d1, "DB");
  assert.match(migration, /CREATE TABLE `detective_rooms`/);
  for (const portrait of ["robert.png", "michelle.png", "rebecca.png", "xu-ruiyu.png", "he-pinru.png", "huang-junlin.png"]) {
    assert.match(game, new RegExp(`/avatars/${portrait.replace(".", "\\.")}`));
  }
  for (const asset of ["home-detective.png", "intro-assets/assistant-cut.png", "intro-assets/scene1-messy.jpg", "intro-assets/scene2-magnifier.jpg", "intro-assets/scene3-map.jpg", "intro-assets/scene4-interrogation.jpg", "intro-assets/scene5-wall.jpg", "intro-assets/scene6-lineup.jpg"]) {
    const bytes = await readFile(new URL(`../public/${asset}`, import.meta.url));
    assert.ok(bytes.byteLength > 100_000, `${asset} should be a high-resolution original asset`);
  }
  const kidLogo = await readFile(new URL("../public/kid-logo.png", import.meta.url));
  assert.ok(kidLogo.byteLength > 50_000, "KID should use the attached full-resolution logo");
});

test("a full three-act case runs to results and never leaks owner/is_lie/answer to players", async () => {
  const workerRequest = await loadWorker();
  const { cases } = JSON.parse(await readFile(new URL("../lib/cases.json", import.meta.url), "utf8"));
  const caseData = cases[0];
  const owner = caseData.owner;

  const created = await workerRequest("/api/detective/rooms", post({}));
  assert.equal(created.status, 201);
  const { room: createdRoom, hostKey } = await created.json();
  const code = createdRoom.code;
  // 身分名單以伺服器公開的卡司為準（案件經過瘦身，與原始 JSON 不同）
  const cast = createdRoom.identities.map((identity) => identity.name);
  assert.ok(cast.includes(owner), "trimmed cast must still contain the culprit");
  const identities = [owner, ...cast.filter((name) => name !== owner)].slice(0, 4);

  const players = [];
  for (const [index, identity] of identities.entries()) {
    const joined = await workerRequest(`/api/detective/rooms/${code}/join`, post({ nickname: `偵探${index + 1}號`, identity }));
    assert.equal(joined.status, 201);
    players.push({ ...(await joined.json()), identity });
  }

  const started = await workerRequest(`/api/detective/rooms/${code}/start`, post({ hostKey }));
  assert.equal(started.status, 200);
  const startedRoom = await started.json();
  assert.equal(startedRoom.stepCount, Math.min(caseData.act1.length, 3) + Math.min(caseData.act2.length, 3) + 7);

  const forbiddenDuringQuestions = ['"is_lie"', '"answer"', '"owner"', '"liar"', '"correctChoice"', '"verdict"', '"betHistory"'];
  let sawOnStageLock = false;
  let sawVerdict = null;
  let guard = 0;

  for (;;) {
    guard += 1;
    assert.ok(guard < 200, "game did not reach results");
    const stateResponse = await workerRequest(`/api/detective/rooms/${code}?player=${players[0].playerKey}`);
    const raw = await stateResponse.text();
    const room = JSON.parse(raw);
    if (room.phase === "results") {
      assert.equal(room.results.culprit, owner);
      assert.ok(Array.isArray(room.results.betHistory));
      assert.ok(room.results.aggregate.invoiceTotal > 0);
      break;
    }
    if (room.phase === "question") {
      for (const token of forbiddenDuringQuestions) {
        assert.ok(!raw.includes(token), `player payload leaked ${token} during ${room.question?.kind}`);
      }
      const choices = room.question?.choices ?? [];
      if (choices.length) {
        for (const player of players) {
          const choice = room.question.kind === "bet" ? owner : choices[0].id;
          const answered = await workerRequest(`/api/detective/rooms/${code}/answer`, post({ playerKey: player.playerKey, choice }));
          if (answered.status === 403) {
            const body = await answered.json();
            assert.equal(body.error, "on_stage_locked");
            sawOnStageLock = true;
          } else {
            assert.ok([200, 409].includes(answered.status), `answer failed with ${answered.status}`);
          }
        }
      }
    }
    if (room.phase === "reveal" && room.question?.kind === "bet" && room.question?.verdict) {
      sawVerdict = room.question.verdict;
    }
    const advanced = await workerRequest(`/api/detective/rooms/${code}/advance`, post({ hostKey }));
    assert.equal(advanced.status, 200);
  }

  assert.ok(sawOnStageLock, "expected at least one on-stage player to be locked out of voting");
  assert.ok(sawVerdict, "expected the final bet reveal to expose the verdict");
  assert.equal(sawVerdict.owner, owner);
});

test("vote reveal exposes the liar only after the round settles", async () => {
  const workerRequest = await loadWorker();
  const created = await workerRequest("/api/detective/rooms", post({}));
  const { room: createdRoom, hostKey } = await created.json();
  const code = createdRoom.code;
  for (let index = 0; index < 4; index += 1) {
    await workerRequest(`/api/detective/rooms/${code}/join`, post({ nickname: `路人偵探${index + 1}` }));
  }
  await workerRequest(`/api/detective/rooms/${code}/start`, post({ hostKey }));

  let guard = 0;
  for (;;) {
    guard += 1;
    assert.ok(guard < 100, "never reached a vote reveal");
    const room = await (await workerRequest(`/api/detective/rooms/${code}`)).json();
    if (room.phase === "question" && room.question?.kind === "vote") {
      assert.equal(room.question.correctChoice, undefined);
      await workerRequest(`/api/detective/rooms/${code}/advance`, post({ hostKey }));
      const revealed = await (await workerRequest(`/api/detective/rooms/${code}`)).json();
      assert.equal(revealed.phase, "reveal");
      assert.ok(revealed.question.correctChoice !== undefined);
      assert.ok(revealed.suspects.length >= 1);
      break;
    }
    await workerRequest(`/api/detective/rooms/${code}/advance`, post({ hostKey }));
  }
});
