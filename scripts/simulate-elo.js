const PLACEMENT_MATCHES = 5;
const PLACEMENT_K = 64;
const NORMAL_K = 32;

const OFFICIAL_ELO_FLOOR = 100;

const RANKED_LOSS_TO_PROVISIONAL_MIN = 200;
const RANKED_LOSS_TO_PROVISIONAL_PERCENT = 0.12;
const RANKED_LOSS_TO_PROVISIONAL_MAX = 300;

const DEFAULT_MATCHES = 25000;
const DEFAULT_INITIAL_PLAYERS = 40;
const DEFAULT_SEED = 20260908;

const NEW_PLAYER_EVERY = 175;


const parsePositiveInteger = (
  value,
  fallback,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : fallback;
};


const TOTAL_MATCHES =
  parsePositiveInteger(
    process.env.SIM_MATCHES,
    DEFAULT_MATCHES,
  );

const INITIAL_PLAYERS =
  parsePositiveInteger(
    process.env.SIM_PLAYERS,
    DEFAULT_INITIAL_PLAYERS,
  );

const parsedSeed =
  Number(
    process.env.SIM_SEED ??
      DEFAULT_SEED,
  );

const SEED =
  Number.isInteger(parsedSeed)
    ? parsedSeed
    : DEFAULT_SEED;


/*
  ============================================================
  RANDOM DETERMINÍSTICO
  ============================================================
*/

const createRandom = (
  seed,
) => {
  let state =
    seed >>> 0;

  return () => {
    state +=
      0x6d2b79f5;

    let value =
      state;

    value =
      Math.imul(
        value ^
          (
            value >>>
            15
          ),
        value | 1,
      );

    value ^=
      value +
      Math.imul(
        value ^
          (
            value >>>
            7
          ),
        value | 61,
      );

    return (
      (
        value ^
        (
          value >>>
          14
        )
      ) >>>
      0
    ) /
      4294967296;
  };
};


const random =
  createRandom(
    SEED,
  );


const randomInt = (
  min,
  max,
) =>
  Math.floor(
    random() *
      (
        max -
        min +
        1
      ),
  ) + min;


/*
  ============================================================
  ERROR DE SIMULACIÓN
  ============================================================
*/

class SimulationError extends Error {
  constructor(
    code,
    message,
    details = {},
  ) {
    super(message);

    this.name =
      "SimulationError";

    this.code =
      code;

    this.details =
      details;
  }
}


const assert = (
  condition,
  code,
  message,
  details = {},
) => {
  if (!condition) {
    throw new SimulationError(
      code,
      message,
      details,
    );
  }
};


/*
  ============================================================
  ELO
  ============================================================
*/

const isProvisional = (
  matchesPlayed,
) =>
  matchesPlayed <
  PLACEMENT_MATCHES;


const expectedScore = (
  ownRating,
  opponentRating,
) =>
  1 /
  (
    1 +
    10 **
      (
        (
          opponentRating -
          ownRating
        ) /
        400
      )
  );


const normalEloChange = ({
  ownRating,
  opponentRating,
  k,
  won,
}) =>
  Math.round(
    k *
      (
        (
          won
            ? 1
            : 0
        ) -
        expectedScore(
          ownRating,
          opponentRating,
        )
      ),
  );


const getRankedLossToProvisionalPenalty =
  (rating) =>
    Math.min(
      RANKED_LOSS_TO_PROVISIONAL_MAX,

      Math.max(
        RANKED_LOSS_TO_PROVISIONAL_MIN,

        Math.round(
          rating *
            RANKED_LOSS_TO_PROVISIONAL_PERCENT,
        ),
      ),
    );


/*
  ============================================================
  PLAYERS
  ============================================================
*/

let nextPlayerId = 1;


const createPlayer = ({
  rating = 0,
  matchesPlayed = 0,
  hiddenSkill = null,
}) => {
  const id =
    nextPlayerId++;

  return {
    id,

    name:
      `Jugador ${id}`,

    rating,

    matchesPlayed,

    hiddenSkill:
      hiddenSkill ??
      randomInt(
        900,
        2600,
      ),

    wins: 0,
    losses: 0,

    highestRating:
      rating,

    lowestRating:
      rating,

    placementFloorApplications:
      0,
  };
};


