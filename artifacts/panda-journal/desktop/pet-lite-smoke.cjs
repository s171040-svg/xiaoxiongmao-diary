// Isolated native-window test. No user account, diary, API credential or real AI request.
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-lite-native-"));
const output = path.resolve(__dirname, "../../../generated-artifacts/desktop-punch-v022");
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
  await room.evaluate(() => window.pandaDesktop.syncDesktopCharacter({ characterId: "panda", ready: true, status: "ready" }));
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  if (!process.env.PANDA_ONLY_WEB_TEST) {
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
  // Intercept only the popup display; exercise the actual native right-click
  // handler and its real MenuItems, not a separate test-only state setter.
  await application.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () { globalThis.__desktopMenuForTest = this; };
  });
  async function toggleQuiet() {
    await pet.locator("#panda").click({ button: "right" });
    return application.evaluate(() => {
      const menu = globalThis.__desktopMenuForTest;
      const assertMenu = menu?.getMenuItemById("quiet-mode");
      if (!assertMenu) throw new Error("Pet right-click did not expose quiet mode");
      assertMenu.click(assertMenu);
      return { label: assertMenu.label, checked: assertMenu.checked,
        pauseEnabled: menu.getMenuItemById("pause-walking").enabled };
    });
  }
  await pet.evaluate(() => { Math.random = () => 0; });
  assert.deepEqual(await toggleQuiet(), { label: "取消安静模式", checked: true, pauseEnabled: false });
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "lying"
    && document.querySelector("#panda-sprite").src.endsWith("/peeking.png"));
  const quietStart = await position();
  await pet.locator("#panda").click();
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite === "punch");
  assert(await pet.locator("#speech").isHidden(), "clicking panda no longer asks to go home");
  await pet.screenshot({ path: path.join(output, "native-punch.png") });
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite === "lying");
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-quiet"), "true",
    "punch ends back in the same quiet rest, without turning quiet mode off");
  await pet.waitForTimeout(3500);
  assert.deepEqual(await position(), quietStart, "quiet mode cancels the existing walk and stays parked");
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
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-quiet"), "true");
  const lowerContact = await position();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.landing === "prone");
  await pet.screenshot({ path: path.join(output, "native-lower-platform-prone.png") });
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.landing === "rise");
  assert.deepEqual(await position(), lowerContact, "the recovery does not slide along the ledge");
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "lying");
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-motion"), "lying",
    "window closing never cancels quiet mode or the resting pose");
  await pet.screenshot({ path: path.join(output, "native-lower-platform.png") });
  const quietBox = await pet.locator("#panda").boundingBox();
  await pet.mouse.move(quietBox.x + 20, quietBox.y + 20); await pet.mouse.down();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
  await pet.mouse.move(210, 170, { steps: 5 }); await pet.mouse.up();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.platform === "222"
    && document.querySelector(".pet-presence").dataset.motion === "lying");
  const quietDropped = await position();
  await pet.waitForTimeout(2200);
  assert.deepEqual(await position(), quietDropped, "drag and gravity preserve quiet mode without restarting walking");
  await pet.screenshot({ path: path.join(output, "native-quiet-lying.png") });
  for (const [random, pose] of [[.4, "stare"], [.999, "sleep"]]) {
    assert.equal((await toggleQuiet()).label, "安静模式");
    await pet.evaluate(random => { Math.random = () => random; }, random);
    await toggleQuiet();
    await pet.waitForFunction(pose => document.querySelector(".pet-presence").dataset.motion === pose, pose);
    await pet.waitForTimeout(1000); // Let the real pose-entry frames finish.
    await pet.screenshot({ path: path.join(output, `native-quiet-${pose}.png`) });
  }
  await platforms([]);
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.platform === "taskbar");
  assert.equal((await position()).y, 360, "no window beneath means landing at taskbar");
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-quiet"), "true");
  await toggleQuiet();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.motion === "walk");
  const resumed = await position();
  await until(async () => Math.abs((await position()).x - resumed.x) > 3, "cancel quiet mode resumes platform walking");
  await pet.locator("#panda").click();
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite === "punch");
  const punchedAt = await position();
  await pet.waitForFunction(() => document.querySelector("#panda-sprite").dataset.sprite !== "punch");
  assert.deepEqual(await position(), punchedAt, "hit animation stays on its platform without lateral wandering");
  const parked = await position();
  await pet.locator("#panda").hover();
  const box = await pet.locator("#panda").boundingBox();
  await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await pet.mouse.down();
  await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.dragging === "true");
  await pet.mouse.move(box.x + box.width / 2 - 45, box.y + box.height / 2 - 15, { steps: 5 });
  await pet.mouse.up();
  assert(Math.hypot((await position()).x - parked.x, (await position()).y - parked.y) > 20);
  assert(await pet.locator("#speech").isHidden(), "drag release does not open the home prompt");
  assert.notEqual(await pet.locator("#panda-sprite").getAttribute("data-sprite"), "punch",
    "drag release never counts as a punch click");
  await pet.locator("#panda").click({ button: "right" });
  await application.evaluate(() => {
    const item = globalThis.__desktopMenuForTest?.getMenuItemById("return-home");
    if (!item) throw new Error("Right-click return-home option is missing");
    item.click(item);
  });
  await until(async () => { const s = await state(); return s.room && !s.pet; }, "panda returns home from right-click menu");
  await room.locator("#enter").click();
  await until(async () => { const s = await state(); return s.pet && !s.room; }, "panda re-enters desktop after right-click return");
  await room.evaluate(() => window.pandaDesktop.syncDesktopCharacter({ characterId: "xiaobai", ready: true, status: "ready" }));
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
  await room.evaluate(() => window.pandaDesktop.syncDesktopCharacter({ characterId: "panda", ready: true, status: "ready" }));
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes("pet.html")).close();
  });
  await until(async () => { const s = await state(); return s.pet && !s.room; }, "closing room keeps the desktop pet alive");
  assert.equal(await pet.locator(".pet-presence").getAttribute("data-character"), "panda");
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  async function exerciseCleaningPass(remaining) {
    await pet.evaluate(remainingShakes => {
      const state = JSON.parse(localStorage.getItem("panda.desktop.dirt.v1"))
        || { remainingShakes, nextShakeAt: 0 };
      state.remainingShakes = remainingShakes;
      state.nextShakeAt = Date.now() + 350;
      localStorage.setItem("panda.desktop.dirt.v1", JSON.stringify(state));
    }, remaining);
    await pet.reload();
    await pet.waitForFunction(() => document.querySelector(".pet-presence").dataset.character === "panda");
    await pet.waitForFunction(expected => {
      const presence = document.querySelector(".pet-presence");
      return presence.dataset.shaking === "true"
        && new RegExp(`/desktop-shake/${expected}/\\d+\\.png`).test(
          document.querySelector("#panda-sprite").src,
        );
    }, remaining, { timeout: 10000 });
    if (remaining === 3) await pet.screenshot({ path: path.join(output, "native-dirty-shake.png") });
    await pet.waitForFunction(expected => {
      const presence = document.querySelector(".pet-presence");
      const dirt = JSON.parse(localStorage.getItem("panda.desktop.dirt.v1"));
      return presence.dataset.shaking === "false" && dirt.remainingShakes === expected - 1;
    }, remaining, { timeout: 10000 });
    assert.equal(await pet.locator("#panda-dirt").isHidden(), remaining === 1,
      "residual dirt stays visible until the third complete shake");
  }
  for (const remaining of [3, 2, 1]) await exerciseCleaningPass(remaining);
  assert.equal(await pet.locator("#panda-dirt").isHidden(), true, "the third shake cleans the pet");
  assert.deepEqual(errors, []);
  console.log("PASS desktop fall-cleaning state plays three separate shake cycles and cleans after the third.");
  }
  if (process.env.PANDA_WEB_TEST_URL) {
    await application.evaluate(({ BrowserWindow }) => {
      const webTest = new BrowserWindow({ width: 1280, height: 800, webPreferences: { sandbox: true } });
      webTest.loadURL("about:blank");
    });
    await until(() => application.windows().length === 3, "isolated web room window created");
    const web = application.windows().find(w => w !== pet && w !== room);
    web.on("pageerror", error => errors.push(error.message));
    await web.route("**/api/companion/chat", route => route.abort());
    await web.addInitScript(() => { Math.random = () => .5; });
    await web.goto(process.env.PANDA_WEB_TEST_URL);
    await web.emulateMedia({ reducedMotion: "no-preference" });
    const panda = web.getByTestId("button-panda");
    await panda.waitFor({ state: "visible" });
    await panda.click();
    await web.waitForFunction(() => document.querySelector(".ps-body[data-sprite='punch']") !== null);
    const beforePunch = await panda.boundingBox();
    await web.waitForTimeout(700);
    await web.screenshot({ path: path.join(output, "web-punch.png") });
    const duringPunch = await panda.boundingBox();
    assert(Math.abs(beforePunch.x - duringPunch.x) < 1 && Math.abs(beforePunch.y - duringPunch.y) < 1,
      "web punch does not roam away during its one-shot reaction");
    await web.waitForFunction(() => document.querySelector(".ps-body[data-sprite='punch']") === null);
    await web.waitForFunction(() => {
      const image = document.querySelector(".ps-body");
      return image?.complete && image.naturalWidth > 0;
    });
    await web.getByTestId("button-dev-action").click();
    await web.getByTestId("button-dev-event-punch").click();
    await web.waitForFunction(() => document.querySelector(".ps-body[data-sprite='punch']") !== null);
    await web.waitForFunction(() => document.querySelector(".ps-body[data-sprite='punch']") === null);
    await web.close();
    console.log("PASS real web room click reaction, fixed position, recovery and animation-inspector action.");
  }
  assert.deepEqual(errors, []);
  if (!process.env.PANDA_ONLY_WEB_TEST) console.log("PASS click punch and quiet recovery, no home prompt on panda click, drag without punching, quiet/platform movement, role sync and home.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (application) await application.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
});
