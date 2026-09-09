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


/*
  ============================================================
  LA RED
  ORQUESTADOR DE PARTIDOS NIVELATORIOS
  ============================================================

  Este servicio une:

  1. estado PRE-PARTIDO;
  2. valor congelado del rival;
  3. resultado confirmado;
  4. evidencia persistente;
  5. progreso 1/5 ... 5/5;
  6. cálculo final de placement;
  7. Elo objetivo al completar el quinto partido.

  PRINCIPIOS:

  - solamente las victorias aportan nivel;
  - las derrotas cuentan para el récord pero no agregan
    valor deportivo;
  - el valor del rival se toma ANTES del partido;
  - rival oficial:
      percentil oficial pre-partido;
  - rival provisional:
      su placement_percentile demostrado pre-partido;
  - nunca recalculamos retroactivamente esa referencia;
  - los cinco partidos son exactamente cinco;
  - el quinto convierte al jugador en oficial.
  ============================================================
*/


/*
  ============================================================
  ERROR
  ============================================================
*/

export class PlacementMatchError extends Error {
  constructor(
    message,
    reason =
      "placement_match_error",
    details =
      null,
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


/*
  ============================================================
  HELPERS
  ============================================================
*/

const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
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
    !Number.isInteger(
      number,
    )
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


const normalizePlayer = (
  player,
  label,
) => {
  if (
    !player ||
    typeof player !==
      "object" ||
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

  const matchesPlayed =
    toInteger(
      player.matches_played,
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

        matches_played:
          matchesPlayed,
      },
    );
  }

  const rating =
    Number(
      player.rating,
    );

  if (
    !Number.isFinite(
      rating,
    ) ||
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

  return officialRanking;
};


/*
  ============================================================
  ¿ESTÁ EN NIVELATORIOS?
  ============================================================
*/

export const isPlacementPlayer = (
  player,
) => {
  const normalized =
    normalizePlayer(
      player,
      "player",
    );

  return (
    normalized
      .matches_played <
    PLACEMENT_MATCHES
  );
};


/*
  ============================================================
  ESTADO DE NIVELATORIOS PRE-PARTIDO
  ============================================================
*/

export const getPlacementStateBeforeMatch =
  async (
    client,
    player,
  ) => {
    assertClient(
      client,
    );

    const normalized =
      normalizePlayer(
        player,
        "player",
      );

    if (
      !normalized.provisional
    ) {
      return {
        user_id:
          normalized.id,

        provisional:
          false,

        matches_before:
          normalized
            .matches_played,

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
      );

    validatePlacementEvidenceSequence(
      evidence,
    );

    /*
      Mientras terminamos la migración del sistema viejo
      al nuevo placement, queremos detectar desincronización
      y no inventar evidencia.

      matches_played debe coincidir con la cantidad de
      nivelatorios persistidos para jugadores del modelo nuevo.
    */

    if (
      evidence.length !==
      normalized.matches_played
    ) {
      throw new PlacementMatchError(
        "Los partidos nivelatorios del jugador no coinciden con su evidencia persistida.",
        "placement_evidence_out_of_sync",
        {
          user_id:
            normalized.id,

          matches_played:
            normalized
              .matches_played,

          evidence_count:
            evidence.length,
        },
      );
    }

    const nextMatchNumber =
      normalized
        .matches_played +
      1;

    if (
      nextMatchNumber >
      PLACEMENT_MATCHES
    ) {
      throw new PlacementMatchError(
        "El jugador ya completó sus cinco nivelatorios.",
        "placement_already_completed",
        {
          user_id:
            normalized.id,
        },
      );
    }

    return {
      user_id:
        normalized.id,

      provisional:
        true,

      matches_before:
        normalized
          .matches_played,

      next_match_number:
        nextMatchNumber,

      evidence_count:
        evidence.length,
    };
  };


/*
  ============================================================
  PREPARAR REFERENCIA PARA UN JUGADOR
  ============================================================

  Esto DEBE ejecutarse antes de modificar:

  - matches_played;
  - rating;
  - status del jugador.

  La referencia del rival queda conceptualmente congelada
  en este momento.
  ============================================================
*/

export const preparePlayerPlacementReference =
  async (
    client,
    {
      player,
      opponent,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedPlayer =
      normalizePlayer(
        player,
        "player",
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        "opponent",
      );

    if (
      !normalizedPlayer
        .provisional
    ) {
      return {
        applies:
          false,

        player_id:
          normalizedPlayer.id,

        opponent_id:
          normalizedOpponent.id,

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
      );

    const opponentReference =
      await getPlacementOpponentReference(
        client,
        normalizedOpponent,
      );

    return {
      applies:
        true,

      player_id:
        normalizedPlayer.id,

      opponent_id:
        normalizedOpponent.id,

      placement_match_number:
        state
          .next_match_number,

      matches_before:
        state
          .matches_before,

      opponent_reference:
        opponentReference,
    };
  };


/*
  ============================================================
  PREPARAR CONTEXTO COMPLETO DEL PARTIDO
  ============================================================

  Se calcula para LOS DOS jugadores antes del resultado.

  Ejemplo:

  P1 provisional
  P2 provisional

  Primero:
    calculamos cuánto vale P2 para P1

  Luego:
    calculamos cuánto vale P1 para P2

  Todo ANTES de guardar el resultado.

  Así el partido actual nunca puede inflar su propia
  referencia.
  ============================================================
*/

export const preparePlacementMatchContext =
  async (
    client,
    {
      player1,
      player2,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedPlayer1 =
      normalizePlayer(
        player1,
        "player1",
      );

    const normalizedPlayer2 =
      normalizePlayer(
        player2,
        "player2",
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
      normalizedPlayer1
        .provisional
        ? await preparePlayerPlacementReference(
            client,
            {
              player:
                normalizedPlayer1,

              opponent:
                normalizedPlayer2,
            },
          )
        : {
            applies:
              false,

            player_id:
              normalizedPlayer1.id,

            opponent_id:
              normalizedPlayer2.id,

            placement_match_number:
              null,

            opponent_reference:
              null,
          };

    const player2Context =
      normalizedPlayer2
        .provisional
        ? await preparePlayerPlacementReference(
            client,
            {
              player:
                normalizedPlayer2,

              opponent:
                normalizedPlayer1,
            },
          )
        : {
            applies:
              false,

            player_id:
              normalizedPlayer2.id,

            opponent_id:
              normalizedPlayer1.id,

            placement_match_number:
              null,

            opponent_reference:
              null,
          };

    return {
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


/*
  ============================================================
  GUARDAR RESULTADO NIVELATORIO DE UN JUGADOR
  ============================================================
*/

export const recordPlayerPlacementResult =
  async (
    client,
    {
      matchId,
      player,
      opponent,
      won,
      preparedContext,
      officialRankingBefore,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedPlayer =
      normalizePlayer(
        player,
        "player",
      );

    const normalizedOpponent =
      normalizePlayer(
        opponent,
        "opponent",
      );

    if (
      !normalizedPlayer
        .provisional
    ) {
      return {
        applies:
          false,

        user_id:
          normalizedPlayer.id,

        completed:
          false,

        placement:
          null,
      };
    }

    if (
      typeof won !==
      "boolean"
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

          match_id:
            normalizedMatchId,
        },
      );
    }

    if (
      Number(
        preparedContext
          .player_id,
      ) !==
      normalizedPlayer.id
    ) {
      throw new PlacementMatchError(
        "El contexto de placement pertenece a otro jugador.",
        "placement_context_player_mismatch",
        {
          expected:
            normalizedPlayer.id,

          received:
            preparedContext
              .player_id,
        },
      );
    }

    if (
      Number(
        preparedContext
          .opponent_id,
      ) !==
      normalizedOpponent.id
    ) {
      throw new PlacementMatchError(
        "El contexto de placement pertenece a otro rival.",
        "placement_context_opponent_mismatch",
        {
          expected:
            normalizedOpponent.id,

          received:
            preparedContext
              .opponent_id,
        },
      );
    }

    const reference =
      preparedContext
        .opponent_reference;

    if (
      !reference
    ) {
      throw new PlacementMatchError(
        "Falta la referencia congelada del rival.",
        "opponent_reference_missing",
        {
          user_id:
            normalizedPlayer.id,

          opponent_id:
            normalizedOpponent.id,
        },
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

          expected:
            expectedMatchNumber,

          prepared:
            preparedMatchNumber,
        },
      );
    }

    /*
      Guardamos la derrota aunque no aporte nivel.

      El percentil congelado también puede quedar registrado
      en la derrota para auditoría.

      El motor simplemente no lo utiliza cuando won=false.
    */

    await createPlacementEvidence(
      client,
      {
        matchId:
          normalizedMatchId,

        userId:
          normalizedPlayer.id,

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
      );

    validatePlacementEvidenceSequence(
      storedEvidence,
    );

    if (
      storedEvidence.length !==
      preparedMatchNumber
    ) {
      throw new PlacementMatchError(
        "La cantidad de evidencias nivelatorias no coincide con el partido procesado.",
        "placement_evidence_count_mismatch",
        {
          user_id:
            normalizedPlayer.id,

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
      );

    const partialPlacement =
      calculatePlacementPercentile({
        evidence:
          calculationEvidence,
      });

    /*
      Nivelatorios #1 a #4.

      Todavía NO recibe Elo oficial.

      Devolvemos solamente su nivel demostrado actual.
    */

    if (
      preparedMatchNumber <
      PLACEMENT_MATCHES
    ) {
      return {
        applies:
          true,

        user_id:
          normalizedPlayer.id,

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

    /*
      NIVELATORIO #5

      Acá sí se transforma en oficial.

      officialRankingBefore debe ser el ranking oficial
      PRE-PARTIDO.

      El jugador que está terminando placement todavía
      no debe estar incluido en ese ranking.
    */

    const rankingBefore =
      normalizeRanking(
        officialRankingBefore,
      );

    const duplicatedPlayer =
      rankingBefore.find(
        (rankingPlayer) =>
          Number(
            rankingPlayer.id,
          ) ===
          normalizedPlayer.id,
      );

    if (
      duplicatedPlayer
    ) {
      throw new PlacementMatchError(
        "El jugador que está terminando placement ya aparece en el ranking oficial pre-partido.",
        "placement_player_already_official",
        {
          user_id:
            normalizedPlayer.id,
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


/*
  ============================================================
  REGISTRAR RESULTADO DE AMBOS JUGADORES
  ============================================================

  IMPORTANTE:

  officialRankingBefore debe haber sido tomado antes de
  incrementar matches_played.

  Si ambos jugadores terminan su quinto nivelatorio
  en el mismo partido:

  - ambos utilizan el mismo ranking oficial pre-partido;
  - ninguno se usa como referencia oficial del otro;
  - para la referencia del partido se utilizó su nivel
    provisional PRE-PARTIDO;
  - no existe contaminación circular.
  ============================================================
*/

export const recordPlacementMatchResult =
  async (
    client,
    {
      matchId,
      player1,
      player2,
      winnerId,
      preparedContext,
      officialRankingBefore,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedPlayer1 =
      normalizePlayer(
        player1,
        "player1",
      );

    const normalizedPlayer2 =
      normalizePlayer(
        player2,
        "player2",
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
        {
          winner_id:
            normalizedWinnerId,

          player1_id:
            normalizedPlayer1.id,

          player2_id:
            normalizedPlayer2.id,
        },
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

    const rankingBefore =
      normalizeRanking(
        officialRankingBefore,
      );

    let player1Placement =
      {
        applies:
          false,

        user_id:
          normalizedPlayer1.id,

        completed:
          false,

        placement:
          null,
      };

    let player2Placement =
      {
        applies:
          false,

        user_id:
          normalizedPlayer2.id,

        completed:
          false,

        placement:
          null,
      };

    if (
      normalizedPlayer1
        .provisional
    ) {
      player1Placement =
        await recordPlayerPlacementResult(
          client,
          {
            matchId:
              normalizedMatchId,

            player:
              normalizedPlayer1,

            opponent:
              normalizedPlayer2,

            won:
              normalizedWinnerId ===
              normalizedPlayer1.id,

            preparedContext:
              preparedContext
                .player1,

            officialRankingBefore:
              rankingBefore,
          },
        );
    }

    if (
      normalizedPlayer2
        .provisional
    ) {
      player2Placement =
        await recordPlayerPlacementResult(
          client,
          {
            matchId:
              normalizedMatchId,

            player:
              normalizedPlayer2,

            opponent:
              normalizedPlayer1,

            won:
              normalizedWinnerId ===
              normalizedPlayer2.id,

            preparedContext:
              preparedContext
                .player2,

            officialRankingBefore:
              rankingBefore,
          },
        );
    }

    return {
      match_id:
        normalizedMatchId,

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


/*
  ============================================================
  OBTENER NIVEL ACTUAL DE UN PROVISIONAL
  ============================================================

  Sirve luego para:

  - ranking público;
  - desafíos;
  - mostrar "Nivelatorios 3/5";
  - calcular cuánto vale frente a otro provisional.
  ============================================================
*/

export const getCurrentPlacementLevel =
  async (
    client,
    userId,
  ) => {
    assertClient(
      client,
    );

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const evidence =
      await getPlayerPlacementCalculationEvidence(
        client,
        normalizedUserId,
      );

    if (
      evidence.length >
      PLACEMENT_MATCHES
    ) {
      throw new PlacementMatchError(
        "El jugador posee más evidencia nivelatoria de la permitida.",
        "too_many_placement_matches",
        {
          user_id:
            normalizedUserId,

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

      matches_played:
        placement
          .matches_played,

      matches_remaining:
        Math.max(
          0,
          PLACEMENT_MATCHES -
            placement
              .matches_played,
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
        placement
          .win_factor,

      placement_percentile:
        placement
          .placement_percentile,

      completed:
        placement.completed,
    };
  };