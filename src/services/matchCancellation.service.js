import {
  OFFICIAL_ELO_FLOOR,
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";


/*
  ============================================================
  LA RED
  CANCELACIÓN DE PARTIDO ACEPTADO
  ============================================================

  Reglas actuales:

  - rechazo de desafío:
      -8 Elo

  - cancelación unilateral de partido aceptado:
      -15 Elo

  - cancelación mutua:
      0 Elo

  - cancelación administrativa justificada:
      0 Elo

  Este servicio solamente calcula la penalización
  unilateral de -15 Elo.

  NO modifica PostgreSQL.
  NO cambia estados.
  NO crea eventos.
  ============================================================
*/


export const MATCH_CANCELLATION_PENALTY =
  15;


/*
  ============================================================
  ERROR
  ============================================================
*/

export class MatchCancellationError
  extends Error {
  constructor(
    message,
    reason =
      "match_cancellation_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchCancellationError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  VALIDACIÓN
  ============================================================
*/

const asNonNegativeInteger = (
  value,
  field,
) => {
  const number =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      number,
    ) ||
    number < 0
  ) {
    throw new MatchCancellationError(
      `El campo ${field} debe ser un entero no negativo.`,
      "invalid_numeric_value",
      {
        field,
        value,
      },
    );
  }

  return number;
};


/*
  ============================================================
  PENALIZACIÓN
  ============================================================

  PROVISIONAL
  -----------
  Piso 0.

  OFICIAL NORMAL
  --------------
  Piso 100.

  OFICIAL QUE YA ESTABA DEBAJO DE 100
  ------------------------------------
  Piso 0.

  Una penalización nunca puede regalar Elo.
  ============================================================
*/

export const calculateMatchCancellationElo =
  ({
    rating,
    matchesPlayed,
  }) => {
    const currentRating =
      asNonNegativeInteger(
        rating,
        "rating",
      );

    const currentMatches =
      asNonNegativeInteger(
        matchesPlayed,
        "matchesPlayed",
      );

    const provisional =
      currentMatches <
      PLACEMENT_MATCHES;

    let floor;

    if (
      provisional
    ) {
      floor = 0;
    } else if (
      currentRating >=
      OFFICIAL_ELO_FLOOR
    ) {
      floor =
        OFFICIAL_ELO_FLOOR;
    } else {
      floor = 0;
    }

    const eloAfter =
      Math.max(
        floor,

        currentRating -
          MATCH_CANCELLATION_PENALTY,
      );

    const eloChange =
      eloAfter -
      currentRating;

    const effectivePenalty =
      Math.abs(
        eloChange,
      );

    /*
      ========================================================
      INVARIANTES
      ========================================================
    */

    if (
      !Number.isInteger(
        eloAfter,
      ) ||
      eloAfter < 0
    ) {
      throw new MatchCancellationError(
        "La penalización produjo un Elo inválido.",
        "invalid_cancellation_elo",
        {
          currentRating,
          eloAfter,
        },
      );
    }

    if (
      eloChange > 0
    ) {
      throw new MatchCancellationError(
        "Una penalización por cancelación no puede aumentar Elo.",
        "cancellation_increased_elo",
        {
          currentRating,
          eloAfter,
          eloChange,
        },
      );
    }

    if (
      effectivePenalty >
      MATCH_CANCELLATION_PENALTY
    ) {
      throw new MatchCancellationError(
        "La penalización efectiva superó la penalización configurada.",
        "cancellation_penalty_exceeded",
        {
          configuredPenalty:
            MATCH_CANCELLATION_PENALTY,

          effectivePenalty,

          currentRating,

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

      provisional,

      matches_played:
        currentMatches,

      floor,

      configured_penalty:
        MATCH_CANCELLATION_PENALTY,

      effective_penalty:
        effectivePenalty,
    };
  };