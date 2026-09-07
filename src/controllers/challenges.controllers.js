import { pool } from "../db.js";

const REJECTION_ELO_PENALTY = 8;
const REJECTION_COOLDOWN_DAYS = 7;

const PLACEMENT_MATCHES = 5;
const MAX_RANKED_CHALLENGE_DISTANCE = 3;


/*
  ============================================================
  JUGADOR
  ============================================================
*/

const getPlayer = async (
  client,
  id,
) => {
  const result = await client.query(
    `
    SELECT
      id,
      name,
      phone,
      city,
      gender,
      rating,
      matches_played,
      verification_status,
      role,
      matches_played < $2
        AS provisional

    FROM users

    WHERE id = $1
      AND role = 'player'
    `,
    [
      id,
      PLACEMENT_MATCHES,
    ],
  );

  return result.rows[0];
};


/*
  ============================================================
  RANKING OFICIAL

  Solamente jugadores con 5+ partidos.
  ============================================================
*/

const getOfficialPosition = async (
  client,
  player,
) => {
  if (
    !player ||
    Number(player.matches_played) <
      PLACEMENT_MATCHES
  ) {
    return null;
  }

  const result = await client.query(
    `
    WITH official_ranking AS (
      SELECT
        id,

        ROW_NUMBER() OVER (
          ORDER BY
            rating DESC,
            matches_played DESC,
            id ASC
        )::int AS official_position

      FROM users

      WHERE
        role = 'player'
        AND verification_status = 'verified'
        AND city = $1
        AND gender = $2
        AND matches_played >= $3
    )

    SELECT
      official_position

    FROM official_ranking

    WHERE id = $4
    `,
    [
      player.city,
      player.gender,
      PLACEMENT_MATCHES,
      player.id,
    ],
  );

  return result.rowCount
    ? Number(
        result.rows[0]
          .official_position,
      )
    : null;
};


/*
  ============================================================
  ENFRENTAMIENTOS HISTÓRICOS
  ============================================================
*/

const getHistoricalMeetings = async (
  client,
  player1Id,
  player2Id,
) => {
  const result = await client.query(
    `
    SELECT
      COUNT(*)::int AS total

    FROM matches

    WHERE
      status = 'completed'
      AND annulled_at IS NULL
      AND (
        (
          player1_id = $1
          AND player2_id = $2
        )
        OR
        (
          player1_id = $2
          AND player2_id = $1
        )
      )
    `,
    [
      player1Id,
      player2Id,
    ],
  );

  return Number(
    result.rows[0].total,
  );
};


/*
  ============================================================
  MÍNIMO DE ENFRENTAMIENTOS DE LA RUEDA

  PROVISIONAL:
  todos los jugadores verificados de
  su misma liga son candidatos.

  RANKEADO:
  solamente los 3 puestos oficiales
  superiores son candidatos.

  El jugador solo puede elegir rivales
  que tengan el mínimo número de
  enfrentamientos dentro de esa rueda.
  ============================================================
*/

