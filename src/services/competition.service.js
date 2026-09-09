const VALID_FORMATS = new Set([
  "singles",
  "doubles",
]);

const VALID_GENDERS = new Set([
  "male",
  "female",
]);


export class CompetitionServiceError extends Error {
  constructor(
    message,
    reason = "competition_service_error",
    details = {},
  ) {
    super(message);

    this.name =
      "CompetitionServiceError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const requireClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !== "function"
  ) {
    throw new CompetitionServiceError(
      "Se requiere un cliente PostgreSQL válido.",
      "invalid_database_client",
    );
  }
};


const normalizePositiveInteger = (
  value,
  field,
) => {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new CompetitionServiceError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return parsed;
};


export const normalizeCompetitionFormat = (
  format,
) => {
  const normalized =
    String(
      format ?? "",
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_FORMATS.has(
      normalized,
    )
  ) {
    throw new CompetitionServiceError(
      "Formato de competición inválido.",
      "invalid_competition_format",
      {
        format,
      },
    );
  }

  return normalized;
};


export const normalizeCompetitionGender = (
  gender,
) => {
  const normalized =
    String(
      gender ?? "",
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_GENDERS.has(
      normalized,
    )
  ) {
    throw new CompetitionServiceError(
      "Género de competición inválido.",
      "invalid_competition_gender",
      {
        gender,
      },
    );
  }

  return normalized;
};


export const normalizeCompetitionCity = (
  city,
) => {
  const normalized =
    String(
      city ?? "",
    )
      .trim();

  if (
    normalized.length === 0
  ) {
    throw new CompetitionServiceError(
      "La ciudad de la competición es obligatoria.",
      "invalid_competition_city",
      {
        city,
      },
    );
  }

  return normalized;
};


export const getExpectedTeamSize = (
  format,
) => {
  const normalizedFormat =
    normalizeCompetitionFormat(
      format,
    );

  if (
    normalizedFormat ===
    "singles"
  ) {
    return 1;
  }

  return 2;
};


