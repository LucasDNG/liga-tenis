import { pool } from "../db.js";

import {
  parseMatchScore,
} from "../services/matchScore.service.js";

import {
  createMatchAuditFlag,
  checkFrequentOpponents,
  checkEloConcentration,
} from "../services/antifraud.service.js";

import {
  isPlacementRatingPlayer,
  calculatePlayerMatchRating,
} from "../services/matchRating.service.js";

import {
  buildMatchEloEvents,
} from "../services/matchEloEvents.service.js";

import {
  persistMatchEloEventPlan,
} from "../services/eloEventPersistence.service.js";

import {
  preparePlacementMatchContext,
  recordPlacementMatchResult,
} from "../services/placementMatch.service.js";

import {
  getOfficialRanking,
} from "../services/rankingOrder.service.js";


/*
  ============================================================
  LA RED
  PARTIDOS
  ============================================================

  MODELO ACTUAL

  PROVISIONAL:
  - primeros 5 partidos son nivelatorios;
  - no usa K64;
  - no acumula Elo partido a partido;
  - las victorias construyen placement_percentile;
  - las derrotas solamente afectan el récord;
  - rival oficial vale su percentil oficial pre-partido;
  - rival provisional vale su placement demostrado
    pre-partido;
  - al completar el quinto partido se asigna Elo oficial
    según la zona real del ranking.

  OFICIAL:
  - conserva Elo normal K32;
  - conserva regla vigente de derrota contra provisional;
  - conserva regla especial de destronamiento del #1.

  El replay se ajustará en el bloque posterior.
  ============================================================
*/


const TOO_FAST_RESULT_MINUTES =
  40;


/*
  ============================================================
  MIS PARTIDOS
  ============================================================
*/

