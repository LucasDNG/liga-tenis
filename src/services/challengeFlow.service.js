import {
  MAX_ACTIVE_CHALLENGE_TARGETS,
  validateChallengeSportEligibility,
} from "./challengeEligibility.service.js";

import {
  assertChallengePlayersBelongToCompetition,
  createCompetitionChallenge,
  getActiveCompetitionChallengeBetween,
  getCompetitionRejectionCooldown,
  getHistoricalCompetitionMeetings,
} from "./challengeCompetition.service.js";

import {
  getCompetitionRotationMinimumMeetings,
  hasOlderPendingCompetitionRivals,
} from "./challengeRotation.service.js";


export class ChallengeFlowError extends Error {
  constructor(
    message,
    reason = "challenge_flow_error",
    details = null,
    statusCode = 400,
  ) {
    super(message);

    this.name =
      "ChallengeFlowError";

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
    typeof client.query !== "function"
  ) {
    throw new ChallengeFlowError(
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
    throw new ChallengeFlowError(
      `${field} debe ser un entero positivo.`,
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


export const prepareCompetitionChallenge =
  async (
    client,
    {
      competitionId,
      challengerId,
      challengedId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengerId =
      positiveInteger(
        challengerId,
        "challengerId",
      );

    const normalizedChallengedId =
      positiveInteger(
        challengedId,
        "challengedId",
      );

    if (
      normalizedChallengerId ===
      normalizedChallengedId
    ) {
      throw new ChallengeFlowError(
        "No podés desafiarte a vos mismo.",
        "self",
        null,
        400,
      );
    }

    const {
      competition,
      challenger,
      challenged,
    } =
      await assertChallengePlayersBelongToCompetition(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          challengerId:
            normalizedChallengerId,

          challengedId:
            normalizedChallengedId,
        },
      );

    /*
      El desafío actual de LA RED es individual.
      Por eso la creación desde este flujo corresponde
      a singles.

      Dobles va a usar equipos/lados y no debemos
      disfrazarlo como challenger_id/challenged_id.
    */

    if (
      competition.format !==
        "singles" ||
      Number(
        competition.team_size,
      ) !== 1
    ) {
      throw new ChallengeFlowError(
        "Los desafíos individuales corresponden a singles. Dobles utilizará desafíos por equipo.",
        "singles_challenge_required",
        {
          competition_id:
            normalizedCompetitionId,

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

    const eligibility =
      await validateChallengeSportEligibility(
        client,
        challenger,
        challenged,
        normalizedCompetitionId,
      );

    if (
      !eligibility.allowed
    ) {
      throw new ChallengeFlowError(
        eligibility.message,
        eligibility.reason,
        {
          competition_id:
            normalizedCompetitionId,

          challenger_competitive_position:
            eligibility
              .challengerCompetitivePosition ??
            null,

          challenged_competitive_position:
            eligibility
              .challengedCompetitivePosition ??
            null,

          challenged_active:
            eligibility
              .challengedActive ??
            null,

          challenged_inactive:
            eligibility
              .challengedInactive ??
            null,

          active_target_limit:
            MAX_ACTIVE_CHALLENGE_TARGETS,
        },
        400,
      );
    }

    const historicalMeetings =
      await getHistoricalCompetitionMeetings(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          player1Id:
            normalizedChallengerId,

          player2Id:
            normalizedChallengedId,
        },
      );

    const minimumMeetings =
      await getCompetitionRotationMinimumMeetings(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          challenger,
        },
      );

    if (
      minimumMeetings !== null &&
      historicalMeetings >
        minimumMeetings
    ) {
      throw new ChallengeFlowError(
        "Antes tenés que jugar con rivales de tu rueda a los que enfrentaste menos veces.",
        "opponent_rotation",
        {
          competition_id:
            normalizedCompetitionId,

          historical_meetings:
            historicalMeetings,

          minimum_meetings:
            minimumMeetings,
        },
        409,
      );
    }

    const cooldown =
      await getCompetitionRejectionCooldown(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          challengerId:
            normalizedChallengerId,

          challengedId:
            normalizedChallengedId,
        },
      );

    if (cooldown) {
      throw new ChallengeFlowError(
        "Este jugador rechazó tu último desafío. Tenés que esperar 7 días para volver a desafiarlo.",
        "rejection_cooldown",
        {
          competition_id:
            normalizedCompetitionId,

          available_at:
            cooldown.available_at,

          cooldown_days: 7,
        },
        429,
      );
    }

    const active =
      await getActiveCompetitionChallengeBetween(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          player1Id:
            normalizedChallengerId,

          player2Id:
            normalizedChallengedId,
        },
      );

    if (active) {
      throw new ChallengeFlowError(
        "Ya existe un desafío o partido activo entre ustedes en esta competición.",
        "active_challenge",
        {
          competition_id:
            normalizedCompetitionId,

          challenge_id:
            Number(
              active.id,
            ),

          challenge_status:
            active.status,
        },
        409,
      );
    }

    const mustWaitForOthers =
      await hasOlderPendingCompetitionRivals(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          challengerId:
            normalizedChallengerId,

          challengedId:
            normalizedChallengedId,
        },
      );

    if (
      mustWaitForOthers
    ) {
      throw new ChallengeFlowError(
        "Este jugador todavía tiene otros rivales anteriores esperando en su rueda.",
        "rotation_wait",
        {
          competition_id:
            normalizedCompetitionId,
        },
        409,
      );
    }

    return {
      competition,
      challenger,
      challenged,
      eligibility,
      historicalMeetings,
      minimumMeetings,
    };
  };


export const executeCompetitionChallenge =
  async (
    client,
    {
      competitionId,
      challengerId,
      challengedId,
    },
  ) => {
    const prepared =
      await prepareCompetitionChallenge(
        client,
        {
          competitionId,
          challengerId,
          challengedId,
        },
      );

    const challenge =
      await createCompetitionChallenge(
        client,
        {
          competitionId:
            prepared
              .competition.id,

          challengerId:
            prepared
              .challenger.id,

          challengedId:
            prepared
              .challenged.id,

          historicalMeetings:
            prepared
              .historicalMeetings,
        },
      );

    return {
      ...prepared,
      challenge,
    };
  };