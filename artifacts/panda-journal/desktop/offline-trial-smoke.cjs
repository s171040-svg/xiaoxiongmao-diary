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
      identityStatus: "offline-trial", paused: false, quietMode: false,
    });
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    await pet.evaluate(() => window.pandaDesktop.returnHome());
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    console.log("PASS offline trial launches and shows Panda without opening the account room");
  } finally {
    await application?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
