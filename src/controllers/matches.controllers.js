import { pool } from "../db.js";

const isValidSet = (a, b) => {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (max === 6 && min <= 4) return true;
  if (max === 7 && (min === 5 || min === 6)) return true;
  return false;
};

const parseScore = (score) => {
  if (!Array.isArray(score) || score.length < 2 || score.length > 3) {
    return { error: "El partido debe tener 2 o 3 sets" };
  }

  let p1Sets = 0;
  let p2Sets = 0;

  for (let i = 0; i < score.length; i++) {
    const a = Number(score[i]?.p1);
    const b = Number(score[i]?.p2);

    if (!isValidSet(a, b)) {
      return { error: `El Set ${i + 1} no es válido. Ejemplos: 6-4, 7-5 o 7-6.` };
    }

    if (a > b) p1Sets++;
    else p2Sets++;
  }

  if (p1Sets !== 2 && p2Sets !== 2) {
    return { error: "El resultado no define un ganador al mejor de 3 sets" };
  }

  if (score.length === 3 && (p1Sets === 3 || p2Sets === 3)) {
    return { error: "Si un jugador ganó los dos primeros sets no corresponde tercer set" };
  }

  return { winnerSide: p1Sets > p2Sets ? 1 : 2 };
};

export const getMyMatches = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT
        m.*,
        p1.name AS player1_name,
        p1.phone AS player1_phone,
        p2.name AS player2_name,
        p2.phone AS player2_phone,
        w.name AS winner_name
      FROM matches m
      JOIN users p1 ON p1.id = m.player1_id
      JOIN users p2 ON p2.id = m.player2_id
      LEFT JOIN users w ON w.id = m.winner_id
      WHERE m.player1_id = $1 OR m.player2_id = $1
      ORDER BY m.created_at DESC
      `,
      [req.userId],
    );

    res.json({ matches: result.rows });
  } catch (error) {
    next(error);
  }
};

export const submitMatchResult = async (req, res, next) => {
  try {
    const { score } = req.body;
    const parsed = parseScore(score);

    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const matchResult = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE id = $1
        AND status = 'pending'
        AND (player1_id = $2 OR player2_id = $2)
      `,
      [req.params.id, req.userId],
    );

    if (!matchResult.rowCount) {
      return res.status(404).json({ message: "Partido pendiente no encontrado" });
    }

    const match = matchResult.rows[0];
    const winnerId = parsed.winnerSide === 1 ? match.player1_id : match.player2_id;

    const updated = await pool.query(
      `
      UPDATE matches
      SET proposed_winner_id = $1,
          proposed_score = $2,
          result_submitted_by = $3,
          status = 'awaiting_confirmation'
      WHERE id = $4
      RETURNING *
      `,
      [winnerId, JSON.stringify(score), req.userId, match.id],
    );

    res.json({
      message: "Resultado enviado. Esperando confirmación del rival.",
      match: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const rejectMatchResult = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      UPDATE matches
      SET proposed_winner_id = NULL,
          proposed_score = NULL,
          result_submitted_by = NULL,
          status = 'pending'
      WHERE id = $1
        AND status = 'awaiting_confirmation'
        AND result_submitted_by <> $2
        AND (player1_id = $2 OR player2_id = $2)
      RETURNING *
      `,
      [req.params.id, req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: "Resultado para confirmar no encontrado" });
    }

    res.json({ message: "Resultado rechazado. Puede cargarse nuevamente." });
  } catch (error) {
    next(error);
  }
};

export const confirmMatchResult = async (req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query(
      `
      SELECT m.*, u1.rating AS p1_rating, u2.rating AS p2_rating
      FROM matches m
      JOIN users u1 ON u1.id = m.player1_id
      JOIN users u2 ON u2.id = m.player2_id
      WHERE m.id = $1
        AND m.status = 'awaiting_confirmation'
        AND m.result_submitted_by <> $2
        AND (m.player1_id = $2 OR m.player2_id = $2)
      FOR UPDATE
      `,
      [req.params.id, req.userId],
    );

    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Resultado para confirmar no encontrado" });
    }

    const match = found.rows[0];
    const winnerId = match.proposed_winner_id;
    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

    const winnerRating = winnerId === match.player1_id ? match.p1_rating : match.p2_rating;
    const loserRating = winnerId === match.player1_id ? match.p2_rating : match.p1_rating;

    const K = 32;
    const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
    const delta = Math.round(K * (1 - expectedWinner));

    await client.query(
      `
      UPDATE users
      SET rating = rating + $1,
          matches_played = matches_played + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [delta, winnerId],
    );

    await client.query(
      `
      UPDATE users
      SET rating = GREATEST(100, rating - $1),
          matches_played = matches_played + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [delta, loserId],
    );

    await client.query(
      `
      UPDATE matches
      SET winner_id = proposed_winner_id,
          score = proposed_score,
          status = 'completed',
          completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [match.id],
    );

    await client.query("COMMIT");

    res.json({
      message: "Resultado confirmado y ranking actualizado",
      elo_change: delta,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
