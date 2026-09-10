import {
  Router,
} from "express";

import {
  getMyMatches,
} from "../controllers/matches.controllers.js";

import {
  submitMatchResult,
  confirmMatchResult,
  rejectMatchResult,
} from "../controllers/matchResultsDispatcher.controllers.js";

import {
  cancelMatchUnilaterally,
  requestMutualCancellation,
  confirmMutualCancellation,
  rejectMutualCancellation,
} from "../controllers/matchCancellation.controllers.js";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";


const router =
  Router();


router.use(
  isAuth,
);


/*
  ============================================================
  MIS PARTIDOS
  ============================================================
*/


router.get(
  "/matches",
  getMyMatches,
);


/*
  ============================================================
  RESULTADOS
  ============================================================

  El dispatcher resuelve automáticamente:

  singles
    → controlador histórico de singles

  doubles
    → controlador por lados/parejas

  El frontend utiliza exactamente los mismos endpoints.
  ============================================================
*/


router.patch(
  "/matches/:id/result",
  submitMatchResult,
);


router.patch(
  "/matches/:id/confirm",
  confirmMatchResult,
);


router.patch(
  "/matches/:id/reject-result",
  rejectMatchResult,
);


/*
  ============================================================
  CANCELACIÓN UNILATERAL
  ============================================================
*/


router.patch(
  "/matches/:id/cancel",
  cancelMatchUnilaterally,
);


/*
  ============================================================
  CANCELACIÓN DE COMÚN ACUERDO
  ============================================================
*/


router.patch(
  "/matches/:id/cancel-request",
  requestMutualCancellation,
);


router.patch(
  "/matches/:id/cancel-request/confirm",
  confirmMutualCancellation,
);


router.patch(
  "/matches/:id/cancel-request/reject",
  rejectMutualCancellation,
);


export default router;