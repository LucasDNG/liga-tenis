const PLACEMENT_MATCHES = 5;


/*
  ============================================================
  ERROR CONTROLADO DE REPLAY
  ============================================================
*/

export class EloReplayError extends Error {
  constructor(
    code,
    message,
    details = {},
  ) {
    super(message);

    this.name =
      "EloReplayError";

    this.code =
      code;

    this.details =
      details;
  }
}


/*
  ============================================================
  HELPERS
  ============================================================
*/

const toInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    throw new EloReplayError(
      "invalid_integer",
      `El valor ${field} no es un entero válido.`,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const toNonNegativeInteger = (
  value,
  field,
) => {
  const number =
    toInteger(
      value,
      field,
    );

  if (
    number < 0
  ) {
    throw new EloReplayError(
      "invalid_non_negative_integer",
      `El valor ${field} no puede ser negativo.`,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const toTimestamp = (
  value,
  field,
) => {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new EloReplayError(
      "invalid_timestamp",
      `La fecha ${field} no es válida.`,
      {
        field,
        value,
      },
    );
  }

  return date;
};


/*
  ============================================================
  EVENTOS SOPORTADOS EN EL PREFLIGHT
  ============================================================
*/

const REPLAYABLE_EVENT_TYPES =
  new Set([
    "match_result",
    "placement_completed",
    "challenge_rejection",
  ]);


/*
  ============================================================
  OBTENER PARTIDO OBJETIVO
  ============================================================
*/

const getTargetMatch =
  async (
    client,
    matchId,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          m.*,

          p1.name AS
            player1_name,

          p1.city AS
            player1_city,

          p1.gender AS
            player1_gender,

          p2.name AS
            player2_name,

          p2.city AS
            player2_city,

          p2.gender AS
            player2_gender

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        WHERE
          m.id = $1
        `,
        [
          matchId,
        ],
      );

    if (
      !result.rowCount
    ) {
      throw new EloReplayError(
        "match_not_found",
        "Partido no encontrado.",
        {
          match_id:
            matchId,
        },
      );
    }

    const match =
      result.rows[0];

    if (
      match.annulled_at
    ) {
      throw new EloReplayError(
        "match_already_annulled",
        "Este partido ya fue anulado.",
        {
          match_id:
            Number(match.id),
        },
      );
    }

    if (
      match.status !==
      "completed"
    ) {
      throw new EloReplayError(
        "match_not_completed",
        "Solo puede prepararse replay para un partido finalizado.",
        {
          match_id:
            Number(match.id),

          status:
            match.status,
        },
      );
    }

    if (
      !match.completed_at
    ) {
      throw new EloReplayError(
        "match_without_completed_at",
        "El partido no posee fecha de finalización.",
        {
          match_id:
            Number(match.id),
        },
      );
    }

    toTimestamp(
      match.completed_at,
      "match.completed_at",
    );

    if (
      match.player1_city !==
        match.player2_city ||
      match.player1_gender !==
        match.player2_gender
    ) {
      throw new EloReplayError(
        "match_league_mismatch",
        "Los jugadores del partido no pertenecen a la misma liga.",
        {
          match_id:
            Number(match.id),

          player1_id:
            Number(
              match.player1_id,
            ),

          player2_id:
            Number(
              match.player2_id,
            ),
        },
      );
    }

    return {
      ...match,

      id:
        Number(match.id),

      player1_id:
        Number(
          match.player1_id,
        ),

      player2_id:
        Number(
          match.player2_id,
        ),

      winner_id:
        match.winner_id
          ? Number(
              match.winner_id,
            )
          : null,

      challenge_id:
        match.challenge_id
          ? Number(
              match.challenge_id,
            )
          : null,

      city:
        match.player1_city,

      gender:
        match.player1_gender,
    };
  };


/*
  ============================================================
  JUGADORES DE LA LIGA
  ============================================================
*/

const getLeaguePlayers =
  async (
    client,
    city,
    gender,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          name,
          rating,
          matches_played,
          role,
          verification_status,
          city,
          gender

        FROM users

        WHERE
          role = 'player'
          AND city = $1
          AND gender = $2

        ORDER BY
          id ASC
        `,
        [
          city,
          gender,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          Number(row.id),

        rating:
          toNonNegativeInteger(
            row.rating,
            `users.${row.id}.rating`,
          ),

        matches_played:
          toNonNegativeInteger(
            row.matches_played,
            `users.${row.id}.matches_played`,
          ),
      }),
    );
  };


/*
  ============================================================
  PARTIDOS DEL TRAMO DE REPLAY
  ============================================================
*/

const getReplayMatches =
  async (
    client,
    {
      city,
      gender,
      completedAt,
      targetMatchId,
    },
  ) => {
    const result =
      await client.query(
        `
        SELECT
          m.id,
          m.challenge_id,
          m.player1_id,
          m.player2_id,
          m.winner_id,
          m.score,
          m.completed_at,
          m.status,
          m.annulled_at

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        WHERE
          m.status = 'completed'

          AND m.annulled_at
            IS NULL

          AND p1.city = $1
          AND p1.gender = $2

          AND p2.city = $1
          AND p2.gender = $2

          AND (
            m.completed_at > $3

            OR (
              m.completed_at = $3
              AND m.id >= $4
            )
          )

        ORDER BY
          m.completed_at ASC,
          m.id ASC
        `,
        [
          city,
          gender,
          completedAt,
          targetMatchId,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          Number(row.id),

        challenge_id:
          row.challenge_id
            ? Number(
                row.challenge_id,
              )
            : null,

        player1_id:
          Number(
            row.player1_id,
          ),

        player2_id:
          Number(
            row.player2_id,
          ),

        winner_id:
          row.winner_id
            ? Number(
                row.winner_id,
              )
            : null,
      }),
    );
  };


