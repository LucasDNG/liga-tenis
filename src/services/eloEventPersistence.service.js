/*
  ============================================================
  LA RED
  PERSISTENCIA DE EVENTOS ELO
  ============================================================

  Persiste eventos Elo ya calculados.

  NO calcula Elo.
  NO decide placement.
  NO decide ganador.
  NO modifica estadísticas.
  NO abre ni cierra transacciones.

  Desde migration_017 todo evento Elo pertenece
  obligatoriamente a una competición.
  ============================================================
*/


export class EloEventPersistenceError extends Error {
  constructor(
    message,
    reason = "elo_event_persistence_error",
    details = null,
  ) {
    super(message);

    this.name =
      "EloEventPersistenceError";

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
    typeof client.query !==
      "function"
  ) {
    throw new EloEventPersistenceError(
      "Se requiere un client PostgreSQL válido.",
      "invalid_client",
    );
  }

  return client;
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
    throw new EloEventPersistenceError(
      `${field} debe ser un entero positivo.`,
      "invalid_positive_integer",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const nullablePositiveInteger = (
  value,
  field,
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return positiveInteger(
    value,
    field,
  );
};


const finiteNumber = (
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
    throw new EloEventPersistenceError(
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


const nonEmptyString = (
  value,
  field,
) => {
  const normalized =
    String(
      value ??
        "",
    ).trim();

  if (!normalized) {
    throw new EloEventPersistenceError(
      `${field} no puede estar vacío.`,
      "invalid_string",
      {
        field,
        value,
      },
    );
  }

  return normalized;
};


export const normalizeEloEvent = (
  event,
) => {
  if (
    !event ||
    typeof event !==
      "object" ||
    Array.isArray(
      event,
    )
  ) {
    throw new EloEventPersistenceError(
      "Evento Elo inválido.",
      "invalid_event",
    );
  }

  const userId =
    positiveInteger(
      event.user_id,
      "event.user_id",
    );

  const competitionId =
    positiveInteger(
      event.competition_id,
      "event.competition_id",
    );

  const matchId =
    nullablePositiveInteger(
      event.match_id,
      "event.match_id",
    );

  const challengeId =
    nullablePositiveInteger(
      event.challenge_id,
      "event.challenge_id",
    );

  const eventType =
    nonEmptyString(
      event.event_type,
      "event.event_type",
    );

  const eloBefore =
    finiteNumber(
      event.elo_before,
      "event.elo_before",
    );

  const eloChange =
    finiteNumber(
      event.elo_change,
      "event.elo_change",
    );

  const eloAfter =
    finiteNumber(
      event.elo_after,
      "event.elo_after",
    );

  const description =
    event.description ===
      null ||
    event.description ===
      undefined
      ? null
      : String(
          event.description,
        );

  const expectedAfter =
    eloBefore +
    eloChange;

  if (
    Math.abs(
      expectedAfter -
        eloAfter,
    ) >
    1e-9
  ) {
    throw new EloEventPersistenceError(
      "El evento Elo no cierra contablemente.",
      "elo_event_balance_mismatch",
      {
        user_id:
          userId,

        competition_id:
          competitionId,

        elo_before:
          eloBefore,

        elo_change:
          eloChange,

        elo_after:
          eloAfter,

        expected_after:
          expectedAfter,
      },
    );
  }

  return {
    user_id:
      userId,

    competition_id:
      competitionId,

    match_id:
      matchId,

    challenge_id:
      challengeId,

    event_type:
      eventType,

    elo_before:
      eloBefore,

    elo_change:
      eloChange,

    elo_after:
      eloAfter,

    description,
  };
};


export const insertEloEvent = async (
  client,
  event,
) => {
  requireClient(
    client,
  );

  const normalized =
    normalizeEloEvent(
      event,
    );

  const result =
    await client.query(
      `
      INSERT INTO elo_events (
        user_id,
        competition_id,
        match_id,
        challenge_id,
        event_type,
        elo_before,
        elo_change,
        elo_after,
        description
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
        $9
      )

      RETURNING *
      `,
      [
        normalized.user_id,
        normalized.competition_id,
        normalized.match_id,
        normalized.challenge_id,
        normalized.event_type,
        normalized.elo_before,
        normalized.elo_change,
        normalized.elo_after,
        normalized.description,
      ],
    );

  if (
    !result ||
    !Array.isArray(
      result.rows,
    ) ||
    result.rows.length !==
      1
  ) {
    throw new EloEventPersistenceError(
      "No se pudo persistir el evento Elo.",
      "elo_event_insert_failed",
      {
        user_id:
          normalized.user_id,

        competition_id:
          normalized.competition_id,

        match_id:
          normalized.match_id,

        event_type:
          normalized.event_type,
      },
    );
  }

  return result.rows[0];
};


export const validateMatchEloEventPlan = (
  plan,
) => {
  if (
    !plan ||
    typeof plan !==
      "object" ||
    Array.isArray(
      plan,
    )
  ) {
    throw new EloEventPersistenceError(
      "Plan de eventos Elo inválido.",
      "invalid_event_plan",
    );
  }

  if (
    !Array.isArray(
      plan.events,
    )
  ) {
    throw new EloEventPersistenceError(
      "El plan no contiene un array de eventos.",
      "event_plan_events_missing",
    );
  }

  const competitionId =
    positiveInteger(
      plan.competition_id,
      "plan.competition_id",
    );

  const matchId =
    positiveInteger(
      plan.match_id,
      "plan.match_id",
    );

  const challengeId =
    nullablePositiveInteger(
      plan.challenge_id,
      "plan.challenge_id",
    );

  const events =
    plan.events.map(
      (event) =>
        normalizeEloEvent(
          event,
        ),
    );

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
    throw new EloEventPersistenceError(
      "Un partido completado debe contener exactamente dos eventos match_result.",
      "invalid_match_result_count",
      {
        count:
          matchResultEvents.length,
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
    throw new EloEventPersistenceError(
      "Un partido no puede producir más de dos eventos placement_completed.",
      "invalid_placement_completed_count",
      {
        count:
          placementEvents.length,
      },
    );
  }

  for (
    const event of
    events
  ) {
    if (
      event.competition_id !==
      competitionId
    ) {
      throw new EloEventPersistenceError(
        "Todos los eventos del plan deben pertenecer a la misma competición.",
        "event_competition_id_mismatch",
        {
          plan_competition_id:
            competitionId,

          event_competition_id:
            event.competition_id,

          user_id:
            event.user_id,

          event_type:
            event.event_type,
        },
      );
    }

    if (
      event.match_id !==
      matchId
    ) {
      throw new EloEventPersistenceError(
        "Todos los eventos del plan deben pertenecer al mismo partido.",
        "event_match_id_mismatch",
        {
          plan_match_id:
            matchId,

          event_match_id:
            event.match_id,

          user_id:
            event.user_id,

          event_type:
            event.event_type,
        },
      );
    }

    if (
      event.challenge_id !==
      challengeId
    ) {
      throw new EloEventPersistenceError(
        "Todos los eventos del plan deben conservar el challenge_id del partido.",
        "event_challenge_id_mismatch",
        {
          plan_challenge_id:
            challengeId,

          event_challenge_id:
            event.challenge_id,

          user_id:
            event.user_id,

          event_type:
            event.event_type,
        },
      );
    }
  }

  const matchResultUsers =
    matchResultEvents.map(
      (event) =>
        event.user_id,
    );

  if (
    new Set(
      matchResultUsers,
    ).size !==
    2
  ) {
    throw new EloEventPersistenceError(
      "Los dos eventos match_result deben pertenecer a jugadores distintos.",
      "duplicate_match_result_user",
      {
        user_ids:
          matchResultUsers,
      },
    );
  }

  for (
    const placementEvent of
    placementEvents
  ) {
    if (
      !matchResultUsers.includes(
        placementEvent.user_id,
      )
    ) {
      throw new EloEventPersistenceError(
        "placement_completed pertenece a un jugador ajeno al partido.",
        "placement_user_not_in_match",
        {
          user_id:
            placementEvent.user_id,

          match_result_users:
            matchResultUsers,
        },
      );
    }
  }

  return {
    competition_id:
      competitionId,

    match_id:
      matchId,

    challenge_id:
      challengeId,

    events,

    match_result_count:
      matchResultEvents.length,

    placement_completed_count:
      placementEvents.length,
  };
};


export const persistMatchEloEventPlan = async (
  client,
  plan,
) => {
  requireClient(
    client,
  );

  const normalizedPlan =
    validateMatchEloEventPlan(
      plan,
    );

  const insertedEvents =
    [];

  for (
    const event of
    normalizedPlan.events
  ) {
    const inserted =
      await insertEloEvent(
        client,
        event,
      );

    insertedEvents.push(
      inserted,
    );
  }

  return {
    competition_id:
      normalizedPlan
        .competition_id,

    match_id:
      normalizedPlan
        .match_id,

    challenge_id:
      normalizedPlan
        .challenge_id,

    inserted_events:
      insertedEvents,

    inserted_count:
      insertedEvents.length,

    match_result_count:
      normalizedPlan
        .match_result_count,

    placement_completed_count:
      normalizedPlan
        .placement_completed_count,
  };
};