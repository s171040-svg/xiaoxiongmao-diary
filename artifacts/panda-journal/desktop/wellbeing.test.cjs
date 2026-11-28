"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createWellbeing } = require("./wellbeing.cjs");
const fs = require("node:fs");
const path = require("node:path");
const sandbox = { module: { exports: {} } };
require("node:vm").runInNewContext(fs.readFileSync(path.join(__dirname, "wellbeing-animation.js"), "utf8"), sandbox);
const animation = sandbox.module.exports;
const start = new Date(2026, 10, 25, 10, 0).getTime();
const sample = (clock, seconds, idleSeconds, available = true) =>
  clock.sample({ now: start + seconds * 1000, idleSeconds, available });

test("five full minutes after a reminder, only celebrate on return and once", () => {
  const clock = createWellbeing();
  clock.remind("rest", start);
  assert.equal(sample(clock, 299, 299), null);
  assert.equal(sample(clock, 300, 300), null);
  assert.equal(sample(clock, 301, 0).kind, "celebrate");
  assert.equal(sample(clock, 302, 0), null);
  assert.equal(sample(clock, 1000, 600), null);
  assert.equal(sample(clock, 1001, 0), null);
});
test("short or interrupted breaks and idle time before reminder do not qualify", () => {
  const clock = createWellbeing();
  clock.remind("rest", start);
  assert.equal(sample(clock, 1, 900), null);
  assert.equal(sample(clock, 120, 120), null);
  assert.equal(sample(clock, 121, 0), null);
  assert.equal(sample(clock, 400, 279), null);
  assert.equal(sample(clock, 401, 0), null);
});
test("do not celebrate without a reminder; defer return while pet unavailable", () => {
  const clock = createWellbeing();
  assert.equal(sample(clock, 600, 600), null);
  assert.equal(sample(clock, 601, 0), null);
  clock.remind("rest", start + 602000);
  assert.equal(sample(clock, 902, 300), null);
  assert.equal(sample(clock, 903, 0, false), null);
  assert.equal(sample(clock, 904, 0, true).kind, "celebrate");
});
test("local lunch reminders at 12:30, 12:50, 13:10, persisted and deduplicated", () => {
  let saved = [];
  const clock = createWellbeing([], values => { saved = values; });
  for (const [hour, minute] of [[12, 30], [12, 50], [13, 10]]) {
    const now = new Date(2026, 10, 25, hour, minute).getTime();
    assert.equal(clock.sample({ now, idleSeconds: 0 }).kind, "meal");
    assert.equal(clock.sample({ now: now + 1000, idleSeconds: 0 }), null);
  }
  const reopened = createWellbeing(saved);
  assert.equal(reopened.sample({ now: new Date(2026, 10, 25, 13, 10, 20).getTime(), idleSeconds: 0 }), null);
  assert.equal(reopened.sample({ now: new Date(2026, 10, 26, 12, 30).getTime(), idleSeconds: 0 }).kind, "meal");
});
test("no overdue lunch burst, no hidden-window reminder and no invalid samples", () => {
  const clock = createWellbeing();
  const now = new Date(2026, 10, 25, 12, 30).getTime();
  assert.equal(clock.sample({ now, idleSeconds: 0, available: false }), null);
  assert.equal(clock.sample({ now, idleSeconds: 120 }), null);
  assert.equal(clock.sample({ now: now + 60000, idleSeconds: 0 }), null);
  assert.equal(clock.sample({ now: NaN, idleSeconds: 0 }), null);
  assert.equal(clock.sample({ now, idleSeconds: -1 }), null);
});
test("new lunch reminder does not erase an already completed break", () => {
  const clock = createWellbeing();
  clock.remind("rest", start);
  sample(clock, 300, 300);
  clock.remind("meal", start + 301000);
  assert.equal(sample(clock, 302, 0).kind, "celebrate");
});
test("celebration has real entry/exit frames and packaged assets throughout", () => {
  const sources = new Set();
  for (let elapsed = 0; elapsed < animation.duration; elapsed += 100) {
    const source = animation.sourceAt(elapsed);
    assert.ok(source);
    sources.add(source);
    assert.ok(fs.existsSync(path.join(__dirname, source)), source);
  }
  assert.ok(sources.size >= 18);
  assert.equal(animation.sourceAt(-1), null);
  assert.equal(animation.sourceAt(animation.duration), null);
  assert.ok(fs.existsSync(path.join(__dirname, animation.sourceAt(0, true))));
  assert.ok(animation.sourceAt(animation.duration - 1).endsWith("enter-0.png"));
});
