import assert from "node:assert/strict";
import test from "node:test";

import { createAppServer } from "../server.mjs";

test("static server serves the app and read-only health endpoint", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/api/health`).then((response) => response.json());
    assert.deepEqual(health, { ok: true, service: "invoice-idea-lab", storage: "browser-local-only" });
    const html = await fetch(base).then((response) => response.text());
    assert.match(html, /發票腦洞實驗室/);
    const data = await fetch(`${base}/data/lab-data.json`).then((response) => response.json());
    assert.equal(data.demos.length, 9);
    const post = await fetch(`${base}/api/health`, { method: "POST" });
    assert.equal(post.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
