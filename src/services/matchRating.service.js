/*
  ============================================================
  LA RED
  POLÍTICA DE ELO DE PARTIDOS
  ============================================================

  Este servicio NO escribe en PostgreSQL.

  Su responsabilidad es decidir exclusivamente:

  - Elo antes;
  - Elo después;
  - delta;
  - tipo de cálculo.

  Esto permite usar la misma política desde:

  - matches.controllers.js;
  - replay;
  - tests;
  - auditorías futuras.

  REGLAS ACTUALES:

  PROVISIONAL
  -----------
  Primeros 5 partidos.

  #1 a #4:
  - no acumulan Elo;
  - rating permanece igual.

  #5:
  - recibe target_elo calculado
    por el sistema de placement.

  OFICIAL
  -------
  - K32 normal contra oficial;
  - si gana a provisional:
      K32 normal;
  - si pierde contra provisional:
      penalización especial vigente
      del 12%, mínimo 200,
      máximo 300.

  PISO
  ----
  - oficial normal: 100;
  - oficial que ya estaba debajo de 100:
      puede seguir bajando hasta 0;
  - provisional: no se fuerza a 100.

  IMPORTANTE:
  La regla especial de derrota de un oficial
  contra provisional se conserva porque todavía
  no fue reemplazada por una nueva regla de negocio.
  ============================================================
*/


import {
  PLACEMENT_MATCHES,
  OFFICIAL_ELO_FLOOR,
} from "./placementLevel.service.js";


export const NORMAL_ELO_K =
  32;

export const RANKED_LOSS_TO_PROVISIONAL_MIN =
  200;

export const RANKED_LOSS_TO_PROVISIONAL_PERCENT =
  0.12;

export const RANKED_LOSS_TO_PROVISIONAL_MAX =
  300;


/*
  ============================================================
  ERROR
  ============================================================
*/