/*
  ============================================================
  RANKING
  ============================================================
*/

const getOfficialRanking = (
  players,
) =>
  players
    .filter(
      (player) =>
        player.matchesPlayed >=
        PLACEMENT_MATCHES,
    )
    .slice()
    .sort(
      (
        a,
        b,
      ) => {
        if (
          a.rating !==
          b.rating
        ) {
          return (
            b.rating -
            a.rating
          );
        }

        if (
          a.matchesPlayed !==
          b.matchesPlayed
        ) {
          return (
            b.matchesPlayed -
            a.matchesPlayed
          );
        }

        return (
          a.id -
          b.id
        );
      },
    );


/*
  ============================================================
  RESULTADO DEPORTIVO
  ============================================================
*/

const chooseWinner = (
  player1,
  player2,
) =>
  random() <
  expectedScore(
    player1.hiddenSkill,
    player2.hiddenSkill,
  )
    ? player1
    : player2;


/*
  ============================================================
  STATS
  ============================================================
*/

const stats = {
  matches:
    0,

  rankedVsRanked:
    0,

  provisionalVsProvisional:
    0,

  rankedBeatsProvisional:
    0,

  provisionalBeatsRanked:
    0,

  placementsCompleted:
    0,

  placementFloorApplications:
    0,

  placementFloorPoints:
    0,

  numberOneLosses:
    0,

  numberOneDethronesApplied:
    0,

  numberOneBelow100:
    0,

  maxWinnerGain:
    0,

  maxLoserLoss:
    0,

  maxPlacementFloor:
    0,

  playersAdded:
    0,
};


/*
  ============================================================
  CÁLCULO
  ============================================================
*/

const calculateMatch = ({
  winner,
  loser,
  rankingBefore,
}) => {
  const winnerRating =
    winner.rating;

  const loserRating =
    loser.rating;

  const winnerProvisional =
    isProvisional(
      winner.matchesPlayed,
    );

  const loserProvisional =
    isProvisional(
      loser.matchesPlayed,
    );

  const loserRankIndex =
    rankingBefore.findIndex(
      (player) =>
        player.id ===
        loser.id,
    );

  const loserWasNumberOne =
    loserRankIndex === 0;

  const numberTwoBefore =
    rankingBefore[1] ??
    null;

  let winnerAfterMatch =
    winnerRating;

  let loserAfterMatch =
    loserRating;

  let specialPenalty =
    null;

  /*
    GANADOR
  */

  if (
    winnerProvisional &&
    loserProvisional
  ) {
    winnerAfterMatch =
      Math.max(
        0,

        winnerRating +
          normalEloChange({
            ownRating:
              winnerRating,

            opponentRating:
              loserRating,

            k:
              PLACEMENT_K,

            won:
              true,
          }),
      );
  }

  else if (
    winnerProvisional &&
    !loserProvisional
  ) {
    const gap =
      Math.max(
        0,
        loserRating -
          winnerRating,
      );

    const bonus =
      Math.min(
        236,

        Math.round(
          gap *
            0.18,
        ),
      );

    winnerAfterMatch =
      winnerRating +
      Math.min(
        300,
        PLACEMENT_K +
          bonus,
      );
  }

  else {
    winnerAfterMatch =
      Math.max(
        OFFICIAL_ELO_FLOOR,

        winnerRating +
          normalEloChange({
            ownRating:
              winnerRating,

            opponentRating:
              loserRating,

            k:
              NORMAL_K,

            won:
              true,
          }),
      );
  }

  /*
    PERDEDOR
  */

  if (
    loserProvisional
  ) {
    const lossK =
      winnerProvisional
        ? PLACEMENT_K
        : NORMAL_K;

    loserAfterMatch =
      Math.max(
        0,

        loserRating +
          normalEloChange({
            ownRating:
              loserRating,

            opponentRating:
              winnerRating,

            k:
              lossK,

            won:
              false,
          }),
      );
  }

  else if (
    winnerProvisional
  ) {
    specialPenalty =
      getRankedLossToProvisionalPenalty(
        loserRating,
      );

    loserAfterMatch =
      Math.max(
        OFFICIAL_ELO_FLOOR,

        loserRating -
          specialPenalty,
      );
  }

  else {
    const calculated =
      loserRating +
      normalEloChange({
        ownRating:
          loserRating,

        opponentRating:
          winnerRating,

        k:
          NORMAL_K,

        won:
          false,
      });

    if (
      loserRating >=
      OFFICIAL_ELO_FLOOR
    ) {
      loserAfterMatch =
        Math.max(
          OFFICIAL_ELO_FLOOR,
          calculated,
        );
    } else {
      loserAfterMatch =
        Math.max(
          0,
          calculated,
        );
    }
  }

  /*
    #1
  */

  let dethroneApplied =
    false;

  let dethroneCeiling =
    null;

  if (
    loserWasNumberOne &&
    numberTwoBefore
  ) {
    dethroneCeiling =
      numberTwoBefore.rating -
      1;

    if (
      loserAfterMatch >
      dethroneCeiling
    ) {
      loserAfterMatch =
        dethroneCeiling;

      dethroneApplied =
        true;
    }
  }

  const winnerDelta =
    winnerAfterMatch -
    winnerRating;

  const loserDelta =
    loserAfterMatch -
    loserRating;

  return {
    winnerRating,
    loserRating,

    winnerProvisional,
    loserProvisional,

    winnerAfterMatch,
    loserAfterMatch,

    winnerDelta,
    loserDelta,

    specialPenalty,

    loserWasNumberOne,
    numberTwoBefore,

    dethroneApplied,
    dethroneCeiling,
  };
};


