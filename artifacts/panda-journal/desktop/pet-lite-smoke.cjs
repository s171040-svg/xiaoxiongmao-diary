// Isolated native-window test. No user account, diary, API credential or real AI request.
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-lite-native-"));
const output = path.resolve(__dirname, "../../../generated-artifacts/desktop-platforms-v020");
fs.mkdirSync(output, { recursive: true });
const executable = process.env.PATH.split(path.delimiter).filter(d => !d.includes("node_modules"))
  .map(d => path.join(d, "electron")).find(p => fs.existsSync(p)) || require("electron");
const fixture = `<!doctype html><meta charset="utf-8"><h1>Isolated room bridge test</h1>
<button id="enter">出门到桌面</button><script>
document.querySelector('#enter').onclick=()=>window.pandaDesktop.enterDesktop();
</script>`;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fixture);
});
let application;
async function until(check, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${label}`);
}
async function run() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  application = await _electron.launch({
    executablePath: executable,
    args: ["--no-sandbox", path.join(__dirname, "main.cjs"), "--dev"],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: process.env.DISPLAY,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
      XDG_DATA_DIRS: process.env.XDG_DATA_DIRS, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      PANDA_PROFILE_DIR: profile, REPL_ID: "isolated-native-preview",
      PANDA_JOURNAL_URL: `http://127.0.0.1:${server.address().port}/room`,
    },
  });
  await until(() => application.windows().length === 2, "pet and hidden room created");
  const pet = application.windows().find(w => w.url().includes("pet.html"));
  const room = application.windows().find(w => !w.url().includes("pet.html"));
  const errors = [];
  pet.on("pageerror", error => errors.push(error.message));
  await pet.waitForLoadState("domcontentloaded");
  await room.waitForLoadState("domcontentloaded");
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  for (const selector of [".pet-presence", "#panda", "#panda-sprite"]) {
    const size = await pet.locator(selector).evaluate(el => {
      const rect = el.getBoundingClientRect(); return { width: rect.width, height: rect.height };
    });
    assert.deepEqual(size, { width: 40, height: 40 }, `${selector} is half the previous 80px desktop size`);
  }
  await application.evaluate(({ screen, BrowserWindow }) => {
    screen.getCursorScreenPoint = () => ({ x: -1000, y: -1000 });
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html"));
    const original = win.setIgnoreMouseEvents.bind(win);
    win.__ignored = true;
    win.setIgnoreMouseEvents = (value, options) => { win.__ignored = value; original(value, options); };
  });
  const state = () => application.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    const petWindow = all.find(w => w.webContents.getURL().includes("pet.html"));
    const roomWindow = all.find(w => !w.webContents.getURL().includes("pet.html"));
    return { pet: petWindow.isVisible(), room: roomWindow.isVisible(), ignored: petWindow.__ignored };
  });
  const position = () => pet.locator(".pet-presence").evaluate(el => ({
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
  }));
  // Reproduce the old Windows failure: a stale scan marked the entire screen blocked.
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html"))
      .webContents.send("desktop:obstacles", [{ x: 0, y: 0, width: 99999, height: 99999 }]);
  });
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
  const start = await position();
  await until(async () => {
    const now = await position(); assert.equal(now.y, start.y, "taskbar walking is horizontal");
    return Math.abs(now.x - start.x) > 6;
  }, "pet still walks when a failed Windows scan reported the entire screen blocked");
  assert((await state()).ignored, "empty desktop passes mouse input through");
  let revision = 10000;
  async function platforms(windows) {
    await application.evaluate(({ BrowserWindow }, snapshot) => {
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html"))
        .webContents.send("desktop:platforms", snapshot);
    }, { revision: revision++, windows });
    // Bounds-only test windows for screenshots, not a production UI.
    await pet.evaluate(windows => {
      document.querySelectorAll(".test-window").forEach(el => el.remove());
      for (const w of windows) {
        const el = document.createElement("div"); el.className = "test-window";
        el.textContent = "模拟窗口上沿";
        el.style.cssText = `position:fixed;pointer-events:none;left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;border-top:2px solid #877d67;background:#eee8d9;color:#746c5a;font-size:12px;z-index:-1;padding:8px;box-sizing:border-box`;
        document.body.append(el);
      }
    }, windows);
  }
  const upper = { id: "111", x: 70, y: 120, width: 210, height: 100, z: 0 };
  const lower = { id: "222", x: 40, y: 240, width: 260, height: 90, z: 1 };
  await platforms([upper, lower]);
  const initialBox = await pet.locator("#panda").boundingBox();
  await pet.mouse.move(initialBox.x + 20, initialBox.y + 20); await pet.mouse.down();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
  await pet.mouse.move(170, 60, { steps: 5 }); await pet.mouse.up();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.platform === "111");
  assert.equal((await position()).y, 120, "release falls onto upper window, not its titlebar bottom");
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
  const upperStart = await position();
  await until(async () => {
    const p = await position(); assert.equal(p.y, 120);
    return Math.abs(p.x - upperStart.x) > 3;
  }, "walks horizontally on a window top");
  await pet.screenshot({ path: path.join(output, "native-window-platform.png") });
  const beforeMove = await position();
  await platforms([{ ...upper, x: 90, y: 140 }, lower]);
  await until(async () => (await position()).y === 140, "standing pet follows its moved window");
  assert(Math.abs((await position()).x - beforeMove.x - 20) < 2);
  const beforeClose = await position();
  await platforms([lower]);
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.falling === "true");
  assert(Math.abs((await position()).x - beforeClose.x) < .1, "window close does not cause sideways motion");
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.platform === "222");
  assert.equal((await position()).y, 240);
  assert(Math.abs((await position()).x - beforeClose.x) < .1, "lands on the nearest platform directly below");
  await pet.screenshot({ path: path.join(output, "native-lower-platform.png") });
  await platforms([]);
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.platform === "taskbar");
  assert.equal((await position()).y, 360, "no window beneath means landing at taskbar");
  await pet.locator("#panda").click();
  await pet.locator("#speech").waitFor({ state: "visible" });
  assert.equal(await pet.locator("#speech-copy").textContent(), "要回家吗？");
  const parked = await position();
  await pet.locator("#dismiss-prompt").click();
  await pet.locator("#speech").waitFor({ state: "hidden" });
  await pet.locator("#panda").hover();
  const box = await pet.locator("#panda").boundingBox();
  await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await pet.mouse.down();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
  await pet.mouse.move(box.x + box.width / 2 - 45, box.y + box.height / 2 - 15, { steps: 5 });
  await pet.mouse.up();
  assert(Math.hypot((await position()).x - parked.x, (await position()).y - parked.y) > 20);
  assert(await pet.locator("#speech").isHidden(), "drag release does not open the home prompt");
  await room.evaluate(() => window.pandaDesktop.syncDesktopCharacter({ characterId: "xiaobai", ready: true }));
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").src.includes("xiaobai"));
  await room.evaluate(() => window.pandaDesktop.companionMotion({ stage: "away", action: "idle", token: 1, duration: 3000 }));
  assert((await state()).pet, "room departures do not hide the walking desktop pet");
  await pet.emulateMedia({ reducedMotion: "reduce" });
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "idle");
  await pet.screenshot({ path: path.join(output, "native-xiaobai.png") });
  // Keyboard activation avoids the post-drag synthetic-click suppression interval.
  await pet.locator("#panda").focus();
  await pet.keyboard.press("Enter");
  await pet.locator("#speech").waitFor({ state: "visible" });
  await pet.screenshot({ path: path.join(output, "native-home-prompt.png") });
  await pet.locator("#open-journal").click();
  await until(async () => { const s = await state(); return s.room && !s.pet; }, "return home swaps native windows");
  await room.locator("#enter").click();
  await until(async () => { const s = await state(); return s.pet && !s.room; }, "room can reopen the same desktop pet");
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-character"), "xiaobai");
  await pet.locator("#panda").focus(); await pet.keyboard.press("Enter");
  await pet.locator("#open-journal").click();
  await until(async () => (await state()).room, "room reopens before close test");
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes("pet.html")).close();
  });
  await until(async () => { const s = await state(); return s.pet && !s.room; }, "closing room keeps the desktop pet alive");
  assert.deepEqual(errors, []);
  console.log("PASS horizontal taskbar/window walking, moved support, vertical falls to lower window/taskbar, 40px size, pass-through, drag, role sync and home.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (application) await application.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
});
