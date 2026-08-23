import { pool } from "../db.js";

const REJECTION_ELO_PENALTY = 8;
const REJECTION_COOLDOWN_DAYS = 7;

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
          name,
          phone,
          city,
          gender,
          rating,
          matches_played,
          verification_status,
          role,

          ROW_NUMBER() OVER (
            PARTITION BY city, gender
            ORDER BY
              rating DESC,
              matches_played DESC,
              id ASC
          )::int AS rank_position

        FROM users

        WHERE gender IS NOT NULL
          AND role = 'player'
      )

      SELECT *
      FROM ranked
      WHERE id = $1
      `,
      [id],
    );

  return result.rows[0];
};


/*
  Cuenta únicamente partidos reales:

  - completados
  - no anulados

  Un partido rechazado/anulado por administración
  NO sirve para incrementar los enfrentamientos.
*/
const getHistoricalMeetings = async (
  client,
  player1Id,
  player2Id,
) => {
  const result =
    await client.query(
      `
      SELECT COUNT(*)::int AS total

      FROM matches

      WHERE status = 'completed'

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

  return result.rows[0].total;
};


/*
  RUEDA DE RIVALES

  Entre todos los desafíos recibidos
  que siguen pendientes:

  1. menos enfrentamientos históricos
  2. si empatan, desafío más antiguo
  3. si todavía empatan, id más bajo

  Ejemplo:

  D -> 1
  C -> 4
  B -> 4
  A -> 7

  La rueda será:

  D -> C/B -> B/C -> A
*/
const getRotationState = async (
  client,
  userId,
) => {
  /*
    Si ya aceptó un desafío y ese partido
    todavía está en curso, no puede pasar
    al siguiente rival.
  */
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
        ON u.id = c.challenger_id

      WHERE c.challenged_id = $1
        AND c.status = 'accepted'

      ORDER BY c.accepted_at ASC NULLS LAST,
               c.created_at ASC

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
        u.name AS challenger_name

      FROM challenges c

      JOIN users u
        ON u.id = c.challenger_id

      WHERE c.challenged_id = $1
        AND c.status = 'pending'

      ORDER BY
        c.historical_meetings_at_creation ASC,
        c.created_at ASC,
        c.id ASC
      `,
      [userId],
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
  Después de resolver un turno,
  ese rival no debe volver a meterse
  adelante de otros desafíos que
  ya estaban esperando.

  Ejemplo:

  D C B A

  Se juega D.

  Si todavía existen C B A,
  D no puede crear inmediatamente
  otro desafío y volver a ponerse primero.
*/
const hasOlderPendingRivals = async (
  client,
  challengerId,
  challengedId,
) => {
  const lastResolved =
    await client.query(
      `
      SELECT resolved_at

      FROM challenges

      WHERE challenger_id = $1
        AND challenged_id = $2
        AND resolved_at IS NOT NULL

      ORDER BY resolved_at DESC

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
      SELECT 1

      FROM challenges

      WHERE challenged_id = $1

        AND challenger_id <> $2

        AND status = 'pending'

        AND created_at <= $3

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
  Devuelve el cooldown después
  de un rechazo.

  Solamente aplica al mismo jugador
  que fue rechazado intentando
  desafiar nuevamente al mismo rival.
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
        AND status = 'rejected'
        AND rejected_at IS NOT NULL

      ORDER BY rejected_at DESC

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
  DISPONIBILIDAD DE DESAFÍOS
  ============================================================

  Devuelve para cada jugador del ranking
  si el usuario actual puede desafiarlo
  y, si no puede, explica el motivo.

  Esta información se usa solamente
  para mostrar/ocultar/deshabilitar
  correctamente los botones del ranking.

  La validación real sigue estando también
  en createChallenge.
*/

export const getChallengeAvailability = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const challengerId =
      req.userId;

    const challenger =
      await getRankedPlayer(
        client,
        challengerId,
      );

    if (!challenger) {
      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }

    const players =
      await client.query(
        `
        WITH ranked AS (
          SELECT
            id,
            name,
            city,
            gender,
            rating,
            matches_played,
            verification_status,
            role,

            ROW_NUMBER() OVER (
              PARTITION BY city, gender

              ORDER BY
                rating DESC,
                matches_played DESC,
                id ASC
            )::int AS rank_position

          FROM users

          WHERE gender IS NOT NULL
            AND role = 'player'
        )

        SELECT *
        FROM ranked

        WHERE city = $1
          AND gender = $2

        ORDER BY rank_position ASC
        `,
        [
          challenger.city,
          challenger.gender,
        ],
      );

    const availability = {};

    for (
      const challenged of
      players.rows
    ) {
      /*
        No se desafía a sí mismo.
      */
      if (
        challenged.id ===
        challengerId
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "self",

          message:
            "No podés desafiarte a vos mismo.",
        };

        continue;
      }


      /*
        El usuario debe estar
        verificado.
      */
      if (
        challenger
          .verification_status !==
        "verified"
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "challenger_not_verified",

          message:
            "Tu cuenta debe estar verificada para crear desafíos.",
        };

        continue;
      }


      /*
        El rival también.
      */
      if (
        challenged
          .verification_status !==
        "verified"
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "challenged_not_verified",

          message:
            "Este jugador todavía no está habilitado para competir.",
        };

        continue;
      }


      /*
        Máximo tres posiciones
        hacia arriba.
      */
      const difference =
        challenger.rank_position -
        challenged.rank_position;

      if (
        difference < 1 ||
        difference > 3
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "ranking_distance",

          message:
            "Solo podés desafiar hasta 3 posiciones por encima.",
        };

        continue;
      }


      /*
        Cooldown luego de rechazo.
      */
      const cooldown =
        await getRejectionCooldown(
          client,
          challengerId,
          challenged.id,
        );

      if (cooldown) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "rejection_cooldown",

          message:
            "Este jugador rechazó tu último desafío. Tenés que esperar 7 días para volver a desafiarlo.",

          available_at:
            cooldown.availableAt,
        };

        continue;
      }


      /*
        Ya existe desafío o
        partido activo.
      */
      const active =
        await client.query(
          `
          SELECT id

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

          LIMIT 1
          `,
          [
            challengerId,
            challenged.id,
          ],
        );

      if (
        active.rowCount
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "active_challenge",

          message:
            "Ya existe un desafío o partido activo entre ustedes.",
        };

        continue;
      }


      /*
        Regla de rotación.
      */
      const mustWaitForOthers =
        await hasOlderPendingRivals(
          client,
          challengerId,
          challenged.id,
        );

      if (
        mustWaitForOthers
      ) {
        availability[
          challenged.id
        ] = {
          can_challenge:
            false,

          reason:
            "rotation_wait",

          message:
            "Todavía hay otros desafíos anteriores que este jugador debe resolver.",
        };

        continue;
      }


      /*
        Si llegó hasta acá,
        puede desafiar.
      */
      availability[
        challenged.id
      ] = {
        can_challenge:
          true,

        reason:
          null,

        message:
          null,
      };
    }


    res.json({
      availability,
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};


export const createChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const challengerId =
      req.userId;

    const challengedId =
      Number(
        req.body.challenged_id,
      );

    if (
      !challengedId ||
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
      IDENTIDAD DEL DESAFIANTE
    */
    if (
      challenger.verification_status !==
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
      IDENTIDAD DEL RIVAL
    */
    if (
      challenged.verification_status !==
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
      REGLA:
      máximo tres posiciones
      hacia arriba.
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
      NO DUPLICAMOS UN DESAFÍO
      O PARTIDO ACTIVO ENTRE
      LOS MISMOS JUGADORES.
    */
    const active =
      await client.query(
        `
        SELECT id, status

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
      EVITAMOS QUE UN RIVAL QUE YA
      CUMPLIÓ SU TURNO VUELVA A
      ENTRAR ANTES QUE LOS DEMÁS.

      Esto conserva la rueda:

      D -> C -> B -> A

      en vez de:

      D -> D -> D -> C ...
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
            "Todavía hay otros desafíos anteriores que este jugador debe resolver antes de que puedas volver a desafiarlo.",

          reason:
            "rotation_wait",
        });
    }


    /*
      GUARDAMOS CUÁNTAS VECES
      HABÍAN JUGADO ENTRE ELLOS
      AL MOMENTO DEL DESAFÍO.

      Esto define su lugar
      dentro de la rueda.
    */
    const historicalMeetings =
      await getHistoricalMeetings(
        client,
        challengerId,
        challengedId,
      );


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
    await client.query(
      "ROLLBACK",
    );

    next(error);
  } finally {
    client.release();
  }
};


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
          c.created_at DESC
        `,
        [
          req.userId,
        ],
      );


    /*
      También devolvemos el estado
      de la rueda para que React pueda
      mostrar botones deshabilitados
      y tooltips explicativos.
    */
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
      rotation.currentChallenge?.id ||
      null;


    const challenges =
      result.rows.map(
        (challenge) => {
          const incoming =
            challenge.challenged_id ===
            req.userId;

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
              rotation.blockedByActiveMatch
            ) {
              rotationMessage =
                `Primero tenés que jugar el partido ya confirmado contra ${rotation.activeChallenge.challenger_name}.`;
            } else if (
              challenge.id ===
              currentId
            ) {
              canAccept = true;
              canReject = true;
            } else if (
              rotation.currentChallenge
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
          rotation.blockedByActiveMatch,

        current_challenge_id:
          currentId,

        current_opponent:
          rotation.currentChallenge
            ?.challenger_name ||
          rotation.activeChallenge
            ?.challenger_name ||
          null,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
  CARGAR O MODIFICAR
  LUGAR + FECHA + HORA.

  Puede hacerlo cualquiera
  de los dos jugadores.
*/
export const scheduleChallenge = async (
  req,
  res,
  next,
) => {
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


    const result =
      await pool.query(
        `
        UPDATE challenges

        SET
          venue = $1,
          scheduled_at = $2,
          schedule_updated_by = $3

        WHERE id = $4

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


    if (
      !result.rowCount
    ) {
      return res
        .status(404)
        .json({
          message:
            "Desafío pendiente no encontrado.",

          reason:
            "challenge_not_found",
        });
    }


    await pool.query(
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


    res.json({
      message:
        "Lugar, fecha y hora guardados correctamente.",

      challenge:
        result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};


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
          verification_status

        FROM users

        WHERE id = $1
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


    if (
      currentUser.rows[0]
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
      PRIMERO CONTROLAMOS
      LA RUEDA.
    */
    const rotation =
      await getRotationState(
        client,
        req.userId,
      );


    if (
      rotation.blockedByActiveMatch
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
      !rotation.currentChallenge
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
      rotation.currentChallenge.id
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
            rotation.currentChallenge.id,

          current_opponent:
            rotation.currentChallenge
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
          AND status = 'pending'

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


    /*
      SIN TURNO NO SE ACEPTA.
    */
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


    if (
      new Date(
        c.scheduled_at,
      ).getTime() <=
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
          verification_status

        FROM users

        WHERE id = $1
        `,
        [
          c.challenger_id,
        ],
      );


    if (
      !challenger.rowCount ||
      challenger.rows[0]
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
            "El jugador que creó este desafío ya no está habilitado para competir.",

          reason:
            "challenger_not_verified",
        });
    }


    await client.query(
      `
      UPDATE challenges

      SET
        status = 'accepted',
        accepted_at =
          CURRENT_TIMESTAMP

      WHERE id = $1
      `,
      [
        c.id,
      ],
    );


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
    await client.query(
      "ROLLBACK",
    );

    next(error);
  } finally {
    client.release();
  }
};


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
      RECHAZAR TAMBIÉN RESPETA
      EL TURNO DE LA RUEDA.

      No tiene sentido resolver
      anticipadamente rivales que
      todavía no corresponden.
    */
    const rotation =
      await getRotationState(
        client,
        req.userId,
      );


    if (
      rotation.blockedByActiveMatch
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
      !rotation.currentChallenge
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
      rotation.currentChallenge.id
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
            rotation.currentChallenge.id,

          current_opponent:
            rotation.currentChallenge
              .challenger_name,
        });
    }


    const user =
      await client.query(
        `
        SELECT
          id,
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


    const beforeRating =
      user.rows[0].rating;


    const afterRating =
      Math.max(
        100,
        beforeRating -
          REJECTION_ELO_PENALTY,
      );


    const realPenalty =
      beforeRating -
      afterRating;


    const challenge =
      await client.query(
        `
        UPDATE challenges

        SET
          status = 'rejected',

          rejected_at =
            CURRENT_TIMESTAMP,

          resolved_at =
            CURRENT_TIMESTAMP,

          rejection_elo_penalty =
            $1

        WHERE id = $2

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
        challenge.rows[0].id,
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
        challenge.rows[0].id,

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
    await client.query(
      "ROLLBACK",
    );

    next(error);
  } finally {
    client.release();
  }
};