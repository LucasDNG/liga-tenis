import {
  PLACEMENT_MATCHES,
} from "./placementLevel.service.js";


export class PlacementEvidenceError extends Error {
  constructor(
    message,
    reason = "placement_evidence_error",
    details = null,
  ) {
    super(message);

    this.name =
      "PlacementEvidenceError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new PlacementEvidenceError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
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
    throw new PlacementEvidenceError(
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
    throw new PlacementEvidenceError(
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


const normalizePercentile = (
  value,
  field = "percentile",
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    ) ||
    number < 0 ||
    number > 100
  ) {
    throw new PlacementEvidenceError(
      `${field} debe estar entre 0 y 100.`,
      "invalid_percentile",
      {
        field,
        value,
      },
    );
  }

  return (
    Math.round(
      number * 100,
    ) / 100
  );
};


const normalizeReferenceType = (
  value,
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const referenceType =
    String(value);

  const allowed = [
    "official",
    "provisional",
    "other",
  ];

  if (
    !allowed.includes(
      referenceType,
    )
  ) {
    throw new PlacementEvidenceError(
      "Tipo de referencia de placement inválido.",
      "invalid_reference_type",
      {
        reference_type:
          referenceType,
      },
    );
  }

  return referenceType;
};


const normalizeEvidenceRow = (
  row,
) => {
  if (!row) {
    return null;
  }

  return {
    ...row,

    id:
      Number(
        row.id,
      ),

    match_id:
      Number(
        row.match_id,
      ),

    user_id:
      Number(
        row.user_id,
      ),

    competition_id:
      Number(
        row.competition_id,
      ),

    opponent_id:
      Number(
        row.opponent_id,
      ),

    placement_match_number:
      Number(
        row.placement_match_number,
      ),

    won:
      Boolean(
        row.won,
      ),

    opponent_percentile_at_match:
      row
        .opponent_percentile_at_match ===
      null
        ? null
        : Number(
            row
              .opponent_percentile_at_match,
          ),

    opponent_rank_position_at_match:
      row
        .opponent_rank_position_at_match ===
      null
        ? null
        : Number(
            row
              .opponent_rank_position_at_match,
          ),

    official_player_count_at_match:
      row
        .official_player_count_at_match ===
      null
        ? null
        : Number(
            row
              .official_player_count_at_match,
          ),
  };
};


export const countPlayerPlacementEvidence =
  async (
    client,
    userId,
    competitionId,
  ) => {
    assertClient(
      client,
    );

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          COUNT(*)::int AS total

        FROM placement_match_evidence

        WHERE
          user_id = $1
          AND competition_id = $2
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    return Number(
      result.rows[0]
        ?.total ??
        0,
    );
  };


export const getNextPlacementMatchNumber =
  async (
    client,
    userId,
    competitionId,
  ) => {
    const total =
      await countPlayerPlacementEvidence(
        client,
        userId,
        competitionId,
      );

    if (
      total >=
      PLACEMENT_MATCHES
    ) {
      return null;
    }

    return total + 1;
  };


export const createPlacementEvidence =
  async (
    client,
    {
      matchId,
      userId,
      competitionId,
      opponentId,
      placementMatchNumber,
      won,
      opponentPercentileAtMatch = null,
      opponentReferenceType = null,
      opponentRankPositionAtMatch = null,
      officialPlayerCountAtMatch = null,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedOpponentId =
      toPositiveInteger(
        opponentId,
        "opponentId",
      );

    if (
      normalizedUserId ===
      normalizedOpponentId
    ) {
      throw new PlacementEvidenceError(
        "Jugador y rival no pueden ser la misma persona.",
        "same_player",
      );
    }

    const normalizedPlacementMatchNumber =
      toInteger(
        placementMatchNumber,
        "placementMatchNumber",
      );

    if (
      normalizedPlacementMatchNumber <
        1 ||
      normalizedPlacementMatchNumber >
        PLACEMENT_MATCHES
    ) {
      throw new PlacementEvidenceError(
        `placementMatchNumber debe estar entre 1 y ${PLACEMENT_MATCHES}.`,
        "invalid_placement_match_number",
        {
          placement_match_number:
            normalizedPlacementMatchNumber,
        },
      );
    }

    if (
      typeof won !==
      "boolean"
    ) {
      throw new PlacementEvidenceError(
        "won debe ser boolean.",
        "invalid_result",
      );
    }

    const percentile =
      normalizePercentile(
        opponentPercentileAtMatch,
        "opponentPercentileAtMatch",
      );

    const referenceType =
      normalizeReferenceType(
        opponentReferenceType,
      );

    if (
      won &&
      percentile === null
    ) {
      throw new PlacementEvidenceError(
        "Toda victoria nivelatoria necesita una referencia porcentual congelada del rival.",
        "victory_reference_missing",
        {
          match_id:
            normalizedMatchId,

          user_id:
            normalizedUserId,

          competition_id:
            normalizedCompetitionId,

          opponent_id:
            normalizedOpponentId,
        },
      );
    }

    let normalizedRankPosition =
      null;

    if (
      opponentRankPositionAtMatch !==
        null &&
      opponentRankPositionAtMatch !==
        undefined
    ) {
      normalizedRankPosition =
        toPositiveInteger(
          opponentRankPositionAtMatch,
          "opponentRankPositionAtMatch",
        );
    }

    let normalizedOfficialCount =
      null;

    if (
      officialPlayerCountAtMatch !==
        null &&
      officialPlayerCountAtMatch !==
        undefined
    ) {
      normalizedOfficialCount =
        toInteger(
          officialPlayerCountAtMatch,
          "officialPlayerCountAtMatch",
        );

      if (
        normalizedOfficialCount <
        0
      ) {
        throw new PlacementEvidenceError(
          "officialPlayerCountAtMatch no puede ser negativo.",
          "invalid_official_player_count",
        );
      }
    }

    /*
      Blindaje adicional:

      match_id y competition_id deben coincidir.

      Evita guardar por error una evidencia de singles
      dentro de dobles o viceversa.
    */

    const matchCheck =
      await client.query(
        `
        SELECT
          id,
          competition_id

        FROM matches

        WHERE id = $1

        LIMIT 1
        `,
        [
          normalizedMatchId,
        ],
      );

    if (
      matchCheck.rowCount === 0
    ) {
      throw new PlacementEvidenceError(
        "El partido no existe.",
        "match_not_found",
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    if (
      Number(
        matchCheck.rows[0]
          .competition_id,
      ) !==
      normalizedCompetitionId
    ) {
      throw new PlacementEvidenceError(
        "La competición de la evidencia no coincide con la del partido.",
        "match_competition_mismatch",
        {
          match_id:
            normalizedMatchId,

          expected_competition_id:
            Number(
              matchCheck.rows[0]
                .competition_id,
            ),

          received_competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const result =
      await client.query(
        `
        INSERT INTO placement_match_evidence (
          match_id,
          user_id,
          competition_id,
          opponent_id,
          placement_match_number,
          won,
          opponent_percentile_at_match,
          opponent_reference_type,
          opponent_rank_position_at_match,
          official_player_count_at_match
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
          $10
        )

        ON CONFLICT (
          match_id,
          user_id
        )

        DO NOTHING

        RETURNING *
        `,
        [
          normalizedMatchId,
          normalizedUserId,
          normalizedCompetitionId,
          normalizedOpponentId,
          normalizedPlacementMatchNumber,
          won,
          percentile,
          referenceType,
          normalizedRankPosition,
          normalizedOfficialCount,
        ],
      );

    if (
      result.rowCount
    ) {
      return normalizeEvidenceRow(
        result.rows[0],
      );
    }

    const existing =
      await getPlacementEvidenceByMatch(
        client,
        {
          matchId:
            normalizedMatchId,

          userId:
            normalizedUserId,

          competitionId:
            normalizedCompetitionId,
        },
      );

    if (!existing) {
      throw new PlacementEvidenceError(
        "No se pudo crear ni recuperar la evidencia del nivelatorio.",
        "placement_evidence_write_failed",
      );
    }

    return existing;
  };


export const getPlacementEvidenceByMatch =
  async (
    client,
    {
      matchId,
      userId,
      competitionId,
    },
  ) => {
    assertClient(
      client,
    );

    const normalizedMatchId =
      toPositiveInteger(
        matchId,
        "matchId",
      );

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          *

        FROM placement_match_evidence

        WHERE
          match_id = $1
          AND user_id = $2
          AND competition_id = $3

        LIMIT 1
        `,
        [
          normalizedMatchId,
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    return normalizeEvidenceRow(
      result.rows[0] ||
      null,
    );
  };


export const getPlayerPlacementEvidence =
  async (
    client,
    userId,
    competitionId,
  ) => {
    assertClient(
      client,
    );

    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const result =
      await client.query(
        `
        SELECT
          *

        FROM placement_match_evidence

        WHERE
          user_id = $1
          AND competition_id = $2

        ORDER BY
          placement_match_number ASC,
          id ASC
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
        ],
      );

    return result.rows.map(
      normalizeEvidenceRow,
    );
  };


export const getPlayerPlacementCalculationEvidence =
  async (
    client,
    userId,
    competitionId,
  ) => {
    const rows =
      await getPlayerPlacementEvidence(
        client,
        userId,
        competitionId,
      );

    return rows.map(
      (row) => ({
        match_id:
          row.match_id,

        competition_id:
          row.competition_id,

        opponent_id:
          row.opponent_id,

        won:
          row.won,

        opponent_percentile_at_match:
          row
            .opponent_percentile_at_match,

        opponent_reference_type:
          row
            .opponent_reference_type ??
          "other",
      }),
    );
  };


export const getPlayerPlacementProgress =
  async (
    client,
    userId,
    competitionId,
  ) => {
    const normalizedUserId =
      toPositiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      toPositiveInteger(
        competitionId,
        "competitionId",
      );

    const evidence =
      await getPlayerPlacementEvidence(
        client,
        normalizedUserId,
        normalizedCompetitionId,
      );

    validatePlacementEvidenceSequence(
      evidence,
      normalizedCompetitionId,
    );

    const wins =
      evidence.filter(
        (row) =>
          row.won,
      ).length;

    const played =
      evidence.length;

    return {
      user_id:
        normalizedUserId,

      competition_id:
        normalizedCompetitionId,

      played,

      wins,

      losses:
        played -
        wins,

      remaining:
        Math.max(
          0,
          PLACEMENT_MATCHES -
            played,
        ),

      completed:
        played >=
        PLACEMENT_MATCHES,

      evidence,
    };
  };


export const validatePlacementEvidenceSequence =
  (
    evidence,
    competitionId = null,
  ) => {
    if (
      !Array.isArray(
        evidence,
      )
    ) {
      throw new PlacementEvidenceError(
        "evidence debe ser un array.",
        "invalid_evidence_collection",
      );
    }

    const normalizedCompetitionId =
      competitionId === null ||
      competitionId === undefined
        ? null
        : toPositiveInteger(
            competitionId,
            "competitionId",
          );

    if (
      evidence.length >
      PLACEMENT_MATCHES
    ) {
      throw new PlacementEvidenceError(
        "Hay más de cinco evidencias de nivelatorios en la competición.",
        "too_many_placement_matches",
        {
          competition_id:
            normalizedCompetitionId,

          total:
            evidence.length,
        },
      );
    }

    const seenNumbers =
      new Set();

    for (
      const row of
      evidence
    ) {
      if (
        normalizedCompetitionId !==
          null &&
        Number(
          row.competition_id,
        ) !==
          normalizedCompetitionId
      ) {
        throw new PlacementEvidenceError(
          "La evidencia contiene otra competición.",
          "placement_competition_mismatch",
          {
            expected_competition_id:
              normalizedCompetitionId,

            received_competition_id:
              Number(
                row.competition_id,
              ),
          },
        );
      }

      const number =
        toInteger(
          row
            .placement_match_number,
          "placement_match_number",
        );

      if (
        number < 1 ||
        number >
          PLACEMENT_MATCHES
      ) {
        throw new PlacementEvidenceError(
          "Número de nivelatorio fuera de rango.",
          "invalid_placement_match_number",
          {
            placement_match_number:
              number,
          },
        );
      }

      if (
        seenNumbers.has(
          number,
        )
      ) {
        throw new PlacementEvidenceError(
          "Hay números de nivelatorio duplicados dentro de la competición.",
          "duplicate_placement_match_number",
          {
            competition_id:
              normalizedCompetitionId,

            placement_match_number:
              number,
          },
        );
      }

      seenNumbers.add(
        number,
      );
    }

    const ordered =
      [...seenNumbers].sort(
        (a, b) =>
          a - b,
      );

    for (
      let index = 0;
      index <
      ordered.length;
      index += 1
    ) {
      const expected =
        index + 1;

      if (
        ordered[index] !==
        expected
      ) {
        throw new PlacementEvidenceError(
          "La secuencia de nivelatorios tiene huecos.",
          "placement_sequence_gap",
          {
            competition_id:
              normalizedCompetitionId,

            expected,

            received:
              ordered[index],
          },
        );
      }
    }

    return true;
  };