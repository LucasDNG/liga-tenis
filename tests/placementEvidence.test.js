import test from "node:test";
import assert from "node:assert/strict";

import {
  PlacementEvidenceError,
  countPlayerPlacementEvidence,
  getNextPlacementMatchNumber,
  createPlacementEvidence,
  getPlacementEvidenceByMatch,
  getPlayerPlacementEvidence,
  getPlayerPlacementCalculationEvidence,
  getPlayerPlacementProgress,
  validatePlacementEvidenceSequence,
} from "../src/services/placementEvidence.service.js";


const COMPETITION_ID = 1;
const OTHER_COMPETITION_ID = 2;


const makeClient = (
  responses = [],
) => {
  let index = 0;

  const calls = [];

  return {
    calls,

    async query(
      text,
      params = [],
    ) {
      calls.push({
        text,
        params,
      });

      if (
        index >=
        responses.length
      ) {
        throw new Error(
          `Mock PostgreSQL sin respuesta configurada para query #${index + 1}.`,
        );
      }

      const response =
        responses[index];

      index += 1;

      if (
        response instanceof Error
      ) {
        throw response;
      }

      if (
        typeof response ===
        "function"
      ) {
        return response(
          text,
          params,
          calls.length,
        );
      }

      return {
        rows:
          response.rows ?? [],
        rowCount:
          response.rowCount ??
          response.rows?.length ??
          0,
      };
    },
  };
};


const makeEvidence = ({
  id = 1,
  matchId = 100,
  userId = 10,
  competitionId = COMPETITION_ID,
  opponentId = 20,
  number = 1,
  won = false,
  percentile = null,
  referenceType = null,
  rankPosition = null,
  officialCount = null,
} = {}) => ({
  id,
  match_id:
    matchId,
  user_id:
    userId,
  competition_id:
    competitionId,
  opponent_id:
    opponentId,
  placement_match_number:
    number,
  won,
  opponent_percentile_at_match:
    percentile,
  opponent_reference_type:
    referenceType,
  opponent_rank_position_at_match:
    rankPosition,
  official_player_count_at_match:
    officialCount,
});


const assertReason = (
  reason,
) => (
  error,
) => {
  assert.ok(
    error instanceof
      PlacementEvidenceError,
  );

  assert.equal(
    error.reason,
    reason,
  );

  return true;
};


test(
  "countPlayerPlacementEvidence cuenta solamente usuario y competición",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              total: 3,
            },
          ],
        },
      ]);

    const total =
      await countPlayerPlacementEvidence(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      total,
      3,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        10,
        COMPETITION_ID,
      ],
    );

    assert.match(
      client.calls[0].text,
      /user_id = \$1/,
    );

    assert.match(
      client.calls[0].text,
      /competition_id = \$2/,
    );
  },
);


test(
  "countPlayerPlacementEvidence devuelve 0 cuando no hay evidencia",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              total: 0,
            },
          ],
        },
      ]);

    assert.equal(
      await countPlayerPlacementEvidence(
        client,
        10,
        COMPETITION_ID,
      ),
      0,
    );
  },
);


test(
  "getNextPlacementMatchNumber devuelve 1 cuando todavía no jugó",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              total: 0,
            },
          ],
        },
      ]);

    assert.equal(
      await getNextPlacementMatchNumber(
        client,
        10,
        COMPETITION_ID,
      ),
      1,
    );
  },
);


test(
  "getNextPlacementMatchNumber devuelve 5 después de cuatro evidencias",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              total: 4,
            },
          ],
        },
      ]);

    assert.equal(
      await getNextPlacementMatchNumber(
        client,
        10,
        COMPETITION_ID,
      ),
      5,
    );
  },
);


test(
  "getNextPlacementMatchNumber devuelve null después de cinco evidencias",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              total: 5,
            },
          ],
        },
      ]);

    assert.equal(
      await getNextPlacementMatchNumber(
        client,
        10,
        COMPETITION_ID,
      ),
      null,
    );
  },
);


