import {
  buildOfficialRankingSnapshot,
  calculateChallengeRejectionElo,
  calculateMatchElo,
  getMatchResultDescription,
  getPlacementCompletedDescription,
} from "./eloMatch.service.js";


/*
  ============================================================
  MOTOR DE EJECUCIÓN DE REPLAY HISTÓRICO
  ============================================================

  OBJETIVO

  Cuando un administrador anula un partido histórico,
  no alcanza con devolver el delta Elo original.

  Elo es dependiente del camino.

  Por eso:

  1. reconstruimos el estado inmediatamente anterior
     al partido anulado;

  2. eliminamos matemáticamente ese partido;

  3. reproducimos cronológicamente todos los eventos
     deportivos posteriores de esa liga;

  4. recalculamos:
     - Elo
     - matches_played
     - provisional / oficial
     - placement
     - piso de graduación
     - regla del #1
     - penalizaciones por rechazo;

  5. dejamos preparado el nuevo historial Elo.

  ESTE SERVICIO:

  - trabaja dentro de una transacción existente;
  - NO hace BEGIN;
  - NO hace COMMIT;
  - NO hace ROLLBACK.

  El controlador/admin service que lo invoque
  es dueño de la transacción.
  ============================================================
*/


/*
  ============================================================
  ERROR
  ============================================================
*/

