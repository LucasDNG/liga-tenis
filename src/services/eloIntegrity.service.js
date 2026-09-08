import { pool } from "../db.js";


const PLACEMENT_MATCHES = 5;
const PLACEMENT_K = 64;
const NORMAL_K = 32;

const RANKED_LOSS_TO_PROVISIONAL_MIN = 200;
const RANKED_LOSS_TO_PROVISIONAL_PERCENT = 0.12;
const RANKED_LOSS_TO_PROVISIONAL_MAX = 300;


/*
  ============================================================
  HELPERS NUMÉRICOS
  ============================================================
*/

const toNumber = (value) => {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};


const toInteger = (value) => {
  const number =
    Number(value);

  return Number.isInteger(number)
    ? number
    : null;
};


const expectedScore = (
  ownRating,
  opponentRating,
) =>
  1 /
  (
    1 +
    10 **
      (
        (
          opponentRating -
          ownRating
        ) /
        400
      )
  );


const normalEloChange = ({
  ownRating,
  opponentRating,
  k,
  won,
}) => {
  const expected =
    expectedScore(
      ownRating,
      opponentRating,
    );

  return Math.round(
    k *
      (
        (won ? 1 : 0) -
        expected
      ),
  );
};


const getRankedLossToProvisionalPenalty =
  (rating) => {
    const percentage =
      Math.round(
        rating *
          RANKED_LOSS_TO_PROVISIONAL_PERCENT,
      );

    return Math.min(
      RANKED_LOSS_TO_PROVISIONAL_MAX,
      Math.max(
        RANKED_LOSS_TO_PROVISIONAL_MIN,
        percentage,
      ),
    );
  };


/*
  ============================================================
  JSON DE AUDITORÍA
  ============================================================
*/

const parseDetails = (value) => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(value);

    return (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
};


/*
  ============================================================
  ISSUE
  ============================================================
*/

const createIssue = ({
  code,
  severity = "error",
  message,
  userId = null,
  matchId = null,
  eventId = null,
  details = null,
}) => ({
  code,
  severity,
  message,

  user_id:
    userId,

  match_id:
    matchId,

  event_id:
    eventId,

  details,
});


/*
  ============================================================
  ORDEN DE EVENTOS ELO
  ============================================================
*/

const compareEloEvents = (
  a,
  b,
) => {
  const aTime =
    new Date(
      a.created_at,
    ).getTime();

  const bTime =
    new Date(
      b.created_at,
    ).getTime();

  if (
    Number.isFinite(aTime) &&
    Number.isFinite(bTime) &&
    aTime !== bTime
  ) {
    return aTime - bTime;
  }

  return (
    Number(a.id) -
    Number(b.id)
  );
};


/*
  ============================================================
  DATOS
  ============================================================
*/

