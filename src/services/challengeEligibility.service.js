import {
  getPlayerActivityMap,
} from "./playerActivity.service.js";

import {
  PLACEMENT_MATCHES,
  placementPercentileToTargetPosition,
} from "./placementLevel.service.js";

import {
  getCurrentPlacementLevel,
} from "./placementMatch.service.js";

import {
  getOfficialRanking,
} from "./rankingOrder.service.js";


/*
  ============================================================
  LA RED
  ELEGIBILIDAD DE DESAFÍOS
  ============================================================

  REGLAS CENTRALES:

  OFICIALES
  - usan su posición real del ranking.

  PROVISIONALES
  - NO se ordenan por Elo 0;
  - NO se ordenan por cantidad de partidos;
  - su posición competitiva se estima a partir de su
    placement_percentile demostrado;
  - esa posición es solamente virtual;
  - no consume una posición oficial.

  ALCANCE
  - se recorre hacia arriba desde la posición competitiva
    del desafiante;
  - se habilitan hasta encontrar 3 jugadores ACTIVOS;
  - todos los INACTIVOS encontrados antes del tercer activo
    también son desafiables;
  - un inactivo no consume uno de los 3 lugares activos.

  PROVISIONAL VS PROVISIONAL
  - sigue permitido;
  - cada provisional vale el nivel que ya demostró.
  ============================================================
*/


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
    reason =
      "challenge_eligibility_error",
    details =
      null,
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
    !Number.isInteger(
      number,
    )
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
      "object" ||
    Array.isArray(player)
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
      player
        .matches_played,
      `${label}.matches_played`,
    );

  if (
    id <= 0 ||
    !Number.isFinite(
      rating,
    ) ||
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


const compareStrings = (
  a,
  b,
) =>
  String(
    a ?? "",
  ).localeCompare(
    String(
      b ?? "",
    ),
    "es",
    {
      sensitivity:
        "base",
    },
  );


/*
  ============================================================
  JUGADORES DE LA LIGA
  ============================================================
*/

export const getLeaguePlayers =
  async (
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
          first_name,
          last_name,
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
          id ASC
        `,
        [
          city,
          gender,
          PLACEMENT_MATCHES,
        ],
      );

    return result.rows.map(
      (
        row,
      ) => ({
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
            row
              .matches_played,
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
  POSICIÓN OFICIAL
  ============================================================
*/

export const getOfficialPositionFromRanking =
  (
    player,
    officialRanking,
  ) => {
    if (!player) {
      return null;
    }

    if (
      Number(
        player
          .matches_played,
      ) <
      PLACEMENT_MATCHES
    ) {
      return null;
    }

    const row =
      officialRanking.find(
        (
          rankingPlayer,
        ) =>
          Number(
            rankingPlayer.id,
          ) ===
          Number(
            player.id,
          ),
      );

    if (!row) {
      return null;
    }

    const position =
      Number(
        row
          .official_position ??
        row.position ??
        row.rank_position,
      );

    return Number.isInteger(
      position,
    )
      ? position
      : null;
  };


/*
  ============================================================
  NIVEL ACTUAL DE LOS PROVISIONALES
  ============================================================
*/

export const buildPlacementLevelMap =
  async (
    client,
    players,
  ) => {
    const map =
      new Map();

    const provisionalPlayers =
      players.filter(
        (
          player,
        ) =>
          Number(
            player
              .matches_played,
          ) <
          PLACEMENT_MATCHES,
      );

    for (
      const player of
      provisionalPlayers
    ) {
      const level =
        await getCurrentPlacementLevel(
          client,
          player.id,
        );

      /*
        Protección de consistencia.

        No queremos posicionar un provisional
        con evidence 2/5 si users.matches_played
        dice 3/5.
      */

      if (
        Number(
          level
            .matches_played,
        ) !==
        Number(
          player
            .matches_played,
        )
      ) {
        throw new ChallengeEligibilityError(
          "El historial nivelatorio del jugador está desincronizado.",
          "placement_evidence_out_of_sync",
          {
            user_id:
              Number(
                player.id,
              ),

            matches_played:
              Number(
                player
                  .matches_played,
              ),

            evidence_count:
              Number(
                level
                  .matches_played,
              ),
          },
        );
      }

      map.set(
        Number(
          player.id,
        ),
        level,
      );
    }

    return map;
  };


/*
  ============================================================
  POSICIÓN VIRTUAL DEL PROVISIONAL
  ============================================================

  Ya NO utiliza:

  - rating;
  - matches_played como fuerza;
  - Elo provisional.

  Usa placement_percentile demostrado.

  Ejemplo:

  percentil 70%
      ↓
  zona competitiva aproximadamente top 30%
      ↓
  posición virtual calculada respecto de los oficiales.

  Un provisional todavía NO aparece como puesto oficial.
  ============================================================
*/

export const getVirtualPositionFromRanking =
  (
    player,
    officialRanking,
    placementLevelById,
  ) => {
    if (!player) {
      return null;
    }

    if (
      Number(
        player
          .matches_played,
      ) >=
      PLACEMENT_MATCHES
    ) {
      return null;
    }

    const level =
      placementLevelById.get(
        Number(
          player.id,
        ),
      );

    if (!level) {
      return null;
    }

    const placementPercentile =
      Number(
        level
          .placement_percentile,
      );

    if (
      !Number.isFinite(
        placementPercentile,
      )
    ) {
      return null;
    }

    const placement =
      placementPercentileToTargetPosition({
        placementPercentile,

        officialPlayerCount:
          officialRanking.length,
      });

    return Number(
      placement
        .target_position,
    );
  };


/*
  ============================================================
  POSICIÓN COMPETITIVA
  ============================================================
*/

export const getCompetitivePosition =
  (
    player,
    officialRanking,
    placementLevelById =
      new Map(),
  ) => {
    if (!player) {
      return null;
    }

    const provisional =
      Number(
        player
          .matches_played,
      ) <
      PLACEMENT_MATCHES;

    if (
      provisional
    ) {
      return getVirtualPositionFromRanking(
        player,
        officialRanking,
        placementLevelById,
      );
    }

    return getOfficialPositionFromRanking(
      player,
      officialRanking,
    );
  };


/*
  ============================================================
  POSICIONES COMPETITIVAS
  ============================================================
*/

export const buildCompetitivePositions =
  (
    players,
    officialRanking,
    placementLevelById =
      new Map(),
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
          placementLevelById,
        ),
      );
    }

    return map;
  };


/*
  ============================================================
  ORDEN CUANDO DOS JUGADORES COMPARTEN ZONA VIRTUAL
  ============================================================

  La posición virtual puede coincidir.

  Para provisionales usamos primero el nivel demostrado.

  Si el nivel es idéntico:
  - mejor balance W-L;
  - apellido;
  - nombre;
  - id.

  Los oficiales conservan su puesto oficial exacto.
  ============================================================
*/

const compareCompetitiveCandidates =
  (
    a,
    b,
    competitivePositionById,
    placementLevelById,
  ) => {
    const aId =
      Number(
        a.id,
      );

    const bId =
      Number(
        b.id,
      );

    const aPosition =
      competitivePositionById.get(
        aId,
      );

    const bPosition =
      competitivePositionById.get(
        bId,
      );

    /*
      Recorremos desde el rival más cercano
      hacia arriba.

      #9 antes que #8 para desafiante #10.
    */

    if (
      aPosition !==
      bPosition
    ) {
      return (
        bPosition -
        aPosition
      );
    }

    const aProvisional =
      Boolean(
        a.provisional,
      );

    const bProvisional =
      Boolean(
        b.provisional,
      );

    /*
      Si un provisional tiene exactamente la zona
      de un oficial, lo consideramos insertado antes
      de ese puesto oficial.

      Ejemplo:
      target_position = 7
      significa virtualmente "zona #7".
    */

    if (
      aProvisional !==
      bProvisional
    ) {
      return aProvisional
        ? -1
        : 1;
    }

    if (
      aProvisional &&
      bProvisional
    ) {
      const aLevel =
        placementLevelById.get(
          aId,
        );

      const bLevel =
        placementLevelById.get(
          bId,
        );

      const percentileDifference =
        Number(
          bLevel
            ?.placement_percentile ??
          0,
        ) -
        Number(
          aLevel
            ?.placement_percentile ??
          0,
        );

      if (
        percentileDifference !==
        0
      ) {
        return percentileDifference;
      }

      const aBalance =
        Number(
          aLevel?.wins ??
          0,
        ) -
        Number(
          aLevel?.losses ??
          0,
        );

      const bBalance =
        Number(
          bLevel?.wins ??
          0,
        ) -
        Number(
          bLevel?.losses ??
          0,
        );

      if (
        aBalance !==
        bBalance
      ) {
        return (
          bBalance -
          aBalance
        );
      }
    }

    const lastNameDifference =
      compareStrings(
        a.last_name,
        b.last_name,
      );

    if (
      lastNameDifference !==
      0
    ) {
      return lastNameDifference;
    }

    const firstNameDifference =
      compareStrings(
        a.first_name ??
          a.name,
        b.first_name ??
          b.name,
      );

    if (
      firstNameDifference !==
      0
    ) {
      return firstNameDifference;
    }

    return (
      aId -
      bId
    );
  };


/*
  ============================================================
  VENTANA:
  3 ACTIVOS + TODOS LOS INACTIVOS DEL CAMINO
  ============================================================

  Ejemplo:

  desafiante #10

  #9 activo
  #8 inactivo
  #7 activo
  #6 inactivo
  #5 inactivo
  #4 activo
  ----------------
  corte

  Habilitados:
  #9 #8 #7 #6 #5 #4

  Activos consumidos:
  3

  Inactivos:
  no consumen cupo.
  ============================================================
*/

export const buildActivityChallengeWindow =
  ({
    challenger,
    players,
    officialRanking,
    placementLevelById,
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
        placementLevelById,
      );

    const competitivePositionById =
      buildCompetitivePositions(
        players,
        officialRanking,
        placementLevelById,
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

    const candidates =
      players
        .filter(
          (
            player,
          ) => {
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
          (
            a,
            b,
          ) =>
            compareCompetitiveCandidates(
              a,
              b,
              competitivePositionById,
              placementLevelById,
            ),
        );

    let activeCount =
      0;

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
        Si no conocemos la actividad,
        no habilitamos silenciosamente.
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
  CONTEXTO CENTRAL
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

    /*
      Primero necesitamos ranking y jugadores.

      Después calculamos placement de los provisionales.
      Activity puede cargarse en paralelo.
    */

    const [
      officialRanking,
      players,
      activityById,
    ] =
      await Promise.all([
        getOfficialRanking(
          client,
          {
            city:
              normalizedChallenger.city,

            gender:
              normalizedChallenger.gender,
          },
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

    const placementLevelById =
      await buildPlacementLevelMap(
        client,
        players,
      );

    const window =
      buildActivityChallengeWindow({
        challenger:
          normalizedChallenger,

        players,

        officialRanking,

        placementLevelById,

        activityById,
      });

    /*
      PROVISIONAL VS PROVISIONAL

      Sigue permitido.

      No quitamos jugadores de la ventana normal.
      Sumamos los otros provisionales de la liga como
      candidatos deportivos.
    */

    const sportEligibleIds =
      new Set(
        window
          .eligibleIds,
      );

    if (
      normalizedChallenger
        .provisional
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
            playerId,
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
      normalizedChallenger
        .provisional
        ? window
            .challengerCompetitivePosition
        : null;

    return {
      challenger:
        normalizedChallenger,

      officialRanking,

      players,

      activityById,

      placementLevelById,

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
        window
          .activeIds,

      inactiveEligibleIds:
        window
          .inactiveIds,

      activeTargetsFound:
        window
          .activeCount,

      cutoffCompetitivePosition:
        window
          .cutoffCompetitivePosition,
    };
  };


/*
  ============================================================
  VALIDAR RIVAL CONCRETO
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
        context
          .officialRanking,
      );

    const challengedVirtualPosition =
      normalizedChallenged
        .provisional
        ? challengedCompetitivePosition
        : null;

    const challengedActivity =
      context
        .activityById
        .get(
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
  RIVALES DEPORTIVAMENTE HABILITADOS
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

    return context
      .players
      .filter(
        (
          player,
        ) =>
          context
            .sportEligibleIds
            .has(
              Number(
                player.id,
              ),
            ),
      )
      .map(
        (
          player,
        ) => {
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

          const placement =
            context
              .placementLevelById
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

            placement_percentile:
              placement
                ?.placement_percentile ??
              null,

            placement_wins:
              placement
                ?.wins ??
              null,

            placement_losses:
              placement
                ?.losses ??
              null,

            placement_matches:
              placement
                ?.matches_played ??
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