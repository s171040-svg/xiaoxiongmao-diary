"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  clampWindowOrigin,
  desktopBundleFiles,
  parseWindowScanOutput,
  transparentPetOptions,
  windowScanCommand,
} = require("./pet-window.cjs");

test("a dragged pet window stays inside the work area", () => {
  const area = { x: 20, y: 40, width: 800, height: 600 };
  const size = { width: 340, height: 360 };
  assert.deepEqual(
    clampWindowOrigin({ x: -100, y: 10 }, size, area),
    { x: 20, y: 40 },
  );
  assert.deepEqual(
    clampWindowOrigin({ x: 900, y: 900 }, size, area),
    { x: 480, y: 280 },
  );
});

test("PowerShell UTF-16 window JSON still parses", () => {
  const json = JSON.stringify([{ x: 10, y: 20, width: 300, height: 200 }]);
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, "utf16le")]);
  const rects = parseWindowScanOutput(buffer);
  assert.equal(rects.length, 1);
  assert.equal(rects[0].width, 300);
  assert.deepEqual(parseWindowScanOutput(json), rects);
});

test("empty or broken window scans do not invent a desktop-sized obstacle", () => {
  assert.deepEqual(parseWindowScanOutput("[]"), []);
  assert.throws(() => parseWindowScanOutput("not-json"));
});

test("the Windows scan forces UTF-8 and ignores the shell and desktop", () => {
  const command = windowScanCommand(4242);
  assert.match(command, /UTF8Encoding/);
  assert.match(command, /GetWindows\(4242\)/);
  assert.match(command, /Shell_TrayWnd/);
  assert.throws(() => windowScanCommand(1.5));
});

test("transparent pet windows opt out of the Windows thick frame", () => {
  const options = transparentPetOptions();
  assert.equal(options.transparent, true);
  assert.equal(options.frame, false);
  assert.equal(options.thickFrame, false);
  assert.equal(options.roundedCorners, false);
  assert.equal(options.backgroundColor, "#00000000");
});

test("the Windows package includes the gift window and icon", () => {
  for (const file of ["gift.html", "gift-drop.css", "gift-renderer.js", "icon.ico", "pet.html"]) {
    assert.equal(desktopBundleFiles.includes(file), true, file);
    assert.equal(fs.existsSync(path.join(__dirname, file)), true, `${file} exists`);
  }
  const icon = fs.readFileSync(path.join(__dirname, "icon.ico"));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const ihdr = icon.indexOf(Buffer.from("IHDR"));
  assert.ok(ihdr > 0);
  assert.ok(icon.readUInt32BE(ihdr + 4) >= 256, "Windows installer icon must be at least 256px");
  assert.ok(icon.readUInt32BE(ihdr + 8) >= 256);
});
