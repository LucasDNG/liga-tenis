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

        WHERE
          verification_status =
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

          WHERE
            id = $1
            AND role =
              'player'
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

          WHERE
            id = $1
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
          [id],
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

          WHERE
            id = $1
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
          [id],
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

          WHERE
            m.id = $1
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

          WHERE
            f.match_id = $1

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

          WHERE
            e.match_id = $1

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

          WHERE
            a.match_id = $1

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

          WHERE
            id = $2
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
  ANULAR PARTIDO

  REGLA DE INTEGRIDAD:

  Una anulación directa solamente es
  segura cuando el partido no tiene
  historia deportiva posterior que
  dependa matemáticamente de su Elo.

  Si existen partidos posteriores de
  la misma liga, se necesita replay
  cronológico y se bloquea la operación.

  También se bloquea si alguno de los
  participantes tiene un movimiento
  Elo posterior al partido.

  Cuando es seguro:
  - restauramos Elo exacto pre-partido
  - restamos 1 match
  - revertimos match_result
  - revertimos placement_completed
    si existió
  - agregamos admin_reversal
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
        BLOQUEAR PARTIDO
      */

      const found =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1

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

      if (
        !match.completed_at
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El partido no posee fecha de finalización válida.",

            reason:
              "invalid_completed_at",
          });
      }

      /*
        BLOQUEAR JUGADORES
      */

      const players =
        await client.query(
          `
          SELECT
            id,
            name,
            rating,
            matches_played,
            city,
            gender

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

      const player1 =
        players.rows.find(
          (player) =>
            Number(player.id) ===
            Number(
              match.player1_id,
            ),
        );

      const player2 =
        players.rows.find(
          (player) =>
            Number(player.id) ===
            Number(
              match.player2_id,
            ),
        );

      if (
        !player1 ||
        !player2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los jugadores del partido no son válidos.",
          });
      }

      if (
        player1.city !==
          player2.city ||
        player1.gender !==
          player2.gender
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los jugadores del partido no pertenecen a la misma liga.",

            reason:
              "league_mismatch",
          });
      }

      /*
        ========================================================
        PROTECCIÓN CONTRA ANULACIÓN HISTÓRICA

        Si hubo otro partido completado
        posteriormente en esta misma liga,
        el resultado pudo afectar:

        - Elo de otros jugadores
        - posición del #1
        - posición del #2
        - condición provisional/oficial
        - fórmula de partidos siguientes

        No hacemos una compensación falsa.
        ========================================================
      */

      const laterLeagueMatch =
        await client.query(
          `
          SELECT
            m.id,
            m.completed_at

          FROM matches m

          JOIN users league_player
            ON league_player.id =
               m.player1_id

          WHERE
            m.status = 'completed'
            AND m.annulled_at IS NULL
            AND m.id <> $1
            AND league_player.city = $2
            AND league_player.gender = $3
            AND (
              m.completed_at > $4
              OR (
                m.completed_at = $4
                AND m.id > $1
              )
            )

          ORDER BY
            m.completed_at ASC,
            m.id ASC

          LIMIT 1
          `,
          [
            match.id,
            player1.city,
            player1.gender,
            match.completed_at,
          ],
        );

      if (
        laterLeagueMatch.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Este partido tiene partidos posteriores en la misma liga. Para anularlo se necesita recalcular cronológicamente el Elo posterior.",

            reason:
              "historical_replay_required",

            first_later_match_id:
              laterLeagueMatch
                .rows[0]
                .id,

            first_later_match_completed_at:
              laterLeagueMatch
                .rows[0]
                .completed_at,
          });
      }

      /*
        ========================================================
        EVENTOS ACTIVOS DEL PARTIDO

        Ahora puede haber:
        - 2 match_result
        - 0..2 placement_completed
        ========================================================
      */

      const eloEvents =
        await client.query(
          `
          SELECT *

          FROM elo_events

          WHERE
            match_id = $1
            AND reversed_at
              IS NULL

          ORDER BY
            created_at ASC,
            id ASC

          FOR UPDATE
          `,
          [
            match.id,
          ],
        );

      const matchResultEvents =
        eloEvents.rows.filter(
          (event) =>
            event.event_type ===
            "match_result",
        );

      if (
        matchResultEvents.length !==
        2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El historial Elo de este partido no contiene exactamente dos movimientos match_result activos.",

            reason:
              "invalid_elo_history",
          });
      }

      const unsupportedEvents =
        eloEvents.rows.filter(
          (event) =>
            event.event_type !==
              "match_result" &&
            event.event_type !==
              "placement_completed",
        );

      if (
        unsupportedEvents.length
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El partido posee movimientos Elo activos que requieren revisión manual antes de anularlo.",

            reason:
              "unsupported_match_elo_events",

            event_types: [
              ...new Set(
                unsupportedEvents.map(
                  (event) =>
                    event.event_type,
                ),
              ),
            ],
          });
      }

      /*
        VALIDAR JUGADORES DE LOS
        DOS MATCH_RESULT
      */

      const expectedPlayerIds =
        new Set([
          Number(
            match.player1_id,
          ),

          Number(
            match.player2_id,
          ),
        ]);

      const resultPlayerIds =
        new Set(
          matchResultEvents.map(
            (event) =>
              Number(
                event.user_id,
              ),
          ),
        );

      if (
        resultPlayerIds.size !== 2 ||
        ![
          ...expectedPlayerIds,
        ].every(
          (id) =>
            resultPlayerIds.has(
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
              "Los movimientos Elo no corresponden a los jugadores del partido.",

            reason:
              "elo_players_mismatch",
          });
      }

      /*
        ========================================================
        MOVIMIENTOS ELO POSTERIORES DE
        LOS PARTICIPANTES

        Aunque no haya otro partido,
        podría existir por ejemplo una
        penalización posterior.

        Restaurar directamente el Elo
        anterior al partido borraría
        matemáticamente ese movimiento.

        Por eso también bloqueamos.
        ========================================================
      */

      const laterPlayerElo =
        await client.query(
          `
          SELECT
            id,
            user_id,
            event_type,
            created_at

          FROM elo_events

          WHERE
            user_id IN (
              $1,
              $2
            )

            AND match_id IS DISTINCT
              FROM $3

            AND reversed_at
              IS NULL

            AND created_at >
              $4

          ORDER BY
            created_at ASC,
            id ASC

          LIMIT 1
          `,
          [
            match.player1_id,
            match.player2_id,
            match.id,
            match.completed_at,
          ],
        );

      if (
        laterPlayerElo.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Uno de los jugadores tiene movimientos Elo posteriores a este partido. Se necesita replay cronológico para anularlo sin perder esos movimientos.",

            reason:
              "historical_replay_required",

            first_later_elo_event: {
              id:
                laterPlayerElo
                  .rows[0]
                  .id,

              user_id:
                laterPlayerElo
                  .rows[0]
                  .user_id,

              event_type:
                laterPlayerElo
                  .rows[0]
                  .event_type,

              created_at:
                laterPlayerElo
                  .rows[0]
                  .created_at,
            },
          });
      }

      /*
        ========================================================
        ESTADO PRE-PARTIDO EXACTO

        Los elo_before de match_result
        son la fuente histórica correcta.
        ========================================================
      */

      const originalByPlayer =
        new Map();

      for (
        const event of
        matchResultEvents
      ) {
        const userId =
          Number(
            event.user_id,
          );

        const eloBefore =
          Number(
            event.elo_before,
          );

        const eloChange =
          Number(
            event.elo_change,
          );

        const eloAfter =
          Number(
            event.elo_after,
          );

        if (
          !Number.isInteger(
            eloBefore,
          ) ||
          !Number.isInteger(
            eloChange,
          ) ||
          !Number.isInteger(
            eloAfter,
          ) ||
          eloBefore < 0 ||
          eloAfter < 0 ||
          eloBefore +
            eloChange !==
            eloAfter
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El historial Elo original contiene valores inválidos.",

              reason:
                "invalid_elo_values",
            });
        }

        originalByPlayer.set(
          userId,
          {
            event,
            eloBefore,
          },
        );
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
        ========================================================
        RESTAURAR JUGADORES

        No usamos:
          Elo actual - delta viejo

        Usamos:
          Elo = elo_before original

        Es exacto porque ya verificamos
        que no existe historia posterior.
        ========================================================
      */

      const reversals = [];

      for (
        const playerId of
        expectedPlayerIds
      ) {
        const player =
          playerMap.get(
            playerId,
          );

        const original =
          originalByPlayer.get(
            playerId,
          );

        if (
          !player ||
          !original
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "No se pudo reconstruir el estado previo de uno de los jugadores.",

              reason:
                "pre_match_state_missing",
            });
        }

        const currentRating =
          Number(
            player.rating,
          );

        const currentMatches =
          Number(
            player.matches_played,
          );

        if (
          !Number.isInteger(
            currentRating,
          ) ||
          currentRating < 0 ||
          !Number.isInteger(
            currentMatches,
          ) ||
          currentMatches < 1
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El estado actual de uno de los jugadores no permite una anulación automática segura.",

              reason:
                "invalid_current_player_state",

              player_id:
                playerId,
            });
        }

        const restoredRating =
          original.eloBefore;

        const restoredMatches =
          currentMatches - 1;

        const realReversal =
          restoredRating -
          currentRating;

        const updated =
          await client.query(
            `
            UPDATE users

            SET
              rating = $1,

              matches_played = $2,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              id = $3
              AND rating = $4
              AND matches_played = $5

            RETURNING
              id,
              rating,
              matches_played
            `,
            [
              restoredRating,
              restoredMatches,
              playerId,
              currentRating,
              currentMatches,
            ],
          );

        if (
          updated.rowCount !==
          1
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El estado de un jugador cambió durante la anulación.",

              reason:
                "player_state_changed",
            });
        }

        reversals.push({
          playerId,
          currentRating,
          restoredRating,
          realReversal,
          restoredMatches,
        });
      }

      /*
        ========================================================
        MARCAR COMO REVERTIDOS TODOS
        LOS EVENTOS ORIGINALES ACTIVOS

        Incluye placement_completed.
        ========================================================
      */

      for (
        const event of
        eloEvents.rows
      ) {
        const reversed =
          await client.query(
            `
            UPDATE elo_events

            SET
              reversed_at =
                CURRENT_TIMESTAMP,

              reversed_by =
                $1

            WHERE
              id = $2
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
          reversed.rowCount !==
          1
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "Uno de los movimientos Elo cambió durante la anulación.",

              reason:
                "elo_state_changed",
            });
        }
      }

      /*
        EVENTOS ADMINISTRATIVOS
      */

      for (
        const reversal of
        reversals
      ) {
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
            reversal.playerId,
            match.id,
            match.challenge_id,

            reversal.currentRating,
            reversal.realReversal,
            reversal.restoredRating,

            `Restauración exacta por anulación administrativa del partido #${match.id}`,
          ],
        );
      }

      /*
        MARCAR PARTIDO ANULADO
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

          WHERE
            id = $3
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
        DESAFÍO ASOCIADO
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

            WHERE
              id = $1
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
        RESOLVER ALERTAS
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

        WHERE
          match_id = $2
          AND resolved =
            FALSE
        `,
        [
          req.userId,
          match.id,
        ],
      );

      /*
        AUDITORÍA PERMANENTE
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

            reversal_mode:
              "exact_pre_match_restore",

            original_winner_id:
              match.winner_id,

            original_score:
              match.score,

            reversed_elo_event_ids:
              eloEvents.rows.map(
                (event) =>
                  Number(
                    event.id,
                  ),
              ),

            players:
              reversals.map(
                (reversal) => ({
                  user_id:
                    reversal.playerId,

                  elo_before_annulment:
                    reversal.currentRating,

                  restored_elo:
                    reversal.restoredRating,

                  elo_change:
                    reversal.realReversal,

                  restored_matches_played:
                    reversal.restoredMatches,
                }),
              ),
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      res.json({
        message:
          "Partido anulado y estado Elo previo restaurado correctamente.",

        reversal_mode:
          "exact_pre_match_restore",

        players:
          reversals.map(
            (reversal) => ({
              user_id:
                reversal.playerId,

              rating_before_annulment:
                reversal.currentRating,

              rating_after_annulment:
                reversal.restoredRating,

              elo_change:
                reversal.realReversal,

              matches_played_after:
                reversal.restoredMatches,
            }),
          ),
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // conexión liberada abajo
      }

      next(error);
    } finally {
      client.release();
    }
  };