/*
  ============================================================
  EVENTOS ELO ACTIVOS DEL TRAMO
  ============================================================
*/

const getReplayEloEvents =
  async (
    client,
    {
      playerIds,
      completedAt,
    },
  ) => {
    if (
      !playerIds.length
    ) {
      return [];
    }

    const result =
      await client.query(
        `
        SELECT
          id,
          user_id,
          match_id,
          challenge_id,
          event_type,
          elo_before,
          elo_change,
          elo_after,
          description,
          created_at,
          replay_batch_id,
          replayed_from_event_id

        FROM elo_events

        WHERE
          user_id =
            ANY($1::int[])

          AND reversed_at
            IS NULL

          AND created_at >= $2

        ORDER BY
          created_at ASC,
          id ASC
        `,
        [
          playerIds,
          completedAt,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          Number(row.id),

        user_id:
          Number(row.user_id),

        match_id:
          row.match_id
            ? Number(
                row.match_id,
              )
            : null,

        challenge_id:
          row.challenge_id
            ? Number(
                row.challenge_id,
              )
            : null,

        elo_before:
          toInteger(
            row.elo_before,
            `elo_events.${row.id}.elo_before`,
          ),

        elo_change:
          toInteger(
            row.elo_change,
            `elo_events.${row.id}.elo_change`,
          ),

        elo_after:
          toInteger(
            row.elo_after,
            `elo_events.${row.id}.elo_after`,
          ),

        replay_batch_id:
          row.replay_batch_id
            ? Number(
                row.replay_batch_id,
              )
            : null,

        replayed_from_event_id:
          row.replayed_from_event_id
            ? Number(
                row.replayed_from_event_id,
              )
            : null,
      }),
    );
  };


/*
  ============================================================
  VALIDACIÓN DE ARITMÉTICA
  ============================================================
*/

const validateEventArithmetic =
  (
    events,
  ) => {
    for (
      const event of
      events
    ) {
      if (
        event.elo_before +
          event.elo_change !==
        event.elo_after
      ) {
        throw new EloReplayError(
          "invalid_elo_event_arithmetic",
          "Existe un movimiento Elo cuya aritmética no cierra.",
          {
            event_id:
              event.id,

            event_type:
              event.event_type,

            elo_before:
              event.elo_before,

            elo_change:
              event.elo_change,

            elo_after:
              event.elo_after,
          },
        );
      }

      if (
        event.elo_before < 0 ||
        event.elo_after < 0
      ) {
        throw new EloReplayError(
          "negative_elo_event",
          "Existe un movimiento Elo con valores negativos.",
          {
            event_id:
              event.id,

            event_type:
              event.event_type,
          },
        );
      }
    }
  };


/*
  ============================================================
  VALIDACIÓN DE RELACIONES
  ============================================================
*/

