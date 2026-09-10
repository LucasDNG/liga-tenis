export class CompetitionPairError
  extends Error {
  constructor(
    message,
    reason =
      "competition_pair_error",
    statusCode =
      400,
    details =
      null,
  ) {
    super(message);

    this.name =
      "CompetitionPairError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


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
    throw new CompetitionPairError(
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


const requireClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new CompetitionPairError(
      "Se requiere un cliente PostgreSQL válido.",
      "invalid_database_client",
      500,
    );
  }
};


export const canonicalizePairPlayerIds =
  (
    playerAId,
    playerBId,
  ) => {
    const a =
      positiveInteger(
        playerAId,
        "playerAId",
      );

    const b =
      positiveInteger(
        playerBId,
        "playerBId",
      );

    if (a === b) {
      throw new CompetitionPairError(
        "Una pareja debe estar formada por dos jugadores distintos.",
        "duplicate_pair_player",
        400,
        {
          user_id:
            a,
        },
      );
    }

    return {
      player1_id:
        Math.min(
          a,
          b,
        ),

      player2_id:
        Math.max(
          a,
          b,
        ),
    };
  };


export const pairContainsUser =
  (
    pair,
    userId,
  ) => {
    if (!pair) {
      return false;
    }

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    return (
      Number(
        pair.player1_id,
      ) ===
        normalizedUserId ||
      Number(
        pair.player2_id,
      ) ===
        normalizedUserId
    );
  };


export const getOtherPairMemberId =
  (
    pair,
    userId,
  ) => {
    if (!pair) {
      throw new CompetitionPairError(
        "Pareja inválida.",
        "invalid_pair",
        400,
      );
    }

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const player1Id =
      positiveInteger(
        pair.player1_id,
        "pair.player1_id",
      );

    const player2Id =
      positiveInteger(
        pair.player2_id,
        "pair.player2_id",
      );

    if (
      player1Id ===
      normalizedUserId
    ) {
      return player2Id;
    }

    if (
      player2Id ===
      normalizedUserId
    ) {
      return player1Id;
    }

    throw new CompetitionPairError(
      "El usuario no pertenece a esta pareja.",
      "user_not_in_pair",
      403,
      {
        user_id:
          normalizedUserId,

        pair_id:
          pair.id
            ? Number(
                pair.id,
              )
            : null,
      },
    );
  };


const getDoublesCompetition =
  async (
    client,
    competitionId,
    {
      forUpdate =
        false,
    } = {},
  ) => {
    requireClient(
      client,
    );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

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

        ${
          forUpdate
            ? "FOR UPDATE"
            : ""
        }
        `,
        [
          normalizedCompetitionId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new CompetitionPairError(
        "Competición no encontrada.",
        "competition_not_found",
        404,
        {
          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const competition = {
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

    if (
      competition.format !==
        "doubles" ||
      competition.team_size !==
        2
    ) {
      throw new CompetitionPairError(
        "La competición seleccionada no es de dobles.",
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
      throw new CompetitionPairError(
        "La competición está inactiva.",
        "competition_inactive",
        409,
        {
          competition_id:
            competition.id,
        },
      );
    }

    return competition;
  };


const getEligiblePairPlayers =
  async (
    client,
    {
      player1Id,
      player2Id,
      competition,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          first_name,
          last_name,
          role,
          verification_status,
          city,
          gender

        FROM users

        WHERE
          id = ANY($1::int[])

        ORDER BY
          id ASC
        `,
        [
          [
            player1Id,
            player2Id,
          ],
        ],
      );

    if (
      result.rowCount !==
      2
    ) {
      const foundIds =
        result.rows.map(
          (
            row,
          ) =>
            Number(
              row.id,
            ),
        );

      const missingIds =
        [
          player1Id,
          player2Id,
        ].filter(
          (
            id,
          ) =>
            !foundIds.includes(
              id,
            ),
        );

      throw new CompetitionPairError(
        "Uno o más jugadores de la pareja no existen.",
        "pair_player_not_found",
        404,
        {
          missing_user_ids:
            missingIds,
        },
      );
    }

    for (
      const user of
      result.rows
    ) {
      if (
        user.role !==
        "player"
      ) {
        throw new CompetitionPairError(
          "Los integrantes de una pareja deben ser jugadores.",
          "pair_player_invalid_role",
          403,
          {
            user_id:
              Number(
                user.id,
              ),

            role:
              user.role,
          },
        );
      }

      if (
        user.verification_status !==
        "verified"
      ) {
        throw new CompetitionPairError(
          "Los integrantes de la pareja deben estar verificados.",
          "pair_player_not_verified",
          403,
          {
            user_id:
              Number(
                user.id,
              ),

            verification_status:
              user
                .verification_status,
          },
        );
      }

      if (
        user.city !==
        competition.city
      ) {
        throw new CompetitionPairError(
          "Los integrantes deben pertenecer a la ciudad de la competición.",
          "pair_player_city_mismatch",
          403,
          {
            user_id:
              Number(
                user.id,
              ),

            user_city:
              user.city,

            competition_city:
              competition.city,
          },
        );
      }

      if (
        user.gender !==
        competition.gender
      ) {
        throw new CompetitionPairError(
          "Los integrantes deben pertenecer a la categoría de género de la competición.",
          "pair_player_gender_mismatch",
          403,
          {
            user_id:
              Number(
                user.id,
              ),

            user_gender:
              user.gender,

            competition_gender:
              competition.gender,
          },
        );
      }
    }

    return result.rows;
  };


