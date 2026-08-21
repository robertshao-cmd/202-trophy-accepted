import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicUrl = new URL("../public/", import.meta.url);

test("site exposes gallery, brief, dashboard and all nine interactive products", async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("styles.css", publicUrl), "utf8"),
    readFile(new URL("app.js", publicUrl), "utf8"),
  ]);

  assert.match(html, /發票腦洞實驗室/);
  assert.match(app, /function renderGallery/);
  assert.match(app, /function renderBrief/);
  assert.match(app, /function renderDashboard/);
  assert.match(app, /function renderNextStage/);
  for (const name of ["Recall","Price","Stock","Detective","Truth","Taste","Trend","Rare","Warranty","Fridge"]) {
    assert.match(app, new RegExp(`function render${name}`));
  }
  for (const event of ["demo_opened","demo_started","first_value_seen","evidence_expanded","demo_completed","feedback_submitted","demo_restarted","share_clicked"]) {
    assert.match(app, new RegExp(event));
  }
  assert.match(app, /localStorage/);
  assert.match(app, /sessionStorage/);
  assert.match(app, /exportEvidence/);
  assert.match(css, /#01afa2/i);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /prefers-reduced-motion/);
  for (const id of ["recall","price","stock","detective","taste","trend","rare","warranty","fridge"]) {
    assert.match(css, new RegExp(`\\.theme-${id}`));
    assert.match(css, new RegExp(`\\.design-brief-${id}`));
  }
  assert.match(app, /id === "truth"/);
  assert.match(app, /data-merchant-answer/);
  assert.match(app, /data-truth-answer/);
});

test("feedback captures all required quantitative and qualitative fields", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  for (const field of ["understanding","helpfulness","trust","willingness","notification","dataPermission","valuable","untrusted","note"]) {
    assert.match(app, new RegExp(field));
  }
  assert.match(app, /feedback\.length >= 5/);
  assert.match(app, /completionRate >= 80/);
  assert.match(app, /result\.trust >= 3\.5/);
});
