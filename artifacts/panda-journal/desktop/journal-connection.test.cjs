"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { targets, readTarget, saveTarget, targetById } = require("./journal-connection.cjs");

test("installed client connects to the current online room, never a file URL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-connection-"));
  try {
    assert.equal(readTarget(directory).id, "preview");
    for (const target of targets) assert.equal(new URL(target.url).protocol, "https:");
    saveTarget(directory, "production");
    assert.equal(readTarget(directory).id, "production");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "journal-connection.json"))), { targetId: "production" });
    saveTarget(directory, "preview");
    assert.equal(readTarget(directory).id, "preview");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("unknown hosts and damaged settings cannot silently switch environments", () => {
  assert.throws(() => targetById("https://example.com/room"), /设置无效/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-connection-"));
  try {
    fs.writeFileSync(path.join(directory, "journal-connection.json"), "{broken");
    assert.throws(() => readTarget(directory), /无法读取/);
    saveTarget(directory, "preview");
    assert.equal(readTarget(directory).id, "preview");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