export const getCompetitionPairById =
  async (
    client,
    pairId,
    {
      forUpdate =
        false,
    } = {},
  ) => {
    requireClient(
      client,
    );

    const normalizedPairId =
      positiveInteger(
        pairId,
        "pairId",
      );

    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          player1_id,
          player2_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          created_at,
          updated_at

        FROM competition_pairs

        WHERE
          id = $1

        ${
          forUpdate
            ? "FOR UPDATE"
            : ""
        }
        `,
        [
          normalizedPairId,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


export const getCompetitionPair =
  async (
    client,
    {
      competitionId,
      playerAId,
      playerBId,
      forUpdate =
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

    const {
      player1_id,
      player2_id,
    } =
      canonicalizePairPlayerIds(
        playerAId,
        playerBId,
      );

    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          player1_id,
          player2_id,
          rating,
          matches_played,
          wins,
          losses,
          games_won,
          games_lost,
          created_at,
          updated_at

        FROM competition_pairs

        WHERE
          competition_id = $1

          AND player1_id = $2

          AND player2_id = $3

        ${
          forUpdate
            ? "FOR UPDATE"
            : ""
        }
        `,
        [
          normalizedCompetitionId,
          player1_id,
          player2_id,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


export const ensureCompetitionPair =
  async (
    client,
    {
      competitionId,
      playerAId,
      playerBId,
      forUpdate =
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

    const {
      player1_id,
      player2_id,
    } =
      canonicalizePairPlayerIds(
        playerAId,
        playerBId,
      );

    const competition =
      await getDoublesCompetition(
        client,
        normalizedCompetitionId,
      );

    await getEligiblePairPlayers(
      client,
      {
        player1Id:
          player1_id,

        player2Id:
          player2_id,

        competition,
      },
    );

    /*
      Nueva pareja:
      - rating 0;
      - 0/5 nivelatorios;
      - no posee Elo oficial todavía.

      Si la combinación ya existía,
      ON CONFLICT no toca absolutamente
      ningún dato competitivo.
    */

    await client.query(
      `
      INSERT INTO competition_pairs (
        competition_id,
        player1_id,
        player2_id,
        rating,
        matches_played,
        wins,
        losses,
        games_won,
        games_lost
      )

      VALUES (
        $1,
        $2,
        $3,
        0,
        0,
        0,
        0,
        0,
        0
      )

      ON CONFLICT (
        competition_id,
        player1_id,
        player2_id
      )

      DO NOTHING
      `,
      [
        normalizedCompetitionId,
        player1_id,
        player2_id,
      ],
    );

    const pair =
      await getCompetitionPair(
        client,
        {
          competitionId:
            normalizedCompetitionId,

          playerAId:
            player1_id,

          playerBId:
            player2_id,

          forUpdate,
        },
      );

    if (!pair) {
      throw new CompetitionPairError(
        "No se pudo crear o recuperar la pareja.",
        "pair_creation_failed",
        500,
        {
          competition_id:
            normalizedCompetitionId,

          player1_id,

          player2_id,
        },
      );
    }

    return pair;
  };


export default {
  canonicalizePairPlayerIds,
  pairContainsUser,
  getOtherPairMemberId,
  getCompetitionPairById,
  getCompetitionPair,
  ensureCompetitionPair,
};