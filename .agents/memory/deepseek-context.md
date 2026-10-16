---
name: DeepSeek 连续聊天的 JSON 输出
description: JSON 输出模式下的上下文格式和空回复陷阱。
---

在 DeepSeek 的 JSON 输出模式中，历史里的小熊猫回复也应使用同一 JSON 输出结构包装；界面仍显示普通文字。

**Why:** 实测首条回复正常，但把上一条 assistant 回应直接以普通文字发送时，下一轮可能返回 HTTP 200、finish=stop，却只有空白内容。用一致的 JSON 结构包装旧回复后，带名字的第二轮正常回应。

**How to apply:** 添加或调整聊天上下文时，保留 JSON 输出结构，不把显示用纯文本直接当作 provider 的 assistant 历史。HTTP 200 不代表已收到有效回复，仍须验证非空内容和输出字段。不要用固定假回复掩盖接口或格式故障。
