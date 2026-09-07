import { pool } from "../db.js";

import {
  LEAGUE_CITY,
  LEAGUES,
} from "../constants/league.js";


const PLACEMENT_MATCHES = 5;


/*
  ============================================================
  VALIDAR LIGA
  ============================================================
*/

const getLeague = (req) => {
  const gender =
    req.query.gender ||
    "male";

  return LEAGUES.includes(
    gender,
  )
    ? gender
    : null;
};


/*
  ============================================================
  RANKING ACTUAL
  ============================================================
*/

export const getRanking = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      getLeague(req);

    if (!gender) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    /*
      RANKING OFICIAL

      Solo:
      - jugadores
      - verificados
      - misma ciudad/liga
      - 5+ partidos
    */
    const officialResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          first_name,
          last_name,
          gender,
          rating,
          matches_played,

          false AS provisional,

          ROW_NUMBER() OVER (
            ORDER BY
              rating DESC,
              matches_played DESC,
              id ASC
          )::int AS rank_position

        FROM users

        WHERE
          city = $1
          AND gender = $2
          AND role = 'player'
          AND verification_status =
            'verified'
          AND matches_played >= $3

        ORDER BY
          rating DESC,
          matches_played DESC,
          id ASC
        `,
        [
          LEAGUE_CITY,
          gender,
          PLACEMENT_MATCHES,
        ],
      );

    /*
      PROVISIONALES

      Son públicos y visibles desde que
      están verificados.

      No consumen una posición oficial.
    */
    const provisionalResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          first_name,
          last_name,
          gender,
          rating,
          matches_played,

          true AS provisional,

          NULL::int AS rank_position

        FROM users

        WHERE
          city = $1
          AND gender = $2
          AND role = 'player'
          AND verification_status =
            'verified'
          AND matches_played < $3

        ORDER BY
          rating DESC,
          matches_played DESC,
          id ASC
        `,
        [
          LEAGUE_CITY,
          gender,
          PLACEMENT_MATCHES,
        ],
      );

    res.json({
      league:
        gender,

      city:
        LEAGUE_CITY,

      placement_matches:
        PLACEMENT_MATCHES,

      official_players:
        officialResult.rows,

      provisional_players:
        provisionalResult.rows,

      players: [
        ...officialResult.rows,
        ...provisionalResult.rows,
      ],
    });
  } catch (error) {
    next(error);
  }
};


/*
  ============================================================
  TOP 3 ELO HISTÓRICO
  ============================================================

  Regla:

  - un solo récord por jugador
  - toma el Elo máximo válido conseguido
  - movimientos revertidos/anulados NO cuentan
  - una caída posterior no borra el récord
  - devuelve los 3 jugadores con mayor pico histórico

  También incluimos el rating actual como respaldo para
  datos viejos que pudieran existir antes de elo_events.

  Después del reset final de producción, todo quedará
  naturalmente registrado por eventos desde Elo 0.
  ============================================================
*/

export const getHistoricalElo = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      getLeague(req);

    if (!gender) {
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
        WITH eligible_players AS (
          SELECT
            id,
            name,
            first_name,
            last_name,
            gender,
            rating,
            matches_played

          FROM users

          WHERE
            city = $1
            AND gender = $2
            AND role = 'player'
            AND verification_status =
              'verified'
        ),

        event_peaks AS (
          SELECT DISTINCT ON (
            ee.user_id
          )
            ee.user_id,

            ee.elo_after
              AS peak_elo,

            ee.created_at
              AS peak_reached_at,

            ee.id
              AS peak_event_id

          FROM elo_events ee

          JOIN eligible_players ep
            ON ep.id =
               ee.user_id

          WHERE
            ee.reversed_at IS NULL

          ORDER BY
            ee.user_id,
            ee.elo_after DESC,
            ee.created_at ASC,
            ee.id ASC
        ),

        personal_peaks AS (
          SELECT
            ep.id,
            ep.name,
            ep.first_name,
            ep.last_name,
            ep.gender,
            ep.rating
              AS current_elo,
            ep.matches_played,

            CASE
              WHEN ev.peak_elo IS NULL
                THEN ep.rating

              WHEN ep.rating >
                   ev.peak_elo
                THEN ep.rating

              ELSE ev.peak_elo
            END::int
              AS peak_elo,

            CASE
              WHEN ev.peak_elo IS NULL
                THEN NULL

              WHEN ep.rating >
                   ev.peak_elo
                THEN NULL

              ELSE ev.peak_reached_at
            END
              AS peak_reached_at

          FROM eligible_players ep

          LEFT JOIN event_peaks ev
            ON ev.user_id =
               ep.id
        )

        SELECT
          id,
          name,
          first_name,
          last_name,
          gender,
          current_elo,
          matches_played,
          peak_elo,
          peak_reached_at,

          ROW_NUMBER() OVER (
            ORDER BY
              peak_elo DESC,
              matches_played DESC,
              id ASC
          )::int
            AS historical_position

        FROM personal_peaks

        ORDER BY
          peak_elo DESC,
          matches_played DESC,
          id ASC

        LIMIT 3
        `,
        [
          LEAGUE_CITY,
          gender,
        ],
      );

    res.json({
      league:
        gender,

      city:
        LEAGUE_CITY,

      records:
        result.rows,
    });
  } catch (error) {
    next(error);
  }
};