/*
  ============================================================
  VALIDAR MATCH
  ============================================================
*/

const validateMatchResult = (
  result,
) => {
  assert(
    Number.isInteger(
      result.winnerAfterMatch,
    ),

    "WINNER_ELO_NOT_INTEGER",

    "El Elo del ganador no es entero.",

    result,
  );

  assert(
    Number.isInteger(
      result.loserAfterMatch,
    ),

    "LOSER_ELO_NOT_INTEGER",

    "El Elo del perdedor no es entero.",

    result,
  );

  assert(
    result.winnerAfterMatch >= 0,

    "WINNER_NEGATIVE_ELO",

    "Ganador con Elo negativo.",

    result,
  );

  assert(
    result.loserAfterMatch >= 0,

    "LOSER_NEGATIVE_ELO",

    "Perdedor con Elo negativo.",

    result,
  );

  assert(
    result.winnerDelta >= 0,

    "WINNER_LOST_ELO",

    "El ganador perdió Elo.",

    result,
  );

  assert(
    result.loserDelta <= 0,

    "LOSER_GAINED_ELO",

    "El perdedor ganó Elo dentro del cálculo del partido.",

    result,
  );

  if (
    result.winnerProvisional &&
    result.loserProvisional
  ) {
    const expectedWinner =
      Math.max(
        0,

        result.winnerRating +
          normalEloChange({
            ownRating:
              result.winnerRating,

            opponentRating:
              result.loserRating,

            k:
              PLACEMENT_K,

            won:
              true,
          }),
      );

    const expectedLoser =
      Math.max(
        0,

        result.loserRating +
          normalEloChange({
            ownRating:
              result.loserRating,

            opponentRating:
              result.winnerRating,

            k:
              PLACEMENT_K,

            won:
              false,
          }),
      );

    assert(
      result.winnerAfterMatch ===
        expectedWinner,

      "PROV_VS_PROV_WINNER_NOT_K64",

      "Ganador provisional no utilizó K64.",

      result,
    );

    assert(
      result.loserAfterMatch ===
        expectedLoser,

      "PROV_VS_PROV_LOSER_NOT_K64",

      "Perdedor provisional no utilizó K64.",

      result,
    );
  }

  if (
    result.winnerProvisional &&
    !result.loserProvisional
  ) {
    const gap =
      Math.max(
        0,

        result.loserRating -
          result.winnerRating,
      );

    const expectedGain =
      Math.min(
        300,

        64 +
          Math.min(
            236,

            Math.round(
              gap *
                0.18,
            ),
          ),
      );

    assert(
      result.winnerDelta ===
        expectedGain,

      "PROVISIONAL_UPSET_GAIN_INVALID",

      "Ganancia provisional contra oficial incorrecta.",

      {
        expectedGain,
        result,
      },
    );

    const expectedPenalty =
      getRankedLossToProvisionalPenalty(
        result.loserRating,
      );

    assert(
      result.specialPenalty ===
        expectedPenalty,

      "PROVISIONAL_UPSET_PENALTY_INVALID",

      "Penalización de oficial contra provisional incorrecta.",

      {
        expectedPenalty,
        result,
      },
    );
  }

  if (
    result.loserWasNumberOne &&
    result.numberTwoBefore
  ) {
    const ceiling =
      result
        .numberTwoBefore
        .rating - 1;

    assert(
      result.loserAfterMatch <=
        ceiling,

      "NUMBER_ONE_NOT_DETHRONED",

      "El #1 derrotado quedó por encima del techo permitido.",

      {
        ceiling,
        result,
      },
    );
  }
};


