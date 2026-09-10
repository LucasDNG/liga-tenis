import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import rankingRoutes from "./routes/ranking.routes.js";
import challengesRoutes from "./routes/challenges.routes.js";
import challengeAvailabilityRoutes from "./routes/challengeAvailability.routes.js";
import matchesRoutes from "./routes/matches.routes.js";

import doublesPairsRoutes from "./routes/doublesPairs.routes.js";
import doublesChallengesRoutes from "./routes/doublesChallenges.routes.js";

import transparencyRoutes from "./routes/transparency.routes.js";
import adminRoutes from "./routes/admin.routes.js";

import {
  errorHandler,
} from "./middlewares/error.middleware.js";


const app =
  express();


/*
  ============================================================
  MIDDLEWARES GENERALES
  ============================================================
*/


app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:5173",

    credentials:
      true,
  }),
);


app.use(
  morgan(
    "dev",
  ),
);


app.use(
  express.json(),
);


app.use(
  cookieParser(),
);


/*
  ============================================================
  HEALTH CHECK
  ============================================================
*/


app.get(
  "/api/health",
  (_req, res) =>
    res.json({
      ok: true,
    }),
);


/*
  ============================================================
  AUTENTICACIÓN
  ============================================================
*/


app.use(
  "/api",
  authRoutes,
);


/*
  ============================================================
  RANKINGS
  ============================================================
*/


app.use(
  "/api",
  rankingRoutes,
);


/*
  ============================================================
  SINGLES — DESAFÍOS
  ============================================================
*/


app.use(
  "/api",
  challengesRoutes,
);


app.use(
  "/api",
  challengeAvailabilityRoutes,
);


/*
  ============================================================
  PARTIDOS
  ============================================================
*/


app.use(
  "/api",
  matchesRoutes,
);


/*
  ============================================================
  DOBLES — FORMACIÓN DE PAREJAS
  ============================================================

  GET  /api/doubles/pairs
  GET  /api/doubles/pairs/eligible-partners
  POST /api/doubles/pairs
  ============================================================
*/


app.use(
  "/api",
  doublesPairsRoutes,
);


/*
  ============================================================
  DOBLES — DESAFÍOS ENTRE PAREJAS
  ============================================================

  GET   /api/doubles/challenges
  POST  /api/doubles/challenges
  GET   /api/doubles/challenges/:id
  PATCH /api/doubles/challenges/:id/schedule
  PATCH /api/doubles/challenges/:id/accept
  PATCH /api/doubles/challenges/:id/reject
  ============================================================
*/


app.use(
  "/api",
  doublesChallengesRoutes,
);


/*
  ============================================================
  TRANSPARENCIA PÚBLICA
  ============================================================
*/


app.use(
  "/api",
  transparencyRoutes,
);


/*
  ============================================================
  ADMIN
  ============================================================
*/


app.use(
  "/api/admin",
  adminRoutes,
);


/*
  ============================================================
  MANEJO CENTRAL DE ERRORES
  ============================================================
*/


app.use(
  errorHandler,
);


export default app;