"use strict";
const { execFile } = require("node:child_process");
const path = require("node:path");

// Stay close to the feet, just beyond the sprite. On a window sample below
// its top edge; at the taskbar stay inside the visible desktop work area.
function samplePoint(pet, overlay, display, left, taskbar) {
  if (!pet || Math.abs(pet.width - 40) > 2 || Math.abs(pet.height - 40) > 2
    || pet.x < -1 || pet.y < -1 || pet.x + pet.width > overlay.width + 1
    || pet.y + pet.height > overlay.height + 1) return null;
  const x = Math.round(overlay.x + pet.x + pet.width / 2 + (left ? -18 : 18));
  const sole = overlay.y + pet.y + pet.height;
  const y = Math.round(taskbar ? sole - 5 : sole + 4);
  if (x < display.x || y < display.y || x >= display.x + display.width || y >= display.y + display.height) return null;
  return { x, y };
}

function pixelScript(x, y) {
  if (![x, y].every(value => Number.isSafeInteger(value) && Math.abs(value) < 65536)) throw new TypeError("Invalid screen point");
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PandaBackgroundColor {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
  [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr hdc, int x, int y);
  public static void SetDpi() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
  }
  public static string Read(int x, int y) {
    IntPtr dc = GetDC(IntPtr.Zero);
    if (dc == IntPtr.Zero) return "";
    try {
      uint color = GetPixel(dc, x, y);
      return color == 0xFFFFFFFF ? "" : String.Format("#{0:X2}{1:X2}{2:X2}", color & 255, (color >> 8) & 255, (color >> 16) & 255);
    } finally { ReleaseDC(IntPtr.Zero, dc); }
  }
}
'@
[PandaBackgroundColor]::SetDpi()
[Console]::WriteLine([PandaBackgroundColor]::Read(${x}, ${y}))
`;
}

function readPixel(point) {
  const script = pixelScript(point.x, point.y);
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise(resolve => execFile(executable, ["-NoLogo", "-NoProfile", "-NonInteractive",
    "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { windowsHide: true, timeout: 2500, maxBuffer: 4096 }, (error, stdout) => {
    const color = stdout.trim();
    // Skip the animation if the pixel is unavailable. No fallback color,
    // screenshots, files, or captured color diagnostics.
    resolve(!error && /^#[0-9a-f]{6}$/i.test(color) ? color : null);
  }));
}

module.exports = { pixelScript, readPixel, samplePoint };
