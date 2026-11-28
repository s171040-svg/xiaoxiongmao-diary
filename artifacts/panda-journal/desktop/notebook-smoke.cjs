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
    w.webContents.getURL().includes("schedule-chat.html") && w.isVisible()));
  const page = application.windows().find(w => w.url().includes("schedule-chat.html"));
  await page.waitForLoadState("load");
  return page;
}
async function openManager(chat) {
  await chat.getByTestId("button-open-schedule-list").click();
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
  let chat = await openByDoubleClick(pet);
  const errors = [], remote = [];
  chat.on("pageerror", error => errors.push(error.message));
  pet.on("pageerror", error => errors.push(error.message));
  chat.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  assert.equal(await chat.getByTestId("button-send-schedule").isDisabled(), true);
  await chat.getByTestId("input-schedule-message").fill("明天三点开会");
  await chat.waitForFunction(() => document.querySelector("#parse-card").dataset.state === "invalid");
  assert.match(await chat.getByTestId("text-parse-detail").textContent(), /上午还是下午/);
  assert.equal(await chat.getByTestId("button-send-schedule").isDisabled(), true);
  await chat.getByTestId("input-schedule-message").fill("明天下午六点和同事开会");
  await chat.waitForFunction(() => document.querySelector("#parse-card").dataset.state === "valid");
  assert.match(await chat.getByTestId("text-parse-title").textContent(), /和同事开会/);
  assert.match(await chat.getByTestId("text-parse-detail").textContent(), /下午5:00/);
  assert.equal(await chat.getByTestId("button-send-schedule").isDisabled(), false);
  await chat.getByTestId("input-schedule-message").fill("明天三点开会");
  assert.equal(await chat.getByTestId("button-send-schedule").isDisabled(), true,
    "editing a valid draft disables send before the next parse completes");
  await chat.waitForFunction(() => document.querySelector("#parse-card").dataset.state === "invalid");
  await chat.getByTestId("input-schedule-message").fill("明天下午六点和同事开会");
  await chat.waitForFunction(() => document.querySelector("#parse-card").dataset.state === "valid");
  await chat.screenshot({ path: path.join(output, "schedule-chat.png") });
  await chat.getByTestId("button-send-schedule").click();
  await chat.waitForFunction(() => document.querySelector("#parse-title").textContent === "记好啦！");
  chat.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });

  let page = await openManager(chat);
  const managerErrors = [];
  page.on("pageerror", error => managerErrors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });

  let data = await page.evaluate(() => window.pandaNotebook.list());
  assert.equal(data.notes.length, 1);
  const noteId = data.notes[0].id;
  const reminderId = data.notes[0].reminders[0].id;
  assert.equal(data.notes[0].reminders[0].title, "和同事开会");
  assert.equal(data.notes[0].reminders[0].eventAt, new Date(2026, 10, 26, 18).getTime());
  assert.equal(data.notes[0].reminders[0].remindAt, new Date(2026, 10, 26, 17).getTime());
  assert.equal(data.notes[0].reminders[0].status, "pending");

  await page.getByTestId(`button-event-${noteId}-${reminderId}`).click();
  await setSchedule(page, "和同事开会", "2026-11-26", "pm", 6, 0);
  await page.screenshot({ path: path.join(output, "local-schedule.png") });

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
  assert.deepEqual([...errors, ...managerErrors], []);
  assert.deepEqual(remote, []);
  await application.close();
  application = null;
  console.log("PASS: double-click opens compact local schedule chat; natural-language validation and send; exact one-hour reminder; manager edit/cancel/re-enable/delete; rejects too-soon events; no network.");
}
run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await application?.close(); fs.rmSync(profile, { recursive: true, force: true }); });
