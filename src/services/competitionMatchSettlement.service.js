import {
  lockCompetitionPlayers,
  applyCompetitionMatchStats,
} from "./competitionPlayer.service.js";

import {
  getMatchSides,
} from "./matchSides.service.js";

import {
  buildSideResult,
  buildPlayerStatResults,
  resolveWinningSideFromSinglesWinner,
} from "./matchResultSides.service.js";


export class CompetitionMatchSettlementError extends Error {
  constructor(
    message,
    reason = "competition_match_settlement_error",
    details = null,
  ) {
    super(message);

    this.name =
      "CompetitionMatchSettlementError";

    this.reason =
      reason;

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
    throw new CompetitionMatchSettlementError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
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
    throw new CompetitionMatchSettlementError(
      `${field} inválido.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const normalizeRatingMap = (
  ratingByUserId,
  userIds,
) => {
  if (
    !ratingByUserId ||
    typeof ratingByUserId !==
      "object"
  ) {
    throw new CompetitionMatchSettlementError(
      "Se requiere el Elo final de los jugadores.",
      "rating_map_missing",
    );
  }

  const normalized =
    {};

  for (
    const userId of
    userIds
  ) {
    const rating =
      Number(
        ratingByUserId[
          userId
        ],
      );

    if (
      !Number.isInteger(
        rating,
      ) ||
      rating < 0
    ) {
      throw new CompetitionMatchSettlementError(
        "Falta el Elo final de uno de los jugadores.",
        "missing_final_rating",
        {
          user_id:
            userId,
        },
      );
    }

    normalized[
      userId
    ] =
      rating;
  }

  return normalized;
};


export const getCompetitionMatchSettlement =
  async (
    client,
    matchId,
    {
      forUpdate = false,
    } = {},
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

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

        ${
          forUpdate
            ? "FOR UPDATE"
            : ""
        }
        `,
        [
          normalizedMatchId,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


export const assertMatchNotSettled =
  async (
    client,
    matchId,
  ) => {
    const existing =
      await getCompetitionMatchSettlement(
        client,
        matchId,
      );

    if (existing) {
      throw new CompetitionMatchSettlementError(
        "Las estadísticas de este partido ya fueron aplicadas.",
        "match_already_settled",
        {
          match_id:
            Number(
              matchId,
            ),

          competition_id:
            Number(
              existing
                .competition_id,
            ),
        },
      );
    }

    return true;
  };


export const createCompetitionMatchSettlement =
  async (
    client,
    {
      matchId,
      competitionId,
    },
  ) => {
    assertClient(
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
          NOW()
        )

        RETURNING
          id,
          match_id,
          competition_id,
          settled_at
        `,
        [
          normalizedMatchId,
          normalizedCompetitionId,
        ],
      );

    if (
      result.rowCount !== 1
    ) {
      throw new CompetitionMatchSettlementError(
        "No se pudo registrar el settlement del partido.",
        "settlement_write_failed",
        {
          match_id:
            normalizedMatchId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    return result.rows[0];
  };


export const settleSinglesCompetitionStats =
  async (
    client,
    {
      matchId,
      winnerId,
      score,
      ratingByUserId,
      lockedPlayers = null,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const normalizedWinnerId =
      positiveInteger(
        winnerId,
        "winnerId",
      );

    await assertMatchNotSettled(
      client,
      normalizedMatchId,
    );

    const matchSides =
      await getMatchSides(
        client,
        normalizedMatchId,
      );

    if (!matchSides) {
      throw new CompetitionMatchSettlementError(
        "Partido no encontrado.",
        "match_not_found",
      );
    }

    if (
      matchSides
        .competition
        .format !==
        "singles" ||
      Number(
        matchSides
          .competition
          .team_size,
      ) !== 1
    ) {
      throw new CompetitionMatchSettlementError(
        "Este settlement corresponde únicamente a singles.",
        "singles_required",
        {
          competition_id:
            Number(
              matchSides
                .competition
                .id,
            ),

          format:
            matchSides
              .competition
              .format,

          team_size:
            Number(
              matchSides
                .competition
                .team_size,
            ),
        },
      );
    }

    if (
      matchSides
        .match
        .annulled_at
    ) {
      throw new CompetitionMatchSettlementError(
        "No se pueden aplicar estadísticas de un partido anulado.",
        "match_annulled",
      );
    }

    const winningSide =
      resolveWinningSideFromSinglesWinner(
        matchSides,
        normalizedWinnerId,
      );

    const sideResult =
      buildSideResult(
        matchSides,
        {
          winningSide,
          score,
        },
      );

    const playerResults =
      buildPlayerStatResults(
        sideResult,
      );

    const userIds =
      playerResults.map(
        (
          result,
        ) =>
          Number(
            result.user_id,
          ),
      );

    const ratings =
      normalizeRatingMap(
        ratingByUserId,
        userIds,
      );

    let locked =
      lockedPlayers;

    if (
      !Array.isArray(
        locked,
      )
    ) {
      locked =
        await lockCompetitionPlayers(
          client,
          {
            competitionId:
              matchSides
                .competition
                .id,

            userIds,
          },
        );
    }

    if (
      !Array.isArray(
        locked,
      ) ||
      locked.length !==
        userIds.length
    ) {
      throw new CompetitionMatchSettlementError(
        "No se pudieron bloquear correctamente las estadísticas de los jugadores.",
        "competition_players_lock_failed",
        {
          competition_id:
            Number(
              matchSides
                .competition
                .id,
            ),

          expected:
            userIds.length,

          received:
            Array.isArray(
              locked,
            )
              ? locked.length
              : null,
        },
      );
    }

    const lockedIds =
      new Set(
        locked.map(
          (
            player,
          ) =>
            Number(
              player.user_id ??
                player.id,
            ),
        ),
      );

    for (
      const userId of
      userIds
    ) {
      if (
        !lockedIds.has(
          userId,
        )
      ) {
        throw new CompetitionMatchSettlementError(
          "Falta un jugador en el lock de estadísticas.",
          "competition_player_lock_missing",
          {
            user_id:
              userId,

            competition_id:
              Number(
                matchSides
                  .competition
                  .id,
              ),
          },
        );
      }
    }

    const updated =
      [];

    for (
      const result of
      playerResults
    ) {
      const userId =
        Number(
          result.user_id,
        );

      const row =
        await applyCompetitionMatchStats(
          client,
          {
            userId,

            competitionId:
              matchSides
                .competition
                .id,

            rating:
              ratings[
                userId
              ],

            won:
              Boolean(
                result.won,
              ),

            gamesWon:
              Number(
                result.games_won,
              ),

            gamesLost:
              Number(
                result.games_lost,
              ),
          },
        );

      updated.push(
        row,
      );
    }

    const settlement =
      await createCompetitionMatchSettlement(
        client,
        {
          matchId:
            normalizedMatchId,

          competitionId:
            matchSides
              .competition
              .id,
        },
      );

    return {
      match_id:
        normalizedMatchId,

      competition_id:
        Number(
          matchSides
            .competition
            .id,
        ),

      winning_side:
        winningSide,

      players:
        playerResults,

      updated_stats:
        updated,

      settlement,
    };
  };


export default {
  getCompetitionMatchSettlement,
  assertMatchNotSettled,
  createCompetitionMatchSettlement,
  settleSinglesCompetitionStats,
};