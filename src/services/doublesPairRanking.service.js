export class DoublesPairRankingError
  extends Error {
  constructor(
    message,
    reason =
      "doubles_pair_ranking_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "DoublesPairRankingError";

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
    throw new DoublesPairRankingError(
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
    throw new DoublesPairRankingError(
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


const normalizePlayer = (
  row,
  prefix,
) => {
  const id =
    Number(
      row[
        `${prefix}_id`
      ],
    );

  const firstName =
    row[
      `${prefix}_first_name`
    ] ??
    "";

  const lastName =
    row[
      `${prefix}_last_name`
    ] ??
    "";

  const legacyName =
    row[
      `${prefix}_name`
    ] ??
    "";

  const displayName =
    [
      lastName,
      firstName,
    ]
      .map(
        (value) =>
          String(
            value ??
              "",
          ).trim(),
      )
      .filter(Boolean)
      .join(" ");

  return {
    id,

    first_name:
      firstName,

    last_name:
      lastName,

    name:
      legacyName,

    display_name:
      displayName ||
      legacyName ||
      `Jugador #${id}`,
  };
};


const normalizePair = (
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

  const matchesPlayed =
    Number(
      row.matches_played ??
      0,
    );

  const placementMatches =
    Number(
      row.placement_matches ??
      5,
    );

  const player1 =
    normalizePlayer(
      row,
      "player1",
    );

  const player2 =
    normalizePlayer(
      row,
      "player2",
    );

  const provisional =
    matchesPlayed <
    placementMatches;

  return {
    id:
      Number(
        row.id,
      ),

    pair_id:
      Number(
        row.id,
      ),

    entity_type:
      "pair",

    competition_id:
      Number(
        row.competition_id,
      ),

    player1_id:
      player1.id,

    player2_id:
      player2.id,

    player1,

    player2,

    members: [
      player1,
      player2,
    ],

    display_name:
      `${player1.display_name} / ${player2.display_name}`,

    rating:
      Number(
        row.rating ??
        1000,
      ),

    matches_played:
      matchesPlayed,

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

    placement_matches:
      placementMatches,

    placement_matches_played:
      Math.min(
        matchesPlayed,
        placementMatches,
      ),

    placement_matches_remaining:
      Math.max(
        0,
        placementMatches -
        matchesPlayed,
      ),

    placement_completed:
      !provisional,

    provisional,

    format:
      row.format,

    gender:
      row.gender,

    city:
      row.city,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
};


const getCompetition =
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
          id,
          name,
          format,
          gender,
          city,
          team_size,
          placement_matches,
          active

        FROM competitions

        WHERE
          id = $1

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesPairRankingError(
        "Competición no encontrada.",
        "competition_not_found",
        404,
        {
          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const competition =
      result.rows[0];

    if (
      competition.format !==
        "doubles" ||
      Number(
        competition.team_size,
      ) !== 2
    ) {
      throw new DoublesPairRankingError(
        "La competición indicada no es de dobles.",
        "competition_not_doubles",
        409,
        {
          competition_id:
            normalizedCompetitionId,

          format:
            competition.format,

          team_size:
            Number(
              competition.team_size,
            ),
        },
      );
    }

    return {
      ...competition,

      id:
        Number(
          competition.id,
        ),

      team_size:
        Number(
          competition.team_size,
        ),

      placement_matches:
        Number(
          competition
            .placement_matches,
        ),

      active:
        Boolean(
          competition.active,
        ),
    };
  };


const rankingQuery = `
  SELECT
    cp.id,
    cp.competition_id,
    cp.player1_id,
    cp.player2_id,
    cp.rating,
    cp.matches_played,
    cp.wins,
    cp.losses,
    cp.games_won,
    cp.games_lost,
    cp.created_at,
    cp.updated_at,

    c.format,
    c.gender,
    c.city,
    c.placement_matches,

    p1.name
      AS player1_name,

    p1.first_name
      AS player1_first_name,

    p1.last_name
      AS player1_last_name,

    p2.name
      AS player2_name,

    p2.first_name
      AS player2_first_name,

    p2.last_name
      AS player2_last_name

  FROM competition_pairs cp

  JOIN competitions c
    ON c.id =
      cp.competition_id

  JOIN users p1
    ON p1.id =
      cp.player1_id

  JOIN users p2
    ON p2.id =
      cp.player2_id

  WHERE
    cp.competition_id = $1

    AND c.format =
      'doubles'

    AND c.team_size = 2

    AND c.active =
      TRUE

    AND p1.role =
      'player'

    AND p2.role =
      'player'

    AND p1.verification_status =
      'verified'

    AND p2.verification_status =
      'verified'
`;


const rankingOrder = `
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
`;


export const getOfficialDoublesPairRanking =
  async (
    client,
    competitionId,
  ) => {
    assertClient(
      client,
    );

    const competition =
      await getCompetition(
        client,
        competitionId,
      );

    const result =
      await client.query(
        `
        ${rankingQuery}

        AND cp.matches_played >=
          c.placement_matches

        ${rankingOrder}
        `,
        [
          competition.id,
        ],
      );

    return result.rows.map(
      (
        row,
        index,
      ) => ({
        ...normalizePair(
          row,
        ),

        provisional:
          false,

        position:
          index + 1,

        official_position:
          index + 1,

        rank_position:
          index + 1,
      }),
    );
  };


export const getProvisionalDoublesPairRanking =
  async (
    client,
    competitionId,
  ) => {
    assertClient(
      client,
    );

    const competition =
      await getCompetition(
        client,
        competitionId,
      );

    const result =
      await client.query(
        `
        ${rankingQuery}

        AND cp.matches_played <
          c.placement_matches

        ${rankingOrder}
        `,
        [
          competition.id,
        ],
      );

    return result.rows.map(
      (
        row,
        index,
      ) => ({
        ...normalizePair(
          row,
        ),

        provisional:
          true,

        position:
          null,

        official_position:
          null,

        rank_position:
          null,

        provisional_position:
          index + 1,
      }),
    );
  };


export const getDoublesPairRanking =
  async (
    client,
    competitionId,
  ) => {
    const competition =
      await getCompetition(
        client,
        competitionId,
      );

    const [
      official,
      provisional,
    ] =
      await Promise.all([
        getOfficialDoublesPairRanking(
          client,
          competition.id,
        ),

        getProvisionalDoublesPairRanking(
          client,
          competition.id,
        ),
      ]);

    return {
      competition,

      competition_id:
        competition.id,

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


export const getDoublesPairByRankingId =
  async (
    client,
    {
      competitionId,
      pairId,
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

    const normalizedPairId =
      positiveInteger(
        pairId,
        "pairId",
      );

    const result =
      await client.query(
        `
        ${rankingQuery}

        AND cp.id = $2

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedPairId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      return null;
    }

    return normalizePair(
      result.rows[0],
    );
  };


export const getUserDoublesPairs =
  async (
    client,
    {
      competitionId,
      userId,
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

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const result =
      await client.query(
        `
        ${rankingQuery}

        AND (
          cp.player1_id = $2

          OR cp.player2_id = $2
        )

        ${rankingOrder}
        `,
        [
          normalizedCompetitionId,
          normalizedUserId,
        ],
      );

    return result.rows.map(
      normalizePair,
    );
  };


export const getHistoricalDoublesPairElo =
  async (
    client,
    competitionId,
    {
      limit =
        3,
    } = {},
  ) => {
    assertClient(
      client,
    );

    const competition =
      await getCompetition(
        client,
        competitionId,
      );

    const normalizedLimit =
      positiveInteger(
        limit,
        "limit",
      );

    const result =
      await client.query(
        `
        WITH eligible_pairs AS (
          SELECT
            cp.id,
            cp.player1_id,
            cp.player2_id,
            cp.rating
              AS current_elo,
            cp.matches_played,

            p1.name
              AS player1_name,

            p1.first_name
              AS player1_first_name,

            p1.last_name
              AS player1_last_name,

            p2.name
              AS player2_name,

            p2.first_name
              AS player2_first_name,

            p2.last_name
              AS player2_last_name

          FROM competition_pairs cp

          JOIN users p1
            ON p1.id =
              cp.player1_id

          JOIN users p2
            ON p2.id =
              cp.player2_id

          WHERE
            cp.competition_id = $1

            AND p1.role =
              'player'

            AND p2.role =
              'player'

            AND p1.verification_status =
              'verified'

            AND p2.verification_status =
              'verified'
        ),

        event_peaks AS (
          SELECT DISTINCT ON (
            pee.pair_id
          )
            pee.pair_id,

            pee.elo_after
              AS peak_elo,

            pee.created_at
              AS peak_reached_at,

            pee.id
              AS peak_event_id

          FROM pair_elo_events pee

          JOIN eligible_pairs ep
            ON ep.id =
              pee.pair_id

          WHERE
            pee.competition_id = $1

            AND pee.reversed_at
              IS NULL

          ORDER BY
            pee.pair_id,
            pee.elo_after DESC,
            pee.created_at ASC,
            pee.id ASC
        ),

        peaks AS (
          SELECT
            ep.*,

            CASE
              WHEN ev.peak_elo
                IS NULL
                THEN ep.current_elo

              WHEN ep.current_elo >
                ev.peak_elo
                THEN ep.current_elo

              ELSE
                ev.peak_elo
            END::int
              AS peak_elo,

            CASE
              WHEN ev.peak_elo
                IS NULL
                THEN NULL

              WHEN ep.current_elo >
                ev.peak_elo
                THEN NULL

              ELSE
                ev.peak_reached_at
            END
              AS peak_reached_at

          FROM eligible_pairs ep

          LEFT JOIN event_peaks ev
            ON ev.pair_id =
              ep.id
        )

        SELECT
          *,

          ROW_NUMBER() OVER (
            ORDER BY
              peak_elo DESC,

              LOWER(
                COALESCE(
                  player1_last_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  player1_first_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  player2_last_name,
                  ''
                )
              ) ASC,

              LOWER(
                COALESCE(
                  player2_first_name,
                  ''
                )
              ) ASC,

              id ASC
          )::int
            AS historical_position

        FROM peaks

        ORDER BY
          peak_elo DESC,

          LOWER(
            COALESCE(
              player1_last_name,
              ''
            )
          ) ASC,

          LOWER(
            COALESCE(
              player1_first_name,
              ''
            )
          ) ASC,

          LOWER(
            COALESCE(
              player2_last_name,
              ''
            )
          ) ASC,

          LOWER(
            COALESCE(
              player2_first_name,
              ''
            )
          ) ASC,

          id ASC

        LIMIT $2
        `,
        [
          competition.id,
          normalizedLimit,
        ],
      );

    return result.rows.map(
      (
        row,
      ) => {
        const player1 =
          normalizePlayer(
            row,
            "player1",
          );

        const player2 =
          normalizePlayer(
            row,
            "player2",
          );

        return {
          id:
            Number(
              row.id,
            ),

          pair_id:
            Number(
              row.id,
            ),

          competition_id:
            competition.id,

          entity_type:
            "pair",

          player1_id:
            Number(
              row.player1_id,
            ),

          player2_id:
            Number(
              row.player2_id,
            ),

          player1,

          player2,

          members: [
            player1,
            player2,
          ],

          display_name:
            `${player1.display_name} / ${player2.display_name}`,

          current_elo:
            Number(
              row.current_elo ??
              1000,
            ),

          matches_played:
            Number(
              row.matches_played ??
              0,
            ),

          peak_elo:
            Number(
              row.peak_elo ??
              1000,
            ),

          peak_reached_at:
            row
              .peak_reached_at,

          historical_position:
            Number(
              row
                .historical_position,
            ),
        };
      },
    );
  };


export default {
  getOfficialDoublesPairRanking,
  getProvisionalDoublesPairRanking,
  getDoublesPairRanking,
  getDoublesPairByRankingId,
  getUserDoublesPairs,
  getHistoricalDoublesPairElo,
};