const loadAuditData = async () => {
  const [
    usersResult,
    matchesResult,
    eloEventsResult,
    confirmationAuditResult,
  ] = await Promise.all([
    pool.query(
      `
      SELECT
        id,
        name,
        role,
        verification_status,
        city,
        gender,
        rating,
        matches_played,
        created_at,
        updated_at

      FROM users

      WHERE role = 'player'

      ORDER BY id ASC
      `,
    ),

    pool.query(
      `
      SELECT
        id,
        challenge_id,
        player1_id,
        player2_id,
        winner_id,
        status,
        completed_at,
        annulled_at,
        created_at

      FROM matches

      ORDER BY
        COALESCE(
          completed_at,
          created_at
        ) ASC,
        id ASC
      `,
    ),

    pool.query(
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
        reversed_at,
        reversed_by,
        created_at

      FROM elo_events

      ORDER BY
        created_at ASC,
        id ASC
      `,
    ),

    pool.query(
      `
      SELECT
        id,
        user_id,
        match_id,
        challenge_id,
        event_type,
        details,
        created_at

      FROM audit_events

      WHERE event_type =
        'match_result_confirmed'

      ORDER BY
        created_at ASC,
        id ASC
      `,
    ),
  ]);

  return {
    users:
      usersResult.rows,

    matches:
      matchesResult.rows,

    eloEvents:
      eloEventsResult.rows,

    confirmationAudits:
      confirmationAuditResult.rows,
  };
};


/*
  ============================================================
  ÍNDICES EN MEMORIA
  ============================================================
*/

const buildIndexes = ({
  users,
  matches,
  eloEvents,
  confirmationAudits,
}) => {
  const usersById =
    new Map();

  const matchesById =
    new Map();

  const eventsByMatch =
    new Map();

  const eventsByUser =
    new Map();

  const confirmationAuditByMatch =
    new Map();

  for (const user of users) {
    usersById.set(
      Number(user.id),
      user,
    );
  }

  for (const match of matches) {
    matchesById.set(
      Number(match.id),
      match,
    );
  }

  for (const event of eloEvents) {
    const userId =
      Number(event.user_id);

    if (
      !eventsByUser.has(
        userId,
      )
    ) {
      eventsByUser.set(
        userId,
        [],
      );
    }

    eventsByUser
      .get(userId)
      .push(event);

    if (
      event.match_id !== null &&
      event.match_id !== undefined
    ) {
      const matchId =
        Number(
          event.match_id,
        );

      if (
        !eventsByMatch.has(
          matchId,
        )
      ) {
        eventsByMatch.set(
          matchId,
          [],
        );
      }

      eventsByMatch
        .get(matchId)
        .push(event);
    }
  }

  for (
    const events of
    eventsByUser.values()
  ) {
    events.sort(
      compareEloEvents,
    );
  }

  for (
    const events of
    eventsByMatch.values()
  ) {
    events.sort(
      compareEloEvents,
    );
  }

  for (
    const audit of
    confirmationAudits
  ) {
    const matchId =
      Number(
        audit.match_id,
      );

    if (
      !confirmationAuditByMatch.has(
        matchId,
      )
    ) {
      confirmationAuditByMatch.set(
        matchId,
        audit,
      );
    }
  }

  return {
    usersById,
    matchesById,
    eventsByMatch,
    eventsByUser,
    confirmationAuditByMatch,
  };
};


/*
  ============================================================
  VALIDAR USUARIOS
  ============================================================
*/

const auditUsers = ({
  users,
  matches,
  eventsByUser,
  issues,
}) => {
  const validCompletedMatchesByUser =
    new Map();

  for (const match of matches) {
    if (
      match.status !==
        "completed" ||
      match.annulled_at
    ) {
      continue;
    }

    const player1Id =
      Number(
        match.player1_id,
      );

    const player2Id =
      Number(
        match.player2_id,
      );

    validCompletedMatchesByUser.set(
      player1Id,
      (
        validCompletedMatchesByUser.get(
          player1Id,
        ) || 0
      ) + 1,
    );

    validCompletedMatchesByUser.set(
      player2Id,
      (
        validCompletedMatchesByUser.get(
          player2Id,
        ) || 0
      ) + 1,
    );
  }

  for (const user of users) {
    const userId =
      Number(user.id);

    const rating =
      toInteger(
        user.rating,
      );

    const matchesPlayed =
      toInteger(
        user.matches_played,
      );

    if (
      rating === null ||
      rating < 0
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_user_rating",

          severity:
            "critical",

          userId,

          message:
            `El jugador ${user.name} tiene un Elo inválido.`,

          details: {
            rating:
              user.rating,
          },
        }),
      );
    }

    if (
      matchesPlayed === null ||
      matchesPlayed < 0
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_matches_played",

          severity:
            "critical",

          userId,

          message:
            `El jugador ${user.name} tiene matches_played inválido.`,

          details: {
            matches_played:
              user.matches_played,
          },
        }),
      );

      continue;
    }

    /*
      Un jugador oficial no debería
      quedar debajo del piso 100.
    */
    if (
      matchesPlayed >=
        PLACEMENT_MATCHES &&
      rating !== null &&
      rating < 100
    ) {
      issues.push(
        createIssue({
          code:
            "official_rating_below_floor",

          severity:
            "error",

          userId,

          message:
            `El jugador oficial ${user.name} tiene Elo menor a 100.`,

          details: {
            rating,
            matches_played:
              matchesPlayed,
          },
        }),
      );
    }

    /*
      matches_played debe coincidir con
      partidos completed no anulados.
    */
    const realCompletedMatches =
      validCompletedMatchesByUser.get(
        userId,
      ) || 0;

    if (
      matchesPlayed !==
      realCompletedMatches
    ) {
      issues.push(
        createIssue({
          code:
            "matches_played_mismatch",

          severity:
            "error",

          userId,

          message:
            `matches_played de ${user.name} no coincide con sus partidos válidos.`,

          details: {
            stored_matches_played:
              matchesPlayed,

            completed_non_annulled_matches:
              realCompletedMatches,
          },
        }),
      );
    }

    /*
      Rating actual vs último evento Elo
      no revertido.

      Incluye:
      - match_result
      - challenge_rejection
      - admin_reversal
    */
    const userEvents =
      (
        eventsByUser.get(
          userId,
        ) || []
      )
        .filter(
          (event) =>
            !event.reversed_at,
        )
        .sort(
          compareEloEvents,
        );

    const latestEvent =
      userEvents[
        userEvents.length - 1
      ];

    if (latestEvent) {
      const latestAfter =
        toInteger(
          latestEvent.elo_after,
        );

      if (
        latestAfter === null
      ) {
        issues.push(
          createIssue({
            code:
              "invalid_latest_elo_event",

            severity:
              "critical",

            userId,

            eventId:
              Number(
                latestEvent.id,
              ),

            message:
              `El último evento Elo de ${user.name} tiene elo_after inválido.`,
          }),
        );
      } else if (
        rating !== null &&
        latestAfter !== rating
      ) {
        issues.push(
          createIssue({
            code:
              "rating_event_mismatch",

            severity:
              "critical",

            userId,

            eventId:
              Number(
                latestEvent.id,
              ),

            message:
              `El Elo actual de ${user.name} no coincide con su último evento Elo válido.`,

            details: {
              current_rating:
                rating,

              latest_event_elo_after:
                latestAfter,

              latest_event_type:
                latestEvent.event_type,
            },
          }),
        );
      }
    } else if (
      rating !== null &&
      rating !== 0
    ) {
      /*
        Puede existir información vieja
        anterior a elo_events.

        Se reporta como warning en vez
        de error duro.
      */
      issues.push(
        createIssue({
          code:
            "rating_without_elo_history",

          severity:
            "warning",

          userId,

          message:
            `${user.name} tiene Elo ${rating}, pero no posee eventos Elo activos.`,

          details: {
            rating,
          },
        }),
      );
    }
  }
};


/*
  ============================================================
  VALIDAR ARITMÉTICA DE elo_events
  ============================================================
*/

const auditEloEvents = ({
  eloEvents,
  matchesById,
  issues,
}) => {
  const matchResultByMatchUser =
    new Map();

  for (const event of eloEvents) {
    const eventId =
      Number(event.id);

    const userId =
      Number(event.user_id);

    const before =
      toInteger(
        event.elo_before,
      );

    const change =
      toInteger(
        event.elo_change,
      );

    const after =
      toInteger(
        event.elo_after,
      );

    if (
      before === null ||
      change === null ||
      after === null
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_elo_event_values",

          severity:
            "critical",

          userId,
          eventId,

          matchId:
            event.match_id
              ? Number(
                  event.match_id,
                )
              : null,

          message:
            `El evento Elo #${eventId} contiene valores no enteros.`,
        }),
      );

      continue;
    }

    if (
      before + change !==
      after
    ) {
      issues.push(
        createIssue({
          code:
            "elo_event_arithmetic_mismatch",

          severity:
            "critical",

          userId,
          eventId,

          matchId:
            event.match_id
              ? Number(
                  event.match_id,
                )
              : null,

          message:
            `El evento Elo #${eventId} no cumple elo_before + elo_change = elo_after.`,

          details: {
            elo_before:
              before,

            elo_change:
              change,

            elo_after:
              after,

            calculated_after:
              before + change,
          },
        }),
      );
    }

    if (
      before < 0 ||
      after < 0
    ) {
      issues.push(
        createIssue({
          code:
            "negative_elo_event",

          severity:
            "critical",

          userId,
          eventId,

          matchId:
            event.match_id
              ? Number(
                  event.match_id,
                )
              : null,

          message:
            `El evento Elo #${eventId} contiene Elo negativo.`,
        }),
      );
    }

    if (
      event.match_id !== null &&
      event.match_id !== undefined
    ) {
      const matchId =
        Number(
          event.match_id,
        );

      const match =
        matchesById.get(
          matchId,
        );

      if (!match) {
        issues.push(
          createIssue({
            code:
              "elo_event_orphan_match",

            severity:
              "critical",

            userId,
            eventId,
            matchId,

            message:
              `El evento Elo #${eventId} referencia un partido inexistente.`,
          }),
        );
      }

      if (
        event.event_type ===
        "match_result"
      ) {
        const key =
          `${matchId}:${userId}`;

        const count =
          (
            matchResultByMatchUser.get(
              key,
            ) || 0
          ) + 1;

        matchResultByMatchUser.set(
          key,
          count,
        );

        if (count > 1) {
          issues.push(
            createIssue({
              code:
                "duplicate_match_result_elo",

              severity:
                "critical",

              userId,
              eventId,
              matchId,

              message:
                `Hay más de un match_result para el jugador ${userId} en el partido ${matchId}.`,
            }),
          );
        }

        if (match) {
          const validPlayers =
            new Set([
              Number(
                match.player1_id,
              ),

              Number(
                match.player2_id,
              ),
            ]);

          if (
            !validPlayers.has(
              userId,
            )
          ) {
            issues.push(
              createIssue({
                code:
                  "elo_event_player_not_in_match",

                severity:
                  "critical",

                userId,
                eventId,
                matchId,

                message:
                  `El evento Elo #${eventId} pertenece a un jugador que no disputó el partido.`,
              }),
            );
          }
        }
      }
    }
  }
};


