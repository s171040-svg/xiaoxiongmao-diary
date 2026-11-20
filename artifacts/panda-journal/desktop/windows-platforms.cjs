"use strict";
const { spawn } = require("node:child_process");

// One persistent process: compile Win32 bindings once, then return bounds only.
// No titles, screenshots, browser contents or administrator rights are requested.
function scanScript(ownPid) {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PandaPlatforms {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  public sealed class Item {
    public string id; public int x, y, width, height, z;
  }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int GetFrame(IntPtr hwnd, int attr, out RECT rect, int size);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int GetCloak(IntPtr hwnd, int attr, out int value, int size);
  public static Item[] Snapshot(int ownPid) {
    try { SetProcessDPIAware(); } catch {}
    var items = new List<Item>(); int order = 0;
    EnumProc callback = (hwnd, param) => {
      int z = order++;
      if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid == (uint)ownPid || (GetWindowLong(hwnd, -20) & 0x80) != 0) return true;
      int cloaked;
      if (GetCloak(hwnd, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      var text = new StringBuilder(128); GetClassName(hwnd, text, 128);
      string name = text.ToString();
      if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd") return true;
      RECT rect;
      if (GetFrame(hwnd, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(hwnd, out rect)) return true;
      if (rect.Right - rect.Left < 42 || rect.Bottom - rect.Top < 20) return true;
      items.Add(new Item { id = hwnd.ToInt64().ToString(), x = rect.Left, y = rect.Top,
        width = rect.Right - rect.Left, height = rect.Bottom - rect.Top, z = z });
      return true;
    };
    EnumWindows(callback, IntPtr.Zero); GC.KeepAlive(callback); return items.ToArray();
  }
}
'@
while ($true) {
  $items = [PandaPlatforms]::Snapshot(${ownPid})
  $json = ConvertTo-Json -InputObject @($items) -Compress
  [Console]::WriteLine($json)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 200
}
`;
}
function parseSnapshot(line) {
  const parsed = JSON.parse(line.replace(/^\uFEFF/, "").trim());
  if (!Array.isArray(parsed) || parsed.length > 4096) throw new Error("Invalid platform snapshot");
  return parsed.map(w => {
    if (!w || typeof w.id !== "string" || !/^\d+$/.test(w.id)
      || ![w.x, w.y, w.width, w.height, w.z].every(Number.isFinite)
      || w.width <= 0 || w.height <= 0) throw new Error("Invalid window bounds");
    return { id: w.id, x: w.x, y: w.y, width: w.width, height: w.height, z: w.z };
  });
}
function localWindows(windows, origin, toDip) {
  return windows.map(w => {
    const dip = toDip({ x: w.x, y: w.y, width: w.width, height: w.height });
    return { id: w.id, x: dip.x - origin.x, y: dip.y - origin.y,
      width: dip.width, height: dip.height, z: w.z };
  });
}
function createScanner({ onSnapshot, onFailure, ownPid = process.pid }) {
  let child = null, retry = null, watchdog = null, running = false, warned = false;
  function launch() {
    if (!running || child) return;
    const current = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive",
      "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(scanScript(ownPid), "utf16le").toString("base64")],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child = current;
    let pending = "", failed = false;
    function failure() {
      if (failed || !running || child !== current) return;
      failed = true;
      if (!warned) { warned = true; onFailure(); }
      onSnapshot([]); // Keep the taskbar, never convert the whole screen into an obstacle.
      current.kill();
    }
    function armWatchdog() {
      clearTimeout(watchdog);
      watchdog = setTimeout(failure, 5000);
    }
    armWatchdog();
    current.stdout.setEncoding("utf8");
    current.stdout.on("data", data => {
      if (!running || child !== current || failed) return;
      pending += data;
      if (pending.length > 256 * 1024) { failure(); return; }
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try { const windows = parseSnapshot(line); warned = false; onSnapshot(windows); armWatchdog(); }
        catch { failure(); break; }
      }
    });
    current.stderr.resume();
    current.on("error", failure);
    current.on("exit", () => {
      if (child !== current) return;
      failure(); child = null; clearTimeout(watchdog);
      if (running) retry = setTimeout(launch, 5000);
    });
    // spawn errors may emit close without exit.
    current.on("close", () => {
      if (child !== current) return;
      failure(); child = null; clearTimeout(watchdog);
      if (running) retry = setTimeout(launch, 5000);
    });
  }
  return {
    start() { if (!running) { running = true; launch(); } },
    stop() {
      running = false; clearTimeout(retry); clearTimeout(watchdog);
      const previous = child; child = null; previous?.kill();
    },
  };
}
module.exports = { scanScript, parseSnapshot, localWindows, createScanner };