export const getMyMatches =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            m.*,

            p1.name
              AS player1_name,

            p1.phone
              AS player1_phone,

            p2.name
              AS player2_name,

            p2.phone
              AS player2_phone,

            w.name
              AS winner_name,

            confirmer.name
              AS result_confirmed_by_name

          FROM matches m

          JOIN users p1
            ON p1.id =
               m.player1_id

          JOIN users p2
            ON p2.id =
               m.player2_id

          LEFT JOIN users w
            ON w.id =
               m.winner_id

          LEFT JOIN users confirmer
            ON confirmer.id =
               m.result_confirmed_by

          WHERE
            (
              m.player1_id = $1
              OR
              m.player2_id = $1
            )

            AND m.annulled_at
              IS NULL

          ORDER BY
            m.created_at DESC,
            m.id DESC
          `,
          [
            req.userId,
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
  CARGAR RESULTADO
  ============================================================
*/

export const submitMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const {
        score,
      } =
        req.body;

      const parsed =
        parseMatchScore(
          score,
        );

      if (
        parsed.error
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              parsed.error,

            reason:
              "invalid_score",
          });
      }

      const matchResult =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1

            AND status =
              'pending'

            AND annulled_at
              IS NULL

            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
          ],
        );

      if (
        !matchResult
          .rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(404)
          .json({
            message:
              "Partido pendiente no encontrado",

            reason:
              "match_not_found",
          });
      }

      const match =
        matchResult.rows[0];

      if (
        !match
          .scheduled_at
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              "Este partido no tiene fecha y hora registradas.",

            reason:
              "schedule_missing",
          });
      }

      const scheduledTime =
        new Date(
          match.scheduled_at,
        ).getTime();

      if (
        Number.isNaN(
          scheduledTime,
        )
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              "La fecha y hora registradas para este partido no son válidas.",

            reason:
              "invalid_schedule",
          });
      }

      const now =
        Date.now();

      if (
        scheduledTime >
        now
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(403)
          .json({
            message:
              "Todavía no podés cargar el resultado. El partido aún no llegó a su horario programado.",

            reason:
              "match_not_started",

            available_at:
              match
                .scheduled_at,
          });
      }

      const winnerId =
        parsed
          .winnerSide ===
        1
          ? Number(
              match
                .player1_id,
            )
          : Number(
              match
                .player2_id,
            );

      const updated =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id =
              $1,

            proposed_score =
              $2,

            result_submitted_by =
              $3,

            result_submitted_at =
              CURRENT_TIMESTAMP,

            status =
              'awaiting_confirmation'

          WHERE
            id = $4

            AND status =
              'pending'

            AND annulled_at
              IS NULL

          RETURNING *
          `,
          [
            winnerId,

            JSON.stringify(
              parsed
                .normalizedScore,
            ),

            req.userId,

            match.id,
          ],
        );

      if (
        !updated
          .rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió. Actualizá la página e intentá nuevamente.",

            reason:
              "match_state_changed",
          });
      }

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
          'match_result_submitted',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            winner_id:
              winnerId,

            score:
              parsed
                .normalizedScore,
          }),
        ],
      );

      const minutesSinceStart =
        Math.floor(
          (
            now -
            scheduledTime
          ) /
          60000,
        );

      if (
        minutesSinceStart >=
          0 &&
        minutesSinceStart <
          TOO_FAST_RESULT_MINUTES
      ) {
        await createMatchAuditFlag(
          client,
          {
            matchId:
              match.id,

            flagType:
              "result_too_fast",

            message:
              `El resultado fue cargado ${minutesSinceStart} minutos después del horario programado.`,
          },
        );
      }

      await client.query(
        "COMMIT",
      );

      return res.json({
        message:
          "Resultado enviado. Esperando confirmación del rival.",

        match:
          updated.rows[0],
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // sin acción
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  RECHAZAR RESULTADO
  ============================================================
*/

export const rejectMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const found =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1

            AND status =
              'awaiting_confirmation'

            AND annulled_at
              IS NULL

            AND result_submitted_by
              <> $2

            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
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
              "Resultado para confirmar no encontrado",

            reason:
              "result_not_found",
          });
      }

      const current =
        found.rows[0];

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id =
              NULL,

            proposed_score =
              NULL,

            result_submitted_by =
              NULL,

            result_submitted_at =
              NULL,

            result_rejection_count =
              COALESCE(
                result_rejection_count,
                0
              ) + 1,

            status =
              'pending'

          WHERE
            id = $1

            AND status =
              'awaiting_confirmation'

            AND annulled_at
              IS NULL

          RETURNING *
          `,
          [
            current.id,
          ],
        );

      if (
        !result.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del resultado cambió. Actualizá la página.",

            reason:
              "result_state_changed",
          });
      }

      const match =
        result.rows[0];

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
          'match_result_rejected',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            rejection_count:
              match
                .result_rejection_count,

            rejected_submission_by:
              current
                .result_submitted_by,

            rejected_winner_id:
              current
                .proposed_winner_id,

            rejected_score:
              current
                .proposed_score,
          }),
        ],
      );

      if (
        Number(
          match
            .result_rejection_count,
        ) >= 2
      ) {
        await createMatchAuditFlag(
          client,
          {
            matchId:
              match.id,

            flagType:
              "repeated_result_rejection",

            message:
              `El resultado de este partido ya fue rechazado ${match.result_rejection_count} veces.`,
          },
        );
      }

      await client.query(
        "COMMIT",
      );

      return res.json({
        message:
          "Resultado rechazado. Puede cargarse nuevamente.",

        rejection_count:
          match
            .result_rejection_count,
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // sin acción
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  CONFIRMAR RESULTADO
  ============================================================
*/

export const confirmMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
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

            AND status =
              'awaiting_confirmation'

            AND result_submitted_by
              <> $2

            AND annulled_at
              IS NULL

            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
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
              "Resultado para confirmar no encontrado",

            reason:
              "result_not_found",
          });
      }

      const match =
        found.rows[0];

      /*
        REVALIDAR SCORE
      */

      let proposedScore =
        match
          .proposed_score;

      if (
        typeof proposedScore ===
        "string"
      ) {
        try {
          proposedScore =
            JSON.parse(
              proposedScore,
            );
        } catch {
          proposedScore =
            null;
        }
      }

      const parsed =
        parseMatchScore(
          proposedScore,
        );

      if (
        parsed.error
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El resultado almacenado no es válido y no puede confirmarse.",

            reason:
              "invalid_stored_score",
          });
      }

      proposedScore =
        parsed
          .normalizedScore;

      const expectedWinnerId =
        parsed
          .winnerSide ===
        1
          ? Number(
              match
                .player1_id,
            )
          : Number(
              match
                .player2_id,
            );

      if (
        Number(
          match
            .proposed_winner_id,
        ) !==
        expectedWinnerId
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El ganador almacenado no coincide con el resultado cargado.",

            reason:
              "winner_score_mismatch",
          });
      }

      /*
        BLOQUEAR JUGADORES
      */

      const playersResult =
        await client.query(
          `
          SELECT
            id,
            name,
            first_name,
            last_name,
            rating,
            matches_played,
            city,
            gender,
            role,
            verification_status

          FROM users

          WHERE
            id IN (
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
        playersResult
          .rowCount !== 2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudieron cargar correctamente los dos jugadores del partido.",

            reason:
              "players_not_found",
          });
      }

      const player1 =
        playersResult.rows.find(
          (player) =>
            Number(
              player.id,
            ) ===
            Number(
              match
                .player1_id,
            ),
        );

      const player2 =
        playersResult.rows.find(
          (player) =>
            Number(
              player.id,
            ) ===
            Number(
              match
                .player2_id,
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

            reason:
              "invalid_players",
          });
      }

      if (
        player1.role !==
          "player" ||
        player2.role !==
          "player" ||
        player1
          .verification_status !==
          "verified" ||
        player2
          .verification_status !==
          "verified" ||
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
              "Los jugadores ya no cumplen las condiciones de esta liga.",

            reason:
              "players_not_eligible",
          });
      }

      const player1Id =
        Number(
          player1.id,
        );

      const player2Id =
        Number(
          player2.id,
        );

      const winnerId =
        expectedWinnerId;

      const loserId =
        winnerId ===
        player1Id
          ? player2Id
          : player1Id;

      const winnerPlayer =
        winnerId ===
        player1Id
          ? player1
          : player2;

      const loserPlayer =
        loserId ===
        player1Id
          ? player1
          : player2;

      const player1RatingBefore =
        Number(
          player1.rating,
        );

      const player2RatingBefore =
        Number(
          player2.rating,
        );

      const player1MatchesBefore =
        Number(
          player1
            .matches_played,
        );

      const player2MatchesBefore =
        Number(
          player2
            .matches_played,
        );

      if (
        !Number.isInteger(
          player1RatingBefore,
        ) ||
        !Number.isInteger(
          player2RatingBefore,
        ) ||
        player1RatingBefore <
          0 ||
        player2RatingBefore <
          0 ||
        !Number.isInteger(
          player1MatchesBefore,
        ) ||
        !Number.isInteger(
          player2MatchesBefore,
        ) ||
        player1MatchesBefore <
          0 ||
        player2MatchesBefore <
          0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los datos deportivos de los jugadores no son válidos.",

            reason:
              "invalid_rating_data",
          });
      }

      const player1Provisional =
        isPlacementRatingPlayer(
          player1,
        );

      const player2Provisional =
        isPlacementRatingPlayer(
          player2,
        );

      /*
        ========================================================
        RANKING OFICIAL PRE-PARTIDO
        ========================================================

        Debe tomarse antes de:

        - guardar el partido;
        - incrementar matches_played;
        - graduar un provisional.
      */

      const rankingBefore =
        await getOfficialRanking(
          client,
          {
            city:
              player1.city,

            gender:
              player1.gender,
          },
        );

      const player1RankBefore =
        rankingBefore.find(
          (row) =>
            Number(
              row.id,
            ) ===
            player1Id,
        )?.official_position ??
        null;

      const player2RankBefore =
        rankingBefore.find(
          (row) =>
            Number(
              row.id,
            ) ===
            player2Id,
        )?.official_position ??
        null;

      /*
        ========================================================
        REFERENCIAS DE PLACEMENT PRE-PARTIDO
        ========================================================

        ESTE ORDEN ES IMPORTANTE.

        Si ambos son provisionales, el valor de P1 y P2
        se calcula antes de guardar el resultado actual.
      */

      const placementContext =
        await preparePlacementMatchContext(
          client,
          {
            player1,
            player2,
          },
        );

      /*
        EVITAR DOBLE PROCESAMIENTO
      */

      const existingElo =
        await client.query(
          `
          SELECT id

          FROM elo_events

          WHERE
            match_id = $1

            AND event_type =
              'match_result'

          LIMIT 1
          `,
          [
            match.id,
          ],
        );

      if (
        existingElo.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Este partido ya tiene movimientos Elo registrados.",

            reason:
              "elo_already_applied",
          });
      }

      /*
        ========================================================
        REGISTRAR EVIDENCIA NIVELATORIA
        ========================================================

        Esto devuelve el placement final si alguno está
        disputando su quinto partido.
      */

      const placementResult =
        await recordPlacementMatchResult(
          client,
          {
            matchId:
              match.id,

            player1,

            player2,

            winnerId,

            preparedContext:
              placementContext,

            officialRankingBefore:
              rankingBefore,
          },
        );

      const player1Placement =
        placementResult
          .player1;

      const player2Placement =
        placementResult
          .player2;

      /*
        ========================================================
        CALCULAR ELO FINAL
        ========================================================

        Toda la política deportiva base vive ahora en
        matchRating.service.js.

        La regla especial de destronamiento del #1 se aplica
        después, porque depende de la posición oficial previa
        del ranking y no del cálculo Elo aislado.
      */

      const player1RatingResult =
        calculatePlayerMatchRating({
          player:
            player1,

          opponent:
            player2,

          won:
            winnerId ===
            player1Id,

          placementResult:
            player1Placement,
        });

      const player2RatingResult =
        calculatePlayerMatchRating({
          player:
            player2,

          opponent:
            player1,

          won:
            winnerId ===
            player2Id,

          placementResult:
            player2Placement,
        });

      let player1RatingAfter =
        Number(
          player1RatingResult
            .rating_after,
        );

      let player2RatingAfter =
        Number(
          player2RatingResult
            .rating_after,
        );

      const player1Calculation =
        player1RatingResult
          .calculation;

      const player2Calculation =
        player2RatingResult
          .calculation;

      const player1SpecialPenalty =
        player1RatingResult
          .special_provisional_penalty ??
        null;

      const player2SpecialPenalty =
        player2RatingResult
          .special_provisional_penalty ??
        null;

      /*
        ========================================================
        REGLA #1
        ========================================================

        Solo aplica a un jugador que ya era oficial
        antes del partido.

        Si quien era #1 pierde:
        debe quedar debajo del Elo pre-partido del #2.

        No se aplica a un provisional que termina placement.
      */

      const loserRankBefore =
        loserId ===
        player1Id
          ? player1RankBefore
          : player2RankBefore;

      const loserWasProvisional =
        loserId ===
        player1Id
          ? player1Provisional
          : player2Provisional;

      const numberTwoBefore =
        rankingBefore.find(
          (row) =>
            Number(
              row
                .official_position,
            ) === 2,
        ) ||
        null;

      let dethroneApplied =
        false;

      let dethroneCeiling =
        null;

      if (
        !loserWasProvisional &&
        Number(
          loserRankBefore,
        ) === 1 &&
        numberTwoBefore &&
        Number(
          numberTwoBefore.id,
        ) !==
          loserId
      ) {
        dethroneCeiling =
          Number(
            numberTwoBefore
              .rating,
          ) -
          1;

        if (
          loserId ===
          player1Id &&
          player1RatingAfter >
            dethroneCeiling
        ) {
          player1RatingAfter =
            Math.max(
              0,
              dethroneCeiling,
            );

          dethroneApplied =
            true;
        }

        if (
          loserId ===
          player2Id &&
          player2RatingAfter >
            dethroneCeiling
        ) {
          player2RatingAfter =
            Math.max(
              0,
              dethroneCeiling,
            );

          dethroneApplied =
            true;
        }
      }

      /*
        INVARIANTES
      */

      if (
        !Number.isInteger(
          player1RatingAfter,
        ) ||
        !Number.isInteger(
          player2RatingAfter,
        ) ||
        player1RatingAfter <
          0 ||
        player2RatingAfter <
          0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El cálculo deportivo produjo un Elo inválido. No se aplicó ningún cambio.",

            reason:
              "elo_invariant_failed",
          });
      }

      /*
        ========================================================
        ACTUALIZAR USUARIOS
        ========================================================
      */

      const updatedPlayer1 =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,

            matches_played =
              matches_played + 1,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2

            AND rating = $3

            AND matches_played =
              $4

          RETURNING
            id,
            rating,
            matches_played
          `,
          [
            player1RatingAfter,
            player1Id,
            player1RatingBefore,
            player1MatchesBefore,
          ],
        );

      const updatedPlayer2 =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,

            matches_played =
              matches_played + 1,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2

            AND rating = $3

            AND matches_played =
              $4

          RETURNING
            id,
            rating,
            matches_played
          `,
          [
            player2RatingAfter,
            player2Id,
            player2RatingBefore,
            player2MatchesBefore,
          ],
        );

      if (
        updatedPlayer1
          .rowCount !== 1 ||
        updatedPlayer2
          .rowCount !== 1
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los datos deportivos cambiaron durante la confirmación. No se aplicó el resultado.",

            reason:
              "rating_state_changed",
          });
      }

      /*
        ========================================================
        COMPLETAR PARTIDO
        ========================================================
      */

      const completedMatch =
        await client.query(
          `
          UPDATE matches

          SET
            winner_id =
              proposed_winner_id,

            score =
              $1,

            status =
              'completed',

            completed_at =
              CURRENT_TIMESTAMP,

            result_confirmed_at =
              CURRENT_TIMESTAMP,

            result_confirmed_by =
              $2

          WHERE
            id = $3

            AND status =
              'awaiting_confirmation'

            AND annulled_at
              IS NULL

          RETURNING *
          `,
          [
            JSON.stringify(
              proposedScore,
            ),

            req.userId,

            match.id,
          ],
        );

      if (
        !completedMatch
          .rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió antes de poder confirmarlo.",

            reason:
              "match_state_changed",
          });
      }

      /*
        CERRAR DESAFÍO
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
                'completed',

              resolved_at =
                CURRENT_TIMESTAMP

            WHERE
              id = $1

              AND status =
                'accepted'

            RETURNING id
            `,
            [
              match
                .challenge_id,
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
                "El desafío asociado no se encuentra en un estado válido para finalizar.",

              reason:
                "challenge_state_invalid",
            });
        }
      }

      /*
        ========================================================
        EVENTOS ELO
        ========================================================

        matchEloEvents.service.js decide qué eventos deben
        existir. eloEventPersistence.service.js solamente los
        persiste dentro de esta misma transacción.

        Invariante:
        - exactamente 2 x match_result;
        - 0..2 x placement_completed.
      */

      const eloEventPlan =
        buildMatchEloEvents({
          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          player1: {
            id:
              player1Id,

            rating_before:
              player1RatingBefore,

            rating_after:
              player1RatingAfter,

            matches_before:
              player1MatchesBefore,

            won:
              winnerId ===
              player1Id,

            dethrone_applied:
              dethroneApplied &&
              loserId ===
                player1Id,

            placement:
              player1Placement,
          },

          player2: {
            id:
              player2Id,

            rating_before:
              player2RatingBefore,

            rating_after:
              player2RatingAfter,

            matches_before:
              player2MatchesBefore,

            won:
              winnerId ===
              player2Id,

            dethrone_applied:
              dethroneApplied &&
              loserId ===
                player2Id,

            placement:
              player2Placement,
          },
        });

      await persistMatchEloEventPlan(
        client,
        eloEventPlan,
      );

      /*
        ========================================================
        AUDITORÍA
        ========================================================
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
          'match_result_confirmed',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            winner_id:
              winnerId,

            loser_id:
              loserId,

            score:
              proposedScore,

            player1: {
              id:
                player1Id,

              elo_before:
                player1RatingBefore,

              elo_after:
                player1RatingAfter,

              elo_change:
                player1RatingAfter -
                player1RatingBefore,

              matches_before:
                player1MatchesBefore,

              matches_after:
                player1MatchesBefore +
                1,

              provisional_before:
                player1Provisional,

              calculation:
                player1Calculation,

              official_position_before:
                player1RankBefore,

              special_provisional_penalty:
                player1SpecialPenalty,

              placement:
                player1Placement
                  ?.applies
                  ? {
                      completed:
                        Boolean(
                          player1Placement
                            .completed,
                        ),

                      match_number:
                        player1Placement
                          .placement_match_number,

                      wins:
                        player1Placement
                          .wins,

                      losses:
                        player1Placement
                          .losses,

                      placement_percentile:
                        player1Placement
                          .placement_percentile,

                      target_position:
                        player1Placement
                          .target_position,

                      target_elo:
                        player1Placement
                          .target_elo,
                    }
                  : null,
            },

            player2: {
              id:
                player2Id,

              elo_before:
                player2RatingBefore,

              elo_after:
                player2RatingAfter,

              elo_change:
                player2RatingAfter -
                player2RatingBefore,

              matches_before:
                player2MatchesBefore,

              matches_after:
                player2MatchesBefore +
                1,

              provisional_before:
                player2Provisional,

              calculation:
                player2Calculation,

              official_position_before:
                player2RankBefore,

              special_provisional_penalty:
                player2SpecialPenalty,

              placement:
                player2Placement
                  ?.applies
                  ? {
                      completed:
                        Boolean(
                          player2Placement
                            .completed,
                        ),

                      match_number:
                        player2Placement
                          .placement_match_number,

                      wins:
                        player2Placement
                          .wins,

                      losses:
                        player2Placement
                          .losses,

                      placement_percentile:
                        player2Placement
                          .placement_percentile,

                      target_position:
                        player2Placement
                          .target_position,

                      target_elo:
                        player2Placement
                          .target_elo,
                    }
                  : null,
            },

            number_one_dethrone: {
              applied:
                dethroneApplied,

              loser_was_number_one:
                Number(
                  loserRankBefore,
                ) === 1,

              number_two_id:
                numberTwoBefore
                  ?.id ??
                null,

              number_two_rating_before:
                numberTwoBefore
                  ?.rating ??
                null,

              ceiling:
                dethroneCeiling,
            },
          }),
        ],
      );

      /*
        ANTIFRAUDE
      */

      await checkFrequentOpponents(
        client,
        {
          matchId:
            match.id,

          player1Id:
            player1Id,

          player2Id:
            player2Id,
        },
      );

      await checkEloConcentration(
        client,
        {
          matchId:
            match.id,

          playerId:
            winnerId,
        },
      );

      await client.query(
        "COMMIT",
      );

      const winnerRatingAfter =
        winnerId ===
        player1Id
          ? player1RatingAfter
          : player2RatingAfter;

      const loserRatingAfter =
        loserId ===
        player1Id
          ? player1RatingAfter
          : player2RatingAfter;

      const winnerRatingBefore =
        winnerId ===
        player1Id
          ? player1RatingBefore
          : player2RatingBefore;

      const loserRatingBefore =
        loserId ===
        player1Id
          ? player1RatingBefore
          : player2RatingBefore;

      return res.json({
        message:
          "Resultado confirmado y ranking actualizado",

        elo_change: {
          winner:
            winnerRatingAfter -
            winnerRatingBefore,

          loser:
            loserRatingAfter -
            loserRatingBefore,
        },

        rating_after: {
          winner:
            winnerRatingAfter,

          loser:
            loserRatingAfter,
        },

        placement: {
          player1:
            player1Placement
              ?.applies
              ? {
                  match:
                    player1Placement
                      .placement_match_number,

                  completed:
                    Boolean(
                      player1Placement
                        .completed,
                    ),

                  wins:
                    player1Placement
                      .wins,

                  losses:
                    player1Placement
                      .losses,

                  percentile:
                    player1Placement
                      .placement_percentile,

                  target_position:
                    player1Placement
                      .target_position,

                  target_elo:
                    player1Placement
                      .target_elo,
                }
              : null,

          player2:
            player2Placement
              ?.applies
              ? {
                  match:
                    player2Placement
                      .placement_match_number,

                  completed:
                    Boolean(
                      player2Placement
                        .completed,
                    ),

                  wins:
                    player2Placement
                      .wins,

                  losses:
                    player2Placement
                      .losses,

                  percentile:
                    player2Placement
                      .placement_percentile,

                  target_position:
                    player2Placement
                      .target_position,

                  target_elo:
                    player2Placement
                      .target_elo,
                }
              : null,
        },

        special_rules: {
          number_one_dethroned:
            dethroneApplied,

          dethrone_ceiling:
            dethroneCeiling,

          player1_provisional_penalty:
            player1SpecialPenalty,

          player2_provisional_penalty:
            player2SpecialPenalty,
        },

        rotation_unlocked:
          true,
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // sin acción
      }

      next(error);
    } finally {
      client.release();
    }
  };