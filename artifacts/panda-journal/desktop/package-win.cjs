"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { desktopBundleFiles } = require("./pet-window.cjs");
const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const stageRoot = path.join(packageRoot, "dist", "windows-app");
const outputRoot = path.join(workspaceRoot, "generated-artifacts", "windows-installer");
const packageInfo = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const electronPackagePath = path.join(packageRoot, "node_modules", "electron", "package.json");
if (!fs.existsSync(electronPackagePath)) {
  throw new Error("找不到 electron。请在仓库根目录运行 pnpm install，并允许 electron 的安装脚本。");
}
const electronVersion = JSON.parse(fs.readFileSync(electronPackagePath, "utf8")).version;
const appVersion = packageInfo.version && packageInfo.version !== "0.0.0" ? packageInfo.version : "0.1.0";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd, label, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with code ${result.status}`);
}

function getBuilderEnvironment() {
  const env = { ...process.env };
  if (process.platform !== "linux" || !fs.existsSync("/nix/store")) return env;

  const probe = spawnSync(
    "find",
    ["/nix/store", "-maxdepth", "4", "-name", "libunwind.so.8", "-print", "-quit"],
    { encoding: "utf8" },
  );
  const libraryPath = probe.status === 0 ? probe.stdout.trim() : "";
  if (libraryPath) {
    env.LD_LIBRARY_PATH = [path.dirname(libraryPath), env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return env;
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Required build input is missing: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

async function main() {
  if (process.platform === "linux" && process.env.REPL_ID) {
    throw new Error(
      "Replit's Linux virtual desktop cannot finalize the Windows installer. Run this command from the project on Windows instead.",
    );
  }

  if (!fs.existsSync(path.join(packageRoot, "node_modules", "electron-builder"))) {
    throw new Error("electron-builder is missing. Run pnpm install in the workspace first.");
  }

  run(pnpm, ["--filter", "@workspace/panda-journal", "run", "desktop:build"], workspaceRoot, "Desktop web build");

  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(stageRoot, "desktop"), { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const file of desktopBundleFiles) {
    fs.copyFileSync(path.join(__dirname, file), path.join(stageRoot, "desktop", file));
  }
  copyDirectory(path.join(packageRoot, "dist", "desktop"), path.join(stageRoot, "dist", "desktop"));
  copyDirectory(path.join(packageRoot, "public", "static"), path.join(stageRoot, "public", "static"));
  const animationManifestSource = path.join(packageRoot, "src", "lib", "panda-animation-manifest.json");
  if (!fs.existsSync(animationManifestSource)) {
    throw new Error(`Required build input is missing: ${animationManifestSource}`);
  }
  const stagedAnimationManifest = path.join(stageRoot, "src", "lib", "panda-animation-manifest.json");
  fs.mkdirSync(path.dirname(stagedAnimationManifest), { recursive: true });
  fs.copyFileSync(animationManifestSource, stagedAnimationManifest);

  run(
    pnpm,
    [
      "--filter",
      "@workspace/api-server",
      "exec",
      "esbuild",
      "../panda-journal/desktop/main.cjs",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--external:electron",
      "--outfile=../panda-journal/dist/windows-app/desktop/main.cjs",
    ],
    workspaceRoot,
    "Bundle desktop main process",
  );

  fs.writeFileSync(
    path.join(stageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "xiaoxiongmao-journal-desktop",
        version: appVersion,
        private: true,
        description: "小熊猫日记 Windows 桌面客户端",
        main: "desktop/main.cjs",
      },
      null,
      2,
    )}\n`,
  );

  const builderConfig = {
    appId: "com.xiaoxiongmao.journal",
    productName: "小熊猫日记",
    electronVersion,
    asar: true,
    npmRebuild: false,
    directories: { output: outputRoot },
    files: ["desktop/**/*", "dist/desktop/**/*", "public/static/**/*", "src/lib/panda-animation-manifest.json", "package.json"],
    win: {
      icon: "desktop/icon.ico",
      executableName: "XiaoxiongmaoJournal",
      target: [{ target: "nsis", arch: ["x64"] }],
      artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
      requestedExecutionLevel: "asInvoker",
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "小熊猫日记",
      installerIcon: "desktop/icon.ico",
      uninstallerIcon: "desktop/icon.ico",
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
    },
  };
  if (process.platform === "linux") builderConfig.toolsets = { wine: "1.0.1" };
  fs.writeFileSync(
    path.join(stageRoot, "electron-builder.json"),
    `${JSON.stringify(builderConfig, null, 2)}\n`,
  );

  // 用包内的 cli，而不是依赖 .bin 的工作目录。projectDir 指向暂存目录，
  // 这样 pnpm 的依赖解析仍留在 panda-journal 里。
  const builderCli = ["electron-builder/cli.js", "electron-builder/out/cli/cli.js"]
    .map((id) => { try { return require.resolve(id, { paths: [packageRoot] }); } catch { return ""; } })
    .find(Boolean);
  if (!builderCli) throw new Error("找不到 electron-builder。请先在仓库根目录运行 pnpm install。");
  run(
    process.execPath,
    [builderCli, "--projectDir", stageRoot, "--config", path.join(stageRoot, "electron-builder.json"), "--win", "nsis", "--x64"],
    packageRoot,
    "Create Windows installer",
    getBuilderEnvironment(),
  );

  const installers = fs
    .readdirSync(outputRoot)
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .map((name) => path.join(outputRoot, name));
  if (!installers.length) throw new Error(`Build succeeded but no .exe was found in ${outputRoot}`);
  console.log(`Windows installer created:\n${installers.join("\n")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