const getRotationMinimumMeetings =
  async (
    client,
    challenger,
  ) => {
    const challengerProvisional =
      Number(
        challenger.matches_played,
      ) < PLACEMENT_MATCHES;

    if (challengerProvisional) {
      const result =
        await client.query(
          `
          WITH opponents AS (
            SELECT
              u.id

            FROM users u

            WHERE
              u.role = 'player'
              AND u.verification_status = 'verified'
              AND u.city = $1
              AND u.gender = $2
              AND u.id <> $3
          ),

          meeting_counts AS (
            SELECT
              o.id,

              COUNT(m.id)::int
                AS meetings

            FROM opponents o

            LEFT JOIN matches m
              ON m.status = 'completed'
              AND m.annulled_at IS NULL
              AND (
                (
                  m.player1_id = $3
                  AND m.player2_id = o.id
                )
                OR
                (
                  m.player2_id = $3
                  AND m.player1_id = o.id
                )
              )

            GROUP BY o.id
          )

          SELECT
            COALESCE(
              MIN(meetings),
              0
            )::int AS minimum_meetings

          FROM meeting_counts
          `,
          [
            challenger.city,
            challenger.gender,
            challenger.id,
          ],
        );

      return Number(
        result.rows[0]
          ?.minimum_meetings || 0,
      );
    }

    const challengerPosition =
      await getOfficialPosition(
        client,
        challenger,
      );

    if (!challengerPosition) {
      return null;
    }

    const result =
      await client.query(
        `
        WITH official_ranking AS (
          SELECT
            id,

            ROW_NUMBER() OVER (
              ORDER BY
                rating DESC,
                matches_played DESC,
                id ASC
            )::int AS official_position

          FROM users

          WHERE
            role = 'player'
            AND verification_status = 'verified'
            AND city = $1
            AND gender = $2
            AND matches_played >= $3
        ),

        eligible AS (
          SELECT
            id

          FROM official_ranking

          WHERE
            official_position <
              $4

            AND official_position >=
              $4 - $5
        ),

        meeting_counts AS (
          SELECT
            e.id,

            COUNT(m.id)::int
              AS meetings

          FROM eligible e

          LEFT JOIN matches m
            ON m.status = 'completed'
            AND m.annulled_at IS NULL
            AND (
              (
                m.player1_id = $6
                AND m.player2_id = e.id
              )
              OR
              (
                m.player2_id = $6
                AND m.player1_id = e.id
              )
            )

          GROUP BY e.id
        )

        SELECT
          MIN(meetings)::int
            AS minimum_meetings

        FROM meeting_counts
        `,
        [
          challenger.city,
          challenger.gender,
          PLACEMENT_MATCHES,
          challengerPosition,
          MAX_RANKED_CHALLENGE_DISTANCE,
          challenger.id,
        ],
      );

    const value =
      result.rows[0]
        ?.minimum_meetings;

    return value === null ||
      value === undefined
      ? null
      : Number(value);
  };


/*
  ============================================================
  VALIDAR REGLA DEPORTIVA DEL DESAFÍO
  ============================================================
*/

const validateSportEligibility =
  async (
    client,
    challenger,
    challenged,
  ) => {
    const challengerProvisional =
      Number(
        challenger.matches_played,
      ) < PLACEMENT_MATCHES;

    /*
      Durante colocación puede desafiar
      a cualquier jugador verificado de
      su liga, pero siempre respetando
      la rueda.
    */
    if (challengerProvisional) {
      return {
        allowed: true,
        challengerPosition: null,
        challengedPosition:
          await getOfficialPosition(
            client,
            challenged,
          ),
      };
    }

    /*
      Un rankeado solamente desafía
      jugadores que también tengan
      ranking oficial.
    */
    const challengerPosition =
      await getOfficialPosition(
        client,
        challenger,
      );

    const challengedPosition =
      await getOfficialPosition(
        client,
        challenged,
      );

    if (
      !challengerPosition ||
      !challengedPosition
    ) {
      return {
        allowed: false,
        reason:
          "provisional_not_official_target",
        message:
          "Los jugadores rankeados solo pueden desafiar jugadores con posición oficial.",
      };
    }

    const difference =
      challengerPosition -
      challengedPosition;

    if (
      difference < 1 ||
      difference >
        MAX_RANKED_CHALLENGE_DISTANCE
    ) {
      return {
        allowed: false,
        reason: "ranking_distance",
        message:
          "Solo podés desafiar hasta 3 posiciones oficiales por encima.",
      };
    }

    return {
      allowed: true,
      challengerPosition,
      challengedPosition,
    };
  };


/*
  ============================================================
  RUEDA DEL RECEPTOR

  Si ya resolvió un turno con este
  desafiante y había otros esperando,
  debe avanzar la rueda antes de volver
  a recibir al mismo.
  ============================================================
*/

