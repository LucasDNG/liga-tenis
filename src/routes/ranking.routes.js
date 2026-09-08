import { Router } from "express";

import {
  getRanking,
  getHistoricalElo,
} from "../controllers/ranking.controllers.js";

const router = Router();

router.get(
  "/ranking",
  getRanking,
);

router.get(
  "/ranking/historical-elo",
  getHistoricalElo,
);

export default router;