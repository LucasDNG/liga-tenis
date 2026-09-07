/*
  ============================================================
  SERVICIO ANTIFRAUDE
  ============================================================

  Las alertas NO bloquean partidos
  ni modifican el Elo.

  Solamente dejan una bandera para
  revisión administrativa.
*/


/*
  ============================================================
  CREAR ALERTA SIN DUPLICAR
  ============================================================

  La base de datos tiene una restricción
  única para:

  match_id + flag_type

  Por eso ON CONFLICT también protege
  contra dos requests concurrentes.
*/

export const createMatchAuditFlag = async (
  client,
  {
    matchId,
    flagType,
    severity = "warning",
    message,
  },
) => {
  if (
    !matchId ||
    !flagType ||
    !message
  ) {
    return null;
  }

  const result =
    await client.query(
      `
      INSERT INTO match_audit_flags (
        match_id,
        flag_type,
        severity,
        message
      )

      VALUES (
        $1,
        $2,
        $3,
        $4
      )

      ON CONFLICT (
        match_id,
        flag_type
      )
      DO NOTHING

      RETURNING *
      `,
      [
        matchId,
        flagType,
        severity,
        message,
      ],
    );

  return (
    result.rows[0] ||
    null
  );
};


/*
  ============================================================
  RIVALES DEMASIADO FRECUENTES
  ============================================================

  Alerta si disputaron 4 o más
  partidos entre sí durante
  los últimos 30 días.

  Solamente contamos:
  - partidos completados
  - no anulados
*/

export const checkFrequentOpponents = async (
  client,
  {
    matchId,
    player1Id,
    player2Id,
  },
) => {
  if (
    !matchId ||
    !player1Id ||
    !player2Id ||
    Number(player1Id) ===
      Number(player2Id)
  ) {
    return null;
  }

  const result =
    await client.query(
      `
      SELECT
        COUNT(*)::int
          AS total

      FROM matches

      WHERE status =
        'completed'

        AND annulled_at
          IS NULL

        AND completed_at >=
          CURRENT_TIMESTAMP -
          INTERVAL '30 days'

        AND (
          (
            player1_id = $1
            AND player2_id = $2
          )

          OR

          (
            player1_id = $2
            AND player2_id = $1
          )
        )
      `,
      [
        player1Id,
        player2Id,
      ],
    );

  const total =
    Number(
      result.rows[0]?.total ||
      0,
    );

  if (
    total < 4
  ) {
    return null;
  }

  return createMatchAuditFlag(
    client,
    {
      matchId,

      flagType:
        "frequent_opponents",

      severity:
        "warning",

      message:
        `Estos jugadores disputaron ${total} partidos entre sí durante los últimos 30 días.`,
    },
  );
};


/*
  ============================================================
  CONCENTRACIÓN DE ELO
  ============================================================

  REGLA:

  - ignora los primeros 5 partidos
    nivelatorios del jugador

  - analiza solamente los últimos
    60 días

  - necesita mínimo 60 puntos
    de Elo positivo

  - necesita mínimo 3 victorias
    contra el mismo rival

  - 70% o más del Elo positivo
    debe provenir de ese rival

  Los eventos revertidos por
  administración quedan excluidos.
*/