/*
  ============================================================
  CÁLCULO ESPERADO DE UN PARTIDO
  ============================================================
*/

const calculateExpectedMatchElo = ({
  winnerBefore,
  loserBefore,
  winnerProvisional,
  loserProvisional,
  loserWasNumberOne,
  numberTwoRatingBefore,
}) => {
  let winnerAfter =
    winnerBefore;

  let loserAfter =
    loserBefore;

  let specialProvisionalPenalty =
    null;

  /*
    PROVISIONAL vs PROVISIONAL
  */
  if (
    winnerProvisional &&
    loserProvisional
  ) {
    const winnerDelta =
      normalEloChange({
        ownRating:
          winnerBefore,

        opponentRating:
          loserBefore,

        k:
          PLACEMENT_K,

        won: true,
      });

    const loserDelta =
      normalEloChange({
        ownRating:
          loserBefore,

        opponentRating:
          winnerBefore,

        k:
          PLACEMENT_K,

        won: false,
      });

    winnerAfter =
      Math.max(
        0,
        winnerBefore +
          winnerDelta,
      );

    loserAfter =
      Math.max(
        0,
        loserBefore +
          loserDelta,
      );
  }

  /*
    PROVISIONAL gana a RANKEADO
  */
  else if (
    winnerProvisional &&
    !loserProvisional
  ) {
    const ratingGap =
      Math.max(
        0,
        loserBefore -
          winnerBefore,
      );

    const placementBonus =
      Math.min(
        236,
        Math.round(
          ratingGap * 0.18,
        ),
      );

    const winnerDelta =
      Math.min(
        300,
        PLACEMENT_K +
          placementBonus,
      );

    winnerAfter =
      winnerBefore +
      winnerDelta;

    specialProvisionalPenalty =
      getRankedLossToProvisionalPenalty(
        loserBefore,
      );

    loserAfter =
      Math.max(
        100,
        loserBefore -
          specialProvisionalPenalty,
      );
  }

  /*
    RANKEADO gana a PROVISIONAL
  */
  else if (
    !winnerProvisional &&
    loserProvisional
  ) {
    const winnerDelta =
      normalEloChange({
        ownRating:
          winnerBefore,

        opponentRating:
          loserBefore,

        k:
          NORMAL_K,

        won: true,
      });

    const loserDelta =
      normalEloChange({
        ownRating:
          loserBefore,

        opponentRating:
          winnerBefore,

        k:
          NORMAL_K,

        won: false,
      });

    winnerAfter =
      Math.max(
        100,
        winnerBefore +
          winnerDelta,
      );

    loserAfter =
      Math.max(
        0,
        loserBefore +
          loserDelta,
      );
  }

  /*
    RANKEADO vs RANKEADO
  */
  else {
    const winnerDelta =
      normalEloChange({
        ownRating:
          winnerBefore,

        opponentRating:
          loserBefore,

        k:
          NORMAL_K,

        won: true,
      });

    const loserDelta =
      normalEloChange({
        ownRating:
          loserBefore,

        opponentRating:
          winnerBefore,

        k:
          NORMAL_K,

        won: false,
      });

    winnerAfter =
      Math.max(
        100,
        winnerBefore +
          winnerDelta,
      );

    loserAfter =
      Math.max(
        100,
        loserBefore +
          loserDelta,
      );
  }

  /*
    REGLA #1.

    Es un techo puro.
  */
  let dethroneCeiling =
    null;

  if (
    loserWasNumberOne &&
    Number.isInteger(
      numberTwoRatingBefore,
    )
  ) {
    dethroneCeiling =
      numberTwoRatingBefore - 1;

    loserAfter =
      Math.min(
        loserAfter,
        dethroneCeiling,
      );
  }

  return {
    winnerAfter,
    loserAfter,

    winnerDelta:
      winnerAfter -
      winnerBefore,

    loserDelta:
      loserAfter -
      loserBefore,

    specialProvisionalPenalty,
    dethroneCeiling,
  };
};


