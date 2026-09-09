import test from "node:test";
import assert from "node:assert/strict";

import {
  PLACEMENT_MATCHES,
  PLACEMENT_LEVEL_MARGIN,
  PLACEMENT_PERCENTILE_CAP,
  PLACEMENT_MIN_OFFICIAL_POSITION,
  OFFICIAL_ELO_FLOOR,
  PLACEMENT_WIN_FACTORS,
  PlacementLevelError,
  normalizePercentile,
  getVictoryWeight,
  normalizePlacementEvidence,
  calculateWeightedVictoryPercentile,
  calculateDemonstratedLevel,
  getPlacementWinFactor,
  calculatePlacementPercentile,
  placementPercentileToTargetPosition,
  getPlacementTargetElo,
  calculateCompletedPlacement,
} from "../src/services/placementLevel.service.js";

const EPSILON = 0.02;

const approximatelyEqual = (
  actual,
  expected,
  epsilon = EPSILON,
) => {
  assert.ok(
    Number.isFinite(Number(actual)),
    `Valor no numérico: ${actual}`,
  );

  assert.ok(
    Math.abs(
      Number(actual) -
        Number(expected),
    ) <= epsilon,
    `Esperado ${expected}, recibido ${actual}`,
  );
};

const victory = (
  percentile,
  referenceType = "official",
) => ({
  won: true,
  opponent_percentile_at_match:
    percentile,
  opponent_reference_type:
    referenceType,
});

const defeat = (
  percentile = null,
) => ({
  won: false,
  opponent_percentile_at_match:
    percentile,
  opponent_reference_type:
    "official",
});

const evidenceWithVictories = (
  percentiles,
  totalMatches = 5,
) => {
  const evidence =
    percentiles.map(
      (percentile) =>
        victory(percentile),
    );

  while (
    evidence.length <
    totalMatches
  ) {
    evidence.push(
      defeat(),
    );
  }

  return evidence;
};

const createOfficialRanking = (
  count = 20,
) =>
  Array.from(
    {
      length: count,
    },
    (
      _,
      index,
    ) => ({
      id:
        index + 1,
      position:
        index + 1,
      official_position:
        index + 1,
      rank_position:
        index + 1,
      rating:
        2000 -
        index * 50,
    }),
  );


test(
  "constantes centrales del placement",
  () => {
    assert.equal(
      PLACEMENT_MATCHES,
      5,
    );

    assert.equal(
      PLACEMENT_LEVEL_MARGIN,
      8,
    );

    assert.equal(
      PLACEMENT_PERCENTILE_CAP,
      97,
    );

    assert.equal(
      PLACEMENT_MIN_OFFICIAL_POSITION,
      2,
    );

    assert.equal(
      OFFICIAL_ELO_FLOOR,
      100,
    );
  },
);


test(
  "factores por victorias",
  () => {
    assert.deepEqual(
      PLACEMENT_WIN_FACTORS,
      {
        0: 0,
        1: 0.65,
        2: 0.78,
        3: 0.88,
        4: 0.95,
        5: 1,
      },
    );
  },
);


test(
  "normalizePercentile acepta valores válidos",
  () => {
    assert.equal(
      normalizePercentile(0),
      0,
    );

    assert.equal(
      normalizePercentile(50),
      50,
    );

    assert.equal(
      normalizePercentile(100),
      100,
    );
  },
);


test(
  "normalizePercentile rechaza valores fuera de rango",
  () => {
    assert.throws(
      () =>
        normalizePercentile(-1),
      PlacementLevelError,
    );

    assert.throws(
      () =>
        normalizePercentile(101),
      PlacementLevelError,
    );
  },
);


test(
  "peso de victoria",
  () => {
    approximatelyEqual(
      getVictoryWeight(0),
      1,
    );

    approximatelyEqual(
      getVictoryWeight(50),
      1.5,
    );

    approximatelyEqual(
      getVictoryWeight(100),
      2,
    );
  },
);


test(
  "normaliza evidencia válida",
  () => {
    const result =
      normalizePlacementEvidence(
        victory(
          68,
          "provisional",
        ),
      );

    assert.equal(
      result.won,
      true,
    );

    assert.equal(
      result
        .opponent_percentile_at_match,
      68,
    );

    assert.equal(
      result
        .opponent_reference_type,
      "provisional",
    );
  },
);


test(
  "victoria sin referencia congelada falla",
  () => {
    assert.throws(
      () =>
        normalizePlacementEvidence({
          won: true,
          opponent_percentile_at_match:
            null,
          opponent_reference_type:
            "official",
        }),
      (error) => {
        assert.equal(
          error.reason,
          "victory_reference_missing",
        );

        return true;
      },
    );
  },
);


