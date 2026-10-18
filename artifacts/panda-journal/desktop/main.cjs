"use strict";
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, dialog } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { classify } = require("./ai.cjs");
const { chat } = require("@workspace/companion-ai");
const createTrayIcon = require("./tray-icon.cjs");
const {
  clampWindowOrigin,
  parseWindowScanOutput,
  transparentPetOptions,
  windowScanCommand,
} = require("./pet-window.cjs");

app.setName("小熊猫日记");
if (process.env.PANDA_PROFILE_DIR) app.setPath("userData", path.resolve(process.env.PANDA_PROFILE_DIR));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const development = process.argv.includes("--dev");
let petWindow, journalWindow, giftWindow, tray;
let giftState, giftRegion, giftIgnored = true;
let quitting = false;
let hitRegions = [];
let ignored = true;
let motion = "idle";
let roam = null;
let restUntil = Date.now() + 5000;
let tick;
let saveTimer;
let companionEffect = { stage: "present", action: "idle", duration: 3000, token: 0 };
let chatCalls = [];
let desktopWindowRects = [];
let obstaclePollTimer;
let obstaclePollInFlight = false;
let obstacleScanWarned = false;
let obstacleScanFailed = false;
let journalWasVisible = false;
let petOnTop = true;
let userPinned = false;
let userDragging = false;
let savedRoom = null;
let savedBounds = null;
let menu;
let settingsTimer;
const windowedPetWidth = 340, windowedPetHeight = 360;
const fullDesktopMode = process.platform === "win32" && !process.env.REPL_ID;
const useInlineGift = process.platform === "linux" && Boolean(process.env.REPL_ID);

function settingsFile() {
  return path.join(app.getPath("userData"), "pet-settings.json");
}

function loadSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    if (typeof value.alwaysOnTop === "boolean") petOnTop = value.alwaysOnTop;
    if (typeof value.pinned === "boolean") userPinned = value.pinned;
    if (value.room && Number.isFinite(value.room.u) && Number.isFinite(value.room.v)) {
      savedRoom = { u: Math.min(1, Math.max(0, value.room.u)), v: Math.min(1, Math.max(0, value.room.v)) };
    }
    if (value.bounds && [value.bounds.x, value.bounds.y, value.bounds.width, value.bounds.height].every(Number.isFinite)) {
      savedBounds = value.bounds;
    }
  } catch {
    // 第一次打开没有设置文件。
  }
}

function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
      fs.writeFileSync(settingsFile(), JSON.stringify({
        alwaysOnTop: petOnTop, pinned: userPinned, room: savedRoom, bounds: savedBounds,
      }));
    } catch (error) {
      console.warn("无法保存桌宠位置：", error.message);
    }
  }, 200);
}

function journalIsOpen() {
  return Boolean(journalWindow && !journalWindow.isDestroyed() && journalWindow.isVisible() && !journalWindow.isMinimized());
}

// 全屏透明层如果停在 screen-saver 级，日记窗口永远被压在下面。
function applyLayering() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const journalOpen = journalIsOpen();
  if (!petOnTop) {
    petWindow.setAlwaysOnTop(false);
    if (journalWindow && !journalWindow.isDestroyed()) journalWindow.setAlwaysOnTop(false);
    if (journalOpen) journalWindow.moveTop();
    return;
  }
  if (journalOpen) {
    petWindow.setAlwaysOnTop(true, "floating");
    journalWindow.setAlwaysOnTop(true, "screen-saver");
    journalWindow.moveTop();
    return;
  }
  if (journalWindow && !journalWindow.isDestroyed()) journalWindow.setAlwaysOnTop(false);
  petWindow.setAlwaysOnTop(true, "screen-saver");
}