export const isCompetitionShapeValid = (
  competition,
) => {
  if (
    !competition ||
    typeof competition !==
      "object"
  ) {
    return false;
  }

  try {
    const format =
      normalizeCompetitionFormat(
        competition.format,
      );

    normalizeCompetitionGender(
      competition.gender,
    );

    normalizeCompetitionCity(
      competition.city,
    );

    const teamSize =
      Number(
        competition.team_size,
      );

    const placementMatches =
      Number(
        competition.placement_matches,
      );

    if (
      teamSize !==
      getExpectedTeamSize(
        format,
      )
    ) {
      return false;
    }

    if (
      !Number.isInteger(
        placementMatches,
      ) ||
      placementMatches <= 0
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};


export const isPlayerProvisionalInCompetition = (
  stats,
  competition,
) => {
  if (
    !stats
  ) {
    return true;
  }

  const matchesPlayed =
    Number(
      stats.matches_played ?? 0,
    );

  const placementMatches =
    Number(
      competition?.placement_matches ??
        5,
    );

  if (
    !Number.isFinite(
      matchesPlayed,
    ) ||
    matchesPlayed < 0
  ) {
    throw new CompetitionServiceError(
      "matches_played inválido en estadísticas de competición.",
      "invalid_competition_matches_played",
      {
        matches_played:
          stats.matches_played,
      },
    );
  }

  if (
    !Number.isInteger(
      placementMatches,
    ) ||
    placementMatches <= 0
  ) {
    throw new CompetitionServiceError(
      "placement_matches inválido en competición.",
      "invalid_placement_matches",
      {
        placement_matches:
          competition
            ?.placement_matches,
      },
    );
  }

  return (
    matchesPlayed <
    placementMatches
  );
};


export const getCompetitionById = async (
  client,
  competitionId,
  {
    activeOnly = false,
    forUpdate = false,
  } = {},
) => {
  requireClient(
    client,
  );

  const id =
    normalizePositiveInteger(
      competitionId,
      "competitionId",
    );

  const activeClause =
    activeOnly
      ? "AND active = TRUE"
      : "";

  const lockClause =
    forUpdate
      ? "FOR UPDATE"
      : "";

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
          active,
          created_at,
          updated_at
        FROM competitions
        WHERE id = $1
          ${activeClause}
        LIMIT 1
        ${lockClause}
      `,
      [
        id,
      ],
    );

  if (
    result.rowCount === 0
  ) {
    return null;
  }

  const competition =
    result.rows[0];

  if (
    !isCompetitionShapeValid(
      competition,
    )
  ) {
    throw new CompetitionServiceError(
      "La competición almacenada tiene una configuración inválida.",
      "invalid_stored_competition",
      {
        competition_id:
          id,
      },
    );
  }

  return competition;
};


export const getCompetitionByIdentity = async (
  client,
  {
    format,
    gender,
    city,
    activeOnly = true,
  },
) => {
  requireClient(
    client,
  );

  const normalizedFormat =
    normalizeCompetitionFormat(
      format,
    );

  const normalizedGender =
    normalizeCompetitionGender(
      gender,
    );

  const normalizedCity =
    normalizeCompetitionCity(
      city,
    );

  const activeClause =
    activeOnly
      ? "AND active = TRUE"
      : "";

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
          active,
          created_at,
          updated_at
        FROM competitions
        WHERE format = $1
          AND gender = $2
          AND city = $3
          ${activeClause}
        LIMIT 1
      `,
      [
        normalizedFormat,
        normalizedGender,
        normalizedCity,
      ],
    );

  if (
    result.rowCount === 0
  ) {
    return null;
  }

  const competition =
    result.rows[0];

  if (
    !isCompetitionShapeValid(
      competition,
    )
  ) {
    throw new CompetitionServiceError(
      "La competición almacenada tiene una configuración inválida.",
      "invalid_stored_competition",
      {
        format:
          normalizedFormat,

        gender:
          normalizedGender,

        city:
          normalizedCity,
      },
    );
  }

  return competition;
};


export const resolveCompetitionForPlayer = async (
  client,
  {
    userId,
    format,
    activeOnly = true,
  },
) => {
  requireClient(
    client,
  );

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "userId",
    );

  const normalizedFormat =
    normalizeCompetitionFormat(
      format,
    );

  const activeClause =
    activeOnly
      ? "AND c.active = TRUE"
      : "";

  const result =
    await client.query(
      `
        SELECT
          c.id,
          c.format,
          c.gender,
          c.city,
          c.name,
          c.team_size,
          c.placement_matches,
          c.active,
          c.created_at,
          c.updated_at
        FROM users u
        JOIN competitions c
          ON c.gender = u.gender
          AND c.city = u.city
          AND c.format = $2
        WHERE u.id = $1
          AND u.role = 'player'
          ${activeClause}
        LIMIT 1
      `,
      [
        normalizedUserId,
        normalizedFormat,
      ],
    );

  if (
    result.rowCount === 0
  ) {
    return null;
  }

  const competition =
    result.rows[0];

  if (
    !isCompetitionShapeValid(
      competition,
    )
  ) {
    throw new CompetitionServiceError(
      "La competición resuelta para el jugador es inválida.",
      "invalid_stored_competition",
      {
        user_id:
          normalizedUserId,

        format:
          normalizedFormat,
      },
    );
  }

  return competition;
};


export const getPlayerCompetitionStats = async (
  client,
  {
    userId,
    competitionId,
    forUpdate = false,
  },
) => {
  requireClient(
    client,
  );

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "userId",
    );

  const normalizedCompetitionId =
    normalizePositiveInteger(
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
          id,
          user_id,
          competition_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          created_at,
          updated_at
        FROM player_competition_stats
        WHERE user_id = $1
          AND competition_id = $2
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

  return result.rows[0];
};


