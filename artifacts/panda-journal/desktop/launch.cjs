"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const desktopDir = __dirname;
const packageRoot = path.join(desktopDir, "..");
const dev = process.argv.includes("--dev");

function electronExecutable() {
  let executable;
  if (process.env.REPL_ID && process.platform === "linux") {
    executable = process.env.PATH.split(path.delimiter)
      .filter((directory) => !directory.includes("node_modules"))
      .map((directory) => path.join(directory, "electron"))
      .find((candidate) => fs.existsSync(candidate));
  }
  try {
    executable ||= require("electron");
  } catch (error) {
    console.error("找不到 Electron：", error.message);
    console.error("请在仓库根目录运行 pnpm install，并允许 electron 的安装脚本。");
    process.exit(1);
  }
  return executable;
}

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(port, timeoutMs = 40000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await portOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`日记页面在 ${Math.round(timeoutMs / 1000)} 秒内没有在端口 ${port} 启动。`);
}

// 本机和 Windows 的 desktop:dev 需要自己把日记页面拉起来。
// Replit 仍由外部工作流提供 localhost:80，这里不重复启动。
async function ensureJournalServer() {
  if (!dev || process.env.PANDA_JOURNAL_URL || process.env.REPL_ID) return null;
  const port = 21836;
  const alreadyUp = await portOpen(port);
  process.env.PANDA_JOURNAL_URL = `http://127.0.0.1:${port}/`;
  if (alreadyUp) return null;
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: packageRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PORT: String(port), BASE_PATH: "/", NODE_ENV: "development" },
  });
  let failed = false;
  child.on("exit", (code) => {
    if (!failed && code) console.error("日记页面已退出，代码", code);
  });
  try {
    await waitForPort(port);
  } catch (error) {
    failed = true;
    child.kill("SIGTERM");
    throw error;
  }
  return child;
}

async function main() {
  const journal = await ensureJournalServer();
  const executable = electronExecutable();
  if (!executable || !fs.existsSync(executable)) {
    console.error("Electron 可执行文件不存在。请在仓库根目录运行 pnpm install。");
    journal?.kill("SIGTERM");
    process.exit(1);
  }
  const args = [path.join(desktopDir, "main.cjs"), ...process.argv.slice(2)];
  if (process.env.REPL_ID && process.platform === "linux") args.unshift("--no-sandbox");
  const child = spawn(executable, args, { stdio: "inherit", env: process.env });
  const shutdown = () => {
    child.kill("SIGTERM");
    journal?.kill("SIGTERM");
  };
  child.on("error", (error) => {
    console.error("无法启动 Electron：", error.message);
    journal?.kill("SIGTERM");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    journal?.kill("SIGTERM");
    process.exitCode = code ?? 1;
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
