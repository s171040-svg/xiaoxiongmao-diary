"use strict";
(() => {
  const api = window.pandaNotebook;
  const $ = id => document.getElementById(id);
  const el = {
    form: $("event-form"), title: $("event-title"), date: $("event-date"),
    period: $("event-period"), hour: $("event-hour"), minute: $("event-minute"),
    preview: $("reminder-preview"), hint: $("form-hint"), error: $("error"),
    errorText: $("error-text"), retry: $("btn-retry"), list: $("event-list"),
    count: $("event-count"), listState: $("list-state"), legacy: $("legacy-note"),
    page: $("page-label"), saveState: $("save-state"), save: $("btn-save"),
    cancel: $("btn-cancel"), remove: $("btn-delete"), discard: $("btn-discard"),
    fresh: $("btn-new"), close: $("btn-close"), confirm: $("confirm"),
    confirmTitle: $("confirm-title"), confirmBody: $("confirm-body"),
    confirmYes: $("confirm-yes"), confirmNo: $("confirm-no"),
  };
  const state = {
    notes: [], selectedNoteId: null, selectedReminderId: null,
    baseline: "", dirty: false, busy: false, initialized: false,
  };
  const LEAD = 60 * 60 * 1000;
  const MAX_TITLE = 160;

  const pad = value => String(value).padStart(2, "0");
  const localDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const titleOf = (note, reminder) => reminder?.title || note.text || "";
  const reminderAt = eventAt => eventAt - LEAD;

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const h24 = date.getHours();
    const period = h24 < 12 ? "上午" : "下午";
    const h12 = h24 % 12 || 12;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${period}${h12}:${pad(date.getMinutes())}`;
  }

  function showError(message, retry = false) {
    el.errorText.textContent = message;
    el.error.hidden = false;
    el.retry.hidden = !retry;
  }

  function clearError() {
    el.error.hidden = true;
    el.errorText.textContent = "";
    el.retry.hidden = true;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    for (const node of [el.title, el.date, el.period, el.hour, el.minute, el.save,
      el.cancel, el.remove, el.discard, el.fresh]) node.disabled = state.busy;
  }

  function readForm() {
    if (!el.date.value || !el.hour.value || !el.minute.value) return null;
    const [year, month, day] = el.date.value.split("-").map(Number);
    const selectedHour = Number(el.hour.value);
    const hour24 = el.period.value === "pm"
      ? (selectedHour % 12) + 12
      : selectedHour % 12;
    const minute = Number(el.minute.value);
    const date = new Date(year, month - 1, day, hour24, minute, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 ||
      date.getDate() !== day || date.getHours() !== hour24 || date.getMinutes() !== minute) return null;
    return date.getTime();
  }

  function setTime(eventAt) {
    const date = new Date(eventAt);
    const hour24 = date.getHours();
    el.date.value = localDate(date);
    el.period.value = hour24 < 12 ? "am" : "pm";
    el.hour.value = String(hour24 % 12 || 12);
    el.minute.value = pad(date.getMinutes());
  }

  function defaultEventTime() {
    const date = new Date();
    date.setSeconds(0, 0);
    date.setMinutes(0);
    date.setHours(date.getHours() + 2);
    return date.getTime();
  }

  function currentDraft() {
    return JSON.stringify({
      title: el.title.value.trim(), date: el.date.value,
      period: el.period.value, hour: el.hour.value, minute: el.minute.value,
    });
  }

  function updateDirty() {
    const dirty = currentDraft() !== state.baseline;
    state.dirty = dirty;
    el.saveState.textContent = dirty ? "有未保存的修改" : "";
    el.saveState.dataset.kind = dirty ? "dirty" : "";
    el.discard.hidden = !dirty;
    api?.setDirty(dirty);
  }

  function updatePreview() {
    clearError();
    const eventAt = readForm();
    if (eventAt == null) {
      el.preview.textContent = "请选择有效的日期和时间。";
      updateDirty();
      return;
    }
    const eventDate = new Date(eventAt);
    if (eventDate.getTime() - LEAD < Date.now()) {
      el.preview.textContent = `${formatDateTime(reminderAt(eventAt))}（已过提醒时间）`;
      el.hint.textContent = "为了确保能提前一小时准备，事项时间必须至少在一小时以后。";
    } else {
      el.preview.textContent = `${formatDateTime(reminderAt(eventAt))} 提醒你`;
      el.hint.textContent = "提醒只保存在这台电脑。电脑关机或完全退出小熊猫时无法准时提醒。";
    }
    updateDirty();
  }

  function remindersFlat() {
    const rows = [];
    for (const note of state.notes) {
      for (const reminder of note.reminders || []) rows.push({ note, reminder });
    }
    return rows.sort((a, b) => {
      const statusOrder = value => value === "pending" ? 0 : value === "sent" ? 1 : 2;
      return statusOrder(a.reminder.status) - statusOrder(b.reminder.status) ||
        a.reminder.eventAt - b.reminder.eventAt;
    });
  }

  function renderList() {
    const rows = remindersFlat();
    const legacyCount = state.notes.filter(note => !(note.reminders || []).length).length;
    el.count.textContent = String(rows.length);
    el.list.replaceChildren();
    el.listState.textContent = rows.length ? "" : "还没有安排。可以先写下一件需要准备的事。";
    el.legacy.hidden = legacyCount === 0;
    el.legacy.textContent = legacyCount
      ? `本机还保留着 ${legacyCount} 条旧记事。它们没有明确的日期和时间，因此不会作为提醒显示，也没有被删除。`
      : "";

    for (const { note, reminder } of rows) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "event-item";
      button.dataset.testid = `button-event-${note.id}-${reminder.id}`;
      button.setAttribute("aria-current",
        note.id === state.selectedNoteId && reminder.id === state.selectedReminderId ? "true" : "false");
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = titleOf(note, reminder);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `事项 ${formatDateTime(reminder.eventAt)} · 提前 ${formatDateTime(reminder.remindAt)}`;
      const status = document.createElement("span");
      status.className = "status";
      status.dataset.status = reminder.status;
      status.textContent = reminder.status === "pending" ? "待提醒"
        : reminder.status === "sent" ? "已提醒" : "已取消";
      button.append(title, meta, status);
      button.addEventListener("click", () => selectSchedule(note.id, reminder.id));
      item.append(button);
      el.list.append(item);
    }
  }

  function findSelected() {
    const note = state.notes.find(item => item.id === state.selectedNoteId);
    const reminder = note?.reminders?.find(item => item.id === state.selectedReminderId);
    return note && reminder ? { note, reminder } : null;
  }

  function captureBaseline() {
    state.baseline = currentDraft();
    state.dirty = false;
    el.discard.hidden = true;
    el.saveState.textContent = "";
    el.saveState.dataset.kind = "";
    api?.setDirty(false);
  }

  function loadForm(note, reminder) {
    el.title.value = titleOf(note, reminder);
    setTime(reminder.eventAt);
    el.page.textContent = reminder.status === "cancelled" ? "已取消的日程" : "修改日程";
    el.save.textContent = reminder.status === "cancelled" ? "重新启用提醒" : "保存修改";
    el.cancel.hidden = reminder.status !== "pending";
    el.remove.hidden = false;
    captureBaseline();
    updatePreview();
    renderList();
  }

  function newForm() {
    state.selectedNoteId = null;
    state.selectedReminderId = null;
    el.title.value = "";
    setTime(defaultEventTime());
    el.page.textContent = "新提醒";
    el.save.textContent = "保存提醒";
    el.cancel.hidden = true;
    el.remove.hidden = true;
    captureBaseline();
    updatePreview();
    renderList();
    el.title.focus();
  }

  function selectSchedule(noteId, reminderId) {
    if (state.dirty && !window.confirm("当前修改还没保存。要放弃修改并打开另一项吗？")) return;
    const note = state.notes.find(item => item.id === noteId);
    const reminder = note?.reminders?.find(item => item.id === reminderId);
    if (!note || !reminder) return;
    state.selectedNoteId = noteId;
    state.selectedReminderId = reminderId;
    loadForm(note, reminder);
  }

  async function refresh() {
    const priorNoteId = state.selectedNoteId;
    const priorReminderId = state.selectedReminderId;
    const result = await api.list();
    state.notes = result.notes || [];
    renderList();
    if (!state.dirty && priorNoteId && priorReminderId) {
      const note = state.notes.find(item => item.id === priorNoteId);
      const reminder = note?.reminders?.find(item => item.id === priorReminderId);
      if (note && reminder) loadForm(note, reminder);
      else newForm();
    }
    state.initialized = true;
  }

  function buildReminder(existing) {
    const eventAt = readForm();
    const title = el.title.value.trim();
    if (!title) throw new Error("请填写事项。");
    if (title.length > MAX_TITLE) throw new Error(`事项最多填写${MAX_TITLE}个字。`);
    if (eventAt == null) throw new Error("请选择有效的日期和时间。");
    if (eventAt < Date.now() + LEAD) throw new Error("事项至少要在一小时后，才能提前一小时提醒。");
    const unchanged = existing && existing.eventAt === eventAt &&
      existing.remindAt === reminderAt(eventAt);
    return {
      ...(existing ? { id: existing.id } : {}),
      title, eventAt, remindAt: reminderAt(eventAt),
      status: unchanged && existing.status === "sent" ? "sent" : "pending",
    };
  }

  async function saveSchedule(event) {
    event.preventDefault();
    if (state.busy) return;
    clearError();
    setBusy(true);
    try {
      const selected = findSelected();
      const nextReminder = buildReminder(selected?.reminder);
      const reminders = selected
        ? selected.note.reminders.map(item => item.id === selected.reminder.id ? nextReminder : item)
        : [nextReminder];
      const saved = await api.save({
        ...(selected ? { id: selected.note.id } : {}),
        text: nextReminder.title, reminders,
      });
      state.notes = state.notes.filter(item => item.id !== saved.id).concat(saved);
      state.selectedNoteId = saved.id;
      state.selectedReminderId = nextReminder.id || saved.reminders.find(item =>
        item.title === nextReminder.title && item.eventAt === nextReminder.eventAt)?.id || saved.reminders[0]?.id;
      const nextSelected = findSelected();
      if (nextSelected) loadForm(nextSelected.note, nextSelected.reminder);
      else newForm();
      el.saveState.textContent = "日程已保存在这台电脑";
      el.saveState.dataset.kind = "ok";
      renderList();
    } catch (error) {
      showError(error?.message || "保存失败，原有记录没有更改。", true);
    } finally { setBusy(false); }
  }

  function askConfirm(title, body, confirmText = "确定") {
    return new Promise(resolve => {
      el.confirmTitle.textContent = title;
      el.confirmBody.textContent = body;
      el.confirmYes.textContent = confirmText;
      const done = value => {
        el.confirm.removeEventListener("close", onClose);
        resolve(value);
      };
      const onClose = () => done(el.confirm.returnValue === "yes");
      el.confirm.addEventListener("close", onClose, { once: true });
      el.confirm.showModal();
    });
  }

  async function cancelSchedule() {
    const selected = findSelected();
    if (!selected || selected.reminder.status !== "pending") return;
    if (!await askConfirm("取消这项提醒？", "日程会保留在列表中，之后不会再提醒。", "取消提醒")) return;
    setBusy(true);
    try {
      const reminders = selected.note.reminders.map(item => item.id === selected.reminder.id
        ? { ...item, status: "cancelled" } : item);
      const saved = await api.save({ id: selected.note.id, text: selected.note.text, reminders });
      state.notes = state.notes.map(item => item.id === saved.id ? saved : item);
      loadForm(saved, saved.reminders.find(item => item.id === selected.reminder.id));
    } catch (error) { showError(error?.message || "取消失败，记录没有更改。", true); }
    finally { setBusy(false); }
  }

  async function deleteSchedule() {
    const selected = findSelected();
    if (!selected) return;
    if (!await askConfirm("删除这项日程？", "这项安排和它的提醒将从本机日程中删除。", "删除")) return;
    setBusy(true);
    try {
      const remaining = selected.note.reminders.filter(item => item.id !== selected.reminder.id);
      if (remaining.length) {
        const saved = await api.save({
          id: selected.note.id, text: remaining[0].title || selected.note.text, reminders: remaining,
        });
        state.notes = state.notes.map(item => item.id === saved.id ? saved : item);
      } else {
        await api.remove(selected.note.id);
        state.notes = state.notes.filter(item => item.id !== selected.note.id);
      }
      newForm();
    } catch (error) { showError(error?.message || "删除失败，记录没有更改。", true); }
    finally { setBusy(false); }
  }

  async function discardChanges() {
    if (!state.dirty || !await askConfirm("放弃未保存的修改？", "已经保存的日程不会受影响。", "放弃修改")) return;
    const selected = findSelected();
    if (selected) loadForm(selected.note, selected.reminder);
    else newForm();
  }

  async function closeWindow() {
    if (state.dirty && !await askConfirm("放弃未保存的日程草稿？", "已保存的日程不会受影响。", "关闭")) return;
    if (state.dirty) api?.setDirty(false);
    await api.close();
  }

  function populateTimeControls() {
    for (let hour = 1; hour <= 12; hour++) {
      const option = document.createElement("option");
      option.value = String(hour);
      option.textContent = `${hour}时`;
      el.hour.append(option);
    }
    for (let minute = 0; minute < 60; minute++) {
      const option = document.createElement("option");
      option.value = pad(minute);
      option.textContent = pad(minute);
      el.minute.append(option);
    }
  }

  async function start() {
    if (!api) {
      showError("日程功能无法连接桌面程序，请关闭后重新打开。");
      return;
    }
    populateTimeControls();
    const now = new Date();
    el.date.min = localDate(now);
    el.form.addEventListener("input", updatePreview);
    el.form.addEventListener("change", updatePreview);
    el.form.addEventListener("submit", saveSchedule);
    el.fresh.addEventListener("click", () => {
      if (!state.dirty || window.confirm("放弃当前未保存的修改并新建日程吗？")) newForm();
    });
    el.cancel.addEventListener("click", cancelSchedule);
    el.remove.addEventListener("click", deleteSchedule);
    el.discard.addEventListener("click", discardChanges);
    el.close.addEventListener("click", closeWindow);
    el.retry.addEventListener("click", async () => {
      setBusy(true);
      try { await refresh(); clearError(); }
      catch (error) { showError(error?.message || "读取失败，请重新打开日程本。", true); }
      finally { setBusy(false); }
    });
    el.confirmNo.addEventListener("click", () => { el.confirm.returnValue = "no"; });
    el.confirmYes.addEventListener("click", () => { el.confirm.returnValue = "yes"; });
    api.onChanged(data => {
      const keepDraft = state.dirty || state.busy;
      state.notes = data.notes || [];
      renderList();
      if (!keepDraft && state.initialized) {
        const selected = findSelected();
        if (selected) loadForm(selected.note, selected.reminder);
        else newForm();
      }
    });
    try {
      await refresh();
      newForm();
    } catch (error) {
      showError(error?.message || "读取本机日程失败，记录没有被覆盖。", true);
      el.save.disabled = true;
    }
  }
  start();
})();
