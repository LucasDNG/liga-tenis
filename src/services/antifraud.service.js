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
  const result = await client.query(
    `
    INSERT INTO match_audit_flags (
      match_id,
      flag_type,
      severity,
      message
    )

    SELECT
      $1,
      $2,
      $3,
      $4

    WHERE NOT EXISTS (
      SELECT 1
      FROM match_audit_flags
      WHERE match_id = $1
        AND flag_type = $2
    )

    RETURNING *
    `,
    [
      matchId,
      flagType,
      severity,
      message,
    ],
  );

  return result.rows[0] || null;
};


/*
  ============================================================
  RIVALES DEMASIADO FRECUENTES
  ============================================================

  Alerta si disputaron 4 o más
  partidos entre sí durante
  los últimos 30 días.
*/

export const checkFrequentOpponents = async (
  client,
  {
    matchId,
    player1Id,
    player2Id,
  },
) => {
  const result = await client.query(
    `
    SELECT COUNT(*)::int AS total

    FROM matches

    WHERE status = 'completed'

      AND annulled_at IS NULL

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
      result.rows[0]?.total || 0,
    );

  if (total < 4) {
    return null;
  }

  return createMatchAuditFlag(
    client,
    {
      matchId,

      flagType:
        "frequent_opponents",

      message:
        `Estos jugadores disputaron ${total} partidos entre sí durante los últimos 30 días.`,
    },
  );
};


/*
  ============================================================
  CONCENTRACIÓN DE ELO
  ============================================================

  Esta regla solamente considera partidos
  posteriores a los primeros 5 partidos
  nivelatorios de cada jugador.

  REGLA:

  - últimos 60 días
  - mínimo 60 Elo positivo
  - mínimo 3 victorias contra el mismo rival
  - 70% o más del Elo positivo proviene
    de ese rival
*/

export const checkEloConcentration = async (
  client,
  {
    matchId,
    playerId,
  },
) => {
  /*
    Primero numeramos TODOS los partidos
    que modificaron Elo para ese jugador.

    De esta forma podemos excluir realmente
    sus primeros cinco partidos.

    No alcanza con mirar la fecha,
    porque los partidos nivelatorios
    también pueden estar dentro
    de los últimos 60 días.
  */

  const totalResult =
    await client.query(
      `
      WITH ordered_events AS (
        SELECT
          e.*,

          ROW_NUMBER() OVER (
            ORDER BY
              e.created_at ASC,
              e.id ASC
          ) AS match_number

        FROM elo_events e

        WHERE e.user_id = $1

          AND e.event_type =
            'match_result'

          AND e.reversed_at
            IS NULL
      )

      SELECT
        COALESCE(
          SUM(elo_change)
            FILTER (
              WHERE elo_change > 0
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


  /*
    Necesitamos al menos
    60 Elo positivo.
  */

  if (
    totalPositiveElo < 60
  ) {
    return null;
  }


  /*
    Ahora calculamos de qué rival
    provino ese Elo positivo.

    Nuevamente excluimos los primeros
    cinco partidos del jugador.
  */

  const rivalResult =
    await client.query(
      `
      WITH ordered_events AS (
        SELECT
          e.*,

          ROW_NUMBER() OVER (
            ORDER BY
              e.created_at ASC,
              e.id ASC
          ) AS match_number

        FROM elo_events e

        WHERE e.user_id = $1

          AND e.event_type =
            'match_result'

          AND e.reversed_at
            IS NULL
      ),

      eligible_events AS (
        SELECT *
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
          ELSE m.player1_id
        END AS opponent_id,

        opponent.name
          AS opponent_name,

        COUNT(*)::int
          AS wins_against_opponent,

        SUM(
          e.elo_change
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
            ELSE m.player1_id
          END

      WHERE m.status =
        'completed'

        AND m.annulled_at
          IS NULL

      GROUP BY
        opponent_id,
        opponent.name

      ORDER BY
        elo_from_opponent DESC

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
        .wins_against_opponent,
    );

  const eloFromOpponent =
    Number(
      rival
        .elo_from_opponent,
    );

  const percentage =
    Math.round(
      (
        eloFromOpponent /
        totalPositiveElo
      ) *
        100,
    );


  /*
    No alcanza solamente
    con el porcentaje.

    También necesitamos mínimo
    3 victorias contra ese rival.
  */

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