/*
  ============================================================
  APLICAR MATCH
  ============================================================
*/

const applyMatch = ({
  players,
  winner,
  loser,
}) => {
  assert(
    winner.id !==
      loser.id,

    "SELF_MATCH",

    "Un jugador no puede enfrentarse a sí mismo.",
  );

  const rankingBefore =
    getOfficialRanking(
      players,
    );

  const winnerMatchesBefore =
    winner.matchesPlayed;

  const loserMatchesBefore =
    loser.matchesPlayed;

  const result =
    calculateMatch({
      winner,
      loser,
      rankingBefore,
    });

  validateMatchResult(
    result,
  );

  const winnerMatchesAfter =
    winnerMatchesBefore + 1;

  const loserMatchesAfter =
    loserMatchesBefore + 1;

  const winnerCompletedPlacement =
    result.winnerProvisional &&
    winnerMatchesAfter ===
      PLACEMENT_MATCHES;

  const loserCompletedPlacement =
    result.loserProvisional &&
    loserMatchesAfter ===
      PLACEMENT_MATCHES;

  /*
    NORMALIZACIÓN DE GRADUACIÓN
  */

  const winnerFloorAdjustment =
    winnerCompletedPlacement &&
    result.winnerAfterMatch <
      OFFICIAL_ELO_FLOOR
      ? OFFICIAL_ELO_FLOOR -
        result.winnerAfterMatch
      : 0;

  const loserFloorAdjustment =
    loserCompletedPlacement &&
    result.loserAfterMatch <
      OFFICIAL_ELO_FLOOR
      ? OFFICIAL_ELO_FLOOR -
        result.loserAfterMatch
      : 0;

  const winnerFinalRating =
    result.winnerAfterMatch +
    winnerFloorAdjustment;

  const loserFinalRating =
    result.loserAfterMatch +
    loserFloorAdjustment;

  winner.rating =
    winnerFinalRating;

  loser.rating =
    loserFinalRating;

  winner.matchesPlayed =
    winnerMatchesAfter;

  loser.matchesPlayed =
    loserMatchesAfter;

  winner.wins += 1;
  loser.losses += 1;

  winner.highestRating =
    Math.max(
      winner.highestRating,
      winner.rating,
    );

  winner.lowestRating =
    Math.min(
      winner.lowestRating,
      winner.rating,
    );

  loser.highestRating =
    Math.max(
      loser.highestRating,
      loser.rating,
    );

  loser.lowestRating =
    Math.min(
      loser.lowestRating,
      loser.rating,
    );

  if (
    winnerCompletedPlacement
  ) {
    stats
      .placementsCompleted +=
      1;

    assert(
      winner.rating >=
        OFFICIAL_ELO_FLOOR,

      "WINNER_GRADUATED_BELOW_FLOOR",

      "Ganador terminó placement debajo de Elo 100.",

      {
        winner,
        result,
      },
    );
  }

  if (
    loserCompletedPlacement
  ) {
    stats
      .placementsCompleted +=
      1;

    assert(
      loser.rating >=
        OFFICIAL_ELO_FLOOR,

      "LOSER_GRADUATED_BELOW_FLOOR",

      "Perdedor terminó placement debajo de Elo 100.",

      {
        loser,
        result,
      },
    );
  }

  if (
    winnerFloorAdjustment >
    0
  ) {
    winner
      .placementFloorApplications +=
      1;

    stats
      .placementFloorApplications +=
      1;

    stats
      .placementFloorPoints +=
      winnerFloorAdjustment;

    stats.maxPlacementFloor =
      Math.max(
        stats.maxPlacementFloor,
        winnerFloorAdjustment,
      );
  }

  if (
    loserFloorAdjustment >
    0
  ) {
    loser
      .placementFloorApplications +=
      1;

    stats
      .placementFloorApplications +=
      1;

    stats
      .placementFloorPoints +=
      loserFloorAdjustment;

    stats.maxPlacementFloor =
      Math.max(
        stats.maxPlacementFloor,
        loserFloorAdjustment,
      );
  }

  /*
    TIPOS
  */

  if (
    result.winnerProvisional &&
    result.loserProvisional
  ) {
    stats
      .provisionalVsProvisional +=
      1;
  }

  else if (
    result.winnerProvisional &&
    !result.loserProvisional
  ) {
    stats
      .provisionalBeatsRanked +=
      1;
  }

  else if (
    !result.winnerProvisional &&
    result.loserProvisional
  ) {
    stats
      .rankedBeatsProvisional +=
      1;
  }

  else {
    stats
      .rankedVsRanked +=
      1;
  }

  if (
    result.loserWasNumberOne
  ) {
    stats
      .numberOneLosses +=
      1;

    if (
      result.dethroneApplied
    ) {
      stats
        .numberOneDethronesApplied +=
        1;
    }

    if (
      loser.rating <
      OFFICIAL_ELO_FLOOR
    ) {
      stats
        .numberOneBelow100 +=
        1;
    }
  }

  stats.maxWinnerGain =
    Math.max(
      stats.maxWinnerGain,
      result.winnerDelta,
    );

  stats.maxLoserLoss =
    Math.max(
      stats.maxLoserLoss,
      Math.abs(
        result.loserDelta,
      ),
    );

  stats.matches += 1;

  return {
    ...result,

    winnerFloorAdjustment,
    loserFloorAdjustment,

    winnerFinalRating,
    loserFinalRating,

    winnerMatchesAfter,
    loserMatchesAfter,
  };
};


