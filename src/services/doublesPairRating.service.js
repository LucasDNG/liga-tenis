export const DOUBLES_INITIAL_ELO =
  1000;

export const DOUBLES_PROVISIONAL_K =
  48;

export const DOUBLES_OFFICIAL_K =
  32;

export const DEFAULT_PLACEMENT_MATCHES =
  5;


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


export const getPairKFactor = ({
  matchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
}) =>
  isProvisionalPair({
    matchesPlayed,
    placementMatches,
  })
    ? DOUBLES_PROVISIONAL_K
    : DOUBLES_OFFICIAL_K;


export const getPairRatingFloor = ({
  rating,
  matchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
}) => {
  const normalizedRating =
    integerAtLeastZero(
      rating,
      "rating",
    );

  const provisional =
    isProvisionalPair({
      matchesPlayed,
      placementMatches,
    });

  if (provisional) {
    return 0;
  }

  return (
    normalizedRating >= 100
      ? 100
      : 0
  );
};


export const calculatePairMatchRating = ({
  rating,
  opponentRating,
  matchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
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

  const normalizedMatchesPlayed =
    integerAtLeastZero(
      matchesPlayed,
      "matchesPlayed",
    );

  const normalizedPlacementMatches =
    positiveInteger(
      placementMatches,
      "placementMatches",
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

  const provisionalBefore =
    isProvisionalPair({
      matchesPlayed:
        normalizedMatchesPlayed,

      placementMatches:
        normalizedPlacementMatches,
    });

  const k =
    getPairKFactor({
      matchesPlayed:
        normalizedMatchesPlayed,

      placementMatches:
        normalizedPlacementMatches,
    });

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
      k *
      (
        actual -
        expectation
      ),
    );

  const floor =
    getPairRatingFloor({
      rating:
        normalizedRating,

      matchesPlayed:
        normalizedMatchesPlayed,

      placementMatches:
        normalizedPlacementMatches,
    });

  const ratingAfter =
    Math.max(
      floor,
      normalizedRating +
        rawChange,
    );

  const eloChange =
    ratingAfter -
    normalizedRating;

  const matchesPlayedAfter =
    normalizedMatchesPlayed +
    1;

  const placementCompleted =
    provisionalBefore &&
    matchesPlayedAfter >=
      normalizedPlacementMatches;

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
      k,

    raw_change:
      rawChange,

    elo_change:
      eloChange,

    rating_after:
      ratingAfter,

    matches_played_before:
      normalizedMatchesPlayed,

    matches_played_after:
      matchesPlayedAfter,

    provisional_before:
      provisionalBefore,

    provisional_after:
      matchesPlayedAfter <
      normalizedPlacementMatches,

    placement_completed:
      placementCompleted,

    floor,
  };
};


export const calculateDoublesMatchRatings = ({
  side1Rating,
  side2Rating,
  side1MatchesPlayed,
  side2MatchesPlayed,
  placementMatches =
    DEFAULT_PLACEMENT_MATCHES,
  winnerSide,
}) => {
  const normalizedWinnerSide =
    Number(
      winnerSide,
    );

  if (
    normalizedWinnerSide !== 1 &&
    normalizedWinnerSide !== 2
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

  const side1 =
    calculatePairMatchRating({
      rating:
        side1Rating,

      opponentRating:
        side2Rating,

      matchesPlayed:
        side1MatchesPlayed,

      placementMatches,

      won:
        normalizedWinnerSide ===
        1,
    });

  const side2 =
    calculatePairMatchRating({
      rating:
        side2Rating,

      opponentRating:
        side1Rating,

      matchesPlayed:
        side2MatchesPlayed,

      placementMatches,

      won:
        normalizedWinnerSide ===
        2,
    });

  return {
    winner_side:
      normalizedWinnerSide,

    side1,

    side2,
  };
};


export default {
  DOUBLES_INITIAL_ELO,
  DOUBLES_PROVISIONAL_K,
  DOUBLES_OFFICIAL_K,
  DEFAULT_PLACEMENT_MATCHES,
  expectedScore,
  isProvisionalPair,
  getPairKFactor,
  getPairRatingFloor,
  calculatePairMatchRating,
  calculateDoublesMatchRatings,
};