test(
  "promedio ponderado 20 y 80 da 56",
  () => {
    const result =
      calculateWeightedVictoryPercentile(
        [
          victory(20),
          victory(80),
        ],
      );

    approximatelyEqual(
      result.weighted_percentile,
      56,
    );

    approximatelyEqual(
      result.total_weight,
      3,
    );

    approximatelyEqual(
      result.weighted_sum,
      168,
    );
  },
);


test(
  "nivel demostrado agrega 8 puntos",
  () => {
    approximatelyEqual(
      calculateDemonstratedLevel(
        50,
      ),
      58,
    );
  },
);


test(
  "nivel demostrado respeta cap 97",
  () => {
    approximatelyEqual(
      calculateDemonstratedLevel(
        95,
      ),
      97,
    );

    approximatelyEqual(
      calculateDemonstratedLevel(
        100,
      ),
      97,
    );
  },
);


test(
  "factores por número de victorias",
  () => {
    assert.equal(
      getPlacementWinFactor(0),
      0,
    );

    assert.equal(
      getPlacementWinFactor(1),
      0.65,
    );

    assert.equal(
      getPlacementWinFactor(2),
      0.78,
    );

    assert.equal(
      getPlacementWinFactor(3),
      0.88,
    );

    assert.equal(
      getPlacementWinFactor(4),
      0.95,
    );

    assert.equal(
      getPlacementWinFactor(5),
      1,
    );
  },
);


test(
  "0/5 produce placement 0",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence: [
          defeat(),
          defeat(),
          defeat(),
          defeat(),
          defeat(),
        ],
      });

    assert.equal(
      result.matches_played,
      5,
    );

    assert.equal(
      result.wins,
      0,
    );

    assert.equal(
      result.losses,
      5,
    );

    assert.equal(
      result.placement_percentile,
      0,
    );

    assert.equal(
      result.completed,
      true,
    );
  },
);


test(
  "1 victoria contra 50 produce 37.7",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [50],
          ),
      });

    approximatelyEqual(
      result
        .weighted_victory_percentile,
      50,
    );

    approximatelyEqual(
      result.demonstrated_level,
      58,
    );

    approximatelyEqual(
      result.win_factor,
      0.65,
    );

    approximatelyEqual(
      result.placement_percentile,
      37.7,
    );
  },
);


test(
  "1 victoria contra 20 produce 18.2",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [20],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      18.2,
    );
  },
);


test(
  "1 victoria contra 90 produce 63.05",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [90],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      63.05,
    );
  },
);


test(
  "2 victorias contra 40 y 50 producen 41.47",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [
              40,
              50,
            ],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      41.47,
    );
  },
);


test(
  "2 victorias contra 80 y 90 producen 72.65",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [
              80,
              90,
            ],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      72.65,
    );
  },
);


test(
  "5 victorias fáciles no regalan top",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [
              10,
              20,
              30,
              40,
              50,
            ],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      39.54,
    );

    assert.ok(
      result.placement_percentile <
        50,
    );
  },
);


test(
  "5 victorias medias producen 69.25",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [
              40,
              50,
              60,
              70,
              80,
            ],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      69.25,
    );
  },
);


test(
  "5 victorias fuertes producen 92.4",
  () => {
    const result =
      calculatePlacementPercentile({
        evidence:
          evidenceWithVictories(
            [
              70,
              80,
              85,
              90,
              95,
            ],
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      92.4,
    );
  },
);


test(
  "derrotas no aportan fuerza del rival",
  () => {
    const weakLosses =
      calculatePlacementPercentile({
        evidence: [
          victory(50),
          defeat(10),
          defeat(10),
          defeat(10),
          defeat(10),
        ],
      });

    const strongLosses =
      calculatePlacementPercentile({
        evidence: [
          victory(50),
          defeat(100),
          defeat(100),
          defeat(100),
          defeat(100),
        ],
      });

    assert.equal(
      weakLosses
        .placement_percentile,
      strongLosses
        .placement_percentile,
    );

    approximatelyEqual(
      weakLosses
        .placement_percentile,
      37.7,
    );
  },
);


test(
  "percentil 0 con 20 oficiales -> puesto 21",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          0,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      21,
    );
  },
);


test(
  "percentil 35 con 20 oficiales -> puesto 14",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          35,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      14,
    );
  },
);


test(
  "percentil 50 con 20 oficiales -> puesto 11",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          50,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      11,
    );
  },
);


