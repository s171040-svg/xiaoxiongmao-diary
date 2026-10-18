"use strict";

// 桌宠窗口的纯逻辑：不依赖 Electron，方便在 Linux 上测 Windows 行为。

const desktopBundleFiles = [
  "main.cjs",
  "preload.cjs",
  "pet.html",
  "pet.css",
  "pet-renderer.js",
  "roaming-geometry.js",
  "pet-window.cjs",
  "gift.html",
  "gift-drop.css",
  "gift-renderer.js",
  "icon.ico",
];

function clampWindowOrigin(origin, size, area) {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  return {
    x: Math.round(Math.min(maxX, Math.max(area.x, origin.x))),
    y: Math.round(Math.min(maxY, Math.max(area.y, origin.y))),
  };
}

function parseWindowScanOutput(output) {
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(String(output ?? ""), "utf8");
  const texts = [];
  const hasUtf16Bom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const looksUtf16 = hasUtf16Bom || buffer.includes(0);
  if (looksUtf16) texts.push(buffer.toString("utf16le").replace(/^\uFEFF/, "").trim());
  texts.push(buffer.toString("utf8").replace(/^\uFEFF/, "").trim());

  let lastError;
  for (const text of texts) {
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      const rects = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      return rects.filter((rect) => rect
        && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        && rect.width > 0 && rect.height > 0);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("窗口扫描结果是空的。");
}

// Windows PowerShell 5.1 把管道输出写成 UTF-16，Node 按 UTF-8 读会解析失败。
// 扫描失败时不能把整块桌面当成障碍，否则小熊猫会一直停住。
function windowScanCommand(pid) {
  if (!Number.isInteger(pid) || pid < 0) throw new Error("无效的进程号。");
  return `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PandaWindowBounds {
  [StructLayout(LayoutKind.Sequential)]
  private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public sealed class WindowRect {
    public int x { get; set; }
    public int y { get; set; }
    public int width { get; set; }
    public int height { get; set; }
  }
  [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public static WindowRect[] GetWindows(int ownProcessId) {
    try { SetProcessDPIAware(); } catch { }
    var result = new List<WindowRect>();
    EnumWindowsProc callback = (hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      if (processId == (uint)ownProcessId) return true;
      var className = new StringBuilder(128);
      GetClassName(hWnd, className, className.Capacity);
      var name = className.ToString();
      if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd") return true;
      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return true;
      var width = rect.Right - rect.Left;
      var height = rect.Bottom - rect.Top;
      if (width < 48 || height < 48) return true;
      result.Add(new WindowRect { x = rect.Left, y = rect.Top, width = width, height = height });
      return true;
    };
    EnumWindows(callback, IntPtr.Zero);
    GC.KeepAlive(callback);
    return result.ToArray();
  }
}
'@
$windows = [PandaWindowBounds]::GetWindows(${pid})
ConvertTo-Json -InputObject @($windows) -Compress
`;
}

// Windows 11 的圆角和粗边框会把透明窗口画成白/黑块。
function transparentPetOptions() {
  return {
    transparent: true,
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    resizable: false,
    fullscreenable: false,
  };
}

module.exports = {
  desktopBundleFiles,
  clampWindowOrigin,
  parseWindowScanOutput,
  windowScanCommand,
  transparentPetOptions,
};
