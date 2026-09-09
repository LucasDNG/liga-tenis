import {
  pool,
} from "../db.js";

import {
  CHALLENGE_REJECTION_PENALTY,
} from "../services/eloMatch.service.js";

import {
  MAX_ACTIVE_CHALLENGE_TARGETS,
} from "../services/challengeEligibility.service.js";

import {
  executeCompetitionChallenge,
  ChallengeFlowError,
} from "../services/challengeFlow.service.js";

import {
  getChallengeWithCompetition,
  getChallengeCompetitionPlayer,
  assertChallengePlayersBelongToCompetition,
  createSinglesMatchFromChallenge,
  ChallengeCompetitionError,
} from "../services/challengeCompetition.service.js";

import {
  getCompetitionRotationState,
} from "../services/challengeRotation.service.js";

import {
  applyCompetitionChallengeRejection,
  ChallengeRejectionError,
} from "../services/challengeRejection.service.js";

import {
  ChallengeControllerSupportError,
  parsePositiveId,
  resolveSinglesCompetitionForChallenge,
  getOwnedPendingChallenge,
  validateChallengeSchedule,
  serializeCompetition,
  sendControllerError,
} from "../services/challengeControllerSupport.service.js";


const REJECTION_COOLDOWN_DAYS =
  7;


/*
  ============================================================
  HELPERS
  ============================================================
*/


const rollback = async (
  client,
) => {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // La conexión se libera después.
  }
};


const getRequestCompetitionId = (
  req,
) =>
  req.body?.competition_id ??
  req.query?.competition_id ??
  null;


const getChallengeCompetitionMetadata = (
  row,
) => ({
  id:
    Number(
      row.competition_id,
    ),

  format:
    row.competition_format ??
    row.format ??
    null,

  gender:
    row.competition_gender ??
    null,

  city:
    row.competition_city ??
    null,

  name:
    row.competition_name ??
    null,

  team_size:
    Number(
      row.competition_team_size ??
      row.team_size ??
      1,
    ),

  placement_matches:
    Number(
      row.competition_placement_matches ??
      row.placement_matches ??
      5,
    ),
});


const auditEvent = async (
  client,
  {
    userId,
    challengeId,
    eventType,
    details = {},
  },
) => {
  await client.query(
    `
    INSERT INTO audit_events (
      user_id,
      challenge_id,
      event_type,
      details
    )

    VALUES (
      $1,
      $2,
      $3,
      $4
    )
    `,
    [
      userId,
      challengeId,
      eventType,
      JSON.stringify(
        details,
      ),
    ],
  );
};


const getVerifiedCompetitionPlayer =
  async (
    client,
    {
      userId,
      competitionId,
      forUpdate = false,
    },
  ) => {
    const player =
      await getChallengeCompetitionPlayer(
        client,
        {
          userId,
          competitionId,
          forUpdate,
        },
      );

    if (!player) {
      throw new ChallengeControllerSupportError(
        "Jugador no encontrado en esta competición.",
        "player_not_in_competition",
        {
          user_id:
            Number(userId),

          competition_id:
            Number(
              competitionId,
            ),
        },
        404,
      );
    }

    if (
      player.role !==
      "player"
    ) {
      throw new ChallengeControllerSupportError(
        "El usuario no está habilitado como jugador.",
        "invalid_player_role",
        null,
        403,
      );
    }

    if (
      player.verification_status !==
      "verified"
    ) {
      throw new ChallengeControllerSupportError(
        "Tu identidad debe estar verificada para competir.",
        "not_verified",
        null,
        403,
      );
    }

    return player;
  };


const getCompetitionRotation =
  async (
    client,
    {
      userId,
      competitionId,
    },
  ) =>
    getCompetitionRotationState(
      client,
      {
        userId,
        competitionId,
      },
    );


