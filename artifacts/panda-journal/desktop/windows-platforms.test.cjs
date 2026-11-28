const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { scanScript, parseSnapshot, localWindows, createScanner } = require("./windows-platforms.cjs");

test("scanner accepts only stable window IDs and valid bounds, stripping unrelated fields", () => {
  const windows = parseSnapshot('\uFEFF[{"id":"123","x":100,"y":200,"width":500,"height":300,"z":2,"title":"not retained"}]');
  assert.deepEqual(windows, [{ id: "123", x: 100, y: 200, width: 500, height: 300, z: 2 }]);
  assert.throws(() => parseSnapshot("{}"));
  assert.throws(() => parseSnapshot('[{"id":"123","x":0,"y":0,"width":-1,"height":5,"z":0}]'));
});
test("physical bounds are converted to DIP before subtracting the primary work-area origin", () => {
  const windows = localWindows([{ id: "1", x: 300, y: 600, width: 900, height: 450, z: 0 }],
    { x: 200, y: 40 }, rect => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value / 1.5])));
  assert.deepEqual(windows, [{ id: "1", x: 0, y: 360, width: 600, height: 300, z: 0 }]);
});
test("Win32 script excludes minimized, cloaked, shell and own-process windows", () => {
  const script = scanScript(12345);
  for (const clause of ["IsIconic(hwnd)", "GetCloak(hwnd, 14", 'name == "Shell_TrayWnd"',
    "pid == (uint)ownPid", "GetFrame(hwnd, 9", "Snapshot(12345)", "Start-Sleep -Milliseconds 200"]) {
    assert(script.includes(clause), clause);
  }
  assert(!script.includes("GetWindowText"), "the scanner never reads private window titles");
});
test("missing PowerShell falls back to taskbar instead of freezing or leaving a process", {
  skip: process.platform === "win32", timeout: 8000,
}, async () => {
  let failures = 0, scanner;
  const snapshot = await new Promise(resolve => {
    scanner = createScanner({ onFailure() { failures++; },
      onSnapshot(windows) { scanner.stop(); resolve(windows); } });
    scanner.start();
  });
  assert.deepEqual(snapshot, []); assert.equal(failures, 1);
});
test("real Windows scanner compiles once and produces two bounds-only snapshots", {
  skip: process.platform !== "win32", timeout: 30000,
}, () => {
  const script = scanScript(process.pid).replace("while ($true)", "for ($i = 0; $i -lt 2; $i++)");
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
    "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { encoding: "utf8", timeout: 25000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/).filter(line => line.trim());
  assert.equal(lines.length, 2);
  for (const line of lines) assert(Array.isArray(parseSnapshot(line)));
});
