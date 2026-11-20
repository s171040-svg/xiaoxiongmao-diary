"use strict";
const fs = require("node:fs");
const path = require("node:path");
const config = require("./journal-targets.json");

function targetById(id) {
  const target = config.targets.find(value => value.id === id);
  if (!target) throw new Error("房间连接设置无效，请从托盘重新选择网页版房间。");
  const url = new URL(target.url);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("网页版房间必须使用安全的网址。");
  return target;
}
function readTarget(directory) {
  let id = config.defaultTarget;
  try {
    id = JSON.parse(fs.readFileSync(path.join(directory, "journal-connection.json"), "utf8")).targetId;
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("房间连接设置无法读取，请从托盘重新选择网页版房间。");
  }
  return targetById(id);
}
function saveTarget(directory, id) {
  const target = targetById(id);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "journal-connection.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ targetId: target.id }), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
  return target;
}
module.exports = { targets: config.targets, readTarget, saveTarget, targetById };
