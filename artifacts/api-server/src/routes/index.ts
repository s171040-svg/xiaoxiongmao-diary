import { Router, type IRouter } from "express";
import healthRouter from "./health";
import journalRouter from "./journal";
import companionRouter from "./companion";

const router: IRouter = Router();

router.use(healthRouter);
router.use(journalRouter);
router.use(companionRouter);

export default router;
