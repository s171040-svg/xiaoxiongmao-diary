import { Router, type IRouter } from "express";
import healthRouter from "./health";
import journalRouter from "./journal";
import companionRouter from "./companion";
import coopRouter from "./coop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(journalRouter);
router.use(companionRouter);
router.use(coopRouter);

export default router;
