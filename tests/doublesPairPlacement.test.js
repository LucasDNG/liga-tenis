import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePlacementPercentile,
  calculateCompletedPlacement,
} from "../src/services/placementLevel.service.js";

import {
  getOfficialPositionPercentile,
} from "../src/services/placementReference.service.js";


const evidence = (
  won,
  percentile,
  matchId,
) => ({
  match_id:
    matchId,

  opponent_id:
    100 + matchId,

  won,

  opponent_percentile_at_match:
    percentile,

  opponent_reference_type:
    "official",
});


test(
  "cinco derrotas producen percentil 0",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence: [
          evidence(
            false,
            90,
            1,
          ),
          evidence(
            false,
            80,
            2,
          ),
          evidence(
            false,
            70,
            3,
          ),
          evidence(
            false,
            60,
            4,
          ),
          evidence(
            false,
            50,
            5,
          ),
        ],
      });

    assert.equal(
      result.wins,
      0,
    );

    assert.equal(
      result
        .placement_percentile,
      0,
    );

    assert.equal(
      result.completed,
      true,
    );
  },
);


test(
  "perder contra rivales fuertes no regala nivel",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence: [
          evidence(
            false,
            100,
            1,
          ),
          evidence(
            false,
            100,
            2,
          ),
          evidence(
            false,
            100,
            3,
          ),
          evidence(
            false,
            100,
            4,
          ),
          evidence(
            false,
            100,
            5,
          ),
        ],
      });

    assert.equal(
      result
        .placement_percentile,
      0,
    );
  },
);


test(
  "la calidad de las victorias sí aporta nivel",
  () => {
    const low =
      calculatePlacementPercentile({
        evidence: [
          evidence(
            true,
            10,
            1,
          ),
          evidence(
            true,
            20,
            2,
          ),
          evidence(
            false,
            90,
            3,
          ),
          evidence(
            false,
            90,
            4,
          ),
          evidence(
            false,
            90,
            5,
          ),
        ],
      });

    const high =
      calculatePlacementPercentile({
        evidence: [
          evidence(
            true,
            80,
            1,
          ),
          evidence(
            true,
            90,
            2,
          ),
          evidence(
            false,
            10,
            3,
          ),
          evidence(
            false,
            10,
            4,
          ),
          evidence(
            false,
            10,
            5,
          ),
        ],
      });

    assert.ok(
      high
        .placement_percentile >
      low
        .placement_percentile,
    );
  },
);


test(
  "primero del ranking oficial equivale a percentil 100",
  () => {
    assert.equal(
      getOfficialPositionPercentile({
        position:
          1,

        officialPlayerCount:
          10,
      }),
      100,
    );
  },
);


test(
  "último del ranking oficial equivale a percentil 0",
  () => {
    assert.equal(
      getOfficialPositionPercentile({
        position:
          10,

        officialPlayerCount:
          10,
      }),
      0,
    );
  },
);


test(
  "placement nunca entra número uno si ya existen oficiales",
  () => {
    const officialRanking =
      [
        1000,
        900,
        800,
        700,
      ].map(
        (
          rating,
          index,
        ) => ({
          id:
            index + 1,

          position:
            index + 1,

          rating,
        }),
      );

    const result =
      calculateCompletedPlacement({
        evidence: [
          evidence(
            true,
            100,
            1,
          ),
          evidence(
            true,
            100,
            2,
          ),
          evidence(
            true,
            100,
            3,
          ),
          evidence(
            true,
            100,
            4,
          ),
          evidence(
            true,
            100,
            5,
          ),
        ],

        officialRanking,
      });

    assert.equal(
      result
        .target_position,
      2,
    );
  },
);


test(
  "si no hay oficiales la primera pareja recibe piso Elo oficial",
  () => {
    const result =
      calculateCompletedPlacement({
        evidence: [
          evidence(
            false,
            0,
            1,
          ),
          evidence(
            false,
            0,
            2,
          ),
          evidence(
            false,
            0,
            3,
          ),
          evidence(
            false,
            0,
            4,
          ),
          evidence(
            false,
            0,
            5,
          ),
        ],

        officialRanking:
          [],
      });

    assert.equal(
      result
        .target_position,
      1,
    );

    assert.equal(
      result
        .target_elo,
      100,
    );
  },
);