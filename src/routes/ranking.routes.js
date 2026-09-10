import {
  Router,
} from "express";

import {
  getRankingCompetitions,
} from "../controllers/ranking.controllers.js";

import {
  getRanking,
  getHistoricalElo,
  getOfficialRankingOnly,
} from "../controllers/rankingDispatcher.controllers.js";


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

  Singles:
    /ranking?format=singles&gender=male
    /ranking?format=singles&gender=female

  Dobles:
    /ranking?format=doubles&gender=male
    /ranking?format=doubles&gender=female

  Sin format:
    singles por compatibilidad.
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
  HISTÓRICO ELO
  ============================================================

  Singles:
    elo_events

  Dobles:
    pair_elo_events
  ============================================================
*/


router.get(
  "/ranking/historical-elo",
  getHistoricalElo,
);


export default router;