function refreshTray() {
  menu = Menu.buildFromTemplate([
    { label: "打开小熊猫聊天", click: () => openJournal() },
    { label: "显示小熊猫", click: () => {
      if (!petWindow || petWindow.isDestroyed() || ["fallen", "away"].includes(companionEffect.stage)) return;
      petWindow.showInactive();
      petWindow.moveTop();
      applyLayering();
    } },
    { type: "separator" },
    { label: petOnTop ? "取消置顶" : "窗口置顶", click: () => { petOnTop = !petOnTop; applyLayering(); saveSettings(); refreshTray(); } },
    { label: userPinned ? "继续闲逛" : "停在这里", click: () => {
      userPinned = !userPinned;
      roam = null;
      if (userPinned) setMotion("idle");
      else restUntil = Date.now() + 400;
      saveSettings();
      refreshTray();
    } },
    { type: "separator" },
    { label: "退出桌宠", click: () => app.quit() },
  ]);
  if (tray && !tray.isDestroyed()) tray.setContextMenu(menu);
}

function sendPet(channel, value) {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send(channel, value);
}

function clipToWorkArea(rect, area, scaleFactor = 1) {
  const x = rect.x / scaleFactor - area.x;
  const y = rect.y / scaleFactor - area.y;
  const right = Math.min(area.width, x + rect.width / scaleFactor);
  const bottom = Math.min(area.height, y + rect.height / scaleFactor);
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function collectDesktopObstacles() {
  if (!fullDesktopMode) return [];
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  // 扫不到其他窗口时继续闲逛，只避开日记和礼物。整屏封死会让桌宠看起来坏掉。
  const obstacles = obstacleScanFailed ? [] : desktopWindowRects
    .map((rect) => clipToWorkArea(rect, area, display.scaleFactor || 1))
    .filter(Boolean);
  for (const window of [journalWindow, giftWindow]) {
    if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized()) continue;
    const rect = window.getBounds();
    const local = clipToWorkArea(rect, area);
    if (local) obstacles.push(local);
  }
  return obstacles;
}

function publishDesktopObstacles() {
  sendPet("desktop:obstacles", collectDesktopObstacles());
}

