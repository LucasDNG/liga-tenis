import {
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";

import {
  getPlayerPlacementProgress,
} from "./placementEvidence.service.js";


export class CompetitionRankingError extends Error {
  constructor(
    message,
    reason = "competition_ranking_error",
    details = null,
  ) {
    super(message);

    this.name =
      "CompetitionRankingError";

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
    throw new CompetitionRankingError(
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
    !Number.isInteger(
      number,
    ) ||
    number <= 0
  ) {
    throw new CompetitionRankingError(
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


const normalizeRankingRow = (
  row,
) => {
  const wins =
    Number(
      row.wins ??
        0,
    );

  const losses =
    Number(
      row.losses ??
        0,
    );

  const gamesWon =
    Number(
      row.games_won ??
        0,
    );

  const gamesLost =
    Number(
      row.games_lost ??
        0,
    );

  return {
    id:
      Number(
        row.id,
      ),

    first_name:
      row.first_name,

    last_name:
      row.last_name,

    name:
      [
        row.last_name,
        row.first_name,
      ]
        .filter(Boolean)
        .join(" "),

    rating:
      Number(
        row.rating ??
          0,
      ),

    matches_played:
      Number(
        row.matches_played ??
          0,
      ),

    wins,

    losses,

    match_balance:
      wins -
      losses,

    games_won:
      gamesWon,

    games_lost:
      gamesLost,

    game_balance:
      gamesWon -
      gamesLost,

    competition_id:
      Number(
        row.competition_id,
      ),

    format:
      row.format,

    gender:
      row.gender,

    city:
      row.city,
  };
};


export const getOfficialCompetitionRanking =
  async (
    client,
    competitionId,
  ) => {
    assertClient(
      client,
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
          u.id,
          u.first_name,
          u.last_name,

          pcs.competition_id,
          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost,

          c.format,
          c.gender,
          c.city

        FROM player_competition_stats pcs

        JOIN users u
          ON u.id =
            pcs.user_id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          pcs.competition_id = $1

          AND pcs.matches_played >=
            c.placement_matches

          AND u.role = 'player'

          AND u.verification_status =
            'verified'

          AND c.active = TRUE

        ORDER BY
          pcs.rating DESC,

          (
            pcs.wins -
            pcs.losses
          ) DESC,

          (
            pcs.games_won -
            pcs.games_lost
          ) DESC,

          LOWER(
            COALESCE(
              u.last_name,
              ''
            )
          ) ASC,

          LOWER(
            COALESCE(
              u.first_name,
              ''
            )
          ) ASC,

          u.id ASC
        `,
        [
          normalizedCompetitionId,
        ],
      );

    return result.rows.map(
      (
        row,
        index,
      ) => ({
        ...normalizeRankingRow(
          row,
        ),

        position:
          index + 1,

        official_position:
          index + 1,

        provisional:
          false,
      }),
    );
  };


export const getProvisionalCompetitionPlayers =
  async (
    client,
    competitionId,
  ) => {
    assertClient(
      client,
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
          u.id,
          u.first_name,
          u.last_name,

          pcs.competition_id,
          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost,

          c.format,
          c.gender,
          c.city,
          c.placement_matches

        FROM player_competition_stats pcs

        JOIN users u
          ON u.id =
            pcs.user_id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          pcs.competition_id = $1

          AND pcs.matches_played <
            c.placement_matches

          AND u.role = 'player'

          AND u.verification_status =
            'verified'

          AND c.active = TRUE

        ORDER BY
          u.last_name ASC,
          u.first_name ASC,
          u.id ASC
        `,
        [
          normalizedCompetitionId,
        ],
      );

    const players =
      [];

    for (
      const row of
      result.rows
    ) {
      const normalized =
        normalizeRankingRow(
          row,
        );

      const placement =
        await getPlayerPlacementProgress(
          client,
          normalized.id,
          normalizedCompetitionId,
        );

      players.push({
        ...normalized,

        provisional:
          true,

        placement_matches_played:
          placement.played,

        placement_matches_remaining:
          placement.remaining,

        placement_wins:
          placement.wins,

        placement_losses:
          placement.losses,

        placement_completed:
          placement.completed,

        position:
          null,

        official_position:
          null,
      });
    }

    return players;
  };


export const getCompetitionRanking =
  async (
    client,
    competitionId,
  ) => {
    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const official =
      await getOfficialCompetitionRanking(
        client,
        normalizedCompetitionId,
      );

    const provisional =
      await getProvisionalCompetitionPlayers(
        client,
        normalizedCompetitionId,
      );

    return {
      competition_id:
        normalizedCompetitionId,

      official,

      provisional,

      official_count:
        official.length,

      provisional_count:
        provisional.length,

      total:
        official.length +
        provisional.length,
    };
  };


export const getOfficialCompetitionPosition =
  (
    userId,
    ranking,
  ) => {
    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    if (
      !Array.isArray(
        ranking,
      )
    ) {
      throw new CompetitionRankingError(
        "ranking debe ser un array.",
        "invalid_ranking",
      );
    }

    const player =
      ranking.find(
        (entry) =>
          Number(
            entry.id,
          ) ===
          normalizedUserId,
      );

    return player
      ? Number(
          player
            .official_position ??
            player.position,
        )
      : null;
  };


export const getCompetitionPercentileFromPosition =
  (
    position,
    officialCount,
  ) => {
    const normalizedPosition =
      positiveInteger(
        position,
        "position",
      );

    const normalizedCount =
      positiveInteger(
        officialCount,
        "officialCount",
      );

    if (
      normalizedPosition >
      normalizedCount
    ) {
      throw new CompetitionRankingError(
        "La posición no puede superar la cantidad de jugadores oficiales.",
        "position_out_of_range",
      );
    }

    if (
      normalizedCount === 1
    ) {
      return 100;
    }

    return (
      (
        normalizedCount -
        normalizedPosition
      ) /
      (
        normalizedCount -
        1
      )
    ) * 100;
  };


export const listActiveRankings =
  async (
    client,
    city,
  ) => {
    assertClient(
      client,
    );

    const normalizedCity =
      String(
        city ??
          "",
      ).trim();

    if (!normalizedCity) {
      throw new CompetitionRankingError(
        "city es obligatorio.",
        "city_required",
      );
    }

    const result =
      await client.query(
        `
        SELECT
          id,
          format,
          gender,
          city,
          name,
          team_size,
          placement_matches,
          active

        FROM competitions

        WHERE
          city = $1
          AND active = TRUE
          AND format IN (
            'singles',
            'doubles'
          )
          AND gender IN (
            'male',
            'female'
          )

        ORDER BY
          CASE
            WHEN format = 'singles'
              THEN 1
            WHEN format = 'doubles'
              THEN 2
            ELSE 3
          END,

          CASE
            WHEN gender = 'male'
              THEN 1
            WHEN gender = 'female'
              THEN 2
            ELSE 3
          END
        `,
        [
          normalizedCity,
        ],
      );

    return result.rows.map(
      (row) => ({
        id:
          Number(
            row.id,
          ),

        format:
          row.format,

        gender:
          row.gender,

        city:
          row.city,

        name:
          row.name,

        team_size:
          Number(
            row.team_size,
          ),

        placement_matches:
          Number(
            row.placement_matches ??
              PLACEMENT_MATCHES,
          ),

        active:
          Boolean(
            row.active,
          ),
      }),
    );
  };