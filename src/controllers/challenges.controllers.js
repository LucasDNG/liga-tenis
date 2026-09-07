import { pool } from "../db.js";

const REJECTION_ELO_PENALTY = 8;
const REJECTION_COOLDOWN_DAYS = 7;


/*
  ============================================================
  JUGADOR + POSICIÓN COMPETITIVA
  ============================================================

  La posición se calcula solamente entre:
  - jugadores
  - con liga elegida
  - verificados

  Pero igualmente devolvemos la cuenta si
  todavía está pendiente/rechazada para poder
  mostrar el error correcto.
*/

const getRankedPlayer = async (
  client,
  id,
) => {
  const result =
    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,

          ROW_NUMBER() OVER (
            PARTITION BY
              city,
              gender

            ORDER BY
              rating DESC,
              matches_played DESC,
              id ASC
          )::int
            AS rank_position

        FROM users

        WHERE role =
          'player'

          AND gender
            IS NOT NULL

          AND verification_status =
            'verified'
      )

      SELECT
        u.id,
        u.name,
        u.phone,
        u.city,
        u.gender,
        u.rating,
        u.matches_played,
        u.verification_status,
        u.role,

        ranked.rank_position

      FROM users u

      LEFT JOIN ranked
        ON ranked.id =
           u.id

      WHERE u.id = $1
        AND u.role =
          'player'
      `,
      [
        id,
      ],
    );

  return result.rows[0];
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
  const result =
    await client.query(
      `
      SELECT
        COUNT(*)::int
          AS total

      FROM matches

      WHERE status =
        'completed'

        AND annulled_at
          IS NULL

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

  return result.rows[0].total;
};


