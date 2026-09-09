import {
  OFFICIAL_ELO_FLOOR,
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";


export const MATCH_CANCELLATION_PENALTY =
  15;


export class MatchCancellationError
  extends Error {
  constructor(
    message,
    reason =
      "match_cancellation_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchCancellationError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const asNonNegativeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number,
    ) ||
    number < 0
  ) {
    throw new MatchCancellationError(
      `El campo ${field} debe ser un entero no negativo.`,
      "invalid_numeric_value",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const asPositiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number,
    ) ||
    number <= 0
  ) {
    throw new MatchCancellationError(
      `El campo ${field} debe ser un entero positivo.`,
      "invalid_positive_integer",
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const calculateMatchCancellationElo =
  ({
    rating,
    matchesPlayed,
    placementMatches =
      PLACEMENT_MATCHES,
  }) => {
    const currentRating =
      asNonNegativeInteger(
        rating,
        "rating",
      );

    const currentMatches =
      asNonNegativeInteger(
        matchesPlayed,
        "matchesPlayed",
      );

    const requiredPlacementMatches =
      asPositiveInteger(
        placementMatches,
        "placementMatches",
      );

    const provisional =
      currentMatches <
      requiredPlacementMatches;

    let floor;

    if (
      provisional
    ) {
      floor = 0;
    } else if (
      currentRating >=
      OFFICIAL_ELO_FLOOR
    ) {
      floor =
        OFFICIAL_ELO_FLOOR;
    } else {
      floor = 0;
    }

    const eloAfter =
      Math.max(
        floor,
        currentRating -
          MATCH_CANCELLATION_PENALTY,
      );

    let eloChange =
      eloAfter -
      currentRating;

    /*
      Evitamos -0 porque después termina
      llegando a auditorías/eventos JSON.
    */

    if (
      Object.is(
        eloChange,
        -0,
      )
    ) {
      eloChange = 0;
    }

    const effectivePenalty =
      Math.abs(
        eloChange,
      );

    if (
      !Number.isInteger(
        eloAfter,
      ) ||
      eloAfter < 0
    ) {
      throw new MatchCancellationError(
        "La penalización produjo un Elo inválido.",
        "invalid_cancellation_elo",
        {
          currentRating,
          eloAfter,
        },
      );
    }

    if (
      eloChange > 0
    ) {
      throw new MatchCancellationError(
        "Una penalización por cancelación no puede aumentar Elo.",
        "cancellation_increased_elo",
        {
          currentRating,
          eloAfter,
          eloChange,
        },
      );
    }

    if (
      effectivePenalty >
      MATCH_CANCELLATION_PENALTY
    ) {
      throw new MatchCancellationError(
        "La penalización efectiva superó la penalización configurada.",
        "cancellation_penalty_exceeded",
        {
          configuredPenalty:
            MATCH_CANCELLATION_PENALTY,

          effectivePenalty,

          currentRating,

          eloAfter,
        },
      );
    }

    return {
      elo_before:
        currentRating,

      elo_change:
        eloChange,

      elo_after:
        eloAfter,

      provisional,

      matches_played:
        currentMatches,

      placement_matches:
        requiredPlacementMatches,

      floor,

      configured_penalty:
        MATCH_CANCELLATION_PENALTY,

      effective_penalty:
        effectivePenalty,
    };
  };


export default {
  MATCH_CANCELLATION_PENALTY,
  calculateMatchCancellationElo,
};