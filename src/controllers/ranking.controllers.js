import { pool } from "../db.js";

import {
  LEAGUE_CITY,
  LEAGUES,
} from "../constants/league.js";


const PLACEMENT_MATCHES = 5;


export const getRanking = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      req.query.gender ||
      "male";


    if (
      !LEAGUES.includes(
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


    /*
      ========================================================
      RANKING OFICIAL
      ========================================================

      Solo jugadores:

      - player
      - verificados
      - misma ciudad/liga
      - 5 o más partidos

      Los jugadores provisionales NO consumen
      posiciones oficiales.
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
          )::int
            AS rank_position

        FROM users

        WHERE city = $1

          AND gender = $2

          AND role =
            'player'

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
      ========================================================
      JUGADORES PROVISIONALES
      ========================================================

      Conservan y acumulan su Elo real.

      Pero mientras tengan menos de 5 partidos:
      - no reciben posición oficial
      - no pueden aparecer #1, #2, etc.
      - se muestran después del ranking oficial
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

          NULL::int
            AS rank_position

        FROM users

        WHERE city = $1

          AND gender = $2

          AND role =
            'player'

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