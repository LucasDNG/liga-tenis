import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_CANCELLATION_PENALTY,
  MatchCancellationError,
  calculateMatchCancellationElo,
} from "../src/services/matchCancellation.service.js";


test(
  "penalización configurada es 15 Elo",
  () => {
    assert.equal(
      MATCH_CANCELLATION_PENALTY,
      15,
    );
  },
);


test(
  "provisional normal pierde 15 Elo",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          100,

        matchesPlayed:
          3,

        placementMatches:
          5,
      });

    assert.equal(
      result.provisional,
      true,
    );

    assert.equal(
      result.elo_before,
      100,
    );

    assert.equal(
      result.elo_change,
      -15,
    );

    assert.equal(
      result.elo_after,
      85,
    );

    assert.equal(
      result.effective_penalty,
      15,
    );

    assert.equal(
      result.floor,
      0,
    );

    assert.equal(
      result.placement_matches,
      5,
    );
  },
);


test(
  "provisional en Elo 0 no genera -0 ni Elo negativo",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          0,

        matchesPlayed:
          0,

        placementMatches:
          5,
      });

    assert.equal(
      result.provisional,
      true,
    );

    assert.equal(
      result.elo_before,
      0,
    );

    assert.equal(
      result.elo_after,
      0,
    );

    assert.equal(
      result.elo_change,
      0,
    );

    assert.equal(
      Object.is(
        result.elo_change,
        -0,
      ),
      false,
    );

    assert.equal(
      result.effective_penalty,
      0,
    );
  },
);


test(
  "provisional con Elo menor a 15 queda en 0",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          8,

        matchesPlayed:
          4,

        placementMatches:
          5,
      });

    assert.equal(
      result.elo_before,
      8,
    );

    assert.equal(
      result.elo_after,
      0,
    );

    assert.equal(
      result.elo_change,
      -8,
    );

    assert.equal(
      result.effective_penalty,
      8,
    );
  },
);


test(
  "con 5 partidos ya se considera oficial cuando la competición exige 5",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          1200,

        matchesPlayed:
          5,

        placementMatches:
          5,
      });

    assert.equal(
      result.provisional,
      false,
    );
  },
);


test(
  "la provisionalidad depende de placement_matches de la competición",
  () => {
    const provisional =
      calculateMatchCancellationElo({
        rating:
          1200,

        matchesPlayed:
          5,

        placementMatches:
          6,
      });

    const official =
      calculateMatchCancellationElo({
        rating:
          1200,

        matchesPlayed:
          5,

        placementMatches:
          5,
      });

    assert.equal(
      provisional.provisional,
      true,
    );

    assert.equal(
      official.provisional,
      false,
    );
  },
);


test(
  "mantiene compatibilidad usando placement global si no se envía placementMatches",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          1200,

        matchesPlayed:
          5,
      });

    assert.equal(
      result.provisional,
      false,
    );

    assert.equal(
      result.placement_matches,
      5,
    );
  },
);


test(
  "oficial normal pierde exactamente 15 Elo",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          1500,

        matchesPlayed:
          20,

        placementMatches:
          5,
      });

    assert.equal(
      result.elo_before,
      1500,
    );

    assert.equal(
      result.elo_change,
      -15,
    );

    assert.equal(
      result.elo_after,
      1485,
    );

    assert.equal(
      result.floor,
      100,
    );
  },
);


test(
  "oficial respeta piso 100",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          108,

        matchesPlayed:
          10,

        placementMatches:
          5,
      });

    assert.equal(
      result.elo_before,
      108,
    );

    assert.equal(
      result.elo_after,
      100,
    );

    assert.equal(
      result.elo_change,
      -8,
    );

    assert.equal(
      result.effective_penalty,
      8,
    );
  },
);


test(
  "oficial en 100 no pierde más Elo por piso oficial",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          100,

        matchesPlayed:
          12,

        placementMatches:
          5,
      });

    assert.equal(
      result.elo_after,
      100,
    );

    assert.equal(
      result.elo_change,
      0,
    );

    assert.equal(
      result.effective_penalty,
      0,
    );
  },
);


test(
  "oficial que ya estaba debajo de 100 puede seguir bajando",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          80,

        matchesPlayed:
          30,

        placementMatches:
          5,
      });

    assert.equal(
      result.provisional,
      false,
    );

    assert.equal(
      result.floor,
      0,
    );

    assert.equal(
      result.elo_after,
      65,
    );

    assert.equal(
      result.elo_change,
      -15,
    );
  },
);


test(
  "oficial debajo de 15 queda en 0",
  () => {
    const result =
      calculateMatchCancellationElo({
        rating:
          9,

        matchesPlayed:
          30,

        placementMatches:
          5,
      });

    assert.equal(
      result.elo_after,
      0,
    );

    assert.equal(
      result.elo_change,
      -9,
    );
  },
);


test(
  "rechaza rating negativo",
  () => {
    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            -1,

          matchesPlayed:
            10,

          placementMatches:
            5,
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchCancellationError,
        );

        assert.equal(
          error.reason,
          "invalid_numeric_value",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza matchesPlayed negativo",
  () => {
    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            1500,

          matchesPlayed:
            -1,

          placementMatches:
            5,
        }),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_numeric_value",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza placementMatches inválido",
  () => {
    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            1500,

          matchesPlayed:
            5,

          placementMatches:
            0,
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchCancellationError,
        );

        assert.equal(
          error.reason,
          "invalid_positive_integer",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza valores decimales",
  () => {
    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            1500.5,

          matchesPlayed:
            5,

          placementMatches:
            5,
        }),
      MatchCancellationError,
    );

    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            1500,

          matchesPlayed:
            5.5,

          placementMatches:
            5,
        }),
      MatchCancellationError,
    );

    assert.throws(
      () =>
        calculateMatchCancellationElo({
          rating:
            1500,

          matchesPlayed:
            5,

          placementMatches:
            5.5,
        }),
      MatchCancellationError,
    );
  },
);