/*
  ============================================================
  RUEDA DE RIVALES
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
        c.id AS
          challenge_id,

        c.challenger_id,

        u.name AS
          challenger_name,

        c.venue,
        c.scheduled_at

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE c.challenged_id = $1

        AND c.status =
          'accepted'

      ORDER BY
        c.accepted_at ASC
          NULLS LAST,

        c.created_at ASC,

        c.id ASC

      LIMIT 1
      `,
      [
        userId,
      ],
    );


  if (
    activeMatch.rowCount
  ) {
    return {
      blockedByActiveMatch:
        true,

      activeChallenge:
        activeMatch.rows[0],

      currentChallenge:
        null,

      pendingChallenges:
        [],
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

        u.name AS
          challenger_name

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE c.challenged_id = $1

        AND c.status =
          'pending'

      ORDER BY
        c.historical_meetings_at_creation ASC,
        c.created_at ASC,
        c.id ASC
      `,
      [
        userId,
      ],
    );


  return {
    blockedByActiveMatch:
      false,

    activeChallenge:
      null,

    currentChallenge:
      pending.rows[0] ||
      null,

    pendingChallenges:
      pending.rows,
  };
};


/*
  ============================================================
  ROTACIÓN DESPUÉS DE UN TURNO RESUELTO
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

      WHERE challenger_id = $1

        AND challenged_id = $2

        AND resolved_at
          IS NOT NULL

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


  if (
    !lastResolved.rowCount
  ) {
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

      WHERE challenged_id = $1

        AND challenger_id <> $2

        AND status =
          'pending'

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
  COOLDOWN POR RECHAZO
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

        rejected_at +
          INTERVAL '7 days'
          AS available_at

      FROM challenges

      WHERE challenger_id = $1

        AND challenged_id = $2

        AND status =
          'rejected'

        AND rejected_at
          IS NOT NULL

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


  if (
    !result.rowCount
  ) {
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
      Number(
        req.userId,
      );

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
      await getRankedPlayer(
        client,
        challengerId,
      );


    const challenged =
      await getRankedPlayer(
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


    /*
      DESAFIANTE VERIFICADO
    */

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
            challenger
              .verification_status ===
            "rejected"
              ? "Tu documentación fue rechazada. No podés crear desafíos hasta volver a verificar tu identidad."
              : "Tu identidad todavía está pendiente de verificación.",

          reason:
            "challenger_not_verified",
        });
    }


    /*
      RIVAL VERIFICADO
    */

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


    /*
      LIGA ELEGIDA
    */

    if (
      !challenger.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Primero elegí tu Liga Masculina o Femenina en Mi perfil",

          reason:
            "league_not_selected",
        });
    }


    if (
      !challenged.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Ese jugador todavía no eligió una liga.",

          reason:
            "opponent_without_league",
        });
    }


    /*
      MISMA LIGA
    */

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
            "Solo podés desafiar jugadores de tu misma liga",

          reason:
            "different_league",
        });
    }


    /*
      MISMA CIUDAD
    */

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
            "Solo podés desafiar jugadores de tu misma ciudad",

          reason:
            "different_city",
        });
    }


    /*
      Ambos deberían tener posición
      porque ya comprobamos:
      - role player
      - verified
      - gender
    */

    if (
      !Number.isInteger(
        challenger.rank_position,
      ) ||
      !Number.isInteger(
        challenged.rank_position,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "No se pudo determinar la posición competitiva de los jugadores.",

          reason:
            "ranking_unavailable",
        });
    }


    /*
      SOLO HACIA ARRIBA
      MÁXIMO 3 POSICIONES
    */

    const difference =
      challenger.rank_position -
      challenged.rank_position;


    if (
      difference < 1 ||
      difference > 3
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Solo podés desafiar hasta 3 posiciones por encima",

          reason:
            "ranking_distance",
        });
    }


    /*
      COOLDOWN POR RECHAZO
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
      NO DUPLICAR DESAFÍOS ACTIVOS
    */

    const active =
      await client.query(
        `
        SELECT
          id,
          status

        FROM challenges

        WHERE status IN (
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

        ORDER BY
          id ASC

        LIMIT 1
        `,
        [
          challengerId,
          challengedId,
        ],
      );


    if (
      active.rowCount
    ) {
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
      RUEDA DE RIVALES
    */

    const mustWaitForOthers =
      await hasOlderPendingRivals(
        client,
        challengerId,
        challengedId,
      );


    if (
      mustWaitForOthers
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Todavía hay otros desafíos anteriores que este jugador debe resolver antes de que puedas volver a desafiarlo.",

          reason:
            "rotation_wait",
        });
    }


    /*
      ENFRENTAMIENTOS HISTÓRICOS
    */

    const historicalMeetings =
      await getHistoricalMeetings(
        client,
        challengerId,
        challengedId,
      );


    /*
      CREAR
    */

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


    /*
      AUDITORÍA
    */

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

          challenger_rank:
            challenger.rank_position,

          challenged_rank:
            challenged.rank_position,

          historical_meetings:
            historicalMeetings,
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
        ?.id ||
      null;


    const challenges =
      result.rows.map(
        (
          challenge,
        ) => {
          const incoming =
            challenge.challenged_id ===
            req.userId;


          let canAccept =
            false;

          let canReject =
            false;

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
              challenge.id ===
              currentId
            ) {
              canAccept =
                true;

              canReject =
                true;
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
      new Date(
        scheduled_at,
      );


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

        WHERE id = $4

          AND status =
            'pending'

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


    if (
      !result.rowCount
    ) {
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
            scheduledDate.toISOString(),
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


    /*
      Bloqueamos al jugador desafiado.
      Esto serializa decisiones simultáneas.
    */

    const currentUser =
      await client.query(
        `
        SELECT
          id,
          role,
          gender,
          city,
          verification_status

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [
          req.userId,
        ],
      );


    if (
      !currentUser.rowCount
    ) {
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
      Number(
        req.params.id,
      ) !==
      rotation
        .currentChallenge
        .id
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

        WHERE id = $1

          AND challenged_id = $2

          AND status =
            'pending'

        FOR UPDATE
        `,
        [
          req.params.id,
          req.userId,
        ],
      );


    if (
      !challenge.rowCount
    ) {
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
          verification_status

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [
          c.challenger_id,
        ],
      );


    if (
      !challenger.rowCount
    ) {
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


    /*
      No puede existir otro match
      del mismo challenge.
    */

    const existingMatch =
      await client.query(
        `
        SELECT
          id

        FROM matches

        WHERE challenge_id = $1
          AND annulled_at
            IS NULL

        LIMIT 1
        `,
        [
          c.id,
        ],
      );


    if (
      existingMatch.rowCount
    ) {
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
          status =
            'accepted',

          accepted_at =
            CURRENT_TIMESTAMP

        WHERE id = $1

          AND status =
            'pending'

        RETURNING id
        `,
        [
          c.id,
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


    /*
      Bloqueamos primero al usuario.

      Dos rechazos simultáneos del mismo
      jugador no pueden avanzar al mismo
      tiempo por la rueda.
    */

    const user =
      await client.query(
        `
        SELECT
          id,
          role,
          verification_status,
          rating

        FROM users

        WHERE id = $1

        FOR UPDATE
        `,
        [
          req.userId,
        ],
      );


    if (
      !user.rowCount
    ) {
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


    if (
      user.rows[0].role !==
      "player"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(403)
        .json({
          message:
            "Solo los jugadores pueden rechazar desafíos.",

          reason:
            "invalid_role",
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
      Number(
        req.params.id,
      ) !==
      rotation
        .currentChallenge
        .id
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

        WHERE id = $1

          AND challenged_id = $2

          AND status =
            'pending'

        FOR UPDATE
        `,
        [
          req.params.id,
          req.userId,
        ],
      );


    if (
      !challenge.rowCount
    ) {
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
        user.rows[0].rating,
      );


    if (
      !Number.isFinite(
        beforeRating,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "El Elo actual del jugador es inválido.",

          reason:
            "invalid_rating",
        });
    }


    const afterRating =
      Math.max(
        100,

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
          status =
            'rejected',

          rejected_at =
            CURRENT_TIMESTAMP,

          resolved_at =
            CURRENT_TIMESTAMP,

          rejection_elo_penalty =
            $1

        WHERE id = $2

          AND challenged_id = $3

          AND status =
            'pending'

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
        `Desafío rechazado. Se descontaron ${realPenalty} puntos Elo.`,

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