/*
  ============================================================
  ESCENARIOS FORZADOS
  ============================================================
*/

const runForcedScenarios =
  () => {
    /*
      PROV vs PROV
      Elo iguales => +/-32 con K64.
    */

    {
      const winner =
        createPlayer({
          rating:
            200,

          matchesPlayed:
            2,
        });

      const loser =
        createPlayer({
          rating:
            200,

          matchesPlayed:
            2,
        });

      const result =
        applyMatch({
          players: [
            winner,
            loser,
          ],

          winner,
          loser,
        });

      assert(
        result.winnerDelta ===
          32,

        "FORCED_PROV_WIN",

        "PROV vs PROV debería producir +32 para ganador.",

        result,
      );

      assert(
        result.loserDelta ===
          -32,

        "FORCED_PROV_LOSS",

        "PROV vs PROV debería producir -32 para perdedor.",

        result,
      );
    }

    /*
      PROV Elo 0 derrota Elo 2000.
    */

    {
      const provisional =
        createPlayer({
          rating:
            0,

          matchesPlayed:
            1,
        });

      const ranked =
        createPlayer({
          rating:
            2000,

          matchesPlayed:
            20,
        });

      const leader =
        createPlayer({
          rating:
            2300,

          matchesPlayed:
            20,
        });

      const result =
        applyMatch({
          players: [
            provisional,
            ranked,
            leader,
          ],

          winner:
            provisional,

          loser:
            ranked,
        });

      assert(
        result.winnerDelta ===
          300,

        "FORCED_PROV_UPSET_GAIN",

        "Provisional Elo 0 contra Elo 2000 debe ganar 300.",

        result,
      );

      assert(
        result.specialPenalty ===
          240,

        "FORCED_PROV_UPSET_PENALTY",

        "Elo 2000 debe perder 240 contra provisional.",

        result,
      );
    }

    /*
      QUINTO PARTIDO:
      jugador puede terminar cálculo
      debajo de 100, pero debe graduarse
      en mínimo 100.
    */

    {
      const loser =
        createPlayer({
          rating:
            0,

          matchesPlayed:
            4,

          hiddenSkill:
            900,
        });

      const winner =
        createPlayer({
          rating:
            500,

          matchesPlayed:
            10,

          hiddenSkill:
            2400,
        });

      const result =
        applyMatch({
          players: [
            winner,
            loser,
          ],

          winner,
          loser,
        });

      assert(
        loser.matchesPlayed ===
          5,

        "FORCED_PLACEMENT_MATCH_COUNT",

        "No completó exactamente 5 partidos.",

        result,
      );

      assert(
        loser.rating ===
          100,

        "FORCED_PLACEMENT_FLOOR",

        "Jugador que completa placement debajo de 100 debe graduarse en 100.",

        result,
      );

      assert(
        result.loserDelta <=
          0,

        "FORCED_PLACEMENT_LOSER_GAINED_MATCH_ELO",

        "La derrota del quinto partido no puede sumar Elo de partido.",

        result,
      );

      assert(
        result.loserFloorAdjustment ===
          100,

        "FORCED_PLACEMENT_NORMALIZATION",

        "La normalización de graduación esperada era +100.",

        result,
      );
    }

    /*
      #1
    */

    {
      const leader =
        createPlayer({
          rating:
            3000,

          matchesPlayed:
            40,
        });

      const second =
        createPlayer({
          rating:
            2840,

          matchesPlayed:
            40,
        });

      const winner =
        createPlayer({
          rating:
            2500,

          matchesPlayed:
            40,
        });

      const result =
        applyMatch({
          players: [
            leader,
            second,
            winner,
          ],

          winner,
          loser:
            leader,
        });

      assert(
        result.loserAfterMatch <=
          2839,

        "FORCED_NUMBER_ONE",

        "El antiguo #1 debería terminar como máximo en 2839.",

        result,
      );
    }

    /*
      PENALIZACIÓN MÍNIMA
    */

    {
      const provisional =
        createPlayer({
          rating:
            500,

          matchesPlayed:
            2,
        });

      const ranked =
        createPlayer({
          rating:
            1000,

          matchesPlayed:
            10,
        });

      const leader =
        createPlayer({
          rating:
            1500,

          matchesPlayed:
            10,
        });

      const result =
        applyMatch({
          players: [
            provisional,
            ranked,
            leader,
          ],

          winner:
            provisional,

          loser:
            ranked,
        });

      assert(
        result.specialPenalty ===
          200,

        "FORCED_MIN_PENALTY",

        "Penalización mínima debe ser 200.",

        result,
      );
    }

    /*
      PENALIZACIÓN MÁXIMA
    */

    {
      const provisional =
        createPlayer({
          rating:
            800,

          matchesPlayed:
            2,
        });

      const ranked =
        createPlayer({
          rating:
            3000,

          matchesPlayed:
            30,
        });

      const leader =
        createPlayer({
          rating:
            3300,

          matchesPlayed:
            30,
        });

      const result =
        applyMatch({
          players: [
            provisional,
            ranked,
            leader,
          ],

          winner:
            provisional,

          loser:
            ranked,
        });

      assert(
        result.specialPenalty ===
          300,

        "FORCED_MAX_PENALTY",

        "Penalización máxima debe ser 300.",

        result,
      );
    }
  };


