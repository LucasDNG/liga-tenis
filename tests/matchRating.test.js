import test from "node:test";
import assert from "node:assert/strict";

import {
  NORMAL_ELO_K,
  RANKED_LOSS_TO_PROVISIONAL_MIN,
  RANKED_LOSS_TO_PROVISIONAL_PERCENT,
  RANKED_LOSS_TO_PROVISIONAL_MAX,
  MatchRatingError,
  isPlacementRatingPlayer,
  expectedScore,
  calculateNormalEloChange,
  getRankedLossToProvisionalPenalty,
  getOfficialLossFloor,
  calculateOfficialMatchRating,
  calculatePlacementMatchRating,
  calculatePlayerMatchRating,
} from "../src/services/matchRating.service.js";


const player = ({
  id = 1,
  rating = 0,
  matchesPlayed = 0,
} = {}) => ({
  id,

  rating,

  matches_played:
    matchesPlayed,
});


const placementResult = ({
  matchNumber,
  completed = false,
  targetElo = null,
} = {}) => ({
  applies:
    true,

  placement_match_number:
    matchNumber,

  completed,

  target_elo:
    targetElo,
});


test(
  "constantes Elo actuales",
  () => {
    assert.equal(
      NORMAL_ELO_K,
      32,
    );

    assert.equal(
      RANKED_LOSS_TO_PROVISIONAL_MIN,
      200,
    );

    assert.equal(
      RANKED_LOSS_TO_PROVISIONAL_PERCENT,
      0.12,
    );

    assert.equal(
      RANKED_LOSS_TO_PROVISIONAL_MAX,
      300,
    );
  },
);


test(
  "0 a 4 partidos es provisional",
  () => {
    for (
      let matches = 0;
      matches <= 4;
      matches += 1
    ) {
      assert.equal(
        isPlacementRatingPlayer(
          player({
            matchesPlayed:
              matches,
          }),
        ),
        true,
      );
    }
  },
);


test(
  "5 partidos ya es oficial",
  () => {
    assert.equal(
      isPlacementRatingPlayer(
        player({
          matchesPlayed:
            5,

          rating:
            1400,
        }),
      ),
      false,
    );
  },
);


test(
  "expectedScore de ratings iguales es 0.5",
  () => {
    assert.equal(
      expectedScore(
        1500,
        1500,
      ),
      0.5,
    );
  },
);


test(
  "K32 entre ratings iguales da +16 al ganador",
  () => {
    assert.equal(
      calculateNormalEloChange({
        ownRating:
          1500,

        opponentRating:
          1500,

        won:
          true,
      }),
      16,
    );
  },
);


test(
  "K32 entre ratings iguales da -16 al perdedor",
  () => {
    assert.equal(
      calculateNormalEloChange({
        ownRating:
          1500,

        opponentRating:
          1500,

        won:
          false,
      }),
      -16,
    );
  },
);


test(
  "penalización contra provisional respeta mínimo 200",
  () => {
    assert.equal(
      getRankedLossToProvisionalPenalty(
        1000,
      ),
      200,
    );
  },
);


test(
  "penalización contra provisional usa 12% en zona intermedia",
  () => {
    assert.equal(
      getRankedLossToProvisionalPenalty(
        2000,
      ),
      240,
    );
  },
);


test(
  "penalización contra provisional respeta máximo 300",
  () => {
    assert.equal(
      getRankedLossToProvisionalPenalty(
        3000,
      ),
      300,
    );
  },
);


test(
  "oficial normal tiene piso 100",
  () => {
    assert.equal(
      getOfficialLossFloor(
        1500,
      ),
      100,
    );

    assert.equal(
      getOfficialLossFloor(
        100,
      ),
      100,
    );
  },
);


test(
  "oficial que ya estaba debajo de 100 usa piso 0",
  () => {
    assert.equal(
      getOfficialLossFloor(
        99,
      ),
      0,
    );
  },
);


