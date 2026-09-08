import { pool } from "../db.js";

const PLACEMENT_MATCHES = 5;
const MAX_RANKED_CHALLENGE_DISTANCE = 3;
const REJECTION_COOLDOWN_DAYS = 7;

const formatAvailableDate = (value) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(new Date(value));
};

const getOfficialRankedPlayers = async (
  client,
  city,
  gender,
) => {
  const result = await client.query(
    `
    SELECT
      id,
      name,
      rating,
      matches_played,

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

    ORDER BY
      official_position ASC
    `,
    [
      city,
      gender,
      PLACEMENT_MATCHES,
    ],
  );

  return result.rows.map(
    (player) => ({
      ...player,

      id:
        Number(player.id),

      rating:
        Number(player.rating),

      matches_played:
        Number(
          player.matches_played,
        ),

      official_position:
        Number(
          player.official_position,
        ),
    }),
  );
};

const getHistoricalMeetingsMap = async (
  client,
  userId,
) => {
  const result = await client.query(
    `
    SELECT
      CASE
        WHEN player1_id = $1
          THEN player2_id
        ELSE player1_id
      END AS opponent_id,

      COUNT(*)::int AS meetings

    FROM matches

    WHERE
      status = 'completed'
      AND annulled_at IS NULL
      AND (
        player1_id = $1
        OR player2_id = $1
      )

    GROUP BY
      CASE
        WHEN player1_id = $1
          THEN player2_id
        ELSE player1_id
      END
    `,
    [userId],
  );

  const map = new Map();

  for (const row of result.rows) {
    map.set(
      Number(row.opponent_id),
      Number(row.meetings),
    );
  }

  return map;
};

const getVirtualPosition = (
  player,
  officialPlayers,
) => {
  const playerRating =
    Number(player.rating);

  const playerMatches =
    Number(player.matches_played);

  const playerId =
    Number(player.id);

  if (
    !Number.isFinite(
      playerRating,
    ) ||
    !Number.isInteger(
      playerMatches,
    ) ||
    playerMatches < 0 ||
    !Number.isInteger(
      playerId,
    )
  ) {
    return null;
  }

  let playersAbove = 0;

  for (
    const official of
    officialPlayers
  ) {
    const officialRating =
      Number(official.rating);

    const officialMatches =
      Number(
        official.matches_played,
      );

    const officialId =
      Number(official.id);

    const isAbove =
      officialRating >
        playerRating ||
      (
        officialRating ===
          playerRating &&
        officialMatches >
          playerMatches
      ) ||
      (
        officialRating ===
          playerRating &&
        officialMatches ===
          playerMatches &&
        officialId <
          playerId
      );

    if (isAbove) {
      playersAbove += 1;
    }
  }

  return playersAbove + 1;
};

const getCompetitivePosition = (
  player,
  officialPositionById,
  officialPlayers,
) => {
  const provisional =
    Number(player.matches_played) <
    PLACEMENT_MATCHES;

  if (provisional) {
    return getVirtualPosition(
      player,
      officialPlayers,
    );
  }

  return (
    officialPositionById.get(
      Number(player.id),
    ) || null
  );
};

