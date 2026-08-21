import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function workerRequest(path, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, init), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("hosted worker exposes health and redirects home to the detective", async () => {
  const health = await workerRequest("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "invoice-detective", storage: "edge-demo-memory" });

  const home = await workerRequest("/");
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/detective.html");
});

test("hosted source contains the full game, no-animation test mode, and five-minute cues", async () => {
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
  assert.equal((game.match(/id:"q\d"/g) ?? []).length, 9);
});
