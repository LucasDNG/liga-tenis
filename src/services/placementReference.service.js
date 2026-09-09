import {
  PLACEMENT_MATCHES,
  calculatePlacementPercentile,
  normalizePercentile,
} from "./placementLevel.service.js";

import {
  getPlayerPlacementCalculationEvidence,
} from "./placementEvidence.service.js";

import {
  getOfficialCompetitionRanking,
} from "./competitionRanking.service.js";


export class PlacementReferenceError extends Error {
  constructor(
    message,
    reason = "placement_reference_error",
    details = null,
  ) {
    super(message);

    this.name =
      "PlacementReferenceError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !== "function"
  ) {
    throw new PlacementReferenceError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const toPositiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new PlacementReferenceError(
      `${field} debe ser un entero positivo.`,
      "invalid_positive_integer",
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
  competitionId,
) => {
  if (
    !player ||
    typeof player !== "object" ||
    Array.isArray(player)
  ) {
    throw new PlacementReferenceError(
      "Jugador inválido.",
      "invalid_player",
    );
  }

  const id =
    toPositiveInteger(
      player.id,
      "player.id",
    );

  const normalizedCompetitionId =
    toPositiveInteger(
      competitionId,
      "competitionId",
    );

  const playerCompetitionId =
    player.competition_id === undefined ||
    player.competition_id === null
      ? normalizedCompetitionId
      : toPositiveInteger(
          player.competition_id,
          "player.competition_id",
        );

  if (
    playerCompetitionId !==
    normalizedCompetitionId
  ) {
    throw new PlacementReferenceError(
      "El jugador pertenece a otra competición.",
      "player_competition_mismatch",
      {
        user_id:
          id,

        expected_competition_id:
          normalizedCompetitionId,

        received_competition_id:
          playerCompetitionId,
      },
    );
  }

  const matchesPlayed =
    Number(
      player.matches_played ?? 0,
    );

  if (
    !Number.isInteger(matchesPlayed) ||
    matchesPlayed < 0
  ) {
    throw new PlacementReferenceError(
      "matches_played inválido.",
      "invalid_matches_played",
      {
        user_id:
          id,

        matches_played:
          player.matches_played,
      },
    );
  }

  const placementMatches =
    Number(
      player.placement_matches ??
      PLACEMENT_MATCHES,
    );

  if (
    !Number.isInteger(placementMatches) ||
    placementMatches !==
      PLACEMENT_MATCHES
  ) {
    throw new PlacementReferenceError(
      "La competición debe utilizar cinco partidos nivelatorios.",
      "invalid_placement_match_count",
      {
        user_id:
          id,

        competition_id:
          normalizedCompetitionId,

        placement_matches:
          placementMatches,
      },
    );
  }

  return {
    ...player,

    id,

    competition_id:
      normalizedCompetitionId,

    matches_played:
      matchesPlayed,

    placement_matches:
      placementMatches,

    provisional:
      matchesPlayed <
      placementMatches,
  };
};


export const getOfficialPositionPercentile =
  ({
    position,
    officialPlayerCount,
  }) => {
    const normalizedPosition =
      Number(position);

    const normalizedCount =
      Number(officialPlayerCount);

    if (
      !Number.isInteger(
        normalizedPosition,
      ) ||
      normalizedPosition < 1
    ) {
      throw new PlacementReferenceError(
        "Posición oficial inválida.",
        "invalid_official_position",
        {
          position,
        },
      );
    }

    if (
      !Number.isInteger(
        normalizedCount,
      ) ||
      normalizedCount < 1
    ) {
      throw new PlacementReferenceError(
        "Cantidad de jugadores oficiales inválida.",
        "invalid_official_player_count",
        {
          official_player_count:
            officialPlayerCount,
        },
      );
    }

    if (
      normalizedPosition >
      normalizedCount
    ) {
      throw new PlacementReferenceError(
        "La posición supera la cantidad de jugadores oficiales.",
        "official_position_out_of_range",
        {
          position:
            normalizedPosition,

          official_player_count:
            normalizedCount,
        },
      );
    }

    if (
      normalizedCount === 1
    ) {
      return 100;
    }

    const percentile =
      (
        (
          normalizedCount -
          normalizedPosition
        ) /
        (
          normalizedCount -
          1
        )
      ) * 100;

    return normalizePercentile(
      percentile,
    );
  };


export const getOfficialOpponentReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        normalizedCompetitionId,
      );

