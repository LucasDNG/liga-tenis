import {
  getSportEligibleOpponents,
} from "./challengeEligibility.service.js";

import {
  getHistoricalCompetitionMeetings,
} from "./challengeCompetition.service.js";


export class ChallengeRotationError extends Error {
  constructor(
    message,
    reason = "challenge_rotation_error",
    details = null,
  ) {
    super(message);

    this.name =
      "ChallengeRotationError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !== "function"
  ) {
    throw new ChallengeRotationError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
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
    throw new ChallengeRotationError(
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


export const getCompetitionRotationMinimumMeetings =
  async (
    client,
    {
      competitionId,
      challenger,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const challengerId =
      positiveInteger(
        challenger?.id,
        "challenger.id",
      );

    const eligibleOpponents =
      await getSportEligibleOpponents(
        client,
        challenger,
        normalizedCompetitionId,
      );

    if (
      eligibleOpponents.length === 0
    ) {
      return null;
    }

    let minimumMeetings =
      null;

    for (
      const opponent of
      eligibleOpponents
    ) {
      const meetings =
        await getHistoricalCompetitionMeetings(
          client,
          {
            competitionId:
              normalizedCompetitionId,

            player1Id:
              challengerId,

            player2Id:
              opponent.id,
          },
        );

      if (
        minimumMeetings === null ||
        meetings <
          minimumMeetings
      ) {
        minimumMeetings =
          meetings;
      }
    }

    return minimumMeetings;
  };


export const hasOlderPendingCompetitionRivals =
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

    const lastResolved =
      await client.query(
        `
        SELECT
          resolved_at

        FROM challenges

        WHERE
          competition_id = $1

          AND challenger_id = $2

          AND challenged_id = $3

          AND resolved_at
            IS NOT NULL

        ORDER BY
          resolved_at DESC,
          id DESC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedChallengerId,
          normalizedChallengedId,
        ],
      );

    if (
      lastResolved.rowCount === 0
    ) {
      return false;
    }

    const resolvedAt =
      lastResolved
        .rows[0]
        .resolved_at;

    const waiting =
      await client.query(
        `
        SELECT
          id

        FROM challenges

        WHERE
          competition_id = $1

          AND challenged_id = $2

          AND challenger_id <> $3

          AND status =
            'pending'

          AND created_at <= $4

        ORDER BY
          historical_meetings_at_creation ASC,
          created_at ASC,
          id ASC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedChallengedId,
          normalizedChallengerId,
          resolvedAt,
        ],
      );

    return Boolean(
      waiting.rowCount,
    );
  };


export const getCompetitionRotationState =
  async (
    client,
    {
      userId,
      competitionId,
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

    const activeMatch =
      await client.query(
        `
        SELECT
          c.id AS challenge_id,
          c.competition_id,
          c.challenger_id,

          u.name AS challenger_name,

          c.venue,
          c.scheduled_at

        FROM challenges c

        JOIN users u
          ON u.id =
            c.challenger_id

        WHERE
          c.competition_id = $1

          AND c.challenged_id = $2

          AND c.status =
            'accepted'

        ORDER BY
          c.accepted_at ASC
            NULLS LAST,

          c.created_at ASC,

          c.id ASC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedUserId,
        ],
      );

    if (
      activeMatch.rowCount > 0
    ) {
      return {
        competition_id:
          normalizedCompetitionId,

        blockedByActiveMatch:
          true,

        activeChallenge:
          activeMatch.rows[0],

        currentChallenge:
          null,

        pendingChallenges:
          [],
      };
    }

    const pending =
      await client.query(
        `
        SELECT
          c.id,
          c.competition_id,
          c.challenger_id,
          c.challenged_id,
          c.historical_meetings_at_creation,
          c.created_at,

          u.name AS challenger_name,

          COALESCE(
            pcs.matches_played,
            0
          ) < comp.placement_matches
            AS challenger_provisional

        FROM challenges c

        JOIN users u
          ON u.id =
            c.challenger_id

        JOIN competitions comp
          ON comp.id =
            c.competition_id

        LEFT JOIN player_competition_stats pcs
          ON pcs.user_id =
            c.challenger_id

          AND pcs.competition_id =
            c.competition_id

        WHERE
          c.competition_id = $1

          AND c.challenged_id = $2

          AND c.status =
            'pending'

        ORDER BY
          c.historical_meetings_at_creation ASC,
          c.created_at ASC,
          c.id ASC
        `,
        [
          normalizedCompetitionId,
          normalizedUserId,
        ],
      );

    return {
      competition_id:
        normalizedCompetitionId,

      blockedByActiveMatch:
        false,

      activeChallenge:
        null,

      currentChallenge:
        pending.rows[0] ??
        null,

      pendingChallenges:
        pending.rows,
    };
  };