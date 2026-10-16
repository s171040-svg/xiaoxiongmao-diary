"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Nix's Electron includes Linux GUI libraries; the npm binary is used on
// ordinary Windows/macOS/Linux installations.
let executable;
if (process.env.REPL_ID && process.platform === "linux") {
  executable = process.env.PATH.split(path.delimiter)
    .filter((directory) => !directory.includes("node_modules"))
    .map((directory) => path.join(directory, "electron"))
    .find((candidate) => fs.existsSync(candidate));
}
executable ||= require("electron");
const args = [path.join(__dirname, "main.cjs"), ...process.argv.slice(2)];
if (process.env.REPL_ID && process.platform === "linux") args.unshift("--no-sandbox");
const child = spawn(executable, args, { stdio: "inherit", env: process.env });
child.on("error", (error) => { console.error("无法启动 Electron：", error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