export const ensurePlayerCompetitionStats = async (
  client,
  {
    userId,
    competitionId,
  },
) => {
  requireClient(
    client,
  );

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "userId",
    );

  const normalizedCompetitionId =
    normalizePositiveInteger(
      competitionId,
      "competitionId",
    );

  const compatibility =
    await client.query(
      `
        SELECT
          u.id AS user_id,
          u.gender AS user_gender,
          u.city AS user_city,
          u.role AS user_role,

          c.id AS competition_id,
          c.format,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.team_size,
          c.placement_matches,
          c.active
        FROM users u
        JOIN competitions c
          ON c.id = $2
        WHERE u.id = $1
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
    throw new CompetitionServiceError(
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
    row.user_role !==
    "player"
  ) {
    throw new CompetitionServiceError(
      "El usuario no es un jugador.",
      "user_is_not_player",
      {
        user_id:
          normalizedUserId,
      },
    );
  }

  if (
    row.user_gender !==
      row.competition_gender ||
    row.user_city !==
      row.competition_city
  ) {
    throw new CompetitionServiceError(
      "El jugador no pertenece a esta competición.",
      "player_competition_mismatch",
      {
        user_id:
          normalizedUserId,

        competition_id:
          normalizedCompetitionId,

        user_gender:
          row.user_gender,

        competition_gender:
          row.competition_gender,

        user_city:
          row.user_city,

        competition_city:
          row.competition_city,
      },
    );
  }

  if (
    row.active !== true
  ) {
    throw new CompetitionServiceError(
      "La competición está inactiva.",
      "competition_inactive",
      {
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

  const stats =
    await getPlayerCompetitionStats(
      client,
      {
        userId:
          normalizedUserId,

        competitionId:
          normalizedCompetitionId,
      },
    );

  if (
    !stats
  ) {
    throw new CompetitionServiceError(
      "No se pudieron obtener las estadísticas de competición.",
      "competition_stats_not_available",
      {
        user_id:
          normalizedUserId,

        competition_id:
          normalizedCompetitionId,
      },
    );
  }

  return stats;
};


export const getPlayerCompetitionState = async (
  client,
  {
    userId,
    competitionId,
    createStats = false,
  },
) => {
  requireClient(
    client,
  );

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "userId",
    );

  const normalizedCompetitionId =
    normalizePositiveInteger(
      competitionId,
      "competitionId",
    );

  const competition =
    await getCompetitionById(
      client,
      normalizedCompetitionId,
      {
        activeOnly:
          true,
      },
    );

  if (
    !competition
  ) {
    throw new CompetitionServiceError(
      "La competición no existe o está inactiva.",
      "competition_not_found",
      {
        competition_id:
          normalizedCompetitionId,
      },
    );
  }

  let stats =
    await getPlayerCompetitionStats(
      client,
      {
        userId:
          normalizedUserId,

        competitionId:
          normalizedCompetitionId,
      },
    );

  if (
    !stats &&
    createStats
  ) {
    stats =
      await ensurePlayerCompetitionStats(
        client,
        {
          userId:
            normalizedUserId,

          competitionId:
            normalizedCompetitionId,
        },
      );
  }

  const matchesPlayed =
    Number(
      stats?.matches_played ??
        0,
    );

  const placementMatches =
    Number(
      competition
        .placement_matches,
    );

  return {
    user_id:
      normalizedUserId,

    competition_id:
      normalizedCompetitionId,

    competition,

    stats,

    rating:
      Number(
        stats?.rating ??
          0,
      ),

    matches_played:
      matchesPlayed,

    placement_matches:
      placementMatches,

    placement_matches_remaining:
      Math.max(
        0,
        placementMatches -
          matchesPlayed,
      ),

    provisional:
      isPlayerProvisionalInCompetition(
        stats,
        competition,
      ),
  };
};


export const listPlayerCompetitions = async (
  client,
  {
    userId,
    activeOnly = true,
  },
) => {
  requireClient(
    client,
  );

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "userId",
    );

  const activeClause =
    activeOnly
      ? "AND c.active = TRUE"
      : "";

  const result =
    await client.query(
      `
        SELECT
          c.id,
          c.format,
          c.gender,
          c.city,
          c.name,
          c.team_size,
          c.placement_matches,
          c.active,

          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost

        FROM users u

        JOIN competitions c
          ON c.gender = u.gender
          AND c.city = u.city

        LEFT JOIN player_competition_stats pcs
          ON pcs.user_id = u.id
          AND pcs.competition_id = c.id

        WHERE u.id = $1
          AND u.role = 'player'
          ${activeClause}

        ORDER BY
          CASE
            WHEN c.format = 'singles'
              THEN 1
            WHEN c.format = 'doubles'
              THEN 2
            ELSE 3
          END,
          c.id
      `,
      [
        normalizedUserId,
      ],
    );

  return result.rows.map(
    (
      row,
    ) => {
      const competition = {
        id:
          row.id,

        format:
          row.format,

        gender:
          row.gender,

        city:
          row.city,

        name:
          row.name,

        team_size:
          row.team_size,

        placement_matches:
          row.placement_matches,

        active:
          row.active,
      };

      const hasStats =
        row.rating !== null &&
        row.rating !== undefined;

      const stats =
        hasStats
          ? {
              rating:
                Number(
                  row.rating,
                ),

              matches_played:
                Number(
                  row.matches_played ??
                    0,
                ),

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
            }
          : null;

      return {
        ...competition,

        stats,

        rating:
          stats?.rating ??
          0,

        matches_played:
          stats
            ?.matches_played ??
          0,

        provisional:
          isPlayerProvisionalInCompetition(
            stats,
            competition,
          ),
      };
    },
  );
};


export default {
  normalizeCompetitionFormat,
  normalizeCompetitionGender,
  normalizeCompetitionCity,
  getExpectedTeamSize,
  isCompetitionShapeValid,
  isPlayerProvisionalInCompetition,
  getCompetitionById,
  getCompetitionByIdentity,
  resolveCompetitionForPlayer,
  getPlayerCompetitionStats,
  ensurePlayerCompetitionStats,
  getPlayerCompetitionState,
  listPlayerCompetitions,
};