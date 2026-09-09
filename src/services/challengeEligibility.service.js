import {
  PLACEMENT_MATCHES,
  placementPercentileToTargetPosition,
} from "./placementLevel.service.js";

import {
  getCurrentPlacementLevel,
} from "./placementMatch.service.js";

import {
  getOfficialCompetitionRanking,
} from "./competitionRanking.service.js";


export const MAX_ACTIVE_CHALLENGE_TARGETS = 3;


export class ChallengeEligibilityError extends Error {
  constructor(
    message,
    reason = "challenge_eligibility_error",
    details = null,
  ) {
    super(message);

    this.name = "ChallengeEligibilityError";
    this.reason = reason;
    this.details = details;
  }
}


const assertClient = (client) => {
  if (
    !client ||
    typeof client.query !== "function"
  ) {
    throw new ChallengeEligibilityError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const positiveInteger = (
  value,
  field,
) => {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new ChallengeEligibilityError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const compareStrings = (
  a,
  b,
) =>
  String(a ?? "").localeCompare(
    String(b ?? ""),
    "es",
    {
      sensitivity: "base",
    },
  );


const normalizePlayer = (
  player,
  label,
  competitionId,
) => {
  if (
    !player ||
    typeof player !== "object" ||
    Array.isArray(player)
  ) {
    throw new ChallengeEligibilityError(
      `${label} inválido.`,
      "invalid_player",
    );
  }

  const normalizedCompetitionId =
    positiveInteger(
      competitionId,
      "competitionId",
    );

  const id =
    positiveInteger(
      player.id,
      `${label}.id`,
    );

  const playerCompetitionId =
    player.competition_id ===
      undefined ||
    player.competition_id ===
      null
      ? normalizedCompetitionId
      : positiveInteger(
          player.competition_id,
          `${label}.competition_id`,
        );

  if (
    playerCompetitionId !==
    normalizedCompetitionId
  ) {
    throw new ChallengeEligibilityError(
      `${label} pertenece a otra competición.`,
      "player_competition_mismatch",
      {
        user_id: id,
        expected_competition_id:
          normalizedCompetitionId,
        received_competition_id:
          playerCompetitionId,
      },
    );
  }

  const rating =
    Number(
      player.rating ?? 0,
    );

  const matchesPlayed =
    Number(
      player.matches_played ?? 0,
    );

  if (
    !Number.isFinite(rating) ||
    rating < 0 ||
    !Number.isInteger(
      matchesPlayed,
    ) ||
    matchesPlayed < 0
  ) {
    throw new ChallengeEligibilityError(
      `Datos inválidos en ${label}.`,
      "invalid_player_data",
      {
        user_id: id,
        rating,
        matches_played:
          matchesPlayed,
      },
    );
  }

  return {
    ...player,

    id,

    competition_id:
      normalizedCompetitionId,

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
  JUGADORES DE UNA COMPETICIÓN
  ============================================================

  Ya no leemos users.rating/users.matches_played.

  Cada jugador usa:
    player_competition_stats.rating
    player_competition_stats.matches_played
    etc.

  Por lo tanto singles y dobles son independientes.
  ============================================================
*/

export const getCompetitionChallengePlayers =
  async (
    client,
    competitionId,
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          u.id,
          u.name,
          u.first_name,
          u.last_name,
          u.phone,
          u.city,
          u.gender,
          u.verification_status,
          u.role,

          c.id AS competition_id,
          c.format,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.team_size,
          c.placement_matches,

          COALESCE(
            pcs.rating,
            0
          )::int AS rating,

          COALESCE(
            pcs.matches_played,
            0
          )::int AS matches_played,

          COALESCE(
            pcs.wins,
            0
          )::int AS wins,

          COALESCE(
            pcs.losses,
            0
          )::int AS losses,

          COALESCE(
            pcs.games_won,
            0
          )::int AS games_won,

          COALESCE(
            pcs.games_lost,
            0
          )::int AS games_lost

        FROM users u

        JOIN competitions c
          ON c.id = $1

        LEFT JOIN player_competition_stats pcs
          ON pcs.user_id = u.id
          AND pcs.competition_id = c.id

        WHERE
          u.role = 'player'

          AND u.verification_status =
            'verified'

          AND u.city =
            c.city

          AND u.gender =
            c.gender

          AND c.active = TRUE

        ORDER BY
          u.id ASC
        `,
        [
          normalizedCompetitionId,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          Number(row.id),

        competition_id:
          Number(
            row.competition_id,
          ),

        team_size:
          Number(
            row.team_size,
          ),

        placement_matches:
          Number(
            row.placement_matches,
          ),

        rating:
          Number(
            row.rating,
          ),

        matches_played:
          Number(
            row.matches_played,
          ),

        wins:
          Number(
            row.wins,
          ),

        losses:
          Number(
            row.losses,
          ),

        games_won:
          Number(
            row.games_won,
          ),

        games_lost:
          Number(
            row.games_lost,
          ),

        provisional:
          Number(
            row.matches_played,
          ) <
          Number(
            row.placement_matches,
          ),
      }),
    );
  };


/*
  ============================================================
  ACTIVIDAD POR COMPETICIÓN
  ============================================================

  La actividad se calcula usando partidos de ESA competición.

  Un jugador puede estar activo en singles e inactivo en dobles.
  ============================================================
*/

export const getCompetitionActivityMap =
  async (
    client,
    competitionId,
    players,
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          mp.user_id,

          MAX(
            COALESCE(
              m.completed_at,
              m.updated_at,
              m.created_at
            )
          ) AS last_match_at

        FROM match_participants mp

        JOIN matches m
          ON m.id =
            mp.match_id

        WHERE
          m.competition_id = $1

          AND m.status =
            'completed'

        GROUP BY
          mp.user_id
        `,
        [
          normalizedCompetitionId,
        ],
      );

    const lastMatchById =
      new Map(
        result.rows.map(
          (row) => [
            Number(
              row.user_id,
            ),
            row.last_match_at
              ? new Date(
                  row.last_match_at,
                )
              : null,
          ],
        ),
      );

    const now =
      Date.now();

    const thirtyDaysMs =
      30 *
      24 *
      60 *
      60 *
      1000;

    const map =
      new Map();

    for (
      const player of
      players
    ) {
      const playerId =
        Number(
          player.id,
        );

      const lastMatchAt =
        lastMatchById.get(
          playerId,
        ) ?? null;

      /*
        Sin partido en esta competición:
        lo consideramos activo mientras está habilitado
        para competir.

        El decay histórico se sigue manejando en su servicio
        específico; acá solamente necesitamos construir
        la ventana deportiva de desafíos.
      */

      const inactive =
        lastMatchAt !== null &&
        (
          now -
          lastMatchAt.getTime()
        ) >
        thirtyDaysMs;

      map.set(
        playerId,
        {
          user_id:
            playerId,

          competition_id:
            normalizedCompetitionId,

          last_match_at:
            lastMatchAt,

          active:
            !inactive,

          inactive,
        },
      );
    }

    return map;
  };


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

    if (!row) {
      return null;
    }

    const position =
      Number(
        row.official_position ??
        row.position ??
        row.rank_position,
      );

    return Number.isInteger(
      position,
    )
      ? position
      : null;
  };


export const buildPlacementLevelMap =
  async (
    client,
    players,
    competitionId,
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const map =
      new Map();

    const provisionalPlayers =
      players.filter(
        (player) =>
          Number(
            player.matches_played,
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
          normalizedCompetitionId,
        );

      if (
        Number(
          level.matches_played,
        ) !==
        Number(
          player.matches_played,
        )
      ) {
        throw new ChallengeEligibilityError(
          "El historial nivelatorio del jugador está desincronizado dentro de la competición.",
          "placement_evidence_out_of_sync",
          {
            user_id:
              Number(
                player.id,
              ),

            competition_id:
              normalizedCompetitionId,

            matches_played:
              Number(
                player.matches_played,
              ),

            evidence_count:
              Number(
                level.matches_played,
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
        player.matches_played,
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
      placement.target_position,
    );
  };


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
        player.matches_played,
      ) <
      PLACEMENT_MATCHES;

    if (provisional) {
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


const compareCompetitiveCandidates =
  (
    a,
    b,
    competitivePositionById,
    placementLevelById,
  ) => {
    const aId =
      Number(a.id);

    const bId =
      Number(b.id);

    const aPosition =
      competitivePositionById.get(
        aId,
      );

    const bPosition =
      competitivePositionById.get(
        bId,
      );

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
          aLevel?.wins ?? 0,
        ) -
        Number(
          aLevel?.losses ?? 0,
        );

      const bBalance =
        Number(
          bLevel?.wins ?? 0,
        ) -
        Number(
          bLevel?.losses ?? 0,
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

    return aId - bId;
  };


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
        challenger
          .competition_id,
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

        activeCount: 0,

        cutoffCompetitivePosition:
          null,
      };
    }

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
          (a, b) =>
            compareCompetitiveCandidates(
              a,
              b,
              competitivePositionById,
              placementLevelById,
            ),
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


export const getChallengeEligibilityContext =
  async (
    client,
    challenger,
    competitionId,
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const players =
      await getCompetitionChallengePlayers(
        client,
        normalizedCompetitionId,
      );

    const normalizedChallengerInput =
      normalizePlayer(
        challenger,
        "challenger",
        normalizedCompetitionId,
      );

    const challengerFromCompetition =
      players.find(
        (player) =>
          Number(
            player.id,
          ) ===
          normalizedChallengerInput.id,
      );

    if (
      !challengerFromCompetition
    ) {
      throw new ChallengeEligibilityError(
        "El desafiante no pertenece a esta competición.",
        "challenger_not_in_competition",
        {
          challenger_id:
            normalizedChallengerInput.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const normalizedChallenger =
      normalizePlayer(
        challengerFromCompetition,
        "challenger",
        normalizedCompetitionId,
      );

    const [
      officialRanking,
      activityById,
    ] =
      await Promise.all([
        getOfficialCompetitionRanking(
          client,
          normalizedCompetitionId,
        ),

        getCompetitionActivityMap(
          client,
          normalizedCompetitionId,
          players,
        ),
      ]);

    const placementLevelById =
      await buildPlacementLevelMap(
        client,
        players,
        normalizedCompetitionId,
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

    const sportEligibleIds =
      new Set(
        window.eligibleIds,
      );

    /*
      Provisional vs provisional sigue permitido,
      pero únicamente dentro de la misma competición.
    */

    if (
      normalizedChallenger.provisional
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
      normalizedChallenger.provisional
        ? window
            .challengerCompetitivePosition
        : null;

    return {
      competition_id:
        normalizedCompetitionId,

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


export const validateChallengeSportEligibility =
  async (
    client,
    challenger,
    challenged,
    competitionId,
  ) => {
    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallenger =
      normalizePlayer(
        challenger,
        "challenger",
        normalizedCompetitionId,
      );

    const normalizedChallenged =
      normalizePlayer(
        challenged,
        "challenged",
        normalizedCompetitionId,
      );

    if (
      normalizedChallenger.id ===
      normalizedChallenged.id
    ) {
      return {
        allowed: false,
        reason: "self",
        message:
          "No podés desafiarte a vos mismo.",
      };
    }

    const context =
      await getChallengeEligibilityContext(
        client,
        normalizedChallenger,
        normalizedCompetitionId,
      );

    const challengedFromCompetition =
      context.players.find(
        (player) =>
          Number(
            player.id,
          ) ===
          normalizedChallenged.id,
      );

    if (
      !challengedFromCompetition
    ) {
      return {
        allowed: false,

        reason:
          "different_competition",

        message:
          "Solo podés desafiar jugadores de la misma competición.",

        competition_id:
          normalizedCompetitionId,
      };
    }

    const challengedCompetitivePosition =
      context
        .competitivePositionById
        .get(
          normalizedChallenged.id,
        ) ??
      null;

    const challengedOfficialPosition =
      getOfficialPositionFromRanking(
        challengedFromCompetition,
        context.officialRanking,
      );

    const challengedVirtualPosition =
      challengedFromCompetition
        .provisional
        ? challengedCompetitivePosition
        : null;

    const challengedActivity =
      context
        .activityById
        .get(
          normalizedChallenged.id,
        ) ??
      null;

    const provisionalVsProvisional =
      normalizedChallenger
        .provisional &&
      challengedFromCompetition
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
        allowed: false,

        reason:
          "ranking_activity_window",

        message:
          normalizedChallenger
            .provisional
            ? "Como provisional, podés desafiar a otros provisionales de esta competición y a los rivales habilitados por la ventana competitiva."
            : "Podés desafiar hacia arriba hasta encontrar 3 jugadores activos de esta competición, incluyendo los inactivos intermedios.",

        competition_id:
          normalizedCompetitionId,

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
      allowed: true,

      reason: null,

      message:
        provisionalVsProvisional
          ? "Desafío provisional contra provisional habilitado dentro de la competición."
          : inactiveInPath
            ? "Rival inactivo habilitado dentro del recorrido competitivo."
            : "Rival habilitado dentro de la ventana competitiva.",

      competition_id:
        normalizedCompetitionId,

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


export const getSportEligibleOpponents =
  async (
    client,
    challenger,
    competitionId,
  ) => {
    const context =
      await getChallengeEligibilityContext(
        client,
        challenger,
        competitionId,
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
              ) ??
            null;

          const placement =
            context
              .placementLevelById
              .get(
                playerId,
              ) ??
            null;

          return {
            ...player,

            competition_id:
              context
                .competition_id,

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
              placement?.wins ??
              null,

            placement_losses:
              placement?.losses ??
              null,

            placement_matches:
              placement
                ?.matches_played ??
              null,

            active:
              activity?.active ??
              null,

            inactive:
              activity?.inactive ??
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