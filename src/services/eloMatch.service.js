/*
  ============================================================
  MOTOR CENTRAL DE ELO
  ============================================================

  Este archivo contiene exclusivamente reglas deportivas.

  No:
  - consulta base de datos
  - actualiza usuarios
  - crea eventos
  - abre transacciones

  Sí:
  - calcula Elo de partidos
  - calcula placement
  - aplica regla especial contra provisional
  - aplica regla #1
  - calcula rechazo de desafío

  Lo usan:
  - confirmación normal de partido
  - replay histórico
  - simuladores
  - auditoría de integridad
  ============================================================
*/


/*
  ============================================================
  CONSTANTES
  ============================================================
*/

export const PLACEMENT_MATCHES = 5;

export const PLACEMENT_K = 64;

export const NORMAL_K = 32;

export const OFFICIAL_ELO_FLOOR = 100;

export const CHALLENGE_REJECTION_PENALTY = 8;

export const RANKED_LOSS_TO_PROVISIONAL_MIN = 200;

export const RANKED_LOSS_TO_PROVISIONAL_PERCENT = 0.12;

export const RANKED_LOSS_TO_PROVISIONAL_MAX = 300;

export const PLACEMENT_BEATS_RANKED_BASE = 64;

export const PLACEMENT_BEATS_RANKED_PERCENT = 0.18;

export const PLACEMENT_BEATS_RANKED_MAX_TOTAL = 300;


/*
  ============================================================
  ERROR DEL MOTOR
  ============================================================
*/

