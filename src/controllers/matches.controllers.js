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
  getOfficialCompetitionRanking,
} from "../services/competitionRanking.service.js";

import {
  getSinglesCompetitionMatchContext,
  resolveSinglesWinnerFromScore,
  sendMatchControllerCompetitionError,
} from "../services/matchControllerCompetition.service.js";

import {
  getCompetitionMatchSettlement,
  settleSinglesCompetitionStats,
} from "../services/competitionMatchSettlement.service.js";


/*
  ============================================================
  LA RED
  PARTIDOS
  ============================================================

  AUTORIDAD DEPORTIVA

  matches
    → estado del partido

  match_participants
    → quién participa
    → lado 1 / lado 2

  competitions
    → modalidad
    → género
    → ciudad

  player_competition_stats
    → Elo
    → partidos
    → victorias / derrotas
    → games

  placement_match_evidence
    → nivelatorios por competición

  competition_match_settlements
    → idempotencia

  elo_events
    → historial Elo por competición

  IMPORTANTE

  Singles:
    cálculo Elo habilitado.

  Dobles:
    estructura de participantes habilitada,
    fórmula Elo todavía NO definida.

  Por lo tanto ningún resultado de dobles se liquida
  competitivamente todavía.
  ============================================================
*/


const TOO_FAST_RESULT_MINUTES =
  40;


/*
  ============================================================
  HELPERS
  ============================================================
*/


const positiveInteger = (
  value,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(
      number,
    ) &&
    number > 0
  )
    ? number
    : null;
};


const rollbackQuietly = async (
  client,
) => {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // sin acción
  }
};


const sendDoublesNotImplemented = (
  res,
  competition,
) =>
  res
    .status(409)
    .json({
      message:
        "El cálculo Elo de dobles todavía no está habilitado.",

      reason:
        "doubles_elo_not_implemented",

      competition: {
        id:
          Number(
            competition.id,
          ),

        format:
          competition.format,

        gender:
          competition.gender,

        city:
          competition.city,

        team_size:
          Number(
            competition.team_size,
          ),
      },
    });


const assertSinglesCompetition = (
  competition,
  res,
) => {
  if (
    competition?.format ===
      "singles" &&
    Number(
      competition
        .team_size,
    ) === 1
  ) {
    return true;
  }

  sendDoublesNotImplemented(
    res,
    competition,
  );

  return false;
};


const getLockedMatchForUser =
  async (
    client,
    {
      matchId,
      userId,
      status,
      excludeSubmitter = false,
    },
  ) => {
    const normalizedMatchId =
      positiveInteger(
        matchId,
      );

    const normalizedUserId =
      positiveInteger(
        userId,
      );

    if (
      !normalizedMatchId ||
      !normalizedUserId
    ) {
      return null;
    }

    const params = [
      normalizedMatchId,
      normalizedUserId,
      status,
    ];

    let submitterCondition =
      "";

    if (
      excludeSubmitter
    ) {
      submitterCondition = `
        AND m.result_submitted_by <> $2
      `;
    }

    const result =
      await client.query(
        `
        SELECT
          m.*,

          c.id
            AS competition_id_resolved,

          c.format
            AS competition_format,

          c.gender
            AS competition_gender,

          c.city
            AS competition_city,

          c.name
            AS competition_name,

          c.team_size
            AS competition_team_size,

          c.placement_matches
            AS competition_placement_matches,

          c.active
            AS competition_active

        FROM matches m

        JOIN competitions c
          ON c.id =
            m.competition_id

        WHERE
          m.id = $1

          AND m.status = $3

          AND m.annulled_at
            IS NULL

          ${submitterCondition}

          AND EXISTS (
            SELECT 1

            FROM match_participants mp

            WHERE
              mp.match_id =
                m.id

              AND mp.user_id =
                $2
          )

        FOR UPDATE OF m
        `,
        params,
      );

    if (
      result.rowCount !== 1
    ) {
      return null;
    }

    const row =
      result.rows[0];

    return {
      ...row,

      competition: {
        id:
          Number(
            row
              .competition_id_resolved,
          ),

        format:
          row
            .competition_format,

        gender:
          row
            .competition_gender,

        city:
          row
            .competition_city,

        name:
          row
            .competition_name,

        team_size:
          Number(
            row
              .competition_team_size,
          ),

        placement_matches:
          Number(
            row
              .competition_placement_matches,
          ),

        active:
          Boolean(
            row
              .competition_active,
          ),
      },
    };
  };


