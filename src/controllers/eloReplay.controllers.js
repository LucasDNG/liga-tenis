import {
  buildEloReplayPlan,
  EloReplayError,
} from "../services/eloReplay.service.js";


/*
  ============================================================
  PREVIEW DE REPLAY HISTÓRICO

  READ ONLY.

  Este endpoint:
  - NO anula partidos
  - NO modifica Elo
  - NO toca matches_played
  - NO crea elo_events
  - NO crea replay batches

  Solamente analiza si el partido puede
  reconstruirse de forma segura.
  ============================================================
*/

export const getEloReplayPreview =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const matchId =
        Number(
          req.params.id,
        );

      if (
        !Number.isInteger(
          matchId,
        ) ||
        matchId < 1
      ) {
        return res
          .status(400)
          .json({
            message:
              "El id del partido no es válido.",

            reason:
              "invalid_match_id",
          });
      }

      /*
        buildEloReplayPlan recibe el
        cliente/pool con método query.

        El preview es solamente lectura,
        por eso no necesitamos abrir una
        transacción ni bloquear filas.
      */

      const {
        pool,
      } =
        await import(
          "../db.js"
        );

      const plan =
        await buildEloReplayPlan(
          pool,
          matchId,
        );

      res.json({
        message:
          "El replay histórico puede analizarse correctamente.",

        replay:
          plan,
      });
    } catch (error) {
      if (
        error instanceof
        EloReplayError
      ) {
        return res
          .status(409)
          .json({
            message:
              error.message,

            reason:
              error.code,

            details:
              error.details,
          });
      }

      next(error);
    }
  };