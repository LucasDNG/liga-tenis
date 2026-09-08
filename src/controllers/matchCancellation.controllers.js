import {
  pool,
} from "../db.js";

import {
  applyPendingInactivityDecay,
} from "../services/playerActivity.service.js";

import {
  MATCH_CANCELLATION_PENALTY,
  calculateMatchCancellationElo,
} from "../services/matchCancellation.service.js";


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

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
};


const parseReason = (
  value,
) => {
  const reason =
    String(
      value || "",
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


/*
  ============================================================
  JUGADOR
  ============================================================
*/

const loadPlayer = async (
  client,
  userId,
  {
    forUpdate =
      false,
  } = {},
) => {
  const result =
    await client.query(
      `
      SELECT
        id,
        name,
        city,
        gender,
        role,
        verification_status,
        rating,
        matches_played

      FROM users

      WHERE id = $1

      ${
        forUpdate
          ? "FOR UPDATE"
          : ""
      }
      `,
      [
        userId,
      ],
    );

  return (
    result.rows[0] ||
    null
  );
};


/*
  ============================================================
  PARTIDO DEL JUGADOR
  ============================================================
*/

const loadMatchForPlayer = async (
  client,
  matchId,
  userId,
) => {
  const result =
    await client.query(
      `
      SELECT
        m.*,

        p1.name
          AS player1_name,

        p2.name
          AS player2_name

      FROM matches m

      JOIN users p1
        ON p1.id =
           m.player1_id

      JOIN users p2
        ON p2.id =
           m.player2_id

      WHERE
        m.id = $1

        AND (
          m.player1_id = $2
          OR
          m.player2_id = $2
        )

      FOR UPDATE OF m
      `,
      [
        matchId,
        userId,
      ],
    );

  return (
    result.rows[0] ||
    null
  );
};


/*
  ============================================================
  VALIDAR PARTIDO CANCELABLE
  ============================================================

  Una vez cargado un resultado el partido
  ya entró en proceso deportivo.

  No permitimos cancelación desde:

  awaiting_confirmation
  completed
  cancelled

  para evitar que alguien use -15 Elo como
  forma de escapar de una derrota que ya
  se jugó o fue informada.
  ============================================================
*/

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


/*
  ============================================================
  CERRAR DESAFÍO
  ============================================================
*/

const closeChallengeAsCancelled =
  async (
    client,
    challengeId,
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

          AND status =
            'accepted'

        RETURNING id
        `,
        [
          challengeId,
        ],
      );

    if (
      !result.rowCount
    ) {
      const current =
        await client.query(
          `
          SELECT
            id,
            status

          FROM challenges

          WHERE id = $1
          `,
          [
            challengeId,
          ],
        );

      if (
        current.rowCount &&
        current.rows[0].status ===
          "cancelled"
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
    }
  };


/*
  ============================================================
  AUDITORÍA
  ============================================================
*/

const createAuditEvent = async (
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
        details || {},
      ),
    ],
  );
};


/*
  ============================================================
  CANCELACIÓN UNILATERAL
  ============================================================

  - cualquier participante puede cancelar;
  - solamente mientras status = pending;
  - pierde hasta 15 Elo;
  - respeta pisos;
  - crea elo_event;
  - cierra partido;
  - cierra desafío.
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

      if (!userId) {
        return res
          .status(401)
          .json({
            message:
              "Sesión inválida.",

            reason:
              "invalid_session",
          });
      }

      if (!matchId) {
        return res
          .status(400)
          .json({
            message:
              "Partido inválido.",

            reason:
              "invalid_match",
          });
      }

      if (!reason) {
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

      /*
        Primero leemos al jugador para
        conocer su liga.
      */

      let player =
        await loadPlayer(
          client,
          userId,
        );

      if (!player) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(404)
          .json({
            message:
              "Jugador no encontrado.",

            reason:
              "player_not_found",
          });
      }

      if (
        player.role !==
          "player" ||
        player
          .verification_status !==
          "verified"
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(403)
          .json({
            message:
              "Tu cuenta debe estar verificada para cancelar partidos.",

            reason:
              "player_not_verified",
          });
      }

      /*
        Antes de calcular la penalización
        dejamos aplicado todo decay pendiente
        de la liga.

        Así -15 siempre parte del Elo real.
      */

      await applyPendingInactivityDecay(
        client,
        {
          city:
            player.city,

          gender:
            player.gender,
        },
      );

      /*
        Recargamos y bloqueamos al jugador
        después del decay.
      */

      player =
        await loadPlayer(
          client,
          userId,
          {
            forUpdate:
              true,
          },
        );

      const match =
        await loadMatchForPlayer(
          client,
          matchId,
          userId,
        );

      if (!match) {
        await client.query(
          "ROLLBACK",
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

      const problem =
        getCancellationProblem(
          match,
        );

      if (problem) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(
            problem.status,
          )
          .json({
            message:
              problem.message,

            reason:
              problem.reason,
          });
      }

      const elo =
        calculateMatchCancellationElo({
          rating:
            player.rating,

          matchesPlayed:
            player
              .matches_played,
        });

      /*
        Actualizar Elo.
      */

      const updatedPlayer =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2

            AND rating = $3

          RETURNING
            id,
            rating,
            matches_played
          `,
          [
            elo.elo_after,
            userId,
            elo.elo_before,
          ],
        );

      if (
        !updatedPlayer.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(409)
          .json({
            message:
              "Tu Elo cambió durante la cancelación. Actualizá la página e intentá nuevamente.",

            reason:
              "rating_state_changed",
          });
      }

      /*
        Cancelar partido.
      */

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
          ],
        );

      if (
        !cancelled.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió antes de poder cancelarlo.",

            reason:
              "match_state_changed",
          });
      }

      await closeChallengeAsCancelled(
        client,
        match.challenge_id,
      );

      /*
        Registrar movimiento Elo.

        Aunque la penalización efectiva sea 0
        porque el jugador ya está en el piso,
        dejamos el evento para conservar la
        trazabilidad de la acción.
      */

      await client.query(
        `
        INSERT INTO elo_events (
          user_id,
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
          'match_cancellation',
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          userId,
          matchId,
          match.challenge_id,
          elo.elo_before,
          elo.elo_change,
          elo.elo_after,

          `Penalización por cancelación unilateral del partido #${matchId}: -${elo.effective_penalty} Elo`,
        ],
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

            player1_id:
              Number(
                match.player1_id,
              ),

            player2_id:
              Number(
                match.player2_id,
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
            ? `Partido cancelado. Se descontaron ${elo.effective_penalty} puntos Elo.`
            : "Partido cancelado. Tu Elo ya estaba en el mínimo permitido.",

        match:
          cancelled.rows[0],

        cancellation: {
          type:
            "unilateral",

          configured_penalty:
            MATCH_CANCELLATION_PENALTY,

          effective_penalty:
            elo.effective_penalty,

          elo_change:
            elo.elo_change,

          rating:
            elo.elo_after,
        },
      });
    } catch (error) {
      if (inTransaction) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch {
          // conexión liberada abajo
        }
      }

      if (
        error.status
      ) {
        return res
          .status(
            error.status,
          )
          .json({
            message:
              error.message,

            reason:
              error.reason ||
              "match_cancellation_error",
          });
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  SOLICITAR CANCELACIÓN MUTUA
  ============================================================

  No modifica Elo.

  El partido sigue activo hasta que
  el rival confirme.
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

      if (!userId) {
        return res
          .status(401)
          .json({
            message:
              "Sesión inválida.",

            reason:
              "invalid_session",
          });
      }

      if (!matchId) {
        return res
          .status(400)
          .json({
            message:
              "Partido inválido.",

            reason:
              "invalid_match",
          });
      }

      if (!reason) {
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
        await loadMatchForPlayer(
          client,
          matchId,
          userId,
        );

      if (!match) {
        await client.query(
          "ROLLBACK",
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

      const problem =
        getCancellationProblem(
          match,
        );

      if (problem) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(
            problem.status,
          )
          .json({
            message:
              problem.message,

            reason:
              problem.reason,
          });
      }

      if (
        match
          .cancellation_requested_at
      ) {
        await client.query(
          "ROLLBACK",
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
          ],
        );

      if (
        !result.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió antes de poder enviar la solicitud.",

            reason:
              "match_state_changed",
          });
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
      if (inTransaction) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch {
          // conexión liberada abajo
        }
      }

      next(error);
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
        await loadMatchForPlayer(
          client,
          matchId,
          userId,
        );

      if (!match) {
        await client.query(
          "ROLLBACK",
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

      const problem =
        getCancellationProblem(
          match,
        );

      if (problem) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(
            problem.status,
          )
          .json({
            message:
              problem.message,

            reason:
              problem.reason,
          });
      }

      if (
        !match
          .cancellation_requested_at ||
        !match
          .cancellation_requested_by
      ) {
        await client.query(
          "ROLLBACK",
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
        await client.query(
          "ROLLBACK",
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
          ],
        );

      if (
        !result.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(409)
          .json({
            message:
              "La solicitud cambió de estado antes de poder confirmarla.",

            reason:
              "cancellation_request_state_changed",
          });
      }

      await closeChallengeAsCancelled(
        client,
        match.challenge_id,
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
            requested_by:
              Number(
                match
                  .cancellation_requested_by,
              ),

            confirmed_by:
              userId,

            reason:
              match.cancel_reason,

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
      if (inTransaction) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch {
          // conexión liberada abajo
        }
      }

      if (
        error.status
      ) {
        return res
          .status(
            error.status,
          )
          .json({
            message:
              error.message,

            reason:
              error.reason ||
              "match_cancellation_error",
          });
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  RECHAZAR SOLICITUD DE CANCELACIÓN MUTUA
  ============================================================

  El partido continúa normalmente.
  Nadie pierde Elo.
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
        await loadMatchForPlayer(
          client,
          matchId,
          userId,
        );

      if (!match) {
        await client.query(
          "ROLLBACK",
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

      const problem =
        getCancellationProblem(
          match,
        );

      if (problem) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(
            problem.status,
          )
          .json({
            message:
              problem.message,

            reason:
              problem.reason,
          });
      }

      if (
        !match
          .cancellation_requested_at ||
        !match
          .cancellation_requested_by
      ) {
        await client.query(
          "ROLLBACK",
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
        await client.query(
          "ROLLBACK",
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
        match.cancel_reason;

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

            AND status =
              'pending'

            AND cancellation_requested_by
              IS NOT NULL

            AND cancellation_requested_by
              <> $2

          RETURNING *
          `,
          [
            matchId,
            userId,
          ],
        );

      if (
        !result.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        inTransaction =
          false;

        return res
          .status(409)
          .json({
            message:
              "La solicitud cambió de estado antes de poder rechazarla.",

            reason:
              "cancellation_request_state_changed",
          });
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
      if (inTransaction) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch {
          // conexión liberada abajo
        }
      }

      next(error);
    } finally {
      client.release();
    }
  };