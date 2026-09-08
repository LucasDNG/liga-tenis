import {
  OFFICIAL_ELO_FLOOR,
  PLACEMENT_MATCHES,
} from "./eloMatch.service.js";


/*
  ============================================================
  CANCELACIÓN DE PARTIDO ACEPTADO
  ============================================================

  Un rechazo de desafío cuesta 8 Elo.

  Una cancelación unilateral es más grave
  porque ya existían:

  - desafío aceptado
  - rival comprometido
  - fecha
  - lugar
  - rival bloqueado

  Penalización configurada:
  15 Elo.
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
  VALIDACIÓN NUMÉRICA
  ============================================================
*/

const asNonNegativeInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
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
  CALCULAR PENALIZACIÓN POR CANCELACIÓN
  ============================================================

  PROVISIONAL
  ----------
  Piso Elo = 0.

  OFICIAL NORMAL
  --------------
  Piso Elo = 100.

  OFICIAL QUE YA ESTÁ DEBAJO DE 100
  ---------------------------------
  Piso Elo = 0.

  Esto conserva la excepción extrema
  que puede producir la regla literal
  del jugador #1.

  Una penalización nunca puede provocar
  que un jugador gane Elo.
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

    let eloAfter;


    /*
      ========================================================
      PROVISIONAL
      ========================================================
    */

    if (provisional) {
      eloAfter =
        Math.max(
          0,

          currentRating -
            MATCH_CANCELLATION_PENALTY,
        );
    }


    /*
      ========================================================
      OFICIAL NORMAL
      ========================================================
    */

    else if (
      currentRating >=
      OFFICIAL_ELO_FLOOR
    ) {
      eloAfter =
        Math.max(
          OFFICIAL_ELO_FLOOR,

          currentRating -
            MATCH_CANCELLATION_PENALTY,
        );
    }


    /*
      ========================================================
      OFICIAL YA DEBAJO DE 100
      ========================================================

      Puede ocurrir únicamente por el
      caso límite de la regla literal #1.

      No usamos piso 100 porque una
      penalización jamás puede regalar Elo.
    */

    else {
      eloAfter =
        Math.max(
          0,

          currentRating -
            MATCH_CANCELLATION_PENALTY,
        );
    }


    const eloChange =
      eloAfter -
      currentRating;


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


    const effectivePenalty =
      Math.abs(
        eloChange,
      );


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


    /*
      ========================================================
      RESULTADO
      ========================================================
    */

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

      configured_penalty:
        MATCH_CANCELLATION_PENALTY,

      effective_penalty:
        effectivePenalty,
    };
  };