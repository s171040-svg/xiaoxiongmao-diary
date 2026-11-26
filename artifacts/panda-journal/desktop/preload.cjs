"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("pandaDesktop", {
  desktopPetState: () => ipcRenderer.invoke("desktop-pet:state"),
  onDesktopPetState: (callback) => subscribe("desktop-pet:state", callback),
  desktopPlatforms: () => ipcRenderer.invoke("desktop-pet:platforms"),
  onDesktopPlatforms: (callback) => subscribe("desktop:platforms", callback),
  syncDesktopCharacter: (selection) => ipcRenderer.send("desktop-pet:character", selection),
  enterDesktop: () => ipcRenderer.invoke("desktop-pet:enter"),
  returnHome: () => ipcRenderer.invoke("desktop-pet:home"),
  openRestMenu: () => ipcRenderer.invoke("desktop-pet:rest-menu"),
  openNotebook: () => ipcRenderer.invoke("notebook:open"),
  openScheduleChat: () => ipcRenderer.invoke("schedule-chat:open"),
  backgroundColor: (left, manual) => ipcRenderer.invoke("desktop-pet:background-color", left, manual),
  onBiteNow: callback => subscribe("desktop-pet:bite-now", callback),
  onWellbeing: callback => subscribe("desktop-pet:wellbeing", callback),
  setPetDragging: (value) => ipcRenderer.send("desktop-pet:dragging", Boolean(value)),
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
  onPetMotion: (callback) => subscribe("pet:motion", callback),
  onPetMessage: (callback) => subscribe("pet:message", callback),
  onDesktopObstacles: (callback) => subscribe("desktop:obstacles", callback),
});

contextBridge.exposeInMainWorld("pandaNotebook", {
  list: () => ipcRenderer.invoke("notebook:list"),
  save: input => ipcRenderer.invoke("notebook:save", input),
  remove: id => ipcRenderer.invoke("notebook:remove", id),
  close: () => ipcRenderer.invoke("notebook:close"),
  setDirty: dirty => ipcRenderer.send("notebook:dirty", Boolean(dirty)),
  onChanged: callback => subscribe("notebook:changed", callback),
});

contextBridge.exposeInMainWorld("pandaScheduleChat", {
  parse: text => ipcRenderer.invoke("schedule-chat:parse", text),
  save: input => ipcRenderer.invoke("schedule-chat:save", input),
  openNotebook: () => ipcRenderer.invoke("schedule-chat:manager"),
  hide: () => ipcRenderer.invoke("schedule-chat:hide"),
  setDirty: dirty => ipcRenderer.send("schedule-chat:dirty", Boolean(dirty)),
  onChanged: callback => subscribe("notebook:changed", callback),
});
