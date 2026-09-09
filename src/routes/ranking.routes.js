import { Router } from "express";

import {
  getRanking,
  getRankingCompetitions,
  getHistoricalElo,
  getOfficialRankingOnly,
} from "../controllers/ranking.controllers.js";


const router =
  Router();


/*
  ============================================================
  COMPETICIONES DISPONIBLES
  ============================================================
*/

router.get(
  "/ranking/competitions",
  getRankingCompetitions,
);


/*
  ============================================================
  RANKING COMPLETO
  ============================================================

  Ejemplos:

  /ranking
    → singles male por compatibilidad

  /ranking?format=singles&gender=male

  /ranking?format=singles&gender=female

  /ranking?format=doubles&gender=male

  /ranking?format=doubles&gender=female
  ============================================================
*/

router.get(
  "/ranking",
  getRanking,
);


/*
  ============================================================
  SOLO OFICIALES
  ============================================================
*/

router.get(
  "/ranking/official",
  getOfficialRankingOnly,
);


/*
  ============================================================
  HISTÓRICO ELO POR COMPETICIÓN
  ============================================================
*/

router.get(
  "/ranking/historical-elo",
  getHistoricalElo,
);


export default router;