/*
  ============================================================
  VALIDAR PARTIDOS COMPLETADOS
  ============================================================
*/

const auditCompletedMatches = ({
  matches,
  eventsByMatch,
  confirmationAuditByMatch,
  issues,
}) => {
  for (const match of matches) {
    const matchId =
      Number(match.id);

    const matchEvents =
      eventsByMatch.get(
        matchId,
      ) || [];

    const originalResultEvents =
      matchEvents.filter(
        (event) =>
          event.event_type ===
            "match_result",
      );

    const activeResultEvents =
      originalResultEvents.filter(
        (event) =>
          !event.reversed_at,
      );

    /*
      PARTIDO COMPLETADO ACTIVO
    */
    if (
      match.status ===
        "completed" &&
      !match.annulled_at
    ) {
      if (
        activeResultEvents.length !==
        2
      ) {
        issues.push(
          createIssue({
            code:
              "completed_match_elo_event_count",

            severity:
              "critical",

            matchId,

            message:
              `El partido completado #${matchId} debe tener exactamente 2 movimientos Elo activos.`,

            details: {
              active_match_result_events:
                activeResultEvents.length,

              total_match_result_events:
                originalResultEvents.length,
            },
          }),
        );
      }

      const expectedPlayers =
        new Set([
          Number(
            match.player1_id,
          ),

          Number(
            match.player2_id,
          ),
        ]);

      const eventPlayers =
        new Set(
          activeResultEvents.map(
            (event) =>
              Number(
                event.user_id,
              ),
          ),
        );

      if (
        activeResultEvents.length ===
          2 &&
        (
          eventPlayers.size !== 2 ||
          ![
            ...expectedPlayers,
          ].every(
            (id) =>
              eventPlayers.has(
                id,
              ),
          )
        )
      ) {
        issues.push(
          createIssue({
            code:
              "completed_match_elo_players_mismatch",

            severity:
              "critical",

            matchId,

            message:
              `Los movimientos Elo del partido #${matchId} no corresponden exactamente a sus dos jugadores.`,
          }),
        );
      }
    }

    /*
      PARTIDO ANULADO.

      Sus match_result originales deben
      estar marcados reversed_at.
    */
    if (
      match.annulled_at ||
      match.status ===
        "annulled"
    ) {
      const unreversedOriginal =
        originalResultEvents.filter(
          (event) =>
            !event.reversed_at,
        );

      if (
        unreversedOriginal.length > 0
      ) {
        issues.push(
          createIssue({
            code:
              "annulled_match_active_original_elo",

            severity:
              "critical",

            matchId,

            message:
              `El partido anulado #${matchId} todavía posee movimientos match_result no revertidos.`,

            details: {
              unreversed_events:
                unreversedOriginal.map(
                  (event) =>
                    Number(
                      event.id,
                    ),
                ),
            },
          }),
        );
      }
    }

    /*
      Solamente recalculamos partidos
      que alguna vez fueron confirmados.
    */
    if (
      originalResultEvents.length !==
      2
    ) {
      continue;
    }

    const audit =
      confirmationAuditByMatch.get(
        matchId,
      );

    if (!audit) {
      issues.push(
        createIssue({
          code:
            "missing_match_confirmation_audit",

          severity:
            match.annulled_at
              ? "warning"
              : "error",

          matchId,

          message:
            `El partido #${matchId} tiene Elo de resultado pero no posee audit_event match_result_confirmed.`,
        }),
      );

      continue;
    }

    const details =
      parseDetails(
        audit.details,
      );

    if (
      !details ||
      !details.winner ||
      !details.loser
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_match_confirmation_audit",

          severity:
            "error",

          matchId,

          message:
            `El audit_event de confirmación del partido #${matchId} no contiene información suficiente para recalcular Elo.`,
        }),
      );

      continue;
    }

    const winnerId =
      toInteger(
        details.winner_id,
      );

    const loserId =
      toInteger(
        details.loser_id,
      );

    if (
      winnerId === null ||
      loserId === null
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_audit_player_ids",

          severity:
            "error",

          matchId,

          message:
            `El partido #${matchId} tiene winner_id o loser_id inválido en su auditoría.`,
        }),
      );

      continue;
    }

    if (
      Number(match.winner_id) !==
      winnerId
    ) {
      issues.push(
        createIssue({
          code:
            "winner_audit_mismatch",

          severity:
            "critical",

          matchId,

          message:
            `El ganador almacenado del partido #${matchId} no coincide con el ganador registrado en auditoría.`,

          details: {
            match_winner_id:
              match.winner_id,

            audit_winner_id:
              winnerId,
          },
        }),
      );
    }

    const winnerEvent =
      originalResultEvents.find(
        (event) =>
          Number(
            event.user_id,
          ) === winnerId,
      );

    const loserEvent =
      originalResultEvents.find(
        (event) =>
          Number(
            event.user_id,
          ) === loserId,
      );

    if (
      !winnerEvent ||
      !loserEvent
    ) {
      issues.push(
        createIssue({
          code:
            "result_event_role_mismatch",

          severity:
            "critical",

          matchId,

          message:
            `No se encontraron correctamente los eventos Elo del ganador y perdedor del partido #${matchId}.`,
        }),
      );

      continue;
    }

    const winnerBefore =
      toInteger(
        details
          .winner
          .elo_before,
      );

    const loserBefore =
      toInteger(
        details
          .loser
          .elo_before,
      );

    const winnerMatchesBefore =
      toInteger(
        details
          .winner
          .matches_before,
      );

    const winnerMatchesAfter =
      toInteger(
        details
          .winner
          .matches_after,
      );

    const loserMatchesBefore =
      toInteger(
        details
          .loser
          .matches_before,
      );

    const loserMatchesAfter =
      toInteger(
        details
          .loser
          .matches_after,
      );

    if (
      winnerBefore === null ||
      loserBefore === null ||
      winnerMatchesBefore === null ||
      winnerMatchesAfter === null ||
      loserMatchesBefore === null ||
      loserMatchesAfter === null
    ) {
      issues.push(
        createIssue({
          code:
            "invalid_match_audit_numeric_data",

          severity:
            "error",

          matchId,

          message:
            `La auditoría del partido #${matchId} contiene datos numéricos inválidos.`,
        }),
      );

      continue;
    }

    /*
      matches_played debe aumentar
      exactamente en uno.
    */
    if (
      winnerMatchesAfter !==
      winnerMatchesBefore + 1
    ) {
      issues.push(
        createIssue({
          code:
            "winner_matches_increment_invalid",

          severity:
            "error",

          matchId,
          userId:
            winnerId,

          message:
            `El ganador del partido #${matchId} no incrementó matches_played exactamente en 1.`,

          details: {
            before:
              winnerMatchesBefore,

            after:
              winnerMatchesAfter,
          },
        }),
      );
    }

    if (
      loserMatchesAfter !==
      loserMatchesBefore + 1
    ) {
      issues.push(
        createIssue({
          code:
            "loser_matches_increment_invalid",

          severity:
            "error",

          matchId,
          userId:
            loserId,

          message:
            `El perdedor del partido #${matchId} no incrementó matches_played exactamente en 1.`,

          details: {
            before:
              loserMatchesBefore,

            after:
              loserMatchesAfter,
          },
        }),
      );
    }

    const winnerProvisional =
      winnerMatchesBefore <
      PLACEMENT_MATCHES;

    const loserProvisional =
      loserMatchesBefore <
      PLACEMENT_MATCHES;

    /*
      Contrastar booleanos almacenados
      en audit_events.
    */
    if (
      Boolean(
        details
          .winner
          .provisional_before,
      ) !==
      winnerProvisional
    ) {
      issues.push(
        createIssue({
          code:
            "winner_provisional_state_mismatch",

          severity:
            "error",

          matchId,
          userId:
            winnerId,

          message:
            `El estado provisional del ganador en el partido #${matchId} es inconsistente.`,
        }),
      );
    }

    if (
      Boolean(
        details
          .loser
          .provisional_before,
      ) !==
      loserProvisional
    ) {
      issues.push(
        createIssue({
          code:
            "loser_provisional_state_mismatch",

          severity:
            "error",

          matchId,
          userId:
            loserId,

          message:
            `El estado provisional del perdedor en el partido #${matchId} es inconsistente.`,
        }),
      );
    }

    const numberOneInfo =
      details
        .number_one_dethrone ||
      {};

    const loserWasNumberOne =
      Boolean(
        numberOneInfo
          .loser_was_number_one,
      );

    const numberTwoRatingBefore =
      toInteger(
        numberOneInfo
          .number_two_rating_before,
      );

    const expected =
      calculateExpectedMatchElo({
        winnerBefore,
        loserBefore,

        winnerProvisional,
        loserProvisional,

        loserWasNumberOne,

        numberTwoRatingBefore,
      });

    const storedWinnerBefore =
      toInteger(
        winnerEvent.elo_before,
      );

    const storedWinnerDelta =
      toInteger(
        winnerEvent.elo_change,
      );

    const storedWinnerAfter =
      toInteger(
        winnerEvent.elo_after,
      );

    const storedLoserBefore =
      toInteger(
        loserEvent.elo_before,
      );

    const storedLoserDelta =
      toInteger(
        loserEvent.elo_change,
      );

    const storedLoserAfter =
      toInteger(
        loserEvent.elo_after,
      );

    if (
      storedWinnerBefore !==
      winnerBefore
    ) {
      issues.push(
        createIssue({
          code:
            "winner_elo_before_mismatch",

          severity:
            "critical",

          matchId,
          userId:
            winnerId,

          eventId:
            Number(
              winnerEvent.id,
            ),

          message:
            `El elo_before del ganador en el partido #${matchId} no coincide con la auditoría.`,

          details: {
            event:
              storedWinnerBefore,

            audit:
              winnerBefore,
          },
        }),
      );
    }

    if (
      storedLoserBefore !==
      loserBefore
    ) {
      issues.push(
        createIssue({
          code:
            "loser_elo_before_mismatch",

          severity:
            "critical",

          matchId,
          userId:
            loserId,

          eventId:
            Number(
              loserEvent.id,
            ),

          message:
            `El elo_before del perdedor en el partido #${matchId} no coincide con la auditoría.`,

          details: {
            event:
              storedLoserBefore,

            audit:
              loserBefore,
          },
        }),
      );
    }

    if (
      storedWinnerAfter !==
        expected.winnerAfter ||
      storedWinnerDelta !==
        expected.winnerDelta
    ) {
      issues.push(
        createIssue({
          code:
            "winner_elo_formula_mismatch",

          severity:
            "critical",

          matchId,
          userId:
            winnerId,

          eventId:
            Number(
              winnerEvent.id,
            ),

          message:
            `El Elo del ganador en el partido #${matchId} no coincide con la fórmula vigente.`,

          details: {
            stored: {
              before:
                storedWinnerBefore,

              change:
                storedWinnerDelta,

              after:
                storedWinnerAfter,
            },

            expected: {
              before:
                winnerBefore,

              change:
                expected.winnerDelta,

              after:
                expected.winnerAfter,
            },

            winner_provisional:
              winnerProvisional,

            loser_provisional:
              loserProvisional,
          },
        }),
      );
    }

    if (
      storedLoserAfter !==
        expected.loserAfter ||
      storedLoserDelta !==
        expected.loserDelta
    ) {
      issues.push(
        createIssue({
          code:
            "loser_elo_formula_mismatch",

          severity:
            "critical",

          matchId,
          userId:
            loserId,

          eventId:
            Number(
              loserEvent.id,
            ),

          message:
            `El Elo del perdedor en el partido #${matchId} no coincide con la fórmula vigente.`,

          details: {
            stored: {
              before:
                storedLoserBefore,

              change:
                storedLoserDelta,

              after:
                storedLoserAfter,
            },

            expected: {
              before:
                loserBefore,

              change:
                expected.loserDelta,

              after:
                expected.loserAfter,
            },

            winner_provisional:
              winnerProvisional,

            loser_provisional:
              loserProvisional,

            loser_was_number_one:
              loserWasNumberOne,

            dethrone_ceiling:
              expected
                .dethroneCeiling,
          },
        }),
      );
    }

    /*
      Penalización especial:
      establecido pierde con provisional.
    */
    if (
      winnerProvisional &&
      !loserProvisional
    ) {
      const storedPenalty =
        toInteger(
          details
            .special_provisional_penalty,
        );

      if (
        storedPenalty !==
        expected
          .specialProvisionalPenalty
      ) {
        issues.push(
          createIssue({
            code:
              "provisional_upset_penalty_mismatch",

            severity:
              "critical",

            matchId,
            userId:
              loserId,

            message:
              `La penalización especial por perder contra provisional en el partido #${matchId} es incorrecta.`,

            details: {
              stored_penalty:
                storedPenalty,

              expected_penalty:
                expected
                  .specialProvisionalPenalty,

              loser_elo_before:
                loserBefore,
            },
          }),
        );
      }
    }

    /*
      Regla del #1.
    */
    if (
      loserWasNumberOne &&
      numberTwoRatingBefore !==
        null
    ) {
      const correctCeiling =
        numberTwoRatingBefore - 1;

      if (
        storedLoserAfter !== null &&
        storedLoserAfter >
          correctCeiling
      ) {
        issues.push(
          createIssue({
            code:
              "number_one_dethrone_failed",

            severity:
              "critical",

            matchId,
            userId:
              loserId,

            message:
              `El jugador que era #1 antes del partido #${matchId} no cayó por debajo del Elo previo del #2.`,

            details: {
              loser_elo_after:
                storedLoserAfter,

              number_two_rating_before:
                numberTwoRatingBefore,

              required_maximum:
                correctCeiling,
            },
          }),
        );
      }

      const storedCeiling =
        toInteger(
          numberOneInfo
            .ceiling,
        );

      if (
        storedCeiling !== null &&
        storedCeiling !==
          correctCeiling
      ) {
        issues.push(
          createIssue({
            code:
              "number_one_ceiling_mismatch",

            severity:
              "error",

            matchId,
            userId:
              loserId,

            message:
              `El techo de destronamiento registrado para el partido #${matchId} no coincide con Elo #2 - 1.`,

            details: {
              stored_ceiling:
                storedCeiling,

              expected_ceiling:
                correctCeiling,
            },
          }),
        );
      }
    }

    /*
      Transición del partido 5.
    */
    const expectedWinnerCompleted =
      winnerProvisional &&
      winnerMatchesAfter >=
        PLACEMENT_MATCHES;

    const expectedLoserCompleted =
      loserProvisional &&
      loserMatchesAfter >=
        PLACEMENT_MATCHES;

    if (
      Boolean(
        details
          .winner
          .completed_placement,
      ) !==
      expectedWinnerCompleted
    ) {
      issues.push(
        createIssue({
          code:
            "winner_placement_transition_mismatch",

          severity:
            "error",

          matchId,
          userId:
            winnerId,

          message:
            `La transición de placement del ganador en el partido #${matchId} es incorrecta.`,
        }),
      );
    }

    if (
      Boolean(
        details
          .loser
          .completed_placement,
      ) !==
      expectedLoserCompleted
    ) {
      issues.push(
        createIssue({
          code:
            "loser_placement_transition_mismatch",

          severity:
            "error",

          matchId,
          userId:
            loserId,

          message:
            `La transición de placement del perdedor en el partido #${matchId} es incorrecta.`,
        }),
      );
    }
  }
};