export class EloReplayExecutionError extends Error {
  constructor(
    message,
    reason = "elo_replay_execution_error",
    details = null,
  ) {
    super(message);

    this.name =
      "EloReplayExecutionError";

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

const asNumber =
  (
    value,
    field,
  ) => {
    const number =
      Number(value);

    if (
      !Number.isFinite(number)
    ) {
      throw new EloReplayExecutionError(
        `Valor numérico inválido en ${field}.`,
        "invalid_numeric_value",
        {
          field,
          value,
        },
      );
    }

    return number;
  };


const asInteger =
  (
    value,
    field,
  ) => {
    const number =
      asNumber(
        value,
        field,
      );

    if (
      !Number.isInteger(number)
    ) {
      throw new EloReplayExecutionError(
        `Valor entero inválido en ${field}.`,
        "invalid_integer_value",
        {
          field,
          value,
        },
      );
    }

    return number;
  };


const asNonNegativeInteger =
  (
    value,
    field,
  ) => {
    const number =
      asInteger(
        value,
        field,
      );

    if (
      number < 0
    ) {
      throw new EloReplayExecutionError(
        `${field} no puede ser negativo.`,
        "negative_value",
        {
          field,
          value:
            number,
        },
      );
    }

    return number;
  };


const cloneState =
  (
    state,
  ) => {
    const cloned =
      new Map();

    for (
      const [
        userId,
        player,
      ] of state.entries()
    ) {
      cloned.set(
        userId,
        {
          ...player,
        },
      );
    }

    return cloned;
  };


const serializeState =
  (
    state,
  ) =>
    Array.from(
      state.values(),
    )
      .map(
        (player) => ({
          id:
            player.id,

          name:
            player.name,

          rating:
            player.rating,

          matches_played:
            player.matches_played,

          city:
            player.city,

          gender:
            player.gender,

          role:
            player.role,

          verification_status:
            player.verification_status,
        }),
      )
      .sort(
        (a, b) =>
          a.id -
          b.id,
      );


const getPlayer =
  (
    state,
    userId,
  ) => {
    const id =
      asInteger(
        userId,
        "userId",
      );

    const player =
      state.get(id);

    if (
      !player
    ) {
      throw new EloReplayExecutionError(
        `No existe el jugador ${id} en el estado reconstruido.`,
        "replay_player_missing",
        {
          user_id:
            id,
        },
      );
    }

    return player;
  };


const setPlayer =
  (
    state,
    player,
  ) => {
    state.set(
      player.id,
      {
        ...player,
      },
    );
  };


const normalizeDate =
  (
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
      throw new EloReplayExecutionError(
        `Fecha inválida en ${field}.`,
        "invalid_replay_date",
        {
          field,
          value,
        },
      );
    }

    return date;
  };


const compareChronology =
  (
    a,
    b,
  ) => {
    const aTime =
      normalizeDate(
        a.occurred_at,
        "chronology.occurred_at",
      ).getTime();

    const bTime =
      normalizeDate(
        b.occurred_at,
        "chronology.occurred_at",
      ).getTime();

    if (
      aTime !==
      bTime
    ) {
      return (
        aTime -
        bTime
      );
    }

    const typeWeight = {
      match:
        1,

      challenge_rejection:
        2,
    };

    const aWeight =
      typeWeight[a.type] ??
      99;

    const bWeight =
      typeWeight[b.type] ??
      99;

    if (
      aWeight !==
      bWeight
    ) {
      return (
        aWeight -
        bWeight
      );
    }

    return (
      asInteger(
        a.source_id,
        "chronology.source_id",
      ) -
      asInteger(
        b.source_id,
        "chronology.source_id",
      )
    );
  };


/*
  ============================================================
  LEER COLUMNAS DE MIGRATION_009
  ============================================================
*/

const assertReplayInfrastructure =
  async (
    client,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          to_regclass(
            'public.elo_replay_batches'
          ) IS NOT NULL
            AS replay_table_exists,

          EXISTS (
            SELECT 1

            FROM information_schema.columns

            WHERE
              table_schema = 'public'
              AND table_name = 'elo_events'
              AND column_name = 'replay_batch_id'
          ) AS replay_batch_column_exists,

          EXISTS (
            SELECT 1

            FROM information_schema.columns

            WHERE
              table_schema = 'public'
              AND table_name = 'elo_events'
              AND column_name = 'replayed_from_event_id'
          ) AS replay_source_column_exists
        `,
      );

    const row =
      result.rows[0];

    if (
      !row?.replay_table_exists ||
      !row?.replay_batch_column_exists ||
      !row?.replay_source_column_exists
    ) {
      throw new EloReplayExecutionError(
        "La infraestructura de migration_009 no está completa.",
        "replay_migration_missing",
      );
    }
  };


/*
  ============================================================
  CARGAR PARTIDO OBJETIVO
  ============================================================
*/

const loadTargetMatch =
  async (
    client,
    matchId,
  ) => {
    const id =
      asInteger(
        matchId,
        "matchId",
      );

    const result =
      await client.query(
        `
        SELECT
          m.*,

          p1.city AS league_city,
          p1.gender AS league_gender,

          p1.role AS player1_role,
          p2.role AS player2_role,

          p1.verification_status
            AS player1_verification_status,

          p2.verification_status
            AS player2_verification_status

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        WHERE
          m.id = $1

        FOR UPDATE OF m
        `,
        [
          id,
        ],
      );

    if (
      !result.rowCount
    ) {
      throw new EloReplayExecutionError(
        "Partido no encontrado.",
        "match_not_found",
        {
          match_id:
            id,
        },
      );
    }

    const match =
      result.rows[0];

    if (
      match.status !==
      "completed"
    ) {
      throw new EloReplayExecutionError(
        "Solo puede hacerse replay desde un partido finalizado.",
        "match_not_completed",
        {
          match_id:
            id,

          status:
            match.status,
        },
      );
    }

    if (
      match.annulled_at
    ) {
      throw new EloReplayExecutionError(
        "El partido ya está anulado.",
        "match_already_annulled",
        {
          match_id:
            id,
        },
      );
    }

    if (
      !match.completed_at
    ) {
      throw new EloReplayExecutionError(
        "El partido no posee completed_at.",
        "match_completed_at_missing",
        {
          match_id:
            id,
        },
      );
    }

    if (
      !match.winner_id
    ) {
      throw new EloReplayExecutionError(
        "El partido no posee ganador.",
        "match_winner_missing",
        {
          match_id:
            id,
        },
      );
    }

    if (
      match.league_city ===
        null ||
      match.league_city ===
        undefined ||
      match.league_gender ===
        null ||
      match.league_gender ===
        undefined
    ) {
      throw new EloReplayExecutionError(
        "No se pudo determinar la liga del partido.",
        "match_league_missing",
        {
          match_id:
            id,
        },
      );
    }

    return {
      ...match,

      id:
        asInteger(
          match.id,
          "match.id",
        ),

      player1_id:
        asInteger(
          match.player1_id,
          "match.player1_id",
        ),

      player2_id:
        asInteger(
          match.player2_id,
          "match.player2_id",
        ),

      winner_id:
        asInteger(
          match.winner_id,
          "match.winner_id",
        ),
    };
  };


/*
  ============================================================
  CARGAR JUGADORES DE LA LIGA
  ============================================================
*/

const loadLeaguePlayers =
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
          city,
          gender,
          role,
          verification_status

        FROM users

        WHERE
          role = 'player'
          AND city = $1
          AND gender = $2

        ORDER BY
          id ASC

        FOR UPDATE
        `,
        [
          city,
          gender,
        ],
      );

    if (
      !result.rowCount
    ) {
      throw new EloReplayExecutionError(
        "La liga no posee jugadores para reconstruir.",
        "league_players_missing",
        {
          city,
          gender,
        },
      );
    }

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          asInteger(
            row.id,
            "users.id",
          ),

        rating:
          asNonNegativeInteger(
            row.rating,
            "users.rating",
          ),

        matches_played:
          asNonNegativeInteger(
            row.matches_played,
            "users.matches_played",
          ),
      }),
    );
  };


/*
  ============================================================
  CARGAR PARTIDOS DESDE EL OBJETIVO
  ============================================================
*/

