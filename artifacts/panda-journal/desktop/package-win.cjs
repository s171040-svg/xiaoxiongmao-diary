"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const stageRoot = path.join(packageRoot, "dist", "windows-app");
const outputRoot = path.join(workspaceRoot, "generated-artifacts", "windows-installer");
const offlineTrial = process.env.PANDA_BUILD_OFFLINE_TRIAL === "1";
const packageInfo = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const electronVersion = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "node_modules", "electron", "package.json"), "utf8"),
).version;
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

  for (const file of ["main.cjs", "preload.cjs", "pet.html", "pet.css", "pet-renderer.js", "roaming-geometry.js",
    "pet-lite.js", "pet-lite-model.js", "pet-lite.css", "platform-model.js", "windows-platforms.cjs", "background-bite.js", "windows-pixel.cjs",
    "journal-connection.cjs", "journal-targets.json", "wellbeing.cjs", "wellbeing-animation.js",
    "notebook-store.cjs", "notebook.html", "notebook.css", "notebook.js"]) {
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
        version: packageInfo.version,
        private: true,
        description: "小熊猫日记 Windows 桌面客户端",
        main: "desktop/main.cjs",
        ...(offlineTrial ? { offlineDesktopTrial: true } : {}),
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
      target: [{ target: "nsis", arch: ["x64"] }],
      artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "小熊猫日记",
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
    },
  };
  if (process.platform === "linux") builderConfig.toolsets = { wine: "1.0.1" };
  fs.writeFileSync(
    path.join(stageRoot, "electron-builder.json"),
    `${JSON.stringify(builderConfig, null, 2)}\n`,
  );

  const builder = path.join(
    packageRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
  );
  if (!offlineTrial) {
    run(
      builder,
      ["--config", "electron-builder.json", "--win", "nsis", "--x64"],
      stageRoot,
      "Create Windows installer",
      getBuilderEnvironment(),
    );
  } else {
    builderConfig.appId = "com.xiaoxiongmao.desktoptrial";
  }

  builderConfig.win = {
    target: [{ target: "portable", arch: ["x64"] }],
    artifactName: offlineTrial
      ? "Xiaoxiongmao-Offline-Trial-${arch}.${ext}"
      : "${productName}-Portable-${version}-${arch}.${ext}",
  };
  delete builderConfig.nsis;
  fs.writeFileSync(
    path.join(stageRoot, "electron-builder.json"),
    `${JSON.stringify(builderConfig, null, 2)}\n`,
  );
  run(
    builder,
    ["--config", "electron-builder.json", "--win", "portable", "--x64"],
    stageRoot,
    "Create portable Windows app",
    getBuilderEnvironment(),
  );

  const installers = fs
    .readdirSync(outputRoot)
    .filter((name) => offlineTrial ? name === "Xiaoxiongmao-Offline-Trial-x64.exe"
      : name.endsWith(".exe") && !name.includes("-Offline-Trial-"))
    .map((name) => path.join(outputRoot, name));
  if (!installers.length) throw new Error(`Build succeeded but no .exe was found in ${outputRoot}`);
  fs.writeFileSync(path.join(outputRoot, "BUILD-INFO.json"), `${JSON.stringify({
    version: packageInfo.version,
    sourceRevision: process.env.GITHUB_SHA || "local-build",
    buildRun: process.env.GITHUB_RUN_NUMBER || null,
    movement: "taskbar-and-window-top-platforms",
    artifacts: installers.map(file => ({
      file: path.basename(file),
      type: offlineTrial ? "offline-trial" : path.basename(file).includes("-Portable-") ? "portable" : "installer",
      bytes: fs.statSync(file).size,
    })),
  }, null, 2)}\n`);
  console.log(`Windows executables created:\n${installers.join("\n")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
