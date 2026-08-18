import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import rankingRoutes from "./routes/ranking.routes.js";
import challengesRoutes from "./routes/challenges.routes.js";
import matchesRoutes from "./routes/matches.routes.js";
import adminRoutes from "./routes/admin.routes.js";

import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:5173",
    credentials: true,
  }),
);

app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.get(
  "/api/health",
  (_req, res) =>
    res.json({
      ok: true,
    }),
);

app.use("/api", authRoutes);
app.use("/api", rankingRoutes);
app.use("/api", challengesRoutes);
app.use("/api", matchesRoutes);

/*
  PANEL DE ADMINISTRACIÓN
*/

app.use(
  "/api/admin",
  adminRoutes,
);

app.use(errorHandler);

export default app;