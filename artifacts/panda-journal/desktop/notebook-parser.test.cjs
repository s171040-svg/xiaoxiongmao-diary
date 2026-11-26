"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseScheduleText, LEAD_MS } = require("./notebook-parser.cjs");

const now = new Date(2026, 10, 25, 10, 0).getTime();
const expected = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

test("parses relative Chinese dates, periods, half hours, and event titles locally", () => {
  const result = parseScheduleText("明天下午三点半和客户开会", now);
  assert.equal(result.ok, true);
  assert.equal(result.title, "和客户开会");
  assert.equal(result.eventAt, expected(26, 15, 30));
  assert.equal(result.remindAt, expected(26, 14, 30));
});

test("parses explicit dates and unambiguous 24-hour time", () => {
  const result = parseScheduleText("请帮我2026年11月27日 15:20 交报告", now);
  assert.equal(result.ok, true);
  assert.equal(result.title, "交报告");
  assert.equal(result.eventAt, expected(27, 15, 20));
  assert.equal(result.eventAt - result.remindAt, LEAD_MS);
  assert.match(parseScheduleText("明天3:30开会", now).message, /上午还是下午/);
  const afternoon = parseScheduleText("明天下午3:30开会", now);
  assert.equal(afternoon.eventAt, expected(26, 15, 30));
});

test("parses weekdays and Chinese time words", () => {
  const result = parseScheduleText("下周一晚上八点给妈妈打电话", now);
  assert.equal(result.ok, true);
  assert.equal(result.title, "给妈妈打电话");
  assert.equal(result.eventAt, new Date(2026, 10, 30, 20, 0).getTime());
  const midnight = parseScheduleText("明天晚上十二点睡觉", now);
  assert.equal(midnight.eventAt, new Date(2026, 10, 27, 0, 0).getTime());
});

test("requests a day or time instead of guessing", () => {
  assert.match(parseScheduleText("下午三点开会", now).message, /是哪一天/);
  assert.match(parseScheduleText("明天开会", now).message, /具体时间/);
  assert.match(parseScheduleText("明天三点开会", now).message, /不确定是上午还是下午/);
  assert.match(parseScheduleText("明天下午三点", now).message, /具体要做什么/);
  assert.match(parseScheduleText("11月20日下午三点开会", now).message, /日期今年已经过去/);
});

test("rejects invalid dates, past reminders, and events less than an hour away", () => {
  assert.match(parseScheduleText("2026年2月30日下午三点开会", now).message, /日期或时间不存在/);
  assert.match(parseScheduleText("今天上午十点五十九分开会", now).message, /一小时以后/);
  assert.match(parseScheduleText("今天上午十点半开会", now).message, /一小时以后/);
});
