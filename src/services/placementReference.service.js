import {
  PLACEMENT_MATCHES,
  calculatePlacementPercentile,
  normalizePercentile,
} from "./placementLevel.service.js";

import {
  getPlayerPlacementCalculationEvidence,
} from "./placementEvidence.service.js";

import {
  getOfficialRanking,
} from "./rankingOrder.service.js";


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
    typeof client.query !==
      "function"
  ) {
    throw new PlacementReferenceError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const normalizePlayer = (
  player,
) => {
  if (
    !player ||
    typeof player !==
      "object" ||
    Array.isArray(player)
  ) {
    throw new PlacementReferenceError(
      "Jugador inválido.",
      "invalid_player",
    );
  }

  const id =
    Number(
      player.id,
    );

  const matchesPlayed =
    Number(
      player
        .matches_played,
    );

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new PlacementReferenceError(
      "ID de jugador inválido.",
      "invalid_player_id",
    );
  }

  if (
    !Number.isInteger(
      matchesPlayed,
    ) ||
    matchesPlayed < 0
  ) {
    throw new PlacementReferenceError(
      "matches_played inválido.",
      "invalid_matches_played",
      {
        user_id:
          id,

        matches_played:
          player
            .matches_played,
      },
    );
  }

  if (
    !player.city ||
    !player.gender
  ) {
    throw new PlacementReferenceError(
      "El jugador no tiene liga válida.",
      "player_league_missing",
      {
        user_id:
          id,

        city:
          player.city ??
          null,

        gender:
          player.gender ??
          null,
      },
    );
  }

  return {
    ...player,

    id,

    matches_played:
      matchesPlayed,

    provisional:
      matchesPlayed <
      PLACEMENT_MATCHES,
  };
};


/*
  ============================================================
  POSICIÓN OFICIAL -> PERCENTIL
  ============================================================

  Fórmula actual:

    ((N - position) / (N - 1)) * 100

  Ejemplo con 20 oficiales:

    #1  -> 100%
    #10 -> 52.63%
    #11 -> 47.37%
    #20 -> 0%

  Con un solo jugador oficial:

    #1 -> 100%

  Esta conversión representa la posición deportiva
  dentro del universo oficial de la liga.
  ============================================================
*/

export const getOfficialPositionPercentile =
  ({
    position,
    officialPlayerCount,
  }) => {
    const normalizedPosition =
      Number(
        position,
      );

    const normalizedCount =
      Number(
        officialPlayerCount,
      );

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
        "La posición oficial supera la cantidad de jugadores.",
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
      ) *
      100;

    return normalizePercentile(
      percentile,
    );
  };


/*
  ============================================================
  REFERENCIA DE RIVAL OFICIAL
  ============================================================
*/

export const getOfficialOpponentReference =
  async (
    client,
    opponent,
  ) => {
    assertClient(
      client,
    );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
      );

    const ranking =
      await getOfficialRanking(
        client,
        {
          city:
            normalizedOpponent.city,

          gender:
            normalizedOpponent.gender,
        },
      );

    const officialPlayer =
      ranking.find(
        (player) =>
          Number(
            player.id,
          ) ===
          normalizedOpponent.id,
      );

    if (
      !officialPlayer
    ) {
      throw new PlacementReferenceError(
        "El rival figura como oficial pero no aparece en el ranking oficial.",
        "official_opponent_not_ranked",
        {
          opponent_id:
            normalizedOpponent.id,

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
        officialPlayer
          .position ??
        officialPlayer
          .rank_position,
      );

    if (
      !Number.isInteger(
        position,
      ) ||
      position < 1
    ) {
      throw new PlacementReferenceError(
        "El ranking oficial no devolvió una posición válida.",
        "official_position_missing",
        {
          opponent_id:
            normalizedOpponent.id,

          ranking_row:
            officialPlayer,
        },
      );
    }

    const percentile =
      getOfficialPositionPercentile({
        position,

        officialPlayerCount:
          ranking.length,
      });

    return {
      opponent_id:
        normalizedOpponent.id,

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


/*
  ============================================================
  REFERENCIA DE RIVAL PROVISIONAL
  ============================================================

  REGLA CERRADA:

  El provisional vale exactamente el nivel que YA demostró
  con sus victorias anteriores.

  No existe descuento extra por ser provisional.

  Si no ganó ningún partido:
    vale 0%.

  Si demostró 68%:
    vale 68%.

  El partido actual todavía no existe en la evidencia,
  por lo que no puede inflar su propia referencia.
  ============================================================
*/

export const getProvisionalOpponentReference =
  async (
    client,
    opponent,
  ) => {
    assertClient(
      client,
    );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
      );

    const evidence =
      await getPlayerPlacementCalculationEvidence(
        client,
        normalizedOpponent.id,
      );

    if (
      evidence.length >=
      PLACEMENT_MATCHES
    ) {
      throw new PlacementReferenceError(
        "El rival figura como provisional pero ya posee cinco evidencias nivelatorias.",
        "provisional_state_inconsistent",
        {
          opponent_id:
            normalizedOpponent.id,

          matches_played:
            normalizedOpponent
              .matches_played,

          evidence_count:
            evidence.length,
        },
      );
    }

    if (
      evidence.length !==
      normalizedOpponent
        .matches_played
    ) {
      throw new PlacementReferenceError(
        "El historial nivelatorio del rival provisional está desincronizado.",
        "provisional_evidence_out_of_sync",
        {
          opponent_id:
            normalizedOpponent.id,

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

    /*
      También guardamos cuántos oficiales existían
      al momento del partido para auditoría.

      Esa cantidad NO altera el percentil demostrado
      del provisional.
    */

    const officialRanking =
      await getOfficialRanking(
        client,
        {
          city:
            normalizedOpponent.city,

          gender:
            normalizedOpponent.gender,
        },
      );

    return {
      opponent_id:
        normalizedOpponent.id,

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
          placement
            .matches_played,

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
          placement
            .win_factor,

        placement_percentile:
          placement
            .placement_percentile,
      },
    };
  };


/*
  ============================================================
  SELECTOR GENERAL
  ============================================================
*/

export const getPlacementOpponentReference =
  async (
    client,
    opponent,
  ) => {
    assertClient(
      client,
    );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
      );

    if (
      normalizedOpponent
        .provisional
    ) {
      return getProvisionalOpponentReference(
        client,
        normalizedOpponent,
      );
    }

    return getOfficialOpponentReference(
      client,
      normalizedOpponent,
    );
  };