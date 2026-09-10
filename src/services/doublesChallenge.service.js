import {
  getCompetitionPairById,
  pairContainsUser,
} from "./competitionPair.service.js";


export class DoublesChallengeError
  extends Error {
  constructor(
    message,
    reason =
      "doubles_challenge_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "DoublesChallengeError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


const requireClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new DoublesChallengeError(
      "Se requiere un cliente PostgreSQL válido.",
      "invalid_database_client",
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
    !Number.isInteger(
      number,
    ) ||
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


const getCompetition = async (
  client,
  competitionId,
) => {
  const result =
    await client.query(
      `
      SELECT
        id,
        format,
        gender,
        city,
        name,
        team_size,
        placement_matches,
        active

      FROM competitions

      WHERE
        id = $1
      `,
      [
        competitionId,
      ],
    );

  if (
    result.rowCount !==
    1
  ) {
    throw new DoublesChallengeError(
      "Competición no encontrada.",
      "competition_not_found",
      404,
      {
        competition_id:
          competitionId,
      },
    );
  }

  return {
    ...result.rows[0],

    id:
      Number(
        result.rows[0].id,
      ),

    team_size:
      Number(
        result.rows[0]
          .team_size,
      ),

    placement_matches:
      Number(
        result.rows[0]
          .placement_matches,
      ),

    active:
      Boolean(
        result.rows[0]
          .active,
      ),
  };
};


const assertDoublesCompetition = (
  competition,
) => {
  if (
    competition.format !==
      "doubles" ||
    competition.team_size !==
      2
  ) {
    throw new DoublesChallengeError(
      "La competición no es de dobles.",
      "competition_not_doubles",
      409,
      {
        competition_id:
          competition.id,

        format:
          competition.format,

        team_size:
          competition.team_size,
      },
    );
  }

  if (
    !competition.active
  ) {
    throw new DoublesChallengeError(
      "La competición está inactiva.",
      "competition_inactive",
      409,
      {
        competition_id:
          competition.id,
      },
    );
  }
};


const assertPairCompetition = (
  pair,
  competitionId,
  field,
) => {
  if (
    Number(
      pair.competition_id,
    ) !==
    Number(
      competitionId,
    )
  ) {
    throw new DoublesChallengeError(
      "La pareja pertenece a otra competición.",
      "pair_competition_mismatch",
      409,
      {
        field,

        pair_id:
          Number(
            pair.id,
          ),

        pair_competition_id:
          Number(
            pair.competition_id,
          ),

        expected_competition_id:
          Number(
            competitionId,
          ),
      },
    );
  }
};


const assertDistinctPairs = (
  challengerPairId,
  challengedPairId,
) => {
  if (
    challengerPairId ===
    challengedPairId
  ) {
    throw new DoublesChallengeError(
      "Una pareja no puede desafiarse a sí misma.",
      "same_pair",
      400,
    );
  }
};


const assertNoSharedPlayers = (
  challengerPair,
  challengedPair,
) => {
  const challengerPlayers =
    new Set([
      Number(
        challengerPair
          .player1_id,
      ),
      Number(
        challengerPair
          .player2_id,
      ),
    ]);

  const challengedPlayers = [
    Number(
      challengedPair
        .player1_id,
    ),
    Number(
      challengedPair
        .player2_id,
    ),
  ];

  const shared =
    challengedPlayers.filter(
      (
        userId,
      ) =>
        challengerPlayers.has(
          userId,
        ),
    );

  if (
    shared.length >
    0
  ) {
    throw new DoublesChallengeError(
      "Las dos parejas no pueden compartir jugadores.",
      "shared_player_between_pairs",
      409,
      {
        shared_user_ids:
          shared,
      },
    );
  }
};


export const getActiveDoublesChallengeBetween =
  async (
    client,
    {
      competitionId,
      pair1Id,
      pair2Id,
    },
  ) => {
    requireClient(
      client,
    );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedPair1Id =
      positiveInteger(
        pair1Id,
        "pair1Id",
      );

    const normalizedPair2Id =
      positiveInteger(
        pair2Id,
        "pair2Id",
      );

    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          challenger_pair_id,
          challenged_pair_id,
          status,
          created_at

        FROM challenges

        WHERE
          competition_id = $1

          AND status IN (
            'pending',
            'accepted'
          )

          AND (
            (
              challenger_pair_id = $2
              AND challenged_pair_id = $3
            )

            OR

            (
              challenger_pair_id = $3
              AND challenged_pair_id = $2
            )
          )

        ORDER BY
          created_at DESC,
          id DESC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedPair1Id,
          normalizedPair2Id,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


export const assertDoublesPairChallengeParticipants =
  async (
    client,
    {
      competitionId,
      challengerPairId,
      challengedPairId,
      actingUserId,
      lockPairs =
        false,
    },
  ) => {
    requireClient(
      client,
    );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengerPairId =
      positiveInteger(
        challengerPairId,
        "challengerPairId",
      );

    const normalizedChallengedPairId =
      positiveInteger(
        challengedPairId,
        "challengedPairId",
      );

    const normalizedActingUserId =
      positiveInteger(
        actingUserId,
        "actingUserId",
      );

    assertDistinctPairs(
      normalizedChallengerPairId,
      normalizedChallengedPairId,
    );

    const competition =
      await getCompetition(
        client,
        normalizedCompetitionId,
      );

    assertDoublesCompetition(
      competition,
    );

    const challengerPair =
      await getCompetitionPairById(
        client,
        normalizedChallengerPairId,
        {
          forUpdate:
            lockPairs,
        },
      );

    const challengedPair =
      await getCompetitionPairById(
        client,
        normalizedChallengedPairId,
        {
          forUpdate:
            lockPairs,
        },
      );

    if (
      !challengerPair
    ) {
      throw new DoublesChallengeError(
        "Pareja desafiante no encontrada.",
        "challenger_pair_not_found",
        404,
      );
    }

    if (
      !challengedPair
    ) {
      throw new DoublesChallengeError(
        "Pareja desafiada no encontrada.",
        "challenged_pair_not_found",
        404,
      );
    }

    assertPairCompetition(
      challengerPair,
      normalizedCompetitionId,
      "challenger_pair_id",
    );

    assertPairCompetition(
      challengedPair,
      normalizedCompetitionId,
      "challenged_pair_id",
    );

    assertNoSharedPlayers(
      challengerPair,
      challengedPair,
    );

    if (
      !pairContainsUser(
        challengerPair,
        normalizedActingUserId,
      )
    ) {
      throw new DoublesChallengeError(
        "Solo un integrante de la pareja desafiante puede crear el desafío.",
        "acting_user_not_in_challenger_pair",
        403,
        {
          acting_user_id:
            normalizedActingUserId,

          challenger_pair_id:
            normalizedChallengerPairId,
        },
      );
    }

    return {
      competition,
      challengerPair,
      challengedPair,
    };
  };


export const createDoublesChallenge =
  async (
    client,
    {
      competitionId,
      challengerPairId,
      challengedPairId,
      actingUserId,
    },
  ) => {
    requireClient(
      client,
    );

    const {
      competition,
      challengerPair,
      challengedPair,
    } =
      await assertDoublesPairChallengeParticipants(
        client,
        {
          competitionId,
          challengerPairId,
          challengedPairId,
          actingUserId,
          lockPairs:
            true,
        },
      );

    const activeChallenge =
      await getActiveDoublesChallengeBetween(
        client,
        {
          competitionId:
            competition.id,

          pair1Id:
            challengerPair.id,

          pair2Id:
            challengedPair.id,
        },
      );

    if (
      activeChallenge
    ) {
      throw new DoublesChallengeError(
        "Ya existe un desafío activo entre estas dos parejas.",
        "active_pair_challenge_exists",
        409,
        {
          challenge_id:
            Number(
              activeChallenge.id,
            ),

          status:
            activeChallenge.status,
        },
      );
    }

    /*
      Dejamos challenger_id y challenged_id
      con los usuarios que iniciaron/recibieron
      por compatibilidad histórica.

      La AUTORIDAD real de dobles son:
      challenger_pair_id / challenged_pair_id.

      challenged_id usa player1 solamente como
      referencia legacy. NO da autoridad individual.
    */

    const legacyChallengerId =
      positiveInteger(
        actingUserId,
        "actingUserId",
      );

    const legacyChallengedId =
      Number(
        challengedPair
          .player1_id,
      );

    const result =
      await client.query(
        `
        INSERT INTO challenges (
          challenger_id,
          challenged_id,
          competition_id,
          challenger_pair_id,
          challenged_pair_id,
          status
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'pending'
        )

        RETURNING
          *
        `,
        [
          legacyChallengerId,
          legacyChallengedId,
          competition.id,
          challengerPair.id,
          challengedPair.id,
        ],
      );

    return {
      challenge:
        result.rows[0],

      competition,

      challengerPair,

      challengedPair,
    };
  };


export const getDoublesChallengeById =
  async (
    client,
    challengeId,
    {
      forUpdate =
        false,
    } = {},
  ) => {
    requireClient(
      client,
    );

    const normalizedChallengeId =
      positiveInteger(
        challengeId,
        "challengeId",
      );

    const result =
      await client.query(
        `
        SELECT
          ch.*,

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
            AS competition_placement_matches

        FROM challenges ch

        JOIN competitions c
          ON c.id =
            ch.competition_id

        WHERE
          ch.id = $1

        ${
          forUpdate
            ? "FOR UPDATE OF ch"
            : ""
        }
        `,
        [
          normalizedChallengeId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesChallengeError(
        "Desafío no encontrado.",
        "challenge_not_found",
        404,
        {
          challenge_id:
            normalizedChallengeId,
        },
      );
    }

    const challenge =
      result.rows[0];

    if (
      challenge
        .competition_format !==
        "doubles" ||
      Number(
        challenge
          .competition_team_size,
      ) !==
        2
    ) {
      throw new DoublesChallengeError(
        "El desafío no es de dobles.",
        "challenge_not_doubles",
        409,
      );
    }

    if (
      !challenge
        .challenger_pair_id ||
      !challenge
        .challenged_pair_id
    ) {
      throw new DoublesChallengeError(
        "El desafío de dobles no tiene sus parejas vinculadas.",
        "doubles_challenge_pairs_missing",
        409,
      );
    }

    return challenge;
  };


export const getUserChallengeSide =
  (
    challenge,
    userId,
  ) => {
    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const challengerIds =
      [
        Number(
          challenge
            .challenger_player1_id,
        ),
        Number(
          challenge
            .challenger_player2_id,
        ),
      ];

    const challengedIds =
      [
        Number(
          challenge
            .challenged_player1_id,
        ),
        Number(
          challenge
            .challenged_player2_id,
        ),
      ];

    if (
      challengerIds.includes(
        normalizedUserId,
      )
    ) {
      return 1;
    }

    if (
      challengedIds.includes(
        normalizedUserId,
      )
    ) {
      return 2;
    }

    return null;
  };


export const getDoublesChallengeWithMembers =
  async (
    client,
    challengeId,
    {
      forUpdate =
        false,
    } = {},
  ) => {
    requireClient(
      client,
    );

    const normalizedChallengeId =
      positiveInteger(
        challengeId,
        "challengeId",
      );

    const result =
      await client.query(
        `
        SELECT
          ch.*,

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

          challenger_pair.player1_id
            AS challenger_player1_id,

          challenger_pair.player2_id
            AS challenger_player2_id,

          challenged_pair.player1_id
            AS challenged_player1_id,

          challenged_pair.player2_id
            AS challenged_player2_id

        FROM challenges ch

        JOIN competitions c
          ON c.id =
            ch.competition_id

        JOIN competition_pairs challenger_pair
          ON challenger_pair.id =
            ch.challenger_pair_id

        JOIN competition_pairs challenged_pair
          ON challenged_pair.id =
            ch.challenged_pair_id

        WHERE
          ch.id = $1

        ${
          forUpdate
            ? "FOR UPDATE OF ch"
            : ""
        }
        `,
        [
          normalizedChallengeId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new DoublesChallengeError(
        "Desafío de dobles no encontrado.",
        "doubles_challenge_not_found",
        404,
      );
    }

    return result.rows[0];
  };


export const assertUserCanRespondToDoublesChallenge =
  (
    challenge,
    userId,
  ) => {
    const side =
      getUserChallengeSide(
        challenge,
        userId,
      );

    if (
      side !== 2
    ) {
      throw new DoublesChallengeError(
        "Solo un integrante de la pareja desafiada puede responder este desafío.",
        "not_challenged_pair_member",
        403,
        {
          user_id:
            Number(
              userId,
            ),
        },
      );
    }

    return side;
  };


export const assertUserCanScheduleDoublesChallenge =
  (
    challenge,
    userId,
  ) => {
    const side =
      getUserChallengeSide(
        challenge,
        userId,
      );

    if (
      side !== 1 &&
      side !== 2
    ) {
      throw new DoublesChallengeError(
        "No participás de este desafío.",
        "user_not_in_challenge",
        403,
      );
    }

    return side;
  };


export default {
  createDoublesChallenge,
  getActiveDoublesChallengeBetween,
  assertDoublesPairChallengeParticipants,
  getDoublesChallengeById,
  getDoublesChallengeWithMembers,
  getUserChallengeSide,
  assertUserCanRespondToDoublesChallenge,
  assertUserCanScheduleDoublesChallenge,
};