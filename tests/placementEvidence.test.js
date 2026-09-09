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


/*
  ============================================================
  LA RED
  TESTS DE EVIDENCIA DE NIVELATORIOS
  ============================================================

  Esta suite NO toca Neon.

  Usa clientes PostgreSQL simulados para verificar:

  - conteo de evidencias;
  - siguiente nivelatorio;
  - máximo de 5;
  - referencia congelada obligatoria en victorias;
  - normalización de filas;
  - prevención de duplicados;
  - fallback cuando ON CONFLICT no inserta;
  - progreso 0/5 ... 5/5;
  - secuencia estricta 1,2,3,4,5;
  - ausencia de huecos y duplicados.
  ============================================================
*/


/*
  ============================================================
  HELPERS
  ============================================================
*/

const createQueuedClient = (
  responses = [],
) => {
  const queue =
    [...responses];

  const calls =
    [];

  return {
    calls,

    async query(
      sql,
      params = [],
    ) {
      calls.push({
        sql:
          String(sql),
        params,
      });

      if (
        queue.length === 0
      ) {
        throw new Error(
          "Mock PostgreSQL sin respuesta configurada.",
        );
      }

      const next =
        queue.shift();

      if (
        next instanceof Error
      ) {
        throw next;
      }

      if (
        typeof next ===
        "function"
      ) {
        return next({
          sql:
            String(sql),
          params,
          calls,
        });
      }

      return next;
    },
  };
};


const evidenceRow = ({
  id = 1,
  matchId = 100,
  userId = 10,
  opponentId = 20,
  placementMatchNumber = 1,
  won = true,
  percentile = 50,
  referenceType = "official",
  opponentRankPosition = 5,
  officialPlayerCount = 20,
} = {}) => ({
  id:
    String(id),

  match_id:
    String(matchId),

  user_id:
    String(userId),

  opponent_id:
    String(opponentId),

  placement_match_number:
    String(
      placementMatchNumber,
    ),

  won,

  opponent_percentile_at_match:
    percentile === null
      ? null
      : String(
          percentile,
        ),

  opponent_reference_type:
    referenceType,

  opponent_rank_position_at_match:
    opponentRankPosition ===
      null
      ? null
      : String(
          opponentRankPosition,
        ),

  official_player_count_at_match:
    officialPlayerCount ===
      null
      ? null
      : String(
          officialPlayerCount,
        ),

  created_at:
    "2026-09-08T12:00:00.000Z",
});


const sequenceRow = (
  number,
) => ({
  placement_match_number:
    number,
});


/*
  ============================================================
  CLIENTE
  ============================================================
*/

test(
  "rechaza cliente PostgreSQL inexistente",
  async () => {
    await assert.rejects(
      () =>
        countPlayerPlacementEvidence(
          null,
          1,
        ),
      (error) => {
        assert.ok(
          error instanceof
            PlacementEvidenceError,
        );

        assert.equal(
          error.reason,
          "database_client_missing",
        );

        return true;
      },
    );
  },
);


/*
  ============================================================
  CONTEO
  ============================================================
*/

test(
  "countPlayerPlacementEvidence devuelve cantidad numérica",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            {
              total:
                "3",
            },
          ],
        },
      ]);

    const result =
      await countPlayerPlacementEvidence(
        client,
        10,
      );

    assert.equal(
      result,
      3,
    );

    assert.equal(
      client.calls.length,
      1,
    );

    assert.deepEqual(
      client.calls[0].params,
      [10],
    );

    assert.match(
      client.calls[0].sql,
      /placement_match_evidence/i,
    );
  },
);


test(
  "countPlayerPlacementEvidence devuelve 0 si no hay total",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 0,
          rows: [],
        },
      ]);

    const result =
      await countPlayerPlacementEvidence(
        client,
        10,
      );

    assert.equal(
      result,
      0,
    );
  },
);


/*
  ============================================================
  SIGUIENTE NIVELATORIO
  ============================================================
*/

test(
  "getNextPlacementMatchNumber devuelve 1 cuando no hay evidencias",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            {
              total:
                0,
            },
          ],
        },
      ]);

    const result =
      await getNextPlacementMatchNumber(
        client,
        10,
      );

    assert.equal(
      result,
      1,
    );
  },
);


test(
  "getNextPlacementMatchNumber devuelve 5 cuando hay cuatro evidencias",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            {
              total:
                4,
            },
          ],
        },
      ]);

    const result =
      await getNextPlacementMatchNumber(
        client,
        10,
      );

    assert.equal(
      result,
      5,
    );
  },
);


