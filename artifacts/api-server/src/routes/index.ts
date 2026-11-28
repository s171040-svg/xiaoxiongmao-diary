import { Router, type IRouter } from "express";
import healthRouter from "./health";
import journalRouter from "./journal";
import companionRouter from "./companion";
import petCharacterRouter from "./pet-character";
import petSaveRouter from "./pet-save";

const router: IRouter = Router();

router.use(healthRouter);
router.use(journalRouter);
router.use(companionRouter);
// Keep old data for safe migration, but disable every shared-play operation.
router.use("/coop", (_req, res) => { res.status(410).json({ error: "双人模式已取消，请使用邮箱登录后的个人宠物存档。" }); });
router.use(petCharacterRouter);
router.use(petSaveRouter);

export default router;