const hasOlderPendingRivals = async (
  client,
  challengerId,
  challengedId,
) => {
  const lastResolved =
    await client.query(
      `
      SELECT
        resolved_at

      FROM challenges

      WHERE
        challenger_id = $1
        AND challenged_id = $2
        AND resolved_at IS NOT NULL

      ORDER BY
        resolved_at DESC,
        id DESC

      LIMIT 1
      `,
      [
        challengerId,
        challengedId,
      ],
    );

  if (!lastResolved.rowCount) {
    return false;
  }

  const resolvedAt =
    lastResolved.rows[0]
      .resolved_at;

  const waiting =
    await client.query(
      `
      SELECT
        id

      FROM challenges

      WHERE
        challenged_id = $1
        AND challenger_id <> $2
        AND status = 'pending'
        AND created_at <= $3

      ORDER BY
        historical_meetings_at_creation ASC,
        created_at ASC,
        id ASC

      LIMIT 1
      `,
      [
        challengedId,
        challengerId,
        resolvedAt,
      ],
    );

  return Boolean(
    waiting.rowCount,
  );
};


/*
  ============================================================
  COOLDOWN
  ============================================================
*/

const getRejectionCooldown = async (
  client,
  challengerId,
  challengedId,
) => {
  const result =
    await client.query(
      `
      SELECT
        rejected_at,

        rejected_at
          + INTERVAL '7 days'
          AS available_at

      FROM challenges

      WHERE
        challenger_id = $1
        AND challenged_id = $2
        AND status = 'rejected'
        AND rejected_at IS NOT NULL

      ORDER BY
        rejected_at DESC,
        id DESC

      LIMIT 1
      `,
      [
        challengerId,
        challengedId,
      ],
    );

  if (!result.rowCount) {
    return null;
  }

  const row =
    result.rows[0];

  const availableAt =
    new Date(
      row.available_at,
    );

  if (
    Number.isNaN(
      availableAt.getTime(),
    ) ||
    availableAt.getTime() <=
      Date.now()
  ) {
    return null;
  }

  return {
    rejectedAt:
      row.rejected_at,

    availableAt:
      row.available_at,
  };
};


/*
  ============================================================
  RUEDA DE DESAFÍOS RECIBIDOS

  El receptor debe resolver:
  1. menor cantidad de enfrentamientos
  2. desafío más antiguo
  3. id más bajo

  El provisional participa exactamente
  igual que cualquier otro jugador.
  ============================================================
*/

const getRotationState = async (
  client,
  userId,
) => {
  const activeMatch =
    await client.query(
      `
      SELECT
        c.id AS challenge_id,
        c.challenger_id,

        u.name AS challenger_name,

        c.venue,
        c.scheduled_at

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE
        c.challenged_id = $1
        AND c.status = 'accepted'

      ORDER BY
        c.accepted_at ASC
          NULLS LAST,
        c.created_at ASC,
        c.id ASC

      LIMIT 1
      `,
      [userId],
    );

  if (activeMatch.rowCount) {
    return {
      blockedByActiveMatch: true,
      activeChallenge:
        activeMatch.rows[0],
      currentChallenge: null,
      pendingChallenges: [],
    };
  }

  const pending =
    await client.query(
      `
      SELECT
        c.id,
        c.challenger_id,
        c.challenged_id,
        c.historical_meetings_at_creation,
        c.created_at,

        u.name AS challenger_name,

        u.matches_played < $2
          AS challenger_provisional

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE
        c.challenged_id = $1
        AND c.status = 'pending'

      ORDER BY
        c.historical_meetings_at_creation ASC,
        c.created_at ASC,
        c.id ASC
      `,
      [
        userId,
        PLACEMENT_MATCHES,
      ],
    );

  return {
    blockedByActiveMatch: false,
    activeChallenge: null,
    currentChallenge:
      pending.rows[0] || null,
    pendingChallenges:
      pending.rows,
  };
};


/*
  ============================================================
  CREAR DESAFÍO
  ============================================================
*/