const loadReplayMatches =
  async (
    client,
    target,
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
          m.completed_at

        FROM matches m

        JOIN users p1
          ON p1.id =
             m.player1_id

        JOIN users p2
          ON p2.id =
             m.player2_id

        WHERE
          m.status = 'completed'
          AND m.annulled_at IS NULL

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

        FOR UPDATE OF m
        `,
        [
          target.league_city,
          target.league_gender,
          target.completed_at,
          target.id,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          asInteger(
            row.id,
            "matches.id",
          ),

        challenge_id:
          row.challenge_id
            ? asInteger(
                row.challenge_id,
                "matches.challenge_id",
              )
            : null,

        player1_id:
          asInteger(
            row.player1_id,
            "matches.player1_id",
          ),

        player2_id:
          asInteger(
            row.player2_id,
            "matches.player2_id",
          ),

        winner_id:
          asInteger(
            row.winner_id,
            "matches.winner_id",
          ),
      }),
    );
  };


/*
  ============================================================
  EVENTOS ELO ACTIVOS DESDE EL OBJETIVO
  ============================================================
*/

const loadActiveReplayEvents =
  async (
    client,
    leaguePlayerIds,
    targetCompletedAt,
  ) => {
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

          AND created_at >=
            $2

        ORDER BY
          created_at ASC,
          id ASC

        FOR UPDATE
        `,
        [
          leaguePlayerIds,
          targetCompletedAt,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          asInteger(
            row.id,
            "elo_events.id",
          ),

        user_id:
          asInteger(
            row.user_id,
            "elo_events.user_id",
          ),

        match_id:
          row.match_id
            ? asInteger(
                row.match_id,
                "elo_events.match_id",
              )
            : null,

        challenge_id:
          row.challenge_id
            ? asInteger(
                row.challenge_id,
                "elo_events.challenge_id",
              )
            : null,

        elo_before:
          asNonNegativeInteger(
            row.elo_before,
            "elo_events.elo_before",
          ),

        elo_change:
          asInteger(
            row.elo_change,
            "elo_events.elo_change",
          ),

        elo_after:
          asNonNegativeInteger(
            row.elo_after,
            "elo_events.elo_after",
          ),
      }),
    );
  };


/*
  ============================================================
  VALIDAR EVENTOS SOPORTADOS
  ============================================================
*/

const validateSupportedEvents =
  (
    events,
  ) => {
    const supported =
      new Set([
        "match_result",
        "placement_completed",
        "challenge_rejection",
      ]);

    const unsupported =
      events.filter(
        (event) =>
          !supported.has(
            event.event_type,
          ),
      );

    if (
      unsupported.length
    ) {
      throw new EloReplayExecutionError(
        "Existen movimientos Elo históricos que el replay todavía no puede reconstruir.",
        "unsupported_elo_events",
        {
          events:
            unsupported.map(
              (event) => ({
                id:
                  event.id,

                user_id:
                  event.user_id,

                match_id:
                  event.match_id,

                challenge_id:
                  event.challenge_id,

                event_type:
                  event.event_type,

                created_at:
                  event.created_at,
              }),
            ),
        },
      );
    }
  };


/*
  ============================================================
  VALIDAR ARITMÉTICA HISTÓRICA
  ============================================================
*/

const validateHistoricalArithmetic =
  (
    events,
  ) => {
    for (
      const event of events
    ) {
      if (
        event.elo_before +
          event.elo_change !==
        event.elo_after
      ) {
        throw new EloReplayExecutionError(
          `El evento Elo #${event.id} posee aritmética inconsistente.`,
          "historical_elo_arithmetic_invalid",
          {
            event_id:
              event.id,

            elo_before:
              event.elo_before,

            elo_change:
              event.elo_change,

            elo_after:
              event.elo_after,
          },
        );
      }
    }
  };


/*
  ============================================================
  MAPA DE EVENTOS POR PARTIDO
  ============================================================
*/

