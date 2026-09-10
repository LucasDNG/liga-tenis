import {
  buildDoublesParticipants,
  insertMatchParticipants,
  assertPlayersBelongToCompetition,
} from "./matchParticipants.service.js";

import {
  getDoublesChallengeWithMembers,
  DoublesChallengeError,
} from "./doublesChallenge.service.js";


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
    throw new DoublesChallengeError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const createDoublesMatchFromChallenge =
  async (
    client,
    {
      challengeId,
    },
  ) => {
    const normalizedChallengeId =
      positiveInteger(
        challengeId,
        "challengeId",
      );

    const challenge =
      await getDoublesChallengeWithMembers(
        client,
        normalizedChallengeId,
        {
          forUpdate:
            true,
        },
      );

    if (
      challenge.status !==
      "accepted"
    ) {
      throw new DoublesChallengeError(
        "El desafío debe estar aceptado antes de crear el partido.",
        "challenge_not_accepted",
        409,
        {
          challenge_id:
            normalizedChallengeId,

          status:
            challenge.status,
        },
      );
    }

    if (
      !challenge.venue ||
      !challenge.scheduled_at
    ) {
      throw new DoublesChallengeError(
        "El desafío debe tener lugar, fecha y hora antes de crear el partido.",
        "challenge_schedule_missing",
        409,
        {
          challenge_id:
            normalizedChallengeId,
        },
      );
    }

    const existingMatch =
      await client.query(
        `
        SELECT
          id,
          challenge_id,
          competition_id,
          side1_pair_id,
          side2_pair_id,
          status,
          venue,
          scheduled_at

        FROM matches

        WHERE
          challenge_id = $1

        ORDER BY
          id ASC

        LIMIT 1

        FOR UPDATE
        `,
        [
          normalizedChallengeId,
        ],
      );

    if (
      existingMatch.rowCount ===
      1
    ) {
      return {
        created:
          false,

        match:
          existingMatch.rows[0],

        participants:
          null,
      };
    }

    const competitionId =
      Number(
        challenge
          .competition_id,
      );

    const challengerPairId =
      Number(
        challenge
          .challenger_pair_id,
      );

    const challengedPairId =
      Number(
        challenge
          .challenged_pair_id,
      );

    const participants =
      buildDoublesParticipants({
        side1Player1Id:
          Number(
            challenge
              .challenger_player1_id,
          ),

        side1Player2Id:
          Number(
            challenge
              .challenger_player2_id,
          ),

        side2Player1Id:
          Number(
            challenge
              .challenged_player1_id,
          ),

        side2Player2Id:
          Number(
            challenge
              .challenged_player2_id,
          ),
      });

    await assertPlayersBelongToCompetition(
      client,
      {
        competitionId,

        participants,

        teamSize:
          2,
      },
    );

    /*
      player1_id / player2_id permanecen
      temporalmente por compatibilidad.

      Autoridad real:
      - match_participants
      - side1_pair_id
      - side2_pair_id
    */

    const matchResult =
      await client.query(
        `
        INSERT INTO matches (
          challenge_id,
          competition_id,
          player1_id,
          player2_id,
          side1_pair_id,
          side2_pair_id,
          venue,
          scheduled_at,
          status
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'pending'
        )

        RETURNING
          *
        `,
        [
          normalizedChallengeId,

          competitionId,

          Number(
            challenge
              .challenger_player1_id,
          ),

          Number(
            challenge
              .challenged_player1_id,
          ),

          challengerPairId,

          challengedPairId,

          challenge.venue,

          challenge.scheduled_at,
        ],
      );

    const match =
      matchResult.rows[0];

    const storedParticipants =
      await insertMatchParticipants(
        client,
        {
          matchId:
            Number(
              match.id,
            ),

          participants,

          teamSize:
            2,
        },
      );

    return {
      created:
        true,

      match,

      participants:
        storedParticipants,
    };
  };


export default {
  createDoublesMatchFromChallenge,
};