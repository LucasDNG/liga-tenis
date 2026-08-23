import {
  Router,
} from "express";

import {
  isAuth,
} from "../middlewares/auth.middleware.js";

import {
  isAdmin,
} from "../middlewares/admin.middleware.js";

import {
  getPendingUsers,
  getPendingUserById,
  approveUser,
  rejectUser,

  getAuditMatches,
  getAuditMatchById,
  resolveAuditFlag,
  annulMatch,
} from "../controllers/admin.controllers.js";

const router =
  Router();


/*
  ============================================================
  TODAS LAS RUTAS DE ESTE ARCHIVO
  REQUIEREN SESIÓN + ADMIN
  ============================================================
*/

router.use(
  isAuth,
);

router.use(
  isAdmin,
);


/*
  ============================================================
  VERIFICACIÓN DE JUGADORES
  ============================================================
*/

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


/*
  ============================================================
  AUDITORÍA DE PARTIDOS
  ============================================================
*/

/*
  Lista partidos que tienen
  alguna bandera antifraude.
*/

router.get(
  "/audit/matches",
  getAuditMatches,
);


/*
  Detalle completo:
  - partido
  - alertas
  - movimientos Elo
  - auditoría
*/

router.get(
  "/audit/matches/:id",
  getAuditMatchById,
);


/*
  Marca una alerta como
  revisada por el administrador.
*/

router.patch(
  "/audit/flags/:flagId/resolve",
  resolveAuditFlag,
);


/*
  Anula un partido.

  El controlador:
  - revierte Elo
  - resta matches_played
  - marca eventos Elo originales
    como revertidos
  - registra la reversión
  - cierra las alertas
  - deja auditoría permanente
*/

router.patch(
  "/audit/matches/:id/annul",
  annulMatch,
);


export default router;