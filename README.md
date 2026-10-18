# 小熊猫日记

可爱小桌宠。这是一只住在桌面上的小熊猫：透明无边框、可拖动、可置顶，单击打招呼，双击打开日记。日记和照片留在本机。

Windows 上它铺在工作区上（不挡住任务栏），空白处鼠标穿透，只有小熊猫和气泡接点击。拖动小熊猫可以换位置，松手后它会停在那里，直到托盘里选择「继续闲逛」。

## 环境

- Windows 10 或 Windows 11，64 位
- Node.js 22 或 24
- pnpm 10（`corepack enable` 之后可用）

AI 聊天是可选的。没有密钥时，桌宠、日记草稿和本机记录仍然可用。需要小熊猫回复时，在用户环境变量里设置 `DEEPSEEK_API_KEY`，然后重新打开应用。不要把密钥写进源码、截图或安装包。

## 从源码运行

在仓库根目录：

```bat
pnpm install
pnpm --filter @workspace/panda-journal run desktop:build
pnpm --filter @workspace/panda-journal run desktop:start
```

`desktop:build` 会把日记页面编到 `artifacts/panda-journal/dist/desktop/`。`desktop:start` 打开桌宠，并从那个目录加载日记。

开发时让桌宠连着热更新页面：

```bat
pnpm --filter @workspace/panda-journal run desktop:dev
```

这条命令会在 `http://127.0.0.1:21836/` 启动日记页面，再打开 Electron。若这个端口上已经有页面，就直接连过去。

## 打 Windows 安装包

在 Windows 上，于仓库根目录执行：

```bat
pnpm install
pnpm --filter @workspace/panda-journal run desktop:installer:win
```

安装包出现在 `generated-artifacts/windows-installer/`，文件名类似 `小熊猫日记-Setup-0.1.0-x64.exe`。程序文件名是 `XiaoxiongmaoJournal.exe`，快捷方式仍然叫「小熊猫日记」。安装时可以选择目录，并创建桌面和开始菜单快捷方式。卸载不会删除本机日记。

请在 Windows 上执行打包。Linux 交叉打包要靠 Wine 跑 NSIS，这不是 Windows 用户的路径。

安装包没有代码签名。Windows 可能提示「未知发布者」或 SmartScreen，需要选择仍要运行。安装包里没有 AI 密钥。

推送到 `main` 且改动了桌宠相关文件时，GitHub Actions 工作流「Build Windows installer」也会在 `windows-latest` 上生成同一份安装包，产物名是 `xiaoxiongmao-journal-windows-x64`。

## 操作

- 拖动小熊猫：换位置。全屏桌面模式下松手后先停住。
- 单击：一句短问候。
- 双击：问「今天有什么烦心事呢？」。点「说说看」打开日记，「不是」收起气泡。
- 日记窗口右上角关闭：只收起日记，桌宠还在。
- 托盘或右键：打开聊天、显示小熊猫、置顶开关、继续闲逛 / 停在这里、退出。
- 透明空白处点击会落到下面的窗口。

## 测试

不启动窗口的单元测试：

```bat
node --test artifacts/panda-journal/desktop/ai.test.cjs artifacts/panda-journal/desktop/pet-window.test.cjs artifacts/panda-journal/desktop/roaming-geometry.test.cjs lib/companion-ai/src/index.test.cjs
```

完整桌面冒烟测试还需要本机图形界面，以及 `http://127.0.0.1:21836/` 上的日记页面：

```bat
pnpm --filter @workspace/panda-journal run desktop:test
```

## 说明

日记、照片和 AI 回复都在 Electron 自己的本机存储里，不会上传到这个项目的服务器，也不会和浏览器里的旧记录互相覆盖。照片只作为本机附件，不会发给 DeepSeek。
