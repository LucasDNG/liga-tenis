import {
  pool,
} from "../db.js";

import {
  MATCH_CANCELLATION_PENALTY,
  calculateMatchCancellationElo,
  MatchCancellationError,
} from "../services/matchCancellation.service.js";

import {
  ensurePlayerCompetitionStats,
  getPlayerCompetitionStats,
  CompetitionServiceError,
} from "../services/competition.service.js";


const MIN_REASON_LENGTH =
  3;

const MAX_REASON_LENGTH =
  500;


/*
  ============================================================
  HELPERS
  ============================================================
*/


const parsePositiveInteger = (
  value,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(
      number,
    ) &&
    number > 0
  )
    ? number
    : null;
};


const parseReason = (
  value,
) => {
  const reason =
    String(
      value ?? "",
    ).trim();

  if (
    reason.length <
      MIN_REASON_LENGTH ||
    reason.length >
      MAX_REASON_LENGTH
  ) {
    return null;
  }

  return reason;
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
      // nada
    }
  };


const loadMatchForParticipant =
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
          m.*,

          c.id
            AS competition_id_resolved,

          c.format
            AS competition_format,

          c.gender
            AS competition_gender,

          c.city
            AS competition_city,

          c.name
            AS competition_name,

          c.team_size
            AS competition_team_size,

          c.placement_matches
            AS competition_placement_matches,

          c.active
            AS competition_active,

          COALESCE(
            (
              SELECT
                json_agg(
                  json_build_object(
                    'user_id',
                      mp.user_id,

                    'side',
                      mp.side,

                    'position',
                      mp.position
                  )

                  ORDER BY
                    mp.side,
                    mp.position
                )

              FROM match_participants mp

              WHERE
                mp.match_id =
                  m.id
            ),
            '[]'::json
          )
            AS participants

        FROM matches m

        JOIN competitions c
          ON c.id =
            m.competition_id

        WHERE
          m.id = $1

          AND EXISTS (
            SELECT 1

            FROM match_participants mine

            WHERE
              mine.match_id =
                m.id

              AND mine.user_id =
                $2
          )

        FOR UPDATE OF m
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

    const row =
      result.rows[0];

    return {
      ...row,

      competition: {
        id:
          Number(
            row
              .competition_id_resolved,
          ),

        format:
          row
            .competition_format,

        gender:
          row
            .competition_gender,

        city:
          row
            .competition_city,

        name:
          row
            .competition_name,

        team_size:
          Number(
            row
              .competition_team_size,
          ),

        placement_matches:
          Number(
            row
              .competition_placement_matches,
          ),

        active:
          Boolean(
            row
              .competition_active,
          ),
      },

      participants:
        Array.isArray(
          row.participants,
        )
          ? row.participants.map(
              (
                participant,
              ) => ({
                user_id:
                  Number(
                    participant
                      .user_id,
                  ),

                side:
                  Number(
                    participant.side,
                  ),

                position:
                  Number(
                    participant
                      .position,
                  ),
              }),
            )
          : [],
    };
  };


const assertSinglesCancellationFlow =
  (
    match,
  ) => {
    if (
      match
        ?.competition
        ?.format ===
        "singles" &&
      Number(
        match
          ?.competition
          ?.team_size,
      ) === 1
    ) {
      return;
    }

    const error =
      new Error(
        "La cancelación de partidos de dobles todavía no está habilitada.",
      );

    error.status =
      409;

    error.reason =
      "doubles_cancellation_not_implemented";

    throw error;
  };


