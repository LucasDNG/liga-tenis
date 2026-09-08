import { pool } from "../db.js";

import {
  OFFICIAL_ELO_FLOOR,
  PLACEMENT_MATCHES,
} from "./eloMatch.service.js";


/*
  ============================================================
  CONFIGURACIÓN
  ============================================================
*/

export const ACTIVITY_WINDOW_DAYS = 30;
export const INACTIVITY_ELO_PENALTY = 10;

const DAY_MS =
  24 * 60 * 60 * 1000;

const ACTIVITY_WINDOW_MS =
  ACTIVITY_WINDOW_DAYS *
  DAY_MS;


/*
  ============================================================
  ERROR
  ============================================================
*/

export class PlayerActivityError extends Error {
  constructor(
    message,
    reason = "player_activity_error",
    details = null,
  ) {
    super(message);

    this.name =
      "PlayerActivityError";

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

const toInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    throw new PlayerActivityError(
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


const toNonNegativeInteger = (
  value,
  field,
) => {
  const number =
    toInteger(
      value,
      field,
    );

  if (number < 0) {
    throw new PlayerActivityError(
      `${field} no puede ser negativo.`,
      "negative_integer",
      {
        field,
        value:
          number,
      },
    );
  }

  return number;
};


const toDate = (
  value,
  field,
) => {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new PlayerActivityError(
      `${field} contiene una fecha inválida.`,
      "invalid_date",
      {
        field,
        value,
      },
    );
  }

  return date;
};


const normalizeUserIds = (
  userIds,
) => {
  if (
    userIds === null ||
    userIds === undefined
  ) {
    return null;
  }

  if (
    !Array.isArray(userIds)
  ) {
    throw new PlayerActivityError(
      "userIds debe ser un array.",
      "invalid_user_ids",
    );
  }

  const uniqueIds =
    new Set();

  for (
    const rawId of
    userIds
  ) {
    const userId =
      toInteger(
        rawId,
        "userIds[]",
      );

    if (userId <= 0) {
      throw new PlayerActivityError(
        "Los IDs de usuario deben ser positivos.",
        "invalid_user_id",
        {
          user_id:
            userId,
        },
      );
    }

    uniqueIds.add(
      userId,
    );
  }

  return [
    ...uniqueIds,
  ];
};


/*
  ============================================================
  CARGAR JUGADORES Y SU ÚLTIMA ACTIVIDAD
  ============================================================

  Anchor de actividad:

  1. Último partido completado y no anulado.
  2. verified_at.
  3. created_at como fallback.

  Un partido nuevo cambia automáticamente el anchor.
  ============================================================
*/

const loadActivityRows = async (
  client,
  {
    city = null,
    gender = null,
    userIds = null,
    lockPlayers = false,
  } = {},
) => {
  const normalizedIds =
    normalizeUserIds(
      userIds,
    );

  if (
    normalizedIds !== null &&
    normalizedIds.length === 0
  ) {
    return [];
  }

  const params = [];

  const filters = [
    "u.role = 'player'",
    "u.verification_status = 'verified'",
  ];

  if (
    city !== null &&
    city !== undefined
  ) {
    params.push(city);

    filters.push(
      `u.city = $${params.length}`,
    );
  }

  if (
    gender !== null &&
    gender !== undefined
  ) {
    params.push(gender);

    filters.push(
      `u.gender = $${params.length}`,
    );
  }

  if (
    normalizedIds !== null
  ) {
    params.push(
      normalizedIds,
    );

    filters.push(
      `u.id = ANY($${params.length}::int[])`,
    );
  }

  /*
    Cuando se va a modificar Elo,
    primero bloqueamos las filas de users.

    Esto serializa:
    - descuentos de inactividad;
    - confirmaciones de partidos;
    - otros cambios de Elo que también
      bloqueen al jugador.
  */

  if (lockPlayers) {
    await client.query(
      `
      SELECT
        u.id

      FROM users u

      WHERE
        ${filters.join(
          "\n        AND ",
        )}

      ORDER BY
        u.id ASC

      FOR UPDATE
      `,
      params,
    );
  }

  const result =
    await client.query(
      `
      SELECT
        u.id,
        u.name,
        u.city,
        u.gender,
        u.rating,
        u.matches_played,
        u.created_at,
        u.verified_at,

        last_match.completed_at
          AS last_match_at,

        COALESCE(
          last_match.completed_at,
          u.verified_at,
          u.created_at
        )
          AS activity_anchor_at

      FROM users u

      LEFT JOIN LATERAL (
        SELECT
          m.completed_at

        FROM matches m

        WHERE
          m.status = 'completed'

          AND m.annulled_at
            IS NULL

          AND m.completed_at
            IS NOT NULL

          AND (
            m.player1_id =
              u.id

            OR

            m.player2_id =
              u.id
          )

        ORDER BY
          m.completed_at DESC,
          m.id DESC

        LIMIT 1
      ) last_match
        ON TRUE

      WHERE
        ${filters.join(
          "\n        AND ",
        )}

      ORDER BY
        u.id ASC
      `,
      params,
    );

  return result.rows;
};


/*
  ============================================================
  CALCULAR ESTADO DE ACTIVIDAD
  ============================================================

  Hasta 30 días inclusive:
    ACTIVO.

  Más de 30 días:
    INACTIVO.

  Cada bloque completo vencido de 30 días:
    -10 Elo.
  ============================================================
*/

export const calculatePlayerActivity = ({
  player,
  now = new Date(),
}) => {
  if (
    !player ||
    typeof player !==
      "object"
  ) {
    throw new PlayerActivityError(
      "Jugador inválido.",
      "invalid_player",
    );
  }

  const userId =
    toInteger(
      player.id,
      "player.id",
    );

  const rating =
    toNonNegativeInteger(
      player.rating,
      "player.rating",
    );

  const matchesPlayed =
    toNonNegativeInteger(
      player.matches_played,
      "player.matches_played",
    );

  if (
    !player.activity_anchor_at
  ) {
    throw new PlayerActivityError(
      "El jugador no posee fecha base de actividad.",
      "activity_anchor_missing",
      {
        user_id:
          userId,
      },
    );
  }

  const currentDate =
    toDate(
      now,
      "now",
    );

  const anchorDate =
    toDate(
      player.activity_anchor_at,
      "activity_anchor_at",
    );

  const elapsedMs =
    Math.max(
      0,
      currentDate.getTime() -
        anchorDate.getTime(),
    );

  const elapsedDays =
    Math.floor(
      elapsedMs /
        DAY_MS,
    );

  /*
    Exactamente a los 30 días
    todavía está activo.

    Pasa a inactivo cuando supera
    los 30 días.
  */

  const inactive =
    elapsedMs >
    ACTIVITY_WINDOW_MS;

  const fullInactiveMonths =
    inactive
      ? Math.floor(
          elapsedMs /
            ACTIVITY_WINDOW_MS,
        )
      : 0;

  const provisional =
    matchesPlayed <
    PLACEMENT_MATCHES;

  return {
    user_id:
      userId,

    rating,

    matches_played:
      matchesPlayed,

    provisional,

    active:
      !inactive,

    inactive,

    last_match_at:
      player.last_match_at ||
      null,

    activity_anchor_at:
      anchorDate,

    elapsed_days:
      elapsedDays,

    full_inactive_months:
      fullInactiveMonths,
  };
};


/*
  ============================================================
  SNAPSHOT
  ============================================================
*/

export const getPlayerActivitySnapshot =
  async (
    client,
    {
      city = null,
      gender = null,
      userIds = null,
      now = new Date(),
    } = {},
  ) => {
    if (
      !client ||
      typeof client.query !==
        "function"
    ) {
      throw new PlayerActivityError(
        "Se requiere un cliente PostgreSQL.",
        "database_client_missing",
      );
    }

    const currentDate =
      toDate(
        now,
        "now",
      );

    const rows =
      await loadActivityRows(
        client,
        {
          city,
          gender,
          userIds,
        },
      );

    return rows.map(
      (player) => ({
        ...player,

        ...calculatePlayerActivity({
          player,
          now:
            currentDate,
        }),
      }),
    );
  };


/*
  ============================================================
  MAPA DE ACTIVIDAD
  ============================================================
*/

export const getPlayerActivityMap =
  async (
    client,
    options = {},
  ) => {
    const players =
      await getPlayerActivitySnapshot(
        client,
        options,
      );

    return new Map(
      players.map(
        (player) => [
          Number(
            player.id,
          ),

          player,
        ],
      ),
    );
  };


/*
  ============================================================
  CÁLCULO DE DECAY
  ============================================================

  PROVISIONAL:
    piso 0.

  OFICIAL NORMAL:
    piso 100.

  OFICIAL YA DEBAJO DE 100:
    piso 0 para este cálculo.

  Esto evita que una penalización
  accidentalmente le aumente el Elo
  a un oficial que quedó debajo de 100
  por la regla especial del #1.
  ============================================================
*/

export const calculateInactivityDecay = ({
  rating,
  matchesPlayed,
}) => {
  const currentRating =
    toNonNegativeInteger(
      rating,
      "rating",
    );

  const currentMatches =
    toNonNegativeInteger(
      matchesPlayed,
      "matchesPlayed",
    );

  const provisional =
    currentMatches <
    PLACEMENT_MATCHES;

  let eloFloor;

  if (provisional) {
    eloFloor = 0;
  } else if (
    currentRating >=
    OFFICIAL_ELO_FLOOR
  ) {
    eloFloor =
      OFFICIAL_ELO_FLOOR;
  } else {
    eloFloor = 0;
  }

  const eloAfter =
    Math.max(
      eloFloor,

      currentRating -
        INACTIVITY_ELO_PENALTY,
    );

  const eloChange =
    eloAfter -
    currentRating;

  if (eloChange > 0) {
    throw new PlayerActivityError(
      "Una penalización de inactividad no puede aumentar Elo.",
      "inactivity_decay_increased_elo",
      {
        elo_before:
          currentRating,

        elo_after:
          eloAfter,
      },
    );
  }

  return {
    elo_before:
      currentRating,

    elo_change:
      eloChange,

    elo_after:
      eloAfter,

    configured_penalty:
      INACTIVITY_ELO_PENALTY,

    effective_penalty:
      Math.abs(
        eloChange,
      ),

    elo_floor:
      eloFloor,

    provisional,
  };
};


/*
  ============================================================
  MESES YA REGISTRADOS EN ESTE CICLO
  ============================================================
*/

const getAppliedDecayMonths = async (
  client,
  {
    userId,
    activityAnchorAt,
  },
) => {
  const result =
    await client.query(
      `
      SELECT
        inactivity_month_number

      FROM elo_events

      WHERE
        user_id = $1

        AND event_type =
          'inactivity_decay'

        AND reversed_at
          IS NULL

        AND activity_anchor_at =
          $2

        AND inactivity_month_number
          IS NOT NULL

      ORDER BY
        inactivity_month_number ASC
      `,
      [
        userId,
        activityAnchorAt,
      ],
    );

  return new Set(
    result.rows.map(
      (row) =>
        Number(
          row.inactivity_month_number,
        ),
    ),
  );
};


/*
  ============================================================
  APLICAR DECAY A UN JUGADOR
  ============================================================
*/

const applyDecayToPlayer = async (
  client,
  {
    player,
    now,
  },
) => {
  const activity =
    calculatePlayerActivity({
      player,
      now,
    });

  if (
    !activity.inactive ||
    activity.full_inactive_months <
      1
  ) {
    return {
      user_id:
        activity.user_id,

      inactive:
        activity.inactive,

      full_inactive_months:
        activity.full_inactive_months,

      rating_before:
        activity.rating,

      rating_after:
        activity.rating,

      created_events: [],
    };
  }

  const appliedMonths =
    await getAppliedDecayMonths(
      client,
      {
        userId:
          activity.user_id,

        activityAnchorAt:
          activity.activity_anchor_at,
      },
    );

  /*
    El rating de users ya contiene
    cualquier decay previamente aplicado.

    Por eso comenzamos desde el valor
    actual y solamente procesamos meses
    faltantes.
  */

  let currentRating =
    activity.rating;

  const createdEvents =
    [];

  for (
    let monthNumber = 1;
    monthNumber <=
    activity.full_inactive_months;
    monthNumber += 1
  ) {
    if (
      appliedMonths.has(
        monthNumber,
      )
    ) {
      continue;
    }

    const calculation =
      calculateInactivityDecay({
        rating:
          currentRating,

        matchesPlayed:
          activity.matches_played,
      });

    /*
      Momento histórico exacto del evento.

      Ejemplo:
      anchor + 30 días = mes 1.
      anchor + 60 días = mes 2.
    */

    const decayAt =
      new Date(
        activity
          .activity_anchor_at
          .getTime() +
        (
          monthNumber *
          ACTIVITY_WINDOW_MS
        ),
      );

    const inserted =
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
          activity_anchor_at,
          inactivity_month_number
        )

        VALUES (
          $1,
          NULL,
          NULL,
          'inactivity_decay',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )

        ON CONFLICT DO NOTHING

        RETURNING *
        `,
        [
          activity.user_id,

          calculation
            .elo_before,

          calculation
            .elo_change,

          calculation
            .elo_after,

          `Penalización por inactividad. Mes ${monthNumber}: -${calculation.effective_penalty} Elo efectivo.`,

          decayAt,

          activity
            .activity_anchor_at,

          monthNumber,
        ],
      );

    /*
      La fila de users está bloqueada.

      El índice único de migration_010
      evita que un mismo ciclo/mes
      se registre dos veces.
    */

    if (
      !inserted.rowCount
    ) {
      continue;
    }

    currentRating =
      calculation
        .elo_after;

    const updated =
      await client.query(
        `
        UPDATE users

        SET
          rating = $1,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $2

        RETURNING
          id,
          rating,
          matches_played
        `,
        [
          currentRating,
          activity.user_id,
        ],
      );

    if (
      updated.rowCount !==
      1
    ) {
      throw new PlayerActivityError(
        "No se pudo actualizar el Elo del jugador por inactividad.",
        "inactivity_rating_update_failed",
        {
          user_id:
            activity.user_id,

          inactivity_month_number:
            monthNumber,
        },
      );
    }

    createdEvents.push(
      inserted.rows[0],
    );
  }

  return {
    user_id:
      activity.user_id,

    inactive:
      activity.inactive,

    activity_anchor_at:
      activity.activity_anchor_at,

    full_inactive_months:
      activity.full_inactive_months,

    rating_before:
      activity.rating,

    rating_after:
      currentRating,

    created_events:
      createdEvents,
  };
};


/*
  ============================================================
  APLICAR DECAYS PENDIENTES
  ============================================================

  Esta función NO abre ni cierra
  transacción.

  El caller controla:
  BEGIN / COMMIT / ROLLBACK.
  ============================================================
*/

export const applyPendingInactivityDecay =
  async (
    client,
    {
      city = null,
      gender = null,
      userIds = null,
      now = new Date(),
    } = {},
  ) => {
    if (
      !client ||
      typeof client.query !==
        "function"
    ) {
      throw new PlayerActivityError(
        "Se requiere un cliente PostgreSQL transaccional.",
        "database_client_missing",
      );
    }

    const currentDate =
      toDate(
        now,
        "now",
      );

    /*
      Bloqueamos primero los jugadores.
    */

    const players =
      await loadActivityRows(
        client,
        {
          city,
          gender,
          userIds,
          lockPlayers:
            true,
        },
      );

    const results =
      [];

    for (
      const player of
      players
    ) {
      const result =
        await applyDecayToPlayer(
          client,
          {
            player,
            now:
              currentDate,
          },
        );

      results.push(
        result,
      );
    }

    return {
      checked_players:
        players.length,

      inactive_players:
        results.filter(
          (result) =>
            result.inactive,
        ).length,

      created_events:
        results.reduce(
          (
            total,
            result,
          ) =>
            total +
            result
              .created_events
              .length,
          0,
        ),

      players:
        results,
    };
  };


/*
  ============================================================
  EJECUCIÓN AUTÓNOMA
  ============================================================

  Para endpoints o tareas donde todavía
  no existe una transacción abierta.
  ============================================================
*/

export const runPendingInactivityDecay =
  async ({
    city = null,
    gender = null,
    userIds = null,
    now = new Date(),
  } = {}) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const result =
        await applyPendingInactivityDecay(
          client,
          {
            city,
            gender,
            userIds,
            now,
          },
        );

      await client.query(
        "COMMIT",
      );

      return result;
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // La conexión se libera abajo.
      }

      throw error;
    } finally {
      client.release();
    }
  };