export const createChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const challengerId =
      Number(req.userId);

    const challengedId =
      Number(
        req.body.challenged_id,
      );

    if (
      !Number.isInteger(
        challengerId,
      ) ||
      challengerId <= 0
    ) {
      return res
        .status(401)
        .json({
          message:
            "Sesión inválida",
          reason:
            "invalid_session",
        });
    }

    if (
      !Number.isInteger(
        challengedId,
      ) ||
      challengedId <= 0 ||
      challengedId ===
        challengerId
    ) {
      return res
        .status(400)
        .json({
          message:
            "Rival inválido",
          reason:
            "invalid_opponent",
        });
    }

    await client.query(
      "BEGIN",
    );

    const challenger =
      await getPlayer(
        client,
        challengerId,
      );

    const challenged =
      await getPlayer(
        client,
        challengedId,
      );

    if (
      !challenger ||
      !challenged
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
          reason:
            "player_not_found",
        });
    }

    if (
      challenger
        .verification_status !==
      "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(403)
        .json({
          message:
            "Tu identidad debe estar verificada para crear desafíos.",
          reason:
            "challenger_not_verified",
        });
    }

    if (
      challenged
        .verification_status !==
      "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Ese jugador todavía no está habilitado para competir.",
          reason:
            "challenged_not_verified",
        });
    }

    if (
      !challenger.gender ||
      !challenged.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Ambos jugadores deben tener una liga seleccionada.",
          reason:
            "league_not_selected",
        });
    }

    if (
      challenger.gender !==
      challenged.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Solo podés desafiar jugadores de tu misma liga.",
          reason:
            "different_league",
        });
    }

    if (
      challenger.city !==
      challenged.city
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Solo podés desafiar jugadores de tu misma ciudad.",
          reason:
            "different_city",
        });
    }

    /*
      REGLA DEPORTIVA.
    */
    const sportEligibility =
      await validateSportEligibility(
        client,
        challenger,
        challenged,
      );

    if (
      !sportEligibility.allowed
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            sportEligibility.message,
          reason:
            sportEligibility.reason,
        });
    }

    /*
      RUEDA DEL DESAFIANTE.

      Esta validación es la que evita
      que alguien juegue dos veces con
      un amigo mientras todavía tiene
      rivales de la rueda sin enfrentar.
    */
    const historicalMeetings =
      await getHistoricalMeetings(
        client,
        challengerId,
        challengedId,
      );

    const minimumMeetings =
      await getRotationMinimumMeetings(
        client,
        challenger,
      );

    if (
      minimumMeetings !== null &&
      historicalMeetings >
        minimumMeetings
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Antes tenés que jugar con rivales de tu rueda a los que enfrentaste menos veces.",
          reason:
            "opponent_rotation",
          historical_meetings:
            historicalMeetings,
          minimum_meetings:
            minimumMeetings,
        });
    }

    /*
      COOLDOWN.
    */
    const cooldown =
      await getRejectionCooldown(
        client,
        challengerId,
        challengedId,
      );

    if (cooldown) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(429)
        .json({
          message:
            "Este jugador rechazó tu último desafío. Tenés que esperar 7 días para volver a desafiarlo.",
          reason:
            "rejection_cooldown",
          available_at:
            cooldown.availableAt,
          cooldown_days:
            REJECTION_COOLDOWN_DAYS,
        });
    }

    /*
      NO DUPLICAR ACTIVO.
    */
    const active =
      await client.query(
        `
        SELECT
          id,
          status

        FROM challenges

        WHERE
          status IN (
            'pending',
            'accepted'
          )
          AND (
            (
              challenger_id = $1
              AND challenged_id = $2
            )
            OR
            (
              challenger_id = $2
              AND challenged_id = $1
            )
          )

        LIMIT 1
        `,
        [
          challengerId,
          challengedId,
        ],
      );

    if (active.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Ya existe un desafío o partido activo entre ustedes.",
          reason:
            "active_challenge",
        });
    }

    /*
      RUEDA DEL RECEPTOR.
    */
    const mustWaitForOthers =
      await hasOlderPendingRivals(
        client,
        challengerId,
        challengedId,
      );

    if (mustWaitForOthers) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Este jugador todavía tiene otros rivales anteriores esperando en su rueda.",
          reason:
            "rotation_wait",
        });
    }

    const created =
      await client.query(
        `
        INSERT INTO challenges (
          challenger_id,
          challenged_id,
          status,
          historical_meetings_at_creation
        )

        VALUES (
          $1,
          $2,
          'pending',
          $3
        )

        RETURNING *
        `,
        [
          challengerId,
          challengedId,
          historicalMeetings,
        ],
      );

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
        'challenge_created',
        $3
      )
      `,
      [
        challengerId,
        created.rows[0].id,

        JSON.stringify({
          challenged_id:
            challengedId,

          challenger_provisional:
            Boolean(
              challenger.provisional,
            ),

          challenged_provisional:
            Boolean(
              challenged.provisional,
            ),

          challenger_official_position:
            sportEligibility
              .challengerPosition,

          challenged_official_position:
            sportEligibility
              .challengedPosition,

          historical_meetings:
            historicalMeetings,

          rotation_minimum_meetings:
            minimumMeetings,

          placement_matches:
            PLACEMENT_MATCHES,
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    res
      .status(201)
      .json({
        message:
          "Desafío enviado. Ahora pueden coordinar por WhatsApp el lugar y horario.",

        challenge:
          created.rows[0],

        contact: {
          challenger: {
            name:
              challenger.name,
            phone:
              challenger.phone,
          },

          challenged: {
            name:
              challenged.name,
            phone:
              challenged.phone,
          },
        },
      });
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {
      // Se libera en finally.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
  ============================================================
  MIS DESAFÍOS
  ============================================================
*/

export const getMyChallenges = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(
        `
        SELECT
          c.*,

          u1.name AS
            challenger_name,

          u2.name AS
            challenged_name,

          u1.phone AS
            challenger_phone,

          u2.phone AS
            challenged_phone,

          u1.matches_played < $2
            AS challenger_provisional,

          u2.matches_played < $2
            AS challenged_provisional,

          updater.name AS
            schedule_updated_by_name

        FROM challenges c

        JOIN users u1
          ON u1.id =
             c.challenger_id

        JOIN users u2
          ON u2.id =
             c.challenged_id

        LEFT JOIN users updater
          ON updater.id =
             c.schedule_updated_by

        WHERE
          c.challenger_id = $1
          OR
          c.challenged_id = $1

        ORDER BY
          c.created_at DESC,
          c.id DESC
        `,
        [
          req.userId,
          PLACEMENT_MATCHES,
        ],
      );

    const client =
      await pool.connect();

    let rotation;

    try {
      rotation =
        await getRotationState(
          client,
          req.userId,
        );
    } finally {
      client.release();
    }

    const currentId =
      rotation
        .currentChallenge
        ?.id || null;

    const challenges =
      result.rows.map(
        (challenge) => {
          const incoming =
            Number(
              challenge.challenged_id,
            ) ===
            Number(req.userId);

          let canAccept = false;
          let canReject = false;
          let rotationMessage =
            null;

          if (
            incoming &&
            challenge.status ===
              "pending"
          ) {
            if (
              rotation
                .blockedByActiveMatch
            ) {
              rotationMessage =
                `Primero tenés que jugar el partido ya confirmado contra ${rotation.activeChallenge.challenger_name}.`;
            } else if (
              Number(challenge.id) ===
              Number(currentId)
            ) {
              canAccept = true;
              canReject = true;
            } else if (
              rotation
                .currentChallenge
            ) {
              rotationMessage =
                `Antes tenés que resolver el desafío de ${rotation.currentChallenge.challenger_name}.`;
            }
          }

          return {
            ...challenge,

            can_accept:
              canAccept,

            can_reject:
              canReject,

            rotation_block_message:
              rotationMessage,
          };
        },
      );

    res.json({
      challenges,

      rotation: {
        blocked_by_active_match:
          rotation
            .blockedByActiveMatch,

        current_challenge_id:
          currentId,

        current_opponent:
          rotation
            .currentChallenge
            ?.challenger_name ||
          rotation
            .activeChallenge
            ?.challenger_name ||
          null,

        current_opponent_provisional:
          rotation
            .currentChallenge
            ?.challenger_provisional ??
          null,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
  ============================================================
  PROGRAMAR DESAFÍO
  ============================================================
*/

export const scheduleChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const {
      venue,
      scheduled_at,
    } = req.body;

    const cleanVenue =
      String(
        venue || "",
      ).trim();

    if (
      cleanVenue.length < 3 ||
      cleanVenue.length > 160
    ) {
      return res
        .status(400)
        .json({
          message:
            "Ingresá un lugar válido para jugar.",
          reason:
            "invalid_venue",
        });
    }

    const scheduledDate =
      new Date(scheduled_at);

    if (
      !scheduled_at ||
      Number.isNaN(
        scheduledDate.getTime(),
      )
    ) {
      return res
        .status(400)
        .json({
          message:
            "Ingresá una fecha y hora válidas.",
          reason:
            "invalid_schedule",
        });
    }

    if (
      scheduledDate.getTime() <=
      Date.now()
    ) {
      return res
        .status(400)
        .json({
          message:
            "El partido debe programarse para una fecha futura.",
          reason:
            "schedule_in_past",
        });
    }

    await client.query(
      "BEGIN",
    );

    const result =
      await client.query(
        `
        UPDATE challenges

        SET
          venue = $1,
          scheduled_at = $2,
          schedule_updated_by = $3

        WHERE
          id = $4
          AND status = 'pending'
          AND (
            challenger_id = $3
            OR challenged_id = $3
          )

        RETURNING *
        `,
        [
          cleanVenue,
          scheduledDate.toISOString(),
          req.userId,
          req.params.id,
        ],
      );

    if (!result.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Desafío pendiente no encontrado.",
          reason:
            "challenge_not_found",
        });
    }

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
        'challenge_scheduled',
        $3
      )
      `,
      [
        req.userId,
        result.rows[0].id,

        JSON.stringify({
          venue:
            cleanVenue,

          scheduled_at:
            scheduledDate
              .toISOString(),
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    res.json({
      message:
        "Lugar, fecha y hora guardados correctamente.",

      challenge:
        result.rows[0],
    });
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {
      // Se libera en finally.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
  ============================================================
  ACEPTAR DESAFÍO
  ============================================================
*/

export const acceptChallenge = async (
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

    const currentUser =
      await client.query(
        `
        SELECT
          id,
          role,
          gender,
          city,
          verification_status,
          matches_played

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [req.userId],
      );

    if (!currentUser.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }

    const challengedUser =
      currentUser.rows[0];

    if (
      challengedUser.role !==
        "player" ||
      challengedUser
        .verification_status !==
        "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(403)
        .json({
          message:
            "Tu cuenta debe estar verificada para aceptar desafíos.",
          reason:
            "not_verified",
        });
    }

    /*
      Esta es la regla que hace que
      "si te toca el provisional,
      te toca".

      No distinguimos provisional/rankeado:
      la cola se resuelve por historial
      y antigüedad.
    */
    const rotation =
      await getRotationState(
        client,
        req.userId,
      );

    if (
      rotation
        .blockedByActiveMatch
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            `Primero tenés que jugar el partido ya confirmado contra ${rotation.activeChallenge.challenger_name}.`,
          reason:
            "active_match",
        });
    }

    if (
      !rotation
        .currentChallenge
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "No tenés desafíos pendientes para aceptar.",
          reason:
            "no_pending_challenges",
        });
    }

    if (
      Number(req.params.id) !==
      Number(
        rotation
          .currentChallenge
          .id,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            `Antes tenés que resolver el desafío de ${rotation.currentChallenge.challenger_name}.`,
          reason:
            "rotation_blocked",
          current_challenge_id:
            rotation
              .currentChallenge
              .id,
          current_opponent:
            rotation
              .currentChallenge
              .challenger_name,
        });
    }

    const challenge =
      await client.query(
        `
        SELECT *

        FROM challenges

        WHERE
          id = $1
          AND challenged_id = $2
          AND status = 'pending'

        FOR UPDATE
        `,
        [
          req.params.id,
          req.userId,
        ],
      );

    if (!challenge.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Desafío pendiente no encontrado",
        });
    }

    const c =
      challenge.rows[0];

    if (
      !c.venue ||
      !c.scheduled_at
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Antes de aceptar tienen que cargar el lugar, la fecha y la hora del partido.",
          reason:
            "schedule_required",
        });
    }

    const scheduledTime =
      new Date(
        c.scheduled_at,
      ).getTime();

    if (
      Number.isNaN(
        scheduledTime,
      ) ||
      scheduledTime <=
        Date.now()
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "El horario cargado ya pasó. Actualicen el turno antes de aceptar.",
          reason:
            "schedule_expired",
        });
    }

    const challenger =
      await client.query(
        `
        SELECT
          id,
          role,
          gender,
          city,
          verification_status,
          matches_played

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [c.challenger_id],
      );

    if (!challenger.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "El jugador que creó este desafío ya no está habilitado para competir.",
          reason:
            "challenger_not_verified",
        });
    }

    const challengerUser =
      challenger.rows[0];

    if (
      challengerUser.role !==
        "player" ||
      challengerUser
        .verification_status !==
        "verified" ||
      challengerUser.gender !==
        challengedUser.gender ||
      challengerUser.city !==
        challengedUser.city
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "El jugador que creó este desafío ya no está habilitado para competir en esta liga.",
          reason:
            "challenger_not_eligible",
        });
    }

    const existingMatch =
      await client.query(
        `
        SELECT id

        FROM matches

        WHERE
          challenge_id = $1
          AND annulled_at IS NULL

        LIMIT 1
        `,
        [c.id],
      );

    if (existingMatch.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Este desafío ya tiene un partido asociado.",
          reason:
            "match_already_exists",
        });
    }

    const updatedChallenge =
      await client.query(
        `
        UPDATE challenges

        SET
          status = 'accepted',
          accepted_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $1
          AND status = 'pending'

        RETURNING id
        `,
        [c.id],
      );

    if (
      !updatedChallenge.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "El desafío cambió de estado antes de poder aceptarlo.",
          reason:
            "challenge_state_changed",
        });
    }

    const match =
      await client.query(
        `
        INSERT INTO matches (
          challenge_id,
          player1_id,
          player2_id,
          venue,
          scheduled_at,
          status
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'pending'
        )

        RETURNING *
        `,
        [
          c.id,
          c.challenger_id,
          c.challenged_id,
          c.venue,
          c.scheduled_at,
        ],
      );

    await client.query(
      `
      INSERT INTO audit_events (
        user_id,
        challenge_id,
        match_id,
        event_type,
        details
      )

      VALUES (
        $1,
        $2,
        $3,
        'challenge_accepted',
        $4
      )
      `,
      [
        req.userId,
        c.id,
        match.rows[0].id,

        JSON.stringify({
          venue:
            c.venue,

          scheduled_at:
            c.scheduled_at,

          challenger_provisional:
            Number(
              challengerUser
                .matches_played,
            ) <
            PLACEMENT_MATCHES,

          challenged_provisional:
            Number(
              challengedUser
                .matches_played,
            ) <
            PLACEMENT_MATCHES,
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    res.json({
      message:
        "Desafío aceptado. El partido quedó programado.",

      match:
        match.rows[0],
    });
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {
      // Se libera en finally.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
  ============================================================
  RECHAZAR DESAFÍO
  ============================================================
*/

export const rejectChallenge = async (
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

    const user =
      await client.query(
        `
        SELECT
          id,
          role,
          verification_status,
          rating,
          matches_played

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [req.userId],
      );

    if (!user.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }

    const currentUser =
      user.rows[0];

    if (
      currentUser.role !==
      "player" ||
      currentUser
        .verification_status !==
        "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(403)
        .json({
          message:
            "Tu cuenta debe estar verificada para rechazar desafíos.",
          reason:
            "not_verified",
        });
    }

    const rotation =
      await getRotationState(
        client,
        req.userId,
      );

    if (
      rotation
        .blockedByActiveMatch
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            `Primero tenés que jugar el partido ya confirmado contra ${rotation.activeChallenge.challenger_name}.`,
          reason:
            "active_match",
        });
    }

    if (
      !rotation
        .currentChallenge
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "No tenés desafíos pendientes para rechazar.",
        });
    }

    if (
      Number(req.params.id) !==
      Number(
        rotation
          .currentChallenge
          .id,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            `Antes tenés que resolver el desafío de ${rotation.currentChallenge.challenger_name}.`,
          reason:
            "rotation_blocked",
          current_challenge_id:
            rotation
              .currentChallenge
              .id,
          current_opponent:
            rotation
              .currentChallenge
              .challenger_name,
        });
    }

    const challenge =
      await client.query(
        `
        SELECT *

        FROM challenges

        WHERE
          id = $1
          AND challenged_id = $2
          AND status = 'pending'

        FOR UPDATE
        `,
        [
          req.params.id,
          req.userId,
        ],
      );

    if (!challenge.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "El desafío ya fue resuelto o no existe.",
          reason:
            "challenge_already_resolved",
        });
    }

    const beforeRating =
      Number(
        currentUser.rating,
      );

    const matchesPlayed =
      Number(
        currentUser
          .matches_played,
      );

    if (
      !Number.isFinite(
        beforeRating,
      ) ||
      !Number.isInteger(
        matchesPlayed,
      ) ||
      matchesPlayed < 0
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Los datos de ranking del jugador son inválidos.",
          reason:
            "invalid_rating",
        });
    }

    const provisional =
      matchesPlayed <
      PLACEMENT_MATCHES;

    /*
      IMPORTANTE:

      Un provisional puede tener Elo 0.

      La versión anterior usaba piso 100
      y rechazar con Elo 0 podía terminar
      SUBIÉNDOLO a 100.

      Eso queda corregido.

      Provisional: piso 0.
      Establecido: piso 100.
    */
    const ratingFloor =
      provisional
        ? 0
        : 100;

    const afterRating =
      Math.max(
        ratingFloor,
        beforeRating -
          REJECTION_ELO_PENALTY,
      );

    const realPenalty =
      beforeRating -
      afterRating;

    const updatedChallenge =
      await client.query(
        `
        UPDATE challenges

        SET
          status = 'rejected',
          rejected_at =
            CURRENT_TIMESTAMP,
          resolved_at =
            CURRENT_TIMESTAMP,
          rejection_elo_penalty = $1

        WHERE
          id = $2
          AND challenged_id = $3
          AND status = 'pending'

        RETURNING *
        `,
        [
          realPenalty,
          req.params.id,
          req.userId,
        ],
      );

    if (
      !updatedChallenge.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "El desafío ya fue resuelto.",
          reason:
            "challenge_already_resolved",
        });
    }

    await client.query(
      `
      UPDATE users

      SET
        rating = $1,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = $2
      `,
      [
        afterRating,
        req.userId,
      ],
    );

    await client.query(
      `
      INSERT INTO elo_events (
        user_id,
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
        'challenge_rejection',
        $3,
        $4,
        $5,
        $6
      )
      `,
      [
        req.userId,
        updatedChallenge.rows[0].id,
        beforeRating,
        -realPenalty,
        afterRating,

        `Penalización por rechazar un desafío: -${realPenalty} Elo`,
      ],
    );

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
        'challenge_rejected',
        $3
      )
      `,
      [
        req.userId,
        updatedChallenge.rows[0].id,

        JSON.stringify({
          elo_before:
            beforeRating,

          elo_penalty:
            realPenalty,

          elo_after:
            afterRating,

          provisional,

          cooldown_days:
            REJECTION_COOLDOWN_DAYS,
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    res.json({
      message:
        realPenalty > 0
          ? `Desafío rechazado. Se descontaron ${realPenalty} puntos Elo.`
          : "Desafío rechazado. Tu Elo ya estaba en el mínimo permitido.",

      elo_change:
        -realPenalty,

      rating:
        afterRating,

      cooldown_days:
        REJECTION_COOLDOWN_DAYS,

      next_rotation:
        true,
    });
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {
      // Se libera en finally.
    }

    next(error);
  } finally {
    client.release();
  }
};