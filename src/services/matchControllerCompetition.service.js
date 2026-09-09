import {
  getMatchSides,
  assertUserInMatch,
} from "./matchSides.service.js";

import {
  loadCompetitionMatchPlayers,
  getCompetitionMatchPlayer,
} from "./competitionMatchPlayer.service.js";


export class MatchControllerCompetitionError extends Error {
  constructor(
    message,
    reason = "match_controller_competition_error",
    statusCode = 409,
    details = null,
  ) {
    super(message);

    this.name =
      "MatchControllerCompetitionError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

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
    throw new MatchControllerCompetitionError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
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
    throw new MatchControllerCompetitionError(
      `${field} inválido.`,
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


const getSideParticipants = (
  matchSides,
  side,
) => {
  const normalizedSide =
    Number(
      side,
    );

  if (
    normalizedSide !== 1 &&
    normalizedSide !== 2
  ) {
    throw new MatchControllerCompetitionError(
      "Lado de partido inválido.",
      "invalid_match_side",
      409,
      {
        side,
      },
    );
  }

  if (
    matchSides?.sides &&
    Array.isArray(
      matchSides.sides[
        normalizedSide
      ],
    )
  ) {
    return matchSides.sides[
      normalizedSide
    ];
  }

  const fallback =
    normalizedSide === 1
      ? matchSides?.side1
      : matchSides?.side2;

  return Array.isArray(
    fallback,
  )
    ? fallback
    : [];
};


const participantUserId = (
  participant,
) =>
  positiveInteger(
    participant?.user_id ??
      participant?.id,
    "participant.userId",
  );


export const getCompetitionMatchContext =
  async (
    client,
    {
      matchId,
      userId = null,
      requireSingles = false,
      lockPlayers = false,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const matchSides =
      await getMatchSides(
        client,
        normalizedMatchId,
      );

    if (!matchSides) {
      throw new MatchControllerCompetitionError(
        "Partido no encontrado.",
        "match_not_found",
        404,
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    if (
      !matchSides
        .competition
    ) {
      throw new MatchControllerCompetitionError(
        "El partido no tiene una competición válida.",
        "match_competition_missing",
        409,
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    const competitionId =
      positiveInteger(
        matchSides
          .competition
          .id,
        "competitionId",
      );

    if (
      requireSingles &&
      (
        matchSides
          .competition
          .format !==
          "singles" ||
        Number(
          matchSides
            .competition
            .team_size,
        ) !== 1
      )
    ) {
      throw new MatchControllerCompetitionError(
        "El cálculo Elo de dobles todavía no está habilitado.",
        "doubles_elo_not_implemented",
        409,
        {
          competition_id:
            competitionId,

          format:
            matchSides
              .competition
              .format,

          team_size:
            Number(
              matchSides
                .competition
                .team_size,
            ),
        },
      );
    }

    if (
      userId !== null &&
      userId !== undefined
    ) {
      const normalizedUserId =
        positiveInteger(
          userId,
          "userId",
        );

      try {
        assertUserInMatch(
          matchSides,
          normalizedUserId,
        );
      } catch {
        throw new MatchControllerCompetitionError(
          "No pertenecés a este partido.",
          "user_not_in_match",
          403,
          {
            match_id:
              normalizedMatchId,

            user_id:
              normalizedUserId,
          },
        );
      }
    }

    const side1 =
      getSideParticipants(
        matchSides,
        1,
      );

    const side2 =
      getSideParticipants(
        matchSides,
        2,
      );

    const participants =
      [
        ...side1,
        ...side2,
      ];

    const userIds =
      participants.map(
        participantUserId,
      );

    const expectedParticipants =
      Number(
        matchSides
          .competition
          .team_size,
      ) * 2;

    if (
      userIds.length !==
      expectedParticipants
    ) {
      throw new MatchControllerCompetitionError(
        "La cantidad de participantes no coincide con la competición.",
        "match_participant_count_mismatch",
        409,
        {
          competition_id:
            competitionId,

          expected:
            expectedParticipants,

          received:
            userIds.length,
        },
      );
    }

    if (
      new Set(
        userIds,
      ).size !==
      userIds.length
    ) {
      throw new MatchControllerCompetitionError(
        "El partido contiene participantes repetidos.",
        "duplicate_match_participant",
        409,
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    const players =
      await loadCompetitionMatchPlayers(
        client,
        {
          competition:
            matchSides
              .competition,

          userIds,

          forUpdate:
            lockPlayers,
        },
      );

    return {
      match_id:
        normalizedMatchId,

      competition_id:
        competitionId,

      match:
        matchSides.match,

      competition:
        matchSides.competition,

      match_sides:
        matchSides,

      side1,

      side2,

      participants,

      user_ids:
        userIds,

      players,
    };
  };


export const getSinglesCompetitionMatchContext =
  async (
    client,
    {
      matchId,
      userId = null,
      lockPlayers = false,
    },
  ) => {
    const context =
      await getCompetitionMatchContext(
        client,
        {
          matchId,
          userId,
          requireSingles:
            true,
          lockPlayers,
        },
      );

    if (
      context.side1.length !==
        1 ||
      context.side2.length !==
        1
    ) {
      throw new MatchControllerCompetitionError(
        "Un partido singles debe tener exactamente un jugador por lado.",
        "invalid_singles_participants",
        409,
        {
          match_id:
            context.match_id,
        },
      );
    }

    const player1Id =
      participantUserId(
        context.side1[0],
      );

    const player2Id =
      participantUserId(
        context.side2[0],
      );

    const player1 =
      getCompetitionMatchPlayer(
        context.players,
        player1Id,
      );

    const player2 =
      getCompetitionMatchPlayer(
        context.players,
        player2Id,
      );

    return {
      ...context,

      player1_id:
        player1Id,

      player2_id:
        player2Id,

      player1,

      player2,
    };
  };


export const resolveSinglesWinnerFromScore =
  (
    context,
    winnerSide,
  ) => {
    if (
      !context ||
      context
        .competition
        ?.format !==
        "singles"
    ) {
      throw new MatchControllerCompetitionError(
        "Se requiere un contexto singles.",
        "singles_context_required",
        409,
      );
    }

    const side =
      Number(
        winnerSide,
      );

    if (
      side !== 1 &&
      side !== 2
    ) {
      throw new MatchControllerCompetitionError(
        "El score no define un lado ganador válido.",
        "invalid_winner_side",
        409,
        {
          winner_side:
            winnerSide,
        },
      );
    }

    const participants =
      side === 1
        ? context.side1
        : context.side2;

    if (
      participants.length !==
      1
    ) {
      throw new MatchControllerCompetitionError(
        "No se pudo resolver el ganador singles.",
        "winner_resolution_failed",
        409,
      );
    }

    return participantUserId(
      participants[0],
    );
  };


export const getOpponentUserId =
  (
    context,
    userId,
  ) => {
    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    if (
      context
        .competition
        ?.format !==
        "singles"
    ) {
      throw new MatchControllerCompetitionError(
        "Este helper corresponde únicamente a singles.",
        "singles_required",
        409,
      );
    }

    if (
      normalizedUserId ===
      context.player1_id
    ) {
      return context.player2_id;
    }

    if (
      normalizedUserId ===
      context.player2_id
    ) {
      return context.player1_id;
    }

    throw new MatchControllerCompetitionError(
      "El usuario no pertenece al partido.",
      "user_not_in_match",
      403,
      {
        user_id:
          normalizedUserId,

        match_id:
          context.match_id,
      },
    );
  };


export const sendMatchControllerCompetitionError =
  (
    error,
    res,
    next,
  ) => {
    if (
      error instanceof
      MatchControllerCompetitionError
    ) {
      return res
        .status(
          error.statusCode,
        )
        .json({
          message:
            error.message,

          reason:
            error.reason,

          details:
            error.details,
        });
    }

    return next(
      error,
    );
  };


export default {
  getCompetitionMatchContext,
  getSinglesCompetitionMatchContext,
  resolveSinglesWinnerFromScore,
  getOpponentUserId,
  sendMatchControllerCompetitionError,
};