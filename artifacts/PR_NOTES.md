# PR 标题

修复 Windows 桌面宠物：透明置顶、拖动、托盘与安装包

# PR 正文

## 摘要

把「小熊猫日记」修成可以在 Windows 上运行的桌面宠物。仍使用现有 Electron + pnpm + TypeScript，以及原来的小熊猫精灵和闲逛逻辑。目标分支是 `github-snapshot`。

## 原来的问题

- Windows 上桌宠是铺满工作区的透明层，并且停在 `screen-saver` 层级，日记窗口被压在下面。
- PowerShell 5.1 用 UTF-16 返回窗口范围。解析失败后整块桌面被当成障碍，小熊猫停止走动。
- 小熊猫不能拖动。托盘只有打开聊天和退出，不能开关置顶，也不能让它停在原地。启动时会抢走焦点。
- Windows 11 的粗边框和圆角会把透明窗口画成色块。
- 安装包漏了礼物窗（`gift.html`、`gift-drop.css`、`gift-renderer.js`）。图标只有 96×96，`electron-builder` 要求至少 256×256。版本是 `0.0.0`。
- `desktop:dev` 不会自己启动日记页面。Vite 依赖 Replit 才有的 `PORT` 和 `BASE_PATH`。
- 掉出房间后的脏衣服姿势盖住眩晕动画，松手后眼睛不会停在最后一帧。

## 改动

- 透明无边框窗口：`thickFrame: false`、`roundedCorners: false`。空白处鼠标穿透。启动时不抢焦点。
- 拖动小熊猫可以换位置。全屏桌面模式下松手后先停住，托盘「继续闲逛」再走。位置、置顶和停住状态写在本机 `pet-settings.json`。
- 日记打开时升到桌宠上面。托盘可打开聊天、显示小熊猫、置顶开关、继续闲逛 / 停在这里、退出。
- 窗口扫描强制 UTF-8。扫不到其他窗口时继续闲逛，只避开日记和礼物，不再把整屏封死。
- 安装包纳入礼物窗和 256×256 图标。程序名 `XiaoxiongmaoJournal.exe`，快捷方式仍是「小熊猫日记」。版本 `0.1.0`。
- 本机 `desktop:dev` 会在 `http://127.0.0.1:21836/` 拉起日记页面。没有 `DEEPSEEK_API_KEY` 时桌宠和本机日记仍可用，只是没有 AI 回复。密钥不进入源码或安装包。
- 眩晕落下时让出脏衣服姿势，最后一帧眼睛可以显示。

## 验证

在 Linux 上通过了桌面冒烟测试（透明点击、单击/双击、日记、礼物、闲逛、眩晕帧）以及窗口扫描、拖动坐标和 256 像素图标的单元测试。

打包已生成 `win-unpacked/XiaoxiongmaoJournal.exe`，`app.asar` 内包含宠物页、礼物窗和图标。NSIS 安装包需要在 Windows 上生成。这台 Linux 环境的 Wine 无法启动，所以没有在这里产出 `.exe` 安装包。

尚未在真实 Windows 上验收：DWM 透明、任务栏穿透、系统托盘、多显示器和 SmartScreen。

## 管理员合并后，在 Windows 上

```bat
pnpm install
pnpm --filter @workspace/panda-journal run desktop:build
pnpm --filter @workspace/panda-journal run desktop:start
pnpm --filter @workspace/panda-journal run desktop:installer:win
```

安装包路径：`generated-artifacts/windows-installer/小熊猫日记-Setup-0.1.0-x64.exe`。