/*
  ============================================================
  LIGA INICIAL
  ============================================================
*/

const createInitialLeague =
  () => {
    const players = [];

    for (
      let index = 0;
      index <
      INITIAL_PLAYERS;
      index++
    ) {
      const hiddenSkill =
        randomInt(
          900,
          2600,
        );

      const rating =
        Math.max(
          OFFICIAL_ELO_FLOOR,

          hiddenSkill +
            randomInt(
              -250,
              250,
            ),
        );

      players.push(
        createPlayer({
          rating,

          matchesPlayed:
            randomInt(
              5,
              80,
            ),

          hiddenSkill,
        }),
      );
    }

    return players;
  };


const addNewPlayer = (
  players,
) => {
  players.push(
    createPlayer({
      rating:
        0,

      matchesPlayed:
        0,

      hiddenSkill:
        randomInt(
          900,
          2800,
        ),
    }),
  );

  stats.playersAdded +=
    1;
};


/*
  ============================================================
  RIVALES
  ============================================================
*/

const pickTwoPlayers = (
  players,
) => {
  const firstIndex =
    randomInt(
      0,
      players.length - 1,
    );

  let secondIndex =
    randomInt(
      0,
      players.length - 1,
    );

  while (
    secondIndex ===
    firstIndex
  ) {
    secondIndex =
      randomInt(
        0,
        players.length - 1,
      );
  }

  return [
    players[firstIndex],
    players[secondIndex],
  ];
};


