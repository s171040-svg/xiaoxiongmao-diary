"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNotebookStore, LEAD } = require("./notebook-store.cjs");

const now = new Date(2026, 10, 25, 10, 0).getTime();
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-schedule-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createNotebookStore(directory) };
}
function reminder(eventAt = at(25, 18)) {
  return { title: "和同事开会", eventAt, remindAt: eventAt - LEAD };
}

test("18:00 event has a fixed 17:00 reminder", t => {
  const { store } = fixture(t);
  assert.equal(LEAD, 60 * 60 * 1000);
  const saved = store.save({ text: "和同事开会", reminders: [reminder()] }, now);
  assert.equal(saved.reminders[0].eventAt, at(25, 18));
  assert.equal(saved.reminders[0].remindAt, at(25, 17));
  assert.equal(saved.reminders[0].status, "pending");
});

test("new pending events need at least one hour lead and exact reminder time", t => {
  const { store } = fixture(t);
  assert.throws(() => store.save({
    text: "马上开会", reminders: [reminder(at(25, 10, 59))],
  }, now), /至少要在一小时后/);
  assert.throws(() => store.save({
    text: "开会", reminders: [{ ...reminder(), remindAt: at(25, 17, 30) }],
  }, now), /固定为事项开始前一小时/);
});

test("pending reminders migrate to one hour without deleting old notes", t => {
  const { directory } = fixture(t);
  const file = path.join(directory, "notebook-v1.json");
  const oldSchedule = {
    id: "old-schedule", text: "开会", createdAt: now - 1000, updatedAt: now - 500,
    reminders: [{ id: "old-reminder", title: "开会", eventAt: at(26, 18),
      remindAt: at(26, 17, 30), status: "pending" }],
  };
  const legacyNote = {
    id: "legacy-note", text: "今天记得买牛奶", createdAt: now - 2000, updatedAt: now - 1500, reminders: [],
  };
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, notes: [oldSchedule, legacyNote] }));
  const store = createNotebookStore(directory);
  const notes = store.list().notes;
  assert.equal(notes.length, 2);
  assert.equal(notes.find(note => note.id === "old-schedule").reminders[0].remindAt, at(26, 17));
  assert.equal(notes.find(note => note.id === "old-schedule").reminders[0].id, "old-reminder");
  assert.equal(notes.find(note => note.id === "legacy-note").text, "今天记得买牛奶");
  assert.ok(fs.existsSync(`${file}.bak`));
});

test("unchanged pending reminder can still be edited or cancelled inside its one-hour window", t => {
  const { store } = fixture(t);
  const saved = store.save({ text: "开会", reminders: [reminder()] }, now);
  const cancelled = store.save({
    id: saved.id, text: "开会", reminders: [{ ...saved.reminders[0], status: "cancelled" }],
  }, at(25, 17, 30));
  assert.equal(cancelled.reminders[0].status, "cancelled");
  assert.throws(() => store.save({
    id: saved.id, text: "开会", reminders: [{ ...cancelled.reminders[0], status: "pending" }],
  }, at(25, 17, 30)), /至少要在一小时后/);
});

test("schedules persist, can be cancelled and deleted without touching other notes", t => {
  const { directory, store } = fixture(t);
  const saved = store.save({ text: "和同事开会", reminders: [reminder()] }, now);
  const reopened = createNotebookStore(directory);
  assert.deepEqual(reopened.list().notes[0], saved);
  assert.deepEqual(reopened.due(at(25, 16, 59)), []);
  assert.equal(reopened.due(at(25, 17)).length, 1);
  assert.deepEqual(reopened.due(at(25, 17)), []);
  reopened.remove(saved.id);
  assert.deepEqual(createNotebookStore(directory).list().notes, []);
  assert.ok(fs.existsSync(path.join(directory, "notebook-v1.json.bak")));
});

test("overdue reminder after app restart is delivered once", t => {
  const { directory, store } = fixture(t);
  store.save({ text: "开会", reminders: [reminder()] }, now);
  const reopened = createNotebookStore(directory);
  const due = reopened.due(at(26, 10));
  assert.equal(due.length, 1);
  assert.equal(due[0].overdue, true);
  assert.equal(createNotebookStore(directory).due(at(26, 10)).length, 0);
});

test("bad input and corrupted data never overwrite saved records", t => {
  const { directory, store } = fixture(t);
  const saved = store.save({ text: "<script>not executable</script>", reminders: [] }, now);
  assert.throws(() => store.save({ text: "", reminders: [] }, now));
  assert.throws(() => store.save({ text: "x".repeat(161), reminders: [] }, now));
  assert.throws(() => store.save({ text: "开会", reminders: [{ ...reminder(), eventAt: now }] }, now));
  assert.equal(createNotebookStore(directory).list().notes[0].text, saved.text);
  const file = path.join(directory, "notebook-v1.json");
  fs.writeFileSync(file, "{broken");
  const broken = createNotebookStore(directory);
  assert.throws(() => broken.list(), /保护原记录/);
  assert.throws(() => broken.save({ text: "overwrite", reminders: [] }, now), /保护原记录/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

test("packaged page is a local explicit schedule form, not a chat parser", () => {
  const staging = fs.readFileSync(path.join(__dirname, "package-win.cjs"), "utf8");
  for (const name of ["notebook-store.cjs", "notebook.html", "notebook.css", "notebook.js"]) {
    assert.ok(staging.includes(`"${name}"`), name);
    assert.ok(fs.existsSync(path.join(__dirname, name)), name);
  }
  const html = fs.readFileSync(path.join(__dirname, "notebook.html"), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /type="date"/);
  assert.match(html, /event-period/);
  assert.match(html, /event-hour/);
  assert.match(html, /event-minute/);
  assert.match(html, /event-title/);
  assert.doesNotMatch(html + fs.readFileSync(path.join(__dirname, "notebook.js"), "utf8"), /notebook:preview|classify|自然语言识别/);
});