test(
  "getNextPlacementMatchNumber devuelve null después de cinco",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            {
              total:
                5,
            },
          ],
        },
      ]);

    const result =
      await getNextPlacementMatchNumber(
        client,
        10,
      );

    assert.equal(
      result,
      null,
    );
  },
);


/*
  ============================================================
  CREACIÓN
  ============================================================
*/

test(
  "createPlacementEvidence guarda una victoria oficial congelada",
  async () => {
    const row =
      evidenceRow({
        id: 77,
        matchId: 100,
        userId: 10,
        opponentId: 20,
        placementMatchNumber:
          2,
        won: true,
        percentile:
          63.25,
        referenceType:
          "official",
        opponentRankPosition:
          8,
        officialPlayerCount:
          30,
      });

    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            row,
          ],
        },
      ]);

    const result =
      await createPlacementEvidence(
        client,
        {
          matchId:
            100,

          userId:
            10,

          opponentId:
            20,

          placementMatchNumber:
            2,

          won:
            true,

          opponentPercentileAtMatch:
            63.25,

          opponentReferenceType:
            "official",

          opponentRankPositionAtMatch:
            8,

          officialPlayerCountAtMatch:
            30,
        },
      );

    assert.equal(
      result.id,
      77,
    );

    assert.equal(
      result.match_id,
      100,
    );

    assert.equal(
      result.user_id,
      10,
    );

    assert.equal(
      result.opponent_id,
      20,
    );

    assert.equal(
      result.placement_match_number,
      2,
    );

    assert.equal(
      result.won,
      true,
    );

    assert.equal(
      result
        .opponent_percentile_at_match,
      63.25,
    );

    assert.equal(
      result
        .opponent_rank_position_at_match,
      8,
    );

    assert.equal(
      result
        .official_player_count_at_match,
      30,
    );

    assert.equal(
      client.calls.length,
      1,
    );

    assert.match(
      client.calls[0].sql,
      /ON\s+CONFLICT/i,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        100,
        10,
        20,
        2,
        true,
        63.25,
        "official",
        8,
        30,
      ],
    );
  },
);


test(
  "createPlacementEvidence acepta derrota sin percentil congelado",
  async () => {
    const row =
      evidenceRow({
        won:
          false,
        percentile:
          null,
        referenceType:
          null,
        opponentRankPosition:
          null,
        officialPlayerCount:
          null,
      });

    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            row,
          ],
        },
      ]);

    const result =
      await createPlacementEvidence(
        client,
        {
          matchId:
            100,

          userId:
            10,

          opponentId:
            20,

          placementMatchNumber:
            1,

          won:
            false,
        },
      );

    assert.equal(
      result.won,
      false,
    );

    assert.equal(
      result
        .opponent_percentile_at_match,
      null,
    );
  },
);


test(
  "createPlacementEvidence rechaza victoria sin referencia congelada",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              1,

            won:
              true,

            opponentPercentileAtMatch:
              null,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "victory_reference_missing",
        );

        return true;
      },
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
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              10,

            placementMatchNumber:
              1,

            won:
              true,

            opponentPercentileAtMatch:
              50,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "same_player",
        );

        return true;
      },
    );
  },
);


test(
  "createPlacementEvidence rechaza nivelatorio 0",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              0,

            won:
              true,

            opponentPercentileAtMatch:
              50,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_placement_match_number",
        );

        return true;
      },
    );
  },
);


test(
  "createPlacementEvidence rechaza sexto nivelatorio",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              6,

            won:
              true,

            opponentPercentileAtMatch:
              50,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_placement_match_number",
        );

        return true;
      },
    );
  },
);


test(
  "createPlacementEvidence rechaza won no boolean",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              1,

            won:
              1,

            opponentPercentileAtMatch:
              50,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_result",
        );

        return true;
      },
    );
  },
);


test(
  "createPlacementEvidence rechaza percentil mayor a 100",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              1,

            won:
              true,

            opponentPercentileAtMatch:
              101,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_percentile",
        );

        return true;
      },
    );
  },
);


test(
  "createPlacementEvidence admite referencia provisional sin descuento",
  async () => {
    const row =
      evidenceRow({
        referenceType:
          "provisional",
        percentile:
          68,
      });

    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            row,
          ],
        },
      ]);

    const result =
      await createPlacementEvidence(
        client,
        {
          matchId:
            100,

          userId:
            10,

          opponentId:
            20,

          placementMatchNumber:
            1,

          won:
            true,

          opponentPercentileAtMatch:
            68,

          opponentReferenceType:
            "provisional",
        },
      );

    assert.equal(
      result
        .opponent_percentile_at_match,
      68,
    );

    assert.equal(
      result
        .opponent_reference_type,
      "provisional",
    );

    assert.equal(
      client.calls[0]
        .params[5],
      68,
    );
  },
);


