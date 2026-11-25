"use strict";
// An isolated native run; never touches a real user's notes or sends OS notifications.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { _electron } = require("playwright");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-notebook-smoke-"));
const output = path.resolve(__dirname, "../../../generated-artifacts/notebook");
const executable = process.env.PATH.split(path.delimiter).filter(dir => !dir.includes("node_modules"))
  .map(dir => path.join(dir, "electron")).find(file => fs.existsSync(file)) || require("electron");
let application;
async function launch() {
  application = await _electron.launch({
    executablePath: executable,
    args: ["--no-sandbox", path.join(__dirname, "main.cjs"), "--offline-desktop-trial"],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: process.env.DISPLAY,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
      XDG_DATA_DIRS: process.env.XDG_DATA_DIRS, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      PANDA_PROFILE_DIR: profile, REPL_ID: "isolated-notebook-preview",
    },
  });
  await application.evaluate(({ Notification, powerMonitor, dialog }) => {
    global.__noteNow = new Date(2026, 10, 25, 10).getTime();
    Date.now = () => global.__noteNow;
    Notification.isSupported = () => false;
    powerMonitor.getSystemIdleState = () => "active";
    global.__noteDialogResult = 0;
    global.__noteDialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      global.__noteDialogs.push(options.title);
      return { response: global.__noteDialogResult };
    };
    dialog.showMessageBoxSync = () => 1; // Always allow isolated test cleanup.
  });
  const pet = await application.firstWindow();
  await pet.waitForLoadState("load");
  await pet.waitForFunction(() => !document.querySelector(".pet-presence").hidden);
  return pet;
}
async function waitMain(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await application.evaluate(fn)) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error("Native state did not settle");
}
async function openByDoubleClick(pet) {
  await pet.locator("#panda").dblclick();
  await waitMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w =>
    w.webContents.getURL().includes("notebook.html") && w.isVisible()));
  const page = application.windows().find(w => w.url().includes("notebook.html"));
  await page.waitForLoadState("load");
  await page.evaluate(() => { Date.now = () => new Date(2026, 10, 25, 10).getTime(); });
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "stare");
  return page;
}
async function saved(page) {
  await page.getByTestId("button-save-note").click();
  await page.waitForFunction(() => document.querySelector("#save-state").textContent.startsWith("记好啦"));
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  let pet = await launch();
  let page = await openByDoubleClick(pet);
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  pet.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  // Save immediately, before the text input's debounce has elapsed.
  await page.getByTestId("input-note-text").fill("今天18:00开会");
  await saved(page);
  let notes = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(notes.notes.length, 1);
  const firstId = notes.notes[0].id;
  const firstReminder = notes.notes[0].reminders[0];
  assert.equal(new Date(firstReminder.remindAt).getHours(), 17);
  assert.equal(new Date(firstReminder.remindAt).getMinutes(), 30);
  assert.equal(firstReminder.status, "pending");
  await page.screenshot({ path: path.join(output, "local-notebook.png") });
  await page.getByTestId("button-close-window").click();
  await waitMain(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("notebook.html")).isVisible());
  assert.equal((await pet.evaluate(() => window.pandaDesktop.desktopPetState())).notebookOpen, false);
  page = await openByDoubleClick(pet);
  assert.equal(await page.getByTestId("input-note-text").inputValue(), "今天18:00开会");
  // A scheduler refresh while the editor is dirty must not replace the draft.
  await page.getByTestId("input-note-text").fill("今天18:00开会\n记得带电脑");
  await application.evaluate(() => { global.__noteNow = new Date(2026, 10, 25, 17, 30).getTime(); });
  await pet.waitForFunction(() => document.querySelector("#speech-copy").textContent.includes("开会"));
  assert.match(await page.getByTestId("input-note-text").inputValue(), /带电脑/);
  await saved(page);
  notes = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(notes.notes[0].reminders[0].status, "sent");
  assert.equal(notes.notes[0].reminders[0].id, firstReminder.id);
  // Second record: cancellation and confirmed deletion really persist.
  await page.getByTestId("button-new-note").click();
  await page.getByTestId("input-note-text").fill("明天18:00复盘");
  await saved(page);
  notes = await page.evaluate(() => window.pandaNotebook.list());
  const second = notes.notes.find(note => note.id !== firstId);
  assert.equal(second.reminders.length, 1);
  await page.locator('[data-testid^="checkbox-reminder-enabled-"]').first().uncheck();
  await saved(page);
  notes = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(notes.notes.find(note => note.id === second.id).reminders[0].status, "cancelled");
  await page.getByTestId("button-delete-note").click();
  await page.getByTestId("button-confirm-ok").click();
  await page.waitForFunction(() => document.querySelector("#note-count").textContent === "1");
  await page.getByTestId(`button-note-${firstId}`).click();
  // Closing cannot silently throw away a draft; both native choices are exercised.
  await page.getByTestId("input-note-text").fill("未保存的草稿要留着");
  await page.getByTestId("button-close-window").click();
  await waitMain(() => global.__noteDialogs.length > 0);
  assert.equal(await page.isVisible("body"), true);
  assert.equal(await page.getByTestId("input-note-text").inputValue(), "未保存的草稿要留着");
  await application.evaluate(() => { global.__noteDialogResult = 1; });
  await page.getByTestId("button-close-window").click();
  await waitMain(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("notebook.html")).isVisible());
  page = await openByDoubleClick(pet);
  assert.equal(await page.getByTestId("input-note-text").inputValue(), "未保存的草稿要留着");
  await page.getByTestId("button-discard-changes").click();
  await page.getByTestId("button-confirm-ok").click();
  await page.waitForFunction(() => document.querySelector("#note-text").value.includes("带电脑"));
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await application.close(); application = null;
  pet = await launch();
  page = await openByDoubleClick(pet);
  await page.getByTestId(`button-note-${firstId}`).click();
  assert.match(await page.getByTestId("input-note-text").inputValue(), /带电脑/);
  notes = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(notes.notes.length, 1);
  assert.equal(notes.notes[0].reminders[0].status, "sent");
  await page.setViewportSize({ width: 480, height: 600 });
  await page.screenshot({ path: path.join(output, "local-notebook-narrow.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log("PASS: double-click/sit, immediate save/time recognition, local persistence, due reminder, stale edit, cancel/delete, unsaved draft protection, restart, narrow layout; no network or renderer errors.");
}
run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await application?.close(); fs.rmSync(profile, { recursive: true, force: true }); });
