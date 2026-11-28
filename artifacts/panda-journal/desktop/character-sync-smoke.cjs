// Isolated account-state bridge checks; no real account, tokens, diary or AI calls.
"use strict";
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-role-sync-"));
const executable = process.env.PATH.split(path.delimiter).filter(d => !d.includes("node_modules"))
  .map(d => path.join(d, "electron")).find(p => fs.existsSync(p)) || require("electron");
const server = http.createServer((_req, res) => res.end("<!doctype html><meta charset='utf-8'><title>Isolated room</title>"));
let application;
async function until(check) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the native character state");
}
async function run() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  application = await _electron.launch({
    executablePath: executable, args: ["--no-sandbox", path.join(__dirname, "main.cjs"), "--dev"],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: process.env.DISPLAY,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
      XDG_DATA_DIRS: process.env.XDG_DATA_DIRS, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      PANDA_PROFILE_DIR: directory, REPL_ID: "isolated-role-check",
      PANDA_JOURNAL_URL: `http://127.0.0.1:${server.address().port}/room`,
    },
  });
  await until(() => application.windows().length === 2);
  const pet = application.windows().find(page => page.url().includes("pet.html"));
  const room = application.windows().find(page => !page.url().includes("pet.html"));
  await Promise.all([pet.waitForLoadState("domcontentloaded"), room.waitForLoadState("domcontentloaded")]);
  const state = () => room.evaluate(() => window.pandaDesktop.desktopPetState());
  const visible = () => application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("pet.html")).isVisible());
  const sync = value => room.evaluate(value => window.pandaDesktop.syncDesktopCharacter(value), value);
  assert.equal((await state()).identityReady, false);
  assert.equal(await visible(), false, "no default panda flashes before identity loads");
  await sync({ characterId: "panda", ready: true }); // old, guest-ready protocol
  await until(async () => (await state()).identityStatus === "outdated");
  assert.equal(await visible(), false);
  const rejected = await room.evaluate(() => window.pandaDesktop.enterDesktop().then(() => false, () => true));
  assert(rejected, "an old guest-ready page cannot release a pet");
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes("pet.html")).close();
  });
  assert.equal(await visible(), false, "closing an unconfirmed room cannot release a default pet");
  for (const characterId of ["xiaobai", "panda"]) {
    await sync({ characterId: "panda", ready: false, status: "loading" });
    await sync({ characterId, ready: true, status: "ready" });
    await until(async () => (await state()).identityReady);
    await room.evaluate(() => window.pandaDesktop.enterDesktop());
    await until(visible);
    await pet.waitForFunction(id => document.querySelector(".pet-presence").dataset.character === id, characterId);
    const source = await pet.locator("#panda-sprite").getAttribute("src");
    assert.equal(source.includes("xiaobai"), characterId === "xiaobai");
    await sync({ characterId: "panda", ready: true, status: "signed-out" });
    await until(async () => !(await state()).identityReady);
    assert.equal(await visible(), false, "logout hides the previous account's pet");
    assert.equal((await state()).characterId, characterId, "guest preview never overwrites a confirmed skin");
  }
  await sync({ characterId: "xiaobai", ready: true, status: "ready" });
  await room.evaluate(() => window.pandaDesktop.enterDesktop());
  await room.reload();
  await until(async () => !(await state()).identityReady);
  assert.equal(await visible(), false, "navigation invalidates the previous confirmed identity");
  await sync({ characterId: "xiaobai", ready: true, status: "ready" });
  await until(visible);
  assert.equal((await state()).characterId, "xiaobai");
  console.log("PASS native startup gating, old guest rejection, both selected skins, sign-out, reload and recovery.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (application) await application.close();
  server.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
