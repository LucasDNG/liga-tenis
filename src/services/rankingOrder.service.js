/*
  ============================================================
  LA RED
  ORDEN DEPORTIVO CENTRAL DEL RANKING
  ============================================================

  Este servicio define UNA sola regla para ordenar
  jugadores oficiales de una liga.

  Orden oficial:

  1. Elo DESC
  2. victorias - derrotas DESC
  3. games ganados - games perdidos DESC
  4. apellido ASC
  5. nombre ASC
  6. ID ASC

  Solamente cuentan partidos:

  - status = 'completed'
  - no anulados

  Los partidos cancelados, pendientes o anulados
  NO forman parte de las estadísticas deportivas.

  IMPORTANTE:

  Este archivo NO modifica:
  - Elo
  - partidos
  - usuarios
  - desafíos

  Solamente construye estadísticas y ranking.
  ============================================================
*/


export const PLACEMENT_MATCHES = 5;


/*
  ============================================================
  ERROR
  ============================================================
*/

export class RankingOrderError extends Error {
  constructor(
    message,
    reason = "ranking_order_error",
    details = null,
  ) {
    super(message);

    this.name =
      "RankingOrderError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  HELPERS
  ============================================================
*/

const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new RankingOrderError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const normalizeText = (
  value,
) =>
  String(
    value ?? "",
  ).trim();


const normalizeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    throw new RankingOrderError(
      `${field} debe ser un entero.`,
      "invalid_integer",
      {
        field,
        value,
      },
    );
  }

  return number;
};


/*
  ============================================================
  SCORE
  ============================================================

  Formato persistido:

  [
    { p1: 6, p2: 4 },
    { p1: 6, p2: 3 }
  ]

  También toleramos que PostgreSQL entregue JSON
  como string, para no depender de la configuración
  concreta del driver.
  ============================================================
*/

export const normalizeStoredScore = (
  rawScore,
) => {
  if (
    rawScore === null ||
    rawScore === undefined
  ) {
    return [];
  }

  let score =
    rawScore;

  if (
    typeof score ===
    "string"
  ) {
    try {
      score =
        JSON.parse(score);
    } catch {
      return [];
    }
  }

  if (
    !Array.isArray(score)
  ) {
    return [];
  }

  const normalized =
    [];

  for (
    const set of score
  ) {
    if (
      !set ||
      typeof set !==
        "object" ||
      Array.isArray(set)
    ) {
      return [];
    }

    const p1 =
      Number(set.p1);

    const p2 =
      Number(set.p2);

    if (
      !Number.isInteger(p1) ||
      !Number.isInteger(p2) ||
      p1 < 0 ||
      p2 < 0
    ) {
      return [];
    }

    normalized.push({
      p1,
      p2,
    });
  }

  return normalized;
};


/*
  ============================================================
  GAMES DE UN PARTIDO
  ============================================================
*/

export const calculateMatchGames = ({
  score,
}) => {
  const normalizedScore =
    normalizeStoredScore(
      score,
    );

  let player1Games = 0;
  let player2Games = 0;

  for (
    const set of
    normalizedScore
  ) {
    player1Games +=
      set.p1;

    player2Games +=
      set.p2;
  }

  return {
    player1_games:
      player1Games,

    player2_games:
      player2Games,

    total_games:
      player1Games +
      player2Games,
  };
};


/*
  ============================================================
  ESTADÍSTICAS DEPORTIVAS DE LA LIGA
  ============================================================

  Se calculan desde matches para evitar tener contadores
  derivados que puedan quedar desincronizados después de
  una anulación/replay.

  El ganador sale de winner_id.

  Games:
  - player1_id recibe suma de p1
  - player2_id recibe suma de p2
  ============================================================
*/

