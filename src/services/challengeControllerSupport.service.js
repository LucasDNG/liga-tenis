import {
  getCompetitionById,
  resolveCompetitionForPlayer,
} from "./competition.service.js";

import {
  getChallengeWithCompetition,
} from "./challengeCompetition.service.js";


export class ChallengeControllerSupportError extends Error {
  constructor(
    message,
    reason = "challenge_controller_support_error",
    details = null,
    statusCode = 400,
  ) {
    super(message);

    this.name =
      "ChallengeControllerSupportError";

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
    throw new ChallengeControllerSupportError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
      null,
      500,
    );
  }
};


export const parsePositiveId = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new ChallengeControllerSupportError(
      `${field} inválido.`,
      "invalid_identifier",
      {
        field,
        value,
      },
      400,
    );
  }

  return number;
};


export const resolveSinglesCompetitionForChallenge =
  async (
    client,
    {
      userId,
      requestedCompetitionId = null,
    },
  ) => {
    assertClient(client);

    const normalizedUserId =
      parsePositiveId(
        userId,
        "userId",
      );

    /*
      Compatibilidad con el frontend actual:

      si todavía no envía competition_id,
      resolvemos la competición de singles
      por ciudad + género del jugador.

      Cuando el frontend ya tenga selector,
      puede enviar competition_id explícitamente.
    */

    if (
      requestedCompetitionId !==
        null &&
      requestedCompetitionId !==
        undefined &&
      requestedCompetitionId !==
        ""
    ) {
      const competitionId =
        parsePositiveId(
          requestedCompetitionId,
          "competitionId",
        );

      const competition =
        await getCompetitionById(
          client,
          competitionId,
          {
            activeOnly: true,
          },
        );

      if (!competition) {
        throw new ChallengeControllerSupportError(
          "La competición no existe o está inactiva.",
          "competition_not_found",
          {
            competition_id:
              competitionId,
          },
          404,
        );
      }

      if (
        competition.format !==
          "singles" ||
        Number(
          competition.team_size,
        ) !== 1
      ) {
        throw new ChallengeControllerSupportError(
          "Este flujo de desafíos corresponde a singles.",
          "singles_challenge_required",
          {
            competition_id:
              competitionId,

            format:
              competition.format,

            team_size:
              Number(
                competition.team_size,
              ),
          },
          400,
        );
      }

      return competition;
    }

    const competition =
      await resolveCompetitionForPlayer(
        client,
        {
          userId:
            normalizedUserId,

          format:
            "singles",

          activeOnly: true,
        },
      );

    if (!competition) {
      throw new ChallengeControllerSupportError(
        "No encontramos una competición de singles activa para tu ciudad y género.",
        "competition_not_found",
        {
          user_id:
            normalizedUserId,

          format:
            "singles",
        },
        404,
      );
    }

    return competition;
  };


export const getOwnedPendingChallenge =
  async (
    client,
    {
      challengeId,
      userId,
      forUpdate = false,
    },
  ) => {
    assertClient(client);

    const normalizedChallengeId =
      parsePositiveId(
        challengeId,
        "challengeId",
      );

    const normalizedUserId =
      parsePositiveId(
        userId,
        "userId",
      );

    const challenge =
      await getChallengeWithCompetition(
        client,
        normalizedChallengeId,
        {
          forUpdate,
        },
      );

    if (!challenge) {
      throw new ChallengeControllerSupportError(
        "Desafío no encontrado.",
        "challenge_not_found",
        {
          challenge_id:
            normalizedChallengeId,
        },
        404,
      );
    }

    if (
      Number(
        challenge.challenger_id,
      ) !==
        normalizedUserId &&
      Number(
        challenge.challenged_id,
      ) !==
        normalizedUserId
    ) {
      throw new ChallengeControllerSupportError(
        "No pertenecés a este desafío.",
        "challenge_forbidden",
        {
          challenge_id:
            normalizedChallengeId,
        },
        403,
      );
    }

    if (
      challenge.status !==
      "pending"
    ) {
      throw new ChallengeControllerSupportError(
        "El desafío ya no está pendiente.",
        "challenge_not_pending",
        {
          challenge_id:
            normalizedChallengeId,

          status:
            challenge.status,
        },
        409,
      );
    }

    return challenge;
  };


export const validateChallengeSchedule =
  ({
    venue,
    scheduledAt,
  }) => {
    const cleanVenue =
      String(
        venue ?? "",
      ).trim();

    if (
      cleanVenue.length < 3 ||
      cleanVenue.length > 160
    ) {
      throw new ChallengeControllerSupportError(
        "Ingresá un lugar válido para jugar.",
        "invalid_venue",
      );
    }

    const date =
      new Date(
        scheduledAt,
      );

    if (
      !scheduledAt ||
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new ChallengeControllerSupportError(
        "Ingresá una fecha y hora válidas.",
        "invalid_schedule",
      );
    }

    if (
      date.getTime() <=
      Date.now()
    ) {
      throw new ChallengeControllerSupportError(
        "El partido debe programarse para una fecha futura.",
        "schedule_in_past",
      );
    }

    return {
      venue:
        cleanVenue,

      scheduled_at:
        date.toISOString(),
    };
  };


export const serializeCompetition =
  (
    competition,
  ) => ({
    id:
      Number(
        competition.id,
      ),

    format:
      competition.format,

    gender:
      competition.gender ??
      competition.competition_gender,

    city:
      competition.city ??
      competition.competition_city,

    name:
      competition.name ??
      competition.competition_name,

    team_size:
      Number(
        competition.team_size,
      ),

    placement_matches:
      Number(
        competition.placement_matches,
      ),
  });


export const sendControllerError =
  (
    error,
    res,
    next,
  ) => {
    if (
      error &&
      Number.isInteger(
        error.statusCode,
      )
    ) {
      return res
        .status(
          error.statusCode,
        )
        .json({
          message:
            error.message,

          reason:
            error.reason ??
            "request_error",

          ...(error.details &&
          typeof error.details ===
            "object"
            ? error.details
            : {}),
        });
    }

    return next(error);
  };