export const getChallengeAvailability = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const userResult =
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
        `,
        [req.userId],
      );

    if (!userResult.rowCount) {
      return res.json({
        availability: {},
      });
    }

    const currentUser =
      userResult.rows[0];

    if (
      currentUser.role !==
        "player" ||
      currentUser
        .verification_status !==
        "verified" ||
      !currentUser.gender
    ) {
      return res.json({
        availability: {},
      });
    }

    const currentUserId =
      Number(currentUser.id);

    const currentMatches =
      Number(
        currentUser.matches_played,
      );

    const currentProvisional =
      currentMatches <
      PLACEMENT_MATCHES;

    /*
      Todos los jugadores verificados
      de la misma liga son visibles.

      La disponibilidad se define
      más abajo por posición competitiva
      y por rueda.
    */
    const playersResult =
      await client.query(
        `
        SELECT
          id,
          name,
          rating,
          matches_played,

          matches_played < $3
            AS provisional

        FROM users

        WHERE
          role = 'player'
          AND verification_status = 'verified'
          AND city = $1
          AND gender = $2

        ORDER BY
          CASE
            WHEN matches_played >= $3
              THEN 0
            ELSE 1
          END ASC,
          rating DESC,
          matches_played DESC,
          id ASC
        `,
        [
          currentUser.city,
          currentUser.gender,
          PLACEMENT_MATCHES,
        ],
      );

    const officialPlayers =
      await getOfficialRankedPlayers(
        client,
        currentUser.city,
        currentUser.gender,
      );

    const officialPositionById =
      new Map();

    for (
      const player of
      officialPlayers
    ) {
      officialPositionById.set(
        Number(player.id),
        Number(
          player.official_position,
        ),
      );
    }

    const currentOfficialPosition =
      currentProvisional
        ? null
        : (
            officialPositionById.get(
              currentUserId,
            ) || null
          );

    const currentCompetitivePosition =
      getCompetitivePosition(
        currentUser,
        officialPositionById,
        officialPlayers,
      );

    const currentVirtualPosition =
      currentProvisional
        ? currentCompetitivePosition
        : null;

    /*
      Historial de enfrentamientos.
    */
    const meetingsByOpponent =
      await getHistoricalMeetingsMap(
        client,
        currentUserId,
      );

    /*
      RIVALES HABILITADOS.

      Provisional vs provisional:
      permitido.

      En cualquier otro cruce:
      máximo 3 posiciones competitivas
      hacia arriba.

      Esto evita que un nuevo jugador
      con Elo 0 salte al #1.
    */
    const sportEligibleIds =
      new Set();

    const competitivePositionById =
      new Map();

    for (
      const player of
      playersResult.rows
    ) {
      const playerId =
        Number(player.id);

      const playerProvisional =
        Boolean(
          player.provisional,
        );

      const competitivePosition =
        getCompetitivePosition(
          player,
          officialPositionById,
          officialPlayers,
        );

      competitivePositionById.set(
        playerId,
        competitivePosition,
      );

      if (
        playerId ===
        currentUserId
      ) {
        continue;
      }

      if (
        currentProvisional &&
        playerProvisional
      ) {
        sportEligibleIds.add(
          playerId,
        );

        continue;
      }

      if (
        !currentCompetitivePosition ||
        !competitivePosition
      ) {
        continue;
      }

      const difference =
        currentCompetitivePosition -
        competitivePosition;

      if (
        difference >= 1 &&
        difference <=
          MAX_RANKED_CHALLENGE_DISTANCE
      ) {
        sportEligibleIds.add(
          playerId,
        );
      }
    }

    /*
      RUEDA DEL DESAFIANTE.

      Solamente cuenta rivales que
      deportivamente pueden ser
      desafiados en este momento.
    */
    let minimumMeetings = null;

    for (
      const playerId of
      sportEligibleIds
    ) {
      const meetings =
        meetingsByOpponent.get(
          playerId,
        ) || 0;

      if (
        minimumMeetings === null ||
        meetings <
          minimumMeetings
      ) {
        minimumMeetings =
          meetings;
      }
    }

    /*
      Desafíos activos.
    */
    const activeChallengesResult =
      await client.query(
        `
        SELECT
          id,
          challenger_id,
          challenged_id,
          status

        FROM challenges

        WHERE
          status IN (
            'pending',
            'accepted'
          )
          AND (
            challenger_id = $1
            OR challenged_id = $1
          )
        `,
        [currentUserId],
      );

    const activeByOpponent =
      new Map();

    for (
      const challenge of
      activeChallengesResult.rows
    ) {
      const opponentId =
        Number(
          challenge.challenger_id,
        ) ===
        currentUserId
          ? Number(
              challenge.challenged_id,
            )
          : Number(
              challenge.challenger_id,
            );

      activeByOpponent.set(
        opponentId,
        challenge,
      );
    }

    /*
      Cooldown de rechazos.
    */
    const cooldownsResult =
      await client.query(
        `
        SELECT DISTINCT ON (
          challenged_id
        )
          challenged_id,
          rejected_at,

          rejected_at
            + INTERVAL '7 days'
            AS available_at

        FROM challenges

        WHERE
          challenger_id = $1
          AND status = 'rejected'
          AND rejected_at IS NOT NULL

        ORDER BY
          challenged_id,
          rejected_at DESC,
          id DESC
        `,
        [currentUserId],
      );

    const cooldownByOpponent =
      new Map();

    for (
      const cooldown of
      cooldownsResult.rows
    ) {
      cooldownByOpponent.set(
        Number(
          cooldown.challenged_id,
        ),
        cooldown,
      );
    }

    /*
      Último desafío resuelto contra
      cada receptor.
    */
    const lastResolvedResult =
      await client.query(
        `
        SELECT DISTINCT ON (
          challenged_id
        )
          challenged_id,
          resolved_at

        FROM challenges

        WHERE
          challenger_id = $1
          AND resolved_at IS NOT NULL

        ORDER BY
          challenged_id,
          resolved_at DESC,
          id DESC
        `,
        [currentUserId],
      );

    const lastResolvedByOpponent =
      new Map();

    for (
      const row of
      lastResolvedResult.rows
    ) {
      lastResolvedByOpponent.set(
        Number(
          row.challenged_id,
        ),
        row.resolved_at,
      );
    }

    const availability = {};

    for (
      const player of
      playersResult.rows
    ) {
      const playerId =
        Number(player.id);

      const playerProvisional =
        Boolean(
          player.provisional,
        );

      const playerCompetitivePosition =
        competitivePositionById.get(
          playerId,
        ) || null;

      if (
        playerId ===
        currentUserId
      ) {
        availability[player.id] = {
          can_challenge: false,
          reason: "self",
          message:
            "Este sos vos.",

          competitive_position:
            playerCompetitivePosition,
        };

        continue;
      }

      /*
        REGLA DEPORTIVA.
      */
      if (
        !sportEligibleIds.has(
          playerId,
        )
      ) {
        let message =
          "Este jugador no está habilitado para este desafío.";

        if (currentProvisional) {
          message =
            "Durante tus 5 partidos de colocación podés desafiar otros provisionales o rivales ubicados hasta 3 posiciones competitivas por encima de tu posición virtual.";
        } else if (
          playerProvisional
        ) {
          message =
            "Este provisional no está dentro de las 3 posiciones competitivas superiores que podés desafiar.";
        } else {
          message =
            "Solo podés desafiar hasta 3 posiciones competitivas por encima.";
        }

        availability[player.id] = {
          can_challenge: false,

          reason:
            "ranking_distance",

          message,

          competitive_position:
            playerCompetitivePosition,

          current_competitive_position:
            currentCompetitivePosition,
        };

        continue;
      }

      /*
        RUEDA DEL DESAFIANTE.
      */
      const historicalMeetings =
        meetingsByOpponent.get(
          playerId,
        ) || 0;

      if (
        minimumMeetings !== null &&
        historicalMeetings >
          minimumMeetings
      ) {
        availability[player.id] = {
          can_challenge: false,

          reason:
            "opponent_rotation",

          historical_meetings:
            historicalMeetings,

          minimum_meetings:
            minimumMeetings,

          competitive_position:
            playerCompetitivePosition,

          message:
            "Antes tenés que jugar con rivales de tu rueda a los que enfrentaste menos veces.",
        };

        continue;
      }

      /*
        Ya hay desafío activo.
      */
      const active =
        activeByOpponent.get(
          playerId,
        );

      if (active) {
        availability[player.id] = {
          can_challenge: false,

          reason:
            "active_challenge",

          competitive_position:
            playerCompetitivePosition,

          message:
            active.status ===
              "accepted"
              ? "Ya tienen un partido confirmado pendiente."
              : "Ya existe un desafío pendiente entre ustedes.",
        };

        continue;
      }

      /*
        Cooldown.
      */
      const cooldown =
        cooldownByOpponent.get(
          playerId,
        );

      if (cooldown) {
        const availableAt =
          new Date(
            cooldown.available_at,
          );

        if (
          !Number.isNaN(
            availableAt.getTime(),
          ) &&
          availableAt.getTime() >
            Date.now()
        ) {
          availability[player.id] = {
            can_challenge: false,

            reason:
              "rejection_cooldown",

            available_at:
              cooldown.available_at,

            competitive_position:
              playerCompetitivePosition,

            message:
              `Este jugador rechazó tu último desafío. Podés volver a desafiarlo el ${formatAvailableDate(
                cooldown.available_at,
              )}.`,
          };

          continue;
        }
      }

      /*
        RUEDA DEL RECEPTOR.
      */
      const lastResolved =
        lastResolvedByOpponent.get(
          playerId,
        );

      if (lastResolved) {
        const waiting =
          await client.query(
            `
            SELECT
              c.id

            FROM challenges c

            WHERE
              c.challenged_id = $1
              AND c.challenger_id <> $2
              AND c.status = 'pending'
              AND c.created_at <= $3

            ORDER BY
              c.historical_meetings_at_creation ASC,
              c.created_at ASC,
              c.id ASC

            LIMIT 1
            `,
            [
              playerId,
              currentUserId,
              lastResolved,
            ],
          );

        if (waiting.rowCount) {
          availability[player.id] = {
            can_challenge: false,

            reason:
              "rotation_wait",

            competitive_position:
              playerCompetitivePosition,

            message:
              `${player.name} todavía tiene rivales anteriores esperando en su rueda.`,
          };

          continue;
        }
      }

      availability[player.id] = {
        can_challenge: true,

        reason: null,

        historical_meetings:
          historicalMeetings,

        competitive_position:
          playerCompetitivePosition,

        current_competitive_position:
          currentCompetitivePosition,

        message:
          currentProvisional
            ? playerProvisional
              ? "Partido de colocación contra otro provisional."
              : "Este rival está dentro de las 3 posiciones competitivas habilitadas para tu colocación."
            : playerProvisional
              ? "Este provisional está dentro de tus 3 posiciones competitivas superiores."
              : "Podés desafiar a este jugador.",
      };
    }

    res.json({
      placement_matches:
        PLACEMENT_MATCHES,

      max_challenge_distance:
        MAX_RANKED_CHALLENGE_DISTANCE,

      current_player: {
        provisional:
          currentProvisional,

        matches_played:
          currentMatches,

        matches_remaining:
          Math.max(
            0,
            PLACEMENT_MATCHES -
              currentMatches,
          ),

        official_position:
          currentOfficialPosition,

        virtual_position:
          currentVirtualPosition,

        competitive_position:
          currentCompetitivePosition,
      },

      rotation: {
        minimum_historical_meetings:
          minimumMeetings,
      },

      availability,
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};