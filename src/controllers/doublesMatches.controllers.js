import {
  pool,
} from "../db.js";

import {
  parseMatchScore,
} from "../services/matchScore.service.js";

import {
  settleDoublesPairMatch,
} from "../services/doublesPairSettlement.service.js";


const positiveInteger = (
  value,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : null;
};


const rollbackQuietly =
  async (
    client,
  ) => {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {
      // sin acción
    }
  };


const sendError = (
  error,
  res,
  next,
) => {
  if (
    error?.statusCode &&
    error?.reason
  ) {
    return res
      .status(
        error.statusCode,
      )
      .json({
        message:
          error.message,

        reason:
          error.reason,

        details:
          error.details ??
          null,
      });
  }

  return next(
    error,
  );
};


const auditEvent =
  async (
    client,
    {
      userId,
      matchId,
      challengeId,
      eventType,
      details = {},
    },
  ) => {
    await client.query(
      `
      INSERT INTO audit_events (
        user_id,
        match_id,
        challenge_id,
        event_type,
        details
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5
      )
      `,
      [
        userId,
        matchId,
        challengeId ??
          null,
        eventType,
        JSON.stringify(
          details,
        ),
      ],
    );
  };


const getLockedDoublesMatch =
  async (
    client,
    {
      matchId,
      userId,
      requiredStatus,
    },
  ) => {
    const normalizedMatchId =
      positiveInteger(
        matchId,
      );

    const normalizedUserId =
      positiveInteger(
        userId,
      );

    if (
      !normalizedMatchId ||
      !normalizedUserId
    ) {
      return null;
    }

    const result =
      await client.query(
        `
        SELECT
          m.*,

          c.format
            AS competition_format,

          c.gender
            AS competition_gender,

          c.city
            AS competition_city,

          c.team_size
            AS competition_team_size,

          c.placement_matches
            AS competition_placement_matches,

          mine.side
            AS viewer_side

        FROM matches m

        JOIN competitions c
          ON c.id =
            m.competition_id

        JOIN match_participants mine
          ON mine.match_id =
            m.id

          AND mine.user_id =
            $2

        WHERE
          m.id = $1

          AND m.status = $3

          AND m.annulled_at
            IS NULL

          AND c.format =
            'doubles'

          AND c.team_size = 2

        FOR UPDATE OF m
        `,
        [
          normalizedMatchId,
          normalizedUserId,
          requiredStatus,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      return null;
    }

    const row =
      result.rows[0];

    return {
      ...row,

      id:
        Number(row.id),

      competition_id:
        Number(
          row.competition_id,
        ),

      side1_pair_id:
        Number(
          row.side1_pair_id,
        ),

      side2_pair_id:
        Number(
          row.side2_pair_id,
        ),

      viewer_side:
        Number(
          row.viewer_side,
        ),

      placement_matches:
        Number(
          row
            .competition_placement_matches,
        ),
    };
  };


const getUserSide =
  async (
    client,
    {
      matchId,
      userId,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          side

        FROM match_participants

        WHERE
          match_id = $1

          AND user_id = $2

        LIMIT 1
        `,
        [
          matchId,
          userId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      return null;
    }

    return Number(
      result.rows[0]
        .side,
    );
  };


const getFirstPlayerOnSide =
  async (
    client,
    {
      matchId,
      side,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          user_id

        FROM match_participants

        WHERE
          match_id = $1

          AND side = $2

        ORDER BY
          position ASC

        LIMIT 1
        `,
        [
          matchId,
          side,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      return null;
    }

    return Number(
      result.rows[0]
        .user_id,
    );
  };


const validateScheduledMatch = (
  match,
) => {
  if (
    !match.scheduled_at
  ) {
    return {
      ok:
        false,

      status:
        400,

      body: {
        message:
          "Este partido no tiene fecha y hora registradas.",

        reason:
          "schedule_missing",
      },
    };
  }

  const scheduledTime =
    new Date(
      match.scheduled_at,
    ).getTime();

  if (
    Number.isNaN(
      scheduledTime,
    )
  ) {
    return {
      ok:
        false,

      status:
        400,

      body: {
        message:
          "La fecha y hora registradas no son válidas.",

        reason:
          "invalid_schedule",
      },
    };
  }

  if (
    scheduledTime >
    Date.now()
  ) {
    return {
      ok:
        false,

      status:
        403,

      body: {
        message:
          "Todavía no podés cargar el resultado. El partido aún no llegó a su horario programado.",

        reason:
          "match_not_started",

        available_at:
          match.scheduled_at,
      },
    };
  }

  return {
    ok:
      true,
  };
};


/*
  ============================================================
  CARGAR RESULTADO DE DOBLES
  ============================================================

  Cualquiera de los 2 integrantes de cualquiera
  de los lados puede cargar el resultado.

  La propuesta pertenece al LADO, no al usuario.
  ============================================================
*/


export const submitDoublesMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const userId =
        positiveInteger(
          req.userId,
        );

      if (!userId) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "Usuario inválido.",

            reason:
              "invalid_user_id",
          });
      }

      const parsed =
        parseMatchScore(
          req.body?.score,
        );

      if (
        parsed.error
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              parsed.error,

            reason:
              "invalid_score",
          });
      }

      const match =
        await getLockedDoublesMatch(
          client,
          {
            matchId:
              req.params.id,

            userId,

            requiredStatus:
              "pending",
          },
        );

      if (!match) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(404)
          .json({
            message:
              "Partido de dobles pendiente no encontrado.",

            reason:
              "match_not_found",
          });
      }

      if (
        !match.side1_pair_id ||
        !match.side2_pair_id
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "El partido de dobles no tiene sus parejas asociadas.",

            reason:
              "match_pairs_missing",
          });
      }

      const schedule =
        validateScheduledMatch(
          match,
        );

      if (
        !schedule.ok
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(
            schedule.status,
          )
          .json(
            schedule.body,
          );
      }

      const winnerSide =
        Number(
          parsed.winnerSide,
        );

      if (
        winnerSide !== 1 &&
        winnerSide !== 2
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "No se pudo determinar el lado ganador.",

            reason:
              "winner_side_invalid",
          });
      }

      /*
        proposed_winner_id se mantiene por compatibilidad
        con la estructura histórica.

        En dobles la autoridad deportiva real es:
        winnerSide + side1_pair_id / side2_pair_id.
      */

      const proposedWinnerId =
        await getFirstPlayerOnSide(
          client,
          {
            matchId:
              match.id,

            side:
              winnerSide,
          },
        );

      if (
        !proposedWinnerId
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudo resolver el lado ganador.",

            reason:
              "winner_resolution_failed",
          });
      }

      const updated =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id = $1,

            proposed_score = $2,

            result_submitted_by = $3,

            result_submitted_at =
              CURRENT_TIMESTAMP,

            status =
              'awaiting_confirmation'

          WHERE
            id = $4

            AND status =
              'pending'

            AND annulled_at
              IS NULL

          RETURNING
            *
          `,
          [
            proposedWinnerId,

            JSON.stringify(
              parsed
                .normalizedScore,
            ),

            userId,

            match.id,
          ],
        );

      if (
        updated.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió. Actualizá la página.",

            reason:
              "match_state_changed",
          });
      }

      await auditEvent(
        client,
        {
          userId,

          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          eventType:
            "doubles_match_result_submitted",

          details: {
            competition_id:
              match.competition_id,

            submitted_side:
              match.viewer_side,

            winner_side:
              winnerSide,

            winner_pair_id:
              winnerSide === 1
                ? match.side1_pair_id
                : match.side2_pair_id,

            score:
              parsed
                .normalizedScore,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        message:
          "Resultado enviado. Esperando confirmación de la pareja rival.",

        match:
          updated.rows[0],

        result_flow: {
          submitted_side:
            match.viewer_side,

          winner_side:
            winnerSide,
        },
      });
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  RECHAZAR RESULTADO DE DOBLES
  ============================================================

  Regla:
  - mismo lado que cargó: NO puede rechazar;
  - cualquiera del lado contrario: SÍ;
  - vuelve a pending.
  ============================================================
*/


export const rejectDoublesMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const userId =
        positiveInteger(
          req.userId,
        );

      const match =
        await getLockedDoublesMatch(
          client,
          {
            matchId:
              req.params.id,

            userId,

            requiredStatus:
              "awaiting_confirmation",
          },
        );

      if (!match) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(404)
          .json({
            message:
              "Resultado de dobles para confirmar no encontrado.",

            reason:
              "result_not_found",
          });
      }

      const submittedSide =
        await getUserSide(
          client,
          {
            matchId:
              match.id,

            userId:
              match
                .result_submitted_by,
          },
        );

      if (
        !submittedSide
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudo determinar qué pareja cargó el resultado.",

            reason:
              "submitted_side_missing",
          });
      }

      if (
        match.viewer_side ===
        submittedSide
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(403)
          .json({
            message:
              "La pareja que cargó el resultado no puede rechazar su propia propuesta.",

            reason:
              "same_side_cannot_reject",
          });
      }

      const rejectedSubmissionBy =
        match.result_submitted_by;

      const rejectedWinnerId =
        match.proposed_winner_id;

      const rejectedScore =
        match.proposed_score;

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id =
              NULL,

            proposed_score =
              NULL,

            result_submitted_by =
              NULL,

            result_submitted_at =
              NULL,

            result_rejection_count =
              COALESCE(
                result_rejection_count,
                0
              ) + 1,

            status =
              'pending'

          WHERE
            id = $1

            AND status =
              'awaiting_confirmation'

            AND annulled_at
              IS NULL

          RETURNING
            *
          `,
          [
            match.id,
          ],
        );

      if (
        result.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del resultado cambió. Actualizá la página.",

            reason:
              "result_state_changed",
          });
      }

      await auditEvent(
        client,
        {
          userId,

          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          eventType:
            "doubles_match_result_rejected",

          details: {
            competition_id:
              match.competition_id,

            submitted_side:
              submittedSide,

            rejected_by_side:
              match.viewer_side,

            rejected_submission_by:
              rejectedSubmissionBy,

            rejected_winner_id:
              rejectedWinnerId,

            rejected_score:
              rejectedScore,

            rejection_count:
              result.rows[0]
                .result_rejection_count,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        message:
          "Resultado rechazado. Cualquiera de los cuatro jugadores puede cargar una nueva propuesta.",

        rejection_count:
          result.rows[0]
            .result_rejection_count,
      });
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  CONFIRMAR RESULTADO DE DOBLES
  ============================================================

  Una confirmación del lado rival alcanza.

  Al confirmar:
  - se determina winnerSide;
  - se liquida Elo de las dos parejas;
  - se actualizan W/L;
  - se actualizan games;
  - se crean pair_elo_events;
  - se crea settlement;
  - partido completed;
  - desafío completed.
  ============================================================
*/


export const confirmDoublesMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const userId =
        positiveInteger(
          req.userId,
        );

      const match =
        await getLockedDoublesMatch(
          client,
          {
            matchId:
              req.params.id,

            userId,

            requiredStatus:
              "awaiting_confirmation",
          },
        );

      if (!match) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(404)
          .json({
            message:
              "Resultado de dobles para confirmar no encontrado.",

            reason:
              "result_not_found",
          });
      }

      if (
        !match.side1_pair_id ||
        !match.side2_pair_id
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "El partido no tiene las parejas competitivas asociadas.",

            reason:
              "match_pairs_missing",
          });
      }

      const submittedSide =
        await getUserSide(
          client,
          {
            matchId:
              match.id,

            userId:
              match
                .result_submitted_by,
          },
        );

      if (
        !submittedSide
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudo determinar qué pareja cargó el resultado.",

            reason:
              "submitted_side_missing",
          });
      }

      if (
        match.viewer_side ===
        submittedSide
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(403)
          .json({
            message:
              "La pareja que cargó el resultado no puede confirmarlo.",

            reason:
              "same_side_cannot_confirm",
          });
      }

      if (
        !match.proposed_winner_id ||
        !match.proposed_score
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "La propuesta de resultado está incompleta.",

            reason:
              "result_proposal_incomplete",
          });
      }

      const winnerSide =
        await getUserSide(
          client,
          {
            matchId:
              match.id,

            userId:
              match
                .proposed_winner_id,
          },
        );

      if (
        winnerSide !== 1 &&
        winnerSide !== 2
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudo determinar la pareja ganadora.",

            reason:
              "winner_side_missing",
          });
      }

      const normalizedScore =
        typeof match.proposed_score ===
        "string"
          ? JSON.parse(
              match.proposed_score,
            )
          : match.proposed_score;

      const settlement =
        await settleDoublesPairMatch(
          client,
          {
            matchId:
              match.id,

            competitionId:
              match.competition_id,

            side1PairId:
              match.side1_pair_id,

            side2PairId:
              match.side2_pair_id,

            winnerSide,

            normalizedScore,

            placementMatches:
              match
                .placement_matches,
          },
        );

      const winnerPairId =
        winnerSide === 1
          ? match.side1_pair_id
          : match.side2_pair_id;

      /*
        winner_id se mantiene por compatibilidad
        con frontend/transparencia histórica.
        En dobles la autoridad es winnerPairId.
      */

      const winnerId =
        await getFirstPlayerOnSide(
          client,
          {
            matchId:
              match.id,

            side:
              winnerSide,
          },
        );

      const updated =
        await client.query(
          `
          UPDATE matches

          SET
            winner_id = $1,

            score = $2,

            result_confirmed_by = $3,

            result_confirmed_at =
              CURRENT_TIMESTAMP,

            completed_at =
              CURRENT_TIMESTAMP,

            status =
              'completed'

          WHERE
            id = $4

            AND status =
              'awaiting_confirmation'

            AND annulled_at
              IS NULL

          RETURNING
            *
          `,
          [
            winnerId,

            JSON.stringify(
              normalizedScore,
            ),

            userId,

            match.id,
          ],
        );

      if (
        updated.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "El partido cambió de estado durante la confirmación.",

            reason:
              "match_state_changed",
          });
      }

      if (
        match.challenge_id
      ) {
        await client.query(
          `
          UPDATE challenges

          SET
            status =
              'completed',

            completed_at =
              CURRENT_TIMESTAMP,

            resolved_at =
              COALESCE(
                resolved_at,
                CURRENT_TIMESTAMP
              )

          WHERE
            id = $1

            AND status =
              'accepted'
          `,
          [
            match.challenge_id,
          ],
        );
      }

      await auditEvent(
        client,
        {
          userId,

          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          eventType:
            "doubles_match_result_confirmed",

          details: {
            competition_id:
              match.competition_id,

            submitted_side:
              submittedSide,

            confirmed_by_side:
              match.viewer_side,

            winner_side:
              winnerSide,

            winner_pair_id:
              winnerPairId,

            score:
              normalizedScore,

            side1_pair_id:
              match.side1_pair_id,

            side1_elo_before:
              settlement
                .side1
                .rating
                .rating_before,

            side1_elo_change:
              settlement
                .side1
                .rating
                .elo_change,

            side1_elo_after:
              settlement
                .side1
                .rating
                .rating_after,

            side2_pair_id:
              match.side2_pair_id,

            side2_elo_before:
              settlement
                .side2
                .rating
                .rating_before,

            side2_elo_change:
              settlement
                .side2
                .rating
                .elo_change,

            side2_elo_after:
              settlement
                .side2
                .rating
                .rating_after,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      return res.json({
        message:
          "Resultado confirmado. El partido de dobles quedó completado.",

        match:
          updated.rows[0],

        doubles: {
          winner_side:
            winnerSide,

          winner_pair_id:
            winnerPairId,

          games:
            settlement.games,

          side1: {
            pair_id:
              match.side1_pair_id,

            elo_before:
              settlement
                .side1
                .rating
                .rating_before,

            elo_change:
              settlement
                .side1
                .rating
                .elo_change,

            elo_after:
              settlement
                .side1
                .rating
                .rating_after,

            matches_played:
              settlement
                .side1
                .pair_after
                .matches_played,

            placement_completed:
              settlement
                .side1
                .rating
                .placement_completed,
          },

          side2: {
            pair_id:
              match.side2_pair_id,

            elo_before:
              settlement
                .side2
                .rating
                .rating_before,

            elo_change:
              settlement
                .side2
                .rating
                .elo_change,

            elo_after:
              settlement
                .side2
                .rating
                .rating_after,

            matches_played:
              settlement
                .side2
                .pair_after
                .matches_played,

            placement_completed:
              settlement
                .side2
                .rating
                .placement_completed,
          },
        },
      });
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


export default {
  submitDoublesMatchResult,
  rejectDoublesMatchResult,
  confirmDoublesMatchResult,
};