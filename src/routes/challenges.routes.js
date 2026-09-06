import {
  Router,
} from "express";

import {
  createChallenge,
  getMyChallenges,
  scheduleChallenge,
  acceptChallenge,
  rejectChallenge,
} from "../controllers/challenges.controllers.js";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";

const router =
  Router();

router.use(
  isAuth,
);


/*
  Ver desafíos recibidos
  y enviados.
*/

router.get(
  "/challenges",
  getMyChallenges,
);


/*
  Crear desafío.
*/

router.post(
  "/challenges",
  createChallenge,
);


/*
  Cargar:
  - lugar
  - fecha
  - hora
*/

router.patch(
  "/challenges/:id/schedule",
  scheduleChallenge,
);


/*
  Aceptar desafío.
*/

router.patch(
  "/challenges/:id/accept",
  acceptChallenge,
);


/*
  Rechazar desafío.
*/

router.patch(
  "/challenges/:id/reject",
  rejectChallenge,
);


export default router;