"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require("playwright");

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-offline-trial-"));
  const systemElectron = process.env.REPL_ID && process.env.PATH.split(path.delimiter)
    .filter(directory => !directory.includes("node_modules"))
    .map(directory => path.join(directory, "electron")).find(candidate => fs.existsSync(candidate));
  const env = Object.fromEntries([
    "PATH", "HOME", "DISPLAY", "FONTCONFIG_FILE", "FONTCONFIG_PATH", "XDG_DATA_DIRS",
    "XDG_CONFIG_HOME", "SystemRoot", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "REPL_ID",
  ].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  let application;
  try {
    application = await _electron.launch({
      executablePath: systemElectron || require("electron"),
      args: [...(systemElectron ? ["--no-sandbox"] : []), path.join(__dirname, "main.cjs"), "--offline-desktop-trial"],
      env: {
        ...env, PANDA_PROFILE_DIR: profile,
        // Launch must work even with an unreachable room configured.
        PANDA_JOURNAL_URL: "http://127.0.0.1:1/room",
      },
    });
    const pet = await application.firstWindow();
    assert.match(pet.url(), /^file:.*\/pet\.html/);
    await pet.locator("#panda").waitFor({ state: "visible" });
    assert.deepEqual(await pet.evaluate(() => window.pandaDesktop.desktopPetState()), {
      mode: "desktop", characterId: "panda", identityReady: true,
      identityStatus: "offline-trial", paused: false, quietMode: false, restPose: null,
    });
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await pet.evaluate(() => window.pandaDesktop.returnHome());
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    console.log("PASS offline trial launches and shows Panda without opening the account room");

    await pet.emulateMedia({ reducedMotion: "no-preference" });
    await application.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (options) { globalThis.__restPopup = { menu: this, close: options.callback }; };
    });
    const actor = pet.locator("#panda");
    const presence = pet.locator(".pet-presence");
    async function choosePose(id, previouslySelected) {
      await actor.click();
      const result = await application.evaluate((_electron, option) => {
        const popup = globalThis.__restPopup;
        if (!popup) throw new Error("Single click did not open the rest menu");
        const entries = popup.menu.items.map(({ label, checked }) => ({ label, checked }));
        const item = popup.menu.getMenuItemById(option);
        item?.click(item);
        popup.close();
        globalThis.__restPopup = null;
        return entries;
      }, id);
      assert.deepEqual(result.map(item => item.label), ["睡觉", "坐着", "趴着", "恢复走动"]);
      assert.deepEqual(result.filter(item => item.checked).map(item => item.label), [previouslySelected]);
    }
    for (const [pose, previous, sprite] of [
      ["sleep", "恢复走动", /\/panda\/(?:sleep\.png|frames\/sleep-\d+\.png)/],
      ["stare", "睡觉", /\/panda\/transitions\/pixellab-walk-to-idle-5\.png/],
      ["lying", "坐着", /\/panda\/peeking\.png/],
    ]) {
      await choosePose(pose, previous);
      await pet.waitForFunction(({ pose, source }) => {
        const el = document.querySelector("#panda-sprite");
        return el.dataset.sprite === pose && new RegExp(source).test(el.getAttribute("src"))
          && el.complete && el.naturalWidth > 0;
      }, { pose, source: sprite.source });
    }

    // A long press still drags rather than opening the single-click menu.
    const bounds = await actor.boundingBox();
    const startX = parseFloat(await presence.evaluate(el => el.style.left));
    await pet.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await pet.mouse.down();
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
    await pet.mouse.move(startX - 35, bounds.y - 65, { steps: 6 });
    await pet.mouse.up();
    await pet.waitForFunction(() => {
      const el = document.querySelector(".pet-presence");
      return el.dataset.platform === "taskbar" && el.dataset.motion === "lying";
    });
    await pet.waitForFunction(() => document.querySelector("#panda-sprite").src.endsWith("/panda/peeking.png"));
    const landedX = parseFloat(await presence.evaluate(el => el.style.left));
    assert(landedX < startX - 20, "pet moved when dragged");
    assert.equal(await application.evaluate(() => globalThis.__restPopup), null, "drag release did not open the rest menu");
    await pet.waitForTimeout(550); // Past the synthetic click suppression window.
    await choosePose("auto", "趴着");
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
    console.log("PASS all three click-selected poses, drag-and-drop retaining pose, and resume walking");
  } finally {
    await application?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
