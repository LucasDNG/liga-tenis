import { pool } from "../db.js";

import {
  CHALLENGE_REJECTION_PENALTY,
  PLACEMENT_MATCHES,
  calculateChallengeRejectionElo,
} from "../services/eloMatch.service.js";

import {
  applyPendingInactivityDecay,
} from "../services/playerActivity.service.js";

import {
  MAX_ACTIVE_CHALLENGE_TARGETS,
  getSportEligibleOpponents,
  validateChallengeSportEligibility,
} from "../services/challengeEligibility.service.js";


const REJECTION_COOLDOWN_DAYS = 7;


/*
  ============================================================
  JUGADOR
  ============================================================
*/

const getPlayer = async (
  client,
  id,
) => {
  const result =
    await client.query(
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

      WHERE
        id = $1
        AND role = 'player'
      `,
      [
        id,
        PLACEMENT_MATCHES,
      ],
    );

  return (
    result.rows[0] ||
    null
  );
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

      WHERE
        status = 'completed'

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

  return Number(
    result.rows[0].total,
  );
};


/*
  ============================================================
  MÍNIMO DE ENFRENTAMIENTOS DE LA RUEDA
  ============================================================

  Solamente se comparan rivales que
  HOY son deportivamente habilitados.

  Esto ahora incluye:

  - hasta 3 jugadores ACTIVOS hacia arriba;
  - todos los INACTIVOS encontrados antes
    de llegar al tercer activo;
  - provisional vs provisional, conservando
    la regla previa.
  ============================================================
*/

const getRotationMinimumMeetings =
  async (
    client,
    challenger,
  ) => {
    const eligibleOpponents =
      await getSportEligibleOpponents(
        client,
        challenger,
      );

    if (
      !eligibleOpponents.length
    ) {
      return null;
    }

    let minimumMeetings =
      null;

    for (
      const opponent of
      eligibleOpponents
    ) {
      const meetings =
        await getHistoricalMeetings(
          client,
          challenger.id,
          opponent.id,
        );

      if (
        minimumMeetings ===
          null ||
        meetings <
          minimumMeetings
      ) {
        minimumMeetings =
          meetings;
      }
    }

    return minimumMeetings;
  };


/*
  ============================================================
  RUEDA DEL RECEPTOR
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
    lastResolved
      .rows[0]
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

        rejected_at
          + INTERVAL '7 days'
          AS available_at

      FROM challenges

      WHERE
        challenger_id = $1

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
  RUEDA DE DESAFÍOS RECIBIDOS
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
        c.id
          AS challenge_id,

        c.challenger_id,

        u.name
          AS challenger_name,

        c.venue,
        c.scheduled_at

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE
        c.challenged_id = $1

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

        u.name
          AS challenger_name,

        u.matches_played < $2
          AS challenger_provisional

      FROM challenges c

      JOIN users u
        ON u.id =
           c.challenger_id

      WHERE
        c.challenged_id = $1

        AND c.status =
          'pending'

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
  CREAR DESAFÍO
  ============================================================

  Esta validación es la protección REAL
  del backend.

  No depende del botón del frontend.

  Antes de calcular ranking:
  - aplica decay pendiente en toda la liga;
  - vuelve a cargar ratings;
  - calcula ventana dinámica;
  - valida rueda;
  - valida cooldown;
  - valida duplicados.
  ============================================================
*/

export const createChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  let transactionStarted =
    false;

  try {
    const challengerId =
      Number(
        req.userId,
      );

    const challengedId =
      Number(
        req.body
          ?.challenged_id,
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

    transactionStarted =
      true;

    /*
      Primera carga para conocer
      ciudad y liga.
    */

    let challenger =
      await getPlayer(
        client,
        challengerId,
      );

    let challenged =
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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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
      ========================================================
      APLICAR INACTIVIDAD PENDIENTE DE LA LIGA
      ========================================================

      Esto es necesario porque un decay
      puede modificar:
      - Elo;
      - ranking oficial;
      - posición virtual;
      - ventana de desafíos.
    */

    await applyPendingInactivityDecay(
      client,
      {
        city:
          challenger.city,

        gender:
          challenger.gender,
      },
    );

    /*
      Recargamos después del decay.
    */

    challenger =
      await getPlayer(
        client,
        challengerId,
      );

    challenged =
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

      transactionStarted =
        false;

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
      ========================================================
      REGLA DEPORTIVA CENTRAL
      ========================================================

      Hasta el tercer ACTIVO hacia arriba,
      incluyendo todos los INACTIVOS
      encontrados en el recorrido.

      Provisional vs provisional sigue
      permitido.
    */

    const sportEligibility =
      await validateChallengeSportEligibility(
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

      transactionStarted =
        false;

      return res
        .status(400)
        .json({
          message:
            sportEligibility.message,

          reason:
            sportEligibility.reason,

          challenger_competitive_position:
            sportEligibility
              .challengerCompetitivePosition ??
            null,

          challenged_competitive_position:
            sportEligibility
              .challengedCompetitivePosition ??
            null,

          challenged_active:
            sportEligibility
              .challengedActive ??
            null,

          challenged_inactive:
            sportEligibility
              .challengedInactive ??
            null,

          active_target_limit:
            MAX_ACTIVE_CHALLENGE_TARGETS,
        });
    }

    /*
      ========================================================
      HISTORIAL + RUEDA
      ========================================================
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

      transactionStarted =
        false;

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
      ========================================================
      COOLDOWN
      ========================================================
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

      transactionStarted =
        false;

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
      ========================================================
      YA EXISTE DESAFÍO ACTIVO ENTRE EL PAR
      ========================================================
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

    if (
      active.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionStarted =
        false;

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
      ========================================================
      RUEDA DEL RECEPTOR
      ========================================================
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

      transactionStarted =
        false;

      return res
        .status(409)
        .json({
          message:
            "Este jugador todavía tiene otros rivales anteriores esperando en su rueda.",

          reason:
            "rotation_wait",
        });
    }

    /*
      ========================================================
      CREAR
      ========================================================
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
      ========================================================
      AUDITORÍA
      ========================================================
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
              .challengerPosition ??
            null,

          challenged_official_position:
            sportEligibility
              .challengedPosition ??
            null,

          challenger_competitive_position:
            sportEligibility
              .challengerCompetitivePosition ??
            null,

          challenged_competitive_position:
            sportEligibility
              .challengedCompetitivePosition ??
            null,

          challenger_virtual_position:
            sportEligibility
              .challengerVirtualPosition ??
            null,

          challenged_virtual_position:
            sportEligibility
              .challengedVirtualPosition ??
            null,

          challenged_active:
            sportEligibility
              .challengedActive ??
            null,

          challenged_inactive:
            sportEligibility
              .challengedInactive ??
            null,

          counts_as_active_target:
            sportEligibility
              .countsAsActiveTarget ??
            false,

          inactive_in_path:
            sportEligibility
              .inactiveInPath ??
            false,

          provisional_vs_provisional:
            sportEligibility
              .provisionalVsProvisional ??
            false,

          active_targets_found:
            sportEligibility
              .activeTargetsFound ??
            null,

          active_target_limit:
            MAX_ACTIVE_CHALLENGE_TARGETS,

          cutoff_competitive_position:
            sportEligibility
              .cutoffCompetitivePosition ??
            null,

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

    transactionStarted =
      false;

    return res
      .status(201)
      .json({
        message:
          "Desafío enviado. Ahora pueden coordinar por WhatsApp el lugar y horario.",

        challenge:
          created.rows[0],

        eligibility: {
          challenged_active:
            sportEligibility
              .challengedActive ??
            null,

          challenged_inactive:
            sportEligibility
              .challengedInactive ??
            null,

          counts_as_active_target:
            sportEligibility
              .countsAsActiveTarget ??
            false,

          inactive_in_path:
            sportEligibility
              .inactiveInPath ??
            false,

          active_target_limit:
            MAX_ACTIVE_CHALLENGE_TARGETS,
        },

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
    if (
      transactionStarted
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // La conexión se libera abajo.
      }
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

          u1.name
            AS challenger_name,

          u2.name
            AS challenged_name,

          u1.phone
            AS challenger_phone,

          u2.phone
            AS challenged_phone,

          u1.matches_played < $2
            AS challenger_provisional,

          u2.matches_played < $2
            AS challenged_provisional,

          updater.name
            AS schedule_updated_by_name

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
        ?.id ||
      null;

    const challenges =
      result.rows.map(
        (challenge) => {
          const incoming =
            Number(
              challenge.challenged_id,
            ) ===
            Number(
              req.userId,
            );

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
              Number(
                challenge.id,
              ) ===
              Number(
                currentId,
              )
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

    return res.json({
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

  let transactionStarted =
    false;

  try {
    const {
      venue,
      scheduled_at,
    } =
      req.body;

    const cleanVenue =
      String(
        venue ||
        "",
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

    transactionStarted =
      true;

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

          AND status =
            'pending'

          AND (
            challenger_id = $3

            OR

            challenged_id = $3
          )

        RETURNING *
        `,
        [
          cleanVenue,

          scheduledDate
            .toISOString(),

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

      transactionStarted =
        false;

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

    transactionStarted =
      false;

    return res.json({
      message:
        "Lugar, fecha y hora guardados correctamente.",

      challenge:
        result.rows[0],
    });
  } catch (error) {
    if (
      transactionStarted
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // Se libera abajo.
      }
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

  Un desafío ya creado NO se cancela
  porque alguno de sus jugadores haya
  pasado a inactivo.

  La actividad solamente cambia la
  ventana para NUEVOS desafíos.
  ============================================================
*/

export const acceptChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  let transactionStarted =
    false;

  try {
    await client.query(
      "BEGIN",
    );

    transactionStarted =
      true;

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

        WHERE
          id = $1

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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
      Number(
        rotation
          .currentChallenge
          .id,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionStarted =
        false;

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
        SELECT
          *

        FROM challenges

        WHERE
          id = $1

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

        WHERE
          id = $1

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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
      El desafío sigue siendo válido
      aunque alguno haya pasado a INACTIVO.

      No volvemos a evaluar la ventana
      competitiva al aceptar.
    */

    const existingMatch =
      await client.query(
        `
        SELECT
          id

        FROM matches

        WHERE
          challenge_id = $1

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

      transactionStarted =
        false;

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

        WHERE
          id = $1

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

      transactionStarted =
        false;

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

    transactionStarted =
      false;

    return res.json({
      message:
        "Desafío aceptado. El partido quedó programado.",

      match:
        match.rows[0],
    });
  } catch (error) {
    if (
      transactionStarted
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // Se libera abajo.
      }
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

  Antes del rechazo aplicamos cualquier
  decay de inactividad pendiente del
  jugador.

  Después usamos el motor Elo central.

  Esto conserva:

  -8 Elo normal.

  Piso:
  - provisional: 0
  - oficial normal: 100

  Excepción:
  si un oficial ya estaba debajo de 100
  por la regla extrema del #1,
  la penalización nunca le regala Elo.
  ============================================================
*/

export const rejectChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  let transactionStarted =
    false;

  try {
    await client.query(
      "BEGIN",
    );

    transactionStarted =
      true;

    /*
      Aplicamos solamente los decays
      pendientes de este jugador.

      Es importante que ocurran antes
      del evento challenge_rejection.
    */

    await applyPendingInactivityDecay(
      client,
      {
        userIds: [
          Number(
            req.userId,
          ),
        ],
      },
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

        WHERE
          id = $1

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

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

      transactionStarted =
        false;

      return res
        .status(404)
        .json({
          message:
            "No tenés desafíos pendientes para rechazar.",

          reason:
            "no_pending_challenges",
        });
    }

    if (
      Number(
        req.params.id,
      ) !==
      Number(
        rotation
          .currentChallenge
          .id,
      )
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionStarted =
        false;

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
        SELECT
          *

        FROM challenges

        WHERE
          id = $1

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

      transactionStarted =
        false;

      return res
        .status(409)
        .json({
          message:
            "El desafío ya fue resuelto o no existe.",

          reason:
            "challenge_already_resolved",
        });
    }

    /*
      ========================================================
      MOTOR ELO CENTRAL
      ========================================================
    */

    const rejectionElo =
      calculateChallengeRejectionElo({
        rating:
          currentUser.rating,

        matchesPlayed:
          currentUser
            .matches_played,
      });

    const beforeRating =
      rejectionElo
        .elo_before;

    const afterRating =
      rejectionElo
        .elo_after;

    const realPenalty =
      rejectionElo
        .effective_penalty;

    const provisional =
      rejectionElo
        .provisional;

    /*
      ========================================================
      ACTUALIZAR DESAFÍO
      ========================================================
    */

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

          rejection_elo_penalty = $1

        WHERE
          id = $2

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

      transactionStarted =
        false;

      return res
        .status(409)
        .json({
          message:
            "El desafío ya fue resuelto.",

          reason:
            "challenge_already_resolved",
        });
    }

    /*
      ========================================================
      ACTUALIZAR ELO
      ========================================================
    */

    await client.query(
      `
      UPDATE users

      SET
        rating = $1,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        id = $2
      `,
      [
        afterRating,
        req.userId,
      ],
    );

    /*
      ========================================================
      EVENTO ELO
      ========================================================
    */

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

        updatedChallenge
          .rows[0]
          .id,

        beforeRating,

        rejectionElo
          .elo_change,

        afterRating,

        `Penalización por rechazar un desafío: -${realPenalty} Elo`,
      ],
    );

    /*
      ========================================================
      AUDITORÍA
      ========================================================
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
        'challenge_rejected',
        $3
      )
      `,
      [
        req.userId,

        updatedChallenge
          .rows[0]
          .id,

        JSON.stringify({
          elo_before:
            beforeRating,

          elo_penalty:
            realPenalty,

          elo_after:
            afterRating,

          provisional,

          configured_penalty:
            CHALLENGE_REJECTION_PENALTY,

          cooldown_days:
            REJECTION_COOLDOWN_DAYS,
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    transactionStarted =
      false;

    return res.json({
      message:
        realPenalty > 0
          ? `Desafío rechazado. Se descontaron ${realPenalty} puntos Elo.`
          : "Desafío rechazado. Tu Elo ya estaba en el mínimo permitido.",

      elo_change:
        rejectionElo
          .elo_change,

      rating:
        afterRating,

      cooldown_days:
        REJECTION_COOLDOWN_DAYS,

      next_rotation:
        true,
    });
  } catch (error) {
    if (
      transactionStarted
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // Se libera abajo.
      }
    }

    next(error);
  } finally {
    client.release();
  }
};