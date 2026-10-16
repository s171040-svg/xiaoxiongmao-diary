# 小熊猫日记 · Electron 首版

这是现有日记的桌面客户端，不是独立的社交产品。

## 运行

在工作区的 **小熊猫桌宠** VNC 工作流里测试。Replit 的 VNC 是远程 Linux 桌面，桌宠活动在该虚拟桌面上，不会直接覆盖你自己电脑的桌面。

在自己的电脑运行源码：

1. 安装 Node.js 和 pnpm，在项目根目录运行 `pnpm install`。
2. 在操作系统环境变量中配置 `DEEPSEEK_API_KEY`。不要写入源码、截图或聊天，不会打包这个密钥。
3. 运行 `pnpm --filter @workspace/panda-journal run desktop:build`。
4. 运行 `pnpm --filter @workspace/panda-journal run desktop:start`。

## Windows 安装包

项目推送到 GitHub 后，可在 Actions 中运行 “Build Windows installer”；成功后下载 `xiaoxiongmao-journal-windows-x64` 构建产物。推送到 `main` 或 `master` 且修改桌宠相关文件时也会自动生成。若在 Windows 本机打包，在项目根目录运行 `pnpm install`，再运行 `pnpm --filter @workspace/panda-journal run desktop:installer:win`。安装包会生成在 `generated-artifacts/windows-installer/`，安装时可选择位置，并创建桌面与开始菜单快捷方式。卸载不会删除本机日记数据。Replit 虚拟桌面不能完成 Windows 安装器的最后生成步骤。

安装包不包含 AI 密钥。需要 AI 聊天时，在 Windows 用户环境变量中设置 `DEEPSEEK_API_KEY` 后重新打开应用。

当前安装包未做代码签名，Windows 可能显示“未知发布者”或 SmartScreen 提示。

开发模式 `desktop:dev` 沿用现有网页服务；在 Replit 内通过共享代理访问，在其他环境默认使用 `http://localhost:21836/`，可通过 `PANDA_JOURNAL_URL` 指定开发页面。

尚未配置自动更新或开机自启动；安装包需在 Windows 本机生成后再验收桌宠交互。

Replit 虚拟桌面已配置 Noto 中文与彩色 emoji 系统字体。自己的 Linux 桌面也需要可用的中文/emoji 字体；macOS、Windows 通常已有相应系统字体。

## 交互

- 单击小熊猫：随机暖心短句。
- 双击：显示“今天有什么烦心事呢？”；“说说看”打开日记，“不是”收起气泡。
- 日记输入文字、附上照片，再点“收好这一页”。收到有效 AI 回应、确认本机保存成功后，等待约两秒收起窗口，小熊猫说“记好啦，我去玩啦～”。
- 右上角关闭按钮、系统关闭或最小化：只收起日记，桌宠继续活动。草稿保留在尚未销毁的窗口中。
- 右键小熊猫或托盘菜单：打开日记／真正退出应用。
- 桌宠透明空白区鼠标穿透；在小熊猫或气泡上才拦截点击。

## 数据和 AI

- 桌面版使用 Electron 自己的本机浏览器存储。日记、照片和回应不保存到服务器，也不会自动同步普通浏览器中的日记。
- 旧网页记录不会被迁移、覆盖或删除。桌面客户端与网页版各自的本机记录独立。
- 桌面版的文字在点击收好后直接由主进程发送到 `https://api.deepseek.com/chat/completions`。环境密钥不暴露给渲染页面。
- 照片只作为本机附件，不发送给 DeepSeek；没有宣称 AI 看过照片。
- 浏览器版继续使用现有服务器 AI 接入，不依赖 Electron。
- 网络、密钥、AI 格式或存储失败时不清空草稿、不收起窗口、不显示虚假的保存成功。

## 语音能力边界

“按住说话”使用系统／浏览器 Web Speech 识别能力，把文字放入输入框；松开停止。它不是 DeepSeek 的音频转写服务，某些 Electron/操作系统版本没有可用的语音识别后端。识别可能使用系统／浏览器的联网服务，页面会提示；权限被拒或识别不可用时会明确报错。麦克风没有在 Replit 虚拟桌面里做真人录音验证。没有保存原始音频，也没有把音频上传给小熊猫 AI。

## 参考

技术参考：[PetAI-Desktop-Pet](https://github.com/jinyuwan/PetAI-Desktop-Pet)：透明无边框置顶窗口、主进程/预加载隔离、自主动作调度、本地记录。实现保持轻量，不复制第三方 Spine 皮肤，不增加好友、社交、排行榜或分享。