function pollDesktopWindows() {
  if (!fullDesktopMode || obstaclePollInFlight || !petWindow || petWindow.isDestroyed()) return;
  obstaclePollInFlight = true;
  execFile("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", windowScanCommand(process.pid),
  ], { windowsHide: true, timeout: 2500, maxBuffer: 256 * 1024, encoding: "buffer" }, (error, stdout) => {
    obstaclePollInFlight = false;
    try {
      if (error) throw error;
      desktopWindowRects = parseWindowScanOutput(stdout);
      obstacleScanFailed = false;
      obstacleScanWarned = false;
    } catch {
      obstacleScanFailed = true;
      desktopWindowRects = [];
      if (!obstacleScanWarned) {
        obstacleScanWarned = true;
        console.warn("读取桌面窗口范围失败；小熊猫会继续活动，但暂时不会避开其他窗口。");
      }
    }
    publishDesktopObstacles();
  });
}
function setMotion(value) {
  if (motion === value) return;
  motion = value;
  sendPet("pet:motion", value);
}
function setIgnored(value) {
  // 拖动过程中如果重新穿透，指针会在半路丢失，小熊猫就拖不动了。
  if (userDragging) value = false;
  if (!petWindow || petWindow.isDestroyed() || ignored === value) return;
  ignored = value;
  petWindow.setIgnoreMouseEvents(value, { forward: true });
}
function trusted(event, window) {
  return window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame;
}
function displayGift() {
  if (useInlineGift) {
    if (giftWindow && !giftWindow.isDestroyed()) giftWindow.hide();
    giftRegion = null;
    sendPet("gift:state", giftState?.gift ? giftState : null);
    return;
  }
  if (!giftState?.gift) {
    if (giftWindow && !giftWindow.isDestroyed()) giftWindow.hide();
    giftRegion = null;
    return;
  }
  if (!giftWindow || giftWindow.isDestroyed()) {
    const bounds = petWindow?.getBounds();
    const area = (bounds ? screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) : screen.getPrimaryDisplay()).workArea;
    giftWindow = new BrowserWindow({
      ...area, ...transparentPetOptions(), alwaysOnTop: true, skipTaskbar: true,
      focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    giftWindow.setAlwaysOnTop(true, "screen-saver");
    giftWindow.setIgnoreMouseEvents(true, { forward: true });
    giftIgnored = true;
    secureWindow(giftWindow, "null");
    giftWindow.webContents.on("did-finish-load", () => {
      if (giftState?.gift) { giftWindow.webContents.send("gift:state", giftState); giftWindow.showInactive(); }
    });
    giftWindow.loadFile(path.join(__dirname, "gift.html"));
  } else {
    giftWindow.webContents.send("gift:state", giftState);
    giftWindow.showInactive();
  }
  applyLayering();
}
ipcMain.on("gift:show", (event, state) => {
  if (!trusted(event, journalWindow) || !state) return;
  const g = state.gift;
  if (g && (typeof g.id !== "string" || g.id.length > 100
    || typeof g.emoji !== "string" || g.emoji.length > 8
    || typeof g.item !== "string" || g.item.length > 50)) return;
  if (state.startedAt !== undefined && !Number.isFinite(state.startedAt)) return;
  giftState = { gift: g ? { id: g.id, emoji: g.emoji, item: g.item } : undefined, startedAt: state.startedAt };
  displayGift();
});
ipcMain.on("gift:click", (event, id) => {
  if ((trusted(event, giftWindow) || (useInlineGift && trusted(event, petWindow)))
    && id === giftState?.gift?.id && !giftState.startedAt
    && journalWindow && !journalWindow.isDestroyed()) journalWindow.webContents.send("gift:click", id);
});
ipcMain.on("gift:region", (event, region) => {
  if (!trusted(event, giftWindow)) return;
  if (!region) { giftRegion = null; return; }
  if (["x", "y", "width", "height"].every(k => Number.isFinite(region[k]))
    && region.width > 0 && region.width <= 300 && region.height > 0 && region.height <= 200) giftRegion = region;
});
function updateGiftHit() {
  if (!giftWindow || giftWindow.isDestroyed() || !giftWindow.isVisible()) return;
  const cursor = screen.getCursorScreenPoint(), bounds = giftWindow.getBounds();
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  const ignore = !giftRegion || x < giftRegion.x || y < giftRegion.y
    || x > giftRegion.x + giftRegion.width || y > giftRegion.y + giftRegion.height;
  if (ignore !== giftIgnored) { giftIgnored = ignore; giftWindow.setIgnoreMouseEvents(ignore, { forward: true }); }
}
function hideJournal() {
  clearTimeout(saveTimer);
  if (journalWindow && !journalWindow.isDestroyed()) journalWindow.hide();
  roam = null;
  restUntil = Date.now() + 3000;
  setMotion("idle");
}
function secureWindow(window, origin) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== origin) event.preventDefault();
    } catch { event.preventDefault(); }
  });
}
function openJournal(show = true) {
  const shouldShow = show !== false;
  clearTimeout(saveTimer);
  if (!journalWindow || journalWindow.isDestroyed()) {
    journalWindow = new BrowserWindow({
      width: 900, height: 780, minWidth: 600, minHeight: 540,
      title: "小熊猫日记", show: false, frame: false,
      backgroundColor: "#f1ede2", autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      },
    });
    // Only the first-party journal is loaded; secrets are never exposed to it.
    const url = process.env.PANDA_JOURNAL_URL
      || (development ? (process.env.REPL_ID ? "http://localhost:80/" : "http://localhost:21836/") : null);
    if (url) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid journal URL");
      secureWindow(journalWindow, parsed.origin);
      journalWindow.loadURL(url).catch(() => dialog.showErrorBox("日记页面暂时没有打开", "请确认日记网页服务正在运行，再重新打开。"));
    } else {
      const file = path.join(__dirname, "../dist/desktop/index.html");
      if (!fs.existsSync(file)) {
        dialog.showErrorBox("还没有构建日记页面", "请先运行 pnpm --filter @workspace/panda-journal run desktop:build。");
        journalWindow.destroy();
        return;
      }
      secureWindow(journalWindow, "null");
      journalWindow.loadFile(file);
    }
    journalWindow.once("ready-to-show", () => {
      if (shouldShow) { journalWindow.show(); journalWindow.focus(); }
      else journalWindow.webContents.send("companion:visibility", false);
    });
    journalWindow.on("show", () => {
      journalWindow.webContents.send("companion:visibility", true);
      applyLayering();
    });
    journalWindow.on("hide", () => {
      journalWindow.webContents.send("companion:visibility", false);
      applyLayering();
    });
    journalWindow.on("close", (event) => {
      if (!quitting) { event.preventDefault(); hideJournal(); }
    });
    journalWindow.on("minimize", () => { setImmediate(hideJournal); });
    // A microphone permission request is never silently approved.
    journalWindow.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
      if (contents !== journalWindow?.webContents || permission !== "media") { callback(false); return; }
      dialog.showMessageBox(journalWindow, {
        type: "question", title: "允许小熊猫日记使用麦克风？",
        message: "按住说话会使用系统／浏览器语音识别。识别出的文字会出现在输入框，只有点击发送后才发送给 AI。",
        buttons: ["允许这一次", "不允许"], defaultId: 1, cancelId: 1,
      }).then(({ response }) => callback(response === 0)).catch(() => callback(false));
    });
  } else {
    if (shouldShow) {
      journalWindow.restore();
      journalWindow.show();
      journalWindow.focus();
    }
  }
  setMotion("idle");
}

