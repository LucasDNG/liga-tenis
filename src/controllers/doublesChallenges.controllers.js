import {
  pool,
} from "../db.js";

import {
  createDoublesChallenge as createDoublesChallengeService,
  getUserChallengeSide,
  assertUserCanRespondToDoublesChallenge,
  assertUserCanScheduleDoublesChallenge,
  DoublesChallengeError,
} from "../services/doublesChallenge.service.js";

import {
  createDoublesMatchFromChallenge,
} from "../services/doublesChallengeMatch.service.js";


const REJECTION_PENALTY =
  8;

const REJECTION_COOLDOWN_DAYS =
  7;


/*
  ============================================================
  HELPERS GENERALES
  ============================================================
*/


const positiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new DoublesChallengeError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const rollbackQuietly = async (
  client,
) => {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // La conexión se libera después.
  }
};


const sendError = (
  error,
  res,
  next,
) => {
  if (
    error instanceof
    DoublesChallengeError
  ) {
    return res
      .status(
        error.statusCode ??
        400,
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

  return next(error);
};


const auditEvent = async (
  client,
  {
    userId,
    challengeId,
    eventType,
    details = {},
  },
) => {
  await client.query(
    `
    INSERT INTO audit_events (
      user_id,
      challenge_id,
      event_type,
      details
    )

    VALUES (
      $1,
      $2,
      $3,
      $4
    )
    `,
    [
      userId,
      challengeId,
      eventType,
      JSON.stringify(details),
    ],
  );
};


const validateSchedule = ({
  venue,
  scheduledAt,
}) => {
  const normalizedVenue =
    typeof venue === "string"
      ? venue.trim()
      : "";

  if (!normalizedVenue) {
    throw new DoublesChallengeError(
      "El lugar es obligatorio.",
      "venue_required",
      400,
    );
  }

  if (!scheduledAt) {
    throw new DoublesChallengeError(
      "La fecha y hora son obligatorias.",
      "scheduled_at_required",
      400,
    );
  }

  const date =
    new Date(scheduledAt);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new DoublesChallengeError(
      "La fecha y hora no son válidas.",
      "invalid_scheduled_at",
      400,
    );
  }

  if (
    date.getTime() <=
    Date.now()
  ) {
    throw new DoublesChallengeError(
      "La fecha y hora deben ser futuras.",
      "schedule_expired",
      400,
    );
  }

  return {
    venue:
      normalizedVenue,

    scheduled_at:
      date.toISOString(),
  };
};


const fullName = (
  firstName,
  lastName,
) =>
  [
    firstName,
    lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();


const pairName = (
  row,
  prefix,
) => {
  const first =
    fullName(
      row[
        `${prefix}_player1_first_name`
      ],
      row[
        `${prefix}_player1_last_name`
      ],
    );

  const second =
    fullName(
      row[
        `${prefix}_player2_first_name`
      ],
      row[
        `${prefix}_player2_last_name`
      ],
    );

  return `${first} / ${second}`;
};


/*
  ============================================================
  SERIALIZACIÓN
  ============================================================
*/


const serializeChallenge = (
  row,
  userId,
) => {
  const side =
    getUserChallengeSide(
      row,
      userId,
    );

  return {
    id:
      Number(row.id),

    competition_id:
      Number(
        row.competition_id,
      ),

    challenger_pair_id:
      Number(
        row.challenger_pair_id,
      ),

    challenged_pair_id:
      Number(
        row.challenged_pair_id,
      ),

    status:
      row.status,

    venue:
      row.venue,

    scheduled_at:
      row.scheduled_at,

    created_at:
      row.created_at,

    accepted_at:
      row.accepted_at,

    rejected_at:
      row.rejected_at,

    resolved_at:
      row.resolved_at,

    schedule_updated_by:
      row.schedule_updated_by,

    my_side:
      side,

    outgoing:
      side === 1,

    incoming:
      side === 2,

    can_schedule:
      row.status ===
        "pending" &&
      (
        side === 1 ||
        side === 2
      ),

    can_accept:
      row.status ===
        "pending" &&
      side === 2,

    can_reject:
      row.status ===
        "pending" &&
      side === 2,

    competition: {
      id:
        Number(
          row.competition_id,
        ),

      format:
        row.competition_format,

      gender:
        row.competition_gender,

      city:
        row.competition_city,

      name:
        row.competition_name,

      team_size:
        Number(
          row.competition_team_size,
        ),

      placement_matches:
        Number(
          row.competition_placement_matches,
        ),
    },

    challenger_pair: {
      id:
        Number(
          row.challenger_pair_id,
        ),

      name:
        pairName(
          row,
          "challenger",
        ),

      rating:
        Number(
          row.challenger_pair_rating,
        ),

      matches_played:
        Number(
          row.challenger_pair_matches_played,
        ),

      wins:
        Number(
          row.challenger_pair_wins,
        ),

      losses:
        Number(
          row.challenger_pair_losses,
        ),

      games_won:
        Number(
          row.challenger_pair_games_won,
        ),

      games_lost:
        Number(
          row.challenger_pair_games_lost,
        ),

      provisional:
        Number(
          row.challenger_pair_matches_played,
        ) <
        Number(
          row.competition_placement_matches,
        ),

      players: [
        {
          id:
            Number(
              row.challenger_player1_id,
            ),

          first_name:
            row.challenger_player1_first_name,

          last_name:
            row.challenger_player1_last_name,

          phone:
            row.challenger_player1_phone,
        },
        {
          id:
            Number(
              row.challenger_player2_id,
            ),

          first_name:
            row.challenger_player2_first_name,

          last_name:
            row.challenger_player2_last_name,

          phone:
            row.challenger_player2_phone,
        },
      ],
    },

    challenged_pair: {
      id:
        Number(
          row.challenged_pair_id,
        ),

      name:
        pairName(
          row,
          "challenged",
        ),

      rating:
        Number(
          row.challenged_pair_rating,
        ),

      matches_played:
        Number(
          row.challenged_pair_matches_played,
        ),

      wins:
        Number(
          row.challenged_pair_wins,
        ),

      losses:
        Number(
          row.challenged_pair_losses,
        ),

      games_won:
        Number(
          row.challenged_pair_games_won,
        ),

      games_lost:
        Number(
          row.challenged_pair_games_lost,
        ),

      provisional:
        Number(
          row.challenged_pair_matches_played,
        ) <
        Number(
          row.competition_placement_matches,
        ),

      players: [
        {
          id:
            Number(
              row.challenged_player1_id,
            ),

          first_name:
            row.challenged_player1_first_name,

          last_name:
            row.challenged_player1_last_name,

          phone:
            row.challenged_player1_phone,
        },
        {
          id:
            Number(
              row.challenged_player2_id,
            ),

          first_name:
            row.challenged_player2_first_name,

          last_name:
            row.challenged_player2_last_name,

          phone:
            row.challenged_player2_phone,
        },
      ],
    },
  };
};


/*
  ============================================================
  QUERY BASE
  ============================================================
*/


const challengeDetailsSelect = `
  SELECT
    ch.*,

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

    challenger_pair.rating
      AS challenger_pair_rating,

    challenger_pair.matches_played
      AS challenger_pair_matches_played,

    challenger_pair.wins
      AS challenger_pair_wins,

    challenger_pair.losses
      AS challenger_pair_losses,

    challenger_pair.games_won
      AS challenger_pair_games_won,

    challenger_pair.games_lost
      AS challenger_pair_games_lost,

    challenger_pair.player1_id
      AS challenger_player1_id,

    challenger_pair.player2_id
      AS challenger_player2_id,

    challenged_pair.rating
      AS challenged_pair_rating,

    challenged_pair.matches_played
      AS challenged_pair_matches_played,

    challenged_pair.wins
      AS challenged_pair_wins,

    challenged_pair.losses
      AS challenged_pair_losses,

    challenged_pair.games_won
      AS challenged_pair_games_won,

    challenged_pair.games_lost
      AS challenged_pair_games_lost,

    challenged_pair.player1_id
      AS challenged_player1_id,

    challenged_pair.player2_id
      AS challenged_player2_id,

    cp1.first_name
      AS challenger_player1_first_name,

    cp1.last_name
      AS challenger_player1_last_name,

    cp1.phone
      AS challenger_player1_phone,

    cp2.first_name
      AS challenger_player2_first_name,

    cp2.last_name
      AS challenger_player2_last_name,

    cp2.phone
      AS challenger_player2_phone,

    dp1.first_name
      AS challenged_player1_first_name,

    dp1.last_name
      AS challenged_player1_last_name,

    dp1.phone
      AS challenged_player1_phone,

    dp2.first_name
      AS challenged_player2_first_name,

    dp2.last_name
      AS challenged_player2_last_name,

    dp2.phone
      AS challenged_player2_phone

  FROM challenges ch

  JOIN competitions c
    ON c.id =
      ch.competition_id

  JOIN competition_pairs challenger_pair
    ON challenger_pair.id =
      ch.challenger_pair_id

  JOIN competition_pairs challenged_pair
    ON challenged_pair.id =
      ch.challenged_pair_id

  JOIN users cp1
    ON cp1.id =
      challenger_pair.player1_id

  JOIN users cp2
    ON cp2.id =
      challenger_pair.player2_id

  JOIN users dp1
    ON dp1.id =
      challenged_pair.player1_id

  JOIN users dp2
    ON dp2.id =
      challenged_pair.player2_id
`;


const loadChallengeDetails =
  async (
    client,
    challengeId,
    {
      forUpdate =
        false,
    } = {},
  ) => {
    const result =
      await client.query(
        `
        ${challengeDetailsSelect}

        WHERE
          ch.id = $1

        ${
          forUpdate
            ? "FOR UPDATE OF ch"
            : ""
        }
        `,
        [
          challengeId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesChallengeError(
        "Desafío de dobles no encontrado.",
        "doubles_challenge_not_found",
        404,
      );
    }

    const challenge =
      result.rows[0];

    if (
      challenge
        .competition_format !==
        "doubles" ||
      Number(
        challenge
          .competition_team_size,
      ) !== 2
    ) {
      throw new DoublesChallengeError(
        "El desafío no pertenece a una competición de dobles.",
        "challenge_not_doubles",
        409,
      );
    }

    return challenge;
  };


const assertPending = (
  challenge,
) => {
  if (
    challenge.status !==
    "pending"
  ) {
    throw new DoublesChallengeError(
      "El desafío ya fue resuelto.",
      "challenge_already_resolved",
      409,
      {
        status:
          challenge.status,
      },
    );
  }
};


const assertScheduleReady = (
  challenge,
) => {
  if (
    !challenge.venue ||
    !challenge.scheduled_at
  ) {
    throw new DoublesChallengeError(
      "Antes de aceptar tienen que cargar lugar, fecha y hora.",
      "schedule_required",
      400,
    );
  }

  const time =
    new Date(
      challenge.scheduled_at,
    ).getTime();

  if (
    Number.isNaN(time) ||
    time <= Date.now()
  ) {
    throw new DoublesChallengeError(
      "El horario cargado ya pasó. Actualicen el turno antes de aceptar.",
      "schedule_expired",
      400,
    );
  }
};


/*
  ============================================================
  PAREJA + PENALIZACIÓN
  ============================================================
*/


const getPairForUpdate =
  async (
    client,
    pairId,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          player1_id,
          player2_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost

        FROM competition_pairs

        WHERE
          id = $1

        FOR UPDATE
        `,
        [
          pairId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesChallengeError(
        "Pareja no encontrada.",
        "pair_not_found",
        404,
        {
          pair_id:
            Number(pairId),
        },
      );
    }

    return result.rows[0];
  };


const getRejectionFloor = (
  pair,
  placementMatches,
) => {
  const provisional =
    Number(
      pair.matches_played,
    ) <
    Number(
      placementMatches,
    );

  if (provisional) {
    return 0;
  }

  return Number(
    pair.rating,
  ) >= 100
    ? 100
    : 0;
};


const applyPairRejectionPenalty =
  async (
    client,
    {
      pair,
      competitionId,
      challengeId,
      placementMatches,
    },
  ) => {
    const eloBefore =
      Number(
        pair.rating,
      );

    const floor =
      getRejectionFloor(
        pair,
        placementMatches,
      );

    const eloAfter =
      Math.max(
        floor,
        eloBefore -
          REJECTION_PENALTY,
      );

    const eloChange =
      eloAfter -
      eloBefore;

    const effectivePenalty =
      Math.abs(
        eloChange,
      );

    await client.query(
      `
      UPDATE competition_pairs

      SET
        rating = $1,
        updated_at = CURRENT_TIMESTAMP

      WHERE
        id = $2
      `,
      [
        eloAfter,
        pair.id,
      ],
    );

    await client.query(
      `
      INSERT INTO pair_elo_events (
        pair_id,
        competition_id,
        match_id,
        event_type,
        elo_before,
        elo_change,
        elo_after,
        description
      )

      VALUES (
        $1,
        $2,
        NULL,
        'challenge_rejection',
        $3,
        $4,
        $5,
        $6
      )
      `,
      [
        pair.id,
        competitionId,
        eloBefore,
        eloChange,
        eloAfter,
        `Penalización por rechazar desafío #${challengeId}: -${effectivePenalty} Elo`,
      ],
    );

    return {
      elo_before:
        eloBefore,

      elo_after:
        eloAfter,

      elo_change:
        eloChange,

      effective_penalty:
        effectivePenalty,
    };
  };


/*
  ============================================================
  COOLDOWN DE RECHAZO
  ============================================================
*/


const assertNoRecentRejectionCooldown =
  async (
    client,
    {
      competitionId,
      challengerPairId,
      challengedPairId,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          rejected_at

        FROM challenges

        WHERE
          competition_id = $1

          AND challenger_pair_id = $2

          AND challenged_pair_id = $3

          AND status = 'rejected'

          AND rejected_at >
            CURRENT_TIMESTAMP -
            ($4 * INTERVAL '1 day')

        ORDER BY
          rejected_at DESC

        LIMIT 1
        `,
        [
          competitionId,
          challengerPairId,
          challengedPairId,
          REJECTION_COOLDOWN_DAYS,
        ],
      );

    if (
      result.rowCount >
      0
    ) {
      throw new DoublesChallengeError(
        `Esta pareja rechazó un desafío reciente. Deben esperar ${REJECTION_COOLDOWN_DAYS} días para volver a desafiarla.`,
        "rejection_cooldown",
        409,
        {
          previous_challenge_id:
            Number(
              result.rows[0].id,
            ),

          rejected_at:
            result.rows[0]
              .rejected_at,

          cooldown_days:
            REJECTION_COOLDOWN_DAYS,
        },
      );
    }
  };


/*
  ============================================================
  CREAR DESAFÍO DE DOBLES
  ============================================================

  POST /api/doubles/challenges

  body:
  {
    competition_id,
    challenger_pair_id,
    challenged_pair_id
  }

  El usuario autenticado debe pertenecer
  a challenger_pair_id.
  ============================================================
*/


export const createDoublesChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      const competitionId =
        positiveInteger(
          req.body
            ?.competition_id,
          "competitionId",
        );

      const challengerPairId =
        positiveInteger(
          req.body
            ?.challenger_pair_id,
          "challengerPairId",
        );

      const challengedPairId =
        positiveInteger(
          req.body
            ?.challenged_pair_id,
          "challengedPairId",
        );

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      await assertNoRecentRejectionCooldown(
        client,
        {
          competitionId,
          challengerPairId,
          challengedPairId,
        },
      );

      const result =
        await createDoublesChallengeService(
          client,
          {
            competitionId,
            challengerPairId,
            challengedPairId,
            actingUserId:
              userId,
          },
        );

      await auditEvent(
        client,
        {
          userId,

          challengeId:
            result.challenge.id,

          eventType:
            "doubles_challenge_created",

          details: {
            competition_id:
              competitionId,

            challenger_pair_id:
              challengerPairId,

            challenged_pair_id:
              challengedPairId,

            acting_user_id:
              userId,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      const details =
        await loadChallengeDetails(
          client,
          result.challenge.id,
        );

      return res
        .status(201)
        .json({
          message:
            "Desafío de dobles enviado. Ahora pueden coordinar lugar, fecha y hora.",

          challenge:
            serializeChallenge(
              details,
              userId,
            ),
        });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollbackQuietly(
          client,
        );
      }

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
  MIS DESAFÍOS DE DOBLES
  ============================================================

  GET /api/doubles/challenges

  opcional:
  ?competition_id=123

  Devuelve desafíos donde el usuario pertenece
  a cualquiera de las dos parejas.
  ============================================================
*/


export const getMyDoublesChallenges =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      let competitionId =
        null;

      if (
        req.query
          ?.competition_id !==
        undefined
      ) {
        competitionId =
          positiveInteger(
            req.query
              .competition_id,
            "competitionId",
          );
      }

      const params = [
        userId,
      ];

      let competitionFilter =
        "";

      if (
        competitionId
      ) {
        params.push(
          competitionId,
        );

        competitionFilter =
          `AND ch.competition_id = $${params.length}`;
      }

      const result =
        await client.query(
          `
          ${challengeDetailsSelect}

          WHERE
            (
              challenger_pair.player1_id = $1
              OR
              challenger_pair.player2_id = $1
              OR
              challenged_pair.player1_id = $1
              OR
              challenged_pair.player2_id = $1
            )

            ${competitionFilter}

          ORDER BY
            CASE ch.status
              WHEN 'accepted'
                THEN 1
              WHEN 'pending'
                THEN 2
              ELSE 3
            END ASC,

            ch.created_at DESC,
            ch.id DESC
          `,
          params,
        );

      const challenges =
        result.rows.map(
          (
            challenge,
          ) =>
            serializeChallenge(
              challenge,
              userId,
            ),
        );

      return res.json({
        challenges,

        count:
          challenges.length,
      });
    } catch (error) {
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
  PROGRAMAR DESAFÍO
  ============================================================

  PATCH /api/doubles/challenges/:id/schedule

  Cualquiera de los cuatro jugadores puede
  cargar/modificar lugar y horario mientras
  el desafío siga pending.
  ============================================================
*/


export const scheduleDoublesChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      const challengeId =
        positiveInteger(
          req.params.id,
          "challengeId",
        );

      const schedule =
        validateSchedule({
          venue:
            req.body
              ?.venue,

          scheduledAt:
            req.body
              ?.scheduled_at,
        });

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const challenge =
        await loadChallengeDetails(
          client,
          challengeId,
          {
            forUpdate:
              true,
          },
        );

      assertPending(
        challenge,
      );

      assertUserCanScheduleDoublesChallenge(
        challenge,
        userId,
      );

      const updated =
        await client.query(
          `
          UPDATE challenges

          SET
            venue = $1,
            scheduled_at = $2,
            schedule_updated_by = $3

          WHERE
            id = $4

            AND status =
              'pending'

          RETURNING *
          `,
          [
            schedule.venue,
            schedule.scheduled_at,
            userId,
            challengeId,
          ],
        );

      if (
        updated.rowCount !==
        1
      ) {
        throw new DoublesChallengeError(
          "El desafío cambió de estado antes de guardar la programación.",
          "challenge_state_changed",
          409,
        );
      }

      await auditEvent(
        client,
        {
          userId,
          challengeId,

          eventType:
            "doubles_challenge_scheduled",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            challenger_pair_id:
              Number(
                challenge
                  .challenger_pair_id,
              ),

            challenged_pair_id:
              Number(
                challenge
                  .challenged_pair_id,
              ),

            acting_side:
              getUserChallengeSide(
                challenge,
                userId,
              ),

            venue:
              schedule.venue,

            scheduled_at:
              schedule
                .scheduled_at,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      const details =
        await loadChallengeDetails(
          client,
          challengeId,
        );

      return res.json({
        message:
          "Lugar, fecha y hora guardados correctamente.",

        challenge:
          serializeChallenge(
            details,
            userId,
          ),
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollbackQuietly(
          client,
        );
      }

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
  ACEPTAR DESAFÍO
  ============================================================

  POST /api/doubles/challenges/:id/accept

  Cualquiera de los dos integrantes
  de la pareja DESAFIADA puede aceptar.

  Una sola aceptación:
  - acepta para toda la pareja;
  - crea el partido;
  - vincula las dos parejas;
  - crea los 4 match_participants.
  ============================================================
*/


export const acceptDoublesChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      const challengeId =
        positiveInteger(
          req.params.id,
          "challengeId",
        );

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const challenge =
        await loadChallengeDetails(
          client,
          challengeId,
          {
            forUpdate:
              true,
          },
        );

      assertPending(
        challenge,
      );

      assertUserCanRespondToDoublesChallenge(
        challenge,
        userId,
      );

      assertScheduleReady(
        challenge,
      );

      /*
        Primero cambiamos challenge a accepted.

        createDoublesMatchFromChallenge exige
        precisamente ese estado.

        Como todo ocurre dentro de la misma
        transacción, si falla la creación del
        partido también se revierte la aceptación.
      */

      const accepted =
        await client.query(
          `
          UPDATE challenges

          SET
            status = 'accepted',
            accepted_at = CURRENT_TIMESTAMP

          WHERE
            id = $1

            AND status =
              'pending'

          RETURNING *
          `,
          [
            challengeId,
          ],
        );

      if (
        accepted.rowCount !==
        1
      ) {
        throw new DoublesChallengeError(
          "El desafío cambió de estado antes de poder aceptarlo.",
          "challenge_state_changed",
          409,
        );
      }

      const matchResult =
        await createDoublesMatchFromChallenge(
          client,
          {
            challengeId,
          },
        );

      const match =
        matchResult.match;

      await auditEvent(
        client,
        {
          userId,
          challengeId,

          eventType:
            "doubles_challenge_accepted",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            challenger_pair_id:
              Number(
                challenge
                  .challenger_pair_id,
              ),

            challenged_pair_id:
              Number(
                challenge
                  .challenged_pair_id,
              ),

            accepted_by:
              userId,

            accepted_side:
              2,

            match_id:
              Number(
                match.id,
              ),

            venue:
              challenge.venue,

            scheduled_at:
              challenge
                .scheduled_at,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      const details =
        await loadChallengeDetails(
          client,
          challengeId,
        );

      return res.json({
        message:
          "Desafío aceptado. El partido de dobles quedó confirmado para los cuatro jugadores.",

        challenge:
          serializeChallenge(
            details,
            userId,
          ),

        match: {
          ...match,

          id:
            Number(
              match.id,
            ),

          competition_id:
            Number(
              match.competition_id,
            ),

          side1_pair_id:
            Number(
              match.side1_pair_id,
            ),

          side2_pair_id:
            Number(
              match.side2_pair_id,
            ),
        },

        participants:
          matchResult
            .participants ??
          null,
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollbackQuietly(
          client,
        );
      }

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
  RECHAZAR DESAFÍO
  ============================================================

  POST /api/doubles/challenges/:id/reject

  Cualquiera de los dos integrantes
  de la pareja DESAFIADA puede rechazar.

  La penalización pertenece a LA PAREJA,
  no al usuario que hizo click.

  -8 Elo para la pareja desafiada.
  Cooldown: 7 días.
  ============================================================
*/


export const rejectDoublesChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      const challengeId =
        positiveInteger(
          req.params.id,
          "challengeId",
        );

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const challenge =
        await loadChallengeDetails(
          client,
          challengeId,
          {
            forUpdate:
              true,
          },
        );

      assertPending(
        challenge,
      );

      assertUserCanRespondToDoublesChallenge(
        challenge,
        userId,
      );

      const challengedPair =
        await getPairForUpdate(
          client,
          challenge
            .challenged_pair_id,
        );

      if (
        Number(
          challengedPair
            .competition_id,
        ) !==
        Number(
          challenge
            .competition_id,
        )
      ) {
        throw new DoublesChallengeError(
          "La pareja desafiada no pertenece a la competición del desafío.",
          "pair_competition_mismatch",
          409,
        );
      }

      const rejection =
        await applyPairRejectionPenalty(
          client,
          {
            pair:
              challengedPair,

            competitionId:
              Number(
                challenge
                  .competition_id,
              ),

            challengeId,

            placementMatches:
              Number(
                challenge
                  .competition_placement_matches,
              ),
          },
        );

      const updated =
        await client.query(
          `
          UPDATE challenges

          SET
            status = 'rejected',
            rejected_at = CURRENT_TIMESTAMP,
            resolved_at = CURRENT_TIMESTAMP,
            rejection_elo_penalty = $1

          WHERE
            id = $2

            AND status =
              'pending'

          RETURNING *
          `,
          [
            rejection
              .effective_penalty,

            challengeId,
          ],
        );

      if (
        updated.rowCount !==
        1
      ) {
        throw new DoublesChallengeError(
          "El desafío cambió de estado antes de poder rechazarlo.",
          "challenge_state_changed",
          409,
        );
      }

      await auditEvent(
        client,
        {
          userId,
          challengeId,

          eventType:
            "doubles_challenge_rejected",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            challenger_pair_id:
              Number(
                challenge
                  .challenger_pair_id,
              ),

            challenged_pair_id:
              Number(
                challenge
                  .challenged_pair_id,
              ),

            rejected_by:
              userId,

            rejected_side:
              2,

            elo_before:
              rejection
                .elo_before,

            elo_change:
              rejection
                .elo_change,

            elo_after:
              rejection
                .elo_after,

            elo_penalty:
              rejection
                .effective_penalty,

            configured_penalty:
              REJECTION_PENALTY,

            cooldown_days:
              REJECTION_COOLDOWN_DAYS,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      return res.json({
        message:
          rejection
            .effective_penalty >
          0
            ? `Desafío rechazado. La pareja perdió ${rejection.effective_penalty} puntos Elo.`
            : "Desafío rechazado. La pareja ya estaba en el mínimo de Elo permitido.",

        challenge_id:
          challengeId,

        competition_id:
          Number(
            challenge
              .competition_id,
          ),

        challenged_pair_id:
          Number(
            challenge
              .challenged_pair_id,
          ),

        elo_before:
          rejection
            .elo_before,

        elo_change:
          rejection
            .elo_change,

        rating:
          rejection
            .elo_after,

        cooldown_days:
          REJECTION_COOLDOWN_DAYS,
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollbackQuietly(
          client,
        );
      }

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
  DETALLE DE UN DESAFÍO
  ============================================================

  GET /api/doubles/challenges/:id

  Solo puede verlo alguien que pertenezca
  a una de las dos parejas.
  ============================================================
*/


export const getDoublesChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const userId =
        positiveInteger(
          req.userId,
          "userId",
        );

      const challengeId =
        positiveInteger(
          req.params.id,
          "challengeId",
        );

      const challenge =
        await loadChallengeDetails(
          client,
          challengeId,
        );

      const side =
        getUserChallengeSide(
          challenge,
          userId,
        );

      if (
        side !== 1 &&
        side !== 2
      ) {
        throw new DoublesChallengeError(
          "No participás de este desafío.",
          "user_not_in_challenge",
          403,
        );
      }

      return res.json({
        challenge:
          serializeChallenge(
            challenge,
            userId,
          ),
      });
    } catch (error) {
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
  createDoublesChallenge,
  getMyDoublesChallenges,
  getDoublesChallenge,
  scheduleDoublesChallenge,
  acceptDoublesChallenge,
  rejectDoublesChallenge,
};