import {
  calculateDoublesMatchRatings,
  DoublesPairRatingError,
} from "./doublesPairRating.service.js";


export class DoublesPairSettlementError
  extends Error {
  constructor(
    message,
    reason =
      "doubles_pair_settlement_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "DoublesPairSettlementError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


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
    throw new DoublesPairSettlementError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const nonNegativeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    throw new DoublesPairSettlementError(
      `${field} debe ser un entero mayor o igual a 0.`,
      "invalid_stat",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const requireClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new DoublesPairSettlementError(
      "Se requiere un cliente PostgreSQL válido.",
      "invalid_database_client",
      500,
    );
  }
};


const normalizePair = (
  row,
) => ({
  ...row,

  id:
    Number(row.id),

  competition_id:
    Number(
      row.competition_id,
    ),

  player1_id:
    Number(
      row.player1_id,
    ),

  player2_id:
    Number(
      row.player2_id,
    ),

  rating:
    Number(
      row.rating,
    ),

  matches_played:
    Number(
      row.matches_played,
    ),

  wins:
    Number(
      row.wins,
    ),

  losses:
    Number(
      row.losses,
    ),

  games_won:
    Number(
      row.games_won,
    ),

  games_lost:
    Number(
      row.games_lost,
    ),
});


const lockPair =
  async (
    client,
    {
      pairId,
      competitionId,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          player1_id,
          player2_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost

        FROM competition_pairs

        WHERE
          id = $1

          AND competition_id = $2

        FOR UPDATE
        `,
        [
          pairId,
          competitionId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesPairSettlementError(
        "No se encontró una de las parejas del partido.",
        "pair_not_found",
        404,
        {
          pair_id:
            pairId,

          competition_id:
            competitionId,
        },
      );
    }

    return normalizePair(
      result.rows[0],
    );
  };


const getExistingSettlement =
  async (
    client,
    matchId,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          match_id,
          competition_id,
          settled_at

        FROM competition_match_settlements

        WHERE
          match_id = $1

        LIMIT 1
        `,
        [
          matchId,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


const insertPairEloEvent =
  async (
    client,
    {
      pairId,
      competitionId,
      matchId,
      eloBefore,
      eloChange,
      eloAfter,
      description,
    },
  ) => {
    await client.query(
      `
      INSERT INTO pair_elo_events (
        pair_id,
        competition_id,
        match_id,
        event_type,
        elo_before,
        elo_change,
        elo_after,
        description
      )

      VALUES (
        $1,
        $2,
        $3,
        'match_result',
        $4,
        $5,
        $6,
        $7
      )
      `,
      [
        pairId,
        competitionId,
        matchId,
        eloBefore,
        eloChange,
        eloAfter,
        description,
      ],
    );
  };


const updatePairStats =
  async (
    client,
    {
      pairId,
      ratingAfter,
      won,
      gamesWon,
      gamesLost,
    },
  ) => {
    const result =
      await client.query(
        `
        UPDATE competition_pairs

        SET
          rating = $1,

          matches_played =
            matches_played + 1,

          wins =
            wins +
            CASE
              WHEN $2::boolean
                THEN 1
              ELSE 0
            END,

          losses =
            losses +
            CASE
              WHEN $2::boolean
                THEN 0
              ELSE 1
            END,

          games_won =
            games_won + $3,

          games_lost =
            games_lost + $4,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $5

        RETURNING
          *
        `,
        [
          ratingAfter,
          won,
          gamesWon,
          gamesLost,
          pairId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesPairSettlementError(
        "No se pudo actualizar la pareja.",
        "pair_update_failed",
        500,
        {
          pair_id:
            pairId,
        },
      );
    }

    return normalizePair(
      result.rows[0],
    );
  };


export const calculateGamesBySide = (
  normalizedScore,
) => {
  if (
    !Array.isArray(
      normalizedScore,
    ) ||
    normalizedScore.length <
      2 ||
    normalizedScore.length >
      3
  ) {
    throw new DoublesPairSettlementError(
      "El score normalizado debe tener 2 o 3 sets.",
      "invalid_score",
      400,
    );
  }

  let side1Games =
    0;

  let side2Games =
    0;

  for (
    const set of
    normalizedScore
  ) {
    if (
      !set ||
      typeof set !==
        "object" ||
      Array.isArray(set)
    ) {
      throw new DoublesPairSettlementError(
        "Set inválido.",
        "invalid_score",
        400,
      );
    }

    const p1 =
      nonNegativeInteger(
        set.p1,
        "set.p1",
      );

    const p2 =
      nonNegativeInteger(
        set.p2,
        "set.p2",
      );

    side1Games +=
      p1;

    side2Games +=
      p2;
  }

  return {
    side1_games:
      side1Games,

    side2_games:
      side2Games,
  };
};


export const settleDoublesPairMatch =
  async (
    client,
    {
      matchId,
      competitionId,
      side1PairId,
      side2PairId,
      winnerSide,
      normalizedScore,
      placementMatches,
    },
  ) => {
    requireClient(
      client,
    );

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedSide1PairId =
      positiveInteger(
        side1PairId,
        "side1PairId",
      );

    const normalizedSide2PairId =
      positiveInteger(
        side2PairId,
        "side2PairId",
      );

    const normalizedPlacementMatches =
      positiveInteger(
        placementMatches,
        "placementMatches",
      );

    const normalizedWinnerSide =
      Number(
        winnerSide,
      );

    if (
      normalizedWinnerSide !== 1 &&
      normalizedWinnerSide !== 2
    ) {
      throw new DoublesPairSettlementError(
        "winnerSide debe ser 1 o 2.",
        "invalid_winner_side",
        400,
        {
          winnerSide,
        },
      );
    }

    if (
      normalizedSide1PairId ===
      normalizedSide2PairId
    ) {
      throw new DoublesPairSettlementError(
        "Una pareja no puede jugar contra sí misma.",
        "same_pair_match",
        409,
      );
    }

    const existingSettlement =
      await getExistingSettlement(
        client,
        normalizedMatchId,
      );

    if (
      existingSettlement
    ) {
      throw new DoublesPairSettlementError(
        "El partido ya fue liquidado competitivamente.",
        "match_already_settled",
        409,
        {
          match_id:
            normalizedMatchId,

          settled_at:
            existingSettlement
              .settled_at,
        },
      );
    }

    /*
      Bloqueamos siempre en orden de ID.
      Esto evita deadlocks si dos operaciones
      intentan tomar las mismas parejas.
    */

    const orderedPairIds =
      [
        normalizedSide1PairId,
        normalizedSide2PairId,
      ].sort(
        (a, b) =>
          a - b,
      );

    const lockedById =
      new Map();

    for (
      const pairId of
      orderedPairIds
    ) {
      const pair =
        await lockPair(
          client,
          {
            pairId,

            competitionId:
              normalizedCompetitionId,
          },
        );

      lockedById.set(
        pairId,
        pair,
      );
    }

    const side1Pair =
      lockedById.get(
        normalizedSide1PairId,
      );

    const side2Pair =
      lockedById.get(
        normalizedSide2PairId,
      );

    const games =
      calculateGamesBySide(
        normalizedScore,
      );

    let ratingPlan;

    try {
      ratingPlan =
        calculateDoublesMatchRatings({
          side1Rating:
            side1Pair.rating,

          side2Rating:
            side2Pair.rating,

          side1MatchesPlayed:
            side1Pair
              .matches_played,

          side2MatchesPlayed:
            side2Pair
              .matches_played,

          placementMatches:
            normalizedPlacementMatches,

          winnerSide:
            normalizedWinnerSide,
        });
    } catch (error) {
      if (
        error instanceof
        DoublesPairRatingError
      ) {
        throw new DoublesPairSettlementError(
          error.message,
          error.reason,
          error.statusCode,
          error.details,
        );
      }

      throw error;
    }

    const side1Won =
      normalizedWinnerSide ===
      1;

    const side2Won =
      normalizedWinnerSide ===
      2;

    const side1Updated =
      await updatePairStats(
        client,
        {
          pairId:
            side1Pair.id,

          ratingAfter:
            ratingPlan.side1
              .rating_after,

          won:
            side1Won,

          gamesWon:
            games.side1_games,

          gamesLost:
            games.side2_games,
        },
      );

    const side2Updated =
      await updatePairStats(
        client,
        {
          pairId:
            side2Pair.id,

          ratingAfter:
            ratingPlan.side2
              .rating_after,

          won:
            side2Won,

          gamesWon:
            games.side2_games,

          gamesLost:
            games.side1_games,
        },
      );

    await insertPairEloEvent(
      client,
      {
        pairId:
          side1Pair.id,

        competitionId:
          normalizedCompetitionId,

        matchId:
          normalizedMatchId,

        eloBefore:
          ratingPlan.side1
            .rating_before,

        eloChange:
          ratingPlan.side1
            .elo_change,

        eloAfter:
          ratingPlan.side1
            .rating_after,

        description:
          side1Won
            ? `Victoria de pareja en partido #${normalizedMatchId}`
            : `Derrota de pareja en partido #${normalizedMatchId}`,
      },
    );

    await insertPairEloEvent(
      client,
      {
        pairId:
          side2Pair.id,

        competitionId:
          normalizedCompetitionId,

        matchId:
          normalizedMatchId,

        eloBefore:
          ratingPlan.side2
            .rating_before,

        eloChange:
          ratingPlan.side2
            .elo_change,

        eloAfter:
          ratingPlan.side2
            .rating_after,

        description:
          side2Won
            ? `Victoria de pareja en partido #${normalizedMatchId}`
            : `Derrota de pareja en partido #${normalizedMatchId}`,
      },
    );

    const settlementResult =
      await client.query(
        `
        INSERT INTO competition_match_settlements (
          match_id,
          competition_id,
          settled_at
        )

        VALUES (
          $1,
          $2,
          CURRENT_TIMESTAMP
        )

        RETURNING
          *
        `,
        [
          normalizedMatchId,
          normalizedCompetitionId,
        ],
      );

    return {
      settlement:
        settlementResult.rows[0],

      winner_side:
        normalizedWinnerSide,

      games,

      side1: {
        pair_before:
          side1Pair,

        pair_after:
          side1Updated,

        rating:
          ratingPlan.side1,
      },

      side2: {
        pair_before:
          side2Pair,

        pair_after:
          side2Updated,

        rating:
          ratingPlan.side2,
      },
    };
  };


export default {
  calculateGamesBySide,
  settleDoublesPairMatch,
};