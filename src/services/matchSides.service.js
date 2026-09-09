import {
  getCompetitionById,
} from "./competition.service.js";

import {
  getMatchParticipants,
} from "./matchParticipants.service.js";


export class MatchSidesError extends Error {
  constructor(
    message,
    reason = "match_sides_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchSidesError";

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
    typeof client.query !==
      "function"
  ) {
    throw new MatchSidesError(
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
    throw new MatchSidesError(
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


const normalizeParticipant = (
  participant,
) => ({
  id:
    Number(
      participant.id,
    ),

  match_id:
    Number(
      participant.match_id,
    ),

  user_id:
    Number(
      participant.user_id,
    ),

  side:
    Number(
      participant.side,
    ),

  position:
    Number(
      participant.position,
    ),
});


export const groupParticipantsBySide = (
  participants,
  teamSize,
) => {
  const normalizedTeamSize =
    Number(teamSize);

  if (
    ![1, 2].includes(
      normalizedTeamSize,
    )
  ) {
    throw new MatchSidesError(
      "teamSize inválido.",
      "invalid_team_size",
      {
        team_size:
          teamSize,
      },
    );
  }

  if (
    !Array.isArray(
      participants,
    )
  ) {
    throw new MatchSidesError(
      "participants debe ser un array.",
      "invalid_participants",
    );
  }

  const normalized =
    participants.map(
      normalizeParticipant,
    );

  const expected =
    normalizedTeamSize * 2;

  if (
    normalized.length !==
    expected
  ) {
    throw new MatchSidesError(
      "Cantidad incorrecta de participantes.",
      "invalid_participant_count",
      {
        expected,
        actual:
          normalized.length,
      },
    );
  }

  const userIds =
    normalized.map(
      (participant) =>
        participant.user_id,
    );

  if (
    new Set(userIds).size !==
    userIds.length
  ) {
    throw new MatchSidesError(
      "Un jugador no puede ocupar más de un lugar en el partido.",
      "duplicate_participant",
    );
  }

  const sides = {
    1: [],
    2: [],
  };

  for (
    const participant of
    normalized
  ) {
    if (
      ![1, 2].includes(
        participant.side,
      )
    ) {
      throw new MatchSidesError(
        "Lado inválido.",
        "invalid_side",
      );
    }

    if (
      participant.position < 1 ||
      participant.position >
        normalizedTeamSize
    ) {
      throw new MatchSidesError(
        "Posición inválida.",
        "invalid_position",
      );
    }

    sides[
      participant.side
    ].push(
      participant,
    );
  }

  for (
    const side of
    [1, 2]
  ) {
    sides[side].sort(
      (a, b) =>
        a.position -
        b.position,
    );

    if (
      sides[side].length !==
      normalizedTeamSize
    ) {
      throw new MatchSidesError(
        "Cada lado debe tener exactamente teamSize jugadores.",
        "invalid_side_size",
        {
          side,
          expected:
            normalizedTeamSize,

          actual:
            sides[side].length,
        },
      );
    }

    for (
      let index = 0;
      index <
      normalizedTeamSize;
      index += 1
    ) {
      if (
        sides[side][index]
          .position !==
        index + 1
      ) {
        throw new MatchSidesError(
          "Las posiciones del lado no son consecutivas.",
          "invalid_side_positions",
          {
            side,
          },
        );
      }
    }
  }

  return sides;
};


export const getMatchSides =
  async (
    client,
    matchId,
  ) => {
    assertClient(client);

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const matchResult =
      await client.query(
        `
        SELECT
          m.id,
          m.competition_id,
          m.status,
          m.player1_id,
          m.player2_id,
          m.winner_id,
          m.score,
          m.proposed_score,
          m.annulled_at

        FROM matches m

        WHERE
          m.id = $1

        LIMIT 1
        `,
        [
          normalizedMatchId,
        ],
      );

    if (
      matchResult.rowCount === 0
    ) {
      return null;
    }

    const match =
      matchResult.rows[0];

    if (
      !match.competition_id
    ) {
      throw new MatchSidesError(
        "El partido no tiene competition_id.",
        "match_without_competition",
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    const competition =
      await getCompetitionById(
        client,
        match.competition_id,
      );

    if (!competition) {
      throw new MatchSidesError(
        "No existe la competición del partido.",
        "competition_not_found",
        {
          match_id:
            normalizedMatchId,

          competition_id:
            Number(
              match.competition_id,
            ),
        },
      );
    }

    const participants =
      await getMatchParticipants(
        client,
        normalizedMatchId,
      );

    const sides =
      groupParticipantsBySide(
        participants,
        competition.team_size,
      );

    return {
      match: {
        ...match,

        id:
          Number(
            match.id,
          ),

        competition_id:
          Number(
            match.competition_id,
          ),

        player1_id:
          match.player1_id
            ? Number(
                match.player1_id,
              )
            : null,

        player2_id:
          match.player2_id
            ? Number(
                match.player2_id,
              )
            : null,

        winner_id:
          match.winner_id
            ? Number(
                match.winner_id,
              )
            : null,
      },

      competition,

      participants:
        [
          ...sides[1],
          ...sides[2],
        ],

      side1:
        sides[1],

      side2:
        sides[2],
    };
  };


export const getSideUserIds = (
  matchSides,
  side,
) => {
  if (
    !matchSides ||
    typeof matchSides !==
      "object"
  ) {
    throw new MatchSidesError(
      "matchSides inválido.",
      "invalid_match_sides",
    );
  }

  const normalizedSide =
    Number(side);

  if (
    ![1, 2].includes(
      normalizedSide,
    )
  ) {
    throw new MatchSidesError(
      "side debe ser 1 o 2.",
      "invalid_side",
    );
  }

  const participants =
    normalizedSide === 1
      ? matchSides.side1
      : matchSides.side2;

  if (
    !Array.isArray(
      participants,
    )
  ) {
    throw new MatchSidesError(
      "El lado solicitado no existe.",
      "side_not_found",
    );
  }

  return participants.map(
    (participant) =>
      Number(
        participant.user_id,
      ),
  );
};


export const getOpponentSide = (
  side,
) => {
  const normalized =
    Number(side);

  if (normalized === 1) {
    return 2;
  }

  if (normalized === 2) {
    return 1;
  }

  throw new MatchSidesError(
    "side debe ser 1 o 2.",
    "invalid_side",
  );
};


export const getParticipantSide = (
  matchSides,
  userId,
) => {
  const normalizedUserId =
    positiveInteger(
      userId,
      "userId",
    );

  for (
    const side of
    [1, 2]
  ) {
    const participants =
      side === 1
        ? matchSides.side1
        : matchSides.side2;

    if (
      participants.some(
        (participant) =>
          Number(
            participant.user_id,
          ) ===
          normalizedUserId,
      )
    ) {
      return side;
    }
  }

  return null;
};


export const assertUserInMatch =
  (
    matchSides,
    userId,
  ) => {
    const side =
      getParticipantSide(
        matchSides,
        userId,
      );

    if (!side) {
      throw new MatchSidesError(
        "El jugador no participa del partido.",
        "user_not_in_match",
        {
          user_id:
            Number(userId),

          match_id:
            matchSides
              ?.match
              ?.id ??
            null,
        },
      );
    }

    return side;
  };


export default {
  groupParticipantsBySide,
  getMatchSides,
  getSideUserIds,
  getOpponentSide,
  getParticipantSide,
  assertUserInMatch,
};