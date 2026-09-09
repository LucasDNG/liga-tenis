/*
  ============================================================
  LA RED
  PLAN DE EVENTOS ELO DE UN PARTIDO
  ============================================================

  Este servicio NO escribe en PostgreSQL.

  Construye los eventos que luego deben insertarse
  en elo_events cuando un resultado es confirmado.

  REGLA CENTRAL:

  TODO partido completado válido produce:

    exactamente 2 eventos "match_result"
    → uno para P1
    → uno para P2

  Cada evento pertenece obligatoriamente a:

    competition_id

  PROVISIONAL #1 A #4

    match_result:
      elo_before = rating previo
      elo_after  = rating previo
      elo_change = 0

  PROVISIONAL #5

    match_result:
      delta = 0

    +

    placement_completed:
      elo_before = rating previo
      elo_after  = Elo oficial asignado

  OFICIAL

    match_result:
      refleja el movimiento Elo real del partido.

  De esta manera mantenemos separados:

  - resultado deportivo;
  - competición;
  - graduación del placement.
  ============================================================
*/


import {
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";


export class MatchEloEventsError extends Error {
  constructor(
    message,
    reason = "match_elo_events_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchEloEventsError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const toFiniteNumber = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    throw new MatchEloEventsError(
      `${field} debe ser un número válido.`,
      "invalid_number",
      {
        field,
        value,
      },
    );
  }

  return number;
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
    throw new MatchEloEventsError(
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
    throw new MatchEloEventsError(
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


const normalizeNullablePositiveInteger = (
  value,
  field,
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return toPositiveInteger(
    value,
    field,
  );
};


const normalizePlayerEventContext = (
  value,
  label,
) => {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new MatchEloEventsError(
      `${label} inválido.`,
      "invalid_player_context",
      {
        label,
      },
    );
  }

  const id =
    toPositiveInteger(
      value.id,
      `${label}.id`,
    );

  const ratingBefore =
    toFiniteNumber(
      value.rating_before,
      `${label}.rating_before`,
    );

  const ratingAfter =
    toFiniteNumber(
      value.rating_after,
      `${label}.rating_after`,
    );

  const matchesBefore =
    toInteger(
      value.matches_before,
      `${label}.matches_before`,
    );

  if (
    matchesBefore < 0
  ) {
    throw new MatchEloEventsError(
      `${label}.matches_before no puede ser negativo.`,
      "invalid_matches_before",
      {
        player_id:
          id,

        matches_before:
          matchesBefore,
      },
    );
  }

  if (
    ratingBefore < 0 ||
    ratingAfter < 0
  ) {
    throw new MatchEloEventsError(
      "El Elo no puede ser negativo.",
      "negative_rating",
      {
        player_id:
          id,

        rating_before:
          ratingBefore,

        rating_after:
          ratingAfter,
      },
    );
  }

  const provisionalBefore =
    matchesBefore <
    PLACEMENT_MATCHES;

  const won =
    Boolean(
      value.won,
    );

  const dethroneApplied =
    Boolean(
      value.dethrone_applied,
    );

  const placement =
    value.placement ??
    null;

  return {
    id,

    rating_before:
      ratingBefore,

    rating_after:
      ratingAfter,

    matches_before:
      matchesBefore,

    provisional_before:
      provisionalBefore,

    won,

    dethrone_applied:
      dethroneApplied,

    placement,
  };
};


const createEvent = ({
  userId,
  competitionId,
  matchId,
  challengeId,
  eventType,
  eloBefore,
  eloAfter,
  description,
}) => {
  const before =
    toFiniteNumber(
      eloBefore,
      "eloBefore",
    );

  const after =
    toFiniteNumber(
      eloAfter,
      "eloAfter",
    );

  return {
    user_id:
      toPositiveInteger(
        userId,
        "userId",
      ),

    competition_id:
      toPositiveInteger(
        competitionId,
        "competitionId",
      ),

    match_id:
      toPositiveInteger(
        matchId,
        "matchId",
      ),

    challenge_id:
      normalizeNullablePositiveInteger(
        challengeId,
        "challengeId",
      ),

    event_type:
      String(
        eventType,
      ),

    elo_before:
      before,

    elo_change:
      after -
      before,

    elo_after:
      after,

    description:
      String(
        description,
      ),
  };
};


const getMatchResultDescription = ({
  player,
  matchId,
}) => {
  if (
    player
      .provisional_before
  ) {
    return (
      `Nivelatorio ${player.matches_before + 1}/${PLACEMENT_MATCHES} ` +
      `en partido #${matchId}`
    );
  }

  if (
    player.won
  ) {
    return (
      `Victoria en partido #${matchId}`
    );
  }

  if (
    player
      .dethrone_applied
  ) {
    return (
      `Derrota siendo #1 en partido #${matchId}. ` +
      "Se aplicó regla de destronamiento."
    );
  }

  return (
    `Derrota en partido #${matchId}`
  );
};


export const buildMatchResultEvent = ({
  competitionId,
  matchId,
  challengeId = null,
  player,
}) => {
  const normalizedCompetitionId =
    toPositiveInteger(
      competitionId,
      "competitionId",
    );

  const normalizedPlayer =
    normalizePlayerEventContext(
      player,
      "player",
    );

  const matchResultAfter =
    normalizedPlayer
      .provisional_before
      ? normalizedPlayer
          .rating_before
      : normalizedPlayer
          .rating_after;

  return createEvent({
    userId:
      normalizedPlayer.id,

    competitionId:
      normalizedCompetitionId,

    matchId,

    challengeId,

    eventType:
      "match_result",

    eloBefore:
      normalizedPlayer
        .rating_before,

    eloAfter:
      matchResultAfter,

    description:
      getMatchResultDescription({
        player:
          normalizedPlayer,

        matchId,
      }),
  });
};


export const buildPlacementCompletedEvent = ({
  competitionId,
  matchId,
  challengeId = null,
  player,
}) => {
  const normalizedCompetitionId =
    toPositiveInteger(
      competitionId,
      "competitionId",
    );

  const normalizedPlayer =
    normalizePlayerEventContext(
      player,
      "player",
    );

  if (
    !normalizedPlayer
      .provisional_before
  ) {
    return null;
  }

  const placement =
    normalizedPlayer
      .placement;

  if (
    !placement ||
    placement.applies !==
      true ||
    placement.completed !==
      true
  ) {
    return null;
  }

  const matchNumber =
    toInteger(
      placement
        .placement_match_number,
      "placement.placement_match_number",
    );

  if (
    matchNumber !==
    PLACEMENT_MATCHES
  ) {
    throw new MatchEloEventsError(
      "placement_completed solamente puede emitirse en el quinto nivelatorio.",
      "placement_completed_wrong_match",
      {
        player_id:
          normalizedPlayer.id,

        placement_match_number:
          matchNumber,
      },
    );
  }

  const targetElo =
    toFiniteNumber(
      placement
        .target_elo,
      "placement.target_elo",
    );

  if (
    targetElo !==
    normalizedPlayer
      .rating_after
  ) {
    throw new MatchEloEventsError(
      "El Elo final del jugador no coincide con el target Elo de placement.",
      "placement_target_rating_mismatch",
      {
        player_id:
          normalizedPlayer.id,

        target_elo:
          targetElo,

        rating_after:
          normalizedPlayer
            .rating_after,
      },
    );
  }

  const percentile =
    toFiniteNumber(
      placement
        .placement_percentile,
      "placement.placement_percentile",
    );

  const targetPosition =
    toPositiveInteger(
      placement
        .target_position,
      "placement.target_position",
    );

  return createEvent({
    userId:
      normalizedPlayer.id,

    competitionId:
      normalizedCompetitionId,

    matchId,

    challengeId,

    eventType:
      "placement_completed",

    eloBefore:
      normalizedPlayer
        .rating_before,

    eloAfter:
      normalizedPlayer
        .rating_after,

    description:
      (
        `Nivelatorios completados. ` +
        `Percentil ${percentile}% · ` +
        `posición objetivo #${targetPosition} · ` +
        `Elo oficial ${normalizedPlayer.rating_after}.`
      ),
  });
};


export const buildMatchEloEvents = ({
  competitionId,
  matchId,
  challengeId = null,
  player1,
  player2,
}) => {
  const normalizedCompetitionId =
    toPositiveInteger(
      competitionId,
      "competitionId",
    );

  const normalizedMatchId =
    toPositiveInteger(
      matchId,
      "matchId",
    );

  const p1 =
    normalizePlayerEventContext(
      player1,
      "player1",
    );

  const p2 =
    normalizePlayerEventContext(
      player2,
      "player2",
    );

  if (
    p1.id ===
    p2.id
  ) {
    throw new MatchEloEventsError(
      "Los dos jugadores no pueden ser la misma persona.",
      "same_player",
    );
  }

  if (
    p1.won ===
    p2.won
  ) {
    throw new MatchEloEventsError(
      "Debe existir exactamente un ganador.",
      "invalid_winner_state",
      {
        player1_won:
          p1.won,

        player2_won:
          p2.won,
      },
    );
  }

  const events = [
    buildMatchResultEvent({
      competitionId:
        normalizedCompetitionId,

      matchId:
        normalizedMatchId,

      challengeId,

      player:
        p1,
    }),

    buildMatchResultEvent({
      competitionId:
        normalizedCompetitionId,

      matchId:
        normalizedMatchId,

      challengeId,

      player:
        p2,
    }),
  ];

  const player1PlacementEvent =
    buildPlacementCompletedEvent({
      competitionId:
        normalizedCompetitionId,

      matchId:
        normalizedMatchId,

      challengeId,

      player:
        p1,
    });

  const player2PlacementEvent =
    buildPlacementCompletedEvent({
      competitionId:
        normalizedCompetitionId,

      matchId:
        normalizedMatchId,

      challengeId,

      player:
        p2,
    });

  if (
    player1PlacementEvent
  ) {
    events.push(
      player1PlacementEvent,
    );
  }

  if (
    player2PlacementEvent
  ) {
    events.push(
      player2PlacementEvent,
    );
  }

  const matchResultEvents =
    events.filter(
      (event) =>
        event.event_type ===
        "match_result",
    );

  if (
    matchResultEvents.length !==
    2
  ) {
    throw new MatchEloEventsError(
      "Todo partido debe producir exactamente dos eventos match_result.",
      "invalid_match_result_event_count",
      {
        count:
          matchResultEvents.length,
      },
    );
  }

  return {
    competition_id:
      normalizedCompetitionId,

    match_id:
      normalizedMatchId,

    challenge_id:
      normalizeNullablePositiveInteger(
        challengeId,
        "challengeId",
      ),

    events,

    match_result_count:
      matchResultEvents.length,

    placement_completed_count:
      events.filter(
        (event) =>
          event.event_type ===
          "placement_completed",
      ).length,
  };
};