/*
  ============================================================
  VALIDACIÓN GLOBAL
  ============================================================
*/

const validateLeague = (
  players,
) => {
  for (
    const player of players
  ) {
    assert(
      Number.isInteger(
        player.rating,
      ),

      "GLOBAL_RATING_NOT_INTEGER",

      "Jugador con Elo no entero.",

      player,
    );

    assert(
      player.rating >= 0,

      "GLOBAL_NEGATIVE_ELO",

      "Jugador con Elo negativo.",

      player,
    );

    assert(
      Number.isInteger(
        player.matchesPlayed,
      ) &&
        player.matchesPlayed >= 0,

      "GLOBAL_MATCH_COUNT_INVALID",

      "matches_played inválido.",

      player,
    );

    /*
      Todo oficial debería tener mínimo
      100 salvo el único edge case que
      puede producir la regla literal
      del antiguo #1.
    */

    if (
      player.matchesPlayed >=
        PLACEMENT_MATCHES &&
      player.rating <
        OFFICIAL_ELO_FLOOR
    ) {
      assert(
        stats.numberOneBelow100 >
          0,

        "OFFICIAL_BELOW_FLOOR_WITHOUT_NUMBER_ONE_RULE",

        "Hay un oficial debajo de 100 sin haber detectado la excepción del #1.",

        player,
      );
    }
  }

  const ranking =
    getOfficialRanking(
      players,
    );

  for (
    let index = 1;
    index <
    ranking.length;
    index++
  ) {
    const previous =
      ranking[
        index - 1
      ];

    const current =
      ranking[index];

    const correctlyOrdered =
      previous.rating >
        current.rating ||
      (
        previous.rating ===
          current.rating &&
        previous.matchesPlayed >
          current.matchesPlayed
      ) ||
      (
        previous.rating ===
          current.rating &&
        previous.matchesPlayed ===
          current.matchesPlayed &&
        previous.id <
          current.id
      );

    assert(
      correctlyOrdered,

      "RANKING_ORDER_INVALID",

      "Ranking ordenado incorrectamente.",

      {
        previous,
        current,
      },
    );
  }
};


/*
  ============================================================
  SIMULACIÓN
  ============================================================
*/

const runMassSimulation =
  () => {
    const players =
      createInitialLeague();

    for (
      let matchNumber = 1;
      matchNumber <=
      TOTAL_MATCHES;
      matchNumber++
    ) {
      if (
        matchNumber %
          NEW_PLAYER_EVERY ===
        0
      ) {
        addNewPlayer(
          players,
        );
      }

      const [
        player1,
        player2,
      ] =
        pickTwoPlayers(
          players,
        );

      const winner =
        chooseWinner(
          player1,
          player2,
        );

      const loser =
        winner.id ===
        player1.id
          ? player2
          : player1;

      applyMatch({
        players,
        winner,
        loser,
      });

      if (
        matchNumber % 250 ===
        0
      ) {
        validateLeague(
          players,
        );
      }
    }

    validateLeague(
      players,
    );

    return players;
  };


/*
  ============================================================
  REPORTE
  ============================================================
*/

