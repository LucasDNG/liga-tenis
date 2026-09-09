import {
  ensureCompetitionPlayer,
} from "./competitionPlayer.service.js";


export class CompetitionStatsError extends Error {
  constructor(
    message,
    reason = "competition_stats_error",
    details = null,
  ) {
    super(message);

    this.name =
      "CompetitionStatsError";

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
    throw new CompetitionStatsError(
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
    throw new CompetitionStatsError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
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
    throw new CompetitionStatsError(
      `${field} debe ser un entero no negativo.`,
      "invalid_stat",
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const ensureCompetitionStatsForParticipants =
  async (
    client,
    {
      competitionId,
      participants,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    if (
      !Array.isArray(
        participants,
      )
    ) {
      throw new CompetitionStatsError(
        "participants debe ser un array.",
        "invalid_participants",
      );
    }

    const rows = [];

    for (
      const participant of
      participants
    ) {
      const userId =
        positiveInteger(
          participant.user_id ??
          participant.id,
          "participant.user_id",
        );

      const state =
        await ensureCompetitionPlayer(
          client,
          {
            userId,

            competitionId:
              normalizedCompetitionId,
          },
        );

      rows.push(
        state,
      );
    }

    return rows;
  };


export const applyCompletedMatchStats =
  async (
    client,
    {
      competitionId,
      winners,
      losers,
      winnerGames,
      loserGames,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedWinnerGames =
      nonNegativeInteger(
        winnerGames,
        "winnerGames",
      );

    const normalizedLoserGames =
      nonNegativeInteger(
        loserGames,
        "loserGames",
      );

    if (
      !Array.isArray(winners) ||
      winners.length === 0 ||
      !Array.isArray(losers) ||
      losers.length === 0
    ) {
      throw new CompetitionStatsError(
        "Ganadores y perdedores son obligatorios.",
        "invalid_match_sides",
      );
    }

    const allParticipants = [
      ...winners,
      ...losers,
    ];

    await ensureCompetitionStatsForParticipants(
      client,
      {
        competitionId:
          normalizedCompetitionId,

        participants:
          allParticipants,
      },
    );

    const updated = [];

    for (
      const winner of
      winners
    ) {
      const userId =
        positiveInteger(
          winner.user_id ??
          winner.id,
          "winner.user_id",
        );

      const result =
        await client.query(
          `
          UPDATE player_competition_stats

          SET
            matches_played =
              matches_played + 1,

            wins =
              wins + 1,

            games_won =
              games_won + $3,

            games_lost =
              games_lost + $4,

            updated_at =
              NOW()

          WHERE
            user_id = $1
            AND competition_id = $2

          RETURNING *
          `,
          [
            userId,
            normalizedCompetitionId,
            normalizedWinnerGames,
            normalizedLoserGames,
          ],
        );

      if (
        result.rowCount !== 1
      ) {
        throw new CompetitionStatsError(
          "No se pudieron actualizar las estadísticas del ganador.",
          "winner_stats_update_failed",
          {
            user_id:
              userId,

            competition_id:
              normalizedCompetitionId,
          },
        );
      }

      updated.push(
        result.rows[0],
      );
    }

    for (
      const loser of
      losers
    ) {
      const userId =
        positiveInteger(
          loser.user_id ??
          loser.id,
          "loser.user_id",
        );

      const result =
        await client.query(
          `
          UPDATE player_competition_stats

          SET
            matches_played =
              matches_played + 1,

            losses =
              losses + 1,

            games_won =
              games_won + $3,

            games_lost =
              games_lost + $4,

            updated_at =
              NOW()

          WHERE
            user_id = $1
            AND competition_id = $2

          RETURNING *
          `,
          [
            userId,
            normalizedCompetitionId,
            normalizedLoserGames,
            normalizedWinnerGames,
          ],
        );

      if (
        result.rowCount !== 1
      ) {
        throw new CompetitionStatsError(
          "No se pudieron actualizar las estadísticas del perdedor.",
          "loser_stats_update_failed",
          {
            user_id:
              userId,

            competition_id:
              normalizedCompetitionId,
          },
        );
      }

      updated.push(
        result.rows[0],
      );
    }

    return updated;
  };


export const setCompetitionRating =
  async (
    client,
    {
      userId,
      competitionId,
      rating,
    },
  ) => {
    assertClient(client);

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedRating =
      nonNegativeInteger(
        rating,
        "rating",
      );

    const result =
      await client.query(
        `
        UPDATE player_competition_stats

        SET
          rating = $3,
          updated_at = NOW()

        WHERE
          user_id = $1
          AND competition_id = $2

        RETURNING *
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
          normalizedRating,
        ],
      );

    if (
      result.rowCount !== 1
    ) {
      throw new CompetitionStatsError(
        "No se pudo actualizar el Elo de la competición.",
        "rating_update_failed",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    return result.rows[0];
  };


export const getCompetitionStats =
  async (
    client,
    {
      userId,
      competitionId,
      forUpdate = false,
    },
  ) => {
    assertClient(client);

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const lockClause =
      forUpdate
        ? "FOR UPDATE"
        : "";

    const result =
      await client.query(
        `
        SELECT
          *

        FROM player_competition_stats

        WHERE
          user_id = $1
          AND competition_id = $2

        LIMIT 1

        ${lockClause}
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };