import { Router } from "express";
import {
  getMyMatches,
  submitMatchResult,
  confirmMatchResult,
  rejectMatchResult,
} from "../controllers/matches.controllers.js";
import { isAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(isAuth);
router.get("/matches", getMyMatches);
router.patch("/matches/:id/result", submitMatchResult);
router.patch("/matches/:id/confirm", confirmMatchResult);
router.patch("/matches/:id/reject-result", rejectMatchResult);

export default router;
