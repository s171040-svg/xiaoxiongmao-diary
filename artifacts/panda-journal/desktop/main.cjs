"use strict";
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, dialog, powerMonitor, Notification } = require("electron");
const fs = require("node:fs");
const { createWellbeing } = require("./wellbeing.cjs");
const { createNotebookStore, preview: previewNotebook } = require("./notebook-store.cjs");
const { createScanner, localWindows } = require("./windows-platforms.cjs");
const { readPixel, samplePoint } = require("./windows-pixel.cjs");
const path = require("node:path");
const { classify } = require("./ai.cjs");
const { chat } = require("@workspace/companion-ai");
const createTrayIcon = require("./tray-icon.cjs");
const journalConnection = require("./journal-connection.cjs");

const metadata = app.isPackaged ? require(path.join(app.getAppPath(), "package.json")) : require("../package.json");
const offlineTrial = metadata.offlineDesktopTrial === true
  || (!app.isPackaged && process.argv.includes("--offline-desktop-trial"));
if (process.platform === "win32") app.setAppUserModelId(offlineTrial ? "com.xiaoxiongmao.desktoptrial" : "com.xiaoxiongmao.journal");
app.setName(offlineTrial ? "小熊猫桌宠离线试玩" : "小熊猫日记");
if (process.env.PANDA_PROFILE_DIR) app.setPath("userData", path.resolve(process.env.PANDA_PROFILE_DIR));
else if (offlineTrial) app.setPath("userData", path.join(app.getPath("appData"), "XiaoxiongmaoDesktopTrial"));
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
let wellbeingTimer;
let notebookWindow, notebookStore, notebookTimer, notebookDirty = false, notebookClosing = false;
let notebookClockFailed = false;
const notebookNotifications = new Set();
let companionEffect = { stage: "present", action: "idle", duration: 3000, token: 0 };
let chatCalls = [];
let desktopWindowRects = [];
let platformScanner;
let platformRevision = 0;
let journalWasVisible = false;
const windowedPetWidth = 340, windowedPetHeight = 360;
const fullDesktopMode = process.platform === "win32" && !process.env.REPL_ID;
const useInlineGift = process.platform === "linux" && Boolean(process.env.REPL_ID);
const desktopVersion = metadata.version;
const nativeGiftWindowsEnabled = false; // Gifts stay in the room in the quiet first version.
let desktopPetState = { mode: "desktop", characterId: "panda", identityReady: offlineTrial, identityStatus: offlineTrial ? "offline-trial" : "loading", paused: false, quietMode: false, ...(offlineTrial ? { restPose: null, backgroundBite: fullDesktopMode } : {}) };
let petDragging = false;
let nextPixelRead = 0;
let manualBiteUntil = 0;
let pixelReadInFlight = false;
function publishPetState() {
  sendPet("desktop-pet:state", desktopPetState);
  if (journalWindow && !journalWindow.isDestroyed()) journalWindow.webContents.send("desktop-pet:state", desktopPetState);
}
function showDesktopPet() {
  if (!desktopPetState.identityReady) { returnPetHome(); return; }
  desktopPetState.mode = "desktop";
  hideJournal();
  petWindow?.showInactive();
  publishPetState();
}
function returnPetHome() {
  if (offlineTrial) { showDesktopPet(); return; }
  openJournal();
  if (!journalWindow || journalWindow.isDestroyed()) throw new Error("房间暂时没有打开");
  desktopPetState.mode = "room";
  petDragging = false;
  petWindow?.hide();
  publishPetState();
}

function sendPet(channel, value) {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send(channel, value);
}