test(
  "createPlacementEvidence guarda competition_id",
  async () => {
    const row =
      makeEvidence({
        won: true,
        percentile: 80,
        referenceType:
          "official",
        rankPosition: 2,
        officialCount: 10,
      });

    const client =
      makeClient([
        {
          rows: [
            {
              id: 100,
              competition_id:
                COMPETITION_ID,
            },
          ],
        },
        {
          rows: [
            row,
          ],
        },
      ]);

    const created =
      await createPlacementEvidence(
        client,
        {
          matchId: 100,
          userId: 10,
          competitionId:
            COMPETITION_ID,
          opponentId: 20,
          placementMatchNumber: 1,
          won: true,
          opponentPercentileAtMatch:
            80,
          opponentReferenceType:
            "official",
          opponentRankPositionAtMatch:
            2,
          officialPlayerCountAtMatch:
            10,
        },
      );

    assert.equal(
      created.competition_id,
      COMPETITION_ID,
    );

    assert.equal(
      created.user_id,
      10,
    );

    assert.equal(
      created.match_id,
      100,
    );

    assert.equal(
      created.placement_match_number,
      1,
    );

    assert.equal(
      created.won,
      true,
    );

    assert.deepEqual(
      client.calls[0].params,
      [100],
    );

    assert.deepEqual(
      client.calls[1].params,
      [
        100,
        10,
        COMPETITION_ID,
        20,
        1,
        true,
        80,
        "official",
        2,
        10,
      ],
    );
  },
);


test(
  "createPlacementEvidence permite derrota sin percentil del rival",
  async () => {
    const row =
      makeEvidence({
        won: false,
      });

    const client =
      makeClient([
        {
          rows: [
            {
              id: 100,
              competition_id:
                COMPETITION_ID,
            },
          ],
        },
        {
          rows: [
            row,
          ],
        },
      ]);

    const created =
      await createPlacementEvidence(
        client,
        {
          matchId: 100,
          userId: 10,
          competitionId:
            COMPETITION_ID,
          opponentId: 20,
          placementMatchNumber: 1,
          won: false,
        },
      );

    assert.equal(
      created.won,
      false,
    );

    assert.equal(
      created.opponent_percentile_at_match,
      null,
    );
  },
);


test(
  "createPlacementEvidence exige referencia porcentual cuando gana",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 20,
            placementMatchNumber: 1,
            won: true,
          },
        ),
      assertReason(
        "victory_reference_missing",
      ),
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "createPlacementEvidence rechaza jugador contra sí mismo",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 10,
            placementMatchNumber: 1,
            won: false,
          },
        ),
      assertReason(
        "same_player",
      ),
    );
  },
);


test(
  "createPlacementEvidence rechaza número de nivelatorio fuera de rango",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 20,
            placementMatchNumber: 6,
            won: false,
          },
        ),
      assertReason(
        "invalid_placement_match_number",
      ),
    );
  },
);


test(
  "createPlacementEvidence rechaza partido inexistente",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
          rowCount: 0,
        },
      ]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 20,
            placementMatchNumber: 1,
            won: false,
          },
        ),
      assertReason(
        "match_not_found",
      ),
    );
  },
);


test(
  "createPlacementEvidence rechaza partido de otra competición",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              id: 100,
              competition_id:
                OTHER_COMPETITION_ID,
            },
          ],
        },
      ]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 20,
            placementMatchNumber: 1,
            won: false,
          },
        ),
      assertReason(
        "match_competition_mismatch",
      ),
    );
  },
);


test(
  "createPlacementEvidence recupera evidencia existente ante conflicto",
  async () => {
    const existing =
      makeEvidence({
        id: 99,
        won: false,
      });

    const client =
      makeClient([
        {
          rows: [
            {
              id: 100,
              competition_id:
                COMPETITION_ID,
            },
          ],
        },
        {
          rows: [],
          rowCount: 0,
        },
        {
          rows: [
            existing,
          ],
        },
      ]);

    const result =
      await createPlacementEvidence(
        client,
        {
          matchId: 100,
          userId: 10,
          competitionId:
            COMPETITION_ID,
          opponentId: 20,
          placementMatchNumber: 1,
          won: false,
        },
      );

    assert.equal(
      result.id,
      99,
    );

    assert.deepEqual(
      client.calls[2].params,
      [
        100,
        10,
        COMPETITION_ID,
      ],
    );
  },
);


