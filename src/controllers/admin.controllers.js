import { pool } from "../db.js";
import cloudinary from "../config/cloudinary.js";

/*
  ============================================================
  USUARIOS PENDIENTES
  ============================================================
*/

export const getPendingUsers = async (
  _req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(`
        SELECT
          id,
          name,
          first_name,
          last_name,
          dni,
          phone,
          email,
          gender,
          verification_status,
          created_at
        FROM users
        WHERE verification_status =
          'pending_verification'
        ORDER BY created_at ASC
      `);

    res.json({
      users: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/*
  ============================================================
  VER USUARIO
  ============================================================
*/

export const getPendingUserById =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            first_name,
            last_name,
            dni,
            phone,
            email,
            gender,
            verification_status,
            dni_front_path,
            dni_back_path,
            created_at
          FROM users
          WHERE id = $1
          `,
          [id],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Usuario no encontrado",
          });
      }

      const user =
        result.rows[0];

      const dniFrontUrl =
        user.dni_front_path
          ? cloudinary.url(
              user.dni_front_path,
              {
                type:
                  "authenticated",
                secure: true,
                sign_url: true,
              },
            )
          : null;

      const dniBackUrl =
        user.dni_back_path
          ? cloudinary.url(
              user.dni_back_path,
              {
                type:
                  "authenticated",
                secure: true,
                sign_url: true,
              },
            )
          : null;

      res.json({
        user: {
          id: user.id,
          name: user.name,
          first_name:
            user.first_name,
          last_name:
            user.last_name,
          dni: user.dni,
          phone: user.phone,
          email: user.email,
          gender: user.gender,
          verification_status:
            user.verification_status,
          created_at:
            user.created_at,
          dni_front_url:
            dniFrontUrl,
          dni_back_url:
            dniBackUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  };

/*
  ============================================================
  APROBAR USUARIO
  ============================================================
*/

export const approveUser =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          UPDATE users
          SET
            verification_status =
              'verified',
            verified_at =
              CURRENT_TIMESTAMP,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            id,
            name,
            email,
            verification_status,
            verified_at
          `,
          [id],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Usuario no encontrado",
          });
      }

      res.json({
        message:
          "Jugador aprobado correctamente",
        user:
          result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  };

/*
  ============================================================
  RECHAZAR USUARIO
  ============================================================
*/

export const rejectUser =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          UPDATE users
          SET
            verification_status =
              'rejected',
            verified_at = NULL,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            id,
            name,
            email,
            verification_status
          `,
          [id],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Usuario no encontrado",
          });
      }

      res.json({
        message:
          "Jugador rechazado correctamente",
        user:
          result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  };

/*
  ============================================================
  LISTAR PARTIDOS MARCADOS
  ============================================================
*/

export const getAuditMatches =
  async (
    _req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            m.id,
            m.status,
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

            m.annulled_at,
            m.annul_reason,

            COUNT(f.id)::int
              AS flag_count,

            COUNT(f.id)
              FILTER (
                WHERE
                  f.resolved = FALSE
              )::int
              AS unresolved_flags

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

          JOIN match_audit_flags f
            ON f.match_id =
               m.id

          GROUP BY
            m.id,
            p1.name,
            p2.name,
            winner.name

          ORDER BY
            unresolved_flags DESC,
            m.completed_at DESC
          `,
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
  DETALLE DE PARTIDO EN AUDITORÍA
  ============================================================
*/

export const getAuditMatchById =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const matchResult =
        await pool.query(
          `
          SELECT
            m.*,
            p1.name AS
              player1_name,
            p2.name AS
              player2_name,
            winner.name AS
              winner_name

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

          WHERE m.id = $1
          `,
          [
            req.params.id,
          ],
        );

      if (
        !matchResult.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado",
          });
      }

      const flags =
        await pool.query(
          `
          SELECT
            id,
            flag_type,
            severity,
            message,
            resolved,
            resolved_at,
            created_at

          FROM match_audit_flags

          WHERE match_id = $1

          ORDER BY
            created_at DESC
          `,
          [
            req.params.id,
          ],
        );

      const elo =
        await pool.query(
          `
          SELECT
            e.*,
            u.name AS
              player_name

          FROM elo_events e

          JOIN users u
            ON u.id =
               e.user_id

          WHERE e.match_id = $1

          ORDER BY
            e.created_at ASC
          `,
          [
            req.params.id,
          ],
        );

      const audit =
        await pool.query(
          `
          SELECT
            a.*,
            u.name AS
              user_name

          FROM audit_events a

          LEFT JOIN users u
            ON u.id =
               a.user_id

          WHERE a.match_id = $1

          ORDER BY
            a.created_at DESC
          `,
          [
            req.params.id,
          ],
        );

      res.json({
        match:
          matchResult.rows[0],
        flags:
          flags.rows,
        elo_events:
          elo.rows,
        audit_events:
          audit.rows,
      });
    } catch (error) {
      next(error);
    }
  };