const getSinglesWinnerIdFromSide =
  async (
    client,
    matchId,
    winnerSide,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          user_id

        FROM match_participants

        WHERE
          match_id = $1

          AND side = $2

          AND position = 1

        LIMIT 1
        `,
        [
          matchId,
          winnerSide,
        ],
      );

    if (
      result.rowCount !== 1
    ) {
      return null;
    }

    return Number(
      result.rows[0]
        .user_id,
    );
  };


const serializePlacement = (
  placement,
) => {
  if (
    !placement?.applies
  ) {
    return null;
  }

  return {
    match:
      placement
        .placement_match_number,

    completed:
      Boolean(
        placement
          .completed,
      ),

    wins:
      placement
        .wins,

    losses:
      placement
        .losses,

    percentile:
      placement
        .placement_percentile,

    target_position:
      placement
        .target_position,

    target_elo:
      placement
        .target_elo,
  };
};


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
      const userId =
        positiveInteger(
          req.userId,
        );

      if (!userId) {
        return res
          .status(400)
          .json({
            message:
              "Usuario inválido.",

            reason:
              "invalid_user_id",
          });
      }

      const result =
        await pool.query(
          `
          SELECT
            m.*,

            c.format
              AS competition_format,

            c.gender
              AS competition_gender,

            c.city
              AS competition_city,

            c.name
              AS competition_name,

            c.team_size
              AS competition_team_size,

            side1_user.id
              AS side1_player1_id,

            side1_user.name
              AS side1_player1_name,

            side1_user.phone
              AS side1_player1_phone,

            side2_user.id
              AS side2_player1_id,

            side2_user.name
              AS side2_player1_name,

            side2_user.phone
              AS side2_player1_phone,

            w.name
              AS winner_name,

            confirmer.name
              AS result_confirmed_by_name,

            COALESCE(
              (
                SELECT
                  json_agg(
                    json_build_object(
                      'user_id',
                        participant_user.id,

                      'name',
                        participant_user.name,

                      'first_name',
                        participant_user.first_name,

                      'last_name',
                        participant_user.last_name,

                      'phone',
                        participant_user.phone,

                      'side',
                        participant.side,

                      'position',
                        participant.position
                    )

                    ORDER BY
                      participant.side ASC,
                      participant.position ASC
                  )

                FROM match_participants participant

                JOIN users participant_user
                  ON participant_user.id =
                    participant.user_id

                WHERE
                  participant.match_id =
                    m.id
              ),
              '[]'::json
            )
              AS participants

          FROM matches m

          JOIN competitions c
            ON c.id =
              m.competition_id

          JOIN match_participants mine
            ON mine.match_id =
              m.id

            AND mine.user_id =
              $1

          LEFT JOIN match_participants side1
            ON side1.match_id =
              m.id

            AND side1.side = 1

            AND side1.position = 1

          LEFT JOIN users side1_user
            ON side1_user.id =
              side1.user_id

          LEFT JOIN match_participants side2
            ON side2.match_id =
              m.id

            AND side2.side = 2

            AND side2.position = 1

          LEFT JOIN users side2_user
            ON side2_user.id =
              side2.user_id

          LEFT JOIN users w
            ON w.id =
              m.winner_id

          LEFT JOIN users confirmer
            ON confirmer.id =
              m.result_confirmed_by

          WHERE
            m.annulled_at
              IS NULL

          ORDER BY
            m.created_at DESC,
            m.id DESC
          `,
          [
            userId,
          ],
        );

      /*
        Compatibilidad temporal con el frontend singles.

        La autoridad ya es match_participants,
        pero mantenemos player1_name/player2_name
        mientras el frontend migra a participants.
      */

      const matches =
        result.rows.map(
          (
            match,
          ) => ({
            ...match,

            player1_id:
              Number(
                match
                  .side1_player1_id ??
                match.player1_id,
              ),

            player2_id:
              Number(
                match
                  .side2_player1_id ??
                match.player2_id,
              ),

            player1_name:
              match
                .side1_player1_name,

            player1_phone:
              match
                .side1_player1_phone,

            player2_name:
              match
                .side2_player1_name,

            player2_phone:
              match
                .side2_player1_phone,
          }),
        );

      return res.json({
        matches,
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

      const parsed =
        parseMatchScore(
          req.body?.score,
        );

      if (
        parsed.error
      ) {
        await rollbackQuietly(
          client,
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

      const match =
        await getLockedMatchForUser(
          client,
          {
            matchId:
              req.params.id,

            userId:
              req.userId,

            status:
              "pending",
          },
        );

      if (!match) {
        await rollbackQuietly(
          client,
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

      if (
        !assertSinglesCompetition(
          match.competition,
          res,
        )
      ) {
        await rollbackQuietly(
          client,
        );

        return;
      }

      if (
        !match
          .scheduled_at
      ) {
        await rollbackQuietly(
          client,
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
          match
            .scheduled_at,
        ).getTime();

      if (
        Number.isNaN(
          scheduledTime,
        )
      ) {
        await rollbackQuietly(
          client,
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
        await rollbackQuietly(
          client,
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
        await getSinglesWinnerIdFromSide(
          client,
          match.id,
          parsed.winnerSide,
        );

      if (!winnerId) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudo resolver el ganador desde los participantes del partido.",

            reason:
              "winner_resolution_failed",
          });
      }

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
        updated.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
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
            competition_id:
              Number(
                match
                  .competition
                  .id,
              ),

            winner_id:
              winnerId,

            winner_side:
              parsed
                .winnerSide,

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
      await rollbackQuietly(
        client,
      );

      return sendMatchControllerCompetitionError(
        error,
        res,
        next,
      );
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

      const current =
        await getLockedMatchForUser(
          client,
          {
            matchId:
              req.params.id,

            userId:
              req.userId,

            status:
              "awaiting_confirmation",

            excludeSubmitter:
              true,
          },
        );

      if (!current) {
        await rollbackQuietly(
          client,
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

      if (
        !assertSinglesCompetition(
          current.competition,
          res,
        )
      ) {
        await rollbackQuietly(
          client,
        );

        return;
      }

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
        result.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
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
            competition_id:
              Number(
                current
                  .competition
                  .id,
              ),

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
      await rollbackQuietly(
        client,
      );

      return sendMatchControllerCompetitionError(
        error,
        res,
        next,
      );
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
        ========================================================
        BLOQUEAR PARTIDO
        ========================================================
      */

      const lockedMatch =
        await getLockedMatchForUser(
          client,
          {
            matchId:
              req.params.id,

            userId:
              req.userId,

            status:
              "awaiting_confirmation",

            excludeSubmitter:
              true,
          },
        );

      if (!lockedMatch) {
        await rollbackQuietly(
          client,
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

      if (
        !assertSinglesCompetition(
          lockedMatch.competition,
          res,
        )
      ) {
        await rollbackQuietly(
          client,
        );

        return;
      }

      const competitionId =
        Number(
          lockedMatch
            .competition
            .id,
        );

      /*
        ========================================================
        CONTEXTO SINGLES + STATS POR COMPETICIÓN
        ========================================================
      */

      const context =
        await getSinglesCompetitionMatchContext(
          client,
          {
            matchId:
              lockedMatch.id,

            userId:
              req.userId,

            lockPlayers:
              true,
          },
        );

      const player1 =
        context.player1;

      const player2 =
        context.player2;

      const player1Id =
        Number(
          context
            .player1_id,
        );

      const player2Id =
        Number(
          context
            .player2_id,
        );

      /*
        ========================================================
        REVALIDAR SCORE
        ========================================================
      */

      let proposedScore =
        lockedMatch
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
        await rollbackQuietly(
          client,
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
        resolveSinglesWinnerFromScore(
          context,
          parsed.winnerSide,
        );

      if (
        Number(
          lockedMatch
            .proposed_winner_id,
        ) !==
        expectedWinnerId
      ) {
        await rollbackQuietly(
          client,
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

      const winnerId =
        expectedWinnerId;

      const loserId =
        winnerId ===
        player1Id
          ? player2Id
          : player1Id;

      /*
        ========================================================
        DATOS PRE-PARTIDO POR COMPETICIÓN
        ========================================================
      */

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
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "Los datos deportivos de los jugadores no son válidos para esta competición.",

            reason:
              "invalid_competition_rating_data",
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
        IDEMPOTENCIA PREVIA
        ========================================================
      */

      const existingSettlement =
        await getCompetitionMatchSettlement(
          client,
          lockedMatch.id,
          {
            forUpdate:
              true,
          },
        );

      if (
        existingSettlement
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "Las estadísticas de este partido ya fueron aplicadas.",

            reason:
              "match_already_settled",
          });
      }

      const existingElo =
        await client.query(
          `
          SELECT
            id

          FROM elo_events

          WHERE
            match_id = $1

            AND competition_id =
              $2

            AND event_type =
              'match_result'

          LIMIT 1
          `,
          [
            lockedMatch.id,
            competitionId,
          ],
        );

      if (
        existingElo.rowCount
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(409)
          .json({
            message:
              "Este partido ya tiene movimientos Elo registrados en esta competición.",

            reason:
              "elo_already_applied",
          });
      }

      /*
        ========================================================
        RANKING OFICIAL PRE-PARTIDO
        ========================================================
      */

      const rankingBefore =
        await getOfficialCompetitionRanking(
          client,
          competitionId,
        );

      const player1RankBefore =
        rankingBefore.find(
          (
            row,
          ) =>
            Number(
              row.id,
            ) ===
            player1Id,
        )?.official_position ??
        null;

      const player2RankBefore =
        rankingBefore.find(
          (
            row,
          ) =>
            Number(
              row.id,
            ) ===
            player2Id,
        )?.official_position ??
        null;

      /*
        ========================================================
        PLACEMENT PRE-PARTIDO
        ========================================================
      */

      const placementContext =
        await preparePlacementMatchContext(
          client,
          {
            competitionId,

            player1,

            player2,
          },
        );

      /*
        ========================================================
        REGISTRAR EVIDENCIA NIVELATORIA
        ========================================================
      */

      const placementResult =
        await recordPlacementMatchResult(
          client,
          {
            matchId:
              lockedMatch.id,

            competitionId,

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
        CALCULAR RATING FINAL
        ========================================================
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
        REGLA DESTRONAMIENTO #1
        ========================================================
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
          (
            row,
          ) =>
            Number(
              row
                .official_position,
            ) === 2,
        ) ??
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
        ========================================================
        INVARIANTES
        ========================================================
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
        await rollbackQuietly(
          client,
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
        PLAN DE EVENTOS ELO
        ========================================================

        Se construye ANTES del settlement porque necesita
        los valores pre-partido.

        Se persiste dentro de la misma transacción.
      */

      const eloEventPlan =
        buildMatchEloEvents({
          competitionId,

          matchId:
            lockedMatch.id,

          challengeId:
            lockedMatch
              .challenge_id,

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

            lockedMatch.id,
          ],
        );

      if (
        completedMatch.rowCount !==
        1
      ) {
        await rollbackQuietly(
          client,
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
        ========================================================
        SETTLEMENT DE STATS POR COMPETICIÓN
        ========================================================

        Este reemplaza definitivamente:

          UPDATE users
          SET rating = ...
              matches_played = ...

        users.rating queda solamente como dato legacy durante
        la transición.

        Toda autoridad competitiva nueva vive en
        player_competition_stats.
      */

      const settlement =
        await settleSinglesCompetitionStats(
          client,
          {
            matchId:
              lockedMatch.id,

            winnerId,

            score:
              proposedScore,

            ratingByUserId: {
              [player1Id]:
                player1RatingAfter,

              [player2Id]:
                player2RatingAfter,
            },

            lockedPlayers:
              context.players,
          },
        );

      /*
        ========================================================
        EVENTOS ELO
        ========================================================
      */

      const persistedElo =
        await persistMatchEloEventPlan(
          client,
          eloEventPlan,
        );

      /*
        ========================================================
        CERRAR DESAFÍO
        ========================================================
      */

      if (
        lockedMatch
          .challenge_id
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

              AND competition_id =
                $2

              AND status =
                'accepted'

            RETURNING id
            `,
            [
              lockedMatch
                .challenge_id,

              competitionId,
            ],
          );

        if (
          challenge.rowCount !==
          1
        ) {
          await rollbackQuietly(
            client,
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
          lockedMatch.id,
          lockedMatch
            .challenge_id,

          JSON.stringify({
            competition_id:
              competitionId,

            winner_id:
              winnerId,

            loser_id:
              loserId,

            score:
              proposedScore,

            settlement_id:
              settlement
                .settlement
                ?.id ??
              null,

            elo_events_inserted:
              persistedElo
                .inserted_count,

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
                serializePlacement(
                  player1Placement,
                ),
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
                serializePlacement(
                  player2Placement,
                ),
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
        ========================================================
        ANTIFRAUDE
        ========================================================
      */

      await checkFrequentOpponents(
        client,
        {
          matchId:
            lockedMatch.id,

          player1Id,

          player2Id,
        },
      );

      await checkEloConcentration(
        client,
        {
          matchId:
            lockedMatch.id,

          playerId:
            winnerId,
        },
      );

      /*
        ========================================================
        COMMIT
        ========================================================
      */

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

        competition: {
          id:
            competitionId,

          format:
            lockedMatch
              .competition
              .format,

          gender:
            lockedMatch
              .competition
              .gender,

          city:
            lockedMatch
              .competition
              .city,

          name:
            lockedMatch
              .competition
              .name,
        },

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
            serializePlacement(
              player1Placement,
            ),

          player2:
            serializePlacement(
              player2Placement,
            ),
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

        settlement: {
          id:
            settlement
              .settlement
              ?.id ??
            null,

          competition_id:
            settlement
              .competition_id,

          winning_side:
            settlement
              .winning_side,
        },

        rotation_unlocked:
          true,
      });
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      return sendMatchControllerCompetitionError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };