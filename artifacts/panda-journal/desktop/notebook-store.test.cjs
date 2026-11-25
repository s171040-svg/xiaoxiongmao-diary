"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNotebookStore, preview, LEAD } = require("./notebook-store.cjs");
const now = new Date(2026, 10, 25, 10, 0).getTime();
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-notes-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createNotebookStore(directory) };
}
function reminder(eventAt = at(25, 18)) {
  return { title: "开会", eventAt, remindAt: eventAt - LEAD };
}
test("18:00 meeting without a date means today 17:30; tomorrow is explicit", () => {
  const [candidate] = preview("18:00开会", now).candidates;
  assert.equal(candidate.eventAt, at(25, 18));
  assert.equal(candidate.remindAt, at(25, 17, 30));
  assert.equal(candidate.issue, null);
  const [tomorrow] = preview("明天下午6点开会", now).candidates;
  assert.equal(tomorrow.eventAt, at(26, 18));
  assert.equal(tomorrow.remindAt, at(26, 17, 30));
});
test("explicit dates, year/month rollover and multiple events use local time", () => {
  assert.equal(preview("2026-11-26 18：00开会", now).candidates[0].eventAt, at(26, 18));
  assert.equal(preview("11月26日下午6点半开会", now).candidates[0].eventAt, at(26, 18, 30));
  const newYear = preview("明天上午9点上班", new Date(2026, 11, 31, 20).getTime()).candidates[0];
  assert.equal(newYear.eventAt, new Date(2027, 0, 1, 9).getTime());
  assert.equal(preview("今天18:00开会；明天15:30提交", now).candidates.length, 2);
  assert.equal(preview("今天18:00-19:00开会", now).candidates.length, 1);
});
test("past, invalid, cancelled and ambiguous dates require confirmation", () => {
  for (const text of ["昨天18:00开会", "09:00开会", "2026-02-30 18:00开会", "今天25:00开会",
    "今天18:90开会", "下周一18:00开会", "下个月18:00开会", "每天18:00开会", "取消18:00开会",
    "18:00改到19:00开会"]) {
    const candidates = preview(text, now).candidates;
    assert.ok(candidates.length, text);
    for (const candidate of candidates) {
      assert.equal(candidate.eventAt, null, text);
      assert.ok(candidate.issue, text);
    }
  }
  assert.equal(preview("今天挺累的，先记下来", now).candidates.length, 0);
});
test("less than thirty minutes uses an explicit immediate-reminder warning", () => {
  const candidate = preview("10:15开会", now).candidates[0];
  assert.equal(candidate.eventAt, at(25, 10, 15));
  assert.equal(candidate.remindAt, now);
  assert.match(candidate.issue, /立即提醒/);
});
test("notes persist locally across reopen; edit/cancel/delete affect scheduler", t => {
  const { directory, store } = fixture(t);
  const saved = store.save({ text: "18:00开会", reminders: [reminder()] }, now);
  const reopened = createNotebookStore(directory);
  assert.deepEqual(reopened.list().notes[0], saved);
  assert.deepEqual(reopened.due(at(25, 17, 29)), []);
  const cancelled = reopened.save({ id: saved.id, text: "会议取消", reminders: saved.reminders.map(r => ({ ...r, status: "cancelled" })) }, now + 1000);
  assert.equal(cancelled.reminders[0].status, "cancelled");
  assert.deepEqual(reopened.due(at(25, 19)), []);
  reopened.remove(saved.id);
  assert.deepEqual(createNotebookStore(directory).list().notes, []);
  assert.ok(fs.existsSync(path.join(directory, "notebook-v1.json.bak")));
});
test("due reminders deliver exactly once even after reopening or stale editor saves", t => {
  const { directory, store } = fixture(t);
  const saved = store.save({ text: "开会", reminders: [reminder()] }, now);
  assert.equal(store.due(at(25, 17, 30)).length, 1);
  assert.equal(store.due(at(25, 17, 30)).length, 0);
  store.save({ id: saved.id, text: "修改日记，但不改变提醒", reminders: saved.reminders }, at(25, 17, 31));
  const reopened = createNotebookStore(directory);
  assert.equal(reopened.list().notes[0].reminders[0].status, "sent");
  assert.equal(reopened.due(at(25, 17, 32)).length, 0);
});
test("sleep or app restart sends overdue entries once and labels them late", t => {
  const { directory, store } = fixture(t);
  store.save({ text: "开会", reminders: [reminder()] }, now);
  const reopened = createNotebookStore(directory);
  const due = reopened.due(at(26, 10));
  assert.equal(due.length, 1); assert.equal(due[0].overdue, true);
  assert.equal(createNotebookStore(directory).due(at(26, 10)).length, 0);
});
test("reject invalid input without overwriting saved notes; plain text is preserved", t => {
  const { directory, store } = fixture(t);
  const saved = store.save({ text: "<script>not executable</script>", reminders: [] }, now);
  assert.throws(() => store.save({ text: "", reminders: [] }, now));
  assert.throws(() => store.save({ text: "x".repeat(20001), reminders: [] }, now));
  assert.throws(() => store.save({ text: "test", reminders: [{ ...reminder(), remindAt: at(25, 19) }] }, now));
  assert.throws(() => store.save({ text: "test", reminders: [{ ...reminder(), eventAt: now }] }, now));
  assert.equal(createNotebookStore(directory).list().notes[0].text, saved.text);
  const file = path.join(directory, "notebook-v1.json");
  fs.writeFileSync(file, "{broken");
  const broken = createNotebookStore(directory);
  assert.throws(() => broken.list(), /保护原记录/);
  assert.throws(() => broken.save({ text: "overwrite", reminders: [] }, now), /保护原记录/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});
test("new reminder dependencies and private local page are included in packaging", () => {
  const staging = fs.readFileSync(path.join(__dirname, "package-win.cjs"), "utf8");
  for (const name of ["notebook-store.cjs", "notebook.html", "notebook.css", "notebook.js"]) {
    assert.ok(staging.includes(`"${name}"`), name);
    assert.ok(fs.existsSync(path.join(__dirname, name)), name);
  }
  assert.match(fs.readFileSync(path.join(__dirname, "notebook.html"), "utf8"), /connect-src 'none'/);
});
