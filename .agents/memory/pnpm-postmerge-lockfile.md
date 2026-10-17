---
name: 合并后 pnpm 锁文件同步
description: 处理任务合并后 pnpm workspace 配置与锁文件不一致的问题。
---

合并后的依赖安装要能修复 workspace 配置和 lockfile 不一致；仅使用 `--frozen-lockfile` 会让合并设置在依赖安装之前直接失败。CI 与发布流程仍可使用 frozen 安装来验证已同步的锁文件。

**Why:** 合并后的设置曾因 workspace `overrides` 已变化、lockfile 未同步而失败，无法完成后续数据库和工作流协调。

**How to apply:** 在 post-merge 脚本中使用可同步锁文件的安装方式；修改后确认冻结安装也能通过，确保锁文件已正确更新。
