/*
  ============================================================
  LA RED
  VALIDACIÓN DE RESULTADOS DE TENIS
  ============================================================

  Servicio puro.

  NO consulta PostgreSQL.
  NO modifica partidos.
  NO calcula Elo.
  NO decide placement.

  Reglas actuales:

  - partido al mejor de 3 sets;
  - puede terminar 2-0 o 2-1;
  - si cada jugador gana uno de los primeros dos sets,
    el tercero es obligatorio;
  - si alguien gana los primeros dos sets,
    no corresponde tercer set;

  Sets válidos:
  - 6-0
  - 6-1
  - 6-2
  - 6-3
  - 6-4
  - 7-5
  - 7-6

  y sus resultados invertidos.
  ============================================================
*/


/*
  ============================================================
  ERROR
  ============================================================
*/

export class MatchScoreError extends Error {
  constructor(
    message,
    reason = "invalid_score",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchScoreError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  GAME VALUE
  ============================================================
*/

export const parseGameValue = (
  value,
) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value ===
      "boolean"
  ) {
    return null;
  }

  if (
    typeof value !==
      "number" &&
    typeof value !==
      "string"
  ) {
    return null;
  }

  if (
    typeof value ===
      "string" &&
    value.trim() ===
      ""
  ) {
    return null;
  }

  const number =
    Number(
      value,
    );

  return Number.isInteger(
    number,
  )
    ? number
    : null;
};


/*
  ============================================================
  SET VÁLIDO
  ============================================================
*/

export const isValidSet = (
  player1Games,
  player2Games,
) => {
  if (
    !Number.isInteger(
      player1Games,
    ) ||
    !Number.isInteger(
      player2Games,
    ) ||
    player1Games < 0 ||
    player2Games < 0
  ) {
    return false;
  }

  const max =
    Math.max(
      player1Games,
      player2Games,
    );

  const min =
    Math.min(
      player1Games,
      player2Games,
    );

  if (
    max === 6 &&
    min <= 4
  ) {
    return true;
  }

  if (
    max === 7 &&
    (
      min === 5 ||
      min === 6
    )
  ) {
    return true;
  }

  return false;
};


/*
  ============================================================
  PARSEAR SCORE
  ============================================================

  Conservamos la forma de retorno histórica del controller:

  válido:
    {
      winnerSide: 1 | 2,
      normalizedScore: [...]
    }

  inválido:
    {
      error: "..."
    }

  Esto permite mover la lógica sin cambiar todavía
  las respuestas HTTP existentes.
  ============================================================
*/

export const parseMatchScore = (
  score,
) => {
  if (
    !Array.isArray(
      score,
    ) ||
    (
      score.length !== 2 &&
      score.length !== 3
    )
  ) {
    return {
      error:
        "El partido debe tener exactamente 2 o 3 sets",
    };
  }

  const normalizedScore =
    [];

  const setWinners =
    [];

  for (
    let index = 0;
    index < score.length;
    index += 1
  ) {
    const currentSet =
      score[index];

    if (
      !currentSet ||
      typeof currentSet !==
        "object" ||
      Array.isArray(
        currentSet,
      )
    ) {
      return {
        error:
          `El Set ${index + 1} no tiene un formato válido.`,
      };
    }

    const player1Games =
      parseGameValue(
        currentSet.p1,
      );

    const player2Games =
      parseGameValue(
        currentSet.p2,
      );

    if (
      player1Games ===
        null ||
      player2Games ===
        null
    ) {
      return {
        error:
          `Completá correctamente los dos valores del Set ${index + 1}.`,
      };
    }

    if (
      !isValidSet(
        player1Games,
        player2Games,
      )
    ) {
      return {
        error:
          `El Set ${index + 1} no es válido. Ejemplos: 6-4, 7-5 o 7-6.`,
      };
    }

    normalizedScore.push({
      p1:
        player1Games,

      p2:
        player2Games,
    });

    setWinners.push(
      player1Games >
        player2Games
        ? 1
        : 2,
    );
  }

  /*
    ==========================================================
    PARTIDO 2-0
    ==========================================================
  */

  if (
    normalizedScore.length ===
    2
  ) {
    if (
      setWinners[0] !==
      setWinners[1]
    ) {
      return {
        error:
          "Si cada jugador ganó un set, tenés que cargar el tercer set.",
      };
    }

    return {
      winnerSide:
        setWinners[0],

      normalizedScore,
    };
  }

  /*
    ==========================================================
    PARTIDO CON TERCER SET
    ==========================================================
  */

  if (
    setWinners[0] ===
    setWinners[1]
  ) {
    return {
      error:
        "Si un jugador ganó los dos primeros sets no corresponde cargar un tercer set.",
    };
  }

  return {
    winnerSide:
      setWinners[2],

    normalizedScore,
  };
};


/*
  ============================================================
  VERSIÓN STRICT
  ============================================================

  Útil para servicios internos futuros.

  En lugar de devolver { error }, lanza MatchScoreError.
  El controller actual puede seguir usando parseMatchScore
  para conservar exactamente su contrato HTTP.
  ============================================================
*/

export const validateMatchScore = (
  score,
) => {
  const parsed =
    parseMatchScore(
      score,
    );

  if (
    parsed.error
  ) {
    throw new MatchScoreError(
      parsed.error,
      "invalid_score",
      {
        score,
      },
    );
  }

  return parsed;
};