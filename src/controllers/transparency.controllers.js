import { pool } from "../db.js";


/*
  ============================================================
  PRÓXIMOS PARTIDOS
  ============================================================

  Público.

  Muestra únicamente partidos:
  - programados
  - todavía pendientes
  - no anulados
  - con fecha y hora cargadas

  IMPORTANTE:

  Ya NO exigimos que scheduled_at
  sea posterior a la hora actual.

  Esto permite que un partido siga
  apareciendo públicamente aunque
  ya haya comenzado, mientras todavía
  no tenga resultado confirmado.

  Ejemplo:

  Partido programado 15:00

  14:50 -> aparece
  15:00 -> aparece
  15:30 -> aparece
  16:30 -> sigue apareciendo
           si continúa pending

  Cuando queda completed,
  deja de aparecer acá y pasa
  a Últimos resultados.

  No expone teléfonos ni datos privados.
*/
export const getUpcomingMatches = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      req.query.gender || null;

    if (
      gender &&
      !["male", "female"].includes(
        gender,
      )
    ) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    const result =
      await pool.query(
        `
        SELECT
          m.id,

          m.scheduled_at,
          m.venue,
          m.status,

          p1.id AS player1_id,
          p1.name AS player1_name,

          p2.id AS player2_id,
          p2.name AS player2_name,

          p1.gender AS gender

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        WHERE
          m.annulled_at IS NULL

          AND m.status = 'pending'

          AND m.scheduled_at IS NOT NULL

          AND (
            $1::varchar IS NULL
            OR p1.gender = $1
          )

        ORDER BY
          m.scheduled_at ASC

        LIMIT 50
        `,
        [
          gender,
        ],
      );

    res.json({
      matches:
        result.rows,
    });
  } catch (error) {
    next(error);
  }
};


/*
  ============================================================
  ÚLTIMOS RESULTADOS
  ============================================================

  Público.

  Muestra:
  - jugadores
  - ganador
  - sets
  - cancha
  - fecha
  - cambios de Elo
*/
export const getLatestResults = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      req.query.gender || null;

    if (
      gender &&
      !["male", "female"].includes(
        gender,
      )
    ) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    const result =
      await pool.query(
        `
        SELECT
          m.id,

          m.scheduled_at,
          m.completed_at,

          m.venue,
          m.score,

          m.player1_id,
          p1.name AS player1_name,

          m.player2_id,
          p2.name AS player2_name,

          m.winner_id,
          winner.name AS winner_name,

          p1.gender AS gender,

          elo1.elo_change AS
            player1_elo_change,

          elo2.elo_change AS
            player2_elo_change

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        LEFT JOIN users winner
          ON winner.id =
             m.winner_id

        LEFT JOIN elo_events elo1
          ON elo1.match_id =
             m.id

          AND elo1.user_id =
             m.player1_id

          AND elo1.event_type =
             'match_result'

          AND elo1.reversed_at
             IS NULL

        LEFT JOIN elo_events elo2
          ON elo2.match_id =
             m.id

          AND elo2.user_id =
             m.player2_id

          AND elo2.event_type =
             'match_result'

          AND elo2.reversed_at
             IS NULL

        WHERE
          m.status =
            'completed'

          AND m.annulled_at
            IS NULL

          AND (
            $1::varchar IS NULL
            OR p1.gender = $1
          )

        ORDER BY
          m.completed_at DESC

        LIMIT 50
        `,
        [
          gender,
        ],
      );

    res.json({
      results:
        result.rows,
    });
  } catch (error) {
    next(error);
  }
};


/*
  ============================================================
  HISTORIAL PÚBLICO DE JUGADOR
  ============================================================

  Ejemplo:

  /api/public/players/7/history

  Devuelve:
  - datos deportivos públicos
  - partidos terminados
  - movimientos de Elo

  NO:
  - teléfono
  - email
  - DNI
*/
export const getPublicPlayerHistory = async (
  req,
  res,
  next,
) => {
  try {
    const playerId =
      Number(
        req.params.id,
      );

    if (!playerId) {
      return res
        .status(400)
        .json({
          message:
            "Jugador inválido",
        });
    }


    /*
      DATOS PÚBLICOS
      DEL JUGADOR
    */
    const playerResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          gender,
          city,
          rating,
          matches_played,
          created_at

        FROM users

        WHERE id = $1
          AND role = 'player'
          AND verification_status =
            'verified'
        `,
        [
          playerId,
        ],
      );


    if (
      !playerResult.rowCount
    ) {
      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }


    /*
      PARTIDOS DEL JUGADOR
    */
    const matchesResult =
      await pool.query(
        `
        SELECT
          m.id,

          m.scheduled_at,
          m.completed_at,

          m.venue,
          m.score,

          m.player1_id,
          p1.name AS player1_name,

          m.player2_id,
          p2.name AS player2_name,

          m.winner_id,
          winner.name AS winner_name,

          CASE
            WHEN m.winner_id = $1
              THEN 'win'

            ELSE 'loss'
          END AS result,

          player_elo.elo_change
            AS elo_change,

          player_elo.elo_before
            AS elo_before,

          player_elo.elo_after
            AS elo_after

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        LEFT JOIN users winner
          ON winner.id =
             m.winner_id

        LEFT JOIN elo_events
          player_elo

          ON player_elo.match_id =
             m.id

          AND player_elo.user_id =
             $1

          AND player_elo.event_type =
             'match_result'

          AND player_elo.reversed_at
             IS NULL

        WHERE
          m.status =
            'completed'

          AND m.annulled_at
            IS NULL

          AND (
            m.player1_id = $1
            OR m.player2_id = $1
          )

        ORDER BY
          m.completed_at DESC

        LIMIT 100
        `,
        [
          playerId,
        ],
      );


    /*
      HISTORIAL DE ELO.

      Acá también van a aparecer
      los -8 por rechazos.
    */
    const eloResult =
      await pool.query(
        `
        SELECT
          id,
          match_id,
          challenge_id,

          event_type,

          elo_before,
          elo_change,
          elo_after,

          description,
          created_at,

          reversed_at

        FROM elo_events

        WHERE user_id = $1

        ORDER BY
          created_at DESC

        LIMIT 200
        `,
        [
          playerId,
        ],
      );


    /*
      ESTADÍSTICAS SIMPLES
    */
    const statsResult =
      await pool.query(
        `
        SELECT
          COUNT(*)::int AS
            completed_matches,

          COUNT(*) FILTER (
            WHERE winner_id = $1
          )::int AS wins,

          COUNT(*) FILTER (
            WHERE winner_id <> $1
          )::int AS losses

        FROM matches

        WHERE
          status =
            'completed'

          AND annulled_at
            IS NULL

          AND (
            player1_id = $1
            OR player2_id = $1
          )
        `,
        [
          playerId,
        ],
      );


    res.json({
      player:
        playerResult.rows[0],

      stats:
        statsResult.rows[0],

      matches:
        matchesResult.rows,

      elo_history:
        eloResult.rows,
    });
  } catch (error) {
    next(error);
  }
};