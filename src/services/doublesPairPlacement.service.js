import {
  PLACEMENT_MATCHES,
  calculatePlacementPercentile,
  calculateCompletedPlacement,
  normalizePercentile,
} from "./placementLevel.service.js";

import {
  getOfficialPositionPercentile,
} from "./placementReference.service.js";


export class DoublesPairPlacementError
  extends Error {
  constructor(
    message,
    reason =
      "doubles_pair_placement_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "DoublesPairPlacementError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new DoublesPairPlacementError(
      "Se requiere un cliente PostgreSQL válido.",
      "database_client_missing",
      500,
    );
  }
};


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
    throw new DoublesPairPlacementError(
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


const normalizePair = (
  pair,
) => {
  if (
    !pair ||
    typeof pair !==
      "object"
  ) {
    throw new DoublesPairPlacementError(
      "Pareja inválida.",
      "invalid_pair",
      400,
    );
  }

  const matchesPlayed =
    Number(
      pair.matches_played ??
      0,
    );

  if (
    !Number.isInteger(
      matchesPlayed,
    ) ||
    matchesPlayed < 0
  ) {
    throw new DoublesPairPlacementError(
      "matches_played inválido.",
      "invalid_matches_played",
      400,
      {
        pair_id:
          pair.id,

        matches_played:
          pair.matches_played,
      },
    );
  }

  return {
    ...pair,

    id:
      positiveInteger(
        pair.id,
        "pair.id",
      ),

    competition_id:
      positiveInteger(
        pair.competition_id,
        "pair.competition_id",
      ),

    rating:
      Number(
        pair.rating ??
        0,
      ),

    matches_played:
      matchesPlayed,

    provisional:
      matchesPlayed <
      PLACEMENT_MATCHES,
  };
};


export const getPairPlacementEvidence =
  async (
    client,
    {
      pairId,
      competitionId,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedPairId =
      positiveInteger(
        pairId,
        "pairId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          id,
          pair_id,
          competition_id,
          match_id,
          opponent_pair_id,
          placement_match_number,
          won,
          opponent_percentile_at_match,
          opponent_reference_type,
          created_at

        FROM pair_placement_match_evidence

        WHERE
          pair_id = $1

          AND competition_id = $2

        ORDER BY
          placement_match_number ASC,
          id ASC
        `,
        [
          normalizedPairId,
          normalizedCompetitionId,
        ],
      );

    return result.rows.map(
      (
        row,
      ) => ({
        id:
          Number(
            row.id,
          ),

        pair_id:
          Number(
            row.pair_id,
          ),

        competition_id:
          Number(
            row.competition_id,
          ),

        match_id:
          Number(
            row.match_id,
          ),

        opponent_pair_id:
          Number(
            row.opponent_pair_id,
          ),

        placement_match_number:
          Number(
            row
              .placement_match_number,
          ),

        won:
          Boolean(
            row.won,
          ),

        opponent_percentile_at_match:
          row
            .opponent_percentile_at_match ===
            null
            ? null
            : Number(
                row
                  .opponent_percentile_at_match,
              ),

        opponent_reference_type:
          row
            .opponent_reference_type,

        created_at:
          row.created_at,

        /*
          El motor genérico de singles
          espera opponent_id.

          Para dobles usamos pair_id.
        */

        opponent_id:
          Number(
            row.opponent_pair_id,
          ),
      }),
    );
  };


export const getOfficialPairRanking =
  async (
    client,
    {
      competitionId,
      excludePairIds =
        [],
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const excluded =
      excludePairIds
        .map(Number)
        .filter(
          (
            id,
          ) =>
            Number.isInteger(id) &&
            id > 0,
        );

    const result =
      await client.query(
        `
        SELECT
          cp.id,
          cp.rating,
          cp.matches_played,
          cp.wins,
          cp.losses,
          cp.games_won,
          cp.games_lost,

          ROW_NUMBER() OVER (
            ORDER BY
              cp.rating DESC,

              (
                cp.wins -
                cp.losses
              ) DESC,

              (
                cp.games_won -
                cp.games_lost
              ) DESC,

              LOWER(
                COALESCE(
                  p1.last_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  p1.first_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  p2.last_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  p2.first_name,
                  ''
                )
              ) ASC,

              cp.id ASC
          )::int
            AS official_position

        FROM competition_pairs cp

        JOIN users p1
          ON p1.id =
            cp.player1_id

        JOIN users p2
          ON p2.id =
            cp.player2_id

        JOIN competitions c
          ON c.id =
            cp.competition_id

        WHERE
          cp.competition_id =
            $1

          AND cp.matches_played >=
            c.placement_matches

          AND NOT (
            cp.id =
            ANY(
              $2::bigint[]
            )
          )
        `,
        [
          normalizedCompetitionId,
          excluded,
        ],
      );

    return result.rows.map(
      (
        row,
      ) => ({
        id:
          Number(
            row.id,
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

        official_position:
          Number(
            row
              .official_position,
          ),

        position:
          Number(
            row
              .official_position,
          ),
      }),
    );
  };


export const getOfficialPairReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    const normalizedOpponent =
      normalizePair(
        opponent,
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    if (
      normalizedOpponent.provisional
    ) {
      throw new DoublesPairPlacementError(
        "La pareja rival todavía es provisional.",
        "opponent_not_official",
        409,
        {
          opponent_pair_id:
            normalizedOpponent.id,
        },
      );
    }

    const ranking =
      await getOfficialPairRanking(
        client,
        {
          competitionId:
            normalizedCompetitionId,
        },
      );

    const rankedOpponent =
      ranking.find(
        (
          pair,
        ) =>
          Number(
            pair.id,
          ) ===
          normalizedOpponent.id,
      );

    if (
      !rankedOpponent
    ) {
      throw new DoublesPairPlacementError(
        "La pareja rival figura como oficial pero no está en el ranking.",
        "official_opponent_not_ranked",
        409,
        {
          opponent_pair_id:
            normalizedOpponent.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const percentile =
      getOfficialPositionPercentile({
        position:
          rankedOpponent
            .official_position,

        officialPlayerCount:
          ranking.length,
      });

    return {
      opponent_pair_id:
        normalizedOpponent.id,

      opponent_reference_type:
        "official",

      opponent_percentile_at_match:
        normalizePercentile(
          percentile,
        ),

      opponent_rank_position_at_match:
        rankedOpponent
          .official_position,

      official_pair_count_at_match:
        ranking.length,

      provisional:
        false,
    };
  };


export const getProvisionalPairReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    const normalizedOpponent =
      normalizePair(
        opponent,
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    if (
      !normalizedOpponent.provisional
    ) {
      throw new DoublesPairPlacementError(
        "La pareja rival ya es oficial.",
        "opponent_not_provisional",
        409,
        {
          opponent_pair_id:
            normalizedOpponent.id,
        },
      );
    }

    const evidence =
      await getPairPlacementEvidence(
        client,
        {
          pairId:
            normalizedOpponent.id,

          competitionId:
            normalizedCompetitionId,
        },
      );

    if (
      evidence.length !==
      normalizedOpponent
        .matches_played
    ) {
      throw new DoublesPairPlacementError(
        "El historial nivelatorio de la pareja rival está desincronizado.",
        "provisional_evidence_out_of_sync",
        409,
        {
          opponent_pair_id:
            normalizedOpponent.id,

          matches_played:
            normalizedOpponent
              .matches_played,

          evidence_count:
            evidence.length,
        },
      );
    }

    const placement =
      calculatePlacementPercentile({
        evidence,
      });

    const officialRanking =
      await getOfficialPairRanking(
        client,
        {
          competitionId:
            normalizedCompetitionId,
        },
      );

    return {
      opponent_pair_id:
        normalizedOpponent.id,

      opponent_reference_type:
        "provisional",

      opponent_percentile_at_match:
        normalizePercentile(
          placement
            .placement_percentile,
        ),

      opponent_rank_position_at_match:
        null,

      official_pair_count_at_match:
        officialRanking.length,

      provisional:
        true,

      demonstrated: {
        matches_played:
          placement
            .matches_played,

        wins:
          placement.wins,

        losses:
          placement.losses,

        weighted_victory_percentile:
          placement
            .weighted_victory_percentile,

        demonstrated_level:
          placement
            .demonstrated_level,

        win_factor:
          placement
            .win_factor,

        placement_percentile:
          placement
            .placement_percentile,
      },
    };
  };


export const getPairPlacementOpponentReference =
  async (
    client,
    {
      opponent,
      competitionId,
    },
  ) => {
    const normalizedOpponent =
      normalizePair(
        opponent,
      );

    if (
      normalizedOpponent.provisional
    ) {
      return getProvisionalPairReference(
        client,
        {
          opponent:
            normalizedOpponent,

          competitionId,
        },
      );
    }

    return getOfficialPairReference(
      client,
      {
        opponent:
          normalizedOpponent,

        competitionId,
      },
    );
  };


export const insertPairPlacementEvidence =
  async (
    client,
    {
      pairId,
      competitionId,
      matchId,
      opponentPairId,
      placementMatchNumber,
      won,
      reference,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedPairId =
      positiveInteger(
        pairId,
        "pairId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const normalizedOpponentPairId =
      positiveInteger(
        opponentPairId,
        "opponentPairId",
      );

    const normalizedPlacementMatchNumber =
      positiveInteger(
        placementMatchNumber,
        "placementMatchNumber",
      );

    if (
      normalizedPlacementMatchNumber >
      PLACEMENT_MATCHES
    ) {
      throw new DoublesPairPlacementError(
        "El número de partido nivelatorio supera el máximo permitido.",
        "placement_match_number_out_of_range",
        409,
        {
          placement_match_number:
            normalizedPlacementMatchNumber,
        },
      );
    }

    const percentile =
      reference
        ?.opponent_percentile_at_match;

    const referenceType =
      reference
        ?.opponent_reference_type;

    if (
      ![
        "official",
        "provisional",
        "other",
      ].includes(
        referenceType,
      )
    ) {
      throw new DoublesPairPlacementError(
        "Tipo de referencia nivelatoria inválido.",
        "invalid_reference_type",
        400,
        {
          reference_type:
            referenceType,
        },
      );
    }

    /*
      Para una derrota el percentil no aporta
      a la fórmula, pero igualmente lo congelamos
      para auditoría completa.
    */

    const result =
      await client.query(
        `
        INSERT INTO pair_placement_match_evidence (
          pair_id,
          competition_id,
          match_id,
          opponent_pair_id,
          placement_match_number,
          won,
          opponent_percentile_at_match,
          opponent_reference_type
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

        RETURNING
          *
        `,
        [
          normalizedPairId,
          normalizedCompetitionId,
          normalizedMatchId,
          normalizedOpponentPairId,
          normalizedPlacementMatchNumber,
          Boolean(
            won,
          ),
          percentile ===
            null ||
          percentile ===
            undefined
            ? null
            : normalizePercentile(
                percentile,
              ),
          referenceType,
        ],
      );

    return result.rows[0];
  };


export const calculateCompletedPairPlacement =
  async (
    client,
    {
      pairId,
      competitionId,
      excludePairIds =
        [],
    },
  ) => {
    const normalizedPairId =
      positiveInteger(
        pairId,
        "pairId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const evidence =
      await getPairPlacementEvidence(
        client,
        {
          pairId:
            normalizedPairId,

          competitionId:
            normalizedCompetitionId,
        },
      );

    if (
      evidence.length !==
      PLACEMENT_MATCHES
    ) {
      throw new DoublesPairPlacementError(
        `La pareja necesita exactamente ${PLACEMENT_MATCHES} evidencias para completar el nivelatorio.`,
        "placement_not_complete",
        409,
        {
          pair_id:
            normalizedPairId,

          evidence_count:
            evidence.length,
        },
      );
    }

    const officialRanking =
      await getOfficialPairRanking(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          excludePairIds: [
            normalizedPairId,
            ...excludePairIds,
          ],
        },
      );

    const placement =
      calculateCompletedPlacement({
        evidence,

        officialRanking,
      });

    return {
      ...placement,

      pair_id:
        normalizedPairId,

      competition_id:
        normalizedCompetitionId,

      official_pair_count_before:
        officialRanking.length,

      /*
        Alias semánticos para dobles.
      */

      elo_reference_pair_id:
        placement
          .elo_reference_player_id,

      elo_reference_pair_position:
        placement
          .elo_reference_position,

      elo_reference_pair_rating:
        placement
          .elo_reference_rating,
    };
  };


export default {
  getPairPlacementEvidence,
  getOfficialPairRanking,
  getOfficialPairReference,
  getProvisionalPairReference,
  getPairPlacementOpponentReference,
  insertPairPlacementEvidence,
  calculateCompletedPairPlacement,
};