const assertCurrentIncomingChallenge =
  (
    rotation,
    challengeId,
  ) => {
    if (
      rotation
        .blockedByActiveMatch
    ) {
      throw new ChallengeControllerSupportError(
        `Primero tenés que jugar el partido ya confirmado contra ${
          rotation
            .activeChallenge
            ?.challenger_name ??
          "tu rival"
        }.`,
        "active_match",
        {
          active_challenge_id:
            rotation
              .activeChallenge
              ?.challenge_id ??
            null,
        },
        409,
      );
    }

    if (
      !rotation
        .currentChallenge
    ) {
      throw new ChallengeControllerSupportError(
        "No tenés desafíos pendientes para resolver en esta competición.",
        "no_pending_challenges",
        null,
        404,
      );
    }

    if (
      Number(
        challengeId,
      ) !==
      Number(
        rotation
          .currentChallenge
          .id,
      )
    ) {
      throw new ChallengeControllerSupportError(
        `Antes tenés que resolver el desafío de ${
          rotation
            .currentChallenge
            .challenger_name
        }.`,
        "rotation_blocked",
        {
          current_challenge_id:
            Number(
              rotation
                .currentChallenge
                .id,
            ),

          current_opponent:
            rotation
              .currentChallenge
              .challenger_name,
        },
        409,
      );
    }
  };


const loadChallengeForReceiver =
  async (
    client,
    {
      challengeId,
      challengedId,
      forUpdate = true,
    },
  ) => {
    const challenge =
      await getChallengeWithCompetition(
        client,
        challengeId,
        {
          forUpdate,
        },
      );

    if (!challenge) {
      throw new ChallengeControllerSupportError(
        "Desafío no encontrado.",
        "challenge_not_found",
        null,
        404,
      );
    }

    if (
      Number(
        challenge
          .challenged_id,
      ) !==
      Number(
        challengedId,
      )
    ) {
      throw new ChallengeControllerSupportError(
        "No podés resolver este desafío.",
        "challenge_forbidden",
        null,
        403,
      );
    }

    if (
      challenge.status !==
      "pending"
    ) {
      throw new ChallengeControllerSupportError(
        "El desafío ya fue resuelto.",
        "challenge_already_resolved",
        {
          status:
            challenge.status,
        },
        409,
      );
    }

    return challenge;
  };


/*
  ============================================================
  CREAR DESAFÍO
  ============================================================

  Compatibilidad:

  - frontend nuevo:
      competition_id + challenged_id

  - frontend anterior:
      challenged_id

    En ese caso resolvemos automáticamente
    singles por ciudad + género del challenger.

  IMPORTANTE:

  Este endpoint continúa siendo individual.
  Por lo tanto solamente crea desafíos de singles.

  Dobles tendrá flujo por lados/equipos.
  ============================================================
*/