/*
  ============================================================
  CONTINUIDAD DEL HISTORIAL ELO

  Para cada jugador:

  elo_after de un evento activo
  debería coincidir con elo_before
  del siguiente evento activo.

  Excepción importante:
  admin_reversal es compensatorio,
  pero igualmente parte del historial
  activo y debe mantener continuidad.
  ============================================================
*/

const auditEloContinuity = ({
  eventsByUser,
  issues,
}) => {
  for (
    const [
      userId,
      rawEvents,
    ] of eventsByUser.entries()
  ) {
    const events =
      rawEvents
        .filter(
          (event) =>
            !event.reversed_at,
        )
        .sort(
          compareEloEvents,
        );

    for (
      let index = 1;
      index < events.length;
      index++
    ) {
      const previous =
        events[index - 1];

      const current =
        events[index];

      const previousAfter =
        toInteger(
          previous.elo_after,
        );

      const currentBefore =
        toInteger(
          current.elo_before,
        );

      if (
        previousAfter === null ||
        currentBefore === null
      ) {
        continue;
      }

      if (
        previousAfter !==
        currentBefore
      ) {
        issues.push(
          createIssue({
            code:
              "elo_history_discontinuity",

            severity:
              "critical",

            userId,

            eventId:
              Number(
                current.id,
              ),

            matchId:
              current.match_id
                ? Number(
                    current.match_id,
                  )
                : null,

            message:
              `El historial Elo del jugador ${userId} tiene un salto entre eventos consecutivos.`,

            details: {
              previous_event_id:
                Number(
                  previous.id,
                ),

              previous_elo_after:
                previousAfter,

              current_event_id:
                Number(
                  current.id,
                ),

              current_elo_before:
                currentBefore,
            },
          }),
        );
      }
    }
  }
};


