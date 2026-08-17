import { Router } from "express";

import {
  signUp,
  signIn,
  signOut,
  forgotPassword,
  resetPassword,
  profile,
  chooseLeague,
} from "../controllers/auth.controllers.js";

import { isAuth } from "../middlewares/auth.middleware.js";
import { uploadDni } from "../middlewares/upload.middleware.js";

const router = Router();

// REGISTRO
router.post(
  "/signup",
  uploadDni,
  signUp,
);

// LOGIN
router.post(
  "/signin",
  signIn,
);

// LOGOUT
router.post(
  "/signout",
  signOut,
);

// RECUPERAR CONTRASEÑA
// Esta ruta debe ser pública.
router.post(
  "/forgot-password",
  forgotPassword,
);

// CREAR NUEVA CONTRASEÑA
// Esta ruta también debe ser pública.
router.post(
  "/reset-password/:token",
  resetPassword,
);

// PERFIL
router.get(
  "/profile",
  isAuth,
  profile,
);

// CAMBIAR LIGA
router.patch(
  "/profile/league",
  isAuth,
  chooseLeague,
);

export default router;