const printSummary = (
  players,
) => {
  const ranking =
    getOfficialRanking(
      players,
    );

  const provisionalCount =
    players.filter(
      (player) =>
        isProvisional(
          player.matchesPlayed,
        ),
    ).length;

  console.log("");
  console.log(
    "============================================================",
  );

  console.log(
    "SIMULACIÓN ELO - LIGA DE TENIS SAN PEDRO",
  );

  console.log(
    "============================================================",
  );

  console.log(
    `Seed: ${SEED}`,
  );

  console.log(
    `Partidos masivos: ${TOTAL_MATCHES}`,
  );

  console.log(
    `Partidos totales incluyendo casos forzados: ${stats.matches}`,
  );

  console.log(
    `Jugadores finales: ${players.length}`,
  );

  console.log(
    `Oficiales: ${ranking.length}`,
  );

  console.log(
    `Provisionals: ${provisionalCount}`,
  );

  console.log("");

  console.log(
    "TIPOS DE PARTIDO",
  );

  console.log(
    `Ranked vs ranked: ${stats.rankedVsRanked}`,
  );

  console.log(
    `Provisional vs provisional: ${stats.provisionalVsProvisional}`,
  );

  console.log(
    `Ranked vence provisional: ${stats.rankedBeatsProvisional}`,
  );

  console.log(
    `Provisional vence ranked: ${stats.provisionalBeatsRanked}`,
  );

  console.log("");

  console.log(
    "PLACEMENT",
  );

  console.log(
    `Graduaciones: ${stats.placementsCompleted}`,
  );

  console.log(
    `Aplicaciones de piso 100: ${stats.placementFloorApplications}`,
  );

  console.log(
    `Puntos totales de normalización: ${stats.placementFloorPoints}`,
  );

  console.log(
    `Mayor normalización individual: +${stats.maxPlacementFloor}`,
  );

  console.log("");

  console.log(
    "REGLA #1",
  );

  console.log(
    `Derrotas del #1: ${stats.numberOneLosses}`,
  );

  console.log(
    `Techo aplicado: ${stats.numberOneDethronesApplied}`,
  );

  console.log(
    `Casos debajo de 100 por regla #1: ${stats.numberOneBelow100}`,
  );

  console.log("");

  console.log(
    "EXTREMOS",
  );

  console.log(
    `Mayor ganancia de partido: +${stats.maxWinnerGain}`,
  );

  console.log(
    `Mayor pérdida de partido: -${stats.maxLoserLoss}`,
  );

  console.log("");

  console.log(
    "TOP 10 FINAL",
  );

  console.table(
    ranking
      .slice(
        0,
        10,
      )
      .map(
        (
          player,
          index,
        ) => ({
          position:
            index + 1,

          id:
            player.id,

          rating:
            player.rating,

          matches:
            player.matchesPlayed,

          wins:
            player.wins,

          losses:
            player.losses,

          hidden_skill:
            player.hiddenSkill,
        }),
      ),
  );

  console.log("");

  if (
    stats.numberOneBelow100 >
    0
  ) {
    console.warn(
      "⚠ EDGE CASE: la regla literal del #1 produjo Elo oficial debajo de 100.",
    );
  }

  console.log(
    "✅ SIMULACIÓN FINALIZADA SIN VIOLAR INVARIANTES.",
  );

  console.log(
    "============================================================",
  );
};


/*
  ============================================================
  MAIN
  ============================================================
*/

const main = () => {
  console.log(
    `Iniciando simulación Elo con seed ${SEED}...`,
  );

  console.log(
    "Ejecutando escenarios forzados...",
  );

  runForcedScenarios();

  console.log(
    `Ejecutando ${TOTAL_MATCHES} partidos masivos...`,
  );

  const players =
    runMassSimulation();

  printSummary(
    players,
  );
};


try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "============================================================",
  );

  console.error(
    "❌ FALLÓ LA SIMULACIÓN ELO",
  );

  console.error(
    "============================================================",
  );

  if (
    error instanceof
    SimulationError
  ) {
    console.error(
      `Código: ${error.code}`,
    );

    console.error(
      `Mensaje: ${error.message}`,
    );

    console.error(
      "Detalles:",
    );

    console.dir(
      error.details,
      {
        depth:
          null,
      },
    );
  } else {
    console.error(
      error,
    );
  }

  console.error(
    `Seed reproducible: ${SEED}`,
  );

  console.error(
    "============================================================",
  );

  process.exitCode = 1;
}