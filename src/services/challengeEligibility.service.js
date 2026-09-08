import {
  getPlayerActivityMap,
} from "./playerActivity.service.js";


/*
  ============================================================
  CONFIGURACIÓN
  ============================================================
*/

export const PLACEMENT_MATCHES = 5;

export const MAX_ACTIVE_CHALLENGE_TARGETS =
  3;


/*
  ============================================================
  ERROR
  ============================================================
*/

export class ChallengeEligibilityError extends Error {
  constructor(
    message,
    reason = "challenge_eligibility_error",
    details = null,
  ) {
    super(message);

    this.name =
      "ChallengeEligibilityError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  HELPERS
  ============================================================
*/

const normalizeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    throw new ChallengeEligibilityError(
      `${field} debe ser un entero.`,
      "invalid_integer",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const normalizePlayer = (
  player,
  label,
) => {
  if (
    !player ||
    typeof player !==
      "object"
  ) {
    throw new ChallengeEligibilityError(
      `${label} inválido.`,
      "invalid_player",
      {
        label,
      },
    );
  }

  const id =
    normalizeInteger(
      player.id,
      `${label}.id`,
    );

  const rating =
    Number(
      player.rating,
    );

  const matchesPlayed =
    normalizeInteger(
      player.matches_played,
      `${label}.matches_played`,
    );

  if (
    id <= 0 ||
    !Number.isFinite(rating) ||
    rating < 0 ||
    matchesPlayed < 0
  ) {
    throw new ChallengeEligibilityError(
      `Datos inválidos en ${label}.`,
      "invalid_player_data",
      {
        label,
        id,
        rating,
        matches_played:
          matchesPlayed,
      },
    );
  }

  return {
    ...player,

    id,

    rating,

    matches_played:
      matchesPlayed,

    provisional:
      matchesPlayed <
      PLACEMENT_MATCHES,
  };
};


/*
  ============================================================
  RANKING OFICIAL
  ============================================================
*/

export const getOfficialRanking = async (
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
    (row) => ({
      ...row,

      id:
        Number(
          row.id,
        ),

      rating:
        Number(
          row.rating,
        ),

      matches_played:
        Number(
          row.matches_played,
        ),

      official_position:
        Number(
          row.official_position,
        ),

      provisional:
        false,
    }),
  );
};


/*
  ============================================================
  POSICIÓN OFICIAL
  ============================================================
*/

export const getOfficialPositionFromRanking = (
  player,
  officialRanking,
) => {
  if (!player) {
    return null;
  }

  if (
    Number(
      player.matches_played,
    ) <
    PLACEMENT_MATCHES
  ) {
    return null;
  }

  const row =
    officialRanking.find(
      (rankingPlayer) =>
        Number(
          rankingPlayer.id,
        ) ===
        Number(
          player.id,
        ),
    );

  return row
    ? Number(
        row.official_position,
      )
    : null;
};


/*
  ============================================================
  POSICIÓN VIRTUAL DEL PROVISIONAL
  ============================================================

  El provisional NO recibe puesto oficial.

  Para desafíos se lo inserta
  virtualmente dentro del ranking oficial
  usando:

  1. Elo
  2. partidos jugados
  3. id

  La posición virtual solamente sirve
  para reglas competitivas.
  ============================================================
*/

export const getVirtualPositionFromRanking = (
  player,
  officialRanking,
) => {
  if (!player) {
    return null;
  }

  const playerId =
    Number(
      player.id,
    );

  const playerRating =
    Number(
      player.rating,
    );

  const playerMatches =
    Number(
      player.matches_played,
    );

  if (
    !Number.isInteger(
      playerId,
    ) ||
    !Number.isFinite(
      playerRating,
    ) ||
    !Number.isInteger(
      playerMatches,
    ) ||
    playerMatches < 0
  ) {
    return null;
  }

  let playersAbove = 0;

  for (
    const official of
    officialRanking
  ) {
    const officialId =
      Number(
        official.id,
      );

    const officialRating =
      Number(
        official.rating,
      );

    const officialMatches =
      Number(
        official.matches_played,
      );

    const above =
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

    if (above) {
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

export const getCompetitivePosition = (
  player,
  officialRanking,
) => {
  if (!player) {
    return null;
  }

  const provisional =
    Number(
      player.matches_played,
    ) <
    PLACEMENT_MATCHES;

  if (provisional) {
    return getVirtualPositionFromRanking(
      player,
      officialRanking,
    );
  }

  return getOfficialPositionFromRanking(
    player,
    officialRanking,
  );
};


/*
  ============================================================
  JUGADORES DE LA LIGA
  ============================================================
*/

export const getLeaguePlayers = async (
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
        phone,
        city,
        gender,
        rating,
        matches_played,
        verification_status,
        role,

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
        rating DESC,
        matches_played DESC,
        id ASC
      `,
      [
        city,
        gender,
        PLACEMENT_MATCHES,
      ],
    );

  return result.rows.map(
    (row) => ({
      ...row,

      id:
        Number(
          row.id,
        ),

      rating:
        Number(
          row.rating,
        ),

      matches_played:
        Number(
          row.matches_played,
        ),

      provisional:
        Boolean(
          row.provisional,
        ),
    }),
  );
};


/*
  ============================================================
  POSICIONES COMPETITIVAS DE TODA LA LIGA
  ============================================================
*/

export const buildCompetitivePositions = (
  players,
  officialRanking,
) => {
  const map =
    new Map();

  for (
    const player of
    players
  ) {
    map.set(
      Number(
        player.id,
      ),

      getCompetitivePosition(
        player,
        officialRanking,
      ),
    );
  }

  return map;
};


/*
  ============================================================
  VENTANA:
  3 ACTIVOS + TODOS LOS INACTIVOS DEL CAMINO
  ============================================================

  Ejemplo:

  desafiante #10

  #9 activo     => activo 1
  #8 inactivo   => habilitado
  #7 activo     => activo 2
  #6 inactivo   => habilitado
  #5 inactivo   => habilitado
  #4 activo     => activo 3
  #3 activo     => fuera de ventana

  No se saltean los inactivos.

  Los inactivos encontrados antes de
  llegar al tercer activo son parte
  de la ventana.
  ============================================================
*/

export const buildActivityChallengeWindow = ({
  challenger,
  players,
  officialRanking,
  activityById,
}) => {
  const normalizedChallenger =
    normalizePlayer(
      challenger,
      "challenger",
    );

  const challengerCompetitivePosition =
    getCompetitivePosition(
      normalizedChallenger,
      officialRanking,
    );

  const competitivePositionById =
    buildCompetitivePositions(
      players,
      officialRanking,
    );

  const eligibleIds =
    new Set();

  const activeIds =
    new Set();

  const inactiveIds =
    new Set();

  if (
    !challengerCompetitivePosition
  ) {
    return {
      challengerCompetitivePosition:
        null,

      competitivePositionById,

      eligibleIds,

      activeIds,

      inactiveIds,

      activeCount:
        0,

      cutoffCompetitivePosition:
        null,
    };
  }

  /*
    Solo candidatos ubicados por encima.

    Posición menor = mejor puesto.

    Recorremos desde el más cercano
    hacia arriba:

    si desafiante = #10:
    #9 -> #8 -> #7...
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
            normalizedChallenger.id
          ) {
            return false;
          }

          const position =
            competitivePositionById.get(
              playerId,
            );

          return (
            Number.isInteger(
              position,
            ) &&
            position <
              challengerCompetitivePosition
          );
        },
      )
      .sort(
        (a, b) => {
          const aPosition =
            competitivePositionById.get(
              Number(
                a.id,
              ),
            );

          const bPosition =
            competitivePositionById.get(
              Number(
                b.id,
              ),
            );

          if (
            aPosition !==
            bPosition
          ) {
            /*
              #9 debe aparecer antes
              que #8 si desafiante es #10.

              DESC por número de posición.
            */

            return (
              bPosition -
              aPosition
            );
          }

          /*
            Puede haber provisionales
            compartiendo posición virtual.

            Desempatamos con el mismo
            criterio competitivo.
          */

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
            Number(
              a.id,
            ) -
            Number(
              b.id,
            )
          );
        },
      );

  let activeCount = 0;

  let cutoffCompetitivePosition =
    null;

  for (
    const candidate of
    candidates
  ) {
    if (
      activeCount >=
      MAX_ACTIVE_CHALLENGE_TARGETS
    ) {
      break;
    }

    const candidateId =
      Number(
        candidate.id,
      );

    const activity =
      activityById.get(
        candidateId,
      );

    /*
      Sin información confiable de
      actividad no lo contamos como
      elegible.

      Nunca asumimos activo por defecto.
    */

    if (!activity) {
      continue;
    }

    eligibleIds.add(
      candidateId,
    );

    cutoffCompetitivePosition =
      competitivePositionById.get(
        candidateId,
      );

    if (
      activity.inactive
    ) {
      inactiveIds.add(
        candidateId,
      );

      continue;
    }

    activeIds.add(
      candidateId,
    );

    activeCount += 1;
  }

  return {
    challengerCompetitivePosition,

    competitivePositionById,

    eligibleIds,

    activeIds,

    inactiveIds,

    activeCount,

    cutoffCompetitivePosition,
  };
};


/*
  ============================================================
  CONTEXTO COMPLETO DE ELEGIBILIDAD
  ============================================================

  Este es el método central.

  Debe ser usado tanto por:

  - availability;
  - createChallenge.

  De esta manera la UI y la protección
  real del backend usan la misma regla.
  ============================================================
*/

export const getChallengeEligibilityContext =
  async (
    client,
    challenger,
  ) => {
    const normalizedChallenger =
      normalizePlayer(
        challenger,
        "challenger",
      );

    if (
      !normalizedChallenger.city ||
      !normalizedChallenger.gender
    ) {
      throw new ChallengeEligibilityError(
        "El desafiante no posee ciudad o liga válidas.",
        "challenger_league_missing",
        {
          challenger_id:
            normalizedChallenger.id,
        },
      );
    }

    const [
      officialRanking,
      players,
      activityById,
    ] =
      await Promise.all([
        getOfficialRanking(
          client,
          normalizedChallenger.city,
          normalizedChallenger.gender,
        ),

        getLeaguePlayers(
          client,
          normalizedChallenger.city,
          normalizedChallenger.gender,
        ),

        getPlayerActivityMap(
          client,
          {
            city:
              normalizedChallenger.city,

            gender:
              normalizedChallenger.gender,
          },
        ),
      ]);

    const window =
      buildActivityChallengeWindow({
        challenger:
          normalizedChallenger,

        players,

        officialRanking,

        activityById,
      });

    /*
      Regla previa que seguimos
      preservando:

      provisional vs provisional
      está permitido.

      Esta excepción se agrega a la
      ventana activa sin quitar la
      lógica de 3 activos para el resto.
    */

    const sportEligibleIds =
      new Set(
        window.eligibleIds,
      );

    if (
      normalizedChallenger.provisional
    ) {
      for (
        const player of
        players
      ) {
        if (
          Number(
            player.id,
          ) ===
          normalizedChallenger.id
        ) {
          continue;
        }

        if (
          Boolean(
            player.provisional,
          )
        ) {
          sportEligibleIds.add(
            Number(
              player.id,
            ),
          );
        }
      }
    }

    const challengerOfficialPosition =
      getOfficialPositionFromRanking(
        normalizedChallenger,
        officialRanking,
      );

    const challengerVirtualPosition =
      normalizedChallenger.provisional
        ? window
            .challengerCompetitivePosition
        : null;

    return {
      challenger:
        normalizedChallenger,

      officialRanking,

      players,

      activityById,

      competitivePositionById:
        window
          .competitivePositionById,

      challengerOfficialPosition,

      challengerVirtualPosition,

      challengerCompetitivePosition:
        window
          .challengerCompetitivePosition,

      sportEligibleIds,

      activeEligibleIds:
        window.activeIds,

      inactiveEligibleIds:
        window.inactiveIds,

      activeTargetsFound:
        window.activeCount,

      cutoffCompetitivePosition:
        window
          .cutoffCompetitivePosition,
    };
  };


/*
  ============================================================
  VALIDAR UN RIVAL CONCRETO
  ============================================================
*/

export const validateChallengeSportEligibility =
  async (
    client,
    challenger,
    challenged,
  ) => {
    const normalizedChallenger =
      normalizePlayer(
        challenger,
        "challenger",
      );

    const normalizedChallenged =
      normalizePlayer(
        challenged,
        "challenged",
      );

    if (
      normalizedChallenger.id ===
      normalizedChallenged.id
    ) {
      return {
        allowed:
          false,

        reason:
          "self",

        message:
          "No podés desafiarte a vos mismo.",
      };
    }

    if (
      normalizedChallenger.city !==
      normalizedChallenged.city
    ) {
      return {
        allowed:
          false,

        reason:
          "different_city",

        message:
          "Solo podés desafiar jugadores de tu misma ciudad.",
      };
    }

    if (
      normalizedChallenger.gender !==
      normalizedChallenged.gender
    ) {
      return {
        allowed:
          false,

        reason:
          "different_league",

        message:
          "Solo podés desafiar jugadores de tu misma liga.",
      };
    }

    const context =
      await getChallengeEligibilityContext(
        client,
        normalizedChallenger,
      );

    const challengedCompetitivePosition =
      context
        .competitivePositionById
        .get(
          normalizedChallenged.id,
        ) ??
      null;

    const challengedOfficialPosition =
      getOfficialPositionFromRanking(
        normalizedChallenged,
        context.officialRanking,
      );

    const challengedVirtualPosition =
      normalizedChallenged
        .provisional
        ? challengedCompetitivePosition
        : null;

    const challengedActivity =
      context.activityById.get(
        normalizedChallenged.id,
      ) ||
      null;

    const provisionalVsProvisional =
      normalizedChallenger
        .provisional &&
      normalizedChallenged
        .provisional;

    const withinActivityWindow =
      context
        .sportEligibleIds
        .has(
          normalizedChallenged.id,
        );

    if (
      !withinActivityWindow
    ) {
      return {
        allowed:
          false,

        reason:
          "ranking_activity_window",

        message:
          normalizedChallenger
            .provisional
            ? "Como provisional, podés desafiar a otros provisionales y a los rivales comprendidos en la ventana de hasta 3 jugadores activos hacia arriba, incluyendo los inactivos intermedios."
            : "Podés desafiar hacia arriba hasta encontrar 3 jugadores activos. Todos los jugadores inactivos que aparezcan en ese recorrido también están habilitados.",

        challengerPosition:
          context
            .challengerOfficialPosition,

        challengedPosition:
          challengedOfficialPosition,

        challengerCompetitivePosition:
          context
            .challengerCompetitivePosition,

        challengedCompetitivePosition,

        challengerVirtualPosition:
          context
            .challengerVirtualPosition,

        challengedVirtualPosition,

        challengedActive:
          challengedActivity
            ?.active ??
          null,

        challengedInactive:
          challengedActivity
            ?.inactive ??
          null,

        provisionalVsProvisional,

        context,
      };
    }

    const countsAsActiveTarget =
      context
        .activeEligibleIds
        .has(
          normalizedChallenged.id,
        );

    const inactiveInPath =
      context
        .inactiveEligibleIds
        .has(
          normalizedChallenged.id,
        );

    return {
      allowed:
        true,

      reason:
        null,

      message:
        provisionalVsProvisional
          ? "Desafío provisional contra provisional habilitado."
          : inactiveInPath
            ? "Rival inactivo habilitado dentro del recorrido hacia los 3 rivales activos."
            : "Rival habilitado dentro de la ventana competitiva.",

      challengerPosition:
        context
          .challengerOfficialPosition,

      challengedPosition:
        challengedOfficialPosition,

      challengerCompetitivePosition:
        context
          .challengerCompetitivePosition,

      challengedCompetitivePosition,

      challengerVirtualPosition:
        context
          .challengerVirtualPosition,

      challengedVirtualPosition,

      challengedActive:
        challengedActivity
          ?.active ??
        null,

      challengedInactive:
        challengedActivity
          ?.inactive ??
        null,

      countsAsActiveTarget,

      inactiveInPath,

      provisionalVsProvisional,

      activeTargetsFound:
        context
          .activeTargetsFound,

      cutoffCompetitivePosition:
        context
          .cutoffCompetitivePosition,

      context,
    };
  };


/*
  ============================================================
  LISTA DE RIVALES DEPORTIVAMENTE HABILITADOS
  ============================================================

  Se usa para la rueda histórica.

  IMPORTANTE:
  la rueda solo compara rivales que
  hoy son legalmente desafiables por
  la regla deportiva.
  ============================================================
*/

export const getSportEligibleOpponents =
  async (
    client,
    challenger,
  ) => {
    const context =
      await getChallengeEligibilityContext(
        client,
        challenger,
      );

    return context.players
      .filter(
        (player) =>
          context
            .sportEligibleIds
            .has(
              Number(
                player.id,
              ),
            ),
      )
      .map(
        (player) => {
          const playerId =
            Number(
              player.id,
            );

          const activity =
            context
              .activityById
              .get(
                playerId,
              ) ||
            null;

          return {
            ...player,

            competitive_position:
              context
                .competitivePositionById
                .get(
                  playerId,
                ) ??
              null,

            active:
              activity
                ?.active ??
              null,

            inactive:
              activity
                ?.inactive ??
              null,

            counts_as_active_target:
              context
                .activeEligibleIds
                .has(
                  playerId,
                ),

            inactive_in_path:
              context
                .inactiveEligibleIds
                .has(
                  playerId,
                ),
          };
        },
      );
  };