const getCancellationProblem = (
  match,
) => {
  if (
    match.annulled_at
  ) {
    return {
      status:
        409,

      reason:
        "match_annulled",

      message:
        "Este partido fue anulado administrativamente.",
    };
  }

  if (
    match.cancelled_at ||
    match.status ===
      "cancelled"
  ) {
    return {
      status:
        409,

      reason:
        "match_already_cancelled",

      message:
        "Este partido ya está cancelado.",
    };
  }

  if (
    match.status ===
      "awaiting_confirmation"
  ) {
    return {
      status:
        409,

      reason:
        "result_already_submitted",

      message:
        "El partido ya tiene un resultado enviado. La cancelación ya no está disponible.",
    };
  }

  if (
    match.status ===
      "completed"
  ) {
    return {
      status:
        409,

      reason:
        "match_completed",

      message:
        "Un partido finalizado no puede cancelarse.",
    };
  }

  if (
    match.status !==
      "pending"
  ) {
    return {
      status:
        409,

      reason:
        "match_state_invalid",

      message:
        "El partido no está en un estado válido para cancelarse.",
    };
  }

  return null;
};


const validateCancellationMatch =
  (
    match,
  ) => {
    assertSinglesCancellationFlow(
      match,
    );

    const problem =
      getCancellationProblem(
        match,
      );

    if (
      problem
    ) {
      const error =
        new Error(
          problem.message,
        );

      error.status =
        problem.status;

      error.reason =
        problem.reason;

      throw error;
    }
  };


const closeChallengeAsCancelled =
  async (
    client,
    {
      challengeId,
      competitionId,
    },
  ) => {
    if (
      !challengeId
    ) {
      return;
    }

    const result =
      await client.query(
        `
        UPDATE challenges

        SET
          status =
            'cancelled',

          resolved_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $1

          AND competition_id =
            $2

          AND status =
            'accepted'

        RETURNING
          id,
          status
        `,
        [
          challengeId,
          competitionId,
        ],
      );

    if (
      result.rowCount ===
      1
    ) {
      return;
    }

    const current =
      await client.query(
        `
        SELECT
          id,
          status,
          competition_id

        FROM challenges

        WHERE
          id = $1

        LIMIT 1
        `,
        [
          challengeId,
        ],
      );

    if (
      current.rowCount ===
        1 &&
      current.rows[0]
        .status ===
        "cancelled" &&
      Number(
        current.rows[0]
          .competition_id,
      ) ===
        Number(
          competitionId,
        )
    ) {
      return;
    }

    const error =
      new Error(
        "El desafío asociado no está en un estado válido para cancelarse.",
      );

    error.status =
      409;

    error.reason =
      "challenge_state_invalid";

    throw error;
  };


const createAuditEvent =
  async (
    client,
    {
      userId,
      matchId,
      challengeId,
      eventType,
      details,
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
        challengeId,
        eventType,

        JSON.stringify(
          details ??
            {},
        ),
      ],
    );
  };


const getLockedCompetitionStats =
  async (
    client,
    {
      userId,
      competitionId,
    },
  ) => {
    await ensurePlayerCompetitionStats(
      client,
      {
        userId,
        competitionId,
      },
    );

    const stats =
      await getPlayerCompetitionStats(
        client,
        {
          userId,
          competitionId,
          forUpdate:
            true,
        },
      );

    if (
      !stats
    ) {
      const error =
        new Error(
          "No se pudieron obtener las estadísticas del jugador en esta competición.",
        );

      error.status =
        409;

      error.reason =
        "competition_stats_missing";

      throw error;
    }

    return stats;
  };