const buildMatchEventMap =
  (
    events,
  ) => {
    const map =
      new Map();

    for (
      const event of events
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
  VALIDAR HISTORIAL DE PARTIDOS
  ============================================================
*/

const validateMatchHistory =
  (
    matches,
    matchEventMap,
  ) => {
    for (
      const match of matches
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
        throw new EloReplayExecutionError(
          `El partido #${match.id} no posee exactamente dos eventos match_result activos.`,
          "invalid_match_result_history",
          {
            match_id:
              match.id,

            event_ids:
              resultEvents.map(
                (event) =>
                  event.id,
              ),
          },
        );
      }

      const participants =
        new Set([
          match.player1_id,
          match.player2_id,
        ]);

      for (
        const event of resultEvents
      ) {
        if (
          !participants.has(
            event.user_id,
          )
        ) {
          throw new EloReplayExecutionError(
            `El partido #${match.id} posee un evento Elo de un jugador ajeno al partido.`,
            "match_event_player_mismatch",
            {
              match_id:
                match.id,

              event_id:
                event.id,

              user_id:
                event.user_id,
            },
          );
        }
      }

      const uniqueUsers =
        new Set(
          resultEvents.map(
            (event) =>
              event.user_id,
          ),
        );

      if (
        uniqueUsers.size !==
        2
      ) {
        throw new EloReplayExecutionError(
          `Los eventos Elo del partido #${match.id} no representan a ambos jugadores.`,
          "duplicate_match_result_player",
          {
            match_id:
              match.id,
          },
        );
      }
    }
  };


/*
  ============================================================
  CALCULAR BASELINE
  ============================================================
*/

const buildBaselineState =
  ({
    players,
    replayMatches,
    events,
  }) => {
    const state =
      new Map();

    const matchesInsideRange =
      new Map();

    for (
      const player of players
    ) {
      matchesInsideRange.set(
        player.id,
        0,
      );
    }

    for (
      const match of replayMatches
    ) {
      matchesInsideRange.set(
        match.player1_id,
        (
          matchesInsideRange.get(
            match.player1_id,
          ) || 0
        ) + 1,
      );

      matchesInsideRange.set(
        match.player2_id,
        (
          matchesInsideRange.get(
            match.player2_id,
          ) || 0
        ) + 1,
      );
    }

    const firstEventByUser =
      new Map();

    for (
      const event of events
    ) {
      if (
        !firstEventByUser.has(
          event.user_id,
        )
      ) {
        firstEventByUser.set(
          event.user_id,
          event,
        );
      }
    }

    for (
      const player of players
    ) {
      const removedMatches =
        matchesInsideRange.get(
          player.id,
        ) || 0;

      const baselineMatches =
        player.matches_played -
        removedMatches;

      if (
        baselineMatches < 0
      ) {
        throw new EloReplayExecutionError(
          `No puede reconstruirse matches_played del jugador #${player.id}.`,
          "baseline_matches_negative",
          {
            user_id:
              player.id,

            current_matches_played:
              player.matches_played,

            replay_range_matches:
              removedMatches,
          },
        );
      }

      const firstEvent =
        firstEventByUser.get(
          player.id,
        );

      const baselineRating =
        firstEvent
          ? firstEvent.elo_before
          : player.rating;

      state.set(
        player.id,
        {
          ...player,

          rating:
            baselineRating,

          matches_played:
            baselineMatches,
        },
      );
    }

    return state;
  };


/*
  ============================================================
  CONSTRUIR CRONOLOGÍA
  ============================================================
*/

const buildChronology =
  ({
    target,
    replayMatches,
    events,
  }) => {
    const chronology =
      [];

    for (
      const match of replayMatches
    ) {
      if (
        match.id ===
        target.id
      ) {
        continue;
      }

      chronology.push({
        type:
          "match",

        source_id:
          match.id,

        occurred_at:
          match.completed_at,

        match,
      });
    }

    for (
      const event of events
    ) {
      if (
        event.event_type !==
        "challenge_rejection"
      ) {
        continue;
      }

      chronology.push({
        type:
          "challenge_rejection",

        source_id:
          event.id,

        occurred_at:
          event.created_at,

        event,
      });
    }

    chronology.sort(
      compareChronology,
    );

    return chronology;
  };


/*
  ============================================================
  CREAR BATCH
  ============================================================
*/

const createReplayBatch =
  async (
    client,
    {
      target,
      adminUserId,
      reason,
    },
  ) => {
    const columnsResult =
      await client.query(
        `
        SELECT
          column_name

        FROM information_schema.columns

        WHERE
          table_schema = 'public'
          AND table_name =
            'elo_replay_batches'
        `,
      );

    const columns =
      new Set(
        columnsResult.rows.map(
          (row) =>
            row.column_name,
        ),
      );

    const names =
      [];

    const values =
      [];

    const params =
      [];

    const push =
      (
        column,
        value,
      ) => {
        if (
          !columns.has(
            column,
          )
        ) {
          return;
        }

        names.push(
          column,
        );

        values.push(
          `$${values.length + 1}`,
        );

        params.push(
          value,
        );
      };

    push(
      "annulled_match_id",
      target.id,
    );

    push(
      "requested_by",
      adminUserId,
    );

    push(
      "created_by",
      adminUserId,
    );

    push(
      "admin_user_id",
      adminUserId,
    );

    push(
      "reason",
      reason,
    );

    push(
      "status",
      "running",
    );

    push(
      "league_city",
      target.league_city,
    );

    push(
      "league_gender",
      target.league_gender,
    );

    if (
      !names.includes(
        "annulled_match_id",
      )
    ) {
      throw new EloReplayExecutionError(
        "elo_replay_batches no posee annulled_match_id.",
        "invalid_replay_batch_schema",
      );
    }

    const result =
      await client.query(
        `
        INSERT INTO elo_replay_batches (
          ${names.join(", ")}
        )

        VALUES (
          ${values.join(", ")}
        )

        RETURNING *
        `,
        params,
      );

    return result.rows[0];
  };


/*
  ============================================================
  MARCAR EVENTOS ORIGINALES COMO REVERTIDOS
  ============================================================
*/

const reverseOriginalEvents =
  async (
    client,
    {
      events,
      adminUserId,
      replayBatchId,
    },
  ) => {
    if (
      !events.length
    ) {
      return;
    }

    const ids =
      events.map(
        (event) =>
          event.id,
      );

    await client.query(
      `
      UPDATE elo_events

      SET
        reversed_at =
          CURRENT_TIMESTAMP,

        reversed_by =
          $1,

        replay_batch_id =
          COALESCE(
            replay_batch_id,
            $2
          )

      WHERE
        id =
          ANY($3::int[])

        AND reversed_at
          IS NULL
      `,
      [
        adminUserId,
        replayBatchId,
        ids,
      ],
    );
  };


/*
  ============================================================
  INSERTAR EVENTO REPRODUCIDO
  ============================================================
*/

const insertReplayEvent =
  async (
    client,
    {
      replayBatchId,
      sourceEventId = null,
      userId,
      matchId = null,
      challengeId = null,
      eventType,
      eloBefore,
      eloChange,
      eloAfter,
      description,
      createdAt,
    },
  ) => {
    const result =
      await client.query(
        `
        INSERT INTO elo_events (
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
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )

        RETURNING *
        `,
        [
          userId,
          matchId,
          challengeId,
          eventType,
          eloBefore,
          eloChange,
          eloAfter,
          description,
          createdAt,
          replayBatchId,
          sourceEventId,
        ],
      );

    return result.rows[0];
  };


/*
  ============================================================
  ENCONTRAR EVENTO FUENTE
  ============================================================
*/

const findSourceEvent =
  (
    matchEventMap,
    {
      matchId,
      userId,
      eventType,
    },
  ) => {
    const events =
      matchEventMap.get(
        matchId,
      ) || [];

    return (
      events.find(
        (event) =>
          event.user_id ===
            userId &&
          event.event_type ===
            eventType,
      ) ||
      null
    );
  };


/*
  ============================================================
  REPRODUCIR PARTIDO
  ============================================================
*/

const replayMatch =
  async (
    client,
    {
      state,
      match,
      target,
      replayBatchId,
      matchEventMap,
      createdEvents,
    },
  ) => {
    const winnerId =
      match.winner_id;

    const loserId =
      winnerId ===
      match.player1_id
        ? match.player2_id
        : match.player1_id;

    if (
      winnerId !==
        match.player1_id &&
      winnerId !==
        match.player2_id
    ) {
      throw new EloReplayExecutionError(
        `El ganador del partido #${match.id} no pertenece al partido.`,
        "invalid_match_winner",
        {
          match_id:
            match.id,

          winner_id:
            winnerId,
        },
      );
    }

    const winner =
      getPlayer(
        state,
        winnerId,
      );

    const loser =
      getPlayer(
        state,
        loserId,
      );

    const rankingBefore =
      buildOfficialRankingSnapshot(
        serializeState(
          state,
        ),
        {
          city:
            target.league_city,

          gender:
            target.league_gender,
        },
      );

    const calculation =
      calculateMatchElo({
        winner,
        loser,
        rankingBefore,
      });

    setPlayer(
      state,
      {
        ...winner,

        rating:
          calculation
            .winner
            .final_elo_after,

        matches_played:
          calculation
            .winner
            .matches_after,
      },
    );

    setPlayer(
      state,
      {
        ...loser,

        rating:
          calculation
            .loser
            .final_elo_after,

        matches_played:
          calculation
            .loser
            .matches_after,
      },
    );

    const winnerSource =
      findSourceEvent(
        matchEventMap,
        {
          matchId:
            match.id,

          userId:
            winnerId,

          eventType:
            "match_result",
        },
      );

    const loserSource =
      findSourceEvent(
        matchEventMap,
        {
          matchId:
            match.id,

          userId:
            loserId,

          eventType:
            "match_result",
        },
      );

    if (
      !winnerSource ||
      !loserSource
    ) {
      throw new EloReplayExecutionError(
        `No se encontraron los eventos fuente del partido #${match.id}.`,
        "source_match_events_missing",
        {
          match_id:
            match.id,
        },
      );
    }

    const winnerEvent =
      await insertReplayEvent(
        client,
        {
          replayBatchId,

          sourceEventId:
            winnerSource.id,

          userId:
            winnerId,

          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          eventType:
            "match_result",

          eloBefore:
            calculation
              .winner
              .elo_before,

          eloChange:
            calculation
              .winner
              .elo_change,

          eloAfter:
            calculation
              .winner
              .elo_after_match,

          description:
            getMatchResultDescription({
              matchId:
                match.id,

              playerType:
                "winner",

              calculation:
                calculation
                  .winner
                  .calculation,
            }),

          createdAt:
            winnerSource.created_at,
        },
      );

    createdEvents.push(
      winnerEvent,
    );

    const loserEvent =
      await insertReplayEvent(
        client,
        {
          replayBatchId,

          sourceEventId:
            loserSource.id,

          userId:
            loserId,

          matchId:
            match.id,

          challengeId:
            match.challenge_id,

          eventType:
            "match_result",

          eloBefore:
            calculation
              .loser
              .elo_before,

          eloChange:
            calculation
              .loser
              .elo_change,

          eloAfter:
            calculation
              .loser
              .elo_after_match,

          description:
            getMatchResultDescription({
              matchId:
                match.id,

              playerType:
                "loser",

              calculation:
                calculation
                  .loser
                  .calculation,

              dethroneApplied:
                calculation
                  .number_one_dethrone
                  .applied,
            }),

          createdAt:
            loserSource.created_at,
        },
      );

    createdEvents.push(
      loserEvent,
    );

    if (
      calculation
        .winner
        .placement_floor_adjustment >
      0
    ) {
      const oldSource =
        findSourceEvent(
          matchEventMap,
          {
            matchId:
              match.id,

            userId:
              winnerId,

            eventType:
              "placement_completed",
          },
        );

      const event =
        await insertReplayEvent(
          client,
          {
            replayBatchId,

            sourceEventId:
              oldSource?.id ||
              null,

            userId:
              winnerId,

            matchId:
              match.id,

            challengeId:
              match.challenge_id,

            eventType:
              "placement_completed",

            eloBefore:
              calculation
                .winner
                .elo_after_match,

            eloChange:
              calculation
                .winner
                .placement_floor_adjustment,

            eloAfter:
              calculation
                .winner
                .final_elo_after,

            description:
              getPlacementCompletedDescription(
                match.id,
              ),

            createdAt:
              oldSource?.created_at ||
              winnerSource.created_at,
          },
        );

      createdEvents.push(
        event,
      );
    }

    if (
      calculation
        .loser
        .placement_floor_adjustment >
      0
    ) {
      const oldSource =
        findSourceEvent(
          matchEventMap,
          {
            matchId:
              match.id,

            userId:
              loserId,

            eventType:
              "placement_completed",
          },
        );

      const event =
        await insertReplayEvent(
          client,
          {
            replayBatchId,

            sourceEventId:
              oldSource?.id ||
              null,

            userId:
              loserId,

            matchId:
              match.id,

            challengeId:
              match.challenge_id,

            eventType:
              "placement_completed",

            eloBefore:
              calculation
                .loser
                .elo_after_match,

            eloChange:
              calculation
                .loser
                .placement_floor_adjustment,

            eloAfter:
              calculation
                .loser
                .final_elo_after,

            description:
              getPlacementCompletedDescription(
                match.id,
              ),

            createdAt:
              oldSource?.created_at ||
              loserSource.created_at,
          },
        );

      createdEvents.push(
        event,
      );
    }

    return {
      match_id:
        match.id,

      winner_id:
        winnerId,

      loser_id:
        loserId,

      calculation,
    };
  };


/*
  ============================================================
  REPRODUCIR RECHAZO
  ============================================================
*/

const replayChallengeRejection =
  async (
    client,
    {
      state,
      chronologyEvent,
      replayBatchId,
      createdEvents,
    },
  ) => {
    const source =
      chronologyEvent.event;

    const player =
      getPlayer(
        state,
        source.user_id,
      );

    const calculation =
      calculateChallengeRejectionElo({
        rating:
          player.rating,

        matchesPlayed:
          player.matches_played,
      });

    setPlayer(
      state,
      {
        ...player,

        rating:
          calculation
            .elo_after,
      },
    );

    const event =
      await insertReplayEvent(
        client,
        {
          replayBatchId,

          sourceEventId:
            source.id,

          userId:
            source.user_id,

          matchId:
            source.match_id,

          challengeId:
            source.challenge_id,

          eventType:
            "challenge_rejection",

          eloBefore:
            calculation
              .elo_before,

          eloChange:
            calculation
              .elo_change,

          eloAfter:
            calculation
              .elo_after,

          description:
            source.description ||
            "Penalización Elo por rechazo de desafío.",

          createdAt:
            source.created_at,
        },
      );

    createdEvents.push(
      event,
    );

    return {
      source_event_id:
        source.id,

      user_id:
        source.user_id,

      calculation,
    };
  };


/*
  ============================================================
  ACTUALIZAR USUARIOS CON ESTADO RECONSTRUIDO
  ============================================================
*/

const persistFinalState =
  async (
    client,
    state,
  ) => {
    const updated =
      [];

    for (
      const player of state.values()
    ) {
      const result =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,
            matches_played = $2,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $3

          RETURNING
            id,
            name,
            rating,
            matches_played
          `,
          [
            player.rating,
            player.matches_played,
            player.id,
          ],
        );

      if (
        result.rowCount !==
        1
      ) {
        throw new EloReplayExecutionError(
          `No se pudo persistir el estado del jugador #${player.id}.`,
          "player_state_update_failed",
          {
            user_id:
              player.id,
          },
        );
      }

      updated.push(
        result.rows[0],
      );
    }

    return updated;
  };


