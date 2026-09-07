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
          created_at

        FROM users

        WHERE verification_status =
          'pending_verification'

          AND role =
            'player'

        ORDER BY
          created_at ASC
        `,
      );

    res.json({
      users:
        result.rows,
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

            AND role =
              'player'
          `,
          [
            id,
          ],
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

                secure:
                  true,

                sign_url:
                  true,
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

                secure:
                  true,

                sign_url:
                  true,
              },
            )
          : null;

      res.json({
        user: {
          id:
            user.id,

          name:
            user.name,

          first_name:
            user.first_name,

          last_name:
            user.last_name,

          dni:
            user.dni,

          phone:
            user.phone,

          email:
            user.email,

          gender:
            user.gender,

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

            AND role =
              'player'

            AND verification_status =
              'pending_verification'

          RETURNING
            id,
            name,
            email,
            verification_status,
            verified_at
          `,
          [
            id,
          ],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Jugador pendiente de verificación no encontrado",
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

            verified_at =
              NULL,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = $1

            AND role =
              'player'

            AND verification_status =
              'pending_verification'

          RETURNING
            id,
            name,
            email,
            verification_status
          `,
          [
            id,
          ],
        );

      if (
        !result.rowCount
      ) {
        return res
          .status(404)
          .json({
            message:
              "Jugador pendiente de verificación no encontrado",
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

            COUNT(
              f.id
            )::int
              AS flag_count,

            COUNT(
              f.id
            )
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
              NULLS LAST,

            m.id DESC
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
            f.id,
            f.flag_type,
            f.severity,
            f.message,
            f.resolved,
            f.resolved_at,
            f.resolved_by,
            resolver.name AS
              resolved_by_name,
            f.created_at

          FROM match_audit_flags f

          LEFT JOIN users resolver
            ON resolver.id =
               f.resolved_by

          WHERE f.match_id = $1

          ORDER BY
            f.resolved ASC,

            f.created_at DESC,

            f.id DESC
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
              player_name,

            reverser.name AS
              reversed_by_name

          FROM elo_events e

          JOIN users u
            ON u.id =
               e.user_id

          LEFT JOIN users reverser
            ON reverser.id =
               e.reversed_by

          WHERE e.match_id = $1

          ORDER BY
            e.created_at ASC,
            e.id ASC
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
            a.created_at DESC,
            a.id DESC
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
            resolved =
              TRUE,

            resolved_at =
              CURRENT_TIMESTAMP,

            resolved_by =
              $1

          WHERE id = $2

            AND resolved =
              FALSE

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
              "Alerta pendiente no encontrada",
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
        reason.length < 5 ||
        reason.length > 500
      ) {
        return res
          .status(400)
          .json({
            message:
              "Indicá un motivo de entre 5 y 500 caracteres.",
          });
      }


      await client.query(
        "BEGIN",
      );


      /*
        Primero bloqueamos el partido.

        Es el mismo orden utilizado
        durante la confirmación:
        partido -> jugadores.

        Eso disminuye el riesgo
        de deadlocks.
      */

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


      if (
        !match.player1_id ||
        !match.player2_id
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El partido no tiene jugadores válidos.",
          });
      }


      /*
        Bloqueamos los dos jugadores
        en orden estable.

        confirmMatchResult también
        los bloquea por id ASC.
      */

      const players =
        await client.query(
          `
          SELECT
            id,
            rating,
            matches_played

          FROM users

          WHERE id IN (
            $1,
            $2
          )

          ORDER BY
            id ASC

          FOR UPDATE
          `,
          [
            match.player1_id,
            match.player2_id,
          ],
        );


      if (
        players.rowCount !== 2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudieron cargar correctamente los jugadores del partido.",
          });
      }


      /*
        Buscamos exactamente los
        movimientos Elo originales
        de este partido.
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

          ORDER BY
            user_id ASC,
            id ASC

          FOR UPDATE
          `,
          [
            match.id,
          ],
        );


      /*
        Un partido confirmado normal
        debe tener exactamente:
        - un movimiento para ganador
        - un movimiento para perdedor

        Si falta alguno, no anulamos
        parcialmente.
      */

      if (
        eloEvents.rowCount !== 2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El historial Elo de este partido está incompleto. No se puede anular automáticamente.",

            reason:
              "invalid_elo_history",
          });
      }


      const expectedPlayerIds =
        new Set([
          Number(
            match.player1_id,
          ),

          Number(
            match.player2_id,
          ),
        ]);


      const eloPlayerIds =
        new Set(
          eloEvents.rows.map(
            (event) =>
              Number(
                event.user_id,
              ),
          ),
        );


      if (
        eloPlayerIds.size !== 2 ||
        ![
          ...expectedPlayerIds,
        ].every(
          (id) =>
            eloPlayerIds.has(
              id,
            ),
        )
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los movimientos Elo no corresponden a los jugadores de este partido.",

            reason:
              "elo_players_mismatch",
          });
      }


      const playerMap =
        new Map(
          players.rows.map(
            (player) => [
              Number(
                player.id,
              ),

              player,
            ],
          ),
        );


      /*
        Aplicamos una reversión
        compensatoria sobre el Elo actual.

        También marcamos como revertido
        el evento original y generamos
        un nuevo evento administrativo.
      */

      for (
        const event of
        eloEvents.rows
      ) {
        const player =
          playerMap.get(
            Number(
              event.user_id,
            ),
          );


        if (!player) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "No se encontró uno de los jugadores del historial Elo.",

              reason:
                "elo_player_not_found",
            });
        }


        const before =
          Number(
            player.rating,
          );


        const eventDelta =
          Number(
            event.elo_change,
          );


        if (
          !Number.isFinite(
            before,
          ) ||
          !Number.isFinite(
            eventDelta,
          )
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El historial Elo contiene valores inválidos.",

              reason:
                "invalid_elo_values",
            });
        }


        const reversal =
          -eventDelta;


        const after =
          Math.max(
            100,
            before +
              reversal,
          );


        const realReversal =
          after -
          before;


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


        /*
          Actualizamos nuestro mapa
          también, por seguridad.
        */

        player.rating =
          after;


        const reversed =
          await client.query(
            `
            UPDATE elo_events

            SET
              reversed_at =
                CURRENT_TIMESTAMP,

              reversed_by =
                $1

            WHERE id = $2

              AND reversed_at
                IS NULL

            RETURNING id
            `,
            [
              req.userId,
              event.id,
            ],
          );


        if (
          !reversed.rowCount
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "Uno de los movimientos Elo ya había sido revertido.",

              reason:
                "elo_already_reversed",
            });
        }


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
            realReversal,
            after,

            `Reversión por anulación administrativa del partido #${match.id}`,
          ],
        );
      }


      /*
        Marcamos partido como anulado.
      */

      const annulled =
        await client.query(
          `
          UPDATE matches

          SET
            annulled_at =
              CURRENT_TIMESTAMP,

            annulled_by =
              $1,

            annul_reason =
              $2,

            status =
              'annulled'

          WHERE id = $3

            AND status =
              'completed'

            AND annulled_at
              IS NULL

          RETURNING *
          `,
          [
            req.userId,
            reason,
            match.id,
          ],
        );


      if (
        !annulled.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió antes de poder anularlo.",

            reason:
              "match_state_changed",
          });
      }


      /*
        Cerramos el desafío relacionado.

        No tocamos desafíos en otro
        estado inesperado.
      */

      if (
        match.challenge_id
      ) {
        const challenge =
          await client.query(
            `
            UPDATE challenges

            SET
              status =
                'annulled',

              resolved_at =
                CURRENT_TIMESTAMP

            WHERE id = $1

              AND status =
                'completed'

            RETURNING id
            `,
            [
              match.challenge_id,
            ],
          );


        if (
          !challenge.rowCount
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El desafío relacionado no está en un estado válido para ser anulado.",

              reason:
                "challenge_state_invalid",
            });
        }
      }


      /*
        Marcamos alertas pendientes
        como resueltas.
      */

      await client.query(
        `
        UPDATE match_audit_flags

        SET
          resolved =
            TRUE,

          resolved_at =
            CURRENT_TIMESTAMP,

          resolved_by =
            $1

        WHERE match_id = $2

          AND resolved =
            FALSE
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

            original_winner_id:
              match.winner_id,

            original_score:
              match.score,
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
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // La conexión se libera abajo.
      }

      next(error);
    } finally {
      client.release();
    }
  };