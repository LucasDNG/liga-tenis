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

import {
  getEloReplayPreview,
} from "../controllers/eloReplay.controllers.js";


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
  ============================================================
  PREVIEW DE REPLAY HISTÓRICO

  IMPORTANTE:
  esta ruta debe declararse antes de
  /audit/matches/:id para que Express
  resuelva correctamente la ruta más
  específica.

  Es READ ONLY.
  ============================================================
*/

router.get(
  "/audit/matches/:id/replay-preview",
  getEloReplayPreview,
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

  Actualmente:
  - permite restauración exacta si
    no existe historia posterior
  - bloquea con
    historical_replay_required
    si necesita reconstrucción
    cronológica
*/

router.patch(
  "/audit/matches/:id/annul",
  annulMatch,
);


export default router;