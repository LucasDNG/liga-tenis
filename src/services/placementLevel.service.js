/*
  ============================================================
  LA RED
  MOTOR DE NIVELATORIOS / PLACEMENT
  ============================================================

  Los primeros 5 partidos de cada jugador son nivelatorios.

  REGLA CENTRAL:

  - solamente las VICTORIAS aportan nivel demostrado;
  - perder contra un jugador fuerte NO entrega nivel;
  - la cantidad total de victorias determina
    la confianza del placement;
  - la calidad de los rivales derrotados determina
    qué tan arriba puede colocarse el jugador;
  - 0 victorias => 0% de placement;
  - nadie puede ingresar directamente como #1.

  IMPORTANTE:

  Este servicio NO decide cómo obtener el percentil
  de un rival provisional.

  Recibe referencias deportivas ya congeladas.

  De esta forma podemos cerrar la matemática principal
  sin inventar la regla provisional-vs-provisional.
  ============================================================
*/


/*
  ============================================================
  CONSTANTES
  ============================================================
*/

export const PLACEMENT_MATCHES =
  5;

export const PLACEMENT_LEVEL_MARGIN =
  8;

export const PLACEMENT_PERCENTILE_CAP =
  97;

export const PLACEMENT_MIN_OFFICIAL_POSITION =
  2;

export const OFFICIAL_ELO_FLOOR =
  100;


/*
  ============================================================
  FACTORES POR CANTIDAD DE VICTORIAS
  ============================================================

  0 victorias -> 0%
  1 victoria  -> 65%
  2 victorias -> 78%
  3 victorias -> 88%
  4 victorias -> 95%
  5 victorias -> 100%
  ============================================================
*/

export const PLACEMENT_WIN_FACTORS =
  Object.freeze({
    0: 0,
    1: 0.65,
    2: 0.78,
    3: 0.88,
    4: 0.95,
    5: 1,
  });


/*
  ============================================================
  TIPOS DE REFERENCIA
  ============================================================

  "official":
    rival oficial.

  "provisional":
    rival provisional con referencia ya resuelta
    por otro servicio.

  "other":
    reservado para migraciones / replay / auditoría.

  Este motor NO aplica descuentos distintos según el tipo.
  La referencia recibida ya debe venir congelada.
  ============================================================
*/

export const PLACEMENT_REFERENCE_TYPES =
  Object.freeze([
    "official",
    "provisional",
    "other",
  ]);


/*
  ============================================================
  ERROR
  ============================================================
*/

