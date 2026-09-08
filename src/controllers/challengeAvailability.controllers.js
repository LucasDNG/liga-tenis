import { pool } from "../db.js";

import {
  applyPendingInactivityDecay,
  getPlayerActivityMap,
} from "../services/playerActivity.service.js";


const PLACEMENT_MATCHES = 5;
const MAX_ACTIVE_CHALLENGE_TARGETS = 3;
const REJECTION_COOLDOWN_DAYS = 7;


/*
  ============================================================
  FORMATEAR FECHA
  ============================================================
*/

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
  ).format(
    new Date(value),
  );
};


/*
  ============================================================
  RANKING OFICIAL
  ============================================================
*/

const getOfficialRankedPlayers = async (
  client,
  city,
  gender,
) => {
  const result =
    await client.query(
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
        )::int
          AS official_position

      FROM users

      WHERE
        role = 'player'
        AND verification_status =
          'verified'
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
        Number(
          player.id,
        ),

      rating:
        Number(
          player.rating,
        ),

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


/*
  ============================================================
  HISTORIAL DE ENFRENTAMIENTOS
  ============================================================
*/

const getHistoricalMeetingsMap = async (
  client,
  userId,
) => {
  const result =
    await client.query(
      `
      SELECT
        CASE
          WHEN player1_id = $1
            THEN player2_id
          ELSE player1_id
        END
          AS opponent_id,

        COUNT(*)::int
          AS meetings

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
      [
        userId,
      ],
    );

  const map =
    new Map();

  for (
    const row of
    result.rows
  ) {
    map.set(
      Number(
        row.opponent_id,
      ),

      Number(
        row.meetings,
      ),
    );
  }

  return map;
};


/*
  ============================================================
  POSICIÓN VIRTUAL DE PROVISIONAL
  ============================================================
*/

const getVirtualPosition = (
  player,
  officialPlayers,
) => {
  const playerRating =
    Number(
      player.rating,
    );

  const playerMatches =
    Number(
      player.matches_played,
    );

  const playerId =
    Number(
      player.id,
    );

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
      Number(
        official.rating,
      );

    const officialMatches =
      Number(
        official.matches_played,
      );

    const officialId =
      Number(
        official.id,
      );

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

  return (
    playersAbove + 1
  );
};


/*
  ============================================================
  POSICIÓN COMPETITIVA
  ============================================================
*/

const getCompetitivePosition = (
  player,
  officialPositionById,
  officialPlayers,
) => {
  const provisional =
    Number(
      player.matches_played,
    ) <
    PLACEMENT_MATCHES;

  if (provisional) {
    return getVirtualPosition(
      player,
      officialPlayers,
    );
  }

  return (
    officialPositionById.get(
      Number(
        player.id,
      ),
    ) ||
    null
  );
};


/*
  ============================================================
  VENTANA DE DESAFÍO POR ACTIVIDAD
  ============================================================

  NUEVA REGLA:

  Desde la posición del desafiante
  recorremos hacia arriba.

  Se habilitan:

  - hasta 3 jugadores ACTIVOS;
  - TODOS los INACTIVOS que aparezcan
    en el camino hasta alcanzar ese
    tercer jugador activo.

  Ejemplo:

  #10 jugador actual

  #9  activo       -> activo 1
  #8  inactivo     -> habilitado
  #7  activo       -> activo 2
  #6  inactivo     -> habilitado
  #5  inactivo     -> habilitado
  #4  activo       -> activo 3
  #3  activo       -> NO habilitado

  Si #7 después pasa a inactivo:

  #9  activo       -> activo 1
  #8  inactivo
  #7  inactivo
  #6  inactivo
  #5  inactivo
  #4  activo       -> activo 2
  #3  activo       -> activo 3

  El desafío pendiente contra #7
  puede seguir existiendo, pero #7
  ya no consume uno de los 3 cupos
  de jugadores activos.

  ============================================================
*/

const buildActiveChallengeWindow = ({
  currentUserId,
  currentCompetitivePosition,
  players,
  competitivePositionById,
  activityById,
}) => {
  const eligibleIds =
    new Set();

  const activeEligibleIds =
    new Set();

  const inactiveEligibleIds =
    new Set();

  if (
    !currentCompetitivePosition
  ) {
    return {
      eligibleIds,
      activeEligibleIds,
      inactiveEligibleIds,

      activeTargets:
        0,

      cutoffCompetitivePosition:
        null,
    };
  }

  /*
    Solamente miramos jugadores
    competitivamente por encima.

    Posición menor = más arriba.
  */

  const candidates =
    players
      .filter(
        (player) => {
          const playerId =
            Number(
              player.id,
            );

          if (
            playerId ===
            currentUserId
          ) {
            return false;
          }

          const position =
            competitivePositionById.get(
              playerId,
            );

          return (
            position !== null &&
            position !== undefined &&
            position <
              currentCompetitivePosition
          );
        },
      )
      .sort(
        (a, b) => {
          const aPosition =
            competitivePositionById.get(
              Number(a.id),
            );

          const bPosition =
            competitivePositionById.get(
              Number(b.id),
            );

          /*
            Desde el desafiante hacia arriba:

            si estamos #10 queremos:
            #9, #8, #7...

            Por eso posición DESC.
          */

          if (
            bPosition !==
            aPosition
          ) {
            return (
              bPosition -
              aPosition
            );
          }

          const ratingDifference =
            Number(
              b.rating,
            ) -
            Number(
              a.rating,
            );

          if (
            ratingDifference !==
            0
          ) {
            return ratingDifference;
          }

          const matchesDifference =
            Number(
              b.matches_played,
            ) -
            Number(
              a.matches_played,
            );

          if (
            matchesDifference !==
            0
          ) {
            return matchesDifference;
          }

          return (
            Number(a.id) -
            Number(b.id)
          );
        },
      );

  let activeTargets = 0;

  let cutoffCompetitivePosition =
    null;

  for (
    const player of
    candidates
  ) {
    if (
      activeTargets >=
      MAX_ACTIVE_CHALLENGE_TARGETS
    ) {
      break;
    }

    const playerId =
      Number(
        player.id,
      );

    const activity =
      activityById.get(
        playerId,
      );

    /*
      Si por alguna razón no pudimos
      calcular actividad, no lo usamos
      como objetivo automático.
    */

    if (!activity) {
      continue;
    }

    eligibleIds.add(
      playerId,
    );

    cutoffCompetitivePosition =
      competitivePositionById.get(
        playerId,
      );

    if (
      activity.inactive
    ) {
      inactiveEligibleIds.add(
        playerId,
      );

      continue;
    }

    activeEligibleIds.add(
      playerId,
    );

    activeTargets += 1;
  }

  return {
    eligibleIds,
    activeEligibleIds,
    inactiveEligibleIds,
    activeTargets,
    cutoffCompetitivePosition,
  };
};


/*
  ============================================================
  DISPONIBILIDAD DE DESAFÍOS
  ============================================================
*/

export const getChallengeAvailability = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  let transactionStarted =
    false;

  try {
    /*
      Primero necesitamos saber
      a qué liga pertenece.
    */

    const initialUserResult =
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

        WHERE
          id = $1
        `,
        [
          req.userId,
        ],
      );

    if (
      !initialUserResult.rowCount
    ) {
      return res.json({
        availability: {},
      });
    }

    const initialUser =
      initialUserResult.rows[0];

    if (
      initialUser.role !==
        "player" ||
      initialUser
        .verification_status !==
        "verified" ||
      !initialUser.gender
    ) {
      return res.json({
        availability: {},
      });
    }

    /*
      Antes de calcular ranking y
      posiciones aplicamos cualquier
      descuento de inactividad pendiente
      de esta liga.

      Así:
      - rating
      - ranking
      - posición competitiva
      - actividad

      quedan sincronizados.
    */

    await client.query(
      "BEGIN",
    );

    transactionStarted =
      true;

    await applyPendingInactivityDecay(
      client,
      {
        city:
          initialUser.city,

        gender:
          initialUser.gender,
      },
    );

    /*
      Recargamos al usuario porque su
      Elo pudo cambiar por inactividad.
    */

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

        WHERE
          id = $1
        `,
        [
          req.userId,
        ],
      );

    if (
      !userResult.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionStarted =
        false;

      return res.json({
        availability: {},
      });
    }

    const currentUser =
      userResult.rows[0];

    const currentUserId =
      Number(
        currentUser.id,
      );

    const currentMatches =
      Number(
        currentUser.matches_played,
      );

    const currentProvisional =
      currentMatches <
      PLACEMENT_MATCHES;

    /*
      Todos los jugadores verificados
      de la liga.

      Seguimos mostrando oficiales y
      provisionales.

      El botón se decide después.
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

          AND verification_status =
            'verified'

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

    const players =
      playersResult.rows;

    /*
      Snapshot de actividad después
      de aplicar los decays.
    */

    const activityById =
      await getPlayerActivityMap(
        client,
        {
          city:
            currentUser.city,

          gender:
            currentUser.gender,
        },
      );

    /*
      Ranking oficial actualizado.
    */

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
        Number(
          player.id,
        ),

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
            ) ||
            null
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
      Posición competitiva de todos.
    */

    const competitivePositionById =
      new Map();

    for (
      const player of
      players
    ) {
      competitivePositionById.set(
        Number(
          player.id,
        ),

        getCompetitivePosition(
          player,
          officialPositionById,
          officialPlayers,
        ),
      );
    }

    /*
      ========================================================
      VENTANA 3 ACTIVOS + INACTIVOS INTERMEDIOS
      ========================================================
    */

    const activeWindow =
      buildActiveChallengeWindow({
        currentUserId,

        currentCompetitivePosition,

        players,

        competitivePositionById,

        activityById,
      });

    /*
      Regla histórica de provisional
      contra provisional:

      sigue permitida.

      Esto no fue cambiado por la nueva
      regla de actividad.

      Los otros cruces dependen de la
      ventana hacia arriba.
    */

    const sportEligibleIds =
      new Set(
        activeWindow.eligibleIds,
      );

    if (
      currentProvisional
    ) {
      for (
        const player of
        players
      ) {
        const playerId =
          Number(
            player.id,
          );

        if (
          playerId ===
          currentUserId
        ) {
          continue;
        }

        const playerProvisional =
          Boolean(
            player.provisional,
          );

        if (
          playerProvisional
        ) {
          sportEligibleIds.add(
            playerId,
          );
        }
      }
    }

    /*
      Historial de enfrentamientos.
    */

    const meetingsByOpponent =
      await getHistoricalMeetingsMap(
        client,
        currentUserId,
      );

    /*
      ========================================================
      RUEDA DEL DESAFIANTE
      ========================================================

      Solamente se compara contra los
      rivales que hoy son deportivamente
      elegibles.

      Si un rival activo pasó a inactivo,
      el rango se amplía automáticamente,
      por lo que la rueda también utiliza
      la nueva ventana.
    */

    let minimumMeetings =
      null;

    for (
      const playerId of
      sportEligibleIds
    ) {
      const meetings =
        meetingsByOpponent.get(
          playerId,
        ) || 0;

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

    /*
      ========================================================
      DESAFÍOS ACTIVOS
      ========================================================
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
        [
          currentUserId,
        ],
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
      IMPORTANTE:

      No contamos "cantidad de desafíos
      activos" para limitar la ventana.

      La ventana se basa en la actividad
      ACTUAL del receptor.

      Por eso si un rival al que ya se le
      envió desafío pasa a INACTIVO,
      automáticamente deja de consumir
      uno de los tres objetivos ACTIVOS.
    */

    /*
      ========================================================
      COOLDOWN DE RECHAZOS
      ========================================================
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
            + INTERVAL '${REJECTION_COOLDOWN_DAYS} days'
            AS available_at

        FROM challenges

        WHERE
          challenger_id = $1

          AND status =
            'rejected'

          AND rejected_at
            IS NOT NULL

        ORDER BY
          challenged_id,
          rejected_at DESC,
          id DESC
        `,
        [
          currentUserId,
        ],
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
      ========================================================
      ÚLTIMO DESAFÍO RESUELTO
      ========================================================
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

          AND resolved_at
            IS NOT NULL

        ORDER BY
          challenged_id,
          resolved_at DESC,
          id DESC
        `,
        [
          currentUserId,
        ],
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

    /*
      ========================================================
      DISPONIBILIDAD FINAL
      ========================================================
    */

    const availability = {};

    for (
      const player of
      players
    ) {
      const playerId =
        Number(
          player.id,
        );

      const playerProvisional =
        Boolean(
          player.provisional,
        );

      const playerCompetitivePosition =
        competitivePositionById.get(
          playerId,
        ) ||
        null;

      const activity =
        activityById.get(
          playerId,
        ) ||
        null;

      const activityData = {
        active:
          activity
            ? activity.active
            : null,

        inactive:
          activity
            ? activity.inactive
            : null,

        last_match_at:
          activity
            ?.last_match_at ||
          null,

        activity_anchor_at:
          activity
            ?.activity_anchor_at ||
          null,

        inactive_days:
          activity
            ?.elapsed_days ??
          null,

        full_inactive_months:
          activity
            ?.full_inactive_months ??
          0,
      };

      /*
        MISMO JUGADOR
      */

      if (
        playerId ===
        currentUserId
      ) {
        availability[player.id] = {
          can_challenge:
            false,

          reason:
            "self",

          message:
            "Este sos vos.",

          competitive_position:
            playerCompetitivePosition,

          ...activityData,
        };

        continue;
      }

      /*
        ======================================================
        REGLA DEPORTIVA
        ======================================================
      */

      if (
        !sportEligibleIds.has(
          playerId,
        )
      ) {
        let message =
          "Este jugador está fuera de tu ventana actual de desafío.";

        if (
          currentProvisional &&
          !playerProvisional
        ) {
          message =
            "Como provisional, podés desafiar a otros provisionales y a los rivales habilitados dentro de la ventana de 3 jugadores activos hacia arriba.";
        } else if (
          !currentProvisional &&
          playerProvisional
        ) {
          message =
            "Este provisional no está dentro de tu ventana competitiva actual de desafío.";
        } else {
          message =
            "Podés desafiar hacia arriba hasta encontrar 3 jugadores activos. Los inactivos que estén en ese recorrido también quedan habilitados.";
        }

        availability[player.id] = {
          can_challenge:
            false,

          reason:
            "ranking_activity_window",

          message,

          competitive_position:
            playerCompetitivePosition,

          current_competitive_position:
            currentCompetitivePosition,

          ...activityData,
        };

        continue;
      }

      /*
        ======================================================
        RUEDA DEL DESAFIANTE
        ======================================================
      */

      const historicalMeetings =
        meetingsByOpponent.get(
          playerId,
        ) || 0;

      if (
        minimumMeetings !==
          null &&
        historicalMeetings >
          minimumMeetings
      ) {
        availability[player.id] = {
          can_challenge:
            false,

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

          ...activityData,
        };

        continue;
      }

      /*
        ======================================================
        YA EXISTE DESAFÍO ACTIVO CON ESTE RIVAL
        ======================================================
      */

      const activeChallenge =
        activeByOpponent.get(
          playerId,
        );

      if (
        activeChallenge
      ) {
        availability[player.id] = {
          can_challenge:
            false,

          reason:
            "active_challenge",

          challenge_id:
            Number(
              activeChallenge.id,
            ),

          challenge_status:
            activeChallenge.status,

          competitive_position:
            playerCompetitivePosition,

          message:
            activeChallenge.status ===
              "accepted"
              ? "Ya tienen un partido confirmado pendiente."
              : activity?.inactive
                ? "Ya existe un desafío pendiente con este jugador. Como ahora está inactivo, ya no ocupa uno de tus 3 cupos de rivales activos."
                : "Ya existe un desafío pendiente entre ustedes.",

          ...activityData,
        };

        continue;
      }

      /*
        ======================================================
        COOLDOWN POR RECHAZO
        ======================================================
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
            can_challenge:
              false,

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

            ...activityData,
          };

          continue;
        }
      }

      /*
        ======================================================
        RUEDA DEL RECEPTOR
        ======================================================
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

              AND c.status =
                'pending'

              AND c.created_at <=
                $3

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

        if (
          waiting.rowCount
        ) {
          availability[player.id] = {
            can_challenge:
              false,

            reason:
              "rotation_wait",

            competitive_position:
              playerCompetitivePosition,

            message:
              `${player.name} todavía tiene rivales anteriores esperando en su rueda.`,

            ...activityData,
          };

          continue;
        }
      }

      /*
        ======================================================
        HABILITADO
        ======================================================
      */

      const isActiveWindowTarget =
        activeWindow
          .activeEligibleIds
          .has(
            playerId,
          );

      const isInactiveWindowTarget =
        activeWindow
          .inactiveEligibleIds
          .has(
            playerId,
          );

      let message =
        "Podés desafiar a este jugador.";

      if (
        currentProvisional &&
        playerProvisional
      ) {
        message =
          activity?.inactive
            ? "Partido de colocación contra otro provisional inactivo."
            : "Partido de colocación contra otro provisional.";
      } else if (
        isInactiveWindowTarget
      ) {
        message =
          "Este jugador está inactivo, pero está dentro del recorrido hacia tus 3 rivales activos habilitados y podés desafiarlo.";
      } else if (
        isActiveWindowTarget
      ) {
        message =
          "Este jugador es uno de los rivales activos habilitados dentro de tu ventana de desafío.";
      }

      availability[player.id] = {
        can_challenge:
          true,

        reason:
          null,

        historical_meetings:
          historicalMeetings,

        competitive_position:
          playerCompetitivePosition,

        current_competitive_position:
          currentCompetitivePosition,

        counts_as_active_target:
          isActiveWindowTarget,

        inactive_in_path:
          isInactiveWindowTarget,

        message,

        ...activityData,
      };
    }

    /*
      Todo quedó consistente:
      - decay
      - ranking
      - actividad
      - disponibilidad
    */

    await client.query(
      "COMMIT",
    );

    transactionStarted =
      false;

    const currentActivity =
      activityById.get(
        currentUserId,
      );

    return res.json({
      placement_matches:
        PLACEMENT_MATCHES,

      max_active_challenge_targets:
        MAX_ACTIVE_CHALLENGE_TARGETS,

      activity_window_days:
        30,

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

        active:
          currentActivity
            ?.active ??
          null,

        inactive:
          currentActivity
            ?.inactive ??
          null,

        last_match_at:
          currentActivity
            ?.last_match_at ||
          null,

        activity_anchor_at:
          currentActivity
            ?.activity_anchor_at ||
          null,

        inactive_days:
          currentActivity
            ?.elapsed_days ??
          null,

        full_inactive_months:
          currentActivity
            ?.full_inactive_months ??
          0,
      },

      challenge_window: {
        active_targets_found:
          activeWindow.activeTargets,

        active_target_limit:
          MAX_ACTIVE_CHALLENGE_TARGETS,

        cutoff_competitive_position:
          activeWindow
            .cutoffCompetitivePosition,

        active_target_ids: [
          ...activeWindow
            .activeEligibleIds,
        ],

        inactive_in_path_ids: [
          ...activeWindow
            .inactiveEligibleIds,
        ],
      },

      rotation: {
        minimum_historical_meetings:
          minimumMeetings,
      },

      availability,
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