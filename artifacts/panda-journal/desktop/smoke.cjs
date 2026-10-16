// Native checks use an isolated profile and mocked provider, never real diaries or keys.
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "panda-companion-native-"));
const workspace = path.resolve(__dirname, "../../..");
const executable = process.env.PATH.split(path.delimiter).filter(d => !d.includes("node_modules"))
  .map(d => path.join(d, "electron")).find(p => fs.existsSync(p)) || require("electron");
const spriteDir = path.join(__dirname, "../public/static/panda");
const animationManifest = require("../src/lib/panda-animation-manifest.json");
const spriteSizes = {};
function hasPngTransparency(png) {
  if (png[25] === 6 || png[25] === 4) return true;
  if (png[25] !== 3) return false;
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "tRNS") return true;
    offset += length + 12;
  }
  return false;
}
for (const sprite of new Set([...Object.values(animationManifest.motionSprites), ...Object.values(animationManifest.actionSprites)])) {
  const png = fs.readFileSync(path.join(spriteDir, `${sprite}.png`));
  assert.equal(png.toString("ascii", 1, 4), "PNG", `${sprite} sprite is a PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height, `${sprite} sprite is square`);
  spriteSizes[sprite] = { width, height };
  const spriteFrameCount = animationManifest.frameCountBySprite?.[sprite] ?? animationManifest.frameCount;
  for (let frame = 1; frame <= spriteFrameCount; frame++) {
    const framePng = fs.readFileSync(path.join(spriteDir, "frames", `${sprite}-${frame}.png`));
    assert.equal(framePng.toString("ascii", 1, 4), "PNG", `${sprite} frame ${frame} is a PNG`);
    assert.equal(framePng.readUInt32BE(16), width, `${sprite} frame ${frame} width`);
    assert.equal(framePng.readUInt32BE(20), height, `${sprite} frame ${frame} height`);
    assert.equal(hasPngTransparency(framePng), true, `${sprite} frame ${frame} keeps transparency`);
  }
}
let application;
async function until(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  application = await _electron.launch({
    executablePath: executable, args: ["--no-sandbox", path.join(__dirname, "main.cjs"), "--dev"],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: process.env.DISPLAY,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
      XDG_DATA_DIRS: process.env.XDG_DATA_DIRS, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      TZ: "Asia/Hong_Kong",
      PANDA_PROFILE_DIR: profile, PANDA_JOURNAL_URL: "http://127.0.0.1:21836/",
      DEEPSEEK_API_KEY: "synthetic-test-key" },
  });
  await until(() => application.windows().length === 2, "hidden local chat created");
  const pet = application.windows().find(w => w.url().includes("pet.html"));
  const journal = application.windows().find(w => !w.url().includes("pet.html"));
  await pet.waitForLoadState("domcontentloaded");
  await journal.getByTestId("input-chat").waitFor();
  assert.equal(await journal.getByTestId("companion-chat").getAttribute("data-room-only"), "false",
    "Electron journal retains the desktop chat view");
  assert.equal(await journal.getByTestId("panda-click-debug").count(), 0,
    "web-room diagnostics do not render in the desktop journal");
  await journal.emulateMedia({ reducedMotion: "no-preference" });
  await application.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html"));
    const original = win.setIgnoreMouseEvents.bind(win); win.__ignored = true;
    win.setIgnoreMouseEvents = (value, options) => { win.__ignored = value; return original(value, options); };
    screen.getCursorScreenPoint = () => ({ x: 0, y: 0 });
    globalThis.__requests = []; globalThis.__fail = false;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); globalThis.__requests.push(body);
      if (globalThis.__fail) return { ok: false, status: 502 };
      const follow = body.messages.at(-1).content.includes("嗓子");
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        reply: follow ? "唔，小乐唱完以后嗓子酸了，小熊猫陪小乐坐会儿呀。（它轻轻靠过来）"
          : "唔，小乐唱了这么久，小熊猫陪小乐坐会儿呀。（它轻轻靠过来）",
        userName: "小乐", memories: follow ? [] : [{ kind: "worry", text: "唱歌很久后很累" }, { kind: "action", text: "明天继续练习唱歌" }], action: "none",
      }) } }] }) };
    };
  });
  const nativePet = () => application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html"));
    return { visible: w.isVisible(), ignored: w.__ignored, bounds: w.getBounds(), top: w.isAlwaysOnTop() };
  });
  const journalVisible = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !/pet.html|gift.html/.test(w.webContents.getURL())).isVisible());
  const read = () => journal.evaluate(() => JSON.parse(localStorage.getItem("little-panda-companion-v1")));
  const seed = (change) => journal.evaluate(change);
  assert.equal(await journalVisible(), false);
  assert.equal((await nativePet()).top, true);
  assert.equal(await pet.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgba(0, 0, 0, 0)");
  assert.equal(await pet.locator(".pet-stage").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(216, 196, 155)");
  await pet.bringToFront();
  await until(() => pet.evaluate(() => document.visibilityState === "visible"), "native pet active for movement checks");
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  const nativeRoom = await pet.evaluate(() => {
    const stage = document.querySelector(".pet-stage").getBoundingClientRect();
    const plane = document.querySelector(".pet-room-plane").getBoundingClientRect();
    const grid = getComputedStyle(document.querySelector(".pet-room-plane"), "::before").backgroundImage;
    return { stage, plane, grid, width: innerWidth, height: innerHeight };
  });
  assert.ok(Math.abs(nativeRoom.stage.width - nativeRoom.width) < 2 && Math.abs(nativeRoom.stage.height - nativeRoom.height) < 2,
    "desktop room stage fills its complete viewport");
  assert.ok(nativeRoom.plane.width >= nativeRoom.stage.width - 2 && nativeRoom.plane.height >= nativeRoom.stage.height - 2,
    "tilted floor covers the complete desktop room");
  assert.match(nativeRoom.grid, /repeating-linear-gradient/);
  await until(async () => await pet.locator(".pet-presence").getAttribute("data-motion") === "walk", "native pet begins roaming");
  const nativeWalkBounds = await pet.evaluate(async () => {
    const panda = document.querySelector(".pet-presence");
    const points = [];
    const started = performance.now();
    while (performance.now() - started < 5600) {
      points.push({ left: parseFloat(panda.style.left), top: parseFloat(panda.style.top), scale: parseFloat(panda.dataset.roomScale) });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return {
      xSpan: Math.max(...points.map(p => p.left)) - Math.min(...points.map(p => p.left)),
      ySpan: Math.max(...points.map(p => p.top)) - Math.min(...points.map(p => p.top)),
      scaleSpan: Math.max(...points.map(p => p.scale)) - Math.min(...points.map(p => p.scale)),
    };
  });
  assert.ok(nativeWalkBounds.xSpan > 1 && nativeWalkBounds.ySpan > 1, "desktop pet moves in both room-plane axes");
  assert.ok(nativeWalkBounds.scaleSpan < 0.001, "desktop pet keeps the same minimum size at every depth");
  await pet.emulateMedia({ reducedMotion: "reduce" });
  await until(async () => await pet.locator("#panda-sprite").getAttribute("data-frame") === "0", "reduced motion resets to the base pose");
  assert.match(await pet.locator("#panda-sprite").getAttribute("src"), /static\/panda\/walk\.png$/);
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  await until(async () => await pet.locator("#panda-sprite").getAttribute("data-sprite") === "walk", "active desktop walk sprite");
  const idleFrame = Number(await pet.locator("#panda-sprite").getAttribute("data-frame"));
  assert.ok(Number.isInteger(idleFrame) && idleFrame >= 0 && idleFrame <= animationManifest.frameCount, "active desktop frame is in the animation cycle");
  const idleSrc = await pet.locator("#panda-sprite").getAttribute("src");
  assert.match(idleSrc, new RegExp(`static/panda/${idleFrame === 0 ? "walk" : `frames/walk-${idleFrame}`}\\.png$`));
  assert.equal(await pet.locator("#panda-sprite").evaluate((img, width) => img.complete && img.naturalWidth === width, spriteSizes.walk.width), true);
  await until(async () => Number(await pet.locator("#panda-sprite").getAttribute("data-frame")) !== idleFrame, "idle pixel animation advances");
  assert.equal(await pet.locator("#panda-sprite").evaluate((img, width) => img.complete && img.naturalWidth === width, spriteSizes.walk.width), true);
  await pet.screenshot({ path: path.join(os.tmpdir(), "panda-pet-room.png") });
  const rect = await pet.locator("#panda").boundingBox();
  await application.evaluate(({ screen, BrowserWindow }, r) => {
    screen.getCursorScreenPoint = () => {
      const b = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("pet.html")).getBounds();
      return { x: Math.round(b.x + r.x + r.width / 2), y: Math.round(b.y + r.y + r.height / 2) };
    };
  }, rect);
  await until(async () => !(await nativePet()).ignored, "panda accepts clicks");
  await application.evaluate(({ screen }) => { screen.getCursorScreenPoint = () => ({ x: 0, y: 0 }); });
  await until(async () => (await nativePet()).ignored, "transparent region passes clicks");
  await pet.emulateMedia({ reducedMotion: "reduce" });
  await pet.evaluate(() => {
    const presence = document.querySelector(".pet-presence");
    presence.style.left = "50%";
    presence.style.top = "60%";
    presence.dataset.roomSide = "center";
    presence.dataset.roomBubble = "above";
  });
  await pet.locator("#panda").click();
  await until(() => pet.locator("#speech").isVisible(), "warm single click greeting");
  await pet.locator("#panda").dblclick();
  await until(() => pet.locator("#speech-actions").isVisible(), "double click prompt");
  await pet.locator("#dismiss-prompt").click();
  await pet.locator("#panda").dblclick();
  await pet.locator("#open-journal").click();
  await until(journalVisible, "chat shown");
  assert.equal(await journal.getByTestId("button-dev-gift").isVisible(), true, "developer gift tool is available in the development UI");
  const stateBeforeDevGift = await read();
  await journal.getByTestId("button-dev-gift").click();
  await journal.getByTestId("button-dev-gift-create").click();
  assert.match(await journal.getByTestId("dev-gift-error").textContent(), /都填好/);
  assert.equal((await read()).gifts.length, stateBeforeDevGift.gifts.length, "invalid developer gift is not stored");
  await journal.getByTestId("input-dev-gift-emoji").fill("🍌");
  await journal.getByTestId("input-dev-gift-item").fill("测试香蕉");
  await journal.getByTestId("input-dev-gift-animal").fill("测试猴子");
  await journal.getByTestId("input-dev-gift-story").fill("猴子把一根测试香蕉送给了小熊猫。");
  await journal.getByTestId("button-dev-gift-create").click();
  await until(async () => (await read()).gifts.length === stateBeforeDevGift.gifts.length + 1, "developer gift saved locally");
  let injectedGift = (await read()).gifts.at(-1);
  assert.deepEqual(
    { emoji: injectedGift.emoji, item: injectedGift.item, animal: injectedGift.animal, story: injectedGift.story },
    { emoji: "🍌", item: "测试香蕉", animal: "测试猴子", story: "猴子把一根测试香蕉送给了小熊猫。" },
  );
  await journal.getByTestId("button-gifts").click();
  const injectedCard = journal.locator(".cc-gift").filter({ hasText: "测试香蕉" });
  await injectedCard.getByRole("button", { name: "收藏" }).click();
  await injectedCard.getByRole("button", { name: "喂小熊猫" }).click();
  await until(async () => (await read()).gifts.at(-1).fedAt, "developer food gift can be fed");
  injectedGift = (await read()).gifts.at(-1);
  assert.equal(injectedGift.favorite, true);
  await journal.getByTestId("dialog-gifts-close").click();
  await journal.evaluate(snapshot => localStorage.setItem("little-panda-companion-v1", JSON.stringify(snapshot)), stateBeforeDevGift);
  await journal.reload();
  await journal.getByTestId("input-chat").waitFor();
  assert.equal((await read()).gifts.length, stateBeforeDevGift.gifts.length, "smoke test restores its isolated local gift state");
  assert.equal(await journal.getByTestId("button-dev-action").isVisible(), true, "developer action detector is available beside the diary button");
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  await journal.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await pet.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), false,
    "developer action animation test uses full motion");
  await journal.getByTestId("button-dev-action").click();
  for (const disabledAction of ["roll", "spin", "tumble"]) {
    assert.equal(await journal.getByTestId(`button-dev-action-${disabledAction}`).count(), 0,
      `rolling action ${disabledAction} is removed from the developer action list`);
  }
  await journal.getByTestId("button-dev-action-jump").click();
  assert.match(await journal.getByTestId("dev-action-countdown").textContent(), /2 秒后执行/, "developer action test starts with a two-second countdown");
  await journal.waitForTimeout(800);
  assert.doesNotMatch(await journal.locator(".ps-panda").getAttribute("class") || "", /(?:^|\s)ps-jump(?:\s|$)/, "selected action does not begin immediately");
  await until(async () => (await journal.locator(".ps-panda").getAttribute("class") || "").split(/\s+/).includes("ps-jump"), "selected action starts after the countdown");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === "entering", "dynamic action uses generated entry frames");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === null, "dynamic action entry frames finish before the action");
  await until(async () => !(await journal.locator(".ps-panda").getAttribute("class") || "").split(/\s+/).includes("ps-jump"), "developer action returns to idle");
  await journal.getByTestId("button-dev-action").click();
  await journal.getByTestId("button-dev-action-bamboo").click();
  await Promise.all([
    until(async () => await journal.getByTestId("button-panda").getAttribute("data-bamboo-phase") === "entering", "web snack action sits and faces forward"),
    until(async () => ["entering", "dropping", "eating"].includes(await pet.locator(".pet-presence").getAttribute("data-bamboo-phase")), "desktop snack action starts"),
  ]);
  await Promise.all([
    until(async () => await journal.getByTestId("button-panda").getAttribute("data-bamboo-phase") === "dropping", "web snack begins falling"),
    until(async () => await journal.locator(".ps-snack-drop").count() === 1, "falling snack is visible in the web room"),
    until(async () => ["dropping", "eating"].includes(await pet.locator(".pet-presence").getAttribute("data-bamboo-phase")), "desktop snack drop completes"),
  ]);
  await until(async () => await pet.locator(".pet-action-transition").evaluate(image => image.complete && image.naturalWidth === 96), "desktop generated transition art loads");
  await until(async () => await pet.locator(".pet-snack-drop").evaluate(image => image.complete && image.naturalWidth === 48), "desktop snack sprite loads");
  await until(async () => await journal.getByTestId("button-panda").getAttribute("data-bamboo-phase") === "eating", "panda begins eating");
  await until(async () => await pet.locator(".pet-presence").getAttribute("data-bamboo-phase") === "eating", "desktop panda begins eating");
  const [desktopBiteTrace, webBiteTrace] = await Promise.all([
    pet.evaluate(async () => {
      const image = document.querySelector("#panda-sprite");
      const presence = image?.closest(".pet-presence");
      const seen = [];
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        seen.push({
          frame: image?.getAttribute("data-frame"),
          sprite: image?.getAttribute("data-sprite"),
          phase: presence?.getAttribute("data-bamboo-phase"),
          stage: presence?.getAttribute("data-stage"),
          action: presence?.getAttribute("data-action"),
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          visibility: document.visibilityState,
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return seen;
    }),
    journal.evaluate(async () => {
      const image = document.querySelector(".ps-body");
      const seen = [];
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        seen.push(image?.getAttribute("data-frame"));
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return seen;
    }),
  ]);
  const desktopBiteFrames = [...new Set(desktopBiteTrace.map(sample => sample.frame))];
  const webBiteFrames = [...new Set(webBiteTrace)];
  console.log("Desktop bamboo trace:", JSON.stringify({
    first: desktopBiteTrace[0], last: desktopBiteTrace.at(-1), frames: desktopBiteFrames,
  }));
  console.log("Web bamboo frames:", webBiteFrames.join(","));
  assert.ok(desktopBiteFrames.includes("7") && desktopBiteFrames.includes("10") && desktopBiteFrames.includes("14"),
    `desktop bite animation progresses from a full stalk through visible bites to empty paws; observed frames ${desktopBiteFrames.join(",")}`);
  assert.ok(webBiteFrames.includes("7") && webBiteFrames.includes("10") && webBiteFrames.includes("14"),
    `web bite animation progresses to empty paws; observed frames ${webBiteFrames.join(",")}`);
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === "waking", "snack action transitions back to roaming");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === null, "snack action exit frames complete", 6000);
  await until(async () => await pet.locator('.pet-presence[data-stage="present"]').count() === 1, "desktop returns to roaming after eating", 6000);
  await journal.getByTestId("button-dev-action").click();
  await journal.getByTestId("button-dev-pose-sleeping").click();
  assert.match(await journal.getByTestId("dev-action-countdown").textContent(), /睡觉指令将在 2 秒后执行/, "static pose also uses the two-second countdown");
  await journal.waitForTimeout(800);
  assert.equal(await journal.getByTestId("panda-interaction-state").getAttribute("data-dev-pose"), null, "static pose does not start early");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-dev-pose") === "sleeping", "sleep pose starts after the countdown");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === "entering", "static pose uses generated entry frames");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === null, "static pose entry frames finish before holding");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-dev-pose") === null, "static pose returns to roaming after five seconds");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === "waking", "static pose uses the reversed frames to resume");
  await until(async () => await journal.getByTestId("panda-interaction-state").getAttribute("data-transition-direction") === null, "static pose wake frames finish");
  await application.evaluate(({ BrowserWindow }) => {
    const roomWindow = new BrowserWindow({
      width: 1280, height: 800, show: true,
      webPreferences: { partition: "panda-web-room-smoke", contextIsolation: true, nodeIntegration: false },
    });
    roomWindow.loadURL("http://127.0.0.1:21836/");
  });
  let webRoom;
  await until(async () => {
    for (const page of application.windows()) {
      if (page === pet || page === journal) continue;
      try {
        if (await page.evaluate(() => typeof window.pandaDesktop === "undefined")) { webRoom = page; return true; }
      } catch {}
    }
    return false;
  }, "standalone browser web room loaded");
  await webRoom.getByTestId("companion-chat").waitFor();
  await webRoom.bringToFront();
  await until(() => webRoom.evaluate(() => document.visibilityState === "visible"), "web room active for behavior checks");
  assert.equal(await webRoom.getByTestId("companion-chat").getAttribute("data-room-only"), "true");
  const welcomeBubble = webRoom.getByTestId("panda-chat-bubble");
  await welcomeBubble.waitFor();
  const roomSpeech = await welcomeBubble.textContent();
  assert.ok(roomSpeech?.trim(), "the current room message appears in the panda dialogue");
  assert.doesNotMatch(roomSpeech, /[（(][^）)]*[）)]/u, "web room hides parenthetical action asides");
  assert.equal(await webRoom.locator(".cc-room-narration").count(), 0, "no separate fixed caption covers the moving panda");
  const bubbleAnchor = await welcomeBubble.evaluate(el => {
    const bubble = el.getBoundingClientRect();
    const panda = document.querySelector(".ps-panda").getBoundingClientRect();
    return { centerOffset: (bubble.left + bubble.right) / 2 - (panda.left + panda.right) / 2,
      verticalGap: panda.top - bubble.bottom };
  });
  assert.ok(Math.abs(bubbleAnchor.centerOffset) < 1 && bubbleAnchor.verticalGap >= 7,
    "room dialogue stays centered above the moving panda rather than covering its body");
  assert.equal(await webRoom.locator('[data-testid="input-chat"], [data-testid="input-photo"], [data-testid="button-send"]').count(), 0,
    "web room does not render the old composer or message inputs");
  assert.equal(await webRoom.locator(".cc-scroll, .cc-row, .cc-bubble, .cc-composer").count(), 0,
    "web room does not render old history rows or chat bubbles");
  assert.equal(await welcomeBubble.count(), 1, "roaming welcome and follow-up text use the panda dialogue");
  await webRoom.evaluate(() => {
    window.__roomRequestCount = 0;
    window.__roomReplyAttempts = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      window.__roomRequestCount++;
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (url.includes("/api/companion/chat")) {
        window.__roomReplyAttempts++;
        if (window.__roomReplyAttempts === 1) {
          return new Response(JSON.stringify({ error: "模拟网络中断，可重试。" }), {
            status: 502, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          reply: "唔……小熊猫听到你今天有点累，会陪你坐一会儿呀。",
          userName: "", memories: [], action: "none",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(...args);
    };
  });
  const readWebRoom = () => webRoom.evaluate(() => JSON.parse(localStorage.getItem("little-panda-companion-v1") || '{"messages":[]}'));
  const journalRoom = await webRoom.evaluate(() => {
    const stage = document.querySelector(".ps-stage").getBoundingClientRect();
    const planeElement = document.querySelector(".ps-room-surface");
    const plane = planeElement.getBoundingClientRect();
    const furniture = document.querySelector('[data-testid="room-foreground-furniture"]');
    return {
      stage, plane,
      surfaceDisplay: getComputedStyle(planeElement).display,
      furnitureDisplay: getComputedStyle(furniture).display,
      roomLayers: [...planeElement.children].map((layer) => layer.className),
      width: innerWidth, height: innerHeight,
      night: planeElement.dataset.night === "true"
    };
  });
  assert.ok(Math.abs(journalRoom.stage.width - journalRoom.width) < 2 && Math.abs(journalRoom.stage.height - journalRoom.height) < 2,
    "journal room stage fills the browser viewport");
  assert.equal(journalRoom.surfaceDisplay, "none", "unconfigured room background stays hidden");
  assert.equal(journalRoom.furnitureDisplay, "none", "unconfigured room furniture stays hidden");
  assert.equal(journalRoom.plane.width, 0, "hidden room scene does not define the movement area");
  assert.deepEqual(journalRoom.roomLayers, ["ps-room-backdrop", "ps-room-floor"]);
  assert.equal(journalRoom.night, false, "web interaction smoke test uses the user's Hong Kong daytime");
  await webRoom.emulateMedia({ reducedMotion: "no-preference" });
  if (!journalRoom.night) {
    const journalWalkBounds = await webRoom.evaluate(async () => {
      const track = document.querySelector(".ps-track");
    const points = [];
    const started = performance.now();
      while (performance.now() - started < 9500) {
        points.push({
          x: Number(track.dataset.roomU),
          y: Number(track.dataset.roomV),
          projectedX: Number.parseFloat(track.style.getPropertyValue("--room-x")),
          projectedY: Number.parseFloat(track.style.getPropertyValue("--room-y")),
          scale: Number(track.dataset.roomScale),
          sprite: document.querySelector(".ps-body").dataset.sprite });
        await new Promise(resolve => setTimeout(resolve, 45));
      }
      return {
        xSpan: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
        ySpan: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
        scaleSpan: Math.max(...points.map(p => p.scale)) - Math.min(...points.map(p => p.scale)),
        maxScreenProjectionError: Math.max(...points.map(p => Math.max(Math.abs(p.projectedX - p.x * 100), Math.abs(p.projectedY - p.y * 100)))),
        sawWalking: points.some(p => p.sprite === "walk"),
        sawResting: points.some(p => p.sprite === "idle"),
      };
    });
    assert.ok(journalWalkBounds.xSpan > 0.01 && journalWalkBounds.ySpan > 0.01, "journal pet moves in both room-plane axes");
    assert.ok(journalWalkBounds.maxScreenProjectionError < 0.05, "journal pet maps its roam coordinates across the full screen");
    assert.ok(journalWalkBounds.scaleSpan < 0.001, "room pet keeps the same minimum size at every depth");
    assert.ok(journalWalkBounds.sawWalking && journalWalkBounds.sawResting, "room pet alternates between walking and resting");
  }

  const webPandaButton = webRoom.getByTestId("button-panda");
  const webInteraction = webRoom.getByTestId("panda-interaction-state");
  const webPosition = webRoom.getByTestId("panda-room-position");
  const webBathtub = webRoom.getByTestId("room-bathtub");
  assert.equal(await webBathtub.count(), 1, "the web room includes one decorative bathtub");
  await until(async () => await webBathtub.evaluate(el => el.complete && el.naturalWidth === 128),
    "the bathtub sprite loads");
  const bathtubBox = await webBathtub.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      naturalWidth: el.naturalWidth,
      pointerEvents: getComputedStyle(el).pointerEvents,
    };
  });
  const webViewport = await webRoom.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(bathtubBox.left > webViewport.width * 0.65 && bathtubBox.right <= webViewport.width,
    "the bathtub stays on the right side and fully inside the viewport");
  assert.equal(bathtubBox.naturalWidth, 128, "the pixel bathtub image loads at its native width");
  assert.equal(bathtubBox.pointerEvents, "none", "the decorative bathtub does not steal pet or chat clicks");
  const pandaBeforeBath = await webPandaButton.boundingBox();
  const tubTarget = await webBathtub.boundingBox();
  assert.ok(pandaBeforeBath && tubTarget, "the panda and bathtub are present for the bath interaction");
  const pandaBodyBeforeBath = await webRoom.locator(".ps-body").boundingBox();
  const bathtubWidthBeforeBath = tubTarget.width;
  await webRoom.mouse.move(pandaBeforeBath.x + pandaBeforeBath.width / 2, pandaBeforeBath.y + pandaBeforeBath.height / 2);
  await webRoom.mouse.down();
  await webRoom.waitForTimeout(480);
  await webRoom.mouse.move(tubTarget.x + tubTarget.width / 2, tubTarget.y + tubTarget.height * 0.78, { steps: 5 });
  await webRoom.mouse.up();
  await until(async () => await webPandaButton.getAttribute("data-bath-state") === "falling",
    "dropping the panda over the bathtub starts the bath entry");
  await until(async () => {
    if (await webPandaButton.getAttribute("data-bath-state") !== "bathing") return false;
    return await Promise.all([
      webBathtub.evaluate(el => el.complete && el.naturalWidth === 128
        && el.currentSrc.includes("pet-bathtub.png")),
      webRoom.locator(".ps-body").evaluate(el => {
        const image = el;
        return image.complete && image.naturalWidth === 96
          && image.dataset.sprite === "bathing"
          && image.currentSrc.includes("/static/panda/bathing-wash/");
      }),
    ]).then(([tubIsUnchanged, pandaBathSpriteLoaded]) => tubIsUnchanged && pandaBathSpriteLoaded);
  }, "the panda bath animation loads while the original bathtub remains unchanged");
  const pandaBodyInBath = await webRoom.locator(".ps-body").boundingBox();
  const bathtubWidthInBath = await webBathtub.evaluate(el => el.getBoundingClientRect().width);
  assert.ok(pandaBodyBeforeBath && pandaBodyInBath, "the panda remains visible in the bathing pose");
  assert.ok(Math.abs(pandaBodyInBath.width - pandaBodyBeforeBath.width) < 0.1,
    "the panda keeps the same displayed size while bathing");
  assert.ok(Math.abs(bathtubWidthInBath - bathtubWidthBeforeBath) < 0.1,
    "the bathtub keeps its original displayed size while bathing");
  const bathBox = webRoom.getByTestId("bath-ball-box");
  await bathBox.waitFor();
  const bathBoxBounds = await bathBox.boundingBox();
  const bathtubBounds = await webBathtub.boundingBox();
  assert.ok(bathBoxBounds && bathtubBounds, "the bath-ball box is beside the bathtub");
  assert.ok(bathBoxBounds.x + bathBoxBounds.width < bathtubBounds.x,
    "the bath-ball box does not overlap the bathtub");
  const bathBall = webRoom.getByTestId("bath-ball");
  await until(async () => await bathBall.count() === 0,
    "the bath puff stays in its box until the user takes it out");
  await bathBox.click();
  await bathBall.waitFor();
  await until(async () => await bathBall.getAttribute("data-dropping") === "true"
      && await bathBall.evaluate(el => getComputedStyle(el).animationName === "ps-bath-ball-drop"),
    "clicking the box makes the bath puff drop out with a bounce");
  await until(async () => await bathBall.getAttribute("data-dropping") === "false",
    "the bath puff settles beside the bathtub before it is dragged");
  await until(() => bathBall.evaluate(el => el.querySelector("img")?.naturalWidth === 48),
    "the draggable bath puff sprite loads");
  const bathBallBox = await bathBall.boundingBox();
  const bathPandaBox = await webPandaButton.boundingBox();
  assert.ok(bathBallBox && bathPandaBox, "bath puff and panda hit target are visible");
  await webRoom.mouse.move(bathBallBox.x + bathBallBox.width / 2, bathBallBox.y + bathBallBox.height / 2);
  await webRoom.mouse.down();
  await webRoom.mouse.move(bathPandaBox.x + bathPandaBox.width / 2, bathPandaBox.y + bathPandaBox.height / 2, { steps: 5 });
  await until(async () => await webPandaButton.getAttribute("data-bath-rubbing") === "true",
    "the rubbing animation starts as soon as the bath puff touches the panda");
  await until(async () => webRoom.locator(".ps-body").evaluate(el =>
    el.currentSrc.includes("/static/panda/bathing-soap/")),
  "touching the panda switches to the separate PixelLab soap-washing frames");
  assert.equal(await webRoom.locator(".ps-bath-foam i").count(), 4,
    "visible soap bubbles appear while the puff touches the panda");
  assert.equal(await webRoom.locator(".ps-body").evaluate(el => getComputedStyle(el).animationName),
    "ps-bath-scrub", "the panda visibly moves its body while soaping");
  await webRoom.mouse.up();
  await until(async () => await bathBall.getAttribute("data-on-panda") === "true",
    "the bath puff can be placed on the panda");
  assert.equal(await webPandaButton.getAttribute("data-bath-state"), "bathing",
    "the panda stays in the tub until the user lifts it");
  assert.equal(await webPandaButton.getAttribute("data-bath-rubbing"), "true",
    "placing the bath puff keeps the separate soap-washing animation active");
  const placedBallBox = await bathBall.boundingBox();
  assert.ok(placedBallBox, "the bath puff remains available on the panda");
  const placedBallCenterX = placedBallBox.x + placedBallBox.width / 2;
  const placedBallCenterY = placedBallBox.y + placedBallBox.height / 2;
  await webRoom.mouse.move(placedBallCenterX, placedBallCenterY);
  await webRoom.mouse.down();
  await webRoom.mouse.move(48, 48, { steps: 5 });
  await until(async () => await webPandaButton.getAttribute("data-bath-rubbing") === "false",
    "moving the bath puff away stops the soap-washing animation");
  await webRoom.mouse.up();
  await until(async () => webRoom.locator(".ps-body").evaluate(el =>
    el.currentSrc.includes("/static/panda/bathing-wash/")),
  "the panda returns to its ordinary bathing animation after the puff is moved away");
  const bathingPosition = await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV }));
  await webRoom.waitForTimeout(450);
  assert.notEqual(await webRoom.locator(".ps-body").getAttribute("data-frame"), "0",
    "the bathing pose advances through its animation frames");
  assert.deepEqual(await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV })), bathingPosition,
    "the panda remains still while bathing");
  const pandaInBath = await webPandaButton.boundingBox();
  assert.ok(pandaInBath, "the panda can still be picked up while bathing");
  await webRoom.mouse.move(pandaInBath.x + pandaInBath.width * 0.22, pandaInBath.y + pandaInBath.height * 0.66);
  await webRoom.mouse.down();
  await webRoom.waitForTimeout(480);
  await webRoom.mouse.move(webViewport.width * 0.52, webViewport.height * 0.55, { steps: 5 });
  await webRoom.mouse.up();
  await until(async () => await webPandaButton.getAttribute("data-bath-state") === "none",
    "lifting the panda out of the bathtub restores roaming");
  await webRoom.waitForTimeout(160);
  console.info("PASS bathtub drop, persistent bathing pose, draggable bath puff and lift-to-exit");
  const webBed = webRoom.getByTestId("room-bed");
  await webBed.waitFor();
  await until(() => webBed.evaluate(el => el.complete && el.naturalWidth > 0 && el.naturalHeight > 0),
    "the standalone pet bed image loads");
  const bedBounds = await webBed.boundingBox();
  assert.ok(bedBounds && bedBounds.x + bedBounds.width / 2 < webViewport.width / 2,
    "the standalone pet bed is positioned in the left half of the room");
  const pandaBeforeBed = await webPandaButton.boundingBox();
  assert.ok(pandaBeforeBed, "the panda is available to drag to its bed");
  await webRoom.mouse.move(pandaBeforeBed.x + pandaBeforeBed.width / 2, pandaBeforeBed.y + pandaBeforeBed.height / 2);
  await webRoom.mouse.down();
  await webRoom.waitForTimeout(480);
  await webRoom.mouse.move(bedBounds.x + bedBounds.width / 2, bedBounds.y + bedBounds.height * 0.55, { steps: 5 });
  await webRoom.mouse.up();
  await until(async () => await webPandaButton.getAttribute("data-sleeping-on-bed") === "true"
      && await webPandaButton.getAttribute("data-activity-state") === "sleeping",
    "dropping the panda on its bed makes it enter sleep");
  await until(async () => await webPandaButton.evaluate(el =>
    el.classList.contains("ps-sleeping") && !el.classList.contains("ps-pixel-transition")),
  "the bed sleep transition completes into the sleeping pose");
  assert.equal(await webRoom.locator(".ps-sleep-zzz").count(), 1,
    "the panda shows its sleep marks on the bed");
  await webRoom.waitForTimeout(900);
  assert.equal(await webPandaButton.getAttribute("data-sleeping-on-bed"), "true",
    "the user-triggered bed sleep does not end on the short random-rest timer");
  const pandaOnBed = await webPandaButton.boundingBox();
  assert.ok(pandaOnBed, "the sleeping panda remains draggable");
  await webRoom.mouse.move(pandaOnBed.x + pandaOnBed.width / 2, pandaOnBed.y + pandaOnBed.height / 2);
  await webRoom.mouse.down();
  await webRoom.waitForTimeout(480);
  await webRoom.mouse.move(webViewport.width * 0.68, webViewport.height * 0.55, { steps: 5 });
  await webRoom.mouse.up();
  await until(async () => await webPandaButton.getAttribute("data-sleeping-on-bed") === "false"
      && await webPandaButton.getAttribute("data-activity-state") === "roaming",
    "lifting the panda off the bed wakes it and restores roaming");
  console.info("PASS standalone pet bed, drop-to-sleep and lift-to-wake");
  const requestsBeforePandaClicks = await webRoom.evaluate(() => window.__roomRequestCount);
  const messagesBeforePandaClicks = (await readWebRoom()).messages.length;
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming");
  await webPandaButton.click();
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming", "one click does not enter chat");
  assert.equal(await webPandaButton.getAttribute("data-reacting"), "true", "one click starts a short reaction");
  assert.equal(await webRoom.getByTestId("panda-click-debug").count(), 0, "the temporary click diagnostic stays hidden");
  await webRoom.waitForTimeout(1500);
  assert.equal(await webPandaButton.getAttribute("data-reacting"), null, "the short reaction ends");
  await webPandaButton.click();
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "chat", "a second click within three seconds enters chat");
  await webRoom.getByTestId("input-chat").waitFor();
  const roomComposer = webRoom.getByTestId("room-chat-composer");
  assert.equal(await roomComposer.count(), 1, "chat state shows the compact room composer");
  assert.equal(await webRoom.locator(".cc-top, .cc-scroll, .cc-row, .cc-bubble").count(), 0,
    "chat state hides the large panel and all visible history");
  assert.equal(await roomComposer.locator("textarea").count(), 1, "room composer has one text field");
  assert.equal(await roomComposer.locator("button").count(), 1, "room composer has one send button");
  assert.equal(await roomComposer.locator("input, textarea, button").count(), 2,
    "room composer contains only the text field and send button");
  assert.equal(await webRoom.locator('[data-testid="input-photo"], [data-testid="button-attach-photo"]').count(), 0,
    "room chat has no photo controls");
  assert.equal(await webRoom.getByTestId("panda-chat-bubble").count(), 0,
    "no reply bubble appears before the user sends a message");
  assert.equal(await webRoom.getByTestId("panda-click-debug").count(), 0, "the temporary debug panel stays hidden beside the composer");
  const frozenPosition = await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV }));
  await webRoom.waitForTimeout(650);
  assert.deepEqual(await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV })), frozenPosition,
    "room movement pauses in chat state");
  assert.equal((await readWebRoom()).messages.length, messagesBeforePandaClicks, "panda clicks do not add chat messages");
  assert.equal(await webRoom.evaluate(() => window.__roomRequestCount), requestsBeforePandaClicks,
    "panda clicks do not call the AI provider");
  const roomInput = webRoom.getByTestId("input-chat");
  await roomInput.fill("今天有点累。");
  await roomInput.press("Shift+Enter");
  assert.equal(await roomInput.inputValue(), "今天有点累。\n",
    "Shift+Enter inserts a newline in the compact input");
  await roomInput.type("有点想被抱抱。");
  await roomInput.press("Enter");
  const pandaReplyBubble = webRoom.getByTestId("panda-chat-bubble");
  await until(async () => (await pandaReplyBubble.count()) === 1
    && (await pandaReplyBubble.textContent()).includes("模拟网络中断"),
  "an AI service failure is shown above the panda instead of disappearing", 12000);
  assert.equal(await roomInput.inputValue(), "今天有点累。\n有点想被抱抱。",
    "the failed message stays in the input for a one-tap retry");
  await roomInput.press("Enter");
  await until(async () => (await roomInput.inputValue()) === "", "retried text clears from the compact input");
  await until(async () => (await pandaReplyBubble.count()) === 1
    && (await pandaReplyBubble.textContent()).includes("陪你坐一会儿"),
  "the assistant reply appears above the panda after retry", 12000);
  assert.equal(await webRoom.locator(".cc-scroll, .cc-row, .cc-bubble").count(), 0,
    "sent messages and replies stay out of a visible history list");
  const roomMessagesAfterReply = (await readWebRoom()).messages.length;
  const roomRequestsAfterReply = await webRoom.evaluate(() => window.__roomRequestCount);
  await webRoom.getByTestId("companion-chat").evaluate(el => el.dispatchEvent(new MouseEvent("click", {
    bubbles: true, cancelable: true, clientX: innerWidth - 8, clientY: innerHeight / 2,
  })));
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming", "blank room click exits chat");
  await until(async () => (await webRoom.locator(".cc-room-composer").count()) === 0
    && (await pandaReplyBubble.count()) === 1
    && (await pandaReplyBubble.textContent()).includes("陪你坐一会儿"),
  "chat closes and the latest assistant reply returns to the panda dialogue");

  await webPandaButton.click();
  await webRoom.waitForTimeout(3100);
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming");
  await webPandaButton.click();
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming",
    "a click after three seconds starts a new first-click reaction");
  assert.equal(await webPandaButton.getAttribute("data-reacting"), "true");
  await webRoom.waitForTimeout(3100);

  const rapidClickBox = await webPandaButton.boundingBox();
  await webRoom.mouse.dblclick(rapidClickBox.x + rapidClickBox.width / 2, rapidClickBox.y + rapidClickBox.height / 2, { delay: 120 });
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "chat",
    "a browser double-click enters chat during the first reaction");
  await webRoom.getByTestId("input-chat").waitFor();
  assert.equal(await webRoom.locator(".cc-room-composer").count(), 1,
    "native browser double-click also shows the compact input");
  await webRoom.getByTestId("companion-chat").evaluate(el => el.dispatchEvent(new MouseEvent("click", {
    bubbles: true, cancelable: true, clientX: innerWidth - 8, clientY: innerHeight / 2,
  })));
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming",
    "blank room click exits after a browser double-click");

  await webPandaButton.evaluate(el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 })));
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "chat",
    "the browser's second-click signal can enter chat without the first click timestamp");
  await webRoom.getByTestId("companion-chat").evaluate(el => el.dispatchEvent(new MouseEvent("click", {
    bubbles: true, cancelable: true, clientX: innerWidth - 8, clientY: innerHeight / 2,
  })));
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming");

  await webPandaButton.click();
  await webPandaButton.click();
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "chat");
  await webRoom.waitForTimeout(30100);
  assert.equal(await webInteraction.getAttribute("data-interaction-state"), "roaming",
    "thirty seconds without input exits chat");
  await until(async () => (await webRoom.locator(".cc-room-composer").count()) === 0,
    "chat composer disappears after idle timeout");
  assert.equal(await webRoom.getByTestId("panda-chat-bubble").count(), 1,
    "the latest assistant message remains in the same panda dialogue after chat closes");
  const positionAfterTimeout = await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV }));
  await until(async () => {
    const current = await webPosition.evaluate(el => ({ u: el.dataset.roomU, v: el.dataset.roomV }));
    return current.u !== positionAfterTimeout.u || current.v !== positionAfterTimeout.v;
  }, "web panda resumes roaming after the chat timeout", 4000);

  await until(async () => await webPandaButton.evaluate(el => el.classList.contains("ps-walking")),
    "web panda starts a route before the world-fall event check", 5000);
  await webRoom.evaluate(() => {
    window.__savedWorldFallRandom = Math.random;
    const rolls = [0.8, 0.05];
    Math.random = () => rolls.length ? rolls.shift() : 0.5;
  });
  await until(async () => await webInteraction.getAttribute("data-world-fall-state") === "falling",
    "random route event begins the world fall", 20000);
  await webRoom.evaluate(() => {
    if (window.__savedWorldFallRandom) Math.random = window.__savedWorldFallRandom;
    delete window.__savedWorldFallRandom;
  });
  assert.equal((await webRoom.getByTestId("panda-world-fall-message").textContent()).trim(), "掉出去啦！",
    "the fall leaves the requested short message");
  assert.equal(await webPandaButton.evaluate(el => getComputedStyle(el).animationName), "ps-world-fall",
    "the falling panda rotates and shrinks out of the room");
  await until(async () => await webInteraction.getAttribute("data-world-fall-state") === "away",
    "the panda disappears after falling");
  await until(async () => await webPandaButton.count() === 0,
    "the panda stays outside the room after its message fades");
  await until(async () => await webInteraction.getAttribute("data-world-fall-state") === "returning",
    "the panda crawls back after five seconds", 8000);
  const dirtyReturnBody = webPandaButton.locator(".ps-body");
  assert.equal(await dirtyReturnBody.getAttribute("data-sprite"), "dirty-return",
    "the panda returns with the PixelLab dirty and crying sprite");
  await until(async () => await dirtyReturnBody.evaluate(img => img.complete && img.naturalWidth === 96),
    "the PixelLab return sprite finishes loading");
  assert.equal(await dirtyReturnBody.evaluate(img => img.naturalWidth), 96,
    "the PixelLab return sprite loads at its native pixel dimensions");
  await until(async () => await webInteraction.getAttribute("data-world-fall-state") === "dirty",
    "the dirty crying pose remains after its return animation");
  await webRoom.waitForTimeout(6200);
  assert.equal(await webInteraction.getAttribute("data-world-fall-state"), "dirty",
    "the panda stays dirty until the player washes it");

  const shortGrabBox = await webPandaButton.boundingBox();
  const shortGrabX = shortGrabBox.x + shortGrabBox.width / 2;
  const shortGrabY = shortGrabBox.y + shortGrabBox.height / 2;
  await webRoom.mouse.move(shortGrabX, shortGrabY);
  await webRoom.mouse.down();
  await until(async () => await webInteraction.getAttribute("data-dragging") === "true",
    "mouse hold lifts the web panda before the short-drag check");
  await webRoom.mouse.move(shortGrabX + 18, shortGrabY + 12, { steps: 2 });
  await webRoom.mouse.up();
  assert.equal(await webPandaButton.getAttribute("data-dizzy-state"), "none",
    "an ordinary short grab and release does not trigger dizziness");

  const wildGrabBox = await webPandaButton.boundingBox();
  const wildGrabX = wildGrabBox.x + wildGrabBox.width / 2;
  const wildGrabY = wildGrabBox.y + wildGrabBox.height / 2;
  await webRoom.mouse.move(wildGrabX, wildGrabY);
  await webRoom.mouse.down();
  await until(async () => await webInteraction.getAttribute("data-dragging") === "true",
    "second long hold begins the dizzy-trigger drag");
  const circleSteps = 44;
  for (let step = 1; step <= circleSteps; step += 1) {
    const angle = step / circleSteps * Math.PI * 5;
    await webRoom.mouse.move(wildGrabX + Math.cos(angle) * 50, wildGrabY + Math.sin(angle) * 50);
    await webRoom.waitForTimeout(50);
  }
  assert.equal(await webPandaButton.getAttribute("data-dizzy-state"), "none",
    "dizziness waits until the panda is released");
  await webRoom.mouse.up();
  await until(async () => await webPandaButton.getAttribute("data-dizzy-state") === "falling",
    "two seconds of continuous circling trigger the drop only on release");
  await until(async () => await webPandaButton.getAttribute("data-dizzy-state") === "dazed",
    "the generated fall animation ends in a seated dizzy pose", 5000);
  assert.equal(await webPandaButton.locator(".ps-body").getAttribute("data-frame"), "8",
    "the final dizzy-eye sprite frame is held while the panda sits");
  assert.equal(await webPandaButton.locator(".ps-body").evaluate(img => img.naturalWidth), 96,
    "the generated dizzy sprite frame loads at its native pixel dimensions");
  await until(async () => await webPandaButton.getAttribute("data-dizzy-state") === "none",
    "the dizzy pause ends automatically", 5000);
  await until(async () => await webPandaButton.evaluate(el => el.classList.contains("ps-walking")),
    "roaming resumes after the dizzy pose", 7000);

  assert.equal((await readWebRoom()).messages.length, roomMessagesAfterReply);
  assert.equal(await webRoom.evaluate(() => window.__roomRequestCount), roomRequestsAfterReply);
  console.info("PASS compact web chat composer, head reply bubble, no history panel, click/timeout exits");
  await webRoom.close();

  await journal.emulateMedia({ reducedMotion: "reduce" });
  console.info("PASS native transparency, hit testing, single/double click and integrated chat");

  await journal.getByTestId("input-chat").fill("我叫小乐，唱歌唱了很久很累，明天要继续练习。");
  await journal.getByTestId("input-photo").setInputFiles({ name: "local.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#89a78b"/></svg>') });
  await until(() => journal.getByTestId("button-send").isEnabled(), "local photo processed");
  await journal.getByTestId("button-send").click();
  await until(async () => (await read()).userName === "小乐", "name and answer saved");
  await new Promise(resolve => setTimeout(resolve, 2300));
  assert.equal(await journalVisible(), true, "chat must not auto-collapse after send");
  assert.match((await read()).messages.find(m => m.role === "user").photo, /^data:image\/jpeg/);
  await journal.getByTestId("input-chat").fill("唱完之后嗓子有点酸。");
  await journal.getByTestId("button-send").click();
  await until(() => journal.getByText(/唱完以后嗓子酸了/).isVisible(), "contextual second answer");
  const requests = await application.evaluate(() => globalThis.__requests);
  assert.ok(requests[1].messages.some(m => m.role === "user" && m.content.includes("我叫小乐")));
  assert.ok(requests[1].messages.some(m => m.role === "assistant" && m.content.includes("坐会儿")));
  assert.ok(!JSON.stringify(requests).includes("data:image"));
  assert.equal((await read()).diary.length, 2);
  await application.evaluate(() => { globalThis.__fail = true; });
  await journal.getByTestId("input-chat").fill("模拟断线仍保留这条话。");
  await journal.getByTestId("button-send").click();
  await journal.getByTestId("button-retry").waitFor();
  await journal.reload();
  await journal.getByTestId("button-retry").waitFor();
  assert.equal((await read()).messages.filter(m => m.text === "模拟断线仍保留这条话。").length, 1);
  await application.evaluate(() => { globalThis.__fail = false; });
  await journal.getByTestId("button-retry").click();
  await until(async () => (await read()).messages.filter(m => m.role === "user").at(-1).status === "sent", "retry saved once");
  await journal.getByTestId("button-diary").click();
  await journal.getByTestId("dialog-diary").waitFor();
  assert.equal(await journal.getByText("明天继续练习唱歌", { exact: true }).count(), 1);
  await journal.getByTestId("dialog-diary-close").click();
  fs.mkdirSync(path.join(workspace, "screenshots"), { recursive: true });
  await journal.screenshot({ path: path.join(workspace, "screenshots/panda-companion-desktop.png") });
  await journal.getByTestId("button-hide-chat").click();
  await until(async () => !(await journalVisible()), "chat collapses without quitting");
  console.info("PASS continuous context, local photos, local history, diary, failure/retry and no automatic collapse");

  await seed(() => {
    const s = JSON.parse(localStorage.getItem("little-panda-companion-v1"));
    s.lastUserAt = Date.now() - 6 * 60_000; s.nextIdleAt = Date.now() - 1; s.proactiveCount = 0; s.nextTripAt = Date.now() + 40 * 60_000;
    localStorage.setItem("little-panda-companion-v1", JSON.stringify(s));
  });
  await until(async () => (await read()).proactiveCount === 1, "hidden window proactive clock");
  await seed(() => {
    const s = JSON.parse(localStorage.getItem("little-panda-companion-v1"));
    s.diary[0].createdAt = Date.now() - 2 * 86400000 - 1; delete s.diary[0].followedUpAt; s.nextIdleAt = Date.now() - 1;
    s.messages.push({ id: "answered-proactive", role: "user", text: "今天有排练。", createdAt: Date.now() });
    localStorage.setItem("little-panda-companion-v1", JSON.stringify(s));
  });
  await until(async () => (await read()).diary[0].followedUpAt > 0, "two day follow-up");
  await seed(() => {
    const s = JSON.parse(localStorage.getItem("little-panda-companion-v1"));
    s.nextIdleAt = Date.now() + 20 * 60_000; s.nextTripAt = Date.now() - 1;
    localStorage.setItem("little-panda-companion-v1", JSON.stringify(s));
  });
  await until(async () => !!(await read()).trip && !(await nativePet()).visible, "real pet disappears for excursion");
  const trip = (await read()).trip;
  assert.ok(trip.returnAt - Date.now() > 25_000 && trip.returnAt - Date.now() <= 120_000);
  await seed(() => {
    const s = JSON.parse(localStorage.getItem("little-panda-companion-v1"));
    s.trip.returnAt = Date.now() - 1; localStorage.setItem("little-panda-companion-v1", JSON.stringify(s));
  });
  await until(async () => !!(await read()).pendingGift && (await nativePet()).visible, "gift waits for collection and pet crawls back");
  const giftPage = application.windows().find(p => p.url().includes("gift.html")) || await application.waitForEvent("window");
  await giftPage.locator("#gift-button").click();
  assert.equal((await read()).gifts.length, 0);
  await until(async () => (await read()).gifts.length === 1 && !(await read()).pendingGift, "gift stored after its squishy animation");
  await until(() => pet.locator('.pet-presence[data-stage="present"]').count().then(n => n === 1), "crawl completed", 6000);
  console.info("PASS background proactive message, specific two-day follow-up, excursion and one stored gift");

  await journal.emulateMedia({ reducedMotion: "no-preference" });
  await pet.evaluate(() => window.pandaDesktop.openJournal());
  await until(journalVisible, "chat reopened before native close checks");
  const animation = { stage: "performing", action: "jump", duration: 2000, token: Date.now() };
  await pet.emulateMedia({ reducedMotion: "no-preference" });
  await journal.evaluate(effect => window.pandaDesktop.companionMotion(effect), animation);
  await new Promise(resolve => setTimeout(resolve, 200));
  const fromX = (await nativePet()).bounds.x;
  await until(async () => await pet.locator("#panda-sprite").getAttribute("data-sprite") === animationManifest.actionSprites.jump, "jump sprite selected");
  const firstJumpFrame = await pet.locator("#panda-sprite").getAttribute("data-frame");
  await until(async () => await pet.locator("#panda-sprite").getAttribute("data-frame") !== firstJumpFrame, "jump frames advance");
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal((await nativePet()).bounds.x, fromX, "room window stays fixed while the panda jumps inside the floor");
  const bounds = await pet.evaluate(() => {
    const stage = document.querySelector(".pet-stage").getBoundingClientRect();
    const floorTop = stage.bottom - 86;
    const panda = document.querySelector("#panda").getBoundingClientRect();
    const sprite = document.querySelector("#panda-sprite").getBoundingClientRect();
    return {
      stage: { left: stage.left, right: stage.right },
      floorTop,
      panda: { left: panda.left, right: panda.right },
      spriteBottom: sprite.bottom,
    };
  });
  assert.ok(bounds.panda.left >= bounds.stage.left && bounds.panda.right <= bounds.stage.right, "animated panda stays inside the desktop room");
  assert.ok(bounds.spriteBottom <= bounds.floorTop + 4, "animated panda sprite stays above the floor");
  await journal.evaluate(() => window.pandaDesktop.companionMotion({ stage: "present", action: "idle", duration: 3000, token: Date.now() }));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !/pet.html|gift.html/.test(w.webContents.getURL())).close());
  await until(async () => !(await journalVisible()), "native close hides");
  await pet.evaluate(() => window.pandaDesktop.openJournal()); await until(journalVisible, "native reopening");
  await journal.getByTestId("button-gifts").click(); await journal.getByTestId("dialog-gifts").waitFor();
  assert.equal(await journal.locator(".cc-gift").count(), 1);
  console.info("PASS native action motion, closed-room bounds, close/reopen and gift viewer");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (application) await application.close(); fs.rmSync(profile, { recursive: true, force: true });
});
