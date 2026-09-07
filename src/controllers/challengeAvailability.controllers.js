import { pool } from "../db.js";

const PLACEMENT_MATCHES = 5;
const MAX_RANKED_CHALLENGE_DISTANCE = 3;
const REJECTION_COOLDOWN_DAYS = 7;

const formatAvailableDate = (value) => {
  if (!value) return null;

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
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

  return result.rows;
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

export const getChallengeAvailability = async (
  req,
  res,
  next,
) => {
  const client = await pool.connect();

  try {
    const userResult = await client.query(
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
      currentUser.role !== "player" ||
      currentUser.verification_status !==
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
      Number(currentUser.matches_played);

    const currentProvisional =
      currentMatches < PLACEMENT_MATCHES;

    /*
      Todos los jugadores verificados
      de la misma liga son visibles.

      Los provisionales también forman
      parte de la rueda de rivales.
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

    /*
      Ranking oficial.

      Solo lo usamos para jugadores
      establecidos.

      Un provisional NO tiene puesto
      oficial y durante sus primeros
      cinco partidos no tiene la
      restricción de tres posiciones.
    */
    const officialPlayers =
      await getOfficialRankedPlayers(
        client,
        currentUser.city,
        currentUser.gender,
      );

    const officialPositionById =
      new Map();

    for (const player of officialPlayers) {
      officialPositionById.set(
        Number(player.id),
        Number(player.official_position),
      );
    }

    const currentOfficialPosition =
      officialPositionById.get(
        currentUserId,
      ) || null;

    /*
      Historial real de partidos.

      Esta es la base de la rueda:
      primero hay que jugar con quienes
      menos enfrentamientos tenemos.
    */
    const meetingsByOpponent =
      await getHistoricalMeetingsMap(
        client,
        currentUserId,
      );

    /*
      Determinamos qué jugadores serían
      candidatos por REGLA DEPORTIVA,
      antes de cooldown/activo/etc.

      PROVISIONAL:
      puede desafiar a cualquier jugador
      verificado de su liga.

      ESTABLECIDO:
      solamente 1, 2 o 3 puestos
      oficiales por encima.
    */
    const sportEligibleIds =
      new Set();

    for (const player of playersResult.rows) {
      const playerId =
        Number(player.id);

      if (playerId === currentUserId) {
        continue;
      }

      if (currentProvisional) {
        sportEligibleIds.add(playerId);
        continue;
      }

      const targetOfficialPosition =
        officialPositionById.get(
          playerId,
        );

      if (
        !currentOfficialPosition ||
        !targetOfficialPosition
      ) {
        continue;
      }

      const difference =
        currentOfficialPosition -
        targetOfficialPosition;

      if (
        difference >= 1 &&
        difference <=
          MAX_RANKED_CHALLENGE_DISTANCE
      ) {
        sportEligibleIds.add(playerId);
      }
    }

    /*
      RUEDA.

      Entre todos los rivales que el
      jugador podría desafiar por regla
      deportiva, buscamos el menor número
      de enfrentamientos.

      Ejemplo:

      Pedro 0
      Juan  0
      Luis  1

      No se puede volver a jugar con Luis
      hasta haber pasado por Pedro/Juan.

      Esto también vale para provisionales.
    */
    let minimumMeetings = null;

    for (const playerId of sportEligibleIds) {
      const meetings =
        meetingsByOpponent.get(playerId) || 0;

      if (
        minimumMeetings === null ||
        meetings < minimumMeetings
      ) {
        minimumMeetings = meetings;
      }
    }

    /*
      Desafíos activos del usuario.
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
        Number(challenge.challenger_id) ===
        currentUserId
          ? Number(challenge.challenged_id)
          : Number(challenge.challenger_id);

      activeByOpponent.set(
        opponentId,
        challenge,
      );
    }

    /*
      Cooldown por rechazo:
      únicamente para volver a desafiar
      al mismo jugador.
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
        Number(cooldown.challenged_id),
        cooldown,
      );
    }

    /*
      Si ya jugó contra alguien y ese
      jugador tiene desafíos anteriores
      esperando, también respetamos la
      rueda del RECEPTOR.
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
        Number(row.challenged_id),
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

      if (playerId === currentUserId) {
        availability[player.id] = {
          can_challenge: false,
          reason: "self",
          message: "Este sos vos.",
        };

        continue;
      }

      /*
        REGLA DEPORTIVA
      */
      if (
        !sportEligibleIds.has(playerId)
      ) {
        if (currentProvisional) {
          availability[player.id] = {
            can_challenge: false,
            reason: "not_eligible",
            message:
              "Este jugador no está habilitado para este desafío.",
          };
        } else if (
          Boolean(player.provisional)
        ) {
          availability[player.id] = {
            can_challenge: false,
            reason:
              "provisional_not_official_target",
            message:
              "Los jugadores rankeados desafían por posiciones oficiales. Este jugador todavía está en colocación.",
          };
        } else {
          availability[player.id] = {
            can_challenge: false,
            reason: "ranking_distance",
            message:
              "Solo podés desafiar hasta 3 posiciones oficiales por encima.",
          };
        }

        continue;
      }

      /*
        RUEDA DEL DESAFIANTE.

        No puede repetir rival si todavía
        tiene otro rival habilitado con
        menos enfrentamientos.
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
          reason: "opponent_rotation",
          historical_meetings:
            historicalMeetings,
          minimum_meetings:
            minimumMeetings,
          message:
            "Antes tenés que jugar con rivales de tu rueda a los que enfrentaste menos veces.",
        };

        continue;
      }

      /*
        Ya hay desafío/partido activo
        entre ambos.
      */
      const active =
        activeByOpponent.get(
          playerId,
        );

      if (active) {
        availability[player.id] = {
          can_challenge: false,
          reason: "active_challenge",
          message:
            active.status === "accepted"
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
            reason: "rotation_wait",
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

        message:
          currentProvisional
            ? Boolean(player.provisional)
              ? "Partido de colocación contra otro provisional."
              : "Podés desafiarlo como parte de tus 5 partidos de colocación."
            : "Podés desafiar a este jugador.",
      };
    }

    res.json({
      placement_matches:
        PLACEMENT_MATCHES,

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