export class EloCalculationError extends Error {
  constructor(
    message,
    reason = "elo_calculation_error",
    details = null,
  ) {
    super(message);

    this.name =
      "EloCalculationError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  HELPERS NUMÉRICOS
  ============================================================
*/

const toInteger =
  (
    value,
    fieldName,
  ) => {
    const number =
      Number(value);

    if (
      !Number.isInteger(number)
    ) {
      throw new EloCalculationError(
        `El campo ${fieldName} debe ser un número entero.`,
        "invalid_integer",
        {
          field:
            fieldName,

          value,
        },
      );
    }

    return number;
  };


const assertNonNegativeInteger =
  (
    value,
    fieldName,
  ) => {
    const number =
      toInteger(
        value,
        fieldName,
      );

    if (
      number < 0
    ) {
      throw new EloCalculationError(
        `El campo ${fieldName} no puede ser negativo.`,
        "negative_integer",
        {
          field:
            fieldName,

          value:
            number,
        },
      );
    }

    return number;
  };


const normalizePlayer =
  (
    player,
    label,
  ) => {
    if (
      !player ||
      typeof player !==
        "object"
    ) {
      throw new EloCalculationError(
        `Falta el jugador ${label}.`,
        "invalid_player",
        {
          label,
        },
      );
    }

    return {
      ...player,

      id:
        toInteger(
          player.id,
          `${label}.id`,
        ),

      rating:
        assertNonNegativeInteger(
          player.rating,
          `${label}.rating`,
        ),

      matches_played:
        assertNonNegativeInteger(
          player.matches_played,
          `${label}.matches_played`,
        ),
    };
  };


const normalizeRanking =
  (
    rankingBefore = [],
  ) => {
    if (
      !Array.isArray(
        rankingBefore,
      )
    ) {
      throw new EloCalculationError(
        "El ranking previo debe ser un array.",
        "invalid_ranking_snapshot",
      );
    }

    return rankingBefore
      .map(
        (
          player,
          index,
        ) => ({
          ...player,

          id:
            toInteger(
              player.id,
              `rankingBefore[${index}].id`,
            ),

          rating:
            assertNonNegativeInteger(
              player.rating,
              `rankingBefore[${index}].rating`,
            ),

          matches_played:
            assertNonNegativeInteger(
              player.matches_played,
              `rankingBefore[${index}].matches_played`,
            ),

          position:
            toInteger(
              player.position,
              `rankingBefore[${index}].position`,
            ),
        }),
      )
      .sort(
        (a, b) =>
          a.position -
          b.position,
      );
  };


/*
  ============================================================
  PROVISIONAL
  ============================================================
*/

export const isProvisional =
  (
    matchesPlayed,
  ) => {
    const matches =
      assertNonNegativeInteger(
        matchesPlayed,
        "matchesPlayed",
      );

    return (
      matches <
      PLACEMENT_MATCHES
    );
  };


/*
  ============================================================
  EXPECTATIVA ELO
  ============================================================
*/

export const expectedScore =
  (
    ownRating,
    opponentRating,
  ) => {
    const own =
      assertNonNegativeInteger(
        ownRating,
        "ownRating",
      );

    const opponent =
      assertNonNegativeInteger(
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


/*
  ============================================================
  CAMBIO ELO TRADICIONAL
  ============================================================
*/

export const normalEloChange =
  ({
    ownRating,
    opponentRating,
    k,
    won,
  }) => {
    const own =
      assertNonNegativeInteger(
        ownRating,
        "ownRating",
      );

    const opponent =
      assertNonNegativeInteger(
        opponentRating,
        "opponentRating",
      );

    const normalizedK =
      assertNonNegativeInteger(
        k,
        "k",
      );

    if (
      typeof won !==
      "boolean"
    ) {
      throw new EloCalculationError(
        "won debe ser boolean.",
        "invalid_match_result",
      );
    }

    const expected =
      expectedScore(
        own,
        opponent,
      );

    return Math.round(
      normalizedK *
        (
          (
            won
              ? 1
              : 0
          ) -
          expected
        ),
    );
  };


/*
  ============================================================
  PENALIZACIÓN:
  OFICIAL PIERDE CONTRA PROVISIONAL
  ============================================================
*/

export const getRankedLossToProvisionalPenalty =
  (
    rating,
  ) => {
    const normalizedRating =
      assertNonNegativeInteger(
        rating,
        "rating",
      );

    const percentage =
      Math.round(
        normalizedRating *
          RANKED_LOSS_TO_PROVISIONAL_PERCENT,
      );

    return Math.min(
      RANKED_LOSS_TO_PROVISIONAL_MAX,

      Math.max(
        RANKED_LOSS_TO_PROVISIONAL_MIN,
        percentage,
      ),
    );
  };


/*
  ============================================================
  BONUS:
  PROVISIONAL VENCE A OFICIAL
  ============================================================
*/

export const getProvisionalWinAgainstRankedGain =
  ({
    provisionalRating,
    rankedRating,
  }) => {
    const provisional =
      assertNonNegativeInteger(
        provisionalRating,
        "provisionalRating",
      );

    const ranked =
      assertNonNegativeInteger(
        rankedRating,
        "rankedRating",
      );

    const ratingGap =
      Math.max(
        0,
        ranked -
          provisional,
      );

    /*
      Máximo bonus adicional:

      300 total
      - 64 base
      = 236
    */

    const maxBonus =
      PLACEMENT_BEATS_RANKED_MAX_TOTAL -
      PLACEMENT_BEATS_RANKED_BASE;

    const placementBonus =
      Math.min(
        maxBonus,

        Math.round(
          ratingGap *
            PLACEMENT_BEATS_RANKED_PERCENT,
        ),
      );

    const totalGain =
      Math.min(
        PLACEMENT_BEATS_RANKED_MAX_TOTAL,

        PLACEMENT_BEATS_RANKED_BASE +
          placementBonus,
      );

    return {
      rating_gap:
        ratingGap,

      base_gain:
        PLACEMENT_BEATS_RANKED_BASE,

      bonus:
        placementBonus,

      total_gain:
        totalGain,
    };
  };


/*
  ============================================================
  RANKING PREVIO
  ============================================================
*/

const getRankingContext =
  ({
    winnerId,
    loserId,
    rankingBefore,
  }) => {
    const ranking =
      normalizeRanking(
        rankingBefore,
      );

    const winnerEntry =
      ranking.find(
        (player) =>
          player.id ===
          winnerId,
      ) || null;

    const loserEntry =
      ranking.find(
        (player) =>
          player.id ===
          loserId,
      ) || null;

    const numberTwo =
      ranking.find(
        (player) =>
          player.position ===
          2,
      ) || null;

    return {
      ranking,

      winner_position:
        winnerEntry
          ?.position ||
        null,

      loser_position:
        loserEntry
          ?.position ||
        null,

      number_two:
        numberTwo,
    };
  };


/*
  ============================================================
  MOTOR DE PARTIDO
  ============================================================

  INPUT:

  winner:
  {
    id,
    rating,
    matches_played
  }

  loser:
  {
    id,
    rating,
    matches_played
  }

  rankingBefore:
  [
    {
      id,
      rating,
      matches_played,
      position
    }
  ]

  IMPORTANTE:

  rankingBefore tiene que representar
  el ranking oficial ANTES del partido.

  Solo incluye jugadores con:
  matches_played >= 5
  ============================================================
*/

export const calculateMatchElo =
  ({
    winner,
    loser,
    rankingBefore = [],
  }) => {
    const normalizedWinner =
      normalizePlayer(
        winner,
        "winner",
      );

    const normalizedLoser =
      normalizePlayer(
        loser,
        "loser",
      );

    if (
      normalizedWinner.id ===
      normalizedLoser.id
    ) {
      throw new EloCalculationError(
        "Ganador y perdedor no pueden ser el mismo jugador.",
        "same_player",
      );
    }

    const winnerId =
      normalizedWinner.id;

    const loserId =
      normalizedLoser.id;

    const winnerRating =
      normalizedWinner.rating;

    const loserRating =
      normalizedLoser.rating;

    const winnerMatchesPlayed =
      normalizedWinner
        .matches_played;

    const loserMatchesPlayed =
      normalizedLoser
        .matches_played;


    /*
      ========================================================
      ESTADO PREVIO
      ========================================================
    */

    const winnerProvisional =
      isProvisional(
        winnerMatchesPlayed,
      );

    const loserProvisional =
      isProvisional(
        loserMatchesPlayed,
      );

    const winnerMatchesAfter =
      winnerMatchesPlayed +
      1;

    const loserMatchesAfter =
      loserMatchesPlayed +
      1;

    const winnerCompletedPlacement =
      winnerProvisional &&
      winnerMatchesAfter ===
        PLACEMENT_MATCHES;

    const loserCompletedPlacement =
      loserProvisional &&
      loserMatchesAfter ===
        PLACEMENT_MATCHES;


    /*
      ========================================================
      RANKING PREVIO
      ========================================================
    */

    const rankingContext =
      getRankingContext({
        winnerId,
        loserId,
        rankingBefore,
      });

    const winnerRankBefore =
      rankingContext
        .winner_position;

    const loserRankBefore =
      rankingContext
        .loser_position;

    const numberTwoBefore =
      rankingContext
        .number_two;


    /*
      ========================================================
      GANADOR
      ========================================================
    */

    let winnerAfterMatch =
      winnerRating;

    let winnerCalculationType =
      "normal";

    let provisionalWinDetails =
      null;


    /*
      Provisional vs provisional:

      ambos usan K64.
    */

    if (
      winnerProvisional &&
      loserProvisional
    ) {
      const winnerDelta =
        normalEloChange({
          ownRating:
            winnerRating,

          opponentRating:
            loserRating,

          k:
            PLACEMENT_K,

          won:
            true,
        });

      winnerAfterMatch =
        Math.max(
          0,

          winnerRating +
            winnerDelta,
        );

      winnerCalculationType =
        "placement_vs_placement";
    }


    /*
      Provisional vence a oficial:

      +64 base
      +18% de diferencia Elo
      máximo +300 total.
    */

    else if (
      winnerProvisional &&
      !loserProvisional
    ) {
      provisionalWinDetails =
        getProvisionalWinAgainstRankedGain({
          provisionalRating:
            winnerRating,

          rankedRating:
            loserRating,
        });

      winnerAfterMatch =
        winnerRating +
        provisionalWinDetails
          .total_gain;

      winnerCalculationType =
        "placement_beats_ranked";
    }


    /*
      Ganador oficial:

      K32.

      Puede ser:
      - oficial vs oficial
      - oficial vs provisional
    */

    else {
      const winnerDelta =
        normalEloChange({
          ownRating:
            winnerRating,

          opponentRating:
            loserRating,

          k:
            NORMAL_K,

          won:
            true,
        });

      winnerAfterMatch =
        Math.max(
          OFFICIAL_ELO_FLOOR,

          winnerRating +
            winnerDelta,
        );

      winnerCalculationType =
        loserProvisional
          ? "ranked_beats_placement"
          : "normal_ranked";
    }


    /*
      ========================================================
      PERDEDOR
      ========================================================
    */

    let loserAfterMatch =
      loserRating;

    let loserCalculationType =
      "normal";

    let specialProvisionalPenalty =
      null;


    /*
      Perdedor provisional.

      Si pierde contra provisional:
      K64.

      Si pierde contra oficial:
      K32.

      Piso provisional:
      0.
    */

    if (
      loserProvisional
    ) {
      const lossK =
        winnerProvisional
          ? PLACEMENT_K
          : NORMAL_K;

      const lossDelta =
        normalEloChange({
          ownRating:
            loserRating,

          opponentRating:
            winnerRating,

          k:
            lossK,

          won:
            false,
        });

      loserAfterMatch =
        Math.max(
          0,

          loserRating +
            lossDelta,
        );

      loserCalculationType =
        winnerProvisional
          ? "placement_loses_to_placement"
          : "placement_loses_to_ranked";
    }


    /*
      Oficial pierde contra provisional.

      Penalización fuerte:

      MIN(
        300,
        MAX(
          200,
          ROUND(rating * 0.12)
        )
      )
    */

    else if (
      winnerProvisional
    ) {
      specialProvisionalPenalty =
        getRankedLossToProvisionalPenalty(
          loserRating,
        );

      loserAfterMatch =
        Math.max(
          OFFICIAL_ELO_FLOOR,

          loserRating -
            specialProvisionalPenalty,
        );

      loserCalculationType =
        "ranked_loses_to_placement";
    }


    /*
      Oficial pierde contra oficial.

      K32.

      Normalmente tiene piso 100.

      Excepción:
      si ya venía debajo de 100 por
      la regla literal del #1,
      perder no puede regalarle Elo
      para devolverlo artificialmente
      a 100.
    */

    else {
      const lossDelta =
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

            loserRating +
              lossDelta,
          );
      } else {
        loserAfterMatch =
          Math.max(
            0,

            loserRating +
              lossDelta,
          );
      }

      loserCalculationType =
        "normal_ranked";
    }


    /*
      ========================================================
      REGLA ESPECIAL DEL #1
      ========================================================

      Si quien era #1 ANTES del partido
      pierde, su Elo final del partido
      tiene como techo:

      Elo del #2 antes del partido - 1

      Es un TECHO.

      Nunca devuelve puntos.
    */

    let dethroneApplied =
      false;

    let dethroneCeiling =
      null;

    if (
      loserRankBefore ===
        1 &&
      numberTwoBefore &&
      numberTwoBefore.id !==
        loserId
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


    /*
      ========================================================
      DELTAS PUROS DEL PARTIDO
      ========================================================
    */

    const realWinnerDelta =
      winnerAfterMatch -
      winnerRating;

    const realLoserDelta =
      loserAfterMatch -
      loserRating;


    /*
      ========================================================
      INVARIANTES
      ========================================================
    */

    if (
      !Number.isInteger(
        winnerAfterMatch,
      ) ||
      !Number.isInteger(
        loserAfterMatch,
      ) ||
      winnerAfterMatch < 0 ||
      loserAfterMatch < 0
    ) {
      throw new EloCalculationError(
        "El cálculo Elo produjo un rating inválido.",
        "invalid_rating_result",
        {
          winnerAfterMatch,
          loserAfterMatch,
        },
      );
    }

    if (
      realWinnerDelta < 0
    ) {
      throw new EloCalculationError(
        "El ganador no puede perder Elo.",
        "winner_lost_elo",
        {
          winnerRating,
          winnerAfterMatch,
          realWinnerDelta,
        },
      );
    }

    if (
      realLoserDelta > 0
    ) {
      throw new EloCalculationError(
        "El perdedor no puede ganar Elo por el resultado del partido.",
        "loser_gained_elo",
        {
          loserRating,
          loserAfterMatch,
          realLoserDelta,
        },
      );
    }


    /*
      ========================================================
      FINALIZACIÓN DE PLACEMENT
      ========================================================

      El evento match_result conserva
      el movimiento puro.

      Si en el quinto partido queda
      debajo de Elo 100, después se
      crea un evento separado:

      placement_completed

      que lo normaliza a 100.
    */

    const winnerPlacementFloorAdjustment =
      winnerCompletedPlacement &&
      winnerAfterMatch <
        OFFICIAL_ELO_FLOOR
        ? (
            OFFICIAL_ELO_FLOOR -
            winnerAfterMatch
          )
        : 0;

    const loserPlacementFloorAdjustment =
      loserCompletedPlacement &&
      loserAfterMatch <
        OFFICIAL_ELO_FLOOR
        ? (
            OFFICIAL_ELO_FLOOR -
            loserAfterMatch
          )
        : 0;


    const winnerFinalRating =
      winnerAfterMatch +
      winnerPlacementFloorAdjustment;

    const loserFinalRating =
      loserAfterMatch +
      loserPlacementFloorAdjustment;


    /*
      ========================================================
      RESULTADO
      ========================================================
    */

    return {
      winner: {
        id:
          winnerId,

        elo_before:
          winnerRating,

        elo_change:
          realWinnerDelta,

        elo_after_match:
          winnerAfterMatch,

        placement_floor_adjustment:
          winnerPlacementFloorAdjustment,

        final_elo_after:
          winnerFinalRating,

        matches_before:
          winnerMatchesPlayed,

        matches_after:
          winnerMatchesAfter,

        provisional_before:
          winnerProvisional,

        provisional_after:
          (
            winnerMatchesAfter <
            PLACEMENT_MATCHES
          ),

        completed_placement:
          winnerCompletedPlacement,

        official_position_before:
          winnerRankBefore,

        calculation:
          winnerCalculationType,
      },

      loser: {
        id:
          loserId,

        elo_before:
          loserRating,

        elo_change:
          realLoserDelta,

        elo_after_match:
          loserAfterMatch,

        placement_floor_adjustment:
          loserPlacementFloorAdjustment,

        final_elo_after:
          loserFinalRating,

        matches_before:
          loserMatchesPlayed,

        matches_after:
          loserMatchesAfter,

        provisional_before:
          loserProvisional,

        provisional_after:
          (
            loserMatchesAfter <
            PLACEMENT_MATCHES
          ),

        completed_placement:
          loserCompletedPlacement,

        official_position_before:
          loserRankBefore,

        calculation:
          loserCalculationType,
      },

      special_provisional_penalty:
        specialProvisionalPenalty,

      provisional_win_against_ranked:
        provisionalWinDetails,

      number_one_dethrone: {
        applied:
          dethroneApplied,

        loser_was_number_one:
          loserRankBefore ===
          1,

        number_two_id:
          numberTwoBefore
            ?.id ||
          null,

        number_two_rating:
          numberTwoBefore
            ?.rating ??
          null,

        ceiling:
          dethroneCeiling,
      },
    };
  };


/*
  ============================================================
  RECHAZO DE DESAFÍO
  ============================================================

  Regla:

  - penalización: 8 Elo
  - provisional: piso 0
  - oficial: piso 100

  Excepción coherente con partido:

  si un oficial ya estuviera debajo
  de 100 por la regla extrema del #1,
  rechazar no puede regalarle puntos.
  En ese caso simplemente pierde hasta
  un mínimo de 0.
  ============================================================
*/

export const calculateChallengeRejectionElo =
  ({
    rating,
    matchesPlayed,
  }) => {
    const currentRating =
      assertNonNegativeInteger(
        rating,
        "rating",
      );

    const currentMatches =
      assertNonNegativeInteger(
        matchesPlayed,
        "matchesPlayed",
      );

    const provisional =
      isProvisional(
        currentMatches,
      );

    let eloAfter;


    if (
      provisional
    ) {
      eloAfter =
        Math.max(
          0,

          currentRating -
            CHALLENGE_REJECTION_PENALTY,
        );
    }

    else if (
      currentRating >=
      OFFICIAL_ELO_FLOOR
    ) {
      eloAfter =
        Math.max(
          OFFICIAL_ELO_FLOOR,

          currentRating -
            CHALLENGE_REJECTION_PENALTY,
        );
    }

    else {
      /*
        Oficial que ya estaba debajo
        de 100.

        Nunca subimos Elo por aplicar
        una penalización.
      */

      eloAfter =
        Math.max(
          0,

          currentRating -
            CHALLENGE_REJECTION_PENALTY,
        );
    }


    const eloChange =
      eloAfter -
      currentRating;


    if (
      eloChange > 0
    ) {
      throw new EloCalculationError(
        "Una penalización por rechazo no puede aumentar Elo.",
        "rejection_increased_elo",
        {
          currentRating,
          eloAfter,
          eloChange,
        },
      );
    }


    return {
      elo_before:
        currentRating,

      elo_change:
        eloChange,

      elo_after:
        eloAfter,

      provisional,

      matches_played:
        currentMatches,

      configured_penalty:
        CHALLENGE_REJECTION_PENALTY,

      effective_penalty:
        Math.abs(
          eloChange,
        ),
    };
  };


/*
  ============================================================
  CONSTRUIR RANKING OFICIAL EN MEMORIA
  ============================================================

  Esto es importante para replay.

  Durante un replay no queremos consultar
  users para saber quién era #1.

  El estado reconstruido vive en memoria.

  Recibe jugadores con:
  {
    id,
    rating,
    matches_played,
    role?,
    verification_status?,
    city?,
    gender?
  }

  Si se pasan city/gender, filtra esa liga.
  ============================================================
*/

export const buildOfficialRankingSnapshot =
  (
    players,
    {
      city = null,
      gender = null,
    } = {},
  ) => {
    if (
      !Array.isArray(
        players,
      )
    ) {
      throw new EloCalculationError(
        "players debe ser un array.",
        "invalid_players_collection",
      );
    }

    const normalized =
      players
        .map(
          (
            player,
            index,
          ) => {
            if (
              !player ||
              typeof player !==
                "object"
            ) {
              throw new EloCalculationError(
                "Jugador inválido al construir ranking.",
                "invalid_player",
                {
                  index,
                },
              );
            }

            return {
              ...player,

              id:
                toInteger(
                  player.id,
                  `players[${index}].id`,
                ),

              rating:
                assertNonNegativeInteger(
                  player.rating,
                  `players[${index}].rating`,
                ),

              matches_played:
                assertNonNegativeInteger(
                  player.matches_played,
                  `players[${index}].matches_played`,
                ),
            };
          },
        )
        .filter(
          (player) => {
            if (
              player.role &&
              player.role !==
                "player"
            ) {
              return false;
            }

            if (
              player.verification_status &&
              player.verification_status !==
                "verified"
            ) {
              return false;
            }

            if (
              city !== null &&
              player.city !==
                city
            ) {
              return false;
            }

            if (
              gender !== null &&
              player.gender !==
                gender
            ) {
              return false;
            }

            return (
              player.matches_played >=
              PLACEMENT_MATCHES
            );
          },
        )
        .sort(
          (a, b) => {
            if (
              b.rating !==
              a.rating
            ) {
              return (
                b.rating -
                a.rating
              );
            }

            if (
              b.matches_played !==
              a.matches_played
            ) {
              return (
                b.matches_played -
                a.matches_played
              );
            }

            return (
              a.id -
              b.id
            );
          },
        );

    return normalized.map(
      (
        player,
        index,
      ) => ({
        ...player,

        position:
          index + 1,
      }),
    );
  };


/*
  ============================================================
  DESCRIPCIONES DE EVENTOS
  ============================================================
*/

export const getMatchResultDescription =
  ({
    matchId,
    playerType,
    calculation,
    dethroneApplied = false,
  }) => {
    const normalizedMatchId =
      toInteger(
        matchId,
        "matchId",
      );

    if (
      playerType ===
      "winner"
    ) {
      if (
        calculation ===
        "placement_vs_placement" ||
        calculation ===
        "placement_beats_ranked"
      ) {
        return (
          `Victoria de colocación en partido #${normalizedMatchId}`
        );
      }

      return (
        `Victoria en partido #${normalizedMatchId}`
      );
    }


    if (
      playerType ===
      "loser"
    ) {
      if (
        dethroneApplied
      ) {
        return (
          `Derrota siendo #1 en partido #${normalizedMatchId}. Se aplicó regla de destronamiento.`
        );
      }

      if (
        calculation ===
        "ranked_loses_to_placement"
      ) {
        return (
          `Derrota contra provisional en partido #${normalizedMatchId}. Penalización especial.`
        );
      }

      if (
        calculation ===
          "placement_loses_to_placement" ||
        calculation ===
          "placement_loses_to_ranked"
      ) {
        return (
          `Derrota de colocación en partido #${normalizedMatchId}`
        );
      }

      return (
        `Derrota en partido #${normalizedMatchId}`
      );
    }


    throw new EloCalculationError(
      "playerType debe ser winner o loser.",
      "invalid_player_type",
      {
        playerType,
      },
    );
  };


/*
  ============================================================
  DESCRIPCIÓN DE GRADUACIÓN
  ============================================================
*/

export const getPlacementCompletedDescription =
  (
    matchId,
  ) => {
    const normalizedMatchId =
      toInteger(
        matchId,
        "matchId",
      );

    return (
      `Finalización de colocación tras partido #${normalizedMatchId}. Se aplicó piso oficial de Elo ${OFFICIAL_ELO_FLOOR}.`
    );
  };