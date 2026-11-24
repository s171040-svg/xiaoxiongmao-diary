---
name: Electron 开发验证边界
description: Replit Linux 虚拟桌面的原生运行、字体和异步窗口测试注意事项。
---

Replit NixOS 的虚拟桌面使用系统提供的 Electron 运行时；不要把 npm 预编译 Electron 在该环境中的运行失败误认为业务代码故障。中文和 panda emoji 也需要实际可用的系统字体，功能断言通过不代表字形可见。

**Why:** npm Electron 曾因缺少 GLib 动态库无法启动；原生测试通过后，截图仍出现中文和 emoji 方框。系统 Electron 与 Noto 字体解决了虚拟桌面的运行条件。

**How to apply:** 为 Replit VNC 配置原生运行依赖，并实际查看截图；本机客户端仍使用其本机 npm Electron。不要把虚拟桌面测试称为已验证用户电脑的系统权限、麦克风或安装包。

隔离原生测试的凭据环境时，需要保留非敏感的 FONTCONFIG 与 XDG 字体配置环境。

**Why:** 系统字体已安装且正常工作，但仅传 PATH/HOME/DISPLAY 的测试子进程丢失字体配置，截图仍显示方框；普通预览继承完整运行环境却可正确显示。

**How to apply:** 不复制任何真实密钥到测试环境；只保留原生 GUI 所需的非敏感字体配置并使用临时日记资料目录。

跨进程窗口操作必须等待真实原生窗口状态，再触发下一次关闭或最小化。

**Why:** IPC send 返回早于主进程显示窗口，测试紧接着关闭/最小化会被尚未处理的显示请求覆盖，造成假的失败。

**How to apply:** Electron 交互验证以窗口显示/隐藏状态为准，而不是仅等待页面内的调用返回。

桌宠版聊天通过 Electron preload/IPC 在主进程直连 AI，不经过 API Server 的 `/api/companion/chat`；网页预览才走该 API 路由。

**Why:** 两条调用路径分离，API Server 的成功请求日志不能证明桌宠中的失败请求也成功；桌宠 workflow 目前也不记录聊天失败细节。

**How to apply:** 排查送达问题时先确认用户正在测桌宠还是网页预览；不要用 API Server 的 200 代替桌宠请求验证。仅记录不含消息、密钥的错误类别。

Playwright 的 `page.emulateMedia()` 只影响当前页面，不会自动同步到 Electron 的其他窗口。

**Why:** 桌面端测试同时操作日记页与桌宠页；只切换其中一页的动态效果偏好，会让另一页保留旧状态，造成动画帧断言超时。

**How to apply:** 跨窗口验证动画或媒体偏好时，分别为每个页面设置所需的 `reducedMotion`，并在测试阶段切换时明确恢复。

小尺寸桌宠窗口里的角色可以自由漫游，但跟随角色显示的提示气泡必须根据窗口边缘改变对齐和上下位置。

**Why:** 角色移动到左上边缘后，固定居中的气泡按钮会跑出窗口，Playwright 无法点击；这不是状态或 IPC 故障。

**How to apply:** 调整房间活动范围后，分别验证四周边缘处的气泡完整可见、可点击，并保留窗口边界内的坐标限制。

Replit Linux VNC 没有可靠的桌面合成器；铺满屏幕的透明 Electron 窗口可能显示为黑色，并盖住桌宠。

**Why:** 全屏透明礼物层在 VNC 画面中变成黑底；隐藏该层后，原有房间和小熊猫立即可见。

**How to apply:** Replit VNC 中把礼物等交互画在已有桌宠房间窗口内，或使用有限尺寸的不透明窗口；只在确认透明合成可用的原生桌面环境使用全屏透明层，并保留礼物数据。

Replit NixOS 可以生成 Windows Electron 的解压目录，但 NSIS 安装包最后需要 Wine 运行 Windows 安装器来生成卸载程序；虚拟环境中的 Wine 可能无法完成这一步，产生的短小 `.exe` 只是未完成产物。

**Why:** 系统 Wine 无法执行 Windows PE 文件，electron-builder 自带 Wine 也因虚拟环境缺少 Windows 运行组件而在安装器自检失败。

