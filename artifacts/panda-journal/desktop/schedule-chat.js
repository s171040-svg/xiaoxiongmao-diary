"use strict";
(() => {
  const api = window.pandaScheduleChat;
  const $ = id => document.getElementById(id);
  const input = $("message");
  const form = $("message-form");
  const send = $("send");
  const reply = $("reply");
  const card = $("parse-card");
  const parseTitle = $("parse-title");
  const parseDetail = $("parse-detail");
  const charCount = $("char-count");
  let draft = null;
  let revision = 0;
  let timer = null;

  function displayTime(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(value));
  }

  function showInvalid(message) {
    draft = null;
    send.disabled = true;
    card.dataset.state = "invalid";
    parseTitle.textContent = "我还不能放心替你记下";
    parseDetail.textContent = message;
  }

  async function parseDraft() {
    const current = ++revision;
    const text = input.value.trim();
    charCount.textContent = `${input.value.length} / 240`;
    api?.setDirty(Boolean(text));
    if (!text) {
      showInvalid("写一句你想记住的安排吧。");
      reply.textContent = "可以像这样告诉我：明天下午三点和客户开会。";
      return;
    }
    send.disabled = true;
    draft = null;
    card.dataset.state = "";
    parseTitle.textContent = "小熊猫正在确认日期和时间…";
    parseDetail.textContent = "内容只在这台电脑上解析，不会发送到网络。";
    try {
      const result = await api.parse(text);
      if (current !== revision) return;
      if (!result.ok) {
        showInvalid(result.message);
        reply.textContent = "我先确认清楚，避免提醒错时间。";
        return;
      }
      draft = result;
      send.disabled = false;
      card.dataset.state = "valid";
      parseTitle.textContent = `我会记下：${result.title}`;
      parseDetail.textContent = `${displayTime(result.eventAt)} · ${displayTime(result.remindAt)} 提醒你准备`;
      reply.textContent = "日期、时间和事项都确认好了，可以发送给我。";
    } catch {
      if (current !== revision) return;
      showInvalid("日程助手暂时没有响应。你的安排还没有保存，请稍后再试。");
    }
  }

  function scheduleParse() {
    clearTimeout(timer);
    revision += 1;
    draft = null;
    send.disabled = true;
    api?.setDirty(Boolean(input.value.trim()));
    timer = setTimeout(() => void parseDraft(), 180);
  }

  async function saveSchedule(event) {
    event.preventDefault();
    if (!draft || send.disabled || !api) return;
    send.disabled = true;
    const saved = draft;
    try {
      await api.save({
        text: saved.title,
        reminders: [{
          title: saved.title,
          eventAt: saved.eventAt,
          remindAt: saved.remindAt,
          status: "pending",
        }],
      });
      input.value = "";
      draft = null;
      api.setDirty(false);
      card.dataset.state = "valid";
      parseTitle.textContent = "记好啦！";
      parseDetail.textContent = `我会在 ${displayTime(saved.remindAt)} 提醒你准备。`;
      reply.textContent = `收到，我把“${saved.title}”放进本机日程了。`;
      charCount.textContent = "0 / 240";
      input.focus();
    } catch (error) {
      showInvalid(error?.message || "保存失败，原有日程没有更改。请检查内容后重试。");
      send.disabled = false;
    }
  }

  input.addEventListener("input", scheduleParse);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !send.disabled) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", saveSchedule);
  $("close").addEventListener("click", () => api.hide());
  $("open-list").addEventListener("click", () => api.openNotebook());
  window.addEventListener("DOMContentLoaded", () => input.focus(), { once: true });
  if (!api) showInvalid("日程助手无法连接桌面程序，请关闭后重新打开。");
})();