export const createChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const challengerId =
        parsePositiveId(
          req.userId,
          "userId",
        );

      const challengedId =
        parsePositiveId(
          req.body
            ?.challenged_id,
          "challengedId",
        );

      if (
        challengerId ===
        challengedId
      ) {
        return res
          .status(400)
          .json({
            message:
              "No podés desafiarte a vos mismo.",

            reason:
              "self",
          });
      }

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const competition =
        await resolveSinglesCompetitionForChallenge(
          client,
          {
            userId:
              challengerId,

            requestedCompetitionId:
              getRequestCompetitionId(
                req,
              ),
          },
        );

      const result =
        await executeCompetitionChallenge(
          client,
          {
            competitionId:
              competition.id,

            challengerId,

            challengedId,
          },
        );

      await auditEvent(
        client,
        {
          userId:
            challengerId,

          challengeId:
            result.challenge.id,

          eventType:
            "challenge_created",

          details: {
            competition_id:
              Number(
                competition.id,
              ),

            format:
              competition.format,

            gender:
              competition.gender,

            city:
              competition.city,

            challenged_id:
              challengedId,

            challenger_provisional:
              Boolean(
                result
                  .challenger
                  .provisional,
              ),

            challenged_provisional:
              Boolean(
                result
                  .challenged
                  .provisional,
              ),

            challenger_competitive_position:
              result
                .eligibility
                ?.challengerCompetitivePosition ??
              null,

            challenged_competitive_position:
              result
                .eligibility
                ?.challengedCompetitivePosition ??
              null,

            challenger_virtual_position:
              result
                .eligibility
                ?.challengerVirtualPosition ??
              null,

            challenged_virtual_position:
              result
                .eligibility
                ?.challengedVirtualPosition ??
              null,

            challenged_active:
              result
                .eligibility
                ?.challengedActive ??
              null,

            challenged_inactive:
              result
                .eligibility
                ?.challengedInactive ??
              null,

            counts_as_active_target:
              result
                .eligibility
                ?.countsAsActiveTarget ??
              false,

            inactive_in_path:
              result
                .eligibility
                ?.inactiveInPath ??
              false,

            provisional_vs_provisional:
              result
                .eligibility
                ?.provisionalVsProvisional ??
              false,

            active_targets_found:
              result
                .eligibility
                ?.activeTargetsFound ??
              null,

            active_target_limit:
              MAX_ACTIVE_CHALLENGE_TARGETS,

            cutoff_competitive_position:
              result
                .eligibility
                ?.cutoffCompetitivePosition ??
              null,

            historical_meetings:
              result
                .historicalMeetings,

            rotation_minimum_meetings:
              result
                .minimumMeetings,

            placement_matches:
              Number(
                competition
                  .placement_matches,
              ),
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      return res
        .status(201)
        .json({
          message:
            "Desafío enviado. Ahora pueden coordinar por WhatsApp el lugar y horario.",

          challenge:
            result.challenge,

          competition:
            serializeCompetition(
              competition,
            ),

          eligibility: {
            challenged_active:
              result
                .eligibility
                ?.challengedActive ??
              null,

            challenged_inactive:
              result
                .eligibility
                ?.challengedInactive ??
              null,

            counts_as_active_target:
              result
                .eligibility
                ?.countsAsActiveTarget ??
              false,

            inactive_in_path:
              result
                .eligibility
                ?.inactiveInPath ??
              false,

            active_target_limit:
              MAX_ACTIVE_CHALLENGE_TARGETS,
          },

          contact: {
            challenger: {
              name:
                result
                  .challenger
                  .name,

              phone:
                result
                  .challenger
                  .phone,
            },

            challenged: {
              name:
                result
                  .challenged
                  .name,

              phone:
                result
                  .challenged
                  .phone,
            },
          },
        });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollback(
          client,
        );
      }

      if (
        error instanceof
          ChallengeFlowError ||
        error instanceof
          ChallengeCompetitionError ||
        error instanceof
          ChallengeControllerSupportError
      ) {
        return sendControllerError(
          error,
          res,
          next,
        );
      }

      return next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  MIS DESAFÍOS
  ============================================================

  Devuelve todos los desafíos del usuario.

  Cada fila trae:
  - competition_id
  - formato
  - género
  - ciudad
  - estadísticas por competición
  - provisional por competición

  rotation:

  si se pide competition_id,
  devuelve la rueda de esa competición.

  Si no se pide,
  usa singles del usuario para conservar
  compatibilidad con el frontend actual.
  ============================================================
*/


export const getMyChallenges =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const userId =
        parsePositiveId(
          req.userId,
          "userId",
        );

      const requestedCompetitionId =
        req.query
          ?.competition_id ??
        null;

      const rotationCompetition =
        await resolveSinglesCompetitionForChallenge(
          client,
          {
            userId,

            requestedCompetitionId,
          },
        );

      const result =
        await client.query(
          `
          SELECT
            ch.*,

            comp.format
              AS competition_format,

            comp.gender
              AS competition_gender,

            comp.city
              AS competition_city,

            comp.name
              AS competition_name,

            comp.team_size
              AS competition_team_size,

            comp.placement_matches
              AS competition_placement_matches,

            u1.name
              AS challenger_name,

            u2.name
              AS challenged_name,

            u1.phone
              AS challenger_phone,

            u2.phone
              AS challenged_phone,

            COALESCE(
              pcs1.rating,
              0
            ) AS challenger_rating,

            COALESCE(
              pcs2.rating,
              0
            ) AS challenged_rating,

            COALESCE(
              pcs1.matches_played,
              0
            ) AS challenger_matches_played,

            COALESCE(
              pcs2.matches_played,
              0
            ) AS challenged_matches_played,

            COALESCE(
              pcs1.matches_played,
              0
            ) < comp.placement_matches
              AS challenger_provisional,

            COALESCE(
              pcs2.matches_played,
              0
            ) < comp.placement_matches
              AS challenged_provisional,

            updater.name
              AS schedule_updated_by_name

          FROM challenges ch

          JOIN competitions comp
            ON comp.id =
              ch.competition_id

          JOIN users u1
            ON u1.id =
              ch.challenger_id

          JOIN users u2
            ON u2.id =
              ch.challenged_id

          LEFT JOIN player_competition_stats pcs1
            ON pcs1.user_id =
              ch.challenger_id

            AND pcs1.competition_id =
              ch.competition_id

          LEFT JOIN player_competition_stats pcs2
            ON pcs2.user_id =
              ch.challenged_id

            AND pcs2.competition_id =
              ch.competition_id

          LEFT JOIN users updater
            ON updater.id =
              ch.schedule_updated_by

          WHERE
            (
              ch.challenger_id = $1
              OR
              ch.challenged_id = $1
            )

          ORDER BY
            ch.created_at DESC,
            ch.id DESC
          `,
          [
            userId,
          ],
        );

      const rotation =
        await getCompetitionRotation(
          client,
          {
            userId,

            competitionId:
              rotationCompetition.id,
          },
        );

      const currentId =
        rotation
          .currentChallenge
          ?.id ??
        null;

      const challenges =
        result.rows.map(
          (
            challenge,
          ) => {
            const incoming =
              Number(
                challenge
                  .challenged_id,
              ) ===
              userId;

            const sameRotationCompetition =
              Number(
                challenge
                  .competition_id,
              ) ===
              Number(
                rotationCompetition.id,
              );

            let canAccept =
              false;

            let canReject =
              false;

            let rotationMessage =
              null;

            if (
              incoming &&
              sameRotationCompetition &&
              challenge.status ===
                "pending"
            ) {
              if (
                rotation
                  .blockedByActiveMatch
              ) {
                rotationMessage =
                  `Primero tenés que jugar el partido ya confirmado contra ${
                    rotation
                      .activeChallenge
                      ?.challenger_name ??
                    "tu rival"
                  }.`;
              } else if (
                Number(
                  challenge.id,
                ) ===
                Number(
                  currentId,
                )
              ) {
                canAccept =
                  true;

                canReject =
                  true;
              } else if (
                rotation
                  .currentChallenge
              ) {
                rotationMessage =
                  `Antes tenés que resolver el desafío de ${
                    rotation
                      .currentChallenge
                      .challenger_name
                  }.`;
              }
            }

            return {
              ...challenge,

              competition:
                getChallengeCompetitionMetadata(
                  challenge,
                ),

              challenger_rating:
                Number(
                  challenge
                    .challenger_rating,
                ),

              challenged_rating:
                Number(
                  challenge
                    .challenged_rating,
                ),

              challenger_matches_played:
                Number(
                  challenge
                    .challenger_matches_played,
                ),

              challenged_matches_played:
                Number(
                  challenge
                    .challenged_matches_played,
                ),

              challenger_provisional:
                Boolean(
                  challenge
                    .challenger_provisional,
                ),

              challenged_provisional:
                Boolean(
                  challenge
                    .challenged_provisional,
                ),

              can_accept:
                canAccept,

              can_reject:
                canReject,

              rotation_block_message:
                rotationMessage,
            };
          },
        );

      return res.json({
        challenges,

        rotation: {
          competition_id:
            Number(
              rotationCompetition.id,
            ),

          competition:
            serializeCompetition(
              rotationCompetition,
            ),

          blocked_by_active_match:
            Boolean(
              rotation
                .blockedByActiveMatch,
            ),

          current_challenge_id:
            currentId
              ? Number(
                  currentId,
                )
              : null,

          current_opponent:
            rotation
              .currentChallenge
              ?.challenger_name ??
            rotation
              .activeChallenge
              ?.challenger_name ??
            null,

          current_opponent_provisional:
            rotation
              .currentChallenge
              ?.challenger_provisional ??
            null,
        },
      });
    } catch (error) {
      if (
        error instanceof
          ChallengeControllerSupportError ||
        error instanceof
          ChallengeCompetitionError
      ) {
        return sendControllerError(
          error,
          res,
          next,
        );
      }

      return next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  PROGRAMAR DESAFÍO
  ============================================================

  Lugar/fecha/hora pueden ser cargados
  por cualquiera de los dos jugadores.

  No cambia competition_id.
  ============================================================
*/


export const scheduleChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        parsePositiveId(
          req.userId,
          "userId",
        );

      const challengeId =
        parsePositiveId(
          req.params.id,
          "challengeId",
        );

      const schedule =
        validateChallengeSchedule({
          venue:
            req.body?.venue,

          scheduledAt:
            req.body
              ?.scheduled_at,
        });

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const challenge =
        await getOwnedPendingChallenge(
          client,
          {
            challengeId,

            userId,

            forUpdate: true,
          },
        );

      if (
        challenge.format !==
          "singles" ||
        Number(
          challenge.team_size,
        ) !== 1
      ) {
        throw new ChallengeControllerSupportError(
          "Este flujo de coordinación corresponde a singles.",
          "singles_challenge_required",
          {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),
          },
          400,
        );
      }

      const updated =
        await client.query(
          `
          UPDATE challenges

          SET
            venue = $1,

            scheduled_at = $2,

            schedule_updated_by = $3

          WHERE
            id = $4

            AND competition_id = $5

            AND status =
              'pending'

          RETURNING *
          `,
          [
            schedule.venue,

            schedule
              .scheduled_at,

            userId,

            challengeId,

            challenge
              .competition_id,
          ],
        );

      if (
        updated.rowCount === 0
      ) {
        throw new ChallengeControllerSupportError(
          "El desafío cambió de estado antes de guardar la programación.",
          "challenge_state_changed",
          null,
          409,
        );
      }

      await auditEvent(
        client,
        {
          userId,

          challengeId,

          eventType:
            "challenge_scheduled",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            venue:
              schedule.venue,

            scheduled_at:
              schedule
                .scheduled_at,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      return res.json({
        message:
          "Lugar, fecha y hora guardados correctamente.",

        challenge:
          updated.rows[0],

        competition: {
          id:
            Number(
              challenge
                .competition_id,
            ),

          format:
            challenge.format,

          gender:
            challenge
              .competition_gender,

          city:
            challenge
              .competition_city,

          name:
            challenge
              .competition_name,

          team_size:
            Number(
              challenge
                .team_size,
            ),

          placement_matches:
            Number(
              challenge
                .placement_matches,
            ),
        },
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollback(
          client,
        );
      }

      if (
        error instanceof
          ChallengeControllerSupportError ||
        error instanceof
          ChallengeCompetitionError
      ) {
        return sendControllerError(
          error,
          res,
          next,
        );
      }

      return next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  ACEPTAR DESAFÍO
  ============================================================

  Reglas preservadas:

  - solamente challenged_id acepta;
  - debe ser el desafío actual de la rueda;
  - un accepted anterior bloquea;
  - lugar/fecha/hora obligatorios;
  - fecha futura;
  - no se revalida actividad competitiva;
  - sí se valida que ambos sigan perteneciendo
    a la competición y estén verificados.

  Nuevo:

  - match.competition_id
  - match_participants
  ============================================================
*/


export const acceptChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        parsePositiveId(
          req.userId,
          "userId",
        );

      const challengeId =
        parsePositiveId(
          req.params.id,
          "challengeId",
        );

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      /*
        Cargamos primero el challenge
        para conocer competition_id.
      */

      const challenge =
        await loadChallengeForReceiver(
          client,
          {
            challengeId,

            challengedId:
              userId,

            forUpdate: true,
          },
        );

      if (
        challenge.format !==
          "singles" ||
        Number(
          challenge.team_size,
        ) !== 1
      ) {
        throw new ChallengeControllerSupportError(
          "Este flujo de aceptación corresponde a singles.",
          "singles_challenge_required",
          {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),
          },
          400,
        );
      }

      await getVerifiedCompetitionPlayer(
        client,
        {
          userId,

          competitionId:
            challenge
              .competition_id,

          forUpdate: true,
        },
      );

      const rotation =
        await getCompetitionRotation(
          client,
          {
            userId,

            competitionId:
              challenge
                .competition_id,
          },
        );

      assertCurrentIncomingChallenge(
        rotation,
        challengeId,
      );

      if (
        !challenge.venue ||
        !challenge
          .scheduled_at
      ) {
        throw new ChallengeControllerSupportError(
          "Antes de aceptar tienen que cargar el lugar, la fecha y la hora del partido.",
          "schedule_required",
          null,
          400,
        );
      }

      const scheduledTime =
        new Date(
          challenge
            .scheduled_at,
        ).getTime();

      if (
        Number.isNaN(
          scheduledTime,
        ) ||
        scheduledTime <=
          Date.now()
      ) {
        throw new ChallengeControllerSupportError(
          "El horario cargado ya pasó. Actualicen el turno antes de aceptar.",
          "schedule_expired",
          null,
          400,
        );
      }

      const players =
        await assertChallengePlayersBelongToCompetition(
          client,
          {
            competitionId:
              challenge
                .competition_id,

            challengerId:
              challenge
                .challenger_id,

            challengedId:
              challenge
                .challenged_id,
          },
        );

      if (
        players
          .competition
          .format !==
          "singles" ||
        Number(
          players
            .competition
            .team_size,
        ) !== 1
      ) {
        throw new ChallengeControllerSupportError(
          "Los desafíos individuales solamente pueden generar partidos de singles.",
          "singles_challenge_required",
          null,
          400,
        );
      }

      const existingMatch =
        await client.query(
          `
          SELECT
            id

          FROM matches

          WHERE
            challenge_id = $1

            AND competition_id = $2

            AND annulled_at
              IS NULL

          LIMIT 1
          `,
          [
            challengeId,

            challenge
              .competition_id,
          ],
        );

      if (
        existingMatch.rowCount >
        0
      ) {
        throw new ChallengeControllerSupportError(
          "Este desafío ya tiene un partido asociado.",
          "match_already_exists",
          {
            match_id:
              Number(
                existingMatch
                  .rows[0]
                  .id,
              ),
          },
          409,
        );
      }

      /*
        createSinglesMatchFromChallenge
        es el adaptador de compatibilidad:

        - mantiene player1_id/player2_id
        - agrega competition_id
        - crea match_participants
      */

      const match =
        await createSinglesMatchFromChallenge(
          client,
          challenge,
        );

      const updatedChallenge =
        await client.query(
          `
          UPDATE challenges

          SET
            status =
              'accepted',

            accepted_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $1

            AND competition_id = $2

            AND status =
              'pending'

          RETURNING *
          `,
          [
            challengeId,

            challenge
              .competition_id,
          ],
        );

      if (
        updatedChallenge.rowCount ===
        0
      ) {
        throw new ChallengeControllerSupportError(
          "El desafío cambió de estado antes de poder aceptarlo.",
          "challenge_state_changed",
          null,
          409,
        );
      }

      await auditEvent(
        client,
        {
          userId,

          challengeId,

          eventType:
            "challenge_accepted",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            match_id:
              Number(
                match.id,
              ),

            challenger_id:
              Number(
                challenge
                  .challenger_id,
              ),

            challenged_id:
              Number(
                challenge
                  .challenged_id,
              ),

            venue:
              challenge.venue,

            scheduled_at:
              challenge
                .scheduled_at,
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      return res.json({
        message:
          "Desafío aceptado. El partido quedó confirmado.",

        challenge:
          updatedChallenge
            .rows[0],

        match,

        competition:
          serializeCompetition(
            players
              .competition,
          ),
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollback(
          client,
        );
      }

      if (
        error instanceof
          ChallengeControllerSupportError ||
        error instanceof
          ChallengeCompetitionError
      ) {
        return sendControllerError(
          error,
          res,
          next,
        );
      }

      return next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  RECHAZAR DESAFÍO
  ============================================================

  Regla:

  - solamente challenged_id;
  - solamente desafío actual de la rueda;
  - -8 Elo configurado por motor central;
  - floor preservado por eloMatch.service;
  - cooldown 7 días;
  - Elo se modifica SOLO en la competición;
  - users.rating ya NO es autoridad aquí;
  - elo_event incluye competition_id.
  ============================================================
*/


export const rejectChallenge =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

    try {
      const userId =
        parsePositiveId(
          req.userId,
          "userId",
        );

      const challengeId =
        parsePositiveId(
          req.params.id,
          "challengeId",
        );

      await client.query(
        "BEGIN",
      );

      transactionStarted =
        true;

      const challenge =
        await loadChallengeForReceiver(
          client,
          {
            challengeId,

            challengedId:
              userId,

            forUpdate: true,
          },
        );

      if (
        challenge.format !==
          "singles" ||
        Number(
          challenge.team_size,
        ) !== 1
      ) {
        throw new ChallengeControllerSupportError(
          "Este flujo de rechazo corresponde a singles.",
          "singles_challenge_required",
          {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),
          },
          400,
        );
      }

      const currentPlayer =
        await getVerifiedCompetitionPlayer(
          client,
          {
            userId,

            competitionId:
              challenge
                .competition_id,

            forUpdate: true,
          },
        );

      const rotation =
        await getCompetitionRotation(
          client,
          {
            userId,

            competitionId:
              challenge
                .competition_id,
          },
        );

      assertCurrentIncomingChallenge(
        rotation,
        challengeId,
      );

      const rejection =
        await applyCompetitionChallengeRejection(
          client,
          {
            challengeId,

            competitionId:
              challenge
                .competition_id,

            challengedId:
              userId,
          },
        );

      const updatedChallenge =
        await client.query(
          `
          UPDATE challenges

          SET
            status =
              'rejected',

            rejected_at =
              CURRENT_TIMESTAMP,

            resolved_at =
              CURRENT_TIMESTAMP,

            rejection_elo_penalty =
              $1

          WHERE
            id = $2

            AND competition_id = $3

            AND challenged_id = $4

            AND status =
              'pending'

          RETURNING *
          `,
          [
            rejection
              .effective_penalty,

            challengeId,

            challenge
              .competition_id,

            userId,
          ],
        );

      if (
        updatedChallenge.rowCount ===
        0
      ) {
        throw new ChallengeControllerSupportError(
          "El desafío ya fue resuelto.",
          "challenge_already_resolved",
          null,
          409,
        );
      }

      /*
        Ahora elo_events ya tiene competition_id.
      */

      await client.query(
        `
        INSERT INTO elo_events (
          user_id,
          challenge_id,
          competition_id,
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
          'challenge_rejection',
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          userId,

          challengeId,

          challenge
            .competition_id,

          rejection
            .elo_before,

          rejection
            .elo_change,

          rejection
            .elo_after,

          `Penalización por rechazar un desafío: -${rejection.effective_penalty} Elo`,
        ],
      );

      await auditEvent(
        client,
        {
          userId,

          challengeId,

          eventType:
            "challenge_rejected",

          details: {
            competition_id:
              Number(
                challenge
                  .competition_id,
              ),

            elo_before:
              rejection
                .elo_before,

            elo_penalty:
              rejection
                .effective_penalty,

            elo_after:
              rejection
                .elo_after,

            provisional:
              rejection
                .provisional,

            configured_penalty:
              CHALLENGE_REJECTION_PENALTY,

            cooldown_days:
              REJECTION_COOLDOWN_DAYS,

            matches_played:
              Number(
                currentPlayer
                  .matches_played,
              ),
          },
        },
      );

      await client.query(
        "COMMIT",
      );

      transactionStarted =
        false;

      return res.json({
        message:
          rejection
            .effective_penalty >
          0
            ? `Desafío rechazado. Se descontaron ${rejection.effective_penalty} puntos Elo.`
            : "Desafío rechazado. Tu Elo ya estaba en el mínimo permitido.",

        competition_id:
          Number(
            challenge
              .competition_id,
          ),

        elo_change:
          rejection
            .elo_change,

        rating:
          rejection
            .elo_after,

        cooldown_days:
          REJECTION_COOLDOWN_DAYS,

        next_rotation:
          true,
      });
    } catch (error) {
      if (
        transactionStarted
      ) {
        await rollback(
          client,
        );
      }

      if (
        error instanceof
          ChallengeControllerSupportError ||
        error instanceof
          ChallengeCompetitionError ||
        error instanceof
          ChallengeRejectionError
      ) {
        return sendControllerError(
          error,
          res,
          next,
        );
      }

      return next(error);
    } finally {
      client.release();
    }
  };