function platformSnapshot() {
  let windows = [];
  if (fullDesktopMode) {
    try {
      windows = localWindows(desktopWindowRects, screen.getPrimaryDisplay().workArea,
        rect => screen.screenToDipRect(null, rect));
    } catch {
      console.warn("窗口坐标暂不可用，桌宠仅沿任务栏活动。");
    }
  }
  return { revision: platformRevision, windows };
}
function publishDesktopPlatforms() {
  platformRevision++;
  sendPet("desktop:platforms", platformSnapshot());
}
function setMotion(value) {
  if (motion === value) return;
  motion = value;
  sendPet("pet:motion", value);
}
function setIgnored(value) {
  if (!petWindow || petWindow.isDestroyed() || ignored === value) return;
  ignored = value;
  petWindow.setIgnoreMouseEvents(value, { forward: true });
}
function trusted(event, window) {
  return window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame;
}
function displayGift() {
  if (!nativeGiftWindowsEnabled) return;
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
      ...area, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, hasShadow: false, focusable: false, show: false, backgroundColor: "#00000000",
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
  if (desktopPetState.mode === "room" && desktopPetState.identityReady) {
    desktopPetState.mode = "desktop";
    petWindow?.showInactive();
    publishPetState();
  }
}
function secureWindow(window, origin) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== origin) event.preventDefault();
    } catch { event.preventDefault(); }
  });
}
function publishNotebook() {
  if (notebookWindow && !notebookWindow.isDestroyed()) {
    notebookWindow.webContents.send("notebook:changed", notebookStore.list());
  }
}
function setNotebookOpen(value) {
  desktopPetState.notebookOpen = Boolean(value);
  publishPetState();
}
function openNotebook() {
  if (!notebookWindow || notebookWindow.isDestroyed()) {
    notebookWindow = new BrowserWindow({
      width: 700, height: 740, minWidth: 480, minHeight: 540,
      title: "小熊猫 · 本机记事", show: false, autoHideMenuBar: true,
      backgroundColor: "#f4ecd9",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, partition: "notebook-local",
      },
    });
    secureWindow(notebookWindow, "null");
    notebookWindow.loadFile(path.join(__dirname, "notebook.html")).catch(() => {
      dialog.showErrorBox("记事窗未能打开", "本机记事页面缺失，请使用完整的新版本。已有记录不会删除。");
      setNotebookOpen(false);
    });
    notebookWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    notebookWindow.once("ready-to-show", () => {
      notebookWindow.show(); notebookWindow.focus(); setNotebookOpen(true);
    });
    notebookWindow.on("show", () => setNotebookOpen(true));
    notebookWindow.on("hide", () => setNotebookOpen(false));
    notebookWindow.on("minimize", () => setNotebookOpen(false));
    notebookWindow.on("restore", () => setNotebookOpen(true));
    notebookWindow.on("close", async event => {
      if (quitting) return;
      event.preventDefault();
      if (notebookClosing) return;
      notebookClosing = true;
      try {
        if (notebookDirty) {
          const { response } = await dialog.showMessageBox(notebookWindow, {
            type: "question", title: "还有没保存的小记录",
            message: "要先收起来吗？未保存的草稿会留在这个窗口，退出软件前记得保存。",
            buttons: ["继续编辑", "收起并保留草稿"], defaultId: 0, cancelId: 0,
          });
          if (response !== 1) return;
        }
        notebookWindow.hide();
      } finally { notebookClosing = false; }
    });
    notebookWindow.on("closed", () => {
      notebookWindow = null; notebookDirty = false; setNotebookOpen(false);
    });
    notebookWindow.webContents.on("render-process-gone", () => {
      setNotebookOpen(false);
      dialog.showErrorBox("记事窗意外关闭", "已经保存的本机记录仍在，未保存的草稿可能需要重新输入。");
      notebookWindow?.destroy();
    });
  } else {
    if (notebookWindow.isMinimized()) notebookWindow.restore();
    notebookWindow.show(); notebookWindow.focus(); setNotebookOpen(true);
  }
}
function checkNotebookReminders() {
  // Do not reveal personal notes on a locked screen.
  if (powerMonitor.getSystemIdleState(60) === "locked") return;
  let due;
  try {
    due = notebookStore.due();
    notebookClockFailed = false;
  } catch {
    if (!notebookClockFailed) {
      console.warn("本机提醒暂时无法读取或保存，已暂停本轮通知以保护记事。");
      sendPet("desktop-pet:wellbeing", { kind: "reminder", message: "本机记事暂时读不到啦，请打开记事窗检查。提醒可能延迟。" });
      notebookClockFailed = true;
    }
    return;
  }
  if (!due.length) return;
  publishNotebook();
  const format = timestamp => new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const first = due.sort((a, b) => a.remindAt - b.remindAt)[0];
  const message = due.length > 1 ? `小熊猫带来了${due.length}条到点或错过的提醒，打开记事看看吧～`
    : `${first.overdue ? "补提醒，刚才可能没赶上：" : "小熊猫提醒你："}${first.title}（事项时间 ${format(first.eventAt)}）`;
  sendPet("desktop-pet:wellbeing", { kind: "reminder", message: message.slice(0, 180) });
  if (Notification.isSupported()) {
    const notification = new Notification({ title: "小熊猫的小提醒", body: message, silent: true });
    notebookNotifications.add(notification);
    notification.on("click", () => openNotebook());
    notification.on("close", () => notebookNotifications.delete(notification));
    notification.on("failed", () => {
      notebookNotifications.delete(notification);
      console.warn("系统通知未能显示，请在本机记事中查看已到点的提醒。");
    });
    notification.show();
  }
}
ipcMain.handle("notebook:open", event => {
  if (!trusted(event, petWindow) || !desktopPetState.identityReady || petDragging) throw new Error("请从桌面小熊猫打开记事。");
  openNotebook();
  return { ok: true };
});
ipcMain.handle("notebook:list", event => {
  if (!trusted(event, notebookWindow)) throw new Error("无效的本机记事请求。");
  return notebookStore.list();
});
ipcMain.handle("notebook:preview", (event, text) => {
  if (!trusted(event, notebookWindow)) throw new Error("无效的本机记事请求。");
  return previewNotebook(text);
});
ipcMain.handle("notebook:save", (event, input) => {
  if (!trusted(event, notebookWindow)) throw new Error("无效的本机记事请求。");
  const note = notebookStore.save(input);
  notebookDirty = false;
  publishNotebook();
  return note;
});
ipcMain.handle("notebook:remove", (event, id) => {
  if (!trusted(event, notebookWindow)) throw new Error("无效的本机记事请求。");
  const result = notebookStore.remove(id);
  notebookDirty = false;
  publishNotebook();
  return result;
});
ipcMain.handle("notebook:close", event => {
  if (!trusted(event, notebookWindow)) throw new Error("无效的本机记事请求。");
  notebookWindow.close();
});
ipcMain.on("notebook:dirty", (event, dirty) => {
  if (trusted(event, notebookWindow)) notebookDirty = dirty === true;
});
function openJournal(show = true) {
  if (offlineTrial) return;
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
    let url;
    try {
      url = process.env.PANDA_JOURNAL_URL
        || (development ? (process.env.REPL_ID ? "http://localhost:80/" : "http://localhost:21836/")
          : journalConnection.readTarget(app.getPath("userData")).url);
    } catch (error) {
      dialog.showErrorBox("无法连接网页版房间", error.message);
      journalWindow.destroy();
      return;
    }
    if (url) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid journal URL");
      secureWindow(journalWindow, parsed.origin);
      if (parsed.pathname === "/") parsed.pathname = "/room";
      journalWindow.loadURL(parsed.href).catch(() => {
        dialog.showErrorBox("网页版房间暂时没有打开", "请检查网络，或从系统托盘选择与你浏览器一致的网页版房间。读取不到角色时，桌宠不会显示成另一只。");
        if (journalWindow && !journalWindow.isDestroyed()) journalWindow.show();
      });
    }
    const invalidateCharacter = () => {
      desktopPetState.identityReady = false;
      desktopPetState.identityStatus = "loading";
      petWindow?.hide();
      publishPetState();
    };
    journalWindow.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) invalidateCharacter();
    });
    journalWindow.webContents.on("render-process-gone", () => {
      invalidateCharacter();
      dialog.showErrorBox("房间连接已中断", "桌宠已暂时隐藏，避免显示错误角色。请从托盘重新打开房间。");
    });
    journalWindow.once("ready-to-show", () => {
      if (shouldShow) { journalWindow.show(); journalWindow.focus(); }
      else journalWindow.webContents.send("companion:visibility", false);
    });
    journalWindow.on("show", () => journalWindow.webContents.send("companion:visibility", true));
    journalWindow.on("hide", () => journalWindow.webContents.send("companion:visibility", false));
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
  if (!petWindow.isVisible() || desktopPetState.mode !== "desktop") return;
  if (petDragging) { setIgnored(false); return; }
  const bounds = petWindow.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  const overPet = hitRegions.some((rect) => {
    if (rect.circle) return (x - rect.x - rect.width / 2) ** 2 + (y - rect.y - rect.height / 2) ** 2 <= (rect.width / 2) ** 2;
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  });
  // Cursor polling also works on Linux, where forward:true is unsupported.
  setIgnored(!overPet);
  if (desktopPetState.quietMode || desktopPetState.paused || desktopPetState.restPose) { roam = null; return; }
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
ipcMain.handle("desktop-pet:state", event => {
  if (!trusted(event, petWindow) && !trusted(event, journalWindow)) throw new Error("无效的桌宠请求");
  return desktopPetState;
});
ipcMain.handle("desktop-pet:platforms", event => {
  if (!trusted(event, petWindow)) throw new Error("无效的平台请求");
  return platformSnapshot();
});
ipcMain.handle("desktop-pet:background-color", async (event, left, manual) => {
  if (!offlineTrial || !fullDesktopMode || !trusted(event, petWindow) || !petWindow.isVisible()
    || !desktopPetState.identityReady || petDragging || pixelReadInFlight || typeof left !== "boolean"
    || hitRegions.length !== 1) return null;
  const now = Date.now();
  if (manual === true) {
    // Only the explicitly selected native menu item can grant a one-off read.
    if (now >= manualBiteUntil) return null;
    manualBiteUntil = 0;
  } else if (!desktopPetState.backgroundBite || desktopPetState.quietMode || desktopPetState.paused
    || desktopPetState.restPose || now < nextPixelRead) return null;
  const pet = hitRegions[0], overlay = petWindow.getBounds();
  const display = screen.getDisplayMatching(overlay);
  const point = samplePoint(pet, overlay, display.bounds, left, Math.abs(pet.y + pet.height - overlay.height) <= 1);
  if (!point) return null;
  nextPixelRead = now + 15000;
  pixelReadInFlight = true;
  try { return await readPixel(screen.dipToScreenPoint(point)); }
  finally { pixelReadInFlight = false; }
});
ipcMain.on("desktop-pet:character", (event, value) => {
  if (!trusted(event, journalWindow) || !value || !["panda", "xiaobai"].includes(value.characterId)
    || typeof value.ready !== "boolean") return;
  const wasReady = desktopPetState.identityReady;
  const ready = value.status === "ready" && value.ready === true;
  if (ready) desktopPetState.characterId = value.characterId;
  desktopPetState.identityReady = ready;
  desktopPetState.identityStatus = typeof value.status === "string" ? value.status : "outdated";
  if (!ready) {
    petWindow?.hide();
    if (value.status !== "loading" && desktopPetState.mode !== "room") {
      desktopPetState.mode = "room";
      openJournal();
    }
  } else if (!wasReady && desktopPetState.mode === "desktop") petWindow?.showInactive();
  publishPetState();
});
ipcMain.handle("desktop-pet:enter", event => {
  if (!trusted(event, journalWindow)) throw new Error("请从房间开启桌宠");
  if (!desktopPetState.identityReady) {
    if (desktopPetState.identityStatus === "outdated") throw new Error("当前网页版尚未更新角色同步，请更新网页版，或在托盘连接当前测试房间。");
    throw new Error("请先登录与网页相同的账号并读取已选角色，再开启桌宠。");
  }
  showDesktopPet();
  return desktopPetState;
});
ipcMain.handle("desktop-pet:home", event => {
  if (!trusted(event, petWindow)) throw new Error("无效的回家请求");
  returnPetHome();
  return desktopPetState;
});
ipcMain.on("desktop-pet:dragging", (event, value) => {
  if (!trusted(event, petWindow)) return;
  petDragging = value === true;
  if (petDragging) setIgnored(false);
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
// Room performances, away/fall events and messages do not drive the quiet v1 desktop renderer.

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => returnPetHome());
  app.whenReady().then(() => {
    notebookStore = createNotebookStore(app.getPath("userData"));
    notebookTimer = setInterval(checkNotebookReminders, 1000);
    const area = screen.getPrimaryDisplay().workArea;
    const initialBounds = fullDesktopMode ? area : {
      width: windowedPetWidth,
      height: windowedPetHeight,
      x: area.x + Math.max(0, area.width - windowedPetWidth - 24),
      y: area.y + Math.max(0, area.height - windowedPetHeight - 20),
    };
    petWindow = new BrowserWindow({
      ...initialBounds,
      transparent: !useInlineGift, frame: false, alwaysOnTop: true, skipTaskbar: true,
      show: false,
      resizable: false, hasShadow: false, backgroundColor: useInlineGift ? "#dfd4b9" : "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      },
    });
    petWindow.setAlwaysOnTop(true, "floating");
    petWindow.setIgnoreMouseEvents(true, { forward: true });
    secureWindow(petWindow, "null");
    petWindow.loadFile(path.join(__dirname, "pet.html"), {
      query: { desktopMode: fullDesktopMode ? "full" : "windowed" },
    });
    petWindow.webContents.on("did-finish-load", () => {
      publishPetState();
      sendPet("companion:motion", companionEffect);
      if (useInlineGift) sendPet("gift:state", giftState?.gift ? giftState : null);
      publishDesktopPlatforms();
    });
    if (fullDesktopMode) {
      screen.on("display-metrics-changed", () => {
        if (!petWindow || petWindow.isDestroyed()) return;
        petWindow.setBounds(screen.getPrimaryDisplay().workArea);
        publishDesktopPlatforms();
      });
      platformScanner = createScanner({
        onSnapshot(windows) { desktopWindowRects = windows; publishDesktopPlatforms(); },
        onFailure() { console.warn("窗口上沿检测暂不可用，桌宠将落到任务栏继续活动并自动重试。"); },
      });
      petWindow.on("hide", () => platformScanner.stop());
      petWindow.on("show", () => platformScanner.start());
      platformScanner.start();
    }
    if (offlineTrial) {
      petWindow.once("ready-to-show", showDesktopPet);
    } else {
      // Keep the companion clock alive without displaying the chat page.
      openJournal(false);
    }
    function refreshWalkingMenu() {
      const quietItem = menu.getMenuItemById("quiet-mode");
      quietItem.label = desktopPetState.quietMode ? "取消安静模式" : "安静模式";
      quietItem.checked = desktopPetState.quietMode;
      const pauseItem = menu.getMenuItemById("pause-walking");
      pauseItem.checked = desktopPetState.paused;
      pauseItem.enabled = !desktopPetState.quietMode;
      roam = null;
      publishPetState();
      tray?.setContextMenu(menu);
    }
    const wellbeingFile = path.join(app.getPath("userData"), "wellbeing-meals.json");
    let savedMeals = [];
    try {
      const saved = JSON.parse(fs.readFileSync(wellbeingFile, "utf8"));
      if (Array.isArray(saved)) savedMeals = saved;
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("午餐提醒记录未能读取，将从本次启动重新计时。");
    }
    const wellbeing = createWellbeing(savedMeals, slots => {
      try {
        fs.mkdirSync(path.dirname(wellbeingFile), { recursive: true });
        fs.writeFileSync(wellbeingFile, JSON.stringify(slots));
      } catch { console.warn("午餐提醒记录未能保存，重开软件可能再次提醒。"); }
    });
    const wellbeingAvailable = () => petWindow && !petWindow.isDestroyed()
      && petWindow.isVisible() && desktopPetState.identityReady
      && desktopPetState.mode === "desktop" && !petDragging;
    wellbeingTimer = setInterval(() => {
      const event = wellbeing.sample({
        now: Date.now(), idleSeconds: powerMonitor.getSystemIdleTime(), available: Boolean(wellbeingAvailable()),
      });
      if (event) sendPet("desktop-pet:wellbeing", event);
    }, 1000);
    const menu = Menu.buildFromTemplate([
      { label: offlineTrial ? "小熊猫 · 离线桌面试玩" : `小熊猫日记 v${desktopVersion} · 横线平台桌宠`, enabled: false },
      { type: "separator" },
      ...(!offlineTrial ? [{ id: "return-home", label: "回家（打开养成房间）", click: () => returnPetHome() }] : []),
      { id: "show-desktop", label: "显示桌宠", click: () => showDesktopPet() },
      { label: "打开本机记事", click: () => openNotebook() },
      { label: "提醒我休息", click: () => {
        if (wellbeingAvailable()) sendPet("desktop-pet:wellbeing", wellbeing.remind("rest", Date.now()));
      } },
      { label: "检视动作：健康最重要！", click: () => {
        if (wellbeingAvailable()) sendPet("desktop-pet:wellbeing", { kind: "celebrate", message: "健康最重要！你照顾自己，我就超开心～" });
      } },
      ...(!offlineTrial ? [{ label: "连接网页版房间…", enabled: !development && !process.env.PANDA_JOURNAL_URL, click: async () => {
        const owner = journalWindow && !journalWindow.isDestroyed() ? journalWindow : petWindow;
        const { response } = await dialog.showMessageBox(owner, {
          type: "question", title: "使用与网页相同的房间",
          message: "请选择你在浏览器中玩的版本，并在客户端登录同一个账号。",
          detail: "测试版与正式版的账号和数据相互独立。这里只切换连接，不修改已选角色，也不删除任何养成记录。",
          buttons: [...journalConnection.targets.map(target => target.label), "取消"],
          defaultId: 0, cancelId: journalConnection.targets.length,
        });
        if (response >= journalConnection.targets.length) return;
        try {
          journalConnection.saveTarget(app.getPath("userData"), journalConnection.targets[response].id);
          desktopPetState.identityReady = false; desktopPetState.mode = "room";
          petWindow?.hide(); publishPetState();
          journalWindow?.destroy(); journalWindow = null;
          openJournal();
        } catch (error) { dialog.showErrorBox("房间连接未更改", error.message); }
      } }] : []),
      { id: "quiet-mode", label: "安静模式", type: "checkbox", click: () => {
        desktopPetState.quietMode = !desktopPetState.quietMode;
        desktopPetState.paused = false;
        if (offlineTrial) desktopPetState.restPose = null;
        refreshWalkingMenu();
      } },
      { id: "pause-walking", label: "暂停走动", type: "checkbox", click: item => {
        if (offlineTrial) desktopPetState.restPose = null;
        desktopPetState.paused = item.checked; publishPetState();
      } },
      ...(offlineTrial ? [{
        id: "bite-now", label: "立即咬屏幕（开发测试）", enabled: fullDesktopMode,
        click: () => {
          if (!petWindow?.isVisible() || petDragging) return;
          manualBiteUntil = Date.now() + 1500;
          sendPet("desktop-pet:bite-now");
        },
      }] : []),
      ...(offlineTrial && fullDesktopMode ? [{
        id: "background-bite", label: "随机咬背景（本机取色）", type: "checkbox", checked: true,
        click: item => { desktopPetState.backgroundBite = item.checked; publishPetState(); tray?.setContextMenu(menu); },
      }] : []),
      { label: "隐藏桌宠", click: () => petWindow?.hide() },
      { type: "separator" },
      { label: "退出桌宠", click: () => app.quit() },
    ]);
    if (offlineTrial) {
      ipcMain.handle("desktop-pet:rest-menu", event => {
        if (!trusted(event, petWindow) || !petWindow.isVisible() || petDragging) return;
        const poseItems = [
          { id: "sleep", label: "睡觉" },
          { id: "stare", label: "坐着" },
          { id: "lying", label: "趴着" },
          { id: "auto", label: "恢复走动" },
        ];
        const active = desktopPetState.restPose ?? (!desktopPetState.quietMode && !desktopPetState.paused ? "auto" : null);
        const restMenu = Menu.buildFromTemplate(poseItems.map(({ id, label }) => ({
          id, label, type: "checkbox", checked: id === active,
          click: () => {
            desktopPetState.restPose = id === "auto" ? null : id;
            desktopPetState.quietMode = false;
            desktopPetState.paused = false;
            refreshWalkingMenu();
          },
        })));
        return new Promise(resolve => restMenu.popup({ window: petWindow, callback: resolve }));
      });
    }
    petWindow.webContents.on("context-menu", () => menu.popup({ window: petWindow }));
    try {
      // A self-contained monochrome tray icon; no third-party skin assets.
      const icon = createTrayIcon(nativeImage);
      tray = new Tray(icon);
      tray.setToolTip("小熊猫桌面陪伴 · 双击小熊猫打开本机记事");
      tray.setContextMenu(menu);
      tray.on("click", () => returnPetHome());
    } catch {
      // The pet's right-click menu remains available if no system tray exists.
      console.warn("系统托盘不可用，可右键小熊猫打开日记或退出。");
    }
    tick = setInterval(() => { updatePet(); updateGiftHit(); }, 80);
    console.info(`平台桌宠 v${desktopVersion} 已启动（任务栏与窗口上沿）；${offlineTrial ? "单击选择休息姿势，长按可拖动。" : "单击小熊猫播放挨拳动作，长按可拖动，右键可回家。"}`);
  }).catch((error) => {
    console.error("桌宠启动失败：", error.message);
    if (offlineTrial) dialog.showErrorBox("离线桌宠未能启动", "无法打开桌宠窗口。请确认使用的是 Windows 64 位测试文件。");
    app.quit();
  });
}
app.on("before-quit", event => {
  if (notebookDirty && notebookWindow && !notebookWindow.isDestroyed()) {
    const response = dialog.showMessageBoxSync(notebookWindow, {
      type: "warning", title: "还有未保存的记事",
      message: "退出会丢失尚未保存的草稿。已保存的记录不受影响。",
      buttons: ["返回记事", "放弃草稿并退出"], defaultId: 0, cancelId: 0,
    });
    if (response !== 1) { event.preventDefault(); openNotebook(); return; }
  }
  quitting = true;
  clearInterval(tick);
  clearInterval(wellbeingTimer);
  clearInterval(notebookTimer);
  platformScanner?.stop();
  clearTimeout(saveTimer);
});
app.on("window-all-closed", () => {});
app.on("activate", () => {
  if (desktopPetState.mode === "desktop" && petWindow && !petWindow.isDestroyed()) petWindow.showInactive();
});