const validateEventRelationships =
  (
    events,
  ) => {
    for (
      const event of
      events
    ) {
      if (
        (
          event.event_type ===
            "match_result" ||
          event.event_type ===
            "placement_completed"
        ) &&
        !event.match_id
      ) {
        throw new EloReplayError(
          "elo_event_without_match",
          "Existe un evento Elo deportivo sin partido asociado.",
          {
            event_id:
              event.id,

            event_type:
              event.event_type,
          },
        );
      }

      if (
        event.event_type ===
          "challenge_rejection" &&
        !event.challenge_id
      ) {
        throw new EloReplayError(
          "rejection_without_challenge",
          "Existe una penalización por rechazo sin desafío asociado.",
          {
            event_id:
              event.id,

            user_id:
              event.user_id,
          },
        );
      }
    }
  };


/*
  ============================================================
  EVENTOS NO SOPORTADOS
  ============================================================
*/

const getUnsupportedEvents =
  (
    events,
  ) =>
    events.filter(
      (event) =>
        !REPLAYABLE_EVENT_TYPES.has(
          event.event_type,
        ),
    );


/*
  ============================================================
  EVENTOS AGRUPADOS POR PARTIDO
  ============================================================
*/

const buildMatchEventMap =
  (
    events,
  ) => {
    const map =
      new Map();

    for (
      const event of
      events
    ) {
      if (
        !event.match_id
      ) {
        continue;
      }

      if (
        !map.has(
          event.match_id,
        )
      ) {
        map.set(
          event.match_id,
          [],
        );
      }

      map
        .get(
          event.match_id,
        )
        .push(
          event,
        );
    }

    return map;
  };


/*
  ============================================================
  VALIDAR PARTIDOS DEL TRAMO
  ============================================================
*/

const validateReplayMatches =
  ({
    matches,
    matchEventMap,
  }) => {
    for (
      const match of
      matches
    ) {
      const events =
        matchEventMap.get(
          match.id,
        ) || [];

      const resultEvents =
        events.filter(
          (event) =>
            event.event_type ===
            "match_result",
        );

      if (
        resultEvents.length !==
        2
      ) {
        throw new EloReplayError(
          "invalid_match_result_history",
          "Un partido del tramo de replay no tiene exactamente dos match_result activos.",
          {
            match_id:
              match.id,

            match_result_count:
              resultEvents.length,
          },
        );
      }

      const expectedPlayers =
        new Set([
          match.player1_id,
          match.player2_id,
        ]);

      const eventPlayers =
        new Set(
          resultEvents.map(
            (event) =>
              event.user_id,
          ),
        );

      if (
        eventPlayers.size !==
          2 ||
        ![
          ...expectedPlayers,
        ].every(
          (playerId) =>
            eventPlayers.has(
              playerId,
            ),
        )
      ) {
        throw new EloReplayError(
          "match_result_players_mismatch",
          "Los movimientos Elo de un partido no coinciden con sus participantes.",
          {
            match_id:
              match.id,

            expected_player_ids: [
              ...expectedPlayers,
            ],

            event_player_ids: [
              ...eventPlayers,
            ],
          },
        );
      }

      const placementEvents =
        events.filter(
          (event) =>
            event.event_type ===
            "placement_completed",
        );

      if (
        placementEvents.length >
        2
      ) {
        throw new EloReplayError(
          "invalid_placement_history",
          "Un partido contiene demasiados eventos placement_completed.",
          {
            match_id:
              match.id,

            placement_event_count:
              placementEvents.length,
          },
        );
      }
    }
  };


/*
  ============================================================
  CONTAR PARTIDOS DEL TRAMO POR JUGADOR
  ============================================================
*/

const buildReplayMatchCounts =
  (
    matches,
  ) => {
    const counts =
      new Map();

    for (
      const match of
      matches
    ) {
      for (
        const playerId of [
          match.player1_id,
          match.player2_id,
        ]
      ) {
        counts.set(
          playerId,
          (
            counts.get(
              playerId,
            ) || 0
          ) + 1,
        );
      }
    }

    return counts;
  };


/*
  ============================================================
  PRIMER EVENTO DEL TRAMO POR JUGADOR
  ============================================================
*/

const buildFirstEventByPlayer =
  (
    events,
  ) => {
    const map =
      new Map();

    for (
      const event of
      events
    ) {
      if (
        !map.has(
          event.user_id,
        )
      ) {
        map.set(
          event.user_id,
          event,
        );
      }
    }

    return map;
  };


/*
  ============================================================
  ESTADO BASE PREVIO AL REPLAY
  ============================================================
*/

