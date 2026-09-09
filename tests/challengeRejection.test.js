import test from "node:test";
import assert from "node:assert/strict";

import {
  ChallengeRejectionError,
  calculateCompetitionChallengeRejection,
} from "../src/services/challengeRejection.service.js";


const assertReason =
  (
    reason,
  ) =>
  (
    error,
  ) => {
    assert.ok(
      error instanceof
        ChallengeRejectionError,
    );

    assert.equal(
      error.reason,
      reason,
    );

    return true;
  };


test(
  "rechazo oficial descuenta Elo usando el motor central",
  () => {
    const result =
      calculateCompetitionChallengeRejection({
        rating: 1200,
        matchesPlayed: 10,
      });

    assert.equal(
      result.elo_before,
      1200,
    );

    assert.ok(
      result.elo_after <
        result.elo_before,
    );

    assert.ok(
      result.effective_penalty >=
        0,
    );

    assert.equal(
      result.provisional,
      false,
    );
  },
);


test(
  "rechazo provisional usa la condición de placement de esa competición",
  () => {
    const result =
      calculateCompetitionChallengeRejection({
        rating: 100,
        matchesPlayed: 2,
      });

    assert.equal(
      result.provisional,
      true,
    );
  },
);


test(
  "rechazo no acepta rating negativo",
  () => {
    assert.throws(
      () =>
        calculateCompetitionChallengeRejection({
          rating: -1,
          matchesPlayed: 10,
        }),
      assertReason(
        "invalid_competition_rating",
      ),
    );
  },
);


test(
  "rechazo no acepta rating no numérico",
  () => {
    assert.throws(
      () =>
        calculateCompetitionChallengeRejection({
          rating: "abc",
          matchesPlayed: 10,
        }),
      assertReason(
        "invalid_competition_rating",
      ),
    );
  },
);


test(
  "rechazo no acepta partidos negativos",
  () => {
    assert.throws(
      () =>
        calculateCompetitionChallengeRejection({
          rating: 1200,
          matchesPlayed: -1,
        }),
      assertReason(
        "invalid_competition_matches_played",
      ),
    );
  },
);


test(
  "rechazo no acepta cantidad fraccionaria de partidos",
  () => {
    assert.throws(
      () =>
        calculateCompetitionChallengeRejection({
          rating: 1200,
          matchesPlayed: 2.5,
        }),
      assertReason(
        "invalid_competition_matches_played",
      ),
    );
  },
);