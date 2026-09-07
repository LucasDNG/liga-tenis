import { pool } from "../db.js";


const VALID_GENDERS = [
  "male",
  "female",
];


/*
  ============================================================
  VALIDAR FILTRO DE LIGA
  ============================================================
*/

const getGenderFilter = (
  req,
) => {
  const gender =
    req.query.gender ||
    null;

  if (
    gender &&
    !VALID_GENDERS.includes(
      gender,
    )
  ) {
    return {
      error:
        "Liga inválida",
    };
  }

  return {
    gender,
  };
};


/*
  ============================================================
  PRÓXIMOS / PARTIDOS ABIERTOS
  ============================================================

  Público.

  El partido permanece visible desde que
  está programado hasta que el resultado
  queda confirmado.

  Estados visibles:

  pending
  awaiting_confirmation

  No exponemos:
  - teléfono
  - email
  - DNI
  - documentos
*/

export const getUpcomingMatches =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const {
        gender,
        error,
      } =
        getGenderFilter(
          req,
        );

      if (error) {
        return res
          .status(400)
          .json({
            message:
              error,
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

            p1.id AS
              player1_id,

            p1.name AS
              player1_name,

            p2.id AS
              player2_id,

            p2.name AS
              player2_name,

            p1.gender AS
              gender

          FROM matches m

          JOIN users p1
            ON p1.id =
               m.player1_id

          JOIN users p2
            ON p2.id =
               m.player2_id

          WHERE
            m.annulled_at
              IS NULL

            AND m.status IN (
              'pending',
              'awaiting_confirmation'
            )

            AND m.scheduled_at
              IS NOT NULL

            AND p1.role =
              'player'

            AND p2.role =
              'player'

            AND p1.verification_status =
              'verified'

            AND p2.verification_status =
              'verified'

            AND p1.gender
              IS NOT NULL

            AND p1.gender =
              p2.gender

            AND p1.city =
              p2.city

            AND (
              $1::varchar
                IS NULL

              OR (
                p1.gender =
                  $1

                AND p2.gender =
                  $1
              )
            )

          ORDER BY
            m.scheduled_at ASC,
            m.id ASC

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

  Solamente mostramos partidos:
  - completados
  - no anulados
  - entre jugadores válidos
*/

export const getLatestResults =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const {
        gender,
        error,
      } =
        getGenderFilter(
          req,
        );

      if (error) {
        return res
          .status(400)
          .json({
            message:
              error,
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

            p1.name AS
              player1_name,

            m.player2_id,

            p2.name AS
              player2_name,

            m.winner_id,

            winner.name AS
              winner_name,

            p1.gender AS
              gender,

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


          /*
            Tomamos como máximo un
            movimiento Elo válido por
            jugador y partido.

            Esto evita duplicar filas
            públicas si alguna vez el
            historial quedara inconsistente.
          */

          LEFT JOIN LATERAL (
            SELECT
              e.elo_change

            FROM elo_events e

            WHERE e.match_id =
              m.id

              AND e.user_id =
                m.player1_id

              AND e.event_type =
                'match_result'

              AND e.reversed_at
                IS NULL

            ORDER BY
              e.created_at DESC,
              e.id DESC

            LIMIT 1
          ) elo1
            ON TRUE


          LEFT JOIN LATERAL (
            SELECT
              e.elo_change

            FROM elo_events e

            WHERE e.match_id =
              m.id

              AND e.user_id =
                m.player2_id

              AND e.event_type =
                'match_result'

              AND e.reversed_at
                IS NULL

            ORDER BY
              e.created_at DESC,
              e.id DESC

            LIMIT 1
          ) elo2
            ON TRUE


          WHERE
            m.status =
              'completed'

            AND m.annulled_at
              IS NULL

            AND m.completed_at
              IS NOT NULL

            AND m.winner_id
              IS NOT NULL

            AND p1.role =
              'player'

            AND p2.role =
              'player'

            AND p1.verification_status =
              'verified'

            AND p2.verification_status =
              'verified'

            AND p1.gender
              IS NOT NULL

            AND p1.gender =
              p2.gender

            AND p1.city =
              p2.city

            AND (
              $1::varchar
                IS NULL

              OR (
                p1.gender =
                  $1

                AND p2.gender =
                  $1
              )
            )

          ORDER BY
            m.completed_at DESC,
            m.id DESC

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

  Devuelve solamente información
  deportiva pública.

  NO devuelve:
  - DNI
  - email
  - teléfono
  - fotos del DNI
  - información de autenticación
*/

export const getPublicPlayerHistory =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const playerId =
        Number(
          req.params.id,
        );


      if (
        !Number.isInteger(
          playerId,
        ) ||
        playerId <= 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "Jugador inválido",
          });
      }


      /*
        ======================================================
        DATOS PÚBLICOS DEL JUGADOR
        ======================================================
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

            AND role =
              'player'

            AND verification_status =
              'verified'

            AND gender
              IS NOT NULL
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
        ======================================================
        PARTIDOS DEL JUGADOR
        ======================================================
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

            p1.name AS
              player1_name,

            m.player2_id,

            p2.name AS
              player2_name,

            m.winner_id,

            winner.name AS
              winner_name,

            CASE
              WHEN m.winner_id = $1
                THEN 'win'

              ELSE
                'loss'
            END
              AS result,

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


          LEFT JOIN LATERAL (
            SELECT
              e.elo_change,
              e.elo_before,
              e.elo_after

            FROM elo_events e

            WHERE e.match_id =
              m.id

              AND e.user_id =
                $1

              AND e.event_type =
                'match_result'

              AND e.reversed_at
                IS NULL

            ORDER BY
              e.created_at DESC,
              e.id DESC

            LIMIT 1
          ) player_elo
            ON TRUE


          WHERE
            m.status =
              'completed'

            AND m.annulled_at
              IS NULL

            AND m.completed_at
              IS NOT NULL

            AND m.winner_id
              IS NOT NULL

            AND (
              m.player1_id = $1

              OR

              m.player2_id = $1
            )

          ORDER BY
            m.completed_at DESC,
            m.id DESC

          LIMIT 100
          `,
          [
            playerId,
          ],
        );


      /*
        ======================================================
        HISTORIAL DE ELO
        ======================================================

        Mantenemos también eventos revertidos.

        Esto es intencional:
        la página es de transparencia y
        permite ver que existió una operación
        y posteriormente fue revertida.

        También aparecen:
        - challenge_rejection
        - admin_reversal
        - otros movimientos públicos de Elo
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

          WHERE user_id =
            $1

          ORDER BY
            created_at DESC,
            id DESC

          LIMIT 200
          `,
          [
            playerId,
          ],
        );


      /*
        ======================================================
        ESTADÍSTICAS
        ======================================================
      */

      const statsResult =
        await pool.query(
          `
          SELECT
            COUNT(*)::int
              AS completed_matches,

            COUNT(*)
              FILTER (
                WHERE
                  winner_id = $1
              )::int
              AS wins,

            COUNT(*)
              FILTER (
                WHERE
                  winner_id IS NOT NULL

                  AND winner_id <> $1
              )::int
              AS losses

          FROM matches

          WHERE
            status =
              'completed'

            AND annulled_at
              IS NULL

            AND completed_at
              IS NOT NULL

            AND (
              player1_id = $1

              OR

              player2_id = $1
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