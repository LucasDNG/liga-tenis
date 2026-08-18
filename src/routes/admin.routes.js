import { Router } from "express";

import { isAuth } from "../middlewares/auth.middleware.js";
import { isAdmin } from "../middlewares/admin.middleware.js";

import {
  getPendingUsers,
  getPendingUserById,
  approveUser,
  rejectUser,
} from "../controllers/admin.controllers.js";

const router = Router();

/*
  Todas las rutas de este archivo
  requieren sesión + rol administrador.
*/

router.use(isAuth);
router.use(isAdmin);

router.get(
  "/users/pending",
  getPendingUsers,
);

router.get(
  "/users/:id",
  getPendingUserById,
);

router.patch(
  "/users/:id/approve",
  approveUser,
);

router.patch(
  "/users/:id/reject",
  rejectUser,
);

export default router;