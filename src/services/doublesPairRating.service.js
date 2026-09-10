export const DOUBLES_INITIAL_ELO =
  0;

export const DOUBLES_OFFICIAL_K =
  32;

export const DEFAULT_PLACEMENT_MATCHES =
  5;

export const OFFICIAL_ELO_FLOOR =
  100;


export class DoublesPairRatingError
  extends Error {
  constructor(
    message,
    reason =
      "doubles_pair_rating_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "DoublesPairRatingError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


const integerAtLeastZero = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    throw new DoublesPairRatingError(
      `${field} debe ser un entero mayor o igual a 0.`,
      "invalid_rating_input",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const positiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new DoublesPairRatingError(
      `${field} debe ser un entero positivo.`,
      "invalid_rating_input",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const isProvisionalPair = ({
  matchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
}) => {
  const matches =
    integerAtLeastZero(
      matchesPlayed,
      "matchesPlayed",
    );

  const placement =
    positiveInteger(
      placementMatches,
      "placementMatches",
    );

  return (
    matches <
    placement
  );
};


export const expectedScore = (
  ownRating,
  opponentRating,
) => {
  const own =
    integerAtLeastZero(
      ownRating,
      "ownRating",
    );

  const opponent =
    integerAtLeastZero(
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


export const getOfficialPairRatingFloor = (
  rating,
) => {
  const normalizedRating =
    integerAtLeastZero(
      rating,
      "rating",
    );

  return (
    normalizedRating >=
      OFFICIAL_ELO_FLOOR
      ? OFFICIAL_ELO_FLOOR
      : 0
  );
};


export const calculateOfficialPairMatchRating =
  ({
    rating,
    opponentRating,
    won,
  }) => {
    const normalizedRating =
      integerAtLeastZero(
        rating,
        "rating",
      );

    const normalizedOpponentRating =
      integerAtLeastZero(
        opponentRating,
        "opponentRating",
      );

    if (
      typeof won !==
      "boolean"
    ) {
      throw new DoublesPairRatingError(
        "won debe ser boolean.",
        "invalid_match_result",
        400,
        {
          won,
        },
      );
    }

    const expectation =
      expectedScore(
        normalizedRating,
        normalizedOpponentRating,
      );

    const actual =
      won
        ? 1
        : 0;

    const rawChange =
      Math.round(
        DOUBLES_OFFICIAL_K *
        (
          actual -
          expectation
        ),
      );

    const floor =
      getOfficialPairRatingFloor(
        normalizedRating,
      );

    const ratingAfter =
      Math.max(
        floor,
        normalizedRating +
        rawChange,
      );

    return {
      rating_before:
        normalizedRating,

      opponent_rating:
        normalizedOpponentRating,

      expected_score:
        expectation,

      actual_score:
        actual,

      k_factor:
        DOUBLES_OFFICIAL_K,

      raw_change:
        rawChange,

      elo_change:
        ratingAfter -
        normalizedRating,

      rating_after:
        ratingAfter,

      floor,
    };
  };


export const calculateOfficialDoublesMatchRatings =
  ({
    side1Rating,
    side2Rating,
    winnerSide,
  }) => {
    const normalizedWinnerSide =
      Number(
        winnerSide,
      );

    if (
      normalizedWinnerSide !==
        1 &&
      normalizedWinnerSide !==
        2
    ) {
      throw new DoublesPairRatingError(
        "winnerSide debe ser 1 o 2.",
        "invalid_winner_side",
        400,
        {
          winnerSide,
        },
      );
    }

    return {
      winner_side:
        normalizedWinnerSide,

      side1:
        calculateOfficialPairMatchRating({
          rating:
            side1Rating,

          opponentRating:
            side2Rating,

          won:
            normalizedWinnerSide ===
            1,
        }),

      side2:
        calculateOfficialPairMatchRating({
          rating:
            side2Rating,

          opponentRating:
            side1Rating,

          won:
            normalizedWinnerSide ===
            2,
        }),
    };
  };


export const getPairKFactor = ({
  matchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
}) => {
  if (
    isProvisionalPair({
      matchesPlayed,
      placementMatches,
    })
  ) {
    return null;
  }

  return DOUBLES_OFFICIAL_K;
};


export const calculatePairMatchRating =
  ({
    rating,
    opponentRating,
    matchesPlayed,
    placementMatches =
      DEFAULT_PLACEMENT_MATCHES,
    won,
  }) => {
    if (
      isProvisionalPair({
        matchesPlayed,
        placementMatches,
      })
    ) {
      throw new DoublesPairRatingError(
        "Una pareja provisional no usa Elo partido a partido. Debe completar su placement.",
        "pair_still_in_placement",
        409,
        {
          matches_played:
            Number(
              matchesPlayed,
            ),

          placement_matches:
            Number(
              placementMatches,
            ),
        },
      );
    }

    return calculateOfficialPairMatchRating({
      rating,
      opponentRating,
      won,
    });
  };


export const calculateDoublesMatchRatings =
  ({
    side1Rating,
    side2Rating,
    side1MatchesPlayed,
    side2MatchesPlayed,
    placementMatches =
      DEFAULT_PLACEMENT_MATCHES,
    winnerSide,
  }) => {
    if (
      isProvisionalPair({
        matchesPlayed:
          side1MatchesPlayed,

        placementMatches,
      }) ||
      isProvisionalPair({
        matchesPlayed:
          side2MatchesPlayed,

        placementMatches,
      })
    ) {
      throw new DoublesPairRatingError(
        "El partido incluye una pareja provisional y debe pasar por el motor de placement.",
        "doubles_placement_required",
        409,
        {
          side1_matches_played:
            Number(
              side1MatchesPlayed,
            ),

          side2_matches_played:
            Number(
              side2MatchesPlayed,
            ),

          placement_matches:
            Number(
              placementMatches,
            ),
        },
      );
    }

    return calculateOfficialDoublesMatchRatings({
      side1Rating,
      side2Rating,
      winnerSide,
    });
  };


export default {
  DOUBLES_INITIAL_ELO,
  DOUBLES_OFFICIAL_K,
  DEFAULT_PLACEMENT_MATCHES,
  OFFICIAL_ELO_FLOOR,
  expectedScore,
  isProvisionalPair,
  getOfficialPairRatingFloor,
  calculateOfficialPairMatchRating,
  calculateOfficialDoublesMatchRatings,
  getPairKFactor,
  calculatePairMatchRating,
  calculateDoublesMatchRatings,
};