export const checkEloConcentration = async (
  client,
  {
    matchId,
    playerId,
  },
) => {
  if (
    !matchId ||
    !playerId
  ) {
    return null;
  }


  /*
    Numeramos todos los eventos
    válidos de partidos del jugador.

    De esta forma los primeros
    cinco eventos quedan definidos
    cronológicamente y no solamente
    por una ventana de fechas.
  */

  const totalResult =
    await client.query(
      `
      WITH ordered_events AS (
        SELECT
          e.id,
          e.match_id,
          e.elo_change,
          e.created_at,

          ROW_NUMBER() OVER (
            ORDER BY
              e.created_at ASC,
              e.id ASC
          )::int
            AS match_number

        FROM elo_events e

        JOIN matches m
          ON m.id =
             e.match_id

        WHERE e.user_id =
          $1

          AND e.event_type =
            'match_result'

          AND e.reversed_at
            IS NULL

          AND m.status =
            'completed'

          AND m.annulled_at
            IS NULL
      )

      SELECT
        COALESCE(
          SUM(
            elo_change
          )
          FILTER (
            WHERE
              elo_change > 0
          ),
          0
        )::int
          AS total_positive_elo

      FROM ordered_events

      WHERE match_number > 5

        AND created_at >=
          CURRENT_TIMESTAMP -
          INTERVAL '60 days'
      `,
      [
        playerId,
      ],
    );


  const totalPositiveElo =
    Number(
      totalResult
        .rows[0]
        ?.total_positive_elo ||
      0,
    );


  if (
    totalPositiveElo < 60
  ) {
    return null;
  }


  /*
    Tomamos los eventos positivos
    posteriores a los 5 partidos
    nivelatorios y agrupamos el Elo
    según el rival.
  */

  const rivalResult =
    await client.query(
      `
      WITH ordered_events AS (
        SELECT
          e.id,
          e.match_id,
          e.elo_change,
          e.created_at,

          ROW_NUMBER() OVER (
            ORDER BY
              e.created_at ASC,
              e.id ASC
          )::int
            AS match_number

        FROM elo_events e

        JOIN matches valid_match
          ON valid_match.id =
             e.match_id

        WHERE e.user_id =
          $1

          AND e.event_type =
            'match_result'

          AND e.reversed_at
            IS NULL

          AND valid_match.status =
            'completed'

          AND valid_match.annulled_at
            IS NULL
      ),

      eligible_events AS (
        SELECT
          id,
          match_id,
          elo_change,
          created_at

        FROM ordered_events

        WHERE match_number > 5

          AND elo_change > 0

          AND created_at >=
            CURRENT_TIMESTAMP -
            INTERVAL '60 days'
      )

      SELECT
        CASE
          WHEN m.player1_id = $1
            THEN m.player2_id

          ELSE
            m.player1_id
        END
          AS opponent_id,

        opponent.name
          AS opponent_name,

        COUNT(*)::int
          AS wins_against_opponent,

        COALESCE(
          SUM(
            e.elo_change
          ),
          0
        )::int
          AS elo_from_opponent

      FROM eligible_events e

      JOIN matches m
        ON m.id =
           e.match_id

      JOIN users opponent
        ON opponent.id =
          CASE
            WHEN m.player1_id = $1
              THEN m.player2_id

            ELSE
              m.player1_id
          END

      WHERE m.status =
        'completed'

        AND m.annulled_at
          IS NULL

      GROUP BY
        opponent_id,
        opponent.name

      ORDER BY
        elo_from_opponent DESC,
        wins_against_opponent DESC,
        opponent_id ASC

      LIMIT 1
      `,
      [
        playerId,
      ],
    );


  if (
    !rivalResult.rowCount
  ) {
    return null;
  }


  const rival =
    rivalResult.rows[0];


  const winsAgainstOpponent =
    Number(
      rival
        .wins_against_opponent ||
      0,
    );


  const eloFromOpponent =
    Number(
      rival
        .elo_from_opponent ||
      0,
    );


  if (
    !Number.isFinite(
      eloFromOpponent,
    ) ||
    eloFromOpponent <= 0
  ) {
    return null;
  }


  const percentage =
    Math.round(
      (
        eloFromOpponent /
        totalPositiveElo
      ) *
        100,
    );


  if (
    winsAgainstOpponent < 3 ||
    percentage < 70
  ) {
    return null;
  }


  return createMatchAuditFlag(
    client,
    {
      matchId,

      flagType:
        "elo_concentration",

      severity:
        "warning",

      message:
        `${percentage}% del Elo positivo obtenido por este jugador en sus partidos no nivelatorios de los últimos 60 días provino de victorias contra ${rival.opponent_name} (${winsAgainstOpponent} victorias, +${eloFromOpponent} Elo).`,
    },
  );
};