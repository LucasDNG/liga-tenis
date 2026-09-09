import {
  PLACEMENT_MATCHES,
  calculateCompletedPlacement,
  calculatePlacementPercentile,
} from "./placementLevel.service.js";

import {
  createPlacementEvidence,
  getPlayerPlacementCalculationEvidence,
  getPlayerPlacementEvidence,
  validatePlacementEvidenceSequence,
} from "./placementEvidence.service.js";

import {
  getPlacementOpponentReference,
} from "./placementReference.service.js";


export class PlacementMatchError extends Error {
  constructor(
    message,
    reason = "placement_match_error",
    details = null,
  ) {
    super(message);

    this.name =
      "PlacementMatchError";

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
    throw new PlacementMatchError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const toInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    throw new PlacementMatchError(
      `${field} debe ser un entero.`,
      "invalid_integer",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const toPositiveInteger = (
  value,
  field,
) => {
  const number =
    toInteger(
      value,
      field,
    );

  if (
    number <= 0
  ) {
    throw new PlacementMatchError(
      `${field} debe ser positivo.`,
      "invalid_positive_integer",
      {
        field,
        value:
          number,
      },
    );
  }

  return number;
};


const normalizeCompetitionId = (
  competitionId,
) =>
  toPositiveInteger(
    competitionId,
    "competitionId",
  );


const normalizePlayer = (
  player,
  label,
  competitionId,
) => {
  if (
    !player ||
    typeof player !== "object" ||
    Array.isArray(player)
  ) {
    throw new PlacementMatchError(
      `${label} inválido.`,
      "invalid_player",
      {
        label,
      },
    );
  }

  const id =
    toPositiveInteger(
      player.id,
      `${label}.id`,
    );

  const normalizedCompetitionId =
    normalizeCompetitionId(
      competitionId,
    );

  if (
    player.competition_id !==
      undefined &&
    player.competition_id !==
      null &&
    Number(
      player.competition_id,
    ) !==
      normalizedCompetitionId
  ) {
    throw new PlacementMatchError(
      `${label} pertenece a otra competición.`,
      "player_competition_mismatch",
      {
        user_id:
          id,

        expected_competition_id:
          normalizedCompetitionId,

        received_competition_id:
          Number(
            player.competition_id,
          ),
      },
    );
  }

  const matchesPlayed =
    toInteger(
      player.matches_played ?? 0,
      `${label}.matches_played`,
    );

  if (
    matchesPlayed < 0
  ) {
    throw new PlacementMatchError(
      `${label}.matches_played no puede ser negativo.`,
      "invalid_matches_played",
      {
        player_id:
          id,

        competition_id:
          normalizedCompetitionId,

        matches_played:
          matchesPlayed,
      },
    );
  }

  const rating =
    Number(
      player.rating ?? 0,
    );

  if (
    !Number.isFinite(rating) ||
    rating < 0
  ) {
    throw new PlacementMatchError(
      `${label}.rating es inválido.`,
      "invalid_rating",
      {
        player_id:
          id,

        rating:
          player.rating,
      },
    );
  }

  return {
    ...player,

    id,

    competition_id:
      normalizedCompetitionId,

    matches_played:
      matchesPlayed,

    rating,

    provisional:
      matchesPlayed <
      PLACEMENT_MATCHES,
  };
};


const normalizeRanking = (
  officialRanking,
  competitionId,
) => {
  if (
    !Array.isArray(
      officialRanking,
    )
  ) {
    throw new PlacementMatchError(
      "officialRanking debe ser un array.",
      "invalid_official_ranking",
    );
  }

  const normalizedCompetitionId =
    normalizeCompetitionId(
      competitionId,
    );

  for (
    const player of
    officialRanking
  ) {
    if (
      player.competition_id !==
        undefined &&
      player.competition_id !==
        null &&
      Number(
        player.competition_id,
      ) !==
        normalizedCompetitionId
    ) {
      throw new PlacementMatchError(
        "El ranking oficial contiene jugadores de otra competición.",
        "ranking_competition_mismatch",
        {
          competition_id:
            normalizedCompetitionId,

          player_id:
            player.id,
        },
      );
    }
  }

  return officialRanking;
};


export const isPlacementPlayer =
  (
    player,
    competitionId,
  ) => {
    const normalized =
      normalizePlayer(
        player,
        "player",
        competitionId,
      );

    return normalized.provisional;
  };


export const getPlacementStateBeforeMatch =
  async (
    client,
    player,
    competitionId,
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const normalized =
      normalizePlayer(
        player,
        "player",
        normalizedCompetitionId,
      );

    if (
      !normalized.provisional
    ) {
      return {
        user_id:
          normalized.id,

        competition_id:
          normalizedCompetitionId,

        provisional:
          false,

        matches_before:
          normalized.matches_played,

        next_match_number:
          null,

        evidence_count:
          null,
      };
    }

    const evidence =
      await getPlayerPlacementEvidence(
        client,
        normalized.id,
        normalizedCompetitionId,
      );

    validatePlacementEvidenceSequence(
      evidence,
      normalizedCompetitionId,
    );

    if (
      evidence.length !==
      normalized.matches_played
    ) {
      throw new PlacementMatchError(
        "Los nivelatorios del jugador no coinciden con la evidencia de esta competición.",
        "placement_evidence_out_of_sync",
        {
          user_id:
            normalized.id,

          competition_id:
            normalizedCompetitionId,

          matches_played:
            normalized.matches_played,

          evidence_count:
            evidence.length,
        },
      );
    }

    const nextMatchNumber =
      normalized.matches_played +
      1;

    if (
      nextMatchNumber >
      PLACEMENT_MATCHES
    ) {
      throw new PlacementMatchError(
        "El jugador ya completó sus cinco nivelatorios en esta competición.",
        "placement_already_completed",
        {
          user_id:
            normalized.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    return {
      user_id:
        normalized.id,

      competition_id:
        normalizedCompetitionId,

      provisional:
        true,

      matches_before:
        normalized.matches_played,

      next_match_number:
        nextMatchNumber,

      evidence_count:
        evidence.length,
    };
  };


export const preparePlayerPlacementReference =
  async (
    client,
    {
      player,
      opponent,
      competitionId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const normalizedPlayer =
      normalizePlayer(
        player,
        "player",
        normalizedCompetitionId,
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        "opponent",
        normalizedCompetitionId,
      );

    if (
      !normalizedPlayer.provisional
    ) {
      return {
        applies:
          false,

        player_id:
          normalizedPlayer.id,

        opponent_id:
          normalizedOpponent.id,

        competition_id:
          normalizedCompetitionId,

        placement_match_number:
          null,

        opponent_reference:
          null,
      };
    }

    const state =
      await getPlacementStateBeforeMatch(
        client,
        normalizedPlayer,
        normalizedCompetitionId,
      );

    const opponentReference =
      await getPlacementOpponentReference(
        client,
        {
          opponent:
            normalizedOpponent,

          competitionId:
            normalizedCompetitionId,
        },
      );

    return {
      applies:
        true,

      player_id:
        normalizedPlayer.id,

      opponent_id:
        normalizedOpponent.id,

      competition_id:
        normalizedCompetitionId,

      placement_match_number:
        state.next_match_number,

      matches_before:
        state.matches_before,

      opponent_reference:
        opponentReference,
    };
  };


export const preparePlacementMatchContext =
  async (
    client,
    {
      competitionId,
      player1,
      player2,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const normalizedPlayer1 =
      normalizePlayer(
        player1,
        "player1",
        normalizedCompetitionId,
      );

    const normalizedPlayer2 =
      normalizePlayer(
        player2,
        "player2",
        normalizedCompetitionId,
      );

    if (
      normalizedPlayer1.id ===
      normalizedPlayer2.id
    ) {
      throw new PlacementMatchError(
        "Un jugador no puede competir contra sí mismo.",
        "same_player",
      );
    }

    const player1Context =
      normalizedPlayer1.provisional
        ? await preparePlayerPlacementReference(
            client,
            {
              player:
                normalizedPlayer1,

              opponent:
                normalizedPlayer2,

              competitionId:
                normalizedCompetitionId,
            },
          )
        : {
            applies:
              false,

            player_id:
              normalizedPlayer1.id,

            opponent_id:
              normalizedPlayer2.id,

            competition_id:
              normalizedCompetitionId,

            placement_match_number:
              null,

            opponent_reference:
              null,
          };

    const player2Context =
      normalizedPlayer2.provisional
        ? await preparePlayerPlacementReference(
            client,
            {
              player:
                normalizedPlayer2,

              opponent:
                normalizedPlayer1,

              competitionId:
                normalizedCompetitionId,
            },
          )
        : {
            applies:
              false,

            player_id:
              normalizedPlayer2.id,

            opponent_id:
              normalizedPlayer1.id,

            competition_id:
              normalizedCompetitionId,

            placement_match_number:
              null,

            opponent_reference:
              null,
          };

    return {
      competition_id:
        normalizedCompetitionId,

      player1:
        player1Context,

      player2:
        player2Context,

      has_placement_player:
        Boolean(
          player1Context.applies ||
          player2Context.applies,
        ),
    };
  };


export const recordPlayerPlacementResult =
  async (
    client,
    {
      matchId,
      competitionId,
      player,
      opponent,
      won,
      preparedContext,
      officialRankingBefore,
    },
  ) => {
    assertClient(client);

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const normalizedPlayer =
      normalizePlayer(
        player,
        "player",
        normalizedCompetitionId,
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        "opponent",
        normalizedCompetitionId,
      );

    if (
      !normalizedPlayer.provisional
    ) {
      return {
        applies:
          false,

        user_id:
          normalizedPlayer.id,

        competition_id:
          normalizedCompetitionId,

        completed:
          false,

        placement:
          null,
      };
    }

    if (
      typeof won !== "boolean"
    ) {
      throw new PlacementMatchError(
        "won debe ser boolean.",
        "invalid_result",
      );
    }

    if (
      !preparedContext ||
      !preparedContext.applies
    ) {
      throw new PlacementMatchError(
        "Falta el contexto pre-partido del nivelatorio.",
        "placement_context_missing",
        {
          user_id:
            normalizedPlayer.id,

          competition_id:
            normalizedCompetitionId,

          match_id:
            normalizedMatchId,
        },
      );
    }

    if (
      Number(
        preparedContext.player_id,
      ) !==
      normalizedPlayer.id
    ) {
      throw new PlacementMatchError(
        "El contexto de placement pertenece a otro jugador.",
        "placement_context_player_mismatch",
      );
    }

    if (
      Number(
        preparedContext.opponent_id,
      ) !==
      normalizedOpponent.id
    ) {
      throw new PlacementMatchError(
        "El contexto de placement pertenece a otro rival.",
        "placement_context_opponent_mismatch",
      );
    }

    if (
      Number(
        preparedContext.competition_id,
      ) !==
      normalizedCompetitionId
    ) {
      throw new PlacementMatchError(
        "El contexto de placement pertenece a otra competición.",
        "placement_context_competition_mismatch",
      );
    }

    const reference =
      preparedContext
        .opponent_reference;

    if (!reference) {
      throw new PlacementMatchError(
        "Falta la referencia congelada del rival.",
        "opponent_reference_missing",
      );
    }

    const expectedMatchNumber =
      normalizedPlayer
        .matches_played +
      1;

    const preparedMatchNumber =
      Number(
        preparedContext
          .placement_match_number,
      );

    if (
      preparedMatchNumber !==
      expectedMatchNumber
    ) {
      throw new PlacementMatchError(
        "El número del nivelatorio cambió durante la confirmación.",
        "placement_match_number_changed",
        {
          user_id:
            normalizedPlayer.id,

          competition_id:
            normalizedCompetitionId,

          expected:
            expectedMatchNumber,

          prepared:
            preparedMatchNumber,
        },
      );
    }

    await createPlacementEvidence(
      client,
      {
        matchId:
          normalizedMatchId,

        userId:
          normalizedPlayer.id,

        competitionId:
          normalizedCompetitionId,

        opponentId:
          normalizedOpponent.id,

        placementMatchNumber:
          preparedMatchNumber,

        won,

        opponentPercentileAtMatch:
          reference
            .opponent_percentile_at_match,

        opponentReferenceType:
          reference
            .opponent_reference_type,

        opponentRankPositionAtMatch:
          reference
            .opponent_rank_position_at_match ??
          null,

        officialPlayerCountAtMatch:
          reference
            .official_player_count_at_match ??
          null,
      },
    );

    const storedEvidence =
      await getPlayerPlacementEvidence(
        client,
        normalizedPlayer.id,
        normalizedCompetitionId,
      );

    validatePlacementEvidenceSequence(
      storedEvidence,
      normalizedCompetitionId,
    );

    if (
      storedEvidence.length !==
      preparedMatchNumber
    ) {
      throw new PlacementMatchError(
        "La cantidad de evidencias no coincide con el nivelatorio procesado.",
        "placement_evidence_count_mismatch",
        {
          user_id:
            normalizedPlayer.id,

          competition_id:
            normalizedCompetitionId,

          placement_match_number:
            preparedMatchNumber,

          evidence_count:
            storedEvidence.length,
        },
      );
    }

    const calculationEvidence =
      await getPlayerPlacementCalculationEvidence(
        client,
        normalizedPlayer.id,
        normalizedCompetitionId,
      );

    const partialPlacement =
      calculatePlacementPercentile({
        evidence:
          calculationEvidence,
      });

    if (
      preparedMatchNumber <
      PLACEMENT_MATCHES
    ) {
      return {
        applies:
          true,

        user_id:
          normalizedPlayer.id,

        competition_id:
          normalizedCompetitionId,

        completed:
          false,

        placement_match_number:
          preparedMatchNumber,

        matches_after:
          preparedMatchNumber,

        wins:
          partialPlacement.wins,

        losses:
          partialPlacement.losses,

        placement_percentile:
          partialPlacement
            .placement_percentile,

        demonstrated_level:
          partialPlacement
            .demonstrated_level,

        target_position:
          null,

        target_elo:
          null,

        evidence:
          calculationEvidence,
      };
    }

    const rankingBefore =
      normalizeRanking(
        officialRankingBefore,
        normalizedCompetitionId,
      );

    const duplicatedPlayer =
      rankingBefore.find(
        (rankingPlayer) =>
          Number(
            rankingPlayer.id,
          ) ===
          normalizedPlayer.id,
      );

    if (duplicatedPlayer) {
      throw new PlacementMatchError(
        "El jugador que termina placement ya aparece en el ranking oficial de esta competición.",
        "placement_player_already_official",
        {
          user_id:
            normalizedPlayer.id,

          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const completedPlacement =
      calculateCompletedPlacement({
        evidence:
          calculationEvidence,

        officialRanking:
          rankingBefore,
      });

    return {
      applies:
        true,

      user_id:
        normalizedPlayer.id,

      competition_id:
        normalizedCompetitionId,

      completed:
        true,

      placement_match_number:
        preparedMatchNumber,

      matches_after:
        PLACEMENT_MATCHES,

      wins:
        completedPlacement.wins,

      losses:
        completedPlacement.losses,

      weighted_victory_percentile:
        completedPlacement
          .weighted_victory_percentile,

      demonstrated_level:
        completedPlacement
          .demonstrated_level,

      win_factor:
        completedPlacement
          .win_factor,

      placement_percentile:
        completedPlacement
          .placement_percentile,

      requested_position:
        completedPlacement
          .requested_position,

      target_position:
        completedPlacement
          .target_position,

      protected_from_number_one:
        completedPlacement
          .protected_from_number_one,

      official_player_count_before:
        completedPlacement
          .official_player_count_before,

      target_elo:
        completedPlacement
          .target_elo,

      elo_reference_player_id:
        completedPlacement
          .elo_reference_player_id,

      elo_reference_position:
        completedPlacement
          .elo_reference_position,

      elo_reference_rating:
        completedPlacement
          .elo_reference_rating,

      elo_floor_used:
        completedPlacement
          .elo_floor_used,

      evidence:
        calculationEvidence,
    };
  };


export const recordPlacementMatchResult =
  async (
    client,
    {
      matchId,
      competitionId,
      player1,
      player2,
      winnerId,
      preparedContext,
      officialRankingBefore,
    },
  ) => {
    assertClient(client);

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const normalizedPlayer1 =
      normalizePlayer(
        player1,
        "player1",
        normalizedCompetitionId,
      );

    const normalizedPlayer2 =
      normalizePlayer(
        player2,
        "player2",
        normalizedCompetitionId,
      );

    const normalizedWinnerId =
      toPositiveInteger(
        winnerId,
        "winnerId",
      );

    if (
      normalizedWinnerId !==
        normalizedPlayer1.id &&
      normalizedWinnerId !==
        normalizedPlayer2.id
    ) {
      throw new PlacementMatchError(
        "El ganador no pertenece al partido.",
        "winner_not_in_match",
      );
    }

    if (
      !preparedContext ||
      typeof preparedContext !==
        "object"
    ) {
      throw new PlacementMatchError(
        "Falta el contexto pre-partido.",
        "placement_context_missing",
      );
    }

    if (
      Number(
        preparedContext
          .competition_id,
      ) !==
      normalizedCompetitionId
    ) {
      throw new PlacementMatchError(
        "El contexto pre-partido pertenece a otra competición.",
        "placement_context_competition_mismatch",
      );
    }

    const rankingBefore =
      normalizeRanking(
        officialRankingBefore,
        normalizedCompetitionId,
      );

    let player1Placement = {
      applies:
        false,

      user_id:
        normalizedPlayer1.id,

      competition_id:
        normalizedCompetitionId,

      completed:
        false,

      placement:
        null,
    };

    let player2Placement = {
      applies:
        false,

      user_id:
        normalizedPlayer2.id,

      competition_id:
        normalizedCompetitionId,

      completed:
        false,

      placement:
        null,
    };

    if (
      normalizedPlayer1.provisional
    ) {
      player1Placement =
        await recordPlayerPlacementResult(
          client,
          {
            matchId:
              normalizedMatchId,

            competitionId:
              normalizedCompetitionId,

            player:
              normalizedPlayer1,

            opponent:
              normalizedPlayer2,

            won:
              normalizedWinnerId ===
              normalizedPlayer1.id,

            preparedContext:
              preparedContext.player1,

            officialRankingBefore:
              rankingBefore,
          },
        );
    }

    if (
      normalizedPlayer2.provisional
    ) {
      player2Placement =
        await recordPlayerPlacementResult(
          client,
          {
            matchId:
              normalizedMatchId,

            competitionId:
              normalizedCompetitionId,

            player:
              normalizedPlayer2,

            opponent:
              normalizedPlayer1,

            won:
              normalizedWinnerId ===
              normalizedPlayer2.id,

            preparedContext:
              preparedContext.player2,

            officialRankingBefore:
              rankingBefore,
          },
        );
    }

    return {
      match_id:
        normalizedMatchId,

      competition_id:
        normalizedCompetitionId,

      winner_id:
        normalizedWinnerId,

      has_placement_player:
        Boolean(
          player1Placement.applies ||
          player2Placement.applies,
        ),

      player1:
        player1Placement,

      player2:
        player2Placement,
    };
  };


export const getCurrentPlacementLevel =
  async (
    client,
    userId,
    competitionId,
  ) => {
    assertClient(client);

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      normalizeCompetitionId(
        competitionId,
      );

    const evidence =
      await getPlayerPlacementCalculationEvidence(
        client,
        normalizedUserId,
        normalizedCompetitionId,
      );

    if (
      evidence.length >
      PLACEMENT_MATCHES
    ) {
      throw new PlacementMatchError(
        "El jugador posee más evidencia nivelatoria de la permitida en esta competición.",
        "too_many_placement_matches",
        {
          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,

          evidence_count:
            evidence.length,
        },
      );
    }

    const placement =
      calculatePlacementPercentile({
        evidence,
      });

    return {
      user_id:
        normalizedUserId,

      competition_id:
        normalizedCompetitionId,

      matches_played:
        placement.matches_played,

      matches_remaining:
        Math.max(
          0,
          PLACEMENT_MATCHES -
            placement.matches_played,
        ),

      wins:
        placement.wins,

      losses:
        placement.losses,

      weighted_victory_percentile:
        placement
          .weighted_victory_percentile,

      demonstrated_level:
        placement
          .demonstrated_level,

      win_factor:
        placement.win_factor,

      placement_percentile:
        placement
          .placement_percentile,

      completed:
        placement.completed,
    };
  };