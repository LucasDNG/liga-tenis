export class MatchParticipantsError extends Error {
  constructor(
    message,
    reason = "match_participants_error",
    details = {},
  ) {
    super(message);

    this.name =
      "MatchParticipantsError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const requireClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !== "function"
  ) {
    throw new MatchParticipantsError(
      "Se requiere un cliente PostgreSQL válido.",
      "invalid_database_client",
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
    throw new MatchParticipantsError(
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


export const normalizeMatchSide = (
  side,
) => {
  const normalized =
    Number(side);

  if (
    normalized !== 1 &&
    normalized !== 2
  ) {
    throw new MatchParticipantsError(
      "El lado del partido debe ser 1 o 2.",
      "invalid_match_side",
      {
        side,
      },
    );
  }

  return normalized;
};


export const normalizeMatchPosition = (
  position,
) => {
  const normalized =
    Number(position);

  if (
    normalized !== 1 &&
    normalized !== 2
  ) {
    throw new MatchParticipantsError(
      "La posición debe ser 1 o 2.",
      "invalid_match_position",
      {
        position,
      },
    );
  }

  return normalized;
};


export const normalizeParticipant = (
  participant,
) => {
  if (
    !participant ||
    typeof participant !==
      "object"
  ) {
    throw new MatchParticipantsError(
      "Participante inválido.",
      "invalid_participant",
    );
  }

  return {
    user_id:
      positiveInteger(
        participant.user_id ??
          participant.userId,
        "userId",
      ),

    side:
      normalizeMatchSide(
        participant.side,
      ),

    position:
      normalizeMatchPosition(
        participant.position,
      ),
  };
};


export const validateParticipantsForTeamSize = (
  participants,
  teamSize,
) => {
  if (
    !Array.isArray(
      participants,
    )
  ) {
    throw new MatchParticipantsError(
      "La lista de participantes es inválida.",
      "invalid_participants_list",
    );
  }

  const normalizedTeamSize =
    Number(
      teamSize,
    );

  if (
    normalizedTeamSize !== 1 &&
    normalizedTeamSize !== 2
  ) {
    throw new MatchParticipantsError(
      "team_size debe ser 1 o 2.",
      "invalid_team_size",
      {
        team_size:
          teamSize,
      },
    );
  }

  const normalized =
    participants.map(
      normalizeParticipant,
    );

  const expectedTotal =
    normalizedTeamSize * 2;

  if (
    normalized.length !==
    expectedTotal
  ) {
    throw new MatchParticipantsError(
      "Cantidad de participantes incorrecta para la competición.",
      "invalid_participant_count",
      {
        expected:
          expectedTotal,

        received:
          normalized.length,
      },
    );
  }

  const users =
    new Set();

  const slots =
    new Set();

  const sideCounts = {
    1: 0,
    2: 0,
  };

  for (
    const participant
    of normalized
  ) {
    if (
      users.has(
        participant.user_id,
      )
    ) {
      throw new MatchParticipantsError(
        "Un jugador no puede aparecer dos veces en el mismo partido.",
        "duplicate_match_user",
        {
          user_id:
            participant.user_id,
        },
      );
    }

    users.add(
      participant.user_id,
    );

    if (
      participant.position >
      normalizedTeamSize
    ) {
      throw new MatchParticipantsError(
        "La posición del jugador no corresponde al tamaño del equipo.",
        "invalid_position_for_team_size",
        {
          side:
            participant.side,

          position:
            participant.position,

          team_size:
            normalizedTeamSize,
        },
      );
    }

    const slotKey =
      `${participant.side}:${participant.position}`;

    if (
      slots.has(
        slotKey,
      )
    ) {
      throw new MatchParticipantsError(
        "Hay dos jugadores ocupando el mismo lugar del partido.",
        "duplicate_match_slot",
        {
          side:
            participant.side,

          position:
            participant.position,
        },
      );
    }

    slots.add(
      slotKey,
    );

    sideCounts[
      participant.side
    ] += 1;
  }

  if (
    sideCounts[1] !==
      normalizedTeamSize ||
    sideCounts[2] !==
      normalizedTeamSize
  ) {
    throw new MatchParticipantsError(
      "Cada lado debe tener exactamente la cantidad de jugadores definida por la competición.",
      "invalid_side_participant_count",
      {
        side_1:
          sideCounts[1],

        side_2:
          sideCounts[2],

        team_size:
          normalizedTeamSize,
      },
    );
  }

  for (
    let side = 1;
    side <= 2;
    side += 1
  ) {
    for (
      let position = 1;
      position <=
        normalizedTeamSize;
      position += 1
    ) {
      const slotKey =
        `${side}:${position}`;

      if (
        !slots.has(
          slotKey,
        )
      ) {
        throw new MatchParticipantsError(
          "Falta una posición requerida del partido.",
          "missing_match_slot",
          {
            side,
            position,
          },
        );
      }
    }
  }

  return normalized.sort(
    (
      a,
      b,
    ) => {
      if (
        a.side !== b.side
      ) {
        return (
          a.side -
          b.side
        );
      }

      return (
        a.position -
        b.position
      );
    },
  );
};


export const buildSinglesParticipants = ({
  player1Id,
  player2Id,
}) =>
  validateParticipantsForTeamSize(
    [
      {
        user_id:
          player1Id,

        side:
          1,

        position:
          1,
      },

      {
        user_id:
          player2Id,

        side:
          2,

        position:
          1,
      },
    ],
    1,
  );


export const buildDoublesParticipants = ({
  side1Player1Id,
  side1Player2Id,
  side2Player1Id,
  side2Player2Id,
}) =>
  validateParticipantsForTeamSize(
    [
      {
        user_id:
          side1Player1Id,

        side:
          1,

        position:
          1,
      },

      {
        user_id:
          side1Player2Id,

        side:
          1,

        position:
          2,
      },

      {
        user_id:
          side2Player1Id,

        side:
          2,

        position:
          1,
      },

      {
        user_id:
          side2Player2Id,

        side:
          2,

        position:
          2,
      },
    ],
    2,
  );


export const getMatchParticipants = async (
  client,
  matchId,
) => {
  requireClient(
    client,
  );

  const normalizedMatchId =
    positiveInteger(
      matchId,
      "matchId",
    );

  const result =
    await client.query(
      `
        SELECT
          mp.id,
          mp.match_id,
          mp.user_id,
          mp.side,
          mp.position,
          mp.created_at,

          u.first_name,
          u.last_name,
          u.gender,
          u.city,
          u.role,
          u.verification_status

        FROM match_participants mp

        JOIN users u
          ON u.id = mp.user_id

        WHERE mp.match_id = $1

        ORDER BY
          mp.side ASC,
          mp.position ASC
      `,
      [
        normalizedMatchId,
      ],
    );

  return result.rows;
};


export const insertMatchParticipants = async (
  client,
  {
    matchId,
    participants,
    teamSize,
  },
) => {
  requireClient(
    client,
  );

  const normalizedMatchId =
    positiveInteger(
      matchId,
      "matchId",
    );

  const normalizedParticipants =
    validateParticipantsForTeamSize(
      participants,
      teamSize,
    );

  for (
    const participant
    of normalizedParticipants
  ) {
    await client.query(
      `
        INSERT INTO match_participants (
          match_id,
          user_id,
          side,
          position
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        ON CONFLICT (
          match_id,
          user_id
        )
        DO NOTHING
      `,
      [
        normalizedMatchId,
        participant.user_id,
        participant.side,
        participant.position,
      ],
    );
  }

  const stored =
    await getMatchParticipants(
      client,
      normalizedMatchId,
    );

  validateParticipantsForTeamSize(
    stored,
    teamSize,
  );

  return stored;
};


export const assertPlayersBelongToCompetition = async (
  client,
  {
    competitionId,
    participants,
    teamSize,
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

  const normalizedParticipants =
    validateParticipantsForTeamSize(
      participants,
      teamSize,
    );

  const userIds =
    normalizedParticipants.map(
      (
        participant,
      ) =>
        participant.user_id,
    );

  const result =
    await client.query(
      `
        SELECT
          c.id AS competition_id,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.team_size,
          c.active,

          u.id AS user_id,
          u.gender AS user_gender,
          u.city AS user_city,
          u.role,
          u.verification_status

        FROM competitions c

        CROSS JOIN users u

        WHERE c.id = $1
          AND u.id = ANY($2::int[])

        ORDER BY u.id
      `,
      [
        normalizedCompetitionId,
        userIds,
      ],
    );

  if (
    result.rows.length !==
    userIds.length
  ) {
    throw new MatchParticipantsError(
      "No se encontraron todos los jugadores o la competición.",
      "participant_or_competition_not_found",
      {
        competition_id:
          normalizedCompetitionId,

        expected_players:
          userIds.length,

        found_players:
          result.rows.length,
      },
    );
  }

  const competitionRow =
    result.rows[0];

  if (
    Number(
      competitionRow.team_size,
    ) !==
    Number(
      teamSize,
    )
  ) {
    throw new MatchParticipantsError(
      "El tamaño del equipo no coincide con la competición.",
      "competition_team_size_mismatch",
      {
        competition_id:
          normalizedCompetitionId,

        expected_team_size:
          Number(
            competitionRow.team_size,
          ),

        received_team_size:
          Number(
            teamSize,
          ),
      },
    );
  }

  if (
    competitionRow.active !==
    true
  ) {
    throw new MatchParticipantsError(
      "La competición está inactiva.",
      "competition_inactive",
      {
        competition_id:
          normalizedCompetitionId,
      },
    );
  }

  for (
    const row
    of result.rows
  ) {
    if (
      row.role !==
      "player"
    ) {
      throw new MatchParticipantsError(
        "Todos los participantes deben ser jugadores.",
        "participant_is_not_player",
        {
          user_id:
            row.user_id,
        },
      );
    }

    if (
      row.user_gender !==
      row.competition_gender
    ) {
      throw new MatchParticipantsError(
        "El género del jugador no corresponde a la competición.",
        "participant_gender_mismatch",
        {
          user_id:
            row.user_id,

          player_gender:
            row.user_gender,

          competition_gender:
            row.competition_gender,
        },
      );
    }

    if (
      row.user_city !==
      row.competition_city
    ) {
      throw new MatchParticipantsError(
        "La ciudad del jugador no corresponde a la competición.",
        "participant_city_mismatch",
        {
          user_id:
            row.user_id,

          player_city:
            row.user_city,

          competition_city:
            row.competition_city,
        },
      );
    }
  }

  return normalizedParticipants;
};


export default {
  normalizeMatchSide,
  normalizeMatchPosition,
  normalizeParticipant,
  validateParticipantsForTeamSize,
  buildSinglesParticipants,
  buildDoublesParticipants,
  getMatchParticipants,
  insertMatchParticipants,
  assertPlayersBelongToCompetition,
};