const buildBaseline =
  ({
    players,
    replayMatches,
    replayEvents,
  }) => {
    const matchCounts =
      buildReplayMatchCounts(
        replayMatches,
      );

    const firstEventByPlayer =
      buildFirstEventByPlayer(
        replayEvents,
      );

    const baseline = [];

    for (
      const player of
      players
    ) {
      const replayMatchCount =
        matchCounts.get(
          player.id,
        ) || 0;

      const matchesBefore =
        player.matches_played -
        replayMatchCount;

      if (
        !Number.isInteger(
          matchesBefore,
        ) ||
        matchesBefore < 0
      ) {
        throw new EloReplayError(
          "invalid_matches_baseline",
          "No se puede reconstruir matches_played previo al replay.",
          {
            user_id:
              player.id,

            current_matches_played:
              player.matches_played,

            replay_match_count:
              replayMatchCount,

            calculated_matches_before:
              matchesBefore,
          },
        );
      }

      const firstEvent =
        firstEventByPlayer.get(
          player.id,
        ) || null;

      const ratingBefore =
        firstEvent
          ? firstEvent.elo_before
          : player.rating;

      if (
        !Number.isInteger(
          ratingBefore,
        ) ||
        ratingBefore < 0
      ) {
        throw new EloReplayError(
          "invalid_rating_baseline",
          "No se puede reconstruir el Elo previo al replay.",
          {
            user_id:
              player.id,

            calculated_rating_before:
              ratingBefore,
          },
        );
      }

      baseline.push({
        user_id:
          player.id,

        name:
          player.name,

        current_rating:
          player.rating,

        current_matches_played:
          player.matches_played,

        baseline_rating:
          ratingBefore,

        baseline_matches_played:
          matchesBefore,

        baseline_provisional:
          matchesBefore <
          PLACEMENT_MATCHES,

        first_replay_event_id:
          firstEvent?.id ||
          null,

        replay_match_count:
          replayMatchCount,

        verification_status:
          player.verification_status,
      });
    }

    return baseline;
  };


/*
  ============================================================
  CRONOLOGÍA PREVIEW
  ============================================================
*/

const buildChronologyPreview =
  ({
    matches,
    events,
    targetMatchId,
  }) => {
    const chronology = [];

    for (
      const match of
      matches
    ) {
      chronology.push({
        type:
          match.id ===
          targetMatchId
            ? "annul_target_match"
            : "replay_match",

        match_id:
          match.id,

        challenge_id:
          match.challenge_id,

        player1_id:
          match.player1_id,

        player2_id:
          match.player2_id,

        winner_id:
          match.winner_id,

        occurred_at:
          match.completed_at,
      });
    }

    for (
      const event of
      events
    ) {
      if (
        event.event_type !==
        "challenge_rejection"
      ) {
        continue;
      }

      chronology.push({
        type:
          "replay_challenge_rejection",

        elo_event_id:
          event.id,

        user_id:
          event.user_id,

        challenge_id:
          event.challenge_id,

        occurred_at:
          event.created_at,
      });
    }

    chronology.sort(
      (
        first,
        second,
      ) => {
        const firstTime =
          new Date(
            first.occurred_at,
          ).getTime();

        const secondTime =
          new Date(
            second.occurred_at,
          ).getTime();

        if (
          firstTime !==
          secondTime
        ) {
          return (
            firstTime -
            secondTime
          );
        }

        const firstMatchId =
          first.match_id ??
          Number.MAX_SAFE_INTEGER;

        const secondMatchId =
          second.match_id ??
          Number.MAX_SAFE_INTEGER;

        if (
          firstMatchId !==
          secondMatchId
        ) {
          return (
            firstMatchId -
            secondMatchId
          );
        }

        return (
          (
            first.elo_event_id ||
            0
          ) -
          (
            second.elo_event_id ||
            0
          )
        );
      },
    );

    return chronology;
  };


/*
  ============================================================
  PLAN DE REPLAY

  READ ONLY.
  ============================================================
*/