const updateCompetitionRating =
  async (
    client,
    {
      userId,
      competitionId,
      elo,
    },
  ) => {
    const result =
      await client.query(
        `
        UPDATE player_competition_stats

        SET
          rating =
            $1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          user_id = $2

          AND competition_id =
            $3

          AND rating =
            $4

        RETURNING
          id,
          user_id,
          competition_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          updated_at
        `,
        [
          elo.elo_after,
          userId,
          competitionId,
          elo.elo_before,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      const error =
        new Error(
          "Tu Elo cambió durante la cancelación. Actualizá la página e intentá nuevamente.",
        );

      error.status =
        409;

      error.reason =
        "rating_state_changed";

      throw error;
    }

    return result.rows[0];
  };


const insertCancellationEloEvent =
  async (
    client,
    {
      userId,
      competitionId,
      matchId,
      challengeId,
      elo,
    },
  ) => {
    const result =
      await client.query(
        `
        INSERT INTO elo_events (
          user_id,
          competition_id,
          match_id,
          challenge_id,
          event_type,
          elo_before,
          elo_change,
          elo_after,
          description
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          'match_cancellation',
          $5,
          $6,
          $7,
          $8
        )

        RETURNING *
        `,
        [
          userId,
          competitionId,
          matchId,
          challengeId,
          elo.elo_before,
          elo.elo_change,
          elo.elo_after,

          `Penalización por cancelación unilateral del partido #${matchId}: -${elo.effective_penalty} Elo`,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


const sendControllerError =
  (
    error,
    res,
    next,
  ) => {
    if (
      error instanceof
        MatchCancellationError ||
      error instanceof
        CompetitionServiceError
    ) {
      return res
        .status(409)
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

    if (
      error?.status
    ) {
      return res
        .status(
          error.status,
        )
        .json({
          message:
            error.message,

          reason:
            error.reason ??
            "match_cancellation_error",
        });
    }

    return next(
      error,
    );
  };


/*
  ============================================================
  CANCELACIÓN UNILATERAL
  ============================================================

  SINGLES:

  - participante cancela;
  - solamente pending;
  - hasta -15 Elo;
  - Elo de player_competition_stats;
  - evento con competition_id;
  - no incrementa partidos;
  - no cambia W/L ni games;
  - cierra partido;
  - cierra desafío.

  IMPORTANTE:

  El decay global de playerActivity.service.js
  ya NO se ejecuta acá.

  La actividad será migrada por competición
  en el próximo bloque.
  ============================================================
*/


export const cancelMatchUnilaterally =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let inTransaction =
      false;

    try {
      const userId =
        parsePositiveInteger(
          req.userId,
        );

      const matchId =
        parsePositiveInteger(
          req.params.id,
        );

      const reason =
        parseReason(
          req.body?.reason,
        );

      if (
        !userId
      ) {
        return res
          .status(401)
          .json({
            message:
              "Sesión inválida.",

            reason:
              "invalid_session",
          });
      }

      if (
        !matchId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Partido inválido.",

            reason:
              "invalid_match",
          });
      }

      if (
        !reason
      ) {
        return res
          .status(400)
          .json({
            message:
              `Ingresá un motivo de entre ${MIN_REASON_LENGTH} y ${MAX_REASON_LENGTH} caracteres.`,

            reason:
              "invalid_cancellation_reason",
          });
      }

      await client.query(
        "BEGIN",
      );

      inTransaction =
        true;

      const match =
        await loadMatchForParticipant(
          client,
          {
            matchId,
            userId,
          },
        );

      if (
        !match
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado.",

            reason:
              "match_not_found",
          });
      }

      validateCancellationMatch(
        match,
      );

      const competitionId =
        Number(
          match
            .competition
            .id,
        );

      const stats =
        await getLockedCompetitionStats(
          client,
          {
            userId,
            competitionId,
          },
        );

      const elo =
        calculateMatchCancellationElo({
          rating:
            stats.rating,

          matchesPlayed:
            stats
              .matches_played,

          placementMatches:
            match
              .competition
              .placement_matches,
        });

      const updatedStats =
        await updateCompetitionRating(
          client,
          {
            userId,
            competitionId,
            elo,
          },
        );

      const cancelled =
        await client.query(
          `
          UPDATE matches

          SET
            status =
              'cancelled',

            cancelled_by =
              $1,

            cancelled_at =
              CURRENT_TIMESTAMP,

            cancel_reason =
              $2,

            cancellation_type =
              'unilateral',

            cancellation_elo_penalty =
              $3,

            cancellation_requested_by =
              NULL,

            cancellation_requested_at =
              NULL,

            cancellation_confirmed_by =
              NULL,

            cancellation_confirmed_at =
              NULL

          WHERE
            id = $4

            AND competition_id =
              $5

            AND status =
              'pending'

            AND annulled_at
              IS NULL

            AND cancelled_at
              IS NULL

          RETURNING *
          `,
          [
            userId,
            reason,
            elo.effective_penalty,
            matchId,
            competitionId,
          ],
        );

      if (
        cancelled.rowCount !==
        1
      ) {
        const error =
          new Error(
            "El estado del partido cambió antes de poder cancelarlo.",
          );

        error.status =
          409;

        error.reason =
          "match_state_changed";

        throw error;
      }

      await closeChallengeAsCancelled(
        client,
        {
          challengeId:
            match.challenge_id,

          competitionId,
        },
      );

      const eloEvent =
        await insertCancellationEloEvent(
          client,
          {
            userId,
            competitionId,
            matchId,
            challengeId:
              match.challenge_id,
            elo,
          },
        );

      await createAuditEvent(
        client,
        {
          userId,
          matchId,
          challengeId:
            match.challenge_id,

          eventType:
            "match_cancelled_unilateral",

          details: {
            competition_id:
              competitionId,

            competition_format:
              match
                .competition
                .format,

            competition_gender:
              match
                .competition
                .gender,

            reason,

            configured_elo_penalty:
              MATCH_CANCELLATION_PENALTY,

            effective_elo_penalty:
              elo.effective_penalty,

            elo_before:
              elo.elo_before,

            elo_after:
              elo.elo_after,

            provisional:
              elo.provisional,

            matches_played:
              elo
                .matches_played,

            placement_matches:
              elo
                .placement_matches,

            participant_ids:
              match
                .participants
                .map(
                  (
                    participant,
                  ) =>
                    Number(
                      participant
                        .user_id,
                    ),
                ),
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      inTransaction =
        false;

      return res.json({
        message:
          elo.effective_penalty > 0
            ? `Partido cancelado. Se descontaron ${elo.effective_penalty} puntos Elo en ${match.competition.name}.`
            : "Partido cancelado. No hubo descuento adicional porque alcanzaste el piso Elo permitido.",

        match:
          cancelled.rows[0],

        competition: {
          id:
            competitionId,

          format:
            match
              .competition
              .format,

          gender:
            match
              .competition
              .gender,

          city:
            match
              .competition
              .city,

          name:
            match
              .competition
              .name,
        },

        cancellation: {
          type:
            "unilateral",

          configured_penalty:
            MATCH_CANCELLATION_PENALTY,

          effective_penalty:
            elo.effective_penalty,

          elo_change:
            elo.elo_change,

          rating_before:
            elo.elo_before,

          rating_after:
            elo.elo_after,

          provisional:
            elo.provisional,
        },

        competition_stats:
          updatedStats,

        elo_event_id:
          eloEvent?.id ??
          null,
      });
    } catch (error) {
      if (
        inTransaction
      ) {
        await rollbackQuietly(
          client,
        );
      }

      return sendControllerError(
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
  SOLICITAR CANCELACIÓN MUTUA
  ============================================================
*/


export const requestMutualCancellation =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let inTransaction =
      false;

    try {
      const userId =
        parsePositiveInteger(
          req.userId,
        );

      const matchId =
        parsePositiveInteger(
          req.params.id,
        );

      const reason =
        parseReason(
          req.body?.reason,
        );

      if (
        !userId
      ) {
        return res
          .status(401)
          .json({
            message:
              "Sesión inválida.",

            reason:
              "invalid_session",
          });
      }

      if (
        !matchId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Partido inválido.",

            reason:
              "invalid_match",
          });
      }

      if (
        !reason
      ) {
        return res
          .status(400)
          .json({
            message:
              `Ingresá un motivo de entre ${MIN_REASON_LENGTH} y ${MAX_REASON_LENGTH} caracteres.`,

            reason:
              "invalid_cancellation_reason",
          });
      }

      await client.query(
        "BEGIN",
      );

      inTransaction =
        true;

      const match =
        await loadMatchForParticipant(
          client,
          {
            matchId,
            userId,
          },
        );

      if (
        !match
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado.",

            reason:
              "match_not_found",
          });
      }

      validateCancellationMatch(
        match,
      );

      if (
        match
          .cancellation_requested_at
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        if (
          Number(
            match
              .cancellation_requested_by,
          ) ===
          userId
        ) {
          return res
            .status(409)
            .json({
              message:
                "Ya enviaste una solicitud de cancelación. Falta que tu rival la responda.",

              reason:
                "cancellation_already_requested",
            });
        }

        return res
          .status(409)
          .json({
            message:
              "Tu rival ya solicitó cancelar este partido. Tenés que aceptar o rechazar esa solicitud.",

            reason:
              "incoming_cancellation_request",
          });
      }

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            cancellation_requested_by =
              $1,

            cancellation_requested_at =
              CURRENT_TIMESTAMP,

            cancel_reason =
              $2

          WHERE
            id = $3

            AND competition_id =
              $4

            AND status =
              'pending'

            AND annulled_at
              IS NULL

            AND cancelled_at
              IS NULL

            AND cancellation_requested_at
              IS NULL

          RETURNING *
          `,
          [
            userId,
            reason,
            matchId,
            match
              .competition
              .id,
          ],
        );

      if (
        result.rowCount !==
        1
      ) {
        const error =
          new Error(
            "El estado del partido cambió antes de poder enviar la solicitud.",
          );

        error.status =
          409;

        error.reason =
          "match_state_changed";

        throw error;
      }

      await createAuditEvent(
        client,
        {
          userId,
          matchId,
          challengeId:
            match.challenge_id,

          eventType:
            "match_mutual_cancellation_requested",

          details: {
            competition_id:
              Number(
                match
                  .competition
                  .id,
              ),

            reason,

            requested_by:
              userId,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      inTransaction =
        false;

      return res.json({
        message:
          "Solicitud enviada. El partido seguirá activo hasta que tu rival confirme la cancelación.",

        match:
          result.rows[0],
      });
    } catch (error) {
      if (
        inTransaction
      ) {
        await rollbackQuietly(
          client,
        );
      }

      return sendControllerError(
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
  CONFIRMAR CANCELACIÓN MUTUA
  ============================================================
*/


export const confirmMutualCancellation =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let inTransaction =
      false;

    try {
      const userId =
        parsePositiveInteger(
          req.userId,
        );

      const matchId =
        parsePositiveInteger(
          req.params.id,
        );

      if (
        !userId ||
        !matchId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Solicitud inválida.",

            reason:
              "invalid_request",
          });
      }

      await client.query(
        "BEGIN",
      );

      inTransaction =
        true;

      const match =
        await loadMatchForParticipant(
          client,
          {
            matchId,
            userId,
          },
        );

      if (
        !match
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado.",

            reason:
              "match_not_found",
          });
      }

      validateCancellationMatch(
        match,
      );

      if (
        !match
          .cancellation_requested_at ||
        !match
          .cancellation_requested_by
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "No existe una solicitud de cancelación pendiente.",

            reason:
              "cancellation_request_not_found",
          });
      }

      if (
        Number(
          match
            .cancellation_requested_by,
        ) ===
        userId
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(403)
          .json({
            message:
              "La solicitud debe ser confirmada por tu rival.",

            reason:
              "requester_cannot_confirm",
          });
      }

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            status =
              'cancelled',

            cancelled_by =
              NULL,

            cancelled_at =
              CURRENT_TIMESTAMP,

            cancellation_type =
              'mutual',

            cancellation_elo_penalty =
              0,

            cancellation_confirmed_by =
              $1,

            cancellation_confirmed_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2

            AND competition_id =
              $3

            AND status =
              'pending'

            AND annulled_at
              IS NULL

            AND cancelled_at
              IS NULL

            AND cancellation_requested_at
              IS NOT NULL

            AND cancellation_requested_by
              <> $1

          RETURNING *
          `,
          [
            userId,
            matchId,
            match
              .competition
              .id,
          ],
        );

      if (
        result.rowCount !==
        1
      ) {
        const error =
          new Error(
            "La solicitud cambió de estado antes de poder confirmarla.",
          );

        error.status =
          409;

        error.reason =
          "cancellation_request_state_changed";

        throw error;
      }

      await closeChallengeAsCancelled(
        client,
        {
          challengeId:
            match.challenge_id,

          competitionId:
            match
              .competition
              .id,
        },
      );

      await createAuditEvent(
        client,
        {
          userId,
          matchId,
          challengeId:
            match.challenge_id,

          eventType:
            "match_cancelled_mutual",

          details: {
            competition_id:
              Number(
                match
                  .competition
                  .id,
              ),

            requested_by:
              Number(
                match
                  .cancellation_requested_by,
              ),

            confirmed_by:
              userId,

            reason:
              match
                .cancel_reason,

            elo_penalty:
              0,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      inTransaction =
        false;

      return res.json({
        message:
          "Cancelación confirmada. El partido fue cancelado de común acuerdo y ninguno perdió Elo.",

        match:
          result.rows[0],

        cancellation: {
          type:
            "mutual",

          effective_penalty:
            0,
        },
      });
    } catch (error) {
      if (
        inTransaction
      ) {
        await rollbackQuietly(
          client,
        );
      }

      return sendControllerError(
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
  RECHAZAR SOLICITUD DE CANCELACIÓN MUTUA
  ============================================================
*/


export const rejectMutualCancellation =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let inTransaction =
      false;

    try {
      const userId =
        parsePositiveInteger(
          req.userId,
        );

      const matchId =
        parsePositiveInteger(
          req.params.id,
        );

      if (
        !userId ||
        !matchId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Solicitud inválida.",

            reason:
              "invalid_request",
          });
      }

      await client.query(
        "BEGIN",
      );

      inTransaction =
        true;

      const match =
        await loadMatchForParticipant(
          client,
          {
            matchId,
            userId,
          },
        );

      if (
        !match
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado.",

            reason:
              "match_not_found",
          });
      }

      validateCancellationMatch(
        match,
      );

      if (
        !match
          .cancellation_requested_at ||
        !match
          .cancellation_requested_by
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "No existe una solicitud de cancelación pendiente.",

            reason:
              "cancellation_request_not_found",
          });
      }

      if (
        Number(
          match
            .cancellation_requested_by,
        ) ===
        userId
      ) {
        await rollbackQuietly(
          client,
        );

        inTransaction =
          false;

        return res
          .status(403)
          .json({
            message:
              "No podés rechazar tu propia solicitud.",

            reason:
              "requester_cannot_reject",
          });
      }

      const requesterId =
        Number(
          match
            .cancellation_requested_by,
        );

      const originalReason =
        match
          .cancel_reason;

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            cancellation_requested_by =
              NULL,

            cancellation_requested_at =
              NULL,

            cancel_reason =
              NULL

          WHERE
            id = $1

            AND competition_id =
              $2

            AND status =
              'pending'

            AND cancellation_requested_by
              IS NOT NULL

            AND cancellation_requested_by
              <> $3

          RETURNING *
          `,
          [
            matchId,
            match
              .competition
              .id,
            userId,
          ],
        );

      if (
        result.rowCount !==
        1
      ) {
        const error =
          new Error(
            "La solicitud cambió de estado antes de poder rechazarla.",
          );

        error.status =
          409;

        error.reason =
          "cancellation_request_state_changed";

        throw error;
      }

      await createAuditEvent(
        client,
        {
          userId,
          matchId,
          challengeId:
            match.challenge_id,

          eventType:
            "match_mutual_cancellation_rejected",

          details: {
            competition_id:
              Number(
                match
                  .competition
                  .id,
              ),

            requested_by:
              requesterId,

            rejected_by:
              userId,

            reason:
              originalReason,

            elo_penalty:
              0,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      inTransaction =
        false;

      return res.json({
        message:
          "Rechazaste la cancelación de común acuerdo. El partido sigue programado.",

        match:
          result.rows[0],
      });
    } catch (error) {
      if (
        inTransaction
      ) {
        await rollbackQuietly(
          client,
        );
      }

      return sendControllerError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };