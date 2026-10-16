"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "vite", "build", "--outDir", "dist/desktop"], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  env: { ...process.env, PORT: "21836", BASE_PATH: "./", NODE_ENV: "production" },
  shell: process.platform === "win32",
});
process.exitCode = result.status ?? 1;
