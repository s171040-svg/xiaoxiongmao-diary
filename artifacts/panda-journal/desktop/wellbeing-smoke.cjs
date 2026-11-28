"use strict";
// Focused native Electron check; uses no account, network or production save.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { _electron } = require("playwright");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-wellbeing-"));
const output = path.resolve(__dirname, "../../../generated-artifacts/wellbeing");
const executable = process.env.PATH.split(path.delimiter).filter(dir => !dir.includes("node_modules"))
  .map(dir => path.join(dir, "electron")).find(file => fs.existsSync(file)) || require("electron");
let application;
async function run() {
  fs.mkdirSync(output, { recursive: true });
  application = await _electron.launch({
    executablePath: executable,
    args: ["--no-sandbox", path.join(__dirname, "main.cjs"), "--offline-desktop-trial"],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: process.env.DISPLAY,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
      XDG_DATA_DIRS: process.env.XDG_DATA_DIRS, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      PANDA_PROFILE_DIR: profile, REPL_ID: "isolated-wellbeing-preview",
    },
  });
  const pet = await application.firstWindow();
  const errors = [];
  pet.on("pageerror", error => errors.push(error.message));
  await pet.waitForLoadState("load");
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  // Freeze just the main process's clock; the renderer keeps a real RAF clock.
  await application.evaluate(({ powerMonitor }) => {
    global.__wellbeingNow = new Date(2026, 10, 25, 12, 30).getTime();
    global.__wellbeingIdle = 0;
    Date.now = () => global.__wellbeingNow;
    powerMonitor.getSystemIdleTime = () => global.__wellbeingIdle;
  });
  await pet.waitForFunction(() => document.querySelector("#speech-copy").textContent.includes("饭点"));
  await application.evaluate(() => { global.__wellbeingNow += 300000; global.__wellbeingIdle = 300; });
  // Sample the full idle period before simulating the user's return.
  await pet.waitForTimeout(1200);
  assert.equal(await pet.locator("#panda-sprite").getAttribute("data-sprite") === "celebrate", false);
  // Dismiss the old 6.5s lunch bubble without waiting for real-world lunchtime.
  await pet.keyboard.press("Escape");
  await application.evaluate(() => { global.__wellbeingNow += 1000; global.__wellbeingIdle = 0; });
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite === "celebrate");
  assert.match(await pet.locator("#speech-copy").textContent(), /健康最重要/);
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").getAttribute("src").includes("loop-"));
  await pet.screenshot({ path: path.join(output, "desktop-celebration.png") });
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite !== "celebrate", null, { timeout: 10000 });
  assert.equal(await pet.locator("#wellbeing-fireworks").isHidden(), true);
  await pet.waitForTimeout(1100);
  assert.equal(await pet.locator("#panda-sprite").getAttribute("data-sprite") === "celebrate", false);
  // Manual inspection uses the same event and respects reduced-motion users.
  await pet.emulateMedia({ reducedMotion: "reduce" });
  await pet.keyboard.press("Escape");
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("desktop-pet:wellbeing", {
      kind: "celebrate", message: "健康最重要！你照顾自己，我就超开心～",
    });
  });
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite === "celebrate");
  assert.equal(await pet.locator("#wellbeing-fireworks").isHidden(), true);
  assert.ok((await pet.locator("#panda-sprite").getAttribute("src")).endsWith("pose.png"));
  assert.deepEqual(errors, []);
  console.log("PASS: native lunch → five-minute OS idle → return celebration → normal pose; reduced motion; no renderer errors");
}
run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await application?.close(); fs.rmSync(profile, { recursive: true, force: true }); });
