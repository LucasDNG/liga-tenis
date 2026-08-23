import {
  Router,
} from "express";

import {
  getChallengeAvailability,
} from "../controllers/challengeAvailability.controllers.js";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";

const router =
  Router();

/*
  Esta información depende
  del jugador logueado.
*/
router.get(
  "/challenge-availability",
  isAuth,
  getChallengeAvailability,
);

export default router;