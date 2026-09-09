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


const nonNegativeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number,
    ) ||
    number < 0
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

  return number;
};


const uniquePositiveIntegers = (
  values,
  field,
) => {
  if (
    !Array.isArray(
      values,
    ) ||
    values.length === 0
  ) {
    throw new CompetitionPlayerError(
      `${field} debe contener al menos un identificador.`,
      "invalid_identifier_list",
      {
        field,
        value:
          values,
      },
    );
  }

  const normalized =
    values.map(
      (
        value,
      ) =>
        positiveInteger(
          value,
          field,
        ),
    );

  const unique =
    [
      ...new Set(
        normalized,
      ),
    ];

  if (
    unique.length !==
    normalized.length
  ) {
    throw new CompetitionPlayerError(
      `${field} contiene identificadores repetidos.`,
      "duplicate_identifier",
      {
        field,
        value:
          values,
      },
    );
  }

  return unique;
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

  const savedName =
    String(
      row.name ??
        "",
    ).trim();

  const fallbackName =
    [
      row.first_name,
      row.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return {
    id:
      Number(
        row.id ??
          row.user_id,
      ),

    user_id:
      Number(
        row.user_id ??
          row.id,
      ),

    first_name:
      row.first_name,

    last_name:
      row.last_name,

    name:
      savedName ||
      fallbackName,

    phone:
      row.phone ??
      null,

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


const validateCompetitionPlayerRow = (
  row,
  {
    userId,
    competitionId,
  },
) => {
  if (
    row.role !==
    "player"
  ) {
    throw new CompetitionPlayerError(
      "El usuario no es un jugador.",
      "user_is_not_player",
      {
        user_id:
          userId,
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
          userId,

        competition_id:
          competitionId,
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
          userId,

        competition_id:
          competitionId,
      },
    );
  }
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
          u.id AS user_id,
          u.name,
          u.first_name,
          u.last_name,
          u.phone,
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
          ON pcs.user_id =
            u.id
          AND pcs.competition_id =
            c.id

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

    validateCompetitionPlayerRow(
      row,
      {
        userId:
          normalizedUserId,

        competitionId:
          normalizedCompetitionId,
      },
    );

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
      compatibility.rowCount ===
      0
    ) {
      throw new CompetitionPlayerError(
        "No existe el jugador o la competición.",
        "player_or_competition_not_found",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
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
        {
          user_id:
            normalizedUserId,
        },
      );
    }

    if (
      row.active !==
      true
    ) {
      throw new CompetitionPlayerError(
        "La competición está inactiva.",
        "competition_inactive",
        {
          competition_id:
            normalizedCompetitionId,
        },
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
          u.id AS user_id,
          u.name,
          u.first_name,
          u.last_name,
          u.phone,
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
          ON u.id =
            pcs.user_id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          pcs.competition_id = $1
          AND u.role = 'player'

        ORDER BY
          pcs.rating DESC,
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
        nonNegativeInteger(
          rating,
          "rating",
        ),

      matchesPlayed:
        nonNegativeInteger(
          matchesPlayed,
          "matchesPlayed",
        ),

      wins:
        nonNegativeInteger(
          wins,
          "wins",
        ),

      losses:
        nonNegativeInteger(
          losses,
          "losses",
        ),

      gamesWon:
        nonNegativeInteger(
          gamesWon,
          "gamesWon",
        ),

      gamesLost:
        nonNegativeInteger(
          gamesLost,
          "gamesLost",
        ),
    };

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
      result.rowCount ===
      0
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

    return normalizePlayerRow({
      ...result.rows[0],

      id:
        normalizedUserId,

      user_id:
        normalizedUserId,

      competition_id:
        normalizedCompetitionId,
    });
  };


export const lockCompetitionPlayers =
  async (
    client,
    {
      competitionId,
      userIds,
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

    const normalizedUserIds =
      uniquePositiveIntegers(
        userIds,
        "userIds",
      );

    /*
      Las filas deben existir antes del lock.
      No hacemos INSERT acá porque un helper llamado
      "lock" no debe modificar silenciosamente el modelo.
    */

    const result =
      await client.query(
        `
        SELECT
          u.id,
          u.id AS user_id,
          u.name,
          u.first_name,
          u.last_name,
          u.phone,
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
          ON u.id =
            pcs.user_id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          pcs.competition_id = $1

          AND pcs.user_id =
            ANY($2::int[])

        ORDER BY
          pcs.user_id ASC

        FOR UPDATE OF pcs
        `,
        [
          normalizedCompetitionId,
          normalizedUserIds,
        ],
      );

    if (
      result.rowCount !==
      normalizedUserIds.length
    ) {
      throw new CompetitionPlayerError(
        "No existen estadísticas de todos los jugadores en esta competición.",
        "competition_players_not_found",
        {
          competition_id:
            normalizedCompetitionId,

          expected_user_ids:
            normalizedUserIds,

          found_user_ids:
            result.rows.map(
              (
                row,
              ) =>
                Number(
                  row.user_id ??
                    row.id,
                ),
            ),
        },
      );
    }

    const players =
      result.rows.map(
        normalizePlayerRow,
      );

    for (
      const player of
      players
    ) {
      validateCompetitionPlayerRow(
        {
          ...player,

          competition_gender:
            player
              .competition_gender,

          competition_city:
            player
              .competition_city,
        },
        {
          userId:
            player.id,

          competitionId:
            normalizedCompetitionId,
        },
      );

      if (
        player
          .verification_status !==
        "verified"
      ) {
        throw new CompetitionPlayerError(
          "Uno de los jugadores no está verificado.",
          "player_not_verified",
          {
            user_id:
              player.id,

            competition_id:
              normalizedCompetitionId,
          },
        );
      }

      if (
        player
          .competition_active !==
        true
      ) {
        throw new CompetitionPlayerError(
          "La competición está inactiva.",
          "competition_inactive",
          {
            competition_id:
              normalizedCompetitionId,
          },
        );
      }
    }

    return players;
  };


export const applyCompetitionMatchStats =
  async (
    client,
    {
      userId,
      competitionId,
      rating,
      won,
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

    const normalizedRating =
      nonNegativeInteger(
        rating,
        "rating",
      );

    const normalizedGamesWon =
      nonNegativeInteger(
        gamesWon,
        "gamesWon",
      );

    const normalizedGamesLost =
      nonNegativeInteger(
        gamesLost,
        "gamesLost",
      );

    if (
      typeof won !==
      "boolean"
    ) {
      throw new CompetitionPlayerError(
        "won debe ser booleano.",
        "invalid_match_result",
        {
          won,
        },
      );
    }

    const result =
      await client.query(
        `
        UPDATE player_competition_stats

        SET
          rating = $3,

          matches_played =
            matches_played + 1,

          wins =
            wins +
            CASE
              WHEN $4::boolean
                THEN 1
              ELSE 0
            END,

          losses =
            losses +
            CASE
              WHEN $4::boolean
                THEN 0
              ELSE 1
            END,

          games_won =
            games_won + $5,

          games_lost =
            games_lost + $6,

          updated_at =
            NOW()

        WHERE
          user_id = $1
          AND competition_id = $2

        RETURNING
          user_id,
          competition_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          updated_at
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
          normalizedRating,
          won,
          normalizedGamesWon,
          normalizedGamesLost,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new CompetitionPlayerError(
        "No se pudieron aplicar las estadísticas del partido.",
        "competition_stats_update_failed",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    return {
      ...result.rows[0],

      user_id:
        Number(
          result.rows[0]
            .user_id,
        ),

      competition_id:
        Number(
          result.rows[0]
            .competition_id,
        ),

      rating:
        Number(
          result.rows[0]
            .rating,
        ),

      matches_played:
        Number(
          result.rows[0]
            .matches_played,
        ),

      wins:
        Number(
          result.rows[0]
            .wins,
        ),

      losses:
        Number(
          result.rows[0]
            .losses,
        ),

      games_won:
        Number(
          result.rows[0]
            .games_won,
        ),

      games_lost:
        Number(
          result.rows[0]
            .games_lost,
        ),
    };
  };


export default {
  getCompetitionPlayer,
  ensureCompetitionPlayer,
  getCompetitionPlayers,
  updateCompetitionPlayerStats,
  lockCompetitionPlayers,
  applyCompetitionMatchStats,
};