**How to apply:** 不要把失败目录中的 `.exe` 当成安装包交付；在本机 Windows 上运行项目的打包命令生成正式安装器。

Windows 安装包优先由 GitHub Actions 的 Windows runner 构建；CI 只生成并上传安装器，不注入运行时 AI 密钥。

**Why:** 用户选择自动构建，而 Replit Linux 环境无法可靠执行 NSIS 的 Windows 自检步骤。

**How to apply:** 先确认项目已推送到 GitHub，再手动运行或通过相关代码推送触发构建；AI 密钥只在用户自己的 Windows 运行环境配置。

桌面浮层与网页房间使用不同渲染器；网页角色或动作更新后，还要检查 Electron 的独立角色页和安装包资源清单。

**Why:** Windows 包曾漏带桌面角色读取的动作清单，导致启动仍显示 HTML 中的黑白初始占位图，即使网页房间已显示彩色角色。

**How to apply:** Electron 角色页应立即应用可用的彩色待机帧，并将其相对读取的动作清单一并打包；分别验证网页和桌面入口。

pnpm workspace 的平台可选依赖排除规则会影响所有 runner；Windows 安装器所需的 Windows x64 原生包不能按 Replit Linux 环境一并排除。

**Why:** Linux-only 的 overrides 让 Windows runner 的锁文件缺少 esbuild、Rollup 等 x64 二进制，导致桌面构建失败。

**How to apply:** 修改平台排除规则后重新生成锁文件，并用 Windows runner 验证安装和打包。

Replit 的 GitHub OAuth 连接与 `GIT_URL` Secret 是两套凭据；`GIT_URL` 可能是原始 token，也可能是带凭据的 HTTPS 地址。

**Why:** 按原始 token 处理一个完整的 HTTPS 凭据地址会被 GitHub 拒绝；从地址中安全提取 token 后推送才成功。旧对话中的“已连接”也不代表当前环境已绑定 OAuth。

**How to apply:** 优先检查当前 Replit 集成状态；使用 `GIT_URL` 时先识别并规范化格式，通过临时 askpass 传递且绝不打印或持久化凭据。认证仍失败时引导安全重连，不在聊天中索要 token。

桌面整合烟测中的后段拖动手势可能在 Replit 虚拟桌面超时，即使对应的运动逻辑单元测试已通过。

**Why:** 完整烟测通过了数值规则、房间、洗澡、晾干和睡觉相关检查，最后才在连续鼠标绕圈动作超时；重复运行也不能证明它是功能回归。

**How to apply:** 先看失败阶段和动作专属单元测试；报告时区分确定通过的测试与虚拟桌面的整合手势超时，不要把两者合并成“全套测试通过”。

重启桌宠 workflow 后，需要确认原有 Electron 子进程也已退出；父进程重启不代表原生窗口已换成新版。

**Why:** 虚拟桌面曾保留旧 Electron 子进程，新进程因单实例锁直接正常退出，workflow 显示 finished 而旧窗口仍在运行。

**How to apply:** 先核对单实例锁对应的进程，再温和退出明确属于旧预览的实例后重启。不要批量结束其他 Electron 应用，也不要删除用户资料来绕过锁。

跨桌宠重启保存的动作等待截止时间须使用绝对时间，不能保存渲染进程启动后的相对时间；单次逐帧动画仍使用单调时钟。

**Why:** 自动甩毛流程验证时发现，持久化截止时间与 RAF 时钟混用会导致重启后动作迟迟不触发或提前触发。

**How to apply:** 对需要跨会话恢复的等待使用 `Date.now()`；对一段动画的帧进度使用 `performance.now()`，测试分别覆盖两种时间来源。

需在另一台电脑直接试玩桌宠时，提供独立离线试玩包，不把联网便携版视为离线版；正常账号版仍以服务器角色为准。

**Why:** 免安装不等于离线。联网便携版启动先访问开发预览，曾停在 Replit 会话验证，账号角色没有返回时桌宠不会显示。

**How to apply:** 离线试玩仅显示本地小熊猫和桌面互动，独立于正常版数据目录，不加载网页房间、不读取账号存档。外部下载使用 GitHub Release 的公开下载地址，并在无认证环境验证；Actions 产物接口不能作为匿名直链。
