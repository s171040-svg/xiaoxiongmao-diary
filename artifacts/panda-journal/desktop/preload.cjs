"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("pandaDesktop", {
  chat: (input) => ipcRenderer.invoke("companion:chat", input),
  companionMotion: (effect) => ipcRenderer.send("companion:motion", effect),
  notifyMessage: (text) => ipcRenderer.send("companion:message", text),
  greet: () => ipcRenderer.send("companion:greet"),
  onCompanionVisibility: (callback) => subscribe("companion:visibility", callback),
  onCompanionGreet: (callback) => subscribe("companion:greet", callback),
  onCompanionMotion: (callback) => subscribe("companion:motion", callback),
  companionVisibility: () => ipcRenderer.invoke("companion:visibility"),
  showGift: (gift, startedAt) => ipcRenderer.send("gift:show", { gift, startedAt }),
  onGiftClick: (callback) => subscribe("gift:click", callback),
  onGiftState: (callback) => subscribe("gift:state", callback),
  clickGift: (id) => ipcRenderer.send("gift:click", id),
  giftHitRegion: (region) => ipcRenderer.send("gift:region", region),
  openJournal: () => ipcRenderer.send("journal:open"),
  hideJournal: () => ipcRenderer.send("journal:hide"),
  entrySaved: () => ipcRenderer.send("journal:entry-saved"),
  classifyJournalEntry: (input) => ipcRenderer.invoke("journal:classify", input),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send("pet:ignore", Boolean(ignore)),
  setHitRegions: (regions) => ipcRenderer.send("pet:hit-regions", regions),
  setDragging: (dragging) => ipcRenderer.send("pet:dragging", Boolean(dragging)),
  setPinned: (pinned) => ipcRenderer.send("pet:pin", Boolean(pinned)),
  rememberRoom: (point) => ipcRenderer.send("pet:room", point),
  moveBy: (dx, dy) => ipcRenderer.send("pet:move-by", { dx, dy }),
  onRestore: (callback) => subscribe("pet:restore", callback),
  onPetMotion: (callback) => subscribe("pet:motion", callback),
  onPetMessage: (callback) => subscribe("pet:message", callback),
  onDesktopObstacles: (callback) => subscribe("desktop:obstacles", callback),
});