test(
  "conflicto sin fila recuperable falla",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              id: 100,
              competition_id:
                COMPETITION_ID,
            },
          ],
        },
        {
          rows: [],
          rowCount: 0,
        },
        {
          rows: [],
          rowCount: 0,
        },
      ]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId: 100,
            userId: 10,
            competitionId:
              COMPETITION_ID,
            opponentId: 20,
            placementMatchNumber: 1,
            won: false,
          },
        ),
      assertReason(
        "placement_evidence_write_failed",
      ),
    );
  },
);


test(
  "getPlacementEvidenceByMatch filtra partido usuario y competición",
  async () => {
    const row =
      makeEvidence();

    const client =
      makeClient([
        {
          rows: [
            row,
          ],
        },
      ]);

    const result =
      await getPlacementEvidenceByMatch(
        client,
        {
          matchId: 100,
          userId: 10,
          competitionId:
            COMPETITION_ID,
        },
      );

    assert.equal(
      result.id,
      1,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        100,
        10,
        COMPETITION_ID,
      ],
    );
  },
);


test(
  "getPlacementEvidenceByMatch devuelve null cuando no existe",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
        },
      ]);

    const result =
      await getPlacementEvidenceByMatch(
        client,
        {
          matchId: 100,
          userId: 10,
          competitionId:
            COMPETITION_ID,
        },
      );

    assert.equal(
      result,
      null,
    );
  },
);


test(
  "getPlayerPlacementEvidence consulta usuario y competición",
  async () => {
    const rows = [
      makeEvidence({
        id: 1,
        number: 1,
      }),
      makeEvidence({
        id: 2,
        matchId: 101,
        opponentId: 21,
        number: 2,
      }),
    ];

    const client =
      makeClient([
        {
          rows,
        },
      ]);

    const result =
      await getPlayerPlacementEvidence(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      result.length,
      2,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        10,
        COMPETITION_ID,
      ],
    );

    assert.equal(
      result[0].competition_id,
      COMPETITION_ID,
    );

    assert.equal(
      result[1].competition_id,
      COMPETITION_ID,
    );
  },
);


test(
  "getPlayerPlacementCalculationEvidence expone solo datos del motor",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              won: true,
              percentile: 75,
              referenceType:
                "official",
            }),
          ],
        },
      ]);

    const result =
      await getPlayerPlacementCalculationEvidence(
        client,
        10,
        COMPETITION_ID,
      );

    assert.deepEqual(
      result,
      [
        {
          match_id: 100,
          competition_id:
            COMPETITION_ID,
          opponent_id: 20,
          won: true,
          opponent_percentile_at_match:
            75,
          opponent_reference_type:
            "official",
        },
      ],
    );
  },
);


test(
  "getPlayerPlacementCalculationEvidence normaliza referencia faltante como other",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              won: false,
              referenceType:
                null,
            }),
          ],
        },
      ]);

    const result =
      await getPlayerPlacementCalculationEvidence(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      result[0]
        .opponent_reference_type,
      "other",
    );
  },
);


test(
  "getPlayerPlacementProgress calcula 3/5 dentro de una competición",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              id: 1,
              matchId: 100,
              number: 1,
              won: true,
              percentile: 50,
            }),
            makeEvidence({
              id: 2,
              matchId: 101,
              number: 2,
              won: false,
            }),
            makeEvidence({
              id: 3,
              matchId: 102,
              number: 3,
              won: true,
              percentile: 70,
            }),
          ],
        },
      ]);

    const progress =
      await getPlayerPlacementProgress(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      progress.user_id,
      10,
    );

    assert.equal(
      progress.competition_id,
      COMPETITION_ID,
    );

    assert.equal(
      progress.played,
      3,
    );

    assert.equal(
      progress.wins,
      2,
    );

    assert.equal(
      progress.losses,
      1,
    );

    assert.equal(
      progress.remaining,
      2,
    );

    assert.equal(
      progress.completed,
      false,
    );
  },
);