export const getLeagueSportStats = async (
  client,
  {
    city,
    gender,
  },
) => {
  assertClient(
    client,
  );

  if (
    !city ||
    !gender
  ) {
    throw new RankingOrderError(
      "Ciudad y liga son obligatorias.",
      "league_context_missing",
      {
        city,
        gender,
      },
    );
  }

  const result =
    await client.query(
      `
      SELECT
        m.id,
        m.player1_id,
        m.player2_id,
        m.winner_id,
        m.proposed_score

      FROM matches m

      JOIN users p1
        ON p1.id =
           m.player1_id

      JOIN users p2
        ON p2.id =
           m.player2_id

      WHERE
        m.status =
          'completed'

        AND m.annulled_at
          IS NULL

        AND m.winner_id
          IS NOT NULL

        AND p1.city = $1
        AND p2.city = $1

        AND p1.gender = $2
        AND p2.gender = $2

      ORDER BY
        m.completed_at ASC NULLS LAST,
        m.id ASC
      `,
      [
        city,
        gender,
      ],
    );

  const statsById =
    new Map();

  const ensurePlayer = (
    userId,
  ) => {
    const id =
      Number(userId);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return null;
    }

    if (
      !statsById.has(id)
    ) {
      statsById.set(
        id,
        {
          user_id:
            id,

          wins:
            0,

          losses:
            0,

          match_balance:
            0,

          games_won:
            0,

          games_lost:
            0,

          game_balance:
            0,
        },
      );
    }

    return statsById.get(
      id,
    );
  };

  for (
    const match of
    result.rows
  ) {
    const player1Id =
      Number(
        match.player1_id,
      );

    const player2Id =
      Number(
        match.player2_id,
      );

    const winnerId =
      Number(
        match.winner_id,
      );

    if (
      !Number.isInteger(
        player1Id,
      ) ||
      !Number.isInteger(
        player2Id,
      ) ||
      !Number.isInteger(
        winnerId,
      )
    ) {
      continue;
    }

    if (
      winnerId !==
        player1Id &&
      winnerId !==
        player2Id
    ) {
      continue;
    }

    const player1Stats =
      ensurePlayer(
        player1Id,
      );

    const player2Stats =
      ensurePlayer(
        player2Id,
      );

    if (
      !player1Stats ||
      !player2Stats
    ) {
      continue;
    }

    const loserId =
      winnerId ===
        player1Id
        ? player2Id
        : player1Id;

    const winnerStats =
      ensurePlayer(
        winnerId,
      );

    const loserStats =
      ensurePlayer(
        loserId,
      );

    winnerStats.wins +=
      1;

    loserStats.losses +=
      1;

    const games =
      calculateMatchGames({
        score:
          match.proposed_score,
      });

    player1Stats.games_won +=
      games.player1_games;

    player1Stats.games_lost +=
      games.player2_games;

    player2Stats.games_won +=
      games.player2_games;

    player2Stats.games_lost +=
      games.player1_games;
  }

  for (
    const stats of
    statsById.values()
  ) {
    stats.match_balance =
      stats.wins -
      stats.losses;

    stats.game_balance =
      stats.games_won -
      stats.games_lost;
  }

  return statsById;
};


/*
  ============================================================
  ESTADÍSTICA VACÍA
  ============================================================
*/

export const createEmptySportStats = (
  userId,
) => ({
  user_id:
    normalizeInteger(
      userId,
      "userId",
    ),

  wins:
    0,

  losses:
    0,

  match_balance:
    0,

  games_won:
    0,

  games_lost:
    0,

  game_balance:
    0,
});


/*
  ============================================================
  COMPARADOR DEPORTIVO
  ============================================================

  Valor negativo:
    a va antes que b.

  Valor positivo:
    b va antes que a.

  0:
    equivalentes para el comparador.

  El ID garantiza un orden final determinista
  para jugadores persistidos.
  ============================================================
*/

export const compareRankingPlayers = (
  a,
  b,
) => {
  const ratingA =
    Number(a?.rating ?? 0);

  const ratingB =
    Number(b?.rating ?? 0);

  if (
    ratingA !==
    ratingB
  ) {
    return (
      ratingB -
      ratingA
    );
  }

  const matchBalanceA =
    Number(
      a?.match_balance ??
        0,
    );

  const matchBalanceB =
    Number(
      b?.match_balance ??
        0,
    );

  if (
    matchBalanceA !==
    matchBalanceB
  ) {
    return (
      matchBalanceB -
      matchBalanceA
    );
  }

  const gameBalanceA =
    Number(
      a?.game_balance ??
        0,
    );

  const gameBalanceB =
    Number(
      b?.game_balance ??
        0,
    );

  if (
    gameBalanceA !==
    gameBalanceB
  ) {
    return (
      gameBalanceB -
      gameBalanceA
    );
  }

  const lastNameA =
    normalizeText(
      a?.last_name,
    );

  const lastNameB =
    normalizeText(
      b?.last_name,
    );

  const lastNameComparison =
    lastNameA.localeCompare(
      lastNameB,
      "es",
      {
        sensitivity:
          "base",
      },
    );

  if (
    lastNameComparison !== 0
  ) {
    return lastNameComparison;
  }

  const firstNameA =
    normalizeText(
      a?.first_name,
    );

  const firstNameB =
    normalizeText(
      b?.first_name,
    );

  const firstNameComparison =
    firstNameA.localeCompare(
      firstNameB,
      "es",
      {
        sensitivity:
          "base",
      },
    );

  if (
    firstNameComparison !== 0
  ) {
    return firstNameComparison;
  }

  const idA =
    Number(
      a?.id ?? 0,
    );

  const idB =
    Number(
      b?.id ?? 0,
    );

  return (
    idA -
    idB
  );
};


