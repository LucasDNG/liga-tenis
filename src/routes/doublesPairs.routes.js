import {
  Router,
} from "express";

import {
  createDoublesPair,
  getMyDoublesPairs,
  getEligibleDoublesPartners,
} from "../controllers/doublesPairs.controllers.js";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";


const router =
  Router();


router.use(
  isAuth,
);


/*
  Compañeros disponibles.

  IMPORTANTE:
  esta ruta debe estar antes de /doubles/pairs/:id
  si más adelante agregamos una ruta por ID.
*/

router.get(
  "/doubles/pairs/eligible-partners",
  getEligibleDoublesPartners,
);


/*
  Mis parejas.
*/

router.get(
  "/doubles/pairs",
  getMyDoublesPairs,
);


/*
  Crear o reutilizar pareja.
*/

router.post(
  "/doubles/pairs",
  createDoublesPair,
);


export default router;