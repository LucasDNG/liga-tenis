import {
  Router,
} from "express";

import {
  getUpcomingMatches,
  getLatestResults,
  getPublicPlayerHistory,
} from "../controllers/transparency.controllers.js";

const router =
  Router();


/*
  ============================================================
  RUTAS PÚBLICAS
  ============================================================

  Estas rutas NO llevan isAuth.

  Cualquier persona puede verlas.
*/


/*
  PRÓXIMOS PARTIDOS

  Opcional:

  ?gender=male
  ?gender=female
*/
router.get(
  "/public/upcoming-matches",
  getUpcomingMatches,
);


/*
  ÚLTIMOS RESULTADOS

  Opcional:

  ?gender=male
  ?gender=female
*/
router.get(
  "/public/latest-results",
  getLatestResults,
);


/*
  HISTORIAL DE JUGADOR
*/
router.get(
  "/public/players/:id/history",
  getPublicPlayerHistory,
);


export default router;