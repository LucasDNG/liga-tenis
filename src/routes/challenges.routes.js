import { Router } from "express";
import {
  createChallenge,
  getMyChallenges,
  acceptChallenge,
  rejectChallenge,
} from "../controllers/challenges.controllers.js";
import { isAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(isAuth);
router.get("/challenges", getMyChallenges);
router.post("/challenges", createChallenge);
router.patch("/challenges/:id/accept", acceptChallenge);
router.patch("/challenges/:id/reject", rejectChallenge);

export default router;