/*
  ============================================================
  RESUMEN
  ============================================================
*/

const buildSummary = ({
  users,
  matches,
  eloEvents,
  issues,
}) => {
  const bySeverity = {
    critical: 0,
    error: 0,
    warning: 0,
  };

  const byCode = {};

  for (const issue of issues) {
    if (
      Object.prototype.hasOwnProperty.call(
        bySeverity,
        issue.severity,
      )
    ) {
      bySeverity[
        issue.severity
      ] += 1;
    }

    byCode[
      issue.code
    ] =
      (
        byCode[
          issue.code
        ] || 0
      ) + 1;
  }

  const activeCompletedMatches =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        !match.annulled_at,
    ).length;

  const annulledMatches =
    matches.filter(
      (match) =>
        Boolean(
          match.annulled_at,
        ) ||
        match.status ===
          "annulled",
    ).length;

  return {
    healthy:
      issues.length === 0,

    total_issues:
      issues.length,

    critical:
      bySeverity.critical,

    errors:
      bySeverity.error,

    warnings:
      bySeverity.warning,

    users_checked:
      users.length,

    matches_checked:
      matches.length,

    active_completed_matches:
      activeCompletedMatches,

    annulled_matches:
      annulledMatches,

    elo_events_checked:
      eloEvents.length,

    issues_by_code:
      byCode,
  };
};