export const buildEloReplayPlan =
  async (
    client,
    matchId,
  ) => {
    const numericMatchId =
      toNonNegativeInteger(
        matchId,
        "matchId",
      );

    if (
      numericMatchId < 1
    ) {
      throw new EloReplayError(
        "invalid_match_id",
        "El id del partido no es válido.",
        {
          match_id:
            matchId,
        },
      );
    }

    const targetMatch =
      await getTargetMatch(
        client,
        numericMatchId,
      );

    const players =
      await getLeaguePlayers(
        client,
        targetMatch.city,
        targetMatch.gender,
      );

    if (
      !players.length
    ) {
      throw new EloReplayError(
        "empty_league",
        "No se encontraron jugadores para la liga del partido.",
        {
          city:
            targetMatch.city,

          gender:
            targetMatch.gender,
        },
      );
    }

    const playerIds =
      players.map(
        (player) =>
          player.id,
      );

    const replayMatches =
      await getReplayMatches(
        client,
        {
          city:
            targetMatch.city,

          gender:
            targetMatch.gender,

          completedAt:
            targetMatch.completed_at,

          targetMatchId:
            targetMatch.id,
        },
      );

    const targetIncluded =
      replayMatches.some(
        (match) =>
          match.id ===
          targetMatch.id,
      );

    if (
      !targetIncluded
    ) {
      throw new EloReplayError(
        "target_missing_from_replay_range",
        "El partido objetivo no aparece en su propio tramo histórico.",
        {
          match_id:
            targetMatch.id,
        },
      );
    }

    const replayEvents =
      await getReplayEloEvents(
        client,
        {
          playerIds,

          completedAt:
            targetMatch.completed_at,
        },
      );

    validateEventArithmetic(
      replayEvents,
    );

    validateEventRelationships(
      replayEvents,
    );

    const unsupportedEvents =
      getUnsupportedEvents(
        replayEvents,
      );

    if (
      unsupportedEvents.length
    ) {
      throw new EloReplayError(
        "unsupported_elo_events",
        "El tramo contiene movimientos Elo que todavía no pueden ser recalculados automáticamente.",
        {
          events:
            unsupportedEvents.map(
              (event) => ({
                id:
                  event.id,

                user_id:
                  event.user_id,

                event_type:
                  event.event_type,

                match_id:
                  event.match_id,

                challenge_id:
                  event.challenge_id,

                created_at:
                  event.created_at,
              }),
            ),
        },
      );
    }

    const matchEventMap =
      buildMatchEventMap(
        replayEvents,
      );

    validateReplayMatches({
      matches:
        replayMatches,

      matchEventMap,
    });

    const baseline =
      buildBaseline({
        players,
        replayMatches,
        replayEvents,
      });

    const chronology =
      buildChronologyPreview({
        matches:
          replayMatches,

        events:
          replayEvents,

        targetMatchId:
          targetMatch.id,
      });

    const targetEvents =
      matchEventMap.get(
        targetMatch.id,
      ) || [];

    const targetMatchResults =
      targetEvents.filter(
        (event) =>
          event.event_type ===
          "match_result",
      );

    if (
      targetMatchResults.length !==
      2
    ) {
      throw new EloReplayError(
        "target_invalid_elo_history",
        "El partido objetivo no posee exactamente dos match_result activos.",
        {
          match_id:
            targetMatch.id,

          result_event_count:
            targetMatchResults.length,
        },
      );
    }

    const rejectionEvents =
      replayEvents.filter(
        (event) =>
          event.event_type ===
          "challenge_rejection",
      );

    const placementEvents =
      replayEvents.filter(
        (event) =>
          event.event_type ===
          "placement_completed",
      );

    return {
      ready:
        true,

      read_only:
        true,

      target_match: {
        id:
          targetMatch.id,

        challenge_id:
          targetMatch.challenge_id,

        player1_id:
          targetMatch.player1_id,

        player2_id:
          targetMatch.player2_id,

        winner_id:
          targetMatch.winner_id,

        completed_at:
          targetMatch.completed_at,

        city:
          targetMatch.city,

        gender:
          targetMatch.gender,
      },

      league: {
        city:
          targetMatch.city,

        gender:
          targetMatch.gender,

        players:
          players.length,
      },

      replay_range: {
        starts_at:
          targetMatch.completed_at,

        matches_total_including_target:
          replayMatches.length,

        matches_to_recalculate:
          Math.max(
            0,
            replayMatches.length -
              1,
          ),

        active_elo_events:
          replayEvents.length,

        challenge_rejections:
          rejectionEvents.length,

        placement_events_to_regenerate:
          placementEvents.length,
      },

      baseline,

      chronology,

      safeguards: {
        target_present:
          true,

        target_match_result_events:
          targetMatchResults.length,

        unsupported_active_events:
          0,

        every_completed_match_has_two_results:
          true,

        arithmetic_valid:
          true,
      },
    };
  };