/*
  ============================================================
  DUPLICADO / IDEMPOTENCIA
  ============================================================
*/

test(
  "si ON CONFLICT no inserta recupera la evidencia existente",
  async () => {
    const existing =
      evidenceRow({
        id:
          999,
        matchId:
          100,
        userId:
          10,
        opponentId:
          20,
        placementMatchNumber:
          3,
        won:
          true,
        percentile:
          72,
        referenceType:
          "official",
      });

    const client =
      createQueuedClient([
        /*
          INSERT:
          conflicto, no inserta.
        */
        {
          rowCount: 0,
          rows: [],
        },

        /*
          SELECT fallback.
        */
        {
          rowCount: 1,
          rows: [
            existing,
          ],
        },
      ]);

    const result =
      await createPlacementEvidence(
        client,
        {
          matchId:
            100,

          userId:
            10,

          opponentId:
            20,

          placementMatchNumber:
            3,

          won:
            true,

          opponentPercentileAtMatch:
            72,

          opponentReferenceType:
            "official",
        },
      );

    assert.equal(
      result.id,
      999,
    );

    assert.equal(
      result
        .placement_match_number,
      3,
    );

    assert.equal(
      client.calls.length,
      2,
    );

    assert.match(
      client.calls[1].sql,
      /WHERE\s+match_id\s*=\s*\$1/i,
    );
  },
);


test(
  "conflicto sin fila recuperable falla",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 0,
          rows: [],
        },

        {
          rowCount: 0,
          rows: [],
        },
      ]);

    await assert.rejects(
      () =>
        createPlacementEvidence(
          client,
          {
            matchId:
              100,

            userId:
              10,

            opponentId:
              20,

            placementMatchNumber:
              1,

            won:
              true,

            opponentPercentileAtMatch:
              50,

            opponentReferenceType:
              "official",
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_evidence_write_failed",
        );

        return true;
      },
    );
  },
);


/*
  ============================================================
  GET BY MATCH
  ============================================================
*/

test(
  "getPlacementEvidenceByMatch normaliza campos numéricos",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 1,
          rows: [
            evidenceRow({
              id:
                55,
              matchId:
                200,
              userId:
                30,
              opponentId:
                40,
              placementMatchNumber:
                4,
              percentile:
                81.5,
            }),
          ],
        },
      ]);

    const result =
      await getPlacementEvidenceByMatch(
        client,
        {
          matchId:
            200,

          userId:
            30,
        },
      );

    assert.equal(
      result.id,
      55,
    );

    assert.equal(
      typeof result.id,
      "number",
    );

    assert.equal(
      result.match_id,
      200,
    );

    assert.equal(
      result.user_id,
      30,
    );

    assert.equal(
      result.opponent_id,
      40,
    );

    assert.equal(
      result
        .placement_match_number,
      4,
    );

    assert.equal(
      result
        .opponent_percentile_at_match,
      81.5,
    );
  },
);


test(
  "getPlacementEvidenceByMatch devuelve null si no existe",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 0,
          rows: [],
        },
      ]);

    const result =
      await getPlacementEvidenceByMatch(
        client,
        {
          matchId:
            200,

          userId:
            30,
        },
      );

    assert.equal(
      result,
      null,
    );
  },
);


/*
  ============================================================
  HISTORIAL DEL JUGADOR
  ============================================================
*/

test(
  "getPlayerPlacementEvidence devuelve evidencias normalizadas",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 2,
          rows: [
            evidenceRow({
              id:
                1,
              placementMatchNumber:
                1,
            }),

            evidenceRow({
              id:
                2,
              matchId:
                101,
              placementMatchNumber:
                2,
              won:
                false,
              percentile:
                null,
            }),
          ],
        },
      ]);

    const result =
      await getPlayerPlacementEvidence(
        client,
        10,
      );

    assert.equal(
      result.length,
      2,
    );

    assert.equal(
      result[0]
        .placement_match_number,
      1,
    );

    assert.equal(
      result[1]
        .placement_match_number,
      2,
    );

    assert.equal(
      result[1].won,
      false,
    );

    assert.match(
      client.calls[0].sql,
      /ORDER BY[\s\S]*placement_match_number\s+ASC/i,
    );
  },
);


