import {
  calculateCompletedPlacement,
  calculatePlacementPercentile,
} from "../src/services/placementLevel.service.js";


const victory = (
  percentile,
  opponentId,
) => ({
  match_id:
    null,

  opponent_id:
    opponentId,

  won:
    true,

  opponent_percentile_at_match:
    percentile,

  opponent_reference_type:
    "official",
});


const defeat = (
  opponentId,
) => ({
  match_id:
    null,

  opponent_id:
    opponentId,

  won:
    false,

  /*
    Una derrota no aporta nivel.

    No necesitamos percentil del rival
    para calcular placement.
  */

  opponent_percentile_at_match:
    null,

  opponent_reference_type:
    "official",
});


const officialRanking =
  Array.from(
    {
      length:
        20,
    },
    (
      _,
      index,
    ) => ({
      id:
        index + 100,

      position:
        index + 1,

      rating:
        2000 -
        index * 50,
    }),
  );


const scenarios = [
  {
    name:
      "0/5 contra cualquiera",

    evidence: [
      defeat(1),
      defeat(2),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "1/5 - victoria contra 20%",

    evidence: [
      victory(
        20,
        1,
      ),
      defeat(2),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "1/5 - victoria contra 50%",

    evidence: [
      victory(
        50,
        1,
      ),
      defeat(2),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "1/5 - victoria contra 90%",

    evidence: [
      victory(
        90,
        1,
      ),
      defeat(2),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "2/5 - victorias 40% y 50%",

    evidence: [
      victory(
        40,
        1,
      ),
      victory(
        50,
        2,
      ),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "2/5 - victorias 80% y 90%",

    evidence: [
      victory(
        80,
        1,
      ),
      victory(
        90,
        2,
      ),
      defeat(3),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "3/5 - victorias 40/50/60",

    evidence: [
      victory(
        40,
        1,
      ),
      victory(
        50,
        2,
      ),
      victory(
        60,
        3,
      ),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "3/5 - victorias 70/80/90",

    evidence: [
      victory(
        70,
        1,
      ),
      victory(
        80,
        2,
      ),
      victory(
        90,
        3,
      ),
      defeat(4),
      defeat(5),
    ],
  },

  {
    name:
      "4/5 - victorias 40/50/60/70",

    evidence: [
      victory(
        40,
        1,
      ),
      victory(
        50,
        2,
      ),
      victory(
        60,
        3,
      ),
      victory(
        70,
        4,
      ),
      defeat(5),
    ],
  },

  {
    name:
      "4/5 - victorias 70/80/90/95",

    evidence: [
      victory(
        70,
        1,
      ),
      victory(
        80,
        2,
      ),
      victory(
        90,
        3,
      ),
      victory(
        95,
        4,
      ),
      defeat(5),
    ],
  },

  {
    name:
      "5/5 - rivales 10/20/30/40/50",

    evidence: [
      victory(
        10,
        1,
      ),
      victory(
        20,
        2,
      ),
      victory(
        30,
        3,
      ),
      victory(
        40,
        4,
      ),
      victory(
        50,
        5,
      ),
    ],
  },

  {
    name:
      "5/5 - rivales 40/50/60/70/80",

    evidence: [
      victory(
        40,
        1,
      ),
      victory(
        50,
        2,
      ),
      victory(
        60,
        3,
      ),
      victory(
        70,
        4,
      ),
      victory(
        80,
        5,
      ),
    ],
  },

  {
    name:
      "5/5 - rivales 70/80/85/90/95",

    evidence: [
      victory(
        70,
        1,
      ),
      victory(
        80,
        2,
      ),
      victory(
        85,
        3,
      ),
      victory(
        90,
        4,
      ),
      victory(
        95,
        5,
      ),
    ],
  },
];


console.log(
  "\n==============================================",
);

console.log(
  "LA RED - SIMULADOR DE NIVELATORIOS",
);

console.log(
  "==============================================\n",
);


for (
  const scenario of
  scenarios
) {
  const partial =
    calculatePlacementPercentile({
      evidence:
        scenario.evidence,
    });

  const completed =
    calculateCompletedPlacement({
      evidence:
        scenario.evidence,

      officialRanking,
    });

  console.log(
    scenario.name,
  );

  console.log({
    record:
      `${partial.wins}/${partial.matches_played}`,

    weighted:
      partial
        .weighted_victory_percentile,

    demonstrated:
      partial
        .demonstrated_level,

    factor:
      partial.win_factor,

    placement:
      partial
        .placement_percentile,

    target_position:
      completed
        .target_position,

    target_elo:
      completed
        .target_elo,
  });

  console.log(
    "----------------------------------------------",
  );
}


console.log(
  "\nSimulación terminada.\n",
);