function updatePet() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  const overPet = hitRegions.some((rect) => {
    if (rect.circle) return (x - rect.x - rect.width / 2) ** 2 + (y - rect.y - rect.height / 2) ** 2 <= (rect.width / 2) ** 2;
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  });
  // Cursor polling also works on Linux, where forward:true is unsupported.
  setIgnored(userDragging ? false : !overPet);
  if (["fallen", "away"].includes(companionEffect.stage)) return;
  if (["returning", "performing"].includes(companionEffect.stage)) return;
  const journalVisible = Boolean(journalWindow?.isVisible() && !journalWindow.isMinimized());
  const now = Date.now();
  if (journalVisible !== journalWasVisible) {
    journalWasVisible = journalVisible;
    roam = null;
    restUntil = now + (journalVisible ? 20_000 : 1_800);
    setMotion("idle");
  }
  if (userPinned || userDragging) {
    roam = null;
    setMotion("idle");
    return;
  }
  if (overPet || hitRegions.length > 1) {
    roam = null;
    restUntil = now + 1500;
    setMotion("idle");
    return;
  }
  if (!roam && now >= restUntil) {
    roam = {
      start: now,
      duration: journalVisible ? 3200 + Math.random() * 1800 : 9000 + Math.random() * 7000,
    };
    setMotion("walk");
  }
  if (roam) {
    const progress = Math.min(1, (now - roam.start) / roam.duration);
    if (progress === 1) {
      roam = null;
      if (journalVisible) {
        restUntil = now + 25_000 + Math.random() * 35_000;
        setMotion("idle");
      } else {
        const hour = new Date().getHours();
        const sleeping = hour >= 22 || hour < 6 || Math.random() < 0.3;
        restUntil = now + (sleeping ? 15000 : 3500) + Math.random() * 7000;
        setMotion(sleeping ? "sleep" : "idle");
      }
    }
  }
}