/*
  ============================================================
  ANULAR PARTIDO OBJETIVO
  ============================================================
*/

const persistTargetAnnulment =
  async (
    client,
    {
      target,
      adminUserId,
      reason,
    },
  ) => {
    const result =
      await client.query(
        `
        UPDATE matches

        SET
          annulled_at =
            CURRENT_TIMESTAMP,

          annulled_by =
            $1,

          annul_reason =
            $2,

          status =
            'annulled'

        WHERE
          id = $3

          AND status =
            'completed'

          AND annulled_at
            IS NULL

        RETURNING *
        `,
        [
          adminUserId,
          reason,
          target.id,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new EloReplayExecutionError(
        "No se pudo anular el partido objetivo.",
        "target_annulment_failed",
        {
          match_id:
            target.id,
        },
      );
    }

    return result.rows[0];
  };


/*
  ============================================================
  ANULAR DESAFÍO ASOCIADO
  ============================================================
*/

const annulTargetChallenge =
  async (
    client,
    target,
  ) => {
    if (
      !target.challenge_id
    ) {
      return null;
    }

    const result =
      await client.query(
        `
        UPDATE challenges

        SET
          status =
            'annulled',

          resolved_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $1

          AND status =
            'completed'

        RETURNING *
        `,
        [
          target.challenge_id,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      throw new EloReplayExecutionError(
        "El desafío asociado no está en un estado válido para anularse.",
        "challenge_state_invalid",
        {
          challenge_id:
            target.challenge_id,
        },
      );
    }

    return result.rows[0];
  };


/*
  ============================================================
  RESOLVER ALERTAS DEL PARTIDO
  ============================================================
*/

const resolveTargetFlags =
  async (
    client,
    {
      target,
      adminUserId,
    },
  ) => {
    await client.query(
      `
      UPDATE match_audit_flags

      SET
        resolved =
          TRUE,

        resolved_at =
          CURRENT_TIMESTAMP,

        resolved_by =
          $1

      WHERE
        match_id =
          $2

        AND resolved =
          FALSE
      `,
      [
        adminUserId,
        target.id,
      ],
    );
  };


/*
  ============================================================
  AUDIT EVENT
  ============================================================
*/

const createReplayAuditEvent =
  async (
    client,
    {
      adminUserId,
      target,
      replayBatchId,
      reason,
      replayedMatches,
      replayedRejections,
      createdEvents,
      reversedEvents,
      baseline,
      finalState,
    },
  ) => {
    await client.query(
      `
      INSERT INTO audit_events (
        user_id,
        match_id,
        challenge_id,
        event_type,
        details
      )

      VALUES (
        $1,
        $2,
        $3,
        'match_annulled_with_elo_replay',
        $4
      )
      `,
      [
        adminUserId,
        target.id,
        target.challenge_id,

        JSON.stringify({
          reason,

          replay_batch_id:
            replayBatchId,

          original_winner_id:
            target.winner_id,

          original_score:
            target.score,

          league: {
            city:
              target.league_city,

            gender:
              target.league_gender,
          },

          reversed_elo_event_ids:
            reversedEvents.map(
              (event) =>
                event.id,
            ),

          replayed_matches:
            replayedMatches.length,

          replayed_rejections:
            replayedRejections.length,

          created_elo_events:
            createdEvents.length,

          baseline,

          final_state:
            finalState,
        }),
      ],
    );
  };


/*
  ============================================================
  COMPLETAR BATCH
  ============================================================
*/

const completeReplayBatch =
  async (
    client,
    {
      replayBatchId,
      replayedMatches,
      replayedRejections,
      createdEvents,
    },
  ) => {
    const columnsResult =
      await client.query(
        `
        SELECT
          column_name

        FROM information_schema.columns

        WHERE
          table_schema = 'public'
          AND table_name =
            'elo_replay_batches'
        `,
      );

    const columns =
      new Set(
        columnsResult.rows.map(
          (row) =>
            row.column_name,
        ),
      );

    const assignments =
      [];

    const params =
      [];

    const push =
      (
        column,
        value,
      ) => {
        if (
          !columns.has(
            column,
          )
        ) {
          return;
        }

        params.push(
          value,
        );

        assignments.push(
          `${column} = $${params.length}`,
        );
      };

    push(
      "status",
      "completed",
    );

    push(
      "completed_at",
      new Date(),
    );

    push(
      "matches_replayed",
      replayedMatches.length,
    );

    push(
      "replayed_matches_count",
      replayedMatches.length,
    );

    push(
      "events_created",
      createdEvents.length,
    );

    push(
      "replayed_events_count",
      createdEvents.length,
    );

    push(
      "rejections_replayed",
      replayedRejections.length,
    );

    if (
      !assignments.length
    ) {
      return;
    }

    params.push(
      replayBatchId,
    );

    await client.query(
      `
      UPDATE elo_replay_batches

      SET
        ${assignments.join(", ")}

      WHERE
        id =
          $${params.length}
      `,
      params,
    );
  };


/*
  ============================================================
  EJECUTAR REPLAY
  ============================================================
*/

export const executeEloReplay =
  async (
    client,
    {
      matchId,
      adminUserId,
      reason,
    },
  ) => {
    if (
      !client ||
      typeof client.query !==
        "function"
    ) {
      throw new EloReplayExecutionError(
        "Se requiere un cliente PostgreSQL transaccional.",
        "database_client_missing",
      );
    }

    const normalizedAdminUserId =
      asInteger(
        adminUserId,
        "adminUserId",
      );

    const normalizedReason =
      String(
        reason || "",
      ).trim();

    if (
      normalizedReason.length <
        5 ||
      normalizedReason.length >
        500
    ) {
      throw new EloReplayExecutionError(
        "El motivo debe tener entre 5 y 500 caracteres.",
        "invalid_annul_reason",
      );
    }

    await assertReplayInfrastructure(
      client,
    );

    const target =
      await loadTargetMatch(
        client,
        matchId,
      );

    const players =
      await loadLeaguePlayers(
        client,
        target.league_city,
        target.league_gender,
      );

    const leaguePlayerIds =
      players.map(
        (player) =>
          player.id,
      );

    const replayMatches =
      await loadReplayMatches(
        client,
        target,
      );

    const targetInsideRange =
      replayMatches.some(
        (match) =>
          match.id ===
          target.id,
      );

    if (
      !targetInsideRange
    ) {
      throw new EloReplayExecutionError(
        "El partido objetivo no aparece dentro de su propio rango histórico.",
        "target_missing_from_replay_range",
        {
          match_id:
            target.id,
        },
      );
    }

    const events =
      await loadActiveReplayEvents(
        client,
        leaguePlayerIds,
        target.completed_at,
      );

    validateSupportedEvents(
      events,
    );

    validateHistoricalArithmetic(
      events,
    );

    const matchEventMap =
      buildMatchEventMap(
        events,
      );

    validateMatchHistory(
      replayMatches,
      matchEventMap,
    );

    const targetEvents =
      matchEventMap.get(
        target.id,
      ) || [];

    const targetMatchResultEvents =
      targetEvents.filter(
        (event) =>
          event.event_type ===
          "match_result",
      );

    if (
      targetMatchResultEvents.length !==
      2
    ) {
      throw new EloReplayExecutionError(
        "El partido objetivo no posee un historial Elo válido.",
        "target_elo_history_invalid",
        {
          match_id:
            target.id,
        },
      );
    }

    const baselineState =
      buildBaselineState({
        players,
        replayMatches,
        events,
      });

    const baselineSnapshot =
      serializeState(
        baselineState,
      );

    const chronology =
      buildChronology({
        target,
        replayMatches,
        events,
      });

    const replayBatch =
      await createReplayBatch(
        client,
        {
          target,

          adminUserId:
            normalizedAdminUserId,

          reason:
            normalizedReason,
        },
      );

    const replayBatchId =
      asInteger(
        replayBatch.id,
        "replayBatch.id",
      );

    await reverseOriginalEvents(
      client,
      {
        events,

        adminUserId:
          normalizedAdminUserId,

        replayBatchId,
      },
    );

    const state =
      cloneState(
        baselineState,
      );

    const replayedMatches =
      [];

    const replayedRejections =
      [];

    const createdEvents =
      [];

    for (
      const item of chronology
    ) {
      if (
        item.type ===
        "match"
      ) {
        const result =
          await replayMatch(
            client,
            {
              state,

              match:
                item.match,

              target,

              replayBatchId,

              matchEventMap,

              createdEvents,
            },
          );

        replayedMatches.push(
          result,
        );

        continue;
      }

      if (
        item.type ===
        "challenge_rejection"
      ) {
        const result =
          await replayChallengeRejection(
            client,
            {
              state,

              chronologyEvent:
                item,

              replayBatchId,

              createdEvents,
            },
          );

        replayedRejections.push(
          result,
        );

        continue;
      }

      throw new EloReplayExecutionError(
        "Tipo de evento cronológico no soportado.",
        "unsupported_chronology_type",
        {
          type:
            item.type,
        },
      );
    }

    const updatedPlayers =
      await persistFinalState(
        client,
        state,
      );

    const annulledMatch =
      await persistTargetAnnulment(
        client,
        {
          target,

          adminUserId:
            normalizedAdminUserId,

          reason:
            normalizedReason,
        },
      );

    const targetChallenge =
      await annulTargetChallenge(
        client,
        target,
      );

    await resolveTargetFlags(
      client,
      {
        target,

        adminUserId:
          normalizedAdminUserId,
      },
    );

    const finalSnapshot =
      serializeState(
        state,
      );

    await createReplayAuditEvent(
      client,
      {
        adminUserId:
          normalizedAdminUserId,

        target,

        replayBatchId,

        reason:
          normalizedReason,

        replayedMatches,

        replayedRejections,

        createdEvents,

        reversedEvents:
          events,

        baseline:
          baselineSnapshot,

        finalState:
          finalSnapshot,
      },
    );

    await completeReplayBatch(
      client,
      {
        replayBatchId,

        replayedMatches,

        replayedRejections,

        createdEvents,
      },
    );

    return {
      replay_batch_id:
        replayBatchId,

      annulled_match:
        annulledMatch,

      challenge:
        targetChallenge,

      league: {
        city:
          target.league_city,

        gender:
          target.league_gender,
      },

      replay: {
        original_matches_in_range:
          replayMatches.length,

        annulled_matches:
          1,

        replayed_matches:
          replayedMatches.length,

        replayed_rejections:
          replayedRejections.length,

        reversed_elo_events:
          events.length,

        created_elo_events:
          createdEvents.length,
      },

      baseline:
        baselineSnapshot,

      final_state:
        finalSnapshot,

      updated_players:
        updatedPlayers,

      replayed_matches:
        replayedMatches,

      replayed_rejections:
        replayedRejections,
    };
  };