import assert from "node:assert/strict";

const baseUrl = (process.env.SHARED_BASE_URL ?? "http://localhost:4176").replace(/\/$/, "");

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function post(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const health = await json("/api/health");
assert.equal(health.storage, "cloudflare-d1-shared");

const created = await json("/api/detective/rooms", post({}));
const { code } = created.room;
const { hostKey } = created;

const joins = await Promise.all(Array.from({ length: 36 }, async (_, index) => {
  const nickname = `外網偵探${String(index + 1).padStart(2, "0")}`;
  return json(`/api/detective/rooms/${code}/join`, post({ nickname }));
}));

const lobby = await json(`/api/detective/rooms/${code}?host=${encodeURIComponent(hostKey)}`);
assert.equal(lobby.players.length, 36, "all concurrent players should remain in the shared room");
assert.equal(new Set(lobby.players.map((player) => player.nickname)).size, 36);

await json(`/api/detective/rooms/${code}/start`, post({ hostKey }));
const quiz = await json(`/api/detective/rooms/${code}/advance`, post({ hostKey }));
assert.equal(quiz.question.kind, "quiz");
const choice = quiz.question.choices[0].id;

await Promise.all(joins.map(({ playerKey }) => (
  json(`/api/detective/rooms/${code}/answer`, post({ playerKey, choice }))
)));

const answered = await json(`/api/detective/rooms/${code}?host=${encodeURIComponent(hostKey)}`);
assert.equal(answered.answeredCount, 36, "concurrent answers should not overwrite each other");

process.stdout.write(`${JSON.stringify({ ok: true, baseUrl, code, hostKey, players: lobby.players.length, answers: answered.answeredCount })}\n`);