export class PlacementLevelError extends Error {
  constructor(
    message,
    reason = "placement_level_error",
    details = null,
  ) {
    super(message);

    this.name =
      "PlacementLevelError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


/*
  ============================================================
  HELPERS NUMÉRICOS
  ============================================================
*/

const toFiniteNumber = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    throw new PlacementLevelError(
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
    !Number.isInteger(number)
  ) {
    throw new PlacementLevelError(
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


const clamp = (
  value,
  min,
  max,
) =>
  Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );


const roundPercentile = (
  value,
) =>
  Math.round(
    value * 100,
  ) / 100;


/*
  ============================================================
  NORMALIZAR PERCENTIL
  ============================================================
*/

export const normalizePercentile = (
  value,
  field =
    "percentile",
) => {
  const percentile =
    toFiniteNumber(
      value,
      field,
    );

  if (
    percentile < 0 ||
    percentile > 100
  ) {
    throw new PlacementLevelError(
      `${field} debe estar entre 0 y 100.`,
      "invalid_percentile",
      {
        field,
        value:
          percentile,
      },
    );
  }

  return percentile;
};


/*
  ============================================================
  PESO DE UNA VICTORIA
  ============================================================

  peso = 1 + percentil / 100

  Ejemplos:

  rival 10% -> peso 1.10
  rival 50% -> peso 1.50
  rival 90% -> peso 1.90

  Una victoria importante pesa más,
  sin multiplicar violentamente el resultado.
  ============================================================
*/

export const getVictoryWeight = (
  opponentPercentile,
) => {
  const percentile =
    normalizePercentile(
      opponentPercentile,
      "opponentPercentile",
    );

  return (
    1 +
    percentile / 100
  );
};


/*
  ============================================================
  NORMALIZAR EVIDENCIA
  ============================================================
*/

export const normalizePlacementEvidence = (
  evidence,
  index = 0,
) => {
  if (
    !evidence ||
    typeof evidence !==
      "object" ||
    Array.isArray(evidence)
  ) {
    throw new PlacementLevelError(
      `La evidencia ${index + 1} es inválida.`,
      "invalid_evidence",
      {
        index,
      },
    );
  }

  const won =
    Boolean(
      evidence.won,
    );

  let opponentPercentileAtMatch =
    null;

  if (
    evidence.opponent_percentile_at_match !==
      null &&
    evidence.opponent_percentile_at_match !==
      undefined
  ) {
    opponentPercentileAtMatch =
      normalizePercentile(
        evidence.opponent_percentile_at_match,
        `evidence[${index}].opponent_percentile_at_match`,
      );
  }

  if (
    won &&
    opponentPercentileAtMatch ===
      null
  ) {
    throw new PlacementLevelError(
      "Toda victoria necesita una referencia porcentual congelada.",
      "victory_reference_missing",
      {
        index,
        match_id:
          evidence.match_id ??
          null,
      },
    );
  }

  const referenceType =
    String(
      evidence.opponent_reference_type ??
        "other",
    );

  if (
    !PLACEMENT_REFERENCE_TYPES.includes(
      referenceType,
    )
  ) {
    throw new PlacementLevelError(
      "Tipo de referencia de rival inválido.",
      "invalid_reference_type",
      {
        index,
        reference_type:
          referenceType,
      },
    );
  }

  return {
    match_id:
      evidence.match_id ??
      null,

    opponent_id:
      evidence.opponent_id ??
      null,

    won,

    opponent_percentile_at_match:
      opponentPercentileAtMatch,

    opponent_reference_type:
      referenceType,
  };
};


/*
  ============================================================
  PROMEDIO PONDERADO DE VICTORIAS
  ============================================================
*/

export const calculateWeightedVictoryPercentile = (
  victoryEvidence,
) => {
  if (
    !Array.isArray(
      victoryEvidence,
    )
  ) {
    throw new PlacementLevelError(
      "victoryEvidence debe ser un array.",
      "invalid_victory_evidence",
    );
  }

  if (
    victoryEvidence.length ===
    0
  ) {
    return {
      weighted_percentile:
        0,

      total_weight:
        0,

      weighted_sum:
        0,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (
    let index = 0;
    index <
    victoryEvidence.length;
    index += 1
  ) {
    const evidence =
      normalizePlacementEvidence(
        victoryEvidence[index],
        index,
      );

    if (!evidence.won) {
      continue;
    }

    const percentile =
      evidence
        .opponent_percentile_at_match;

    const weight =
      getVictoryWeight(
        percentile,
      );

    weightedSum +=
      percentile *
      weight;

    totalWeight +=
      weight;
  }

  if (
    totalWeight === 0
  ) {
    return {
      weighted_percentile:
        0,

      total_weight:
        0,

      weighted_sum:
        0,
    };
  }

  return {
    weighted_percentile:
      roundPercentile(
        weightedSum /
          totalWeight,
      ),

    total_weight:
      roundPercentile(
        totalWeight,
      ),

    weighted_sum:
      roundPercentile(
        weightedSum,
      ),
  };
};


/*
  ============================================================
  NIVEL DEMOSTRADO
  ============================================================
*/

export const calculateDemonstratedLevel = (
  weightedVictoryPercentile,
) => {
  const weighted =
    normalizePercentile(
      weightedVictoryPercentile,
      "weightedVictoryPercentile",
    );

  return roundPercentile(
    clamp(
      weighted +
        PLACEMENT_LEVEL_MARGIN,

      0,

      PLACEMENT_PERCENTILE_CAP,
    ),
  );
};


/*
  ============================================================
  FACTOR DE CONFIANZA POR VICTORIAS
  ============================================================
*/

export const getPlacementWinFactor = (
  wins,
) => {
  const normalizedWins =
    toInteger(
      wins,
      "wins",
    );

  if (
    normalizedWins < 0 ||
    normalizedWins >
      PLACEMENT_MATCHES
  ) {
    throw new PlacementLevelError(
      `wins debe estar entre 0 y ${PLACEMENT_MATCHES}.`,
      "invalid_win_count",
      {
        wins:
          normalizedWins,
      },
    );
  }

  return PLACEMENT_WIN_FACTORS[
    normalizedWins
  ];
};


/*
  ============================================================
  PLACEMENT PERCENTILE
  ============================================================
*/

export const calculatePlacementPercentile = ({
  evidence,
}) => {
  if (
    !Array.isArray(evidence)
  ) {
    throw new PlacementLevelError(
      "evidence debe ser un array.",
      "invalid_evidence_collection",
    );
  }

  if (
    evidence.length >
    PLACEMENT_MATCHES
  ) {
    throw new PlacementLevelError(
      `El placement no puede contener más de ${PLACEMENT_MATCHES} partidos.`,
      "too_many_placement_matches",
      {
        matches:
          evidence.length,
      },
    );
  }

  const normalizedEvidence =
    evidence.map(
      (
        item,
        index,
      ) =>
        normalizePlacementEvidence(
          item,
          index,
        ),
    );

  const victories =
    normalizedEvidence.filter(
      (item) =>
        item.won,
    );

  const wins =
    victories.length;

  const losses =
    normalizedEvidence.length -
    wins;

  if (
    wins === 0
  ) {
    return {
      matches_played:
        normalizedEvidence.length,

      wins:
        0,

      losses,

      weighted_victory_percentile:
        0,

      demonstrated_level:
        0,

      win_factor:
        0,

      placement_percentile:
        0,

      completed:
        normalizedEvidence.length ===
        PLACEMENT_MATCHES,

      victory_evidence:
        [],
    };
  }

  const weighted =
    calculateWeightedVictoryPercentile(
      victories,
    );

  const demonstratedLevel =
    calculateDemonstratedLevel(
      weighted.weighted_percentile,
    );

  const winFactor =
    getPlacementWinFactor(
      wins,
    );

  const placementPercentile =
    roundPercentile(
      clamp(
        demonstratedLevel *
          winFactor,

        0,

        PLACEMENT_PERCENTILE_CAP,
      ),
    );

  return {
    matches_played:
      normalizedEvidence.length,

    wins,

    losses,

    weighted_victory_percentile:
      weighted.weighted_percentile,

    demonstrated_level:
      demonstratedLevel,

    win_factor:
      winFactor,

    placement_percentile:
      placementPercentile,

    completed:
      normalizedEvidence.length ===
      PLACEMENT_MATCHES,

    victory_evidence:
      victories,
  };
};


/*
  ============================================================
  PERCENTIL -> POSICIÓN OBJETIVO
  ============================================================

  N = cantidad de jugadores oficiales ANTES
      del ingreso del nuevo oficial.

  posición base:

  1 + floor((1 - percentile / 100) * N)

  Reglas:

  - 0% termina debajo de todos => N + 1
  - nunca ingresa directamente #1
  - posición mínima de placement => #2

  IMPORTANTE:

  La operación se hace como:

    ((100 - percentile) * N) / 100

  en lugar de:

    (1 - percentile / 100) * N

  porque esta segunda forma puede producir errores
  de precisión binaria en JavaScript.

  Ejemplo incorrecto de punto flotante:

    (1 - 0.8) * 20
    => 3.999999999999999

  y Math.floor daría 3 en lugar de 4.

  El pequeño epsilon protege únicamente contra
  ese error de representación numérica.
  ============================================================
*/

export const placementPercentileToTargetPosition = ({
  placementPercentile,
  officialPlayerCount,
}) => {
  const percentile =
    normalizePercentile(
      placementPercentile,
      "placementPercentile",
    );

  const officialCount =
    toInteger(
      officialPlayerCount,
      "officialPlayerCount",
    );

  if (
    officialCount < 0
  ) {
    throw new PlacementLevelError(
      "officialPlayerCount no puede ser negativo.",
      "invalid_official_player_count",
      {
        official_player_count:
          officialCount,
      },
    );
  }

  if (
    officialCount === 0
  ) {
    return {
      requested_position:
        1,

      target_position:
        1,

      official_player_count:
        0,

      protected_from_number_one:
        false,
    };
  }

  if (
    percentile === 0
  ) {
    return {
      requested_position:
        officialCount + 1,

      target_position:
        officialCount + 1,

      official_player_count:
        officialCount,

      protected_from_number_one:
        false,
    };
  }

  const rawPositionOffset =
    (
      (
        100 -
        percentile
      ) *
      officialCount
    ) /
    100;

  const requestedPosition =
    1 +
    Math.floor(
      rawPositionOffset +
      1e-10,
    );

  const targetPosition =
    clamp(
      requestedPosition,

      Math.min(
        PLACEMENT_MIN_OFFICIAL_POSITION,
        officialCount + 1,
      ),

      officialCount + 1,
    );

  return {
    requested_position:
      requestedPosition,

    target_position:
      targetPosition,

    official_player_count:
      officialCount,

    protected_from_number_one:
      requestedPosition === 1 &&
      targetPosition !== 1,
  };
};


/*
  ============================================================
  ELO OBJETIVO DESDE RANKING REAL
  ============================================================
*/

export const getPlacementTargetElo = ({
  targetPosition,
  officialRanking,
}) => {
  const position =
    toInteger(
      targetPosition,
      "targetPosition",
    );

  if (
    position <= 0
  ) {
    throw new PlacementLevelError(
      "targetPosition debe ser positiva.",
      "invalid_target_position",
      {
        target_position:
          position,
      },
    );
  }

  if (
    !Array.isArray(
      officialRanking,
    )
  ) {
    throw new PlacementLevelError(
      "officialRanking debe ser un array.",
      "invalid_official_ranking",
    );
  }

  if (
    officialRanking.length ===
    0
  ) {
    return {
      target_elo:
        OFFICIAL_ELO_FLOOR,

      reference_player_id:
        null,

      reference_position:
        null,

      reference_rating:
        null,

      used_floor:
        true,
    };
  }

  const sortedRanking =
    [...officialRanking]
      .map(
        (
          player,
          index,
        ) => ({
          ...player,

          normalized_position:
            Number(
              player.position ??
              player.official_position ??
              player.rank_position ??
              index + 1,
            ),

          normalized_rating:
            Number(
              player.rating,
            ),
        }),
      )
      .sort(
        (a, b) =>
          a.normalized_position -
          b.normalized_position,
      );

  let referencePlayer =
    sortedRanking.find(
      (player) =>
        player.normalized_position ===
        position,
    ) ||
    null;

  if (!referencePlayer) {
    referencePlayer =
      sortedRanking[
        sortedRanking.length - 1
      ];
  }

  if (
    !referencePlayer ||
    !Number.isFinite(
      referencePlayer
        .normalized_rating,
    )
  ) {
    throw new PlacementLevelError(
      "No se pudo obtener un Elo de referencia válido.",
      "placement_elo_reference_missing",
    );
  }

  const referenceRating =
    Math.round(
      referencePlayer
        .normalized_rating,
    );

  const targetElo =
    Math.max(
      OFFICIAL_ELO_FLOOR,
      referenceRating,
    );

  return {
    target_elo:
      targetElo,

    reference_player_id:
      Number(
        referencePlayer.id,
      ),

    reference_position:
      referencePlayer
        .normalized_position,

    reference_rating:
      referenceRating,

    used_floor:
      targetElo !==
      referenceRating,
  };
};


/*
  ============================================================
  RESULTADO COMPLETO DEL PLACEMENT
  ============================================================
*/

export const calculateCompletedPlacement = ({
  evidence,
  officialRanking,
}) => {
  if (
    !Array.isArray(evidence) ||
    evidence.length !==
      PLACEMENT_MATCHES
  ) {
    throw new PlacementLevelError(
      `Se necesitan exactamente ${PLACEMENT_MATCHES} partidos para completar el placement.`,
      "placement_not_complete",
      {
        matches:
          Array.isArray(evidence)
            ? evidence.length
            : null,
      },
    );
  }

  if (
    !Array.isArray(
      officialRanking,
    )
  ) {
    throw new PlacementLevelError(
      "officialRanking debe ser un array.",
      "invalid_official_ranking",
    );
  }

  const level =
    calculatePlacementPercentile({
      evidence,
    });

  const position =
    placementPercentileToTargetPosition({
      placementPercentile:
        level.placement_percentile,

      officialPlayerCount:
        officialRanking.length,
    });

  const elo =
    getPlacementTargetElo({
      targetPosition:
        position.target_position,

      officialRanking,
    });

  return {
    ...level,

    requested_position:
      position.requested_position,

    target_position:
      position.target_position,

    protected_from_number_one:
      position
        .protected_from_number_one,

    official_player_count_before:
      officialRanking.length,

    target_elo:
      elo.target_elo,

    elo_reference_player_id:
      elo.reference_player_id,

    elo_reference_position:
      elo.reference_position,

    elo_reference_rating:
      elo.reference_rating,

    elo_floor_used:
      elo.used_floor,
  };
};