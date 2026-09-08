import {
  Router,
} from "express";

import {
  getMyMatches,
  submitMatchResult,
  confirmMatchResult,
  rejectMatchResult,
} from "../controllers/matches.controllers.js";

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


router.get(
  "/matches",
  getMyMatches,
);


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