    if (
      normalizedOpponent.provisional
    ) {
      throw new PlacementReferenceError(
        "El rival todavía es provisional en esta competición.",
        "opponent_not_official",
        {
          opponent_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const ranking =
      await getOfficialCompetitionRanking(
        client,
        normalizedCompetitionId,
      );

    const officialPlayer =
      ranking.find(
        (player) =>
          Number(player.id) ===
          normalizedOpponent.id,
      );

    if (!officialPlayer) {
      throw new PlacementReferenceError(
        "El rival figura como oficial pero no aparece en el ranking de esta competición.",
        "official_opponent_not_ranked",
        {
          opponent_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,

          matches_played:
            normalizedOpponent
              .matches_played,
        },
      );
    }

    const position =
      Number(
        officialPlayer
          .official_position ??
        officialPlayer.position,
      );

    const percentile =
      getOfficialPositionPercentile({
        position,

        officialPlayerCount:
          ranking.length,
      });

    return {
      opponent_id:
        normalizedOpponent.id,

      competition_id:
        normalizedCompetitionId,

      opponent_reference_type:
        "official",

      opponent_percentile_at_match:
        percentile,

      opponent_rank_position_at_match:
        position,

      official_player_count_at_match:
        ranking.length,

      provisional:
        false,
    };
  };


export const getProvisionalOpponentReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        normalizedCompetitionId,
      );

    if (
      !normalizedOpponent.provisional
    ) {
      throw new PlacementReferenceError(
        "El rival ya es oficial en esta competición.",
        "opponent_not_provisional",
        {
          opponent_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const evidence =
      await getPlayerPlacementCalculationEvidence(
        client,
        normalizedOpponent.id,
        normalizedCompetitionId,
      );

    if (
      evidence.length >=
      PLACEMENT_MATCHES
    ) {
      throw new PlacementReferenceError(
        "El rival figura como provisional pero ya posee cinco evidencias en esta competición.",
        "provisional_state_inconsistent",
        {
          opponent_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,

          evidence_count:
            evidence.length,
        },
      );
    }

    if (
      evidence.length !==
      normalizedOpponent.matches_played
    ) {
      throw new PlacementReferenceError(
        "El historial nivelatorio del rival está desincronizado dentro de la competición.",
        "provisional_evidence_out_of_sync",
        {
          opponent_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,

          matches_played:
            normalizedOpponent
              .matches_played,

          evidence_count:
            evidence.length,
        },
      );
    }

    const placement =
      calculatePlacementPercentile({
        evidence,
      });

    const officialRanking =
      await getOfficialCompetitionRanking(
        client,
        normalizedCompetitionId,
      );

    return {
      opponent_id:
        normalizedOpponent.id,

      competition_id:
        normalizedCompetitionId,

      opponent_reference_type:
        "provisional",

      opponent_percentile_at_match:
        normalizePercentile(
          placement
            .placement_percentile,
        ),

      opponent_rank_position_at_match:
        null,

      official_player_count_at_match:
        officialRanking.length,

      provisional:
        true,

      demonstrated: {
        matches_played:
          placement.matches_played,

        wins:
          placement.wins,

        losses:
          placement.losses,

        weighted_victory_percentile:
          placement
            .weighted_victory_percentile,

        demonstrated_level:
          placement
            .demonstrated_level,

        win_factor:
          placement.win_factor,

        placement_percentile:
          placement
            .placement_percentile,
      },
    };
  };


export const getPlacementOpponentReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        normalizedCompetitionId,
      );

    if (
      normalizedOpponent.provisional
    ) {
      return getProvisionalOpponentReference(
        client,
        {
          opponent:
            normalizedOpponent,

          competitionId:
            normalizedCompetitionId,
        },
      );
    }

    return getOfficialOpponentReference(
      client,
      {
        opponent:
          normalizedOpponent,

        competitionId:
          normalizedCompetitionId,
      },
    );
  };