test(
  "oficial gana a oficial con K32",
  () => {
    const result =
      calculateOfficialMatchRating({
        player:
          player({
            id:
              1,

            rating:
              1500,

            matchesPlayed:
              10,
          }),

        opponent:
          player({
            id:
              2,

            rating:
              1500,

            matchesPlayed:
              20,
          }),

        won:
          true,
      });

    assert.equal(
      result.rating_before,
      1500,
    );

    assert.equal(
      result.rating_after,
      1516,
    );

    assert.equal(
      result.elo_change,
      16,
    );

    assert.equal(
      result.calculation,
      "normal_ranked",
    );
  },
);


test(
  "oficial pierde contra oficial con K32",
  () => {
    const result =
      calculateOfficialMatchRating({
        player:
          player({
            rating:
              1500,

            matchesPlayed:
              10,
          }),

        opponent:
          player({
            rating:
              1500,

            matchesPlayed:
              10,
          }),

        won:
          false,
      });

    assert.equal(
      result.rating_after,
      1484,
    );

    assert.equal(
      result.elo_change,
      -16,
    );

    assert.equal(
      result.calculation,
      "normal_ranked",
    );
  },
);


test(
  "oficial gana a provisional con K32",
  () => {
    /*
      Oficial 1500 vs provisional 0.

      El cálculo sigue siendo K32 normal.

      Como la diferencia de rating es enorme,
      la expectativa del oficial es casi 1.

      El delta matemático queda por debajo
      de 0.5 y Math.round lo transforma en 0.

      No agregamos un +1 artificial porque eso
      dejaría de ser la regla K32 vigente.
    */

    const result =
      calculateOfficialMatchRating({
        player:
          player({
            rating:
              1500,

            matchesPlayed:
              20,
          }),

        opponent:
          player({
            rating:
              0,

            matchesPlayed:
              2,
          }),

        won:
          true,
      });

    assert.equal(
      result.calculation,
      "ranked_beats_placement",
    );

    assert.equal(
      result.special_provisional_penalty,
      null,
    );

    assert.equal(
      result.rating_before,
      1500,
    );

    assert.equal(
      result.rating_after,
      1500,
    );

    assert.equal(
      result.elo_change,
      0,
    );

    assert.equal(
      calculateNormalEloChange({
        ownRating:
          1500,

        opponentRating:
          0,

        won:
          true,
      }),
      0,
    );
  },
);


test(
  "oficial pierde contra provisional y recibe penalización especial",
  () => {
    const result =
      calculateOfficialMatchRating({
        player:
          player({
            rating:
              2000,

            matchesPlayed:
              20,
          }),

        opponent:
          player({
            rating:
              0,

            matchesPlayed:
              2,
          }),

        won:
          false,
      });

    assert.equal(
      result.special_provisional_penalty,
      240,
    );

    assert.equal(
      result.rating_after,
      1760,
    );

    assert.equal(
      result.elo_change,
      -240,
    );

    assert.equal(
      result.calculation,
      "ranked_loses_to_placement",
    );
  },
);


test(
  "nivelatorio 1 mantiene Elo sin cambios",
  () => {
    const result =
      calculatePlacementMatchRating({
        player:
          player({
            rating:
              0,

            matchesPlayed:
              0,
          }),

        placementResult:
          placementResult({
            matchNumber:
              1,

            completed:
              false,
          }),
      });

    assert.equal(
      result.rating_before,
      0,
    );

    assert.equal(
      result.rating_after,
      0,
    );

    assert.equal(
      result.elo_change,
      0,
    );

    assert.equal(
      result.placement_completed,
      false,
    );

    assert.equal(
      result.calculation,
      "placement_in_progress",
    );
  },
);


test(
  "nivelatorios 1 a 4 nunca acumulan Elo",
  () => {
    for (
      let matchesBefore = 0;
      matchesBefore <= 3;
      matchesBefore += 1
    ) {
      const matchNumber =
        matchesBefore + 1;

      const result =
        calculatePlacementMatchRating({
          player:
            player({
              rating:
                0,

              matchesPlayed:
                matchesBefore,
            }),

          placementResult:
            placementResult({
              matchNumber,

              completed:
                false,
            }),
        });

      assert.equal(
        result.placement_match_number,
        matchNumber,
      );

      assert.equal(
        result.rating_after,
        0,
      );

      assert.equal(
        result.elo_change,
        0,
      );
    }
  },
);


