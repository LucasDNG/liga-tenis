import {
  Router,
} from "express";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";

import {
  createDoublesChallenge,
  getMyDoublesChallenges,
  getDoublesChallenge,
  scheduleDoublesChallenge,
  acceptDoublesChallenge,
  rejectDoublesChallenge,
} from "../controllers/doublesChallenges.controllers.js";


const router =
  Router();


router.use(
  isAuth,
);


/*
  ============================================================
  DESAFÍOS DE DOBLES
  ============================================================

  La autoridad pertenece a las parejas.

  Cualquiera de los dos integrantes
  de una pareja puede actuar por su lado.
  ============================================================
*/


/*
  ------------------------------------------------------------
  LISTAR MIS DESAFÍOS
  ------------------------------------------------------------

  GET /api/doubles/challenges

  Opcional:
  ?competition_id=123
*/


router.get(
  "/doubles/challenges",
  getMyDoublesChallenges,
);


/*
  ------------------------------------------------------------
  CREAR DESAFÍO
  ------------------------------------------------------------

  POST /api/doubles/challenges

  body:
  {
    competition_id,
    challenger_pair_id,
    challenged_pair_id
  }
*/


router.post(
  "/doubles/challenges",
  createDoublesChallenge,
);


/*
  ------------------------------------------------------------
  PROGRAMAR / REPROGRAMAR
  ------------------------------------------------------------

  PATCH /api/doubles/challenges/:id/schedule

  Cualquiera de los cuatro jugadores puede
  cargar lugar, fecha y hora mientras siga
  pendiente.
*/


router.patch(
  "/doubles/challenges/:id/schedule",
  scheduleDoublesChallenge,
);


/*
  ------------------------------------------------------------
  ACEPTAR
  ------------------------------------------------------------

  PATCH /api/doubles/challenges/:id/accept

  Cualquiera de los dos integrantes de la
  pareja desafiada puede aceptar.

  Una aceptación vale para toda la pareja.
*/


router.patch(
  "/doubles/challenges/:id/accept",
  acceptDoublesChallenge,
);


/*
  ------------------------------------------------------------
  RECHAZAR
  ------------------------------------------------------------

  PATCH /api/doubles/challenges/:id/reject

  Cualquiera de los dos integrantes de la
  pareja desafiada puede rechazar.

  El -8 Elo pertenece a la pareja.
*/


router.patch(
  "/doubles/challenges/:id/reject",
  rejectDoublesChallenge,
);


/*
  ------------------------------------------------------------
  DETALLE
  ------------------------------------------------------------

  GET /api/doubles/challenges/:id

  Debe quedar después de las rutas específicas.
*/


router.get(
  "/doubles/challenges/:id",
  getDoublesChallenge,
);


export default router;