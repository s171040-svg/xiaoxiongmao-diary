"use strict";
// Isolated native smoke; uses a temporary profile and never touches real notes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { _electron } = require("playwright");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-schedule-smoke-"));
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
    dialog.showMessageBoxSync = () => 1;
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
  return page;
}
async function save(page) {
  await page.getByTestId("button-save-reminder").click();
  await page.waitForFunction(() => document.querySelector("#save-state").textContent.includes("保存在这台电脑"));
}
async function setSchedule(page, title, date, period, hour, minute) {
  await page.getByTestId("input-event-title").fill(title);
  await page.getByTestId("input-event-date").fill(date);
  await page.getByTestId("select-event-period").selectOption(period);
  await page.getByTestId("select-event-hour").selectOption(String(hour));
  await page.getByTestId("select-event-minute").selectOption(String(minute).padStart(2, "0"));
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  let pet = await launch();
  let page = await openByDoubleClick(pet);
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  pet.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });

  await setSchedule(page, "和同事开会", "2026-11-26", "pm", 6, 0);
  assert.match(await page.getByTestId("text-reminder-preview").textContent(), /11月26日 下午5:00/);
  await page.screenshot({ path: path.join(output, "local-schedule.png") });
  await save(page);
  let data = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(data.notes.length, 1);
  const noteId = data.notes[0].id;
  const reminderId = data.notes[0].reminders[0].id;
  assert.equal(new Date(data.notes[0].reminders[0].eventAt).getHours(), 18);
  assert.equal(new Date(data.notes[0].reminders[0].remindAt).getHours(), 17);
  assert.equal(data.notes[0].reminders[0].status, "pending");

  // Updating the event time moves the reminder to exactly one hour earlier.
  await setSchedule(page, "和同事开会", "2026-11-26", "pm", 7, 0);
  await save(page);
  data = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(new Date(data.notes[0].reminders[0].eventAt).getHours(), 19);
  assert.equal(new Date(data.notes[0].reminders[0].remindAt).getHours(), 18);
  assert.equal(data.notes[0].reminders[0].id, reminderId);

  await page.getByTestId("button-cancel-reminder").click();
  await page.getByTestId("button-confirm-ok").click();
  await page.waitForFunction(() => document.querySelector("#page-label").textContent === "已取消的日程");
  data = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(data.notes[0].reminders[0].status, "cancelled");

  // A cancelled future item can be re-enabled, then deleted on its own.
  await page.getByTestId("button-save-reminder").click();
  await page.waitForFunction(() => document.querySelector("#save-state").textContent.includes("保存在这台电脑"));
  data = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(data.notes[0].reminders[0].status, "pending");
  await page.getByTestId("button-delete-reminder").click();
  await page.getByTestId("button-confirm-ok").click();
  await page.waitForFunction(() => document.querySelector("#event-count").textContent === "0");
  assert.deepEqual((await page.evaluate(() => window.pandaNotebook.list())).notes, []);

  // Less than one hour is rejected and does not write an event.
  await setSchedule(page, "马上开会", "2026-11-25", "am", 10, 30);
  await page.getByTestId("button-save-reminder").click();
  await page.waitForFunction(() => !document.querySelector("#error").hidden);
  assert.match(await page.getByTestId("status-error").textContent(), /至少要在一小时后/);
  assert.deepEqual((await page.evaluate(() => window.pandaNotebook.list())).notes, []);

  await page.setViewportSize({ width: 480, height: 600 });
  await page.screenshot({ path: path.join(output, "local-schedule-narrow.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await application.close();
  application = null;
  console.log("PASS: double-click opens local schedule; explicit date/AM-PM/time; exact one-hour preview; create/edit/cancel/re-enable/delete; rejects events under one hour; responsive, private, no renderer errors or network.");
}
run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await application?.close(); fs.rmSync(profile, { recursive: true, force: true }); });