ipcMain.on("pet:ignore", (event, ignore) => { if (trusted(event, petWindow)) setIgnored(Boolean(ignore)); });
ipcMain.on("pet:dragging", (event, dragging) => {
  if (!trusted(event, petWindow)) return;
  userDragging = Boolean(dragging);
  if (userDragging) {
    roam = null;
    setMotion("idle");
    setIgnored(false);
  }
});
ipcMain.on("pet:pin", (event, pinned) => {
  if (!trusted(event, petWindow)) return;
  userPinned = Boolean(pinned);
  roam = null;
  if (userPinned) setMotion("idle");
  else restUntil = Date.now() + 400;
  saveSettings();
  refreshTray();
});
ipcMain.on("pet:room", (event, point) => {
  if (!trusted(event, petWindow) || !point || !Number.isFinite(point.u) || !Number.isFinite(point.v)) return;
  savedRoom = { u: Math.min(1, Math.max(0, point.u)), v: Math.min(1, Math.max(0, point.v)) };
  saveSettings();
});
ipcMain.on("pet:move-by", (event, delta) => {
  if (!trusted(event, petWindow) || fullDesktopMode || !delta) return;
  const dx = Number(delta.dx);
  const dy = Number(delta.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) return;
  const bounds = petWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const next = clampWindowOrigin({ x: bounds.x + dx, y: bounds.y + dy }, bounds, area);
  petWindow.setPosition(next.x, next.y);
  savedBounds = petWindow.getBounds();
  saveSettings();
});
ipcMain.on("pet:hit-regions", (event, value) => {
  if (!trusted(event, petWindow) || !Array.isArray(value) || value.length > 8) return;
  const bounds = petWindow.getBounds();
  hitRegions = value.filter((rect) => rect && ["x", "y", "width", "height"].every((key) => Number.isFinite(rect[key]))
    && rect.width > 0 && rect.height > 0 && rect.width <= bounds.width && rect.height <= bounds.height);
});
ipcMain.on("journal:open", (event) => { if (trusted(event, petWindow)) openJournal(); });
ipcMain.on("journal:hide", (event) => { if (trusted(event, journalWindow)) hideJournal(); });
ipcMain.on("journal:entry-saved", (event) => {
  if (!trusted(event, journalWindow)) return;
  // A short pause lets the saved reply appear before returning to the desktop.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    hideJournal();
    sendPet("pet:message", "记好啦，我去玩啦～");
  }, 2200);
});
ipcMain.handle("journal:classify", async (event, input) => {
  if (!trusted(event, journalWindow)) throw new Error("无效的日记请求。");
  return classify(input?.text);
});
ipcMain.handle("companion:chat", async (event, input) => {
  if (!trusted(event, journalWindow)) throw new Error("无效的聊天请求。");
  console.info("[companion:chat] request received");
  chatCalls = chatCalls.filter(time => Date.now() - time < 60_000);
  if (chatCalls.length >= 12) {
    const error = new Error("说得有点快，稍等一分钟再发吧。");
    console.warn("[companion:chat] request failed:", error.message);
    throw error;
  }
  chatCalls.push(Date.now());
  try {
    const response = await chat(input);
    console.info("[companion:chat] response received");
    return response;
  } catch (error) {
    // Log only the safe error text, never the message, prompt, or credentials.
    const reason = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']*': Error: /, '').slice(0, 180) : "未知错误";
    console.warn("[companion:chat] request failed:", reason);
    throw error;
  }
});
ipcMain.handle("companion:visibility", (event) => {
  if (!trusted(event, journalWindow)) return false;
  return journalWindow.isVisible() && !journalWindow.isMinimized();
});
ipcMain.on("companion:greet", (event) => {
  if (trusted(event, petWindow)) journalWindow?.webContents.send("companion:greet");
});
ipcMain.on("companion:message", (event, text) => {
  if (trusted(event, journalWindow) && typeof text === "string" && text.length <= 500
    && (!journalWindow.isVisible() || journalWindow.isMinimized())) sendPet("pet:message", text);
});
ipcMain.on("companion:motion", (event, effect) => {
  const maxDuration = effect?.action === "bamboo" && effect?.stage === "performing" ? 7000 : 5000;
  if (!trusted(event, journalWindow) || !effect
    || !["present", "performing", "fallen", "returning", "away"].includes(effect.stage)
    || !["idle", "bamboo", "roll", "jump", "spin", "somersault", "tail", "tumble", "cuddle"].includes(effect.action)
    || ["roll", "spin", "tumble"].includes(effect.action)
    || !Number.isFinite(effect.duration) || effect.duration < 2000 || effect.duration > maxDuration
    || !Number.isFinite(effect.token)) return;
  const previous = companionEffect;
  companionEffect = { stage: effect.stage, action: effect.action, duration: effect.duration, token: effect.token,
    carrying: typeof effect.carrying === "string" ? effect.carrying.slice(0, 8) : undefined };
  sendPet("companion:motion", companionEffect);
  if (!petWindow || petWindow.isDestroyed()) return;
  roam = null;
  if (["fallen", "away"].includes(effect.stage)) { petWindow.hide(); return; }
  if (effect.stage === "returning") {
    setMotion("walk");
    petWindow.showInactive();
  } else {
    setMotion("idle");
    restUntil = Date.now() + 3000;
    if (previous.stage !== "present") petWindow.showInactive();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => openJournal());
  app.whenReady().then(() => {
    loadSettings();
    const area = screen.getPrimaryDisplay().workArea;
    let initialBounds = fullDesktopMode ? area : {
      width: windowedPetWidth,
      height: windowedPetHeight,
      x: area.x + Math.max(0, area.width - windowedPetWidth - 24),
      y: area.y + Math.max(0, area.height - windowedPetHeight - 20),
    };
    if (!fullDesktopMode && savedBounds) {
      const display = screen.getDisplayMatching(savedBounds);
      const origin = clampWindowOrigin(
        savedBounds,
        { width: windowedPetWidth, height: windowedPetHeight },
        display.workArea,
      );
      initialBounds = { ...origin, width: windowedPetWidth, height: windowedPetHeight };
    }
    petWindow = new BrowserWindow({
      ...initialBounds,
      ...transparentPetOptions(),
      alwaysOnTop: petOnTop,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      },
    });
    applyLayering();
    // 虚拟桌面切换后小熊猫还在。只在 Windows 上开，避免改掉 Linux 冒烟测试的窗口行为。
    if (process.platform === "win32") petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    petWindow.setIgnoreMouseEvents(true, { forward: true });
    secureWindow(petWindow, "null");
    petWindow.loadFile(path.join(__dirname, "pet.html"), {
      query: { desktopMode: fullDesktopMode ? "full" : "windowed" },
    });
    petWindow.once("ready-to-show", () => {
      if (!petWindow.isDestroyed() && !["fallen", "away"].includes(companionEffect.stage)) petWindow.showInactive();
    });
    petWindow.webContents.on("did-finish-load", () => {
      if (!petWindow.isDestroyed() && !petWindow.isVisible() && !["fallen", "away"].includes(companionEffect.stage)) {
        petWindow.showInactive();
      }
      sendPet("companion:motion", companionEffect);
      if (savedRoom) sendPet("pet:restore", savedRoom);
      if (useInlineGift) sendPet("gift:state", giftState?.gift ? giftState : null);
      publishDesktopObstacles();
    });
    if (fullDesktopMode) {
      screen.on("display-metrics-changed", () => {
        if (!petWindow || petWindow.isDestroyed()) return;
        petWindow.setBounds(screen.getPrimaryDisplay().workArea);
        publishDesktopObstacles();
      });
      obstaclePollTimer = setInterval(pollDesktopWindows, 1200);
      pollDesktopWindows();
    }
    // Keep the local companion clock alive without displaying the chat page.
    openJournal(false);
    petWindow.webContents.on("context-menu", () => menu?.popup({ window: petWindow }));
    try {
      // A self-contained monochrome tray icon; no third-party skin assets.
      const icon = createTrayIcon(nativeImage);
      tray = new Tray(icon);
      tray.setToolTip("小熊猫日记 · 拖动小熊猫可以换位置，双击说说心事");
      tray.on("click", () => openJournal());
    } catch {
      // The pet's right-click menu remains available if no system tray exists.
      console.warn("系统托盘不可用，可右键小熊猫打开日记或退出。");
    }
    refreshTray();
    tick = setInterval(() => { updatePet(); updateGiftHit(); }, 80);
    console.info("小熊猫桌宠已启动；拖动小熊猫换位置，双击打开互动气泡。");
  }).catch((error) => { console.error("桌宠启动失败：", error.message); app.quit(); });
}
app.on("before-quit", () => {
  quitting = true;
  clearInterval(tick);
  clearInterval(obstaclePollTimer);
  clearTimeout(saveTimer);
  clearTimeout(settingsTimer);
});
app.on("window-all-closed", () => {});
app.on("activate", () => {
  if (petWindow && !petWindow.isDestroyed() && !["fallen", "away"].includes(companionEffect.stage)) petWindow.showInactive();
});
