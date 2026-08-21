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

test("hosted source contains the three-act game and no-animation test mode", async () => {
  const [html, css, js, game] = await Promise.all([
    readFile(new URL("../public/detective.html", import.meta.url), "utf8"),
    readFile(new URL("../public/detective.css", import.meta.url), "utf8"),
    readFile(new URL("../public/detective.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/game.ts", import.meta.url), "utf8"),
  ]);
  assert.match(html, /KAHOOT × DETECTIVE × INVOICE/);
  assert.match(css, /data-test-mode="true"/);
  assert.match(js, /function demoCue/);
  assert.match(js, /hostedNoMotion/);
  assert.match(js, /五分鐘簡報/);
  assert.match(game, /cases\.json/);
  assert.match(game, /escapeScore/);
});

test("a full three-act case runs to results and never leaks owner/is_lie/answer to players", async () => {
  const workerRequest = await loadWorker();
  const { cases } = JSON.parse(await readFile(new URL("../lib/cases.json", import.meta.url), "utf8"));
  const caseData = cases[0];
  const owner = caseData.owner;
  const members = [...new Set(caseData.act2.flatMap((round) => round.members))];
  const identities = [owner, ...members.filter((name) => name !== owner)].slice(0, 4);

  const created = await workerRequest("/api/detective/rooms", post({}));
  assert.equal(created.status, 201);
  const { room: createdRoom, hostKey } = await created.json();
  const code = createdRoom.code;

  const players = [];
  for (const [index, identity] of identities.entries()) {
    const joined = await workerRequest(`/api/detective/rooms/${code}/join`, post({ nickname: `偵探${index + 1}號`, identity }));
    assert.equal(joined.status, 201);
    players.push({ ...(await joined.json()), identity });
  }

  const started = await workerRequest(`/api/detective/rooms/${code}/start`, post({ hostKey }));
  assert.equal(started.status, 200);
  const startedRoom = await started.json();
  assert.equal(startedRoom.stepCount, caseData.act1.length + caseData.act2.length + 4);

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
