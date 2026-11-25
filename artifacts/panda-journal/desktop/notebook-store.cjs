"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const LEAD = 60 * 60 * 1000;
const MAX_TITLE = 160;

function createNotebookStore(directory) {
  const file = path.join(directory, "notebook-v1.json");
  let notes;
  function load() {
    if (notes) return notes;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 30 * 1024 * 1024) throw new Error("记事文件过大，请先备份后处理。");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.notes) || data.notes.some(note =>
        !note || typeof note.id !== "string" || typeof note.text !== "string"
        || !Number.isFinite(note.createdAt) || !Number.isFinite(note.updatedAt)
        || !Array.isArray(note.reminders) || note.reminders.some(r => !r || typeof r.id !== "string"
          || typeof r.title !== "string" || !Number.isFinite(r.eventAt) || !Number.isFinite(r.remindAt)
          || !["pending", "sent", "cancelled"].includes(r.status)))) {
        throw new Error("记事文件格式不完整。");
      }
      let migrated = false;
      notes = data.notes.map(note => ({
        ...note,
        reminders: note.reminders.map(reminder => {
          if (reminder.status !== "pending" || reminder.remindAt === reminder.eventAt - LEAD) return reminder;
          migrated = true;
          return { ...reminder, remindAt: reminder.eventAt - LEAD };
        }),
      }));
      // Keep all existing content, but update pending schedules to the new
      // one-hour rule using the same atomic writer and recovery backup.
      if (migrated) commit(notes);
    } catch (error) {
      if (error.code === "ENOENT") notes = [];
      else throw new Error("本机记事文件无法读取，已停止写入以保护原记录。请先备份后检查。");
    }
    return notes;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function commit(next) {
    const data = JSON.stringify({ version: 1, notes: next }, null, 2);
    if (Buffer.byteLength(data) > 30 * 1024 * 1024) throw new Error("记事文件已满，请先导出或清理旧记录。");
    fs.mkdirSync(directory, { recursive: true });
    // Keep the last successful file as a recovery copy; never rewrite on read errors.
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const temp = `${file}.tmp`;
    const fd = fs.openSync(temp, "w", 0o600);
    try { fs.writeFileSync(fd, data, "utf8"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
    notes = next;
  }
  function list() {
    return { notes: clone(load()).sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  function save(input, now = Date.now()) {
    if (!input || typeof input.text !== "string" || !input.text.trim() || input.text.trim().length > MAX_TITLE) {
      throw new Error("请填写事项，最多160个字。");
    }
    if (!Array.isArray(input.reminders) || input.reminders.length > 20) throw new Error("事项关联提醒数量无效。");
    const current = load();
    const previous = input.id ? current.find(note => note.id === input.id) : null;
    if (input.id && !previous) throw new Error("这条记事已不存在，请重新打开列表。");
    if (!previous && current.length >= 10000) throw new Error("记事数量已满，请先备份整理。");
    const ids = new Set();
    const reminders = input.reminders.map(value => {
      if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 160
        || !Number.isFinite(value.eventAt) || !Number.isFinite(value.remindAt)
        || value.remindAt > value.eventAt || value.eventAt > now + 10 * 366 * 86400000) throw new Error("请检查提醒内容、事项和提醒时间。");
      const old = value.id && previous?.reminders.find(reminder => reminder.id === value.id);
      if (value.id && !old) throw new Error("提醒记录已变化，请重新读取。");
      const sameTime = old && old.eventAt === value.eventAt && old.remindAt === value.remindAt;
      let status = value.status ?? (sameTime ? old.status : "pending");
      if (!["pending", "sent", "cancelled"].includes(status)) throw new Error("提醒状态无效。");
      if (!old && status === "sent") throw new Error("新提醒不能设为已发送。");
      // A stale editor must not re-arm a reminder that the clock has just sent.
      if (old?.status === "sent" && sameTime && status === "pending") status = "sent";
      if (status === "pending" && value.eventAt < now + LEAD) {
        throw new Error("事项至少要在一小时后，才能提前一小时提醒。");
      }
      if (status === "pending" && value.remindAt !== value.eventAt - LEAD) {
        throw new Error("提醒时间必须固定为事项开始前一小时。");
      }
      const id = old?.id ?? randomUUID();
      if (ids.has(id)) throw new Error("同一提醒不能重复保存。");
      ids.add(id);
      return { id, title: value.title.trim(), eventAt: value.eventAt, remindAt: value.remindAt, status,
        ...(sameTime && old.deliveredAt ? { deliveredAt: old.deliveredAt } : {}) };
    });
    const note = {
      id: previous?.id ?? randomUUID(), text: input.text.trim(),
      createdAt: previous?.createdAt ?? now, updatedAt: now, reminders,
    };
    commit([...current.filter(value => value.id !== note.id), note]);
    return clone(note);
  }
  function remove(id) {
    const current = load();
    if (typeof id !== "string" || !current.some(note => note.id === id)) throw new Error("找不到这条记事。");
    commit(current.filter(note => note.id !== id));
    return { ok: true };
  }
  function due(now = Date.now()) {
    const current = load();
    const deliveries = [];
    const next = clone(current);
    for (const note of next) for (const reminder of note.reminders) {
      if (reminder.status !== "pending" || reminder.remindAt > now) continue;
      reminder.status = "sent"; reminder.deliveredAt = now;
      deliveries.push({ ...reminder, noteId: note.id, overdue: now > reminder.remindAt + 60000 });
    }
    // Persist delivery markers before notifying so periodic checks cannot duplicate.
    if (deliveries.length) commit(next);
    return deliveries;
  }
  return { list, save, remove, due };
}
module.exports = { createNotebookStore, LEAD };