/*
  ============================================================
  CARGAR JUGADORES OFICIALES
  ============================================================
*/

export const getOfficialLeaguePlayers = async (
  client,
  {
    city,
    gender,
  },
) => {
  assertClient(
    client,
  );

  if (
    !city ||
    !gender
  ) {
    throw new RankingOrderError(
      "Ciudad y liga son obligatorias.",
      "league_context_missing",
      {
        city,
        gender,
      },
    );
  }

  const result =
    await client.query(
      `
      SELECT
        id,
        name,
        first_name,
        last_name,
        phone,
        city,
        gender,
        rating,
        matches_played,
        verification_status,
        role

      FROM users

      WHERE
        role = 'player'

        AND verification_status =
          'verified'

        AND city = $1

        AND gender = $2

        AND matches_played >= $3
      `,
      [
        city,
        gender,
        PLACEMENT_MATCHES,
      ],
    );

  return result.rows;
};


/*
  ============================================================
  CONSTRUIR RANKING OFICIAL
  ============================================================
*/

export const getOfficialRanking = async (
  client,
  {
    city,
    gender,
  },
) => {
  assertClient(
    client,
  );

  const [
    players,
    statsById,
  ] =
    await Promise.all([
      getOfficialLeaguePlayers(
        client,
        {
          city,
          gender,
        },
      ),

      getLeagueSportStats(
        client,
        {
          city,
          gender,
        },
      ),
    ]);

  const ranking =
    players
      .map(
        (player) => {
          const id =
            Number(
              player.id,
            );

          const stats =
            statsById.get(
              id,
            ) ||
            createEmptySportStats(
              id,
            );

          return {
            ...player,

            id,

            rating:
              Number(
                player.rating,
              ),

            matches_played:
              Number(
                player.matches_played,
              ),

            provisional:
              false,

            wins:
              stats.wins,

            losses:
              stats.losses,

            match_balance:
              stats.match_balance,

            games_won:
              stats.games_won,

            games_lost:
              stats.games_lost,

            game_balance:
              stats.game_balance,
          };
        },
      )
      .sort(
        compareRankingPlayers,
      );

  return ranking.map(
    (
      player,
      index,
    ) => ({
      ...player,

      official_position:
        index + 1,

      rank_position:
        index + 1,

      position:
        index + 1,
    }),
  );
};


/*
  ============================================================
  SNAPSHOT SIMPLE PARA MOTORES DEPORTIVOS
  ============================================================

  Mantiene todos los datos necesarios para que otros
  servicios puedan usar exactamente el mismo orden.
  ============================================================
*/

export const getOfficialRankingSnapshot = async (
  client,
  {
    city,
    gender,
  },
) => {
  const ranking =
    await getOfficialRanking(
      client,
      {
        city,
        gender,
      },
    );

  return ranking.map(
    (player) => ({
      id:
        player.id,

      name:
        player.name,

      first_name:
        player.first_name,

      last_name:
        player.last_name,

      rating:
        player.rating,

      matches_played:
        player.matches_played,

      wins:
        player.wins,

      losses:
        player.losses,

      match_balance:
        player.match_balance,

      games_won:
        player.games_won,

      games_lost:
        player.games_lost,

      game_balance:
        player.game_balance,

      position:
        player.position,

      official_position:
        player.official_position,
    }),
  );
};


/*
  ============================================================
  POSICIÓN DE UN OFICIAL
  ============================================================
*/

export const getOfficialPosition = (
  userId,
  officialRanking,
) => {
  const normalizedUserId =
    normalizeInteger(
      userId,
      "userId",
    );

  if (
    !Array.isArray(
      officialRanking,
    )
  ) {
    throw new RankingOrderError(
      "officialRanking debe ser un array.",
      "invalid_ranking",
    );
  }

  const player =
    officialRanking.find(
      (entry) =>
        Number(
          entry.id,
        ) ===
        normalizedUserId,
    );

  if (!player) {
    return null;
  }

  const position =
    Number(
      player.official_position ??
        player.rank_position ??
        player.position,
    );

  return Number.isInteger(
    position,
  )
    ? position
    : null;
};


/*
  ============================================================
  NOMBRE VISIBLE
  ============================================================

  Ranking de LA RED:

  Apellido Nombre

  Ejemplo:
  Fernández Lucas
  ============================================================
*/

export const formatRankingPlayerName = (
  player,
) => {
  const firstName =
    normalizeText(
      player?.first_name,
    );

  const lastName =
    normalizeText(
      player?.last_name,
    );

  if (
    lastName &&
    firstName
  ) {
    return `${lastName} ${firstName}`;
  }

  if (lastName) {
    return lastName;
  }

  if (firstName) {
    return firstName;
  }

  return normalizeText(
    player?.name,
  );
};