test(
  "getPlayerPlacementProgress marca 5/5 completado solamente en su competición",
  async () => {
    const rows =
      Array.from(
        {
          length: 5,
        },
        (
          _,
          index,
        ) =>
          makeEvidence({
            id:
              index + 1,
            matchId:
              100 + index,
            opponentId:
              20 + index,
            number:
              index + 1,
            won:
              index < 2,
            percentile:
              index < 2
                ? 60 + index * 10
                : null,
          }),
      );

    const client =
      makeClient([
        {
          rows,
        },
      ]);

    const progress =
      await getPlayerPlacementProgress(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      progress.played,
      5,
    );

    assert.equal(
      progress.remaining,
      0,
    );

    assert.equal(
      progress.completed,
      true,
    );

    assert.equal(
      progress.wins,
      2,
    );

    assert.equal(
      progress.losses,
      3,
    );
  },
);


test(
  "validatePlacementEvidenceSequence acepta secuencia 1 a 5",
  () => {
    const evidence =
      Array.from(
        {
          length: 5,
        },
        (
          _,
          index,
        ) =>
          makeEvidence({
            id:
              index + 1,
            matchId:
              100 + index,
            opponentId:
              20 + index,
            number:
              index + 1,
          }),
      );

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        COMPETITION_ID,
      ),
      true,
    );
  },
);


test(
  "validatePlacementEvidenceSequence acepta secuencia parcial consecutiva",
  () => {
    const evidence = [
      makeEvidence({
        number: 1,
      }),
      makeEvidence({
        id: 2,
        matchId: 101,
        number: 2,
      }),
      makeEvidence({
        id: 3,
        matchId: 102,
        number: 3,
      }),
    ];

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        COMPETITION_ID,
      ),
      true,
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza huecos",
  () => {
    const evidence = [
      makeEvidence({
        number: 1,
      }),
      makeEvidence({
        id: 2,
        matchId: 102,
        number: 3,
      }),
    ];

    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          evidence,
          COMPETITION_ID,
        ),
      assertReason(
        "placement_sequence_gap",
      ),
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza números duplicados",
  () => {
    const evidence = [
      makeEvidence({
        id: 1,
        matchId: 100,
        number: 1,
      }),
      makeEvidence({
        id: 2,
        matchId: 101,
        number: 1,
      }),
    ];

    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          evidence,
          COMPETITION_ID,
        ),
      assertReason(
        "duplicate_placement_match_number",
      ),
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza evidencia de otra competición",
  () => {
    const evidence = [
      makeEvidence({
        competitionId:
          OTHER_COMPETITION_ID,
      }),
    ];

    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          evidence,
          COMPETITION_ID,
        ),
      assertReason(
        "placement_competition_mismatch",
      ),
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza más de cinco nivelatorios",
  () => {
    const evidence =
      Array.from(
        {
          length: 6,
        },
        (
          _,
          index,
        ) =>
          makeEvidence({
            id:
              index + 1,
            matchId:
              100 + index,
            opponentId:
              20 + index,
            number:
              index + 1,
          }),
      );

    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          evidence,
          COMPETITION_ID,
        ),
      assertReason(
        "too_many_placement_matches",
      ),
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza colección inválida",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          null,
          COMPETITION_ID,
        ),
      assertReason(
        "invalid_evidence_collection",
      ),
    );
  },
);


test(
  "las evidencias de singles y dobles quedan aisladas por competition_id",
  async () => {
    const singlesClient =
      makeClient([
        {
          rows: [
            makeEvidence({
              competitionId: 1,
              number: 1,
            }),
            makeEvidence({
              id: 2,
              matchId: 101,
              competitionId: 1,
              number: 2,
            }),
          ],
        },
      ]);

    const doublesClient =
      makeClient([
        {
          rows: [
            makeEvidence({
              id: 3,
              matchId: 200,
              competitionId: 2,
              number: 1,
            }),
          ],
        },
      ]);

    const singles =
      await getPlayerPlacementProgress(
        singlesClient,
        10,
        1,
      );

    const doubles =
      await getPlayerPlacementProgress(
        doublesClient,
        10,
        2,
      );

    assert.equal(
      singles.played,
      2,
    );

    assert.equal(
      doubles.played,
      1,
    );

    assert.equal(
      singles.competition_id,
      1,
    );

    assert.equal(
      doubles.competition_id,
      2,
    );
  },
);