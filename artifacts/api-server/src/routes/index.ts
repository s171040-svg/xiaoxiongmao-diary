import { Router, type IRouter } from "express";
import healthRouter from "./health";
import journalRouter from "./journal";
import companionRouter from "./companion";
import coopRouter from "./coop";
import petCharacterRouter from "./pet-character";

const router: IRouter = Router();

router.use(healthRouter);
router.use(journalRouter);
router.use(companionRouter);
router.use(coopRouter);
router.use(petCharacterRouter);

export default router;