/*
  ============================================================
  AUDITOR PRINCIPAL

  IMPORTANTE:
  SOLO LECTURA.

  No actualiza:
  - users
  - matches
  - challenges
  - elo_events
  - audit_events
  ============================================================
*/

export const runEloIntegrityAudit =
  async () => {
    const data =
      await loadAuditData();

    const indexes =
      buildIndexes(data);

    const issues = [];

    auditUsers({
      users:
        data.users,

      matches:
        data.matches,

      eventsByUser:
        indexes.eventsByUser,

      issues,
    });

    auditEloEvents({
      eloEvents:
        data.eloEvents,

      matchesById:
        indexes.matchesById,

      issues,
    });

    auditCompletedMatches({
      matches:
        data.matches,

      eventsByMatch:
        indexes.eventsByMatch,

      confirmationAuditByMatch:
        indexes
          .confirmationAuditByMatch,

      issues,
    });

    auditEloContinuity({
      eventsByUser:
        indexes.eventsByUser,

      issues,
    });

    /*
      Critical primero.
      Después error.
      Después warning.
    */
    const severityOrder = {
      critical: 0,
      error: 1,
      warning: 2,
    };

    issues.sort(
      (a, b) => {
        const severityDifference =
          (
            severityOrder[
              a.severity
            ] ?? 99
          ) -
          (
            severityOrder[
              b.severity
            ] ?? 99
          );

        if (
          severityDifference !== 0
        ) {
          return severityDifference;
        }

        if (
          a.match_id !== null &&
          b.match_id !== null &&
          a.match_id !==
            b.match_id
        ) {
          return (
            Number(
              a.match_id,
            ) -
            Number(
              b.match_id,
            )
          );
        }

        return (
          Number(
            a.user_id || 0,
          ) -
          Number(
            b.user_id || 0,
          )
        );
      },
    );

    return {
      generated_at:
        new Date()
          .toISOString(),

      read_only:
        true,

      rules: {
        placement_matches:
          PLACEMENT_MATCHES,

        placement_k:
          PLACEMENT_K,

        normal_k:
          NORMAL_K,

        ranked_loss_to_provisional: {
          minimum:
            RANKED_LOSS_TO_PROVISIONAL_MIN,

          percentage:
            RANKED_LOSS_TO_PROVISIONAL_PERCENT,

          maximum:
            RANKED_LOSS_TO_PROVISIONAL_MAX,
        },

        provisional_beats_ranked: {
          base:
            PLACEMENT_K,

          rating_gap_percentage:
            0.18,

          maximum_total_gain:
            300,
        },

        number_one_rule:
          "min(calculated_elo, number_two_elo_before - 1)",
      },

      summary:
        buildSummary({
          users:
            data.users,

          matches:
            data.matches,

          eloEvents:
            data.eloEvents,

          issues,
        }),

      issues,
    };
  };