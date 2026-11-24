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
      backgroundBite: process.platform === "win32" && !process.env.REPL_ID,
    });
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    const visibilityDeadline = Date.now() + 5000;
    while (!await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
      && Date.now() < visibilityDeadline) await new Promise(resolve => setTimeout(resolve, 50));
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
    assert.equal(await pet.locator("#panda-sprite").getAttribute("data-sprite"), "grab");
    await pet.mouse.up();
    await pet.waitForFunction(() => {
      const el = document.querySelector(".pet-presence");
      return el.dataset.falling === "true" && el.dataset.motion === "grab" && !el.dataset.landing;
    });
    for (const phase of ["prone", "rise"]) {
      await pet.waitForFunction(phase => {
        const el = document.querySelector(".pet-presence");
        const sprite = document.querySelector("#panda-sprite");
        return el.dataset.platform === "taskbar" && el.dataset.landing === phase
          && sprite.dataset.sprite === "landing" && sprite.complete && sprite.naturalWidth === 96;
      }, phase);
    }
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
    console.log("PASS drag/fall keeps the grab frame, then plays prone and rise on the taskbar and restores the selected rest");

    if (process.platform !== "win32") {
      // The native one-pixel reader is exercised independently on Windows CI.
      // Here we drive the real Electron renderer with two controlled colors.
      assert.equal(await pet.evaluate(() => window.pandaDesktop.backgroundColor(false)), null);
      await pet.evaluate(() => { window.PandaBackgroundBite.nextAt = (now, _rng, first) => now + (first ? 10 : 1300); });
      await application.evaluate(({ BrowserWindow, ipcMain }) => {
        ipcMain.removeHandler("desktop-pet:background-color");
        const colors = ["#ad397b", "#1483bd"];
        ipcMain.handle("desktop-pet:background-color", (_event, _left, manual) =>
          manual ? "#b8843d" : colors.shift());
        BrowserWindow.getAllWindows()[0].webContents.send("desktop-pet:state", {
          mode: "desktop", characterId: "panda", identityReady: true,
          identityStatus: "offline-trial", paused: false, quietMode: false, restPose: null, backgroundBite: true,
        });
      });
      const canvas = pet.locator("#background-bite");
      async function waitColor(rgb) {
        await pet.waitForFunction(expected => {
          const el = document.querySelector("#background-bite");
          if (el.hidden) return false;
          const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 255 && expected.every((v, j) => v === data[i + j])) return true;
          }
          return false;
        }, rgb, { timeout: 15000 });
      }
      await waitColor([173, 57, 123]);
      assert.equal(await canvas.evaluate(el => getComputedStyle(el).pointerEvents), "none");
      await canvas.waitFor({ state: "hidden" });
      await waitColor([20, 131, 189]);
      await choosePose("sleep", "恢复走动");
      await canvas.waitFor({ state: "hidden" });
      await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "sleep");
      console.log("PASS desktop bite animates sampled colors, never captures clicks, and stops for manual rest");
      await actor.click({ button: "right" });
      await application.evaluate(() => {
        const menu = globalThis.__restPopup?.menu;
        const bite = menu?.getMenuItemById("bite-now");
        if (!bite || bite.label !== "立即咬屏幕（开发测试）"
          || !menu.getMenuItemById("quiet-mode")
          || !menu.items.some(item => item.label === "退出桌宠")) {
          throw new Error("Right click did not show the expected desktop controls");
        }
        bite.click(bite);
        globalThis.__restPopup = null;
      });
      await waitColor([184, 132, 61]);
      await pet.waitForFunction(() => {
        const el = document.querySelector("#panda-sprite");
        return el.dataset.sprite === "background-bite" && /\/desktop-bite\/jaw-[123]\.png$/.test(el.getAttribute("src"))
          && el.complete && el.naturalWidth === 96;
      });
      await canvas.waitFor({ state: "hidden" });
      assert.equal(await presence.getAttribute("data-motion"), "sleep");
      console.log("PASS right-click one-shot bite ignores the random toggle and returns to the selected pose");
    }
    async function companionState(overrides = {}) {
      await application.evaluate(({ BrowserWindow }, overrides) => {
        BrowserWindow.getAllWindows()[0].webContents.send("desktop-pet:state", {
          mode: "desktop", characterId: "panda", identityReady: true, identityStatus: "offline-trial",
          paused: false, quietMode: false, restPose: null, backgroundBite: false, ...overrides,
        });
      }, overrides);
    }
    const position = () => presence.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
    await pet.evaluate(() => {
      const model = window.PandaDesktopPet, rest = model.companionRest;
      const choices = [.5, 0];
      model.companionRest = now => ({ ...rest(now, () => choices.shift() ?? 0), until: now + 1400 });
    });
    await companionState({ restPose: "stare" });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "stare");
    await companionState();
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
    for (const [motion, pattern] of [["stare", /walk-to-idle-5\.png$/], ["sleep", /\/(?:frames\/)?sleep(?:-\d+)?\.png$/]]) {
      await pet.waitForFunction(({ motion, pattern }) => {
        const el = document.querySelector("#panda-sprite");
        return el.dataset.sprite === motion && new RegExp(pattern).test(el.src) && el.complete && el.naturalWidth > 0;
      }, { motion, pattern: pattern.source });
      const parked = await position();
      await pet.waitForTimeout(180);
      assert.deepEqual(await position(), parked, `${motion} is an actual stationary break`);
    }

    // Put the pet near the left edge, then make only the outing timer due.
    // The real route, gravity, paw frames, and transitions are unchanged.
    await companionState({ paused: true });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.paused === "true");
    const sideBox = await actor.boundingBox();
    await pet.mouse.move(sideBox.x + 20, sideBox.y + 20);
    await pet.mouse.down();
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
    await pet.mouse.move(39, sideBox.y, { steps: 5 });
    await pet.mouse.up();
    await pet.waitForFunction(() => {
      const el = document.querySelector(".pet-presence");
      return el.dataset.platform === "taskbar" && !el.dataset.landing;
    });
    const taskbar = await position();
    await pet.evaluate(() => { window.PandaDesktopPet.nextEdgeClimbAt = (now, _rng, first) => now + (first ? 0 : 200000); });
    await companionState({ mode: "room" });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.mode === "room");
    await companionState();
    async function climbPhase(phase) {
      await pet.waitForFunction(phase => {
        const el = document.querySelector(".pet-presence"), sprite = document.querySelector("#panda-sprite");
        return el.dataset.edgeClimb === phase && el.dataset.falling === "false"
          && sprite.dataset.sprite === "edge-climb" && sprite.complete && sprite.naturalWidth === 96;
      }, phase);
    }
    await climbPhase("up");
    const climbStart = await position();
    assert.equal(climbStart.x, 20, "left climb stays entirely on the left desktop edge");
    assert.equal(await presence.getAttribute("data-edge-flip"), "false");
    await climbPhase("pause");
    const crest = await position();
    assert.equal(crest.x, climbStart.x);
    assert.equal(crest.y, taskbar.y - 146);
    await climbPhase("down");
    assert.equal((await position()).x, climbStart.x);
    await pet.waitForFunction(() => {
      const el = document.querySelector(".pet-presence");
      return el.dataset.platform === "taskbar" && el.dataset.motion === "stare" && !el.dataset.edgeClimb;
    });
    assert.deepEqual(await position(), { x: climbStart.x, y: taskbar.y });

    await companionState({ mode: "room" });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.mode === "room");
    await companionState({ quietMode: true });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.quiet === "true");
    await pet.waitForTimeout(2100);
    assert.deepEqual(await position(), { x: climbStart.x, y: taskbar.y }, "a due climb is suppressed in quiet mode");
    console.log("PASS automatic seated and sleeping breaks, one full vertical edge outing, and no climbing during quiet mode");

    await pet.evaluate(() => {
      const model = window.PandaDesktopPet;
      model.nextDockRestAt = (now, _rng, first) => now + (first ? 0 : 120000);
      // Shorten the hold here; the unit test checks the real 60-second value.
      model.dockRestUntil = (now, entryMs) => now + entryMs + 6000;
      model.nextEdgeClimbAt = () => Infinity;
    });
    await companionState({ mode: "room" });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.mode === "room");
    await companionState({ quietMode: true });
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.quiet === "true");
    await pet.waitForTimeout(2400);
    const greeting = pet.locator("#dock-greeting");
    assert(await greeting.isHidden(), "a due greeting never interrupts quiet mode");
    await companionState();
    await greeting.waitFor({ state: "visible" });
    assert.equal(await greeting.textContent(), "我想你咧");
    assert.equal(await greeting.evaluate(el => getComputedStyle(el).pointerEvents), "none");
    assert.equal(await greeting.evaluate(el => el.closest(".pet-hit-area")), null);
    assert(await pet.locator("#speech").isHidden(), "the greeting cannot open a clickable prompt");
    const dockStart = await position();
    await pet.waitForFunction(() => {
      const el = document.querySelector(".pet-presence"), sprite = document.querySelector("#panda-sprite");
      return el.dataset.platform === "taskbar" && el.dataset.motion === "dock-prone"
        && /\/bored-over-dock\/[1-4]\.png$/.test(sprite.src) && sprite.complete;
    });
    assert.deepEqual(await position(), dockStart);
    if (process.env.PANDA_DOCK_PREVIEW_PATH) {
      const width = await pet.evaluate(() => innerWidth);
      await pet.screenshot({ path: process.env.PANDA_DOCK_PREVIEW_PATH, omitBackground: true,
        clip: { x: Math.max(0, Math.min(width - 144, Math.floor(dockStart.x - 72))),
          y: Math.floor(dockStart.y - 96), width: 144, height: 96 } });
    }
    await greeting.waitFor({ state: "hidden" });
    assert.equal(await presence.getAttribute("data-motion"), "dock-prone", "the pet stays after the text fades");
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
    assert(await greeting.isHidden());
    console.log("PASS taskbar peek uses the original art, shows an unobtrusive greeting once, and returns to walking");
  } finally {
    await application?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
