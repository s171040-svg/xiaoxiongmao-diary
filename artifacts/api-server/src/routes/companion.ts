import { Router, type IRouter } from "express";
import { CompanionChatBody, CompanionChatResponse } from "@workspace/api-zod";
import { chat } from "@workspace/companion-ai";

const router: IRouter = Router();
const windows = new Map<string, { count: number; until: number }>();
router.post("/companion/chat", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const input = CompanionChatBody.safeParse(req.body);
  if (!input.success || input.data.messages.at(-1)?.role !== "user") {
    res.status(400).json({ error: "聊天内容格式不正确。" }); return;
  }
  const now = Date.now();
  for (const [key, value] of windows) if (value.until <= now) windows.delete(key);
  const key = req.ip ?? "unknown";
  const window = windows.get(key) ?? { count: 0, until: now + 60_000 };
  if (window.count >= 12) { res.status(429).json({ error: "说得有点快，稍等一分钟再发吧。" }); return; }
  window.count++; windows.set(key, window);
  try {
    res.json(CompanionChatResponse.parse(await chat(input.data)));
  } catch (error) {
    req.log.warn("Companion AI unavailable"); // Never log conversations or keys.
    res.status(502).json({ error: error instanceof Error ? error.message : "小熊猫暂时没收到回应，可重试。" });
  }
});
export default router;