test(
  "getPlayerPlacementCalculationEvidence expone solo datos usados por el motor",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 2,
          rows: [
            evidenceRow({
              id:
                1,
              matchId:
                100,
              userId:
                10,
              opponentId:
                20,
              placementMatchNumber:
                1,
              won:
                true,
              percentile:
                68,
              referenceType:
                "provisional",
            }),

            evidenceRow({
              id:
                2,
              matchId:
                101,
              userId:
                10,
              opponentId:
                30,
              placementMatchNumber:
                2,
              won:
                false,
              percentile:
                90,
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
      );

    assert.deepEqual(
      result,
      [
        {
          match_id:
            100,

          opponent_id:
            20,

          won:
            true,

          opponent_percentile_at_match:
            68,

          opponent_reference_type:
            "provisional",
        },

        {
          match_id:
            101,

          opponent_id:
            30,

          won:
            false,

          opponent_percentile_at_match:
            90,

          opponent_reference_type:
            "official",
        },
      ],
    );
  },
);


/*
  ============================================================
  PROGRESO
  ============================================================
*/

test(
  "getPlayerPlacementProgress calcula 3/5 correctamente",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount: 3,
          rows: [
            evidenceRow({
              id:
                1,
              placementMatchNumber:
                1,
              won:
                true,
            }),

            evidenceRow({
              id:
                2,
              matchId:
                101,
              placementMatchNumber:
                2,
              won:
                false,
              percentile:
                null,
            }),

            evidenceRow({
              id:
                3,
              matchId:
                102,
              placementMatchNumber:
                3,
              won:
                true,
            }),
          ],
        },
      ]);

    const result =
      await getPlayerPlacementProgress(
        client,
        10,
      );

    assert.equal(
      result.user_id,
      10,
    );

    assert.equal(
      result.played,
      3,
    );

    assert.equal(
      result.wins,
      2,
    );

    assert.equal(
      result.losses,
      1,
    );

    assert.equal(
      result.remaining,
      2,
    );

    assert.equal(
      result.completed,
      false,
    );
  },
);


test(
  "getPlayerPlacementProgress marca 5/5 completado",
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
          evidenceRow({
            id:
              index + 1,

            matchId:
              100 +
              index,

            placementMatchNumber:
              index + 1,

            won:
              index < 3,
          }),
      );

    const client =
      createQueuedClient([
        {
          rowCount: 5,
          rows,
        },
      ]);

    const result =
      await getPlayerPlacementProgress(
        client,
        10,
      );

    assert.equal(
      result.played,
      5,
    );

    assert.equal(
      result.remaining,
      0,
    );

    assert.equal(
      result.completed,
      true,
    );

    assert.equal(
      result.wins,
      3,
    );

    assert.equal(
      result.losses,
      2,
    );
  },
);


/*
  ============================================================
  VALIDACIÓN DE SECUENCIA
  ============================================================
*/

test(
  "validatePlacementEvidenceSequence acepta array vacío",
  () => {
    assert.equal(
      validatePlacementEvidenceSequence(
        [],
      ),
      true,
    );
  },
);


test(
  "validatePlacementEvidenceSequence acepta 1,2,3,4,5",
  () => {
    assert.equal(
      validatePlacementEvidenceSequence(
        [
          sequenceRow(1),
          sequenceRow(2),
          sequenceRow(3),
          sequenceRow(4),
          sequenceRow(5),
        ],
      ),
      true,
    );
  },
);


test(
  "validatePlacementEvidenceSequence acepta secuencia parcial 1,2,3",
  () => {
    assert.equal(
      validatePlacementEvidenceSequence(
        [
          sequenceRow(1),
          sequenceRow(2),
          sequenceRow(3),
        ],
      ),
      true,
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza duplicados",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            sequenceRow(1),
            sequenceRow(2),
            sequenceRow(2),
          ],
        ),
      (error) => {
        assert.equal(
          error.reason,
          "duplicate_placement_match_number",
        );

        return true;
      },
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza hueco 1,3",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            sequenceRow(1),
            sequenceRow(3),
          ],
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_sequence_gap",
        );

        return true;
      },
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza empezar en 2",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            sequenceRow(2),
          ],
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_sequence_gap",
        );

        return true;
      },
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza número 6",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            sequenceRow(1),
            sequenceRow(2),
            sequenceRow(3),
            sequenceRow(4),
            sequenceRow(6),
          ],
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_placement_match_number",
        );

        return true;
      },
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza más de cinco evidencias",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            sequenceRow(1),
            sequenceRow(2),
            sequenceRow(3),
            sequenceRow(4),
            sequenceRow(5),
            sequenceRow(5),
          ],
        ),
      (error) => {
        assert.equal(
          error.reason,
          "too_many_placement_matches",
        );

        return true;
      },
    );
  },
);


test(
  "validatePlacementEvidenceSequence rechaza dato que no es array",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          null,
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_evidence_collection",
        );

        return true;
      },
    );
  },
);