export class MatchRatingError extends Error {
  constructor(
    message,
    reason = "match_rating_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchRatingError";

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

const finiteNumber = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    throw new MatchRatingError(
      `${field} debe ser un número válido.`,
      "invalid_rating_number",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const integerNumber = (
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
    throw new MatchRatingError(
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


export const isPlacementRatingPlayer = (
  player,
) => {
  if (
    !player ||
    typeof player !==
      "object"
  ) {
    throw new MatchRatingError(
      "Jugador inválido.",
      "invalid_player",
    );
  }

  const matchesPlayed =
    integerNumber(
      player.matches_played,
      "player.matches_played",
    );

  if (
    matchesPlayed < 0
  ) {
    throw new MatchRatingError(
      "matches_played no puede ser negativo.",
      "invalid_matches_played",
      {
        matches_played:
          matchesPlayed,
      },
    );
  }

  return (
    matchesPlayed <
    PLACEMENT_MATCHES
  );
};


/*
  ============================================================
  EXPECTED SCORE
  ============================================================
*/

export const expectedScore = (
  ownRating,
  opponentRating,
) => {
  const own =
    finiteNumber(
      ownRating,
      "ownRating",
    );

  const opponent =
    finiteNumber(
      opponentRating,
      "opponentRating",
    );

  return (
    1 /
    (
      1 +
      10 **
        (
          (
            opponent -
            own
          ) /
          400
        )
    )
  );
};


/*
  ============================================================
  K32 NORMAL
  ============================================================
*/

export const calculateNormalEloChange = ({
  ownRating,
  opponentRating,
  won,
}) => {
  if (
    typeof won !==
    "boolean"
  ) {
    throw new MatchRatingError(
      "won debe ser boolean.",
      "invalid_result",
    );
  }

  const expected =
    expectedScore(
      ownRating,
      opponentRating,
    );

  return Math.round(
    NORMAL_ELO_K *
      (
        (
          won
            ? 1
            : 0
        ) -
        expected
      ),
  );
};


/*
  ============================================================
  DERROTA DE OFICIAL CONTRA PROVISIONAL
  ============================================================
*/

export const getRankedLossToProvisionalPenalty = (
  rating,
) => {
  const normalizedRating =
    finiteNumber(
      rating,
      "rating",
    );

  const percentage =
    Math.round(
      normalizedRating *
        RANKED_LOSS_TO_PROVISIONAL_PERCENT,
    );

  return Math.min(
    RANKED_LOSS_TO_PROVISIONAL_MAX,

    Math.max(
      RANKED_LOSS_TO_PROVISIONAL_MIN,
      percentage,
    ),
  );
};


/*
  ============================================================
  PISO DE OFICIAL
  ============================================================
*/

export const getOfficialLossFloor = (
  rating,
) => {
  const normalizedRating =
    finiteNumber(
      rating,
      "rating",
    );

  /*
    Si ya estaba oficialmente por debajo
    de 100 debido a una regla histórica
    válida, no lo "subimos" artificialmente
    a 100 al perder.

    En ese caso el piso es 0.
  */

  return (
    normalizedRating >=
    OFFICIAL_ELO_FLOOR
      ? OFFICIAL_ELO_FLOOR
      : 0
  );
};


/*
  ============================================================
  RESULTADO DE OFICIAL
  ============================================================
*/

export const calculateOfficialMatchRating = ({
  player,
  opponent,
  won,
}) => {
  if (
    !player ||
    !opponent
  ) {
    throw new MatchRatingError(
      "Faltan jugadores para calcular Elo.",
      "players_missing",
    );
  }

  if (
    typeof won !==
    "boolean"
  ) {
    throw new MatchRatingError(
      "won debe ser boolean.",
      "invalid_result",
    );
  }

  if (
    isPlacementRatingPlayer(
      player,
    )
  ) {
    throw new MatchRatingError(
      "calculateOfficialMatchRating no acepta jugadores provisionales.",
      "player_is_provisional",
      {
        player_id:
          player.id ??
          null,
      },
    );
  }

  const rating =
    finiteNumber(
      player.rating,
      "player.rating",
    );

  const opponentRating =
    finiteNumber(
      opponent.rating,
      "opponent.rating",
    );

  const opponentProvisional =
    isPlacementRatingPlayer(
      opponent,
    );

  if (won) {
    const delta =
      calculateNormalEloChange({
        ownRating:
          rating,

        opponentRating,

        won:
          true,
      });

    const ratingAfter =
      Math.max(
        OFFICIAL_ELO_FLOOR,
        rating +
          delta,
      );

    return {
      provisional:
        false,

      rating_before:
        rating,

      rating_after:
        ratingAfter,

      elo_change:
        ratingAfter -
        rating,

      calculation:
        opponentProvisional
          ? "ranked_beats_placement"
          : "normal_ranked",

      special_provisional_penalty:
        null,
    };
  }

  if (
    opponentProvisional
  ) {
    const penalty =
      getRankedLossToProvisionalPenalty(
        rating,
      );

    const ratingAfter =
      Math.max(
        getOfficialLossFloor(
          rating,
        ),
        rating -
          penalty,
      );

    return {
      provisional:
        false,

      rating_before:
        rating,

      rating_after:
        ratingAfter,

      elo_change:
        ratingAfter -
        rating,

      calculation:
        "ranked_loses_to_placement",

      special_provisional_penalty:
        penalty,
    };
  }

  const delta =
    calculateNormalEloChange({
      ownRating:
        rating,

      opponentRating,

      won:
        false,
    });

  const ratingAfter =
    Math.max(
      getOfficialLossFloor(
        rating,
      ),
      rating +
        delta,
    );

  return {
    provisional:
      false,

    rating_before:
      rating,

    rating_after:
      ratingAfter,

    elo_change:
      ratingAfter -
        rating,

    calculation:
      "normal_ranked",

    special_provisional_penalty:
      null,
  };
};


/*
  ============================================================
  RESULTADO DE PROVISIONAL
  ============================================================

  placementResult debe ser el resultado producido por
  placementMatch.service.js DESPUÉS de registrar
  la evidencia del partido.

  Partidos 1..4:
    rating no cambia.

  Partido 5:
    placementResult.completed === true
    y target_elo debe existir.
  ============================================================
*/

export const calculatePlacementMatchRating = ({
  player,
  placementResult,
}) => {
  if (
    !player ||
    typeof player !==
      "object"
  ) {
    throw new MatchRatingError(
      "Jugador provisional inválido.",
      "invalid_player",
    );
  }

  if (
    !isPlacementRatingPlayer(
      player,
    )
  ) {
    throw new MatchRatingError(
      "El jugador ya no es provisional.",
      "player_not_provisional",
      {
        player_id:
          player.id ??
          null,
      },
    );
  }

  if (
    !placementResult ||
    typeof placementResult !==
      "object"
  ) {
    throw new MatchRatingError(
      "Falta el resultado de placement.",
      "placement_result_missing",
      {
        player_id:
          player.id ??
          null,
      },
    );
  }

  if (
    placementResult.applies !==
    true
  ) {
    throw new MatchRatingError(
      "El resultado recibido no corresponde a placement.",
      "placement_result_not_applicable",
      {
        player_id:
          player.id ??
          null,
      },
    );
  }

  const ratingBefore =
    finiteNumber(
      player.rating,
      "player.rating",
    );

  const matchesBefore =
    integerNumber(
      player.matches_played,
      "player.matches_played",
    );

  const expectedMatchNumber =
    matchesBefore + 1;

  const actualMatchNumber =
    integerNumber(
      placementResult
        .placement_match_number,
      "placementResult.placement_match_number",
    );

  if (
    actualMatchNumber !==
    expectedMatchNumber
  ) {
    throw new MatchRatingError(
      "El resultado de placement no corresponde al siguiente partido del jugador.",
      "placement_match_number_mismatch",
      {
        player_id:
          player.id ??
          null,

        matches_before:
          matchesBefore,

        expected_match_number:
          expectedMatchNumber,

        actual_match_number:
          actualMatchNumber,
      },
    );
  }

  if (
    actualMatchNumber <
      PLACEMENT_MATCHES
  ) {
    if (
      placementResult.completed ===
      true
    ) {
      throw new MatchRatingError(
        "Un placement no puede estar completo antes del quinto partido.",
        "placement_completed_too_early",
        {
          placement_match_number:
            actualMatchNumber,
        },
      );
    }

    return {
      provisional:
        true,

      placement_completed:
        false,

      placement_match_number:
        actualMatchNumber,

      rating_before:
        ratingBefore,

      rating_after:
        ratingBefore,

      elo_change:
        0,

      calculation:
        "placement_in_progress",

      target_elo:
        null,
    };
  }

  if (
    actualMatchNumber !==
    PLACEMENT_MATCHES
  ) {
    throw new MatchRatingError(
      "Número de nivelatorio inválido.",
      "invalid_placement_match_number",
      {
        placement_match_number:
          actualMatchNumber,
      },
    );
  }

  if (
    placementResult.completed !==
    true
  ) {
    throw new MatchRatingError(
      "El quinto partido debe completar el placement.",
      "fifth_placement_not_completed",
      {
        player_id:
          player.id ??
          null,
      },
    );
  }

  const targetElo =
    finiteNumber(
      placementResult.target_elo,
      "placementResult.target_elo",
    );

  if (
    targetElo <
    OFFICIAL_ELO_FLOOR
  ) {
    throw new MatchRatingError(
      `El Elo final de placement no puede quedar debajo de ${OFFICIAL_ELO_FLOOR}.`,
      "placement_target_below_floor",
      {
        target_elo:
          targetElo,
      },
    );
  }

  return {
    provisional:
      true,

    placement_completed:
      true,

    placement_match_number:
      actualMatchNumber,

    rating_before:
      ratingBefore,

    rating_after:
      targetElo,

    elo_change:
      targetElo -
      ratingBefore,

    calculation:
      "placement_completed",

    target_elo:
      targetElo,
  };
};


/*
  ============================================================
  POLÍTICA ÚNICA POR JUGADOR
  ============================================================
*/

export const calculatePlayerMatchRating = ({
  player,
  opponent,
  won,
  placementResult = null,
}) => {
  if (
    isPlacementRatingPlayer(
      player,
    )
  ) {
    return calculatePlacementMatchRating({
      player,
      placementResult,
    });
  }

  return calculateOfficialMatchRating({
    player,
    opponent,
    won,
  });
};