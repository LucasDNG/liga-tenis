import test from "node:test";
import assert from "node:assert/strict";

import {
  DOUBLES_INITIAL_ELO,
  DOUBLES_OFFICIAL_K,
  DEFAULT_PLACEMENT_MATCHES,
  expectedScore,
  isProvisionalPair,
  getPairKFactor,
  getOfficialPairRatingFloor,
  calculateOfficialPairMatchRating,
  calculateOfficialDoublesMatchRatings,
  calculatePairMatchRating,
  calculateDoublesMatchRatings,
} from "../src/services/doublesPairRating.service.js";


test(
  "pareja nueva comienza con Elo 0",
  () => {
    assert.equal(
      DOUBLES_INITIAL_ELO,
      0,
    );
  },
);


test(
  "dobles usa cinco nivelatorios",
  () => {
    assert.equal(
      DEFAULT_PLACEMENT_MATCHES,
      5,
    );
  },
);


test(
  "K oficial es 32",
  () => {
    assert.equal(
      DOUBLES_OFFICIAL_K,
      32,
    );
  },
);


test(
  "0 partidos es provisional",
  () => {
    assert.equal(
      isProvisionalPair({
        matchesPlayed:
          0,
      }),
      true,
    );
  },
);


test(
  "4 partidos sigue provisional",
  () => {
    assert.equal(
      isProvisionalPair({
        matchesPlayed:
          4,
      }),
      true,
    );
  },
);


test(
  "5 partidos ya es oficial",
  () => {
    assert.equal(
      isProvisionalPair({
        matchesPlayed:
          5,
      }),
      false,
    );
  },
);


test(
  "una pareja provisional no recibe K",
  () => {
    assert.equal(
      getPairKFactor({
        matchesPlayed:
          2,
      }),
      null,
    );
  },
);


test(
  "una pareja oficial recibe K32",
  () => {
    assert.equal(
      getPairKFactor({
        matchesPlayed:
          5,
      }),
      32,
    );
  },
);


test(
  "expectedScore entre Elo iguales es 0.5",
  () => {
    assert.equal(
      expectedScore(
        700,
        700,
      ),
      0.5,
    );
  },
);


test(
  "oficial con Elo 1000 gana 16 contra igual",
  () => {
    const result =
      calculateOfficialPairMatchRating({
        rating:
          1000,

        opponentRating:
          1000,

        won:
          true,
      });

    assert.equal(
      result.elo_change,
      16,
    );

    assert.equal(
      result.rating_after,
      1016,
    );
  },
);


test(
  "oficial con Elo 1000 pierde 16 contra igual",
  () => {
    const result =
      calculateOfficialPairMatchRating({
        rating:
          1000,

        opponentRating:
          1000,

        won:
          false,
      });

    assert.equal(
      result.elo_change,
      -16,
    );

    assert.equal(
      result.rating_after,
      984,
    );
  },
);


test(
  "oficial normal tiene piso 100",
  () => {
    assert.equal(
      getOfficialPairRatingFloor(
        150,
      ),
      100,
    );
  },
);


test(
  "dato histórico oficial debajo de 100 puede bajar hasta 0",
  () => {
    assert.equal(
      getOfficialPairRatingFloor(
        80,
      ),
      0,
    );
  },
);


test(
  "calculatePairMatchRating bloquea provisional",
  () => {
    assert.throws(
      () =>
        calculatePairMatchRating({
          rating:
            0,

          opponentRating:
            100,

          matchesPlayed:
            4,

          placementMatches:
            5,

          won:
            true,
        }),
      (
        error,
      ) =>
        error.reason ===
        "pair_still_in_placement",
    );
  },
);


test(
  "calculateDoublesMatchRatings bloquea si alguna pareja sigue provisional",
  () => {
    assert.throws(
      () =>
        calculateDoublesMatchRatings({
          side1Rating:
            0,

          side2Rating:
            100,

          side1MatchesPlayed:
            4,

          side2MatchesPlayed:
            5,

          placementMatches:
            5,

          winnerSide:
            1,
        }),
      (
        error,
      ) =>
        error.reason ===
        "doubles_placement_required",
    );
  },
);


test(
  "partido entre dos oficiales calcula ambos Elo",
  () => {
    const result =
      calculateOfficialDoublesMatchRatings({
        side1Rating:
          1000,

        side2Rating:
          1000,

        winnerSide:
          1,
      });

    assert.equal(
      result.side1
        .rating_after,
      1016,
    );

    assert.equal(
      result.side2
        .rating_after,
      984,
    );
  },
);