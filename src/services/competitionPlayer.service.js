import {
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";


export class CompetitionPlayerError extends Error {
  constructor(
    message,
    reason = "competition_player_error",
    details = null,
  ) {
    super(message);

    this.name =
      "CompetitionPlayerError";

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
    throw new CompetitionPlayerError(
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
    throw new CompetitionPlayerError(
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


const normalizePlayerRow = (
  row,
) => {
  if (!row) {
    return null;
  }

  const matchesPlayed =
    Number(
      row.matches_played ??
        0,
    );

  const placementMatches =
    Number(
      row.placement_matches ??
        PLACEMENT_MATCHES,
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

    gender:
      row.gender,

    city:
      row.city,

    role:
      row.role,

    verification_status:
      row.verification_status,

    competition_id:
      Number(
        row.competition_id,
      ),

    competition_name:
      row.competition_name,

    format:
      row.format,

    competition_gender:
      row.competition_gender,

    competition_city:
      row.competition_city,

    team_size:
      Number(
        row.team_size,
      ),

    placement_matches:
      placementMatches,

    competition_active:
      Boolean(
        row.competition_active,
      ),

    rating:
      Number(
        row.rating ??
          0,
      ),

    matches_played:
      matchesPlayed,

    wins:
      Number(
        row.wins ??
          0,
      ),

    losses:
      Number(
        row.losses ??
          0,
      ),

    games_won:
      Number(
        row.games_won ??
          0,
      ),

    games_lost:
      Number(
        row.games_lost ??
          0,
      ),

    provisional:
      matchesPlayed <
      placementMatches,
  };
};


export const getCompetitionPlayer =
  async (
    client,
    {
      userId,
      competitionId,
      forUpdate = false,
    },
  ) => {
    assertClient(
      client,
    );

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
        ? "FOR UPDATE OF pcs"
        : "";

    const result =
      await client.query(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.gender,
          u.city,
          u.role,
          u.verification_status,

          c.id AS competition_id,
          c.name AS competition_name,
          c.format,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.team_size,
          c.placement_matches,
          c.active AS competition_active,

          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost

        FROM users u

        JOIN competitions c
          ON c.id = $2

        LEFT JOIN player_competition_stats pcs
          ON pcs.user_id = u.id
          AND pcs.competition_id = c.id

        WHERE
          u.id = $1

        LIMIT 1

        ${lockClause}
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    if (
      result.rowCount === 0
    ) {
      return null;
    }

    const row =
      result.rows[0];

    if (
      row.role !==
      "player"
    ) {
      throw new CompetitionPlayerError(
        "El usuario no es un jugador.",
        "user_is_not_player",
        {
          user_id:
            normalizedUserId,
        },
      );
    }

    if (
      row.gender !==
      row.competition_gender
    ) {
      throw new CompetitionPlayerError(
        "El género del jugador no corresponde a la competición.",
        "competition_gender_mismatch",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    if (
      row.city !==
      row.competition_city
    ) {
      throw new CompetitionPlayerError(
        "La ciudad del jugador no corresponde a la competición.",
        "competition_city_mismatch",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    return normalizePlayerRow(
      row,
    );
  };


export const ensureCompetitionPlayer =
  async (
    client,
    {
      userId,
      competitionId,
    },
  ) => {
    assertClient(
      client,
    );

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

    const compatibility =
      await client.query(
        `
        SELECT
          u.id,
          u.role,
          u.gender AS user_gender,
          u.city AS user_city,

          c.gender AS competition_gender,
          c.city AS competition_city,
          c.active

        FROM users u

        CROSS JOIN competitions c

        WHERE
          u.id = $1
          AND c.id = $2

        LIMIT 1
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    if (
      compatibility.rowCount === 0
    ) {
      throw new CompetitionPlayerError(
        "No existe el jugador o la competición.",
        "player_or_competition_not_found",
      );
    }

    const row =
      compatibility.rows[0];

    if (
      row.role !==
      "player"
    ) {
      throw new CompetitionPlayerError(
        "El usuario no es un jugador.",
        "user_is_not_player",
      );
    }

    if (
      row.active !== true
    ) {
      throw new CompetitionPlayerError(
        "La competición está inactiva.",
        "competition_inactive",
      );
    }

    if (
      row.user_gender !==
      row.competition_gender ||
      row.user_city !==
      row.competition_city
    ) {
      throw new CompetitionPlayerError(
        "El jugador no pertenece a esta competición.",
        "player_competition_mismatch",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    await client.query(
      `
      INSERT INTO player_competition_stats (
        user_id,
        competition_id,
        rating,
        matches_played,
        wins,
        losses,
        games_won,
        games_lost
      )

      VALUES (
        $1,
        $2,
        0,
        0,
        0,
        0,
        0,
        0
      )

      ON CONFLICT (
        user_id,
        competition_id
      )

      DO NOTHING
      `,
      [
        normalizedUserId,
        normalizedCompetitionId,
      ],
    );

    return getCompetitionPlayer(
      client,
      {
        userId:
          normalizedUserId,

        competitionId:
          normalizedCompetitionId,
      },
    );
  };


export const getCompetitionPlayers =
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
          u.gender,
          u.city,
          u.role,
          u.verification_status,

          c.id AS competition_id,
          c.name AS competition_name,
          c.format,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.team_size,
          c.placement_matches,
          c.active AS competition_active,

          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost

        FROM player_competition_stats pcs

        JOIN users u
          ON u.id = pcs.user_id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          pcs.competition_id = $1
          AND u.role = 'player'

        ORDER BY
          pcs.rating DESC,
          u.last_name ASC,
          u.first_name ASC,
          u.id ASC
        `,
        [
          normalizedCompetitionId,
        ],
      );

    return result.rows.map(
      normalizePlayerRow,
    );
  };


export const updateCompetitionPlayerStats =
  async (
    client,
    {
      userId,
      competitionId,
      rating,
      matchesPlayed,
      wins,
      losses,
      gamesWon,
      gamesLost,
    },
  ) => {
    assertClient(
      client,
    );

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

    const values = {
      rating:
        Number(rating),

      matchesPlayed:
        Number(matchesPlayed),

      wins:
        Number(wins),

      losses:
        Number(losses),

      gamesWon:
        Number(gamesWon),

      gamesLost:
        Number(gamesLost),
    };

    for (
      const [
        field,
        value,
      ] of
      Object.entries(
        values,
      )
    ) {
      if (
        !Number.isInteger(
          value,
        ) ||
        value < 0
      ) {
        throw new CompetitionPlayerError(
          `${field} debe ser un entero no negativo.`,
          "invalid_competition_stat",
          {
            field,
            value,
          },
        );
      }
    }

    const result =
      await client.query(
        `
        UPDATE player_competition_stats

        SET
          rating = $3,
          matches_played = $4,
          wins = $5,
          losses = $6,
          games_won = $7,
          games_lost = $8,
          updated_at = NOW()

        WHERE
          user_id = $1
          AND competition_id = $2

        RETURNING *
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
          values.rating,
          values.matchesPlayed,
          values.wins,
          values.losses,
          values.gamesWon,
          values.gamesLost,
        ],
      );

    if (
      result.rowCount === 0
    ) {
      throw new CompetitionPlayerError(
        "No existen estadísticas del jugador en esta competición.",
        "competition_stats_not_found",
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