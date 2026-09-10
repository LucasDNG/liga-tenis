import {
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";

import {
  calculateOfficialPairMatchRating,
  DoublesPairRatingError,
} from "./doublesPairRating.service.js";

import {
  getPairPlacementOpponentReference,
  insertPairPlacementEvidence,
  calculateCompletedPairPlacement,
  DoublesPairPlacementError,
} from "./doublesPairPlacement.service.js";


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


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new DoublesPairSettlementError(
      "Se requiere un cliente PostgreSQL válido.",
      "database_client_missing",
      500,
    );
  }
};


const normalizePair = (
  row,
) => ({
  ...row,

  id:
    Number(
      row.id,
    ),

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


const normalizeServiceError = (
  error,
) => {
  if (
    error instanceof
      DoublesPairSettlementError
  ) {
    return error;
  }

  if (
    error instanceof
      DoublesPairRatingError ||
    error instanceof
      DoublesPairPlacementError
  ) {
    return new DoublesPairSettlementError(
      error.message,
      error.reason,
      error.statusCode ??
        409,
      error.details,
    );
  }

  return error;
};


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
      eventType,
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
        $4,
        $5,
        $6,
        $7,
        $8
      )
      `,
      [
        pairId,
        competitionId,
        matchId,
        eventType,
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
          Boolean(
            won,
          ),
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


const overwritePairRating =
  async (
    client,
    {
      pairId,
      rating,
    },
  ) => {
    const result =
      await client.query(
        `
        UPDATE competition_pairs

        SET
          rating = $1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $2

        RETURNING
          *
        `,
        [
          rating,
          pairId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesPairSettlementError(
        "No se pudo asignar el Elo inicial de placement.",
        "placement_rating_update_failed",
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


const createSettlement =
  async (
    client,
    {
      matchId,
      competitionId,
    },
  ) => {
    const result =
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
          matchId,
          competitionId,
        ],
      );

    return result.rows[0];
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
      Array.isArray(
        set,
      )
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


const buildPairPlan =
  async (
    client,
    {
      pair,
      opponent,
      competitionId,
      matchId,
      won,
    },
  ) => {
    const provisional =
      pair.matches_played <
      PLACEMENT_MATCHES;

    if (
      !provisional
    ) {
      const rating =
        calculateOfficialPairMatchRating({
          rating:
            pair.rating,

          opponentRating:
            opponent.rating,

          won,
        });

      return {
        mode:
          "official",

        provisional_before:
          false,

        placement_match_number:
          null,

        placement_reference:
          null,

        rating_before:
          pair.rating,

        rating_after_match:
          rating
            .rating_after,

        rating,

        placement:
          null,
      };
    }

    const reference =
      await getPairPlacementOpponentReference(
        client,
        {
          opponent,

          competitionId,
        },
      );

    const placementMatchNumber =
      pair.matches_played +
      1;

    await insertPairPlacementEvidence(
      client,
      {
        pairId:
          pair.id,

        competitionId,

        matchId,

        opponentPairId:
          opponent.id,

        placementMatchNumber,

        won,

        reference,
      },
    );

    return {
      mode:
        placementMatchNumber ===
        PLACEMENT_MATCHES
          ? "placement_completion"
          : "placement",

      provisional_before:
        true,

      placement_match_number:
        placementMatchNumber,

      placement_reference:
        reference,

      rating_before:
        pair.rating,

      /*
        Mientras sigue provisional:
        Elo visible = 0.
      */

      rating_after_match:
        0,

      rating:
        {
          rating_before:
            pair.rating,

          rating_after:
            0,

          elo_change:
            -pair.rating,

          k_factor:
            null,
        },

      placement:
        null,
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
    assertClient(
      client,
    );

    try {
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

      if (
        normalizedPlacementMatches !==
        PLACEMENT_MATCHES
      ) {
        throw new DoublesPairSettlementError(
          `Dobles debe utilizar ${PLACEMENT_MATCHES} partidos nivelatorios.`,
          "invalid_placement_match_count",
          409,
          {
            placement_matches:
              normalizedPlacementMatches,
          },
        );
      }

      const normalizedWinnerSide =
        Number(
          winnerSide,
        );

      if (
        normalizedWinnerSide !==
          1 &&
        normalizedWinnerSide !==
          2
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
        Lock determinista:
        evita deadlocks.
      */

      const pairIds =
        [
          normalizedSide1PairId,
          normalizedSide2PairId,
        ].sort(
          (
            a,
            b,
          ) =>
            a - b,
        );

      const pairs =
        new Map();

      for (
        const pairId of
        pairIds
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

        pairs.set(
          pairId,
          pair,
        );
      }

      const side1Pair =
        pairs.get(
          normalizedSide1PairId,
        );

      const side2Pair =
        pairs.get(
          normalizedSide2PairId,
        );

      const side1Won =
        normalizedWinnerSide ===
        1;

      const side2Won =
        !side1Won;

      const games =
        calculateGamesBySide(
          normalizedScore,
        );

      /*
        MUY IMPORTANTE:

        Las dos referencias se congelan
        usando el estado PREVIO al partido.

        Si ambos eran provisionales,
        ninguno "ve" al otro como oficial
        aunque ambos completen 5/5
        simultáneamente.
      */

      const side1Plan =
        await buildPairPlan(
          client,
          {
            pair:
              side1Pair,

            opponent:
              side2Pair,

            competitionId:
              normalizedCompetitionId,

            matchId:
              normalizedMatchId,

            won:
              side1Won,
          },
        );

      const side2Plan =
        await buildPairPlan(
          client,
          {
            pair:
              side2Pair,

            opponent:
              side1Pair,

            competitionId:
              normalizedCompetitionId,

            matchId:
              normalizedMatchId,

            won:
              side2Won,
          },
        );

      /*
        Primero aplicamos estadísticas.

        Las parejas todavía provisionales
        permanecen rating 0.

        Las oficiales reciben Elo K32.
      */

      let side1Updated =
        await updatePairStats(
          client,
          {
            pairId:
              side1Pair.id,

            ratingAfter:
              side1Plan
                .rating_after_match,

            won:
              side1Won,

            gamesWon:
              games.side1_games,

            gamesLost:
              games.side2_games,
          },
        );

      let side2Updated =
        await updatePairStats(
          client,
          {
            pairId:
              side2Pair.id,

            ratingAfter:
              side2Plan
                .rating_after_match,

            won:
              side2Won,

            gamesWon:
              games.side2_games,

            gamesLost:
              games.side1_games,
          },
        );

      /*
        Placement completion.

        Si ambos llegan a 5/5 en el mismo
        partido, ambos calculan su ingreso
        contra el ranking oficial ANTERIOR,
        excluyendo a las dos parejas de este
        encuentro.

        Así el orden de ejecución dentro de
        la transacción no altera el resultado.
      */

      const completingPairIds =
        [];

      if (
        side1Plan.mode ===
        "placement_completion"
      ) {
        completingPairIds.push(
          side1Pair.id,
        );
      }

      if (
        side2Plan.mode ===
        "placement_completion"
      ) {
        completingPairIds.push(
          side2Pair.id,
        );
      }

      if (
        side1Plan.mode ===
        "placement_completion"
      ) {
        const placement =
          await calculateCompletedPairPlacement(
            client,
            {
              pairId:
                side1Pair.id,

              competitionId:
                normalizedCompetitionId,

              excludePairIds:
                completingPairIds,
            },
          );

        side1Plan.placement =
          placement;

        side1Plan.rating_after_match =
          placement.target_elo;

        side1Plan.rating = {
          rating_before:
            0,

          rating_after:
            placement
              .target_elo,

          elo_change:
            placement
              .target_elo,

          k_factor:
            null,

          placement_completed:
            true,

          target_position:
            placement
              .target_position,

          placement_percentile:
            placement
              .placement_percentile,
        };

        side1Updated =
          await overwritePairRating(
            client,
            {
              pairId:
                side1Pair.id,

              rating:
                placement
                  .target_elo,
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

            eventType:
              "placement_completed",

            eloBefore:
              0,

            eloChange:
              placement
                .target_elo,

            eloAfter:
              placement
                .target_elo,

            description:
              `Placement de pareja completado en partido #${normalizedMatchId}. Percentil ${placement.placement_percentile}. Posición objetivo #${placement.target_position}.`,
          },
        );
      } else if (
        side1Plan.mode ===
        "official"
      ) {
        await insertPairEloEvent(
          client,
          {
            pairId:
              side1Pair.id,

            competitionId:
              normalizedCompetitionId,

            matchId:
              normalizedMatchId,

            eventType:
              "match_result",

            eloBefore:
              side1Plan
                .rating
                .rating_before,

            eloChange:
              side1Plan
                .rating
                .elo_change,

            eloAfter:
              side1Plan
                .rating
                .rating_after,

            description:
              side1Won
                ? `Victoria de pareja en partido #${normalizedMatchId}`
                : `Derrota de pareja en partido #${normalizedMatchId}`,
          },
        );
      }

      if (
        side2Plan.mode ===
        "placement_completion"
      ) {
        const placement =
          await calculateCompletedPairPlacement(
            client,
            {
              pairId:
                side2Pair.id,

              competitionId:
                normalizedCompetitionId,

              excludePairIds:
                completingPairIds,
            },
          );

        side2Plan.placement =
          placement;

        side2Plan.rating_after_match =
          placement.target_elo;

        side2Plan.rating = {
          rating_before:
            0,

          rating_after:
            placement
              .target_elo,

          elo_change:
            placement
              .target_elo,

          k_factor:
            null,

          placement_completed:
            true,

          target_position:
            placement
              .target_position,

          placement_percentile:
            placement
              .placement_percentile,
        };

        side2Updated =
          await overwritePairRating(
            client,
            {
              pairId:
                side2Pair.id,

              rating:
                placement
                  .target_elo,
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

            eventType:
              "placement_completed",

            eloBefore:
              0,

            eloChange:
              placement
                .target_elo,

            eloAfter:
              placement
                .target_elo,

            description:
              `Placement de pareja completado en partido #${normalizedMatchId}. Percentil ${placement.placement_percentile}. Posición objetivo #${placement.target_position}.`,
          },
        );
      } else if (
        side2Plan.mode ===
        "official"
      ) {
        await insertPairEloEvent(
          client,
          {
            pairId:
              side2Pair.id,

            competitionId:
              normalizedCompetitionId,

            matchId:
              normalizedMatchId,

            eventType:
              "match_result",

            eloBefore:
              side2Plan
                .rating
                .rating_before,

            eloChange:
              side2Plan
                .rating
                .elo_change,

            eloAfter:
              side2Plan
                .rating
                .rating_after,

            description:
              side2Won
                ? `Victoria de pareja en partido #${normalizedMatchId}`
                : `Derrota de pareja en partido #${normalizedMatchId}`,
          },
        );
      }

      /*
        En partidos 1-4 del placement no creamos
        pair_elo_event porque el Elo sigue en 0.

        La evidencia queda registrada en
        pair_placement_match_evidence.
      */

      const settlement =
        await createSettlement(
          client,
          {
            matchId:
              normalizedMatchId,

            competitionId:
              normalizedCompetitionId,
          },
        );

      return {
        settlement,

        winner_side:
          normalizedWinnerSide,

        games,

        side1: {
          pair_before:
            side1Pair,

          pair_after:
            side1Updated,

          mode:
            side1Plan.mode,

          placement_match_number:
            side1Plan
              .placement_match_number,

          placement_reference:
            side1Plan
              .placement_reference,

          placement:
            side1Plan
              .placement,

          rating:
            side1Plan
              .rating,
        },

        side2: {
          pair_before:
            side2Pair,

          pair_after:
            side2Updated,

          mode:
            side2Plan.mode,

          placement_match_number:
            side2Plan
              .placement_match_number,

          placement_reference:
            side2Plan
              .placement_reference,

          placement:
            side2Plan
              .placement,

          rating:
            side2Plan
              .rating,
        },
      };
    } catch (error) {
      throw normalizeServiceError(
        error,
      );
    }
  };


export default {
  calculateGamesBySide,
  settleDoublesPairMatch,
};