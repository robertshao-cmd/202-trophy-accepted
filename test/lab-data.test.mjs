import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataUrl = new URL("../public/data/lab-data.json", import.meta.url);

test("nine experiments use one coherent, reproducible demo dataset", async () => {
  const data = JSON.parse(await readFile(dataUrl, "utf8"));
  assert.equal(data.meta.dataset, "DEMO-01");
  assert.equal(data.demos.length, 9);
  assert.deepEqual(data.demos.map((demo) => demo.rank), [1,2,3,4,6,7,8,9,10]);
  assert.equal(new Set(data.demos.map((demo) => demo.id)).size, 9);
  assert.deepEqual(data.demos.find((demo) => demo.id === "detective").sourceRanks, [4,5]);
  assert.ok(data.invoices.length >= 10);
  assert.ok(data.invoices.every((invoice) => invoice.items.length > 0));
  assert.equal(data.detectiveRounds.length, 3);
  assert.equal(data.truthRounds.length, 5);
  assert.equal(data.trends.length, 2);
  assert.equal(data.recipes.length, 3);

  for (const demo of data.demos) {
    assert.ok(demo.problem);
    assert.ok(demo.assumption);
    assert.ok(demo.dependency);
    assert.ok(demo.status);
    assert.ok(Number.isFinite(demo.rice));
    assert.ok(demo.design.pattern);
    assert.ok(demo.design.referenceUrl.startsWith("https://"));
    assert.ok(demo.design.principle);
    assert.ok(demo.nextStage.successMetric);
    assert.ok(demo.nextStage.gate);
    assert.ok(demo.nextStage.slice);
  }
  assert.equal(new Set(data.demos.map((demo) => demo.design.pattern)).size, 9);
  for (const round of [...data.detectiveRounds, ...data.truthRounds]) {
    assert.ok(round.answer >= 0);
    assert.ok(round.answer < (round.options ?? round.statements).length);
    assert.ok(round.why || round.evidence);
  }
});

test("demo data is labeled fictional and excludes real user identifiers", async () => {
  const data = JSON.parse(await readFile(dataUrl, "utf8"));
  const serialized = JSON.stringify(data);
  assert.match(data.meta.notice, /虛構/);
  for (const forbidden of ["carrierBarcode", "memberId", "email", "phone", "invoiceNumber"]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false);
  }
});
