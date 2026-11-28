"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { runInNewContext } = require("node:vm");
const path = require("node:path");
const { samplePoint, pixelScript } = require("./windows-pixel.cjs");
const sandbox = { module: { exports: {} }, globalThis: {} };
runInNewContext(readFileSync(path.join(__dirname, "background-bite.js"), "utf8"), sandbox);
const bite = sandbox.module.exports;

test("background bites wait for an occasional walk and never interrupt quiet, rest, or drag", () => {
  const auto = { mode: "desktop", identityStatus: "offline-trial", identityReady: true, backgroundBite: true };
  assert.equal(bite.canStart(auto, true, false, false), true);
  for (const override of [{ quietMode: true }, { paused: true }, { restPose: "sleep" },
    { backgroundBite: false }, { identityStatus: "ready" }, { mode: "room" }]) {
    assert.equal(bite.canStart({ ...auto, ...override }, true, false, false), false);
  }
  for (const args of [[false, false, false], [true, true, false], [true, false, true]]) {
    assert.equal(bite.canStart(auto, ...args), false);
  }
  const resting = { ...auto, backgroundBite: false, restPose: "sleep" };
  assert.equal(bite.canStart(resting, false, false, false), false);
  assert.equal(bite.canStart(resting, false, false, false, true), true);
  assert.equal(bite.canStart(resting, false, true, false, true), false);
  assert.equal(bite.canStart({ ...resting, identityStatus: "ready" }, false, false, false, true), false);
  assert.equal(bite.nextAt(1000, () => 0, true), 19000);
  assert.equal(bite.nextAt(1000, () => 0), 39000);
  assert.equal(bite.nextAt(1000, () => 0.5), 56500);
});

test("sample point stays by the pet and uses screen-relative coordinates even with offset monitors", () => {
  const overlay = { x: -640, y: 40, width: 640, height: 360 };
  const display = { ...overlay, height: 400 };
  const pet = { x: 220, y: 320, width: 40, height: 40 };
  assert.deepEqual(samplePoint(pet, overlay, display, false, true), { x: -382, y: 395 });
  assert.deepEqual(samplePoint({ ...pet, y: 160 }, overlay, display, true, false), { x: -418, y: 244 });
  assert.equal(samplePoint({ ...pet, x: 620 }, overlay, display, false, true), null);
  assert.equal(samplePoint({ ...pet, width: 400 }, overlay, display, false, true), null);
  assert.throws(() => pixelScript(10.5, 2), TypeError);
  assert.throws(() => pixelScript("1+2", 3), TypeError);
  assert.match(pixelScript(-10, 12), /GetPixel\(dc, x, y\)/);
  assert.doesNotMatch(pixelScript(-10, 12), /BitBlt|CopyFromScreen|PrintWindow|Save\(/);
});

test("pixel bite and fragments use the sampled color, progress, then disappear", () => {
  function render(color, elapsed, left = false) {
    const rects = [];
    const ctx = {
      clearRect() {}, save() {}, restore() {},
      fillRect(x, y, w, h) { rects.push({ color: this.fillStyle, x, y, w, h }); },
    };
    bite.draw(ctx, { color, left }, elapsed);
    return rects;
  }
  assert.deepEqual(render("#9a34b6", 200), [], "the panda lowers itself before the ledge reacts");
  assert(render("#9a34b6", 470).some(rect => rect.color === "#9a34b6"));
  assert(render("#12a980", bite.biteAt + 80).some(rect => rect.color === "#12a980"));
  assert.notDeepEqual(render("#12a980", bite.biteAt), render("#9a34b6", bite.biteAt));
  assert.notDeepEqual(render("#12a980", bite.biteAt, true), render("#12a980", bite.biteAt));
  assert.deepEqual(render("#12a980", bite.duration), []);
  assert.deepEqual(render("unknown", 450), []);
});

test("the ledge bite has six distinct crouch frames, a curled bite with visible jaw motion, and returns to rest", () => {
  const enter = Array.from({ length: 6 }, (_, index) => bite.frameAt(index * 68).source);
  const exit = Array.from({ length: 6 }, (_, index) => bite.frameAt(1284 + index * 68).source);
  assert.equal(new Set(enter).size, 6);
  assert.deepEqual(exit, [...enter].reverse());
  assert.match(bite.frameAt(480).source, /walk-to-sleep-7\.png$/);
  assert.match(bite.frameAt(bite.biteAt - 1).source, /jaw-2\.png$/);
  assert.match(bite.frameAt(bite.biteAt).source, /jaw-3\.png$/);
  assert.equal(bite.frameAt(0).nativeLeft, false);
  assert.equal(bite.frameAt(bite.biteAt).nativeLeft, true);
  assert.equal(bite.frameAt(0, true).source, bite.frameAt(bite.duration - 1, true).source);
  const hashes = bite.spriteSources.map(source => {
    const png = readFileSync(path.resolve(__dirname, source));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), 96);
    assert.equal(png.readUInt32BE(20), 96);
    return createHash("sha256").update(png).digest("hex");
  });
  assert.equal(new Set(hashes).size, bite.spriteSources.length, "no duplicate in-between sprites");
});

test("Windows compiles the real 1-pixel reader and samples a known-color native window", {
  skip: process.platform !== "win32", timeout: 30000,
}, () => {
  const script = pixelScript(20, 20).replace(
    "[Console]::WriteLine([PandaBackgroundColor]::Read(20, 20))",
    `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not [System.Windows.Forms.SystemInformation]::UserInteractive) {
  [Console]::WriteLine('no interactive desktop')
  return
}
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(80, 80)
$form.Size = New-Object System.Drawing.Size(128, 128)
$form.BackColor = [System.Drawing.Color]::FromArgb(29, 112, 173)
$form.TopMost = $true
try {
  $form.Show()
  $form.Refresh()
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 200
  $point = $form.PointToScreen((New-Object System.Drawing.Point(48, 48)))
  [Console]::WriteLine([PandaBackgroundColor]::Read($point.X, $point.Y))
} finally { $form.Dispose() }
`);
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", windowsHide: true, timeout: 25000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^(?:#1D70AD|no interactive desktop)$/);
});
