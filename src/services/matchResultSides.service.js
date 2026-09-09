import {
  calculateMatchGames,
} from "./rankingOrder.service.js";

import {
  getSideUserIds,
} from "./matchSides.service.js";


export class MatchResultSidesError extends Error {
  constructor(
    message,
    reason = "match_result_sides_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchResultSidesError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const sideNumber = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    ![1, 2].includes(
      number,
    )
  ) {
    throw new MatchResultSidesError(
      `${field} debe ser 1 o 2.`,
      "invalid_side",
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const resolveWinningSideFromSinglesWinner =
  (
    matchSides,
    winnerId,
  ) => {
    if (
      matchSides
        ?.competition
        ?.format !==
      "singles"
    ) {
      throw new MatchResultSidesError(
        "winner_id individual solo puede resolver partidos singles.",
        "singles_required",
      );
    }

    const normalizedWinnerId =
      Number(winnerId);

    if (
      !Number.isInteger(
        normalizedWinnerId,
      ) ||
      normalizedWinnerId <= 0
    ) {
      throw new MatchResultSidesError(
        "winnerId inválido.",
        "invalid_winner",
      );
    }

    if (
      matchSides.side1.some(
        (participant) =>
          participant.user_id ===
          normalizedWinnerId,
      )
    ) {
      return 1;
    }

    if (
      matchSides.side2.some(
        (participant) =>
          participant.user_id ===
          normalizedWinnerId,
      )
    ) {
      return 2;
    }

    throw new MatchResultSidesError(
      "El ganador no participa del partido.",
      "winner_not_in_match",
    );
  };


export const buildSideResult =
  (
    matchSides,
    {
      winningSide,
      score,
    },
  ) => {
    const normalizedWinningSide =
      sideNumber(
        winningSide,
        "winningSide",
      );

    const losingSide =
      normalizedWinningSide === 1
        ? 2
        : 1;

    const games =
      calculateMatchGames(
        score,
      );

    if (
      !games ||
      typeof games !==
        "object"
    ) {
      throw new MatchResultSidesError(
        "No se pudieron calcular los games del partido.",
        "invalid_match_games",
      );
    }

    const side1Games =
      Number(
        games.player1Games ??
        games.player1_games ??
        games.games1 ??
        0,
      );

    const side2Games =
      Number(
        games.player2Games ??
        games.player2_games ??
        games.games2 ??
        0,
      );

    if (
      !Number.isInteger(
        side1Games,
      ) ||
      side1Games < 0 ||
      !Number.isInteger(
        side2Games,
      ) ||
      side2Games < 0
    ) {
      throw new MatchResultSidesError(
        "Games inválidos.",
        "invalid_games",
        {
          games,
        },
      );
    }

    const side1UserIds =
      getSideUserIds(
        matchSides,
        1,
      );

    const side2UserIds =
      getSideUserIds(
        matchSides,
        2,
      );

    return {
      winning_side:
        normalizedWinningSide,

      losing_side:
        losingSide,

      side1: {
        user_ids:
          side1UserIds,

        won:
          normalizedWinningSide ===
          1,

        games_won:
          side1Games,

        games_lost:
          side2Games,
      },

      side2: {
        user_ids:
          side2UserIds,

        won:
          normalizedWinningSide ===
          2,

        games_won:
          side2Games,

        games_lost:
          side1Games,
      },
    };
  };


export const buildPlayerStatResults =
  (
    sideResult,
  ) => {
    if (
      !sideResult ||
      typeof sideResult !==
        "object"
    ) {
      throw new MatchResultSidesError(
        "sideResult inválido.",
        "invalid_side_result",
      );
    }

    const results =
      [];

    for (
      const sideNumberValue of
      [1, 2]
    ) {
      const side =
        sideNumberValue === 1
          ? sideResult.side1
          : sideResult.side2;

      for (
        const userId of
        side.user_ids
      ) {
        results.push({
          user_id:
            Number(
              userId,
            ),

          side:
            sideNumberValue,

          won:
            Boolean(
              side.won,
            ),

          games_won:
            Number(
              side.games_won,
            ),

          games_lost:
            Number(
              side.games_lost,
            ),
        });
      }
    }

    return results;
  };


export default {
  resolveWinningSideFromSinglesWinner,
  buildSideResult,
  buildPlayerStatResults,
};