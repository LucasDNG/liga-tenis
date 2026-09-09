import {
  CHALLENGE_REJECTION_PENALTY,
  calculateChallengeRejectionElo,
} from "./eloMatch.service.js";

import {
  getChallengeCompetitionPlayer,
} from "./challengeCompetition.service.js";


export class ChallengeRejectionError extends Error {
  constructor(
    message,
    reason = "challenge_rejection_error",
    details = null,
    statusCode = 400,
  ) {
    super(message);

    this.name =
      "ChallengeRejectionError";

    this.reason =
      reason;

    this.details =
      details;

    this.statusCode =
      statusCode;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new ChallengeRejectionError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
      null,
      500,
    );
  }
};


const positiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new ChallengeRejectionError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const calculateCompetitionChallengeRejection =
  ({
    rating,
    matchesPlayed,
  }) => {
    const normalizedRating =
      Number(rating);

    const normalizedMatchesPlayed =
      Number(matchesPlayed);

    if (
      !Number.isFinite(
        normalizedRating,
      ) ||
      normalizedRating < 0
    ) {
      throw new ChallengeRejectionError(
        "El Elo de competición es inválido.",
        "invalid_competition_rating",
        {
          rating,
        },
      );
    }

    if (
      !Number.isInteger(
        normalizedMatchesPlayed,
      ) ||
      normalizedMatchesPlayed < 0
    ) {
      throw new ChallengeRejectionError(
        "La cantidad de partidos de competición es inválida.",
        "invalid_competition_matches_played",
        {
          matches_played:
            matchesPlayed,
        },
      );
    }

    return calculateChallengeRejectionElo({
      rating:
        normalizedRating,

      matchesPlayed:
        normalizedMatchesPlayed,
    });
  };


export const getChallengeRejectionPlayer =
  async (
    client,
    {
      userId,
      competitionId,
      forUpdate = true,
    },
  ) => {
    assertClient(client);

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const player =
      await getChallengeCompetitionPlayer(
        client,
        {
          userId:
            normalizedUserId,

          competitionId:
            normalizedCompetitionId,

          forUpdate,
        },
      );

    if (!player) {
      throw new ChallengeRejectionError(
        "El jugador no pertenece a la competición.",
        "player_not_in_competition",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,
        },
        404,
      );
    }

    return player;
  };


export const applyCompetitionChallengeRejection =
  async (
    client,
    {
      challengeId,
      competitionId,
      challengedId,
    },
  ) => {
    assertClient(client);

    const normalizedChallengeId =
      positiveInteger(
        challengeId,
        "challengeId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengedId =
      positiveInteger(
        challengedId,
        "challengedId",
      );

    const player =
      await getChallengeRejectionPlayer(
        client,
        {
          userId:
            normalizedChallengedId,

          competitionId:
            normalizedCompetitionId,

          forUpdate: true,
        },
      );

    const rejection =
      calculateCompetitionChallengeRejection({
        rating:
          player.rating,

        matchesPlayed:
          player.matches_played,
      });

    const beforeRating =
      Number(
        rejection.elo_before,
      );

    const afterRating =
      Number(
        rejection.elo_after,
      );

    const realPenalty =
      Number(
        rejection.effective_penalty,
      );

    const eloChange =
      Number(
        rejection.elo_change,
      );

    const updatedStats =
      await client.query(
        `
        UPDATE player_competition_stats

        SET
          rating = $1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          user_id = $2
          AND competition_id = $3

        RETURNING
          user_id,
          competition_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          updated_at
        `,
        [
          afterRating,
          normalizedChallengedId,
          normalizedCompetitionId,
        ],
      );

    if (
      updatedStats.rowCount === 0
    ) {
      throw new ChallengeRejectionError(
        "No se pudo actualizar el Elo de la competición.",
        "competition_stats_not_found",
        {
          user_id:
            normalizedChallengedId,

          competition_id:
            normalizedCompetitionId,
        },
        500,
      );
    }

    /*
      IMPORTANTE:

      elo_events todavía es una tabla histórica
      compatible con el sistema anterior.

      No escribimos acá un evento sin competition_id,
      porque mezclaría eventos de singles y dobles.

      La migración de elo_events a competition_id
      se hace en el siguiente bloque antes de volver
      a persistir challenge_rejection allí.
    */

    return {
      challenge_id:
        normalizedChallengeId,

      competition_id:
        normalizedCompetitionId,

      user_id:
        normalizedChallengedId,

      elo_before:
        beforeRating,

      elo_change:
        eloChange,

      elo_after:
        afterRating,

      effective_penalty:
        realPenalty,

      configured_penalty:
        CHALLENGE_REJECTION_PENALTY,

      provisional:
        Boolean(
          rejection.provisional,
        ),

      stats:
        updatedStats.rows[0],
    };
  };