test(
  "quinto nivelatorio asigna exactamente target Elo",
  () => {
    const result =
      calculatePlacementMatchRating({
        player:
          player({
            rating:
              0,

            matchesPlayed:
              4,
          }),

        placementResult:
          placementResult({
            matchNumber:
              5,

            completed:
              true,

            targetElo:
              1400,
          }),
      });

    assert.equal(
      result.placement_completed,
      true,
    );

    assert.equal(
      result.rating_before,
      0,
    );

    assert.equal(
      result.rating_after,
      1400,
    );

    assert.equal(
      result.elo_change,
      1400,
    );

    assert.equal(
      result.target_elo,
      1400,
    );

    assert.equal(
      result.calculation,
      "placement_completed",
    );
  },
);


test(
  "quinto nivelatorio 0/5 también recibe Elo oficial de referencia",
  () => {
    const result =
      calculatePlacementMatchRating({
        player:
          player({
            rating:
              0,

            matchesPlayed:
              4,
          }),

        placementResult:
          placementResult({
            matchNumber:
              5,

            completed:
              true,

            targetElo:
              1050,
          }),
      });

    assert.equal(
      result.rating_after,
      1050,
    );

    assert.equal(
      result.elo_change,
      1050,
    );
  },
);


test(
  "quinto nivelatorio no puede quedar debajo del piso oficial",
  () => {
    assert.throws(
      () =>
        calculatePlacementMatchRating({
          player:
            player({
              rating:
                0,

              matchesPlayed:
                4,
            }),

          placementResult:
            placementResult({
              matchNumber:
                5,

              completed:
                true,

              targetElo:
                90,
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchRatingError,
        );

        assert.equal(
          error.reason,
          "placement_target_below_floor",
        );

        return true;
      },
    );
  },
);


test(
  "quinto partido debe venir marcado completed",
  () => {
    assert.throws(
      () =>
        calculatePlacementMatchRating({
          player:
            player({
              rating:
                0,

              matchesPlayed:
                4,
            }),

          placementResult:
            placementResult({
              matchNumber:
                5,

              completed:
                false,

              targetElo:
                null,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "fifth_placement_not_completed",
        );

        return true;
      },
    );
  },
);


test(
  "placement no puede completarse antes del quinto partido",
  () => {
    assert.throws(
      () =>
        calculatePlacementMatchRating({
          player:
            player({
              rating:
                0,

              matchesPlayed:
                2,
            }),

          placementResult:
            placementResult({
              matchNumber:
                3,

              completed:
                true,

              targetElo:
                1400,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "placement_completed_too_early",
        );

        return true;
      },
    );
  },
);


test(
  "resultado de placement debe coincidir con siguiente partido",
  () => {
    assert.throws(
      () =>
        calculatePlacementMatchRating({
          player:
            player({
              rating:
                0,

              matchesPlayed:
                2,
            }),

          placementResult:
            placementResult({
              matchNumber:
                2,

              completed:
                false,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "placement_match_number_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "calculatePlayerMatchRating elige automáticamente placement",
  () => {
    const result =
      calculatePlayerMatchRating({
        player:
          player({
            rating:
              0,

            matchesPlayed:
              3,
          }),

        opponent:
          player({
            rating:
              1500,

            matchesPlayed:
              20,
          }),

        won:
          true,

        placementResult:
          placementResult({
            matchNumber:
              4,

            completed:
              false,
          }),
      });

    assert.equal(
      result.provisional,
      true,
    );

    assert.equal(
      result.rating_after,
      0,
    );
  },
);


test(
  "calculatePlayerMatchRating elige automáticamente Elo oficial",
  () => {
    const result =
      calculatePlayerMatchRating({
        player:
          player({
            rating:
              1500,

            matchesPlayed:
              10,
          }),

        opponent:
          player({
            rating:
              1500,

            matchesPlayed:
              10,
          }),

        won:
          true,
      });

    assert.equal(
      result.provisional,
      false,
    );

    assert.equal(
      result.rating_after,
      1516,
    );
  },
);