/*
  ============================================================
  MARCAR ALERTA COMO REVISADA
  ============================================================
*/

export const resolveAuditFlag =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          UPDATE match_audit_flags
          SET
            resolved = TRUE,
            resolved_at =
              CURRENT_TIMESTAMP,
            resolved_by = $1
          WHERE id = $2
          RETURNING *
          `,
          [
            req.userId,
            req.params.flagId,
          ],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Alerta no encontrada",
          });
      }

      res.json({
        message:
          "Alerta marcada como revisada",
        flag:
          result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  };

/*
  ============================================================
  ANULAR PARTIDO + REVERTIR ELO
  ============================================================
*/

export const annulMatch =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const reason =
        String(
          req.body.reason ||
            "",
        ).trim();

      if (
        reason.length < 5
      ) {
        return res
          .status(400)
          .json({
            message:
              "Indicá el motivo de la anulación.",
          });
      }

      await client.query(
        "BEGIN",
      );

      const found =
        await client.query(
          `
          SELECT *
          FROM matches
          WHERE id = $1
          FOR UPDATE
          `,
          [
            req.params.id,
          ],
        );

      if (
        !found.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado",
          });
      }

      const match =
        found.rows[0];

      if (
        match.annulled_at
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Este partido ya fue anulado.",
          });
      }

      if (
        match.status !==
        "completed"
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              "Solo pueden anularse partidos finalizados.",
          });
      }

      /*
        Movimientos Elo originales.
      */

      const eloEvents =
        await client.query(
          `
          SELECT *
          FROM elo_events
          WHERE match_id = $1
            AND event_type =
              'match_result'
            AND reversed_at
              IS NULL
          FOR UPDATE
          `,
          [
            match.id,
          ],
        );

      /*
        Revertimos el Elo
        de cada jugador.
      */

      for (
        const event of
        eloEvents.rows
      ) {
        const user =
          await client.query(
            `
            SELECT
              rating
            FROM users
            WHERE id = $1
            FOR UPDATE
            `,
            [
              event.user_id,
            ],
          );

        if (
          !user.rowCount
        ) {
          continue;
        }

        const before =
          user.rows[0].rating;

        const reversal =
          -event.elo_change;

        const after =
          Math.max(
            100,
            before +
              reversal,
          );

        await client.query(
          `
          UPDATE users
          SET
            rating = $1,
            matches_played =
              GREATEST(
                0,
                matches_played - 1
              ),
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [
            after,
            event.user_id,
          ],
        );

        await client.query(
          `
          UPDATE elo_events
          SET
            reversed_at =
              CURRENT_TIMESTAMP,
            reversed_by = $1
          WHERE id = $2
          `,
          [
            req.userId,
            event.id,
          ],
        );

        await client.query(
          `
          INSERT INTO elo_events (
            user_id,
            match_id,
            challenge_id,
            event_type,
            elo_before,
            elo_change,
            elo_after,
            description
          )
          VALUES (
            $1,
            $2,
            $3,
            'admin_reversal',
            $4,
            $5,
            $6,
            $7
          )
          `,
          [
            event.user_id,
            match.id,
            match.challenge_id,
            before,
            reversal,
            after,
            `Reversión por anulación administrativa del partido #${match.id}`,
          ],
        );
      }

      /*
        Marcamos partido como anulado.
      */

      await client.query(
        `
        UPDATE matches
        SET
          annulled_at =
            CURRENT_TIMESTAMP,
          annulled_by = $1,
          annul_reason = $2,
          status = 'annulled'
        WHERE id = $3
        `,
        [
          req.userId,
          reason,
          match.id,
        ],
      );

      /*
        Cerramos desafío relacionado.
      */

      if (
        match.challenge_id
      ) {
        await client.query(
          `
          UPDATE challenges
          SET
            status =
              'annulled',
            resolved_at =
              CURRENT_TIMESTAMP
          WHERE id = $1
          `,
          [
            match.challenge_id,
          ],
        );
      }

      /*
        Marcamos alertas como resueltas.
      */

      await client.query(
        `
        UPDATE match_audit_flags
        SET
          resolved = TRUE,
          resolved_at =
            CURRENT_TIMESTAMP,
          resolved_by = $1
        WHERE match_id = $2
          AND resolved = FALSE
        `,
        [
          req.userId,
          match.id,
        ],
      );

      /*
        Auditoría permanente.
      */

      await client.query(
        `
        INSERT INTO audit_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          details
        )
        VALUES (
          $1,
          $2,
          $3,
          'match_annulled',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,
          JSON.stringify({
            reason,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      res.json({
        message:
          "Partido anulado y Elo revertido correctamente.",
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      next(error);
    } finally {
      client.release();
    }
  };