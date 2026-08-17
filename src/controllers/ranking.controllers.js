import { pool } from "../db.js";
import { LEAGUE_CITY, LEAGUES } from "../constants/league.js";

export const getRanking = async (req, res, next) => {
  try {
    const gender = req.query.gender || "male";

    if (!LEAGUES.includes(gender)) {
      return res.status(400).json({ message: "Liga inválida" });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        first_name,
        last_name,
        gender,
        rating,
        matches_played,
        ROW_NUMBER() OVER (
          ORDER BY rating DESC, matches_played DESC, id ASC
        )::int AS rank_position
      FROM users
      WHERE city = $1
        AND gender = $2
      ORDER BY rating DESC, matches_played DESC, id ASC
      `,
      [LEAGUE_CITY, gender],
    );

    res.json({
      league: gender,
      city: LEAGUE_CITY,
      players: result.rows,
    });
  } catch (error) {
    next(error);
  }
};