test(
  "percentil 70 con 20 oficiales -> puesto 7",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          70,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      7,
    );
  },
);


test(
  "percentil 80 con 20 oficiales -> puesto 5",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          80,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      5,
    );
  },
);


test(
  "percentil 90 con 20 oficiales -> puesto 3",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          90,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.target_position,
      3,
    );
  },
);


test(
  "97% nunca entra número 1",
  () => {
    const result =
      placementPercentileToTargetPosition({
        placementPercentile:
          97,
        officialPlayerCount:
          20,
      });

    assert.equal(
      result.requested_position,
      1,
    );

    assert.equal(
      result.target_position,
      2,
    );

    assert.equal(
      result
        .protected_from_number_one,
      true,
    );
  },
);


test(
  "target Elo usa Elo real del puesto objetivo",
  () => {
    const result =
      getPlacementTargetElo({
        targetPosition:
          7,
        officialRanking:
          createOfficialRanking(
            20,
          ),
      });

    assert.equal(
      result.target_elo,
      1700,
    );

    assert.equal(
      result.reference_position,
      7,
    );
  },
);


test(
  "debajo de todos usa Elo del último oficial",
  () => {
    const result =
      getPlacementTargetElo({
        targetPosition:
          4,
        officialRanking: [
          {
            id: 1,
            position: 1,
            rating: 1700,
          },
          {
            id: 2,
            position: 2,
            rating: 1500,
          },
          {
            id: 3,
            position: 3,
            rating: 1200,
          },
        ],
      });

    assert.equal(
      result.target_elo,
      1200,
    );

    assert.equal(
      result.reference_position,
      3,
    );
  },
);


test(
  "Elo objetivo respeta piso 100",
  () => {
    const result =
      getPlacementTargetElo({
        targetPosition:
          2,
        officialRanking: [
          {
            id: 1,
            position: 1,
            rating: 90,
          },
        ],
      });

    assert.equal(
      result.target_elo,
      100,
    );

    assert.equal(
      result.used_floor,
      true,
    );
  },
);


test(
  "calculateCompletedPlacement exige 5 partidos",
  () => {
    assert.throws(
      () =>
        calculateCompletedPlacement({
          evidence:
            evidenceWithVictories(
              [50],
              4,
            ),
          officialRanking:
            createOfficialRanking(
              20,
            ),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "placement_not_complete",
        );

        return true;
      },
    );
  },
);


test(
  "placement completo 1 victoria vs 50",
  () => {
    const result =
      calculateCompletedPlacement({
        evidence:
          evidenceWithVictories(
            [50],
          ),
        officialRanking:
          createOfficialRanking(
            20,
          ),
      });

    approximatelyEqual(
      result.placement_percentile,
      37.7,
    );

    assert.equal(
      result.target_position,
      13,
    );

    assert.equal(
      result.target_elo,
      1400,
    );

    assert.equal(
      result.completed,
      true,
    );
  },
);


test(
  "placement completo 0/5 queda debajo",
  () => {
    const result =
      calculateCompletedPlacement({
        evidence: [
          defeat(),
          defeat(),
          defeat(),
          defeat(),
          defeat(),
        ],
        officialRanking:
          createOfficialRanking(
            20,
          ),
      });

    assert.equal(
      result.placement_percentile,
      0,
    );

    assert.equal(
      result.target_position,
      21,
    );

    assert.equal(
      result.target_elo,
      1050,
    );
  },
);


test(
  "placement completo nunca entra número 1",
  () => {
    const result =
      calculateCompletedPlacement({
        evidence:
          evidenceWithVictories(
            [
              100,
              100,
              100,
              100,
              100,
            ],
          ),
        officialRanking:
          createOfficialRanking(
            20,
          ),
      });

    assert.equal(
      result.placement_percentile,
      97,
    );

    assert.equal(
      result.target_position,
      2,
    );

    assert.equal(
      result
        .protected_from_number_one,
      true,
    );

    assert.equal(
      result.target_elo,
      1950,
    );
  },
);


test(
  "provisional congelado se usa sin descuento extra",
  () => {
    const official =
      calculatePlacementPercentile({
        evidence: [
          victory(
            68,
            "official",
          ),
          defeat(),
          defeat(),
          defeat(),
          defeat(),
        ],
      });

    const provisional =
      calculatePlacementPercentile({
        evidence: [
          victory(
            68,
            "provisional",
          ),
          defeat(),
          defeat(),
          defeat(),
          defeat(),
        ],
      });

    assert.equal(
      official
        .placement